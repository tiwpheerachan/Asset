#!/usr/bin/env node
/**
 * ย้ายข้อมูลจาก SQLite (app.db) ไป PostgreSQL — ทำครั้งเดียวตอนย้ายฐานข้อมูล
 *
 * วิธีใช้:
 *   npm run migrate-to-pg -- ./data/app.db
 *
 * อ่าน DATABASE_URL จาก .env.local ให้เอง (หรือส่งมาทาง env ก็ได้)
 *
 * ตัวเลือก:
 *   --dry-run   นับข้อมูลและตรวจความพร้อมให้ดู แต่ไม่เขียนอะไรลงปลายทาง
 *   --force     เขียนทับแม้ปลายทางมีข้อมูลอยู่แล้ว (ล้างของเดิมก่อน)
 *
 * สิ่งที่สคริปต์นี้รับประกัน:
 *   · id เดิมถูกรักษาไว้ทุกแถว — ลิงก์เอกสารที่คนเคยส่งกันไว้ยังใช้ได้
 *   · ทำในรายการเดียว (transaction) ถ้าพลาดกลางทางปลายทางกลับไปเหมือนเดิม
 *   · ตรวจนับทุกตารางหลังย้ายเสร็จ ไม่ตรงแม้แถวเดียวถือว่าล้มเหลว
 *
 * สิ่งที่ต้องทำ "ก่อน" รันสคริปต์นี้:
 *   เปิดแอปที่ชี้ไป DATABASE_URL ใหม่หนึ่งครั้ง เพื่อให้ตารางถูกสร้างครบ
 *   (หรือสั่ง psql "$DATABASE_URL" -f src/lib/schema.pg.sql)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import pg from "pg";
import { loadEnvLocal } from "./pg-lite.mjs";

/* ---------- ลำดับตารางตามความผูกพัน ---------- */
const TABLES = [
  "departments", "users", "form_categories", "form_templates", "form_fields",
  "form_table_columns", "flow_nodes", "flow_node_members", "requests",
  "request_approvers", "request_comments", "attachments", "audit_log",
  "notifications", "delegations", "issued_documents", "sessions",
  "login_attempts", "api_keys", "webhook_deliveries", "backups", "app_meta",
];
const NO_IDENTITY = new Set(["app_meta", "sessions"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const dbPath = args.find((a) => !a.startsWith("--")) ?? path.join("data", "app.db");

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ไม่ได้ตั้ง DATABASE_URL — ไม่รู้ว่าจะย้ายไปที่ไหน");
  process.exit(1);
}
if (!fs.existsSync(dbPath)) {
  console.error(`ไม่พบไฟล์ ${dbPath}`);
  process.exit(1);
}

const say = (...a) => console.log(...a);

const sqlite = new Database(dbPath, { readonly: true });
const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  max: 1,
});

