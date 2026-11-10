import "server-only";
import { db } from "../db";
import { bitableConfig, listAllRecords, listTables, type BaseRecord } from "./bitable";
import { centralBaseReady, centralListAllRecords } from "./central-base";

/** เลือกช่องทางอ่าน Base: ระบบกลาง (ถ้าตั้งค่าไว้) ก่อน แล้วค่อย Feishu ตรง */
const fetchRecords = () => (centralBaseReady() ? centralListAllRecords : listAllRecords);

/**
 * ซิงก์ข้อมูลจาก Feishu Base เข้าสู่ OA — ทางเดียวเท่านั้น (Base -> OA)
 *
 * ย้ำหลักความปลอดภัย: โมดูลนี้ไม่มีคำสั่งเขียน/แก้/ลบ ที่ยิงกลับไป Feishu เลย
 * มีแต่การอ่าน (listTables / listAllRecords) แล้วเก็บสำเนาไว้ในตาราง feishu_*
 */

const APP_TOKEN = (process.env.FEISHU_BASE_APP_TOKEN || "QfLCblSYVakfeZseyR8chGpwnoc").trim();

export function baseAppToken(): string {
  return APP_TOKEN;
}

/** ลงทะเบียนตารางจาก Base มาไว้ใน feishu_tables (ยังไม่ดึงเรคคอร์ด) */
export async function registerTables(): Promise<{ table_id: string; name: string }[]> {
  const tables = await listTables(APP_TOKEN);
  for (const t of tables) {
    await db
      .prepare(
        `INSERT INTO feishu_tables (table_id, app_token, name)
         VALUES (?, ?, ?)
         ON CONFLICT (table_id) DO UPDATE SET name = EXCLUDED.name, app_token = EXCLUDED.app_token`,
      )
      .run(t.table_id, APP_TOKEN, t.name);
  }
  return tables.map((t) => ({ table_id: t.table_id, name: t.name }));
}

/** รายชื่อตารางที่เลือกไว้ซิงก์ */
export async function enabledTables(): Promise<
  { table_id: string; name: string; enabled: boolean; last_synced_at: string; record_count: number }[]
> {
  return db
    .prepare(`SELECT table_id, name, enabled, last_synced_at, record_count FROM feishu_tables ORDER BY name`)
    .all();
}

/** เปิด/ปิดการซิงก์รายตาราง */
export async function setTableEnabled(tableId: string, enabled: boolean): Promise<void> {
  await db.prepare(`UPDATE feishu_tables SET enabled = ? WHERE table_id = ?`).run(enabled, tableId);
}

/** บันทึกเรคคอร์ดชุดหนึ่งลงแคช (upsert — ไม่ทับ origin/oa_request_id ของเดิม) */
async function upsertRecords(tableId: string, rows: BaseRecord[]): Promise<number> {
  let max = 0;
  for (const r of rows) {
    const mt = r.last_modified_time ?? r.created_time ?? 0;
    if (mt > max) max = mt;
    await db
      .prepare(
        `INSERT INTO feishu_records (table_id, record_id, fields, modified_time, synced_at)
         VALUES (?, ?, ?::jsonb, ?, utc_now_text())
         ON CONFLICT (table_id, record_id)
         DO UPDATE SET fields = EXCLUDED.fields, modified_time = EXCLUDED.modified_time, synced_at = utc_now_text()`,
      )
      .run(tableId, r.record_id, JSON.stringify(r.fields ?? {}), mt);
  }
  return max;
}

export type SyncResult = { table_id: string; name: string; fetched: number; total: number; ok: boolean; error?: string };

/** ซิงก์หนึ่งตาราง — ดึงทุกเรคคอร์ด (ยังไม่ทำ incremental ในรุ่นแรก เพื่อความถูกต้องก่อน) */
export async function syncTable(tableId: string): Promise<SyncResult> {
  const row = await db
    .prepare(`SELECT table_id, name FROM feishu_tables WHERE table_id = ?`)
    .get<{ table_id: string; name: string }>(tableId);
  const name = row?.name ?? tableId;
  try {
    let fetched = 0;
    let maxCursor = 0;
    let total = 0;
    await fetchRecords()(APP_TOKEN, tableId, {
      pageSize: 500,
      onPage: async (rows, done, tot) => {
        const m = await upsertRecords(tableId, rows);
        if (m > maxCursor) maxCursor = m;
        fetched = done;
        if (tot != null) total = tot;
      },
    });
    const count = await db
      .prepare(`SELECT COUNT(*)::int AS n FROM feishu_records WHERE table_id = ?`)
      .get<{ n: number }>(tableId);
    await db
      .prepare(
        `UPDATE feishu_tables SET last_synced_at = utc_now_text(), last_cursor = ?, record_count = ? WHERE table_id = ?`,
      )
      .run(maxCursor, count?.n ?? fetched, tableId);
    return { table_id: tableId, name, fetched, total: total || (count?.n ?? fetched), ok: true };
  } catch (e) {
    return { table_id: tableId, name, fetched: 0, total: 0, ok: false, error: (e as Error).message };
  }
}

/** ซิงก์ทุกตารางที่เปิดไว้ */
export async function syncAll(): Promise<SyncResult[]> {
  const rows = await db
    .prepare(`SELECT table_id FROM feishu_tables WHERE enabled = TRUE`)
    .all<{ table_id: string }>();
  const out: SyncResult[] = [];
  for (const r of rows) out.push(await syncTable(r.table_id));
  return out;
}

/** อ่านเรคคอร์ดที่ซิงก์ไว้ (ไว้แสดงใน OA) */
export async function readRecords(
  tableId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ record_id: string; fields: Record<string, unknown>; origin: string; modified_time: number }[]> {
  return db
    .prepare(
      `SELECT record_id, fields, origin, modified_time
         FROM feishu_records WHERE table_id = ?
        ORDER BY modified_time DESC
        LIMIT ? OFFSET ?`,
    )
    .all(tableId, opts.limit ?? 100, opts.offset ?? 0);
}

/** ตั้งค่าครบพอจะซิงก์ไหม — ผ่านระบบกลาง หรือ Feishu ตรง อย่างใดอย่างหนึ่ง */
export function syncReady(): boolean {
  if (!APP_TOKEN) return false;
  if (centralBaseReady()) return true;
  const c = bitableConfig();
  return Boolean(c.appId && c.appSecret);
}

/**
 * ลงทะเบียนตารางด้วยมือ (ใช้ตอนอ่านผ่านระบบกลาง ซึ่งยังไม่มี endpoint list ตาราง)
 * รับ table_id (tblXXXX) + ชื่อที่อยากให้แสดง
 */
export async function registerTableManual(tableId: string, name: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feishu_tables (table_id, app_token, name)
       VALUES (?, ?, ?)
       ON CONFLICT (table_id) DO UPDATE SET name = EXCLUDED.name`,
    )
    .run(tableId.trim(), APP_TOKEN, name.trim() || tableId.trim());
}

/** อ่านผ่านระบบกลางอยู่ไหม (ไว้ให้ UI รู้ว่าต้องใส่ table_id เอง) */
export function usingCentral(): boolean {
  return centralBaseReady();
}
