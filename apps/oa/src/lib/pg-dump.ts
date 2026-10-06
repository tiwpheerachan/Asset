import "server-only";
import fs from "node:fs";
import { db } from "./pg";

/**
 * เขียนข้อมูลทั้งฐานออกเป็นไฟล์ SQL ที่นำกลับเข้าไปได้
 *
 * ทำไมไม่เรียก pg_dump: ต้องมีโปรแกรม pg_dump ติดตั้งในคอนเทนเนอร์ ซึ่งอิมเมจของแอป
 * ไม่มี และการเพิ่มเข้าไปก็ผูกรุ่นของ pg_dump กับรุ่นของเซิร์ฟเวอร์ปลายทางอีก —
 * ข้อมูลระดับนี้ (หลักร้อยกิโลไบต์) เขียนเองได้เร็วกว่าและไม่ต้องพึ่งอะไรเพิ่ม
 *
 * ไฟล์ที่ได้กู้คืนด้วย psql ได้ตรง ๆ และอ่านออกด้วยตาเปล่าเวลาต้องตรวจสอบ
 */

/**
 * ลำดับตารางตามความผูกพัน — ตารางที่ถูกอ้างถึงต้องมีข้อมูลก่อน
 * ไม่งั้น foreign key จะปฏิเสธตอนกู้คืน
 */
const TABLES = [
  "departments",
  "users",
  "form_categories",
  "form_templates",
  "form_fields",
  "form_table_columns",
  "flow_nodes",
  "flow_node_members",
  "requests",
  "request_approvers",
  "request_comments",
  "attachments",
  "audit_log",
  "notifications",
  "delegations",
  "issued_documents",
  "sessions",
  "login_attempts",
  "api_keys",
  "webhook_deliveries",
  "backups",
  "app_meta",
] as const;

/** ตารางที่ไม่มีคอลัมน์ id จึงไม่มีลำดับเลขให้ตั้งค่าต่อ */
const NO_IDENTITY = new Set(["app_meta", "sessions"]);

/** บรรทัดปิดท้าย — ใช้ยืนยันว่าไฟล์เขียนจบจริง ไม่ได้ขาดกลางทาง */
export const DUMP_END = "-- จบสมบูรณ์";

function quote(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // standard_conforming_strings เปิดอยู่ (ตั้งไว้ในหัวไฟล์) — backslash จึงเป็นตัวอักษรธรรมดา
  // เหลือแค่ต้องเบิ้ล single quote ตามไวยากรณ์ SQL
  return `'${String(v).replace(/'/g, "''")}'`;
}

const ident = (s: string) => `"${s}"`;

async function columnsOf(table: string): Promise<string[]> {
  const rows = await db
    .prepare(
      // current_schema() ไม่ใช่ 'public' ตายตัว — ถ้าฐานข้อมูลใช้ schema อื่น (เช่นตอน
      // รันเทสต์ที่แยก schema ให้แต่ละกระบวนการ) การเจาะจง public จะหาคอลัมน์ไม่เจอ
      // แล้วเขียนไฟล์สำรอง "เปล่า" ออกมาโดยไม่มี error ให้เห็น ซึ่งอันตรายกว่าสำรองไม่สำเร็จ
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ?
        ORDER BY ordinal_position`,
    )
    .all<{ column_name: string }>(table);
  return rows.map((r) => r.column_name);
}

export type DumpResult = { requests: number; rows: number };

/**
 * เขียนไฟล์สำรอง
 *
 * users.manager_id ชี้กลับมาที่ users เอง — ถ้าหัวหน้ามี id มากกว่าลูกน้อง
 * การใส่ข้อมูลตามลำดับ id จะติด foreign key จึงใส่เป็น NULL ไว้ก่อน
 * แล้วค่อยผูกกลับด้วย UPDATE ตอนท้าย วิธีนี้ถูกต้องเสมอไม่ว่าสายบังคับบัญชาจะซับซ้อนแค่ไหน
 */
export async function dumpDatabase(target: string): Promise<DumpResult> {
  const out: string[] = [];
  const managers: string[] = [];
  let rowCount = 0;
  let requestCount = 0;

  out.push(
    "-- สำเนาข้อมูล internal-approve",
    `-- สร้างเมื่อ ${new Date().toISOString()}`,
    "--",
    "-- วิธีกู้คืน: สร้างฐานข้อมูลเปล่า ให้แอปสร้างตารางให้ครบก่อน (เปิดแอปหนึ่งครั้ง)",
    "--            แล้วสั่ง  psql <DATABASE_URL> -f ไฟล์นี้",
    "",
    "SET standard_conforming_strings = on;",
    "SET client_encoding = 'UTF8';",
    "",
    "BEGIN;",
    "",
  );

  // ล้างของเดิมจากท้ายสายความผูกพันขึ้นมา เพื่อให้กู้คืนทับฐานที่มีข้อมูลอยู่ได้
  out.push("-- ล้างข้อมูลเดิมก่อน (ย้อนลำดับความผูกพัน)");
  for (const t of [...TABLES].reverse()) out.push(`DELETE FROM ${ident(t)};`);
  out.push("");

  for (const table of TABLES) {
    const cols = await columnsOf(table);
    if (cols.length === 0) continue;

    const order = NO_IDENTITY.has(table) ? "" : " ORDER BY id";
    const rows = await db.prepare(`SELECT * FROM ${ident(table)}${order}`).all();
    if (rows.length === 0) continue;

    if (table === "requests") requestCount = rows.length;
    rowCount += rows.length;

    out.push(`-- ${table} (${rows.length} แถว)`);
    const colList = cols.map(ident).join(", ");
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const values = cols.map((c) => {
        if (table === "users" && c === "manager_id" && r[c] !== null) {
          managers.push(`UPDATE "users" SET "manager_id" = ${quote(r[c])} WHERE "id" = ${quote(r.id)};`);
          return "NULL";
        }
        return quote(r[c]);
      });
      out.push(`INSERT INTO ${ident(table)} (${colList}) VALUES (${values.join(", ")});`);
    }
    out.push("");
  }

  if (managers.length > 0) {
    out.push("-- ผูกสายบังคับบัญชากลับ (แยกออกมาเพราะ users อ้างถึงตัวเอง)", ...managers, "");
  }

  // ลำดับเลข id ต้องเดินต่อจากของเดิม ไม่งั้นแถวใหม่จะชน id ที่มีอยู่
  out.push("-- ตั้งลำดับเลข id ให้เดินต่อจากข้อมูลที่กู้คืนมา");
  for (const t of TABLES) {
    if (NO_IDENTITY.has(t)) continue;
    out.push(
      `SELECT setval(pg_get_serial_sequence('${t}', 'id'), ` +
        `GREATEST(COALESCE((SELECT MAX("id") FROM ${ident(t)}), 0), 1));`,
    );
  }

  out.push("", "COMMIT;", "", `${DUMP_END} · ${requestCount} คำขอ · ${rowCount} แถวรวม`, "");

  fs.writeFileSync(target, out.join("\n"), "utf8");
  return { requests: requestCount, rows: rowCount };
}