/** คอลัมน์ที่มีอยู่จริงทั้งสองฝั่ง — ย้ายเฉพาะที่ตรงกัน */
async function commonColumns(client, table) {
  const pgCols = (
    await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1
        ORDER BY ordinal_position`,
      [table],
    )
  ).rows.map((r) => r.column_name);

  let liteCols = [];
  try {
    liteCols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch {
    return { cols: [], missingInSqlite: pgCols, extraInSqlite: [] };
  }

  const cols = pgCols.filter((c) => liteCols.includes(c));
  return {
    cols,
    missingInSqlite: pgCols.filter((c) => !liteCols.includes(c)),
    extraInSqlite: liteCols.filter((c) => !pgCols.includes(c)),
  };
}

const sqliteCount = (t) => {
  try {
    return sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  } catch {
    return -1; // ไม่มีตารางนี้ใน SQLite
  }
};

async function main() {
  const client = await pool.connect();
  try {
    /* ---------- ตรวจความพร้อมก่อน ---------- */
    const missingTables = [];
    for (const t of TABLES) {
      const hit = await client.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = $1`,
        [t],
      );
      if (hit.rowCount === 0) missingTables.push(t);
    }
    if (missingTables.length > 0) {
      console.error("ปลายทางยังไม่มีตาราง: " + missingTables.join(", "));
      console.error("เปิดแอปที่ชี้ไปฐานข้อมูลนี้หนึ่งครั้งก่อน เพื่อให้ตารางถูกสร้างให้");
      process.exit(1);
    }

    const existing = [];
    for (const t of TABLES) {
      const n = Number((await client.query(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0].n);
      if (n > 0) existing.push(`${t}=${n}`);
    }
    if (existing.length > 0 && !force && !dryRun) {
      console.error("ปลายทางมีข้อมูลอยู่แล้ว: " + existing.join(", "));
      console.error("ถ้าต้องการเขียนทับ (ล้างของเดิมก่อน) ใส่ --force");
      process.exit(1);
    }

    /* ---------- สำรวจ ---------- */
    say(`\nต้นทาง: ${dbPath}`);
    say(`ปลายทาง: ${url.replace(/:[^:@/]+@/, ":****@")}\n`);
    say("ตาราง".padEnd(22) + "แถว".padStart(8) + "   หมายเหตุ");
    say("─".repeat(70));

    const plan = [];
    for (const t of TABLES) {
      const n = sqliteCount(t);
      const { cols, missingInSqlite, extraInSqlite } = await commonColumns(client, t);
      const notes = [];
      if (n < 0) notes.push("ไม่มีในต้นทาง — ข้าม");
      if (missingInSqlite.length) notes.push(`ใช้ค่าเริ่มต้น: ${missingInSqlite.join(",")}`);
      if (extraInSqlite.length) notes.push(`ไม่ย้าย: ${extraInSqlite.join(",")}`);
      say(t.padEnd(22) + String(Math.max(n, 0)).padStart(8) + "   " + notes.join(" · "));
      if (n > 0 && cols.length) plan.push({ table: t, cols, rows: n });
    }

    const total = plan.reduce((s, p) => s + p.rows, 0);
    say("─".repeat(70));
    say(`รวม ${total} แถว จาก ${plan.length} ตาราง\n`);

    if (dryRun) {
      say("โหมด --dry-run: ไม่ได้เขียนอะไรลงปลายทาง");
      return;
    }

    /* ---------- ย้าย ---------- */
    await client.query("BEGIN");

    if (existing.length > 0) {
      say("ล้างข้อมูลเดิมของปลายทาง...");
      for (const t of [...TABLES].reverse()) await client.query(`DELETE FROM "${t}"`);
    }

    // users.manager_id ชี้กลับมาที่ users เอง — ใส่ทีหลังเพื่อไม่ให้ติด foreign key
    const managerLinks = [];

    for (const { table, cols } of plan) {
      const rows = sqlite
        .prepare(`SELECT * FROM ${table}${NO_IDENTITY.has(table) ? "" : " ORDER BY id"}`)
        .all();

      const colList = cols.map((c) => `"${c}"`).join(", ");
      const holders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const stmt = `INSERT INTO "${table}" (${colList}) VALUES (${holders})`;

      for (const row of rows) {
        const values = cols.map((c) => {
          if (table === "users" && c === "manager_id" && row[c] !== null) {
            managerLinks.push([row[c], row.id]);
            return null;
          }
          return row[c] === undefined ? null : row[c];
        });
        await client.query(stmt, values);
      }
      say(`  ${table}: ${rows.length} แถว`);
    }

    if (managerLinks.length > 0) {
      for (const [managerId, userId] of managerLinks) {
        await client.query(`UPDATE "users" SET "manager_id" = $1 WHERE "id" = $2`, [managerId, userId]);
      }
      say(`  ผูกสายบังคับบัญชา: ${managerLinks.length} คน`);
    }

    // ลำดับเลข id ต้องเดินต่อจากของที่ย้ายมา ไม่ใช่เริ่มจาก 1 แล้วชนกัน
    for (const t of TABLES) {
      if (NO_IDENTITY.has(t)) continue;
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
                GREATEST(COALESCE((SELECT MAX("id") FROM "${t}"), 0), 1))`,
        [t],
      );
    }

    /* ---------- ตรวจนับก่อนยืนยัน ---------- */
    const mismatch = [];
    for (const { table, rows } of plan) {
      const n = Number((await client.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
      if (n !== rows) mismatch.push(`${table}: ต้นทาง ${rows} ปลายทาง ${n}`);
    }
    if (mismatch.length > 0) {
      await client.query("ROLLBACK");
      console.error("\nจำนวนแถวไม่ตรง — ยกเลิกทั้งหมด ปลายทางไม่ถูกแก้:");
      for (const m of mismatch) console.error("  " + m);
      process.exit(1);
    }

    await client.query("COMMIT");
    say(`\n✓ ย้ายสำเร็จ ${total} แถว · จำนวนตรงกันทุกตาราง`);
    say("\nขั้นต่อไป: คัดลอกโฟลเดอร์ไฟล์แนบ (data/uploads) ไปที่เครื่องใหม่ด้วย");
    say("ไฟล์แนบไม่ได้อยู่ในฐานข้อมูล — ย้ายฐานข้อมูลอย่างเดียวไฟล์จะเปิดไม่ได้");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nล้มเหลว:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();
