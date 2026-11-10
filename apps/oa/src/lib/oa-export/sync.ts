import "server-only";
import { db } from "../db";
import { listForms, fetchOaPage, oaExportReady, type OaDoc } from "./client";

/**
 * ซิงก์ OA จาก Export API เข้าตาราง feishu_* ของ OA (ทางเดียว อ่านอย่างเดียว)
 * - feishu_tables : 1 แถว = 1 ฟอร์ม (table_id = form_code)
 * - feishu_records: 1 แถว = 1 OA (record_id = oa_key, fields = OA ทั้งก้อน)
 * cursor เก็บใน app_meta เพื่อดึงเฉพาะที่เปลี่ยนครั้งถัดไป
 */

export { oaExportReady };

const CURSOR_KEY = "oa_export_cursor";

async function getCursor(): Promise<string> {
  const r = await db.prepare("SELECT value FROM app_meta WHERE key = ?").get<{ value: string }>(CURSOR_KEY);
  return r?.value ?? "";
}
async function setCursor(v: string): Promise<void> {
  await db
    .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
    .run(CURSOR_KEY, v);
}

/** แปลงเวลาไทย "YYYY-MM-DD HH:mm:ss" → epoch ms */
function epoch(s: string): number {
  const t = Date.parse((s || "").replace(" ", "T") + "+07:00");
  return Number.isFinite(t) ? t : 0;
}

/** ลงทะเบียนฟอร์มทั้งหมด (ต้องทำก่อน upsert OA เพราะ feishu_records อ้าง table_id) */
export async function syncForms(): Promise<{ form_code: string; form_name: string; oa_count: number }[]> {
  const forms = await listForms();
  for (const f of forms) {
    await db
      .prepare(
        `INSERT INTO feishu_tables (table_id, app_token, name, record_count, last_synced_at)
         VALUES (?, 'oa-export', ?, ?, utc_now_text())
         ON CONFLICT (table_id) DO UPDATE SET name = EXCLUDED.name, record_count = EXCLUDED.record_count`,
      )
      .run(f.form_code, f.form_name, f.oa_count);
  }
  return forms;
}

async function upsertOne(oa: OaDoc): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feishu_records (table_id, record_id, fields, modified_time, origin, synced_at)
       VALUES (?, ?, ?::jsonb, ?, 'lark', utc_now_text())
       ON CONFLICT (table_id, record_id)
       DO UPDATE SET fields = EXCLUDED.fields, modified_time = EXCLUDED.modified_time, synced_at = utc_now_text()`,
    )
    .run(oa.form_code, oa.oa_key, JSON.stringify(oa).replace(/\u0000/g, "").replace(/\\u0000/g, ""), epoch(oa.updated_at));
}

export type OaSyncResult = { pages: number; count: number; cursor: string; done: boolean };

/**
 * ซิงก์ OA ทีละชุด (ต่อจาก cursor เดิม)
 * @param reset    true = เริ่มดึงใหม่ตั้งแต่ต้น (ล้าง cursor)
 * @param maxPages กันไม่ให้ยาวเกินใน 1 รอบ (ค่อยรันซ้ำต่อ cursor ได้)
 */
export async function syncOa(opts: { reset?: boolean; maxPages?: number; source?: string } = {}): Promise<OaSyncResult> {
  if (!oaExportReady()) throw new Error("ยังไม่ได้ตั้ง OA_EXPORT_URL / OA_EXPORT_KEY");
  const started = Date.now();
  await syncForms();
  let after = opts.reset ? "" : await getCursor();
  const max = opts.maxPages ?? 200;
  let pages = 0;
  let count = 0;
  let more = true;
  while (pages < max) {
    const page = await fetchOaPage({ after, limit: 500 });
    for (const oa of page.items) {
      await upsertOne(oa);
      count++;
    }
    after = page.next || after;
    await setCursor(after);
    pages++;
    more = Boolean(page.more);
    if (!more) break;
  }
  // บันทึกประวัติการซิงก์รอบนี้ (ไม่ให้ล้มถ้า log พลาด)
  try {
    const total = await oaTotal().catch(() => 0);
    const chg = await db.prepare(`SELECT COUNT(*)::int n FROM oa_change_log WHERE at >= to_timestamp(?)`).get<{ n: number }>(started / 1000);
    await db.prepare(`INSERT INTO oa_sync_log (source, pages, fetched, changed, total, ms, ok) VALUES (?, ?, ?, ?, ?, ?, true)`)
      .run(opts.source ?? "manual", pages, count, chg?.n ?? 0, total, Date.now() - started);
  } catch { /* ไม่สำคัญพอที่จะทำให้ซิงก์ล้ม */ }
  return { pages, count, cursor: after, done: !more };
}

export type SyncFilter = { from?: string; to?: string; source?: string };
export type ChangeFilter = { from?: string; to?: string; kind?: string; q?: string };

function syncWhere(f: SyncFilter = {}): { sql: string; args: unknown[] } {
  const c: string[] = []; const a: unknown[] = [];
  if (f.from) { c.push("at >= ?::date"); a.push(f.from); }
  if (f.to) { c.push("at < (?::date + 1)"); a.push(f.to); }
  if (f.source) { c.push("source = ?"); a.push(f.source); }
  return { sql: c.length ? "WHERE " + c.join(" AND ") : "", args: a };
}
function changeWhere(f: ChangeFilter = {}): { sql: string; args: unknown[] } {
  const c: string[] = []; const a: unknown[] = [];
  if (f.from) { c.push("at >= ?::date"); a.push(f.from); }
  if (f.to) { c.push("at < (?::date + 1)"); a.push(f.to); }
  if (f.kind) { c.push("kind = ?"); a.push(f.kind); }
  if (f.q && f.q.trim()) { c.push("(serial ILIKE ? OR form_name ILIKE ?)"); a.push(`%${f.q.trim()}%`, `%${f.q.trim()}%`); }
  return { sql: c.length ? "WHERE " + c.join(" AND ") : "", args: a };
}

export type SyncLog = { id: number; at: string; source: string; pages: number; fetched: number; changed: number; total: number; ms: number; ok: boolean; error: string | null };
export async function oaSyncHistory(limit = 20, offset = 0, f: SyncFilter = {}): Promise<SyncLog[]> {
  const w = syncWhere(f);
  return db.prepare(`SELECT id, at::text at, source, pages, fetched, changed, total, ms, ok, error FROM oa_sync_log ${w.sql} ORDER BY at DESC LIMIT ? OFFSET ?`).all<SyncLog>(...w.args, limit, offset);
}
export async function oaSyncCount(f: SyncFilter = {}): Promise<number> {
  const w = syncWhere(f);
  const r = await db.prepare(`SELECT COUNT(*)::int n FROM oa_sync_log ${w.sql}`).get<{ n: number }>(...w.args);
  return r?.n ?? 0;
}

export type ChangeLog = { id: number; at: string; oa_key: string; table_id: string; serial: string; form_name: string; kind: string; old_val: string | null; new_val: string | null };
export async function oaChangeHistory(limit = 60, offset = 0, f: ChangeFilter = {}): Promise<ChangeLog[]> {
  const w = changeWhere(f);
  return db.prepare(`SELECT id, at::text at, oa_key, table_id, serial, form_name, kind, old_val, new_val FROM oa_change_log ${w.sql} ORDER BY at DESC LIMIT ? OFFSET ?`).all<ChangeLog>(...w.args, limit, offset);
}
export async function oaChangeCount(f: ChangeFilter = {}): Promise<number> {
  const w = changeWhere(f);
  const r = await db.prepare(`SELECT COUNT(*)::int n FROM oa_change_log ${w.sql}`).get<{ n: number }>(...w.args);
  return r?.n ?? 0;
}

/** จำนวนประวัติทั้งหมด (ไว้โชว์ยอดรวมแท็บ) */
export async function oaHistoryCounts(): Promise<{ syncs: number; changes: number }> {
  return { syncs: await oaSyncCount(), changes: await oaChangeCount() };
}

/** รายชื่อฟอร์มที่ซิงก์จาก Export API (+ จำนวนที่เก็บจริงในเครื่อง) */
export async function oaForms(): Promise<{ form_code: string; name: string; source_count: number; local_count: number; last_synced_at: string }[]> {
  return db
    .prepare(
      `SELECT t.table_id AS form_code, t.name, t.record_count AS source_count, t.last_synced_at,
              COUNT(r.record_id)::int AS local_count
         FROM feishu_tables t
         LEFT JOIN feishu_records r ON r.table_id = t.table_id
        WHERE t.app_token = 'oa-export'
        GROUP BY t.table_id, t.name, t.record_count, t.last_synced_at
        ORDER BY t.name`,
    )
    .all();
}

/** นับ OA ทั้งหมดที่ซิงก์แล้ว */
export async function oaTotal(): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*)::int AS n FROM feishu_records r JOIN feishu_tables t ON t.table_id = r.table_id WHERE t.app_token = 'oa-export'`)
    .get<{ n: number }>();
  return r?.n ?? 0;
}

/** อ่าน OA ที่ซิงก์ไว้ (ไว้แสดงใน OA) */
export async function readOa(
  formCode: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ record_id: string; fields: OaDoc }[]> {
  const rows = await db
    .prepare(
      `SELECT record_id, fields FROM feishu_records WHERE table_id = ?
        ORDER BY modified_time DESC LIMIT ? OFFSET ?`,
    )
    .all<{ record_id: string; fields: OaDoc }>(formCode, opts.limit ?? 100, opts.offset ?? 0);
  return rows;
}

/** ค้นเอกสาร "ข้ามทุกฟอร์ม" ตามตัวกรอง scalar (เร็ว) — ใช้ตอน drill-down จาก dashboard */
export type OaQuery = { status?: string; dept?: string; form?: string; node?: string; files?: string; from?: string; to?: string; q?: string; limit?: number; offset?: number };
const Q_STATUS: Record<string, string> = { approved: "通过", pending: "审批中", rejected: "拒绝", cancelled: "撤回|删除", rejcan: "拒绝|撤回|删除" };

export async function queryOa(f: OaQuery): Promise<{ record_id: string; fields: OaDoc }[]> {
  const c: string[] = [];
  const a: unknown[] = [];
  if (f.form) { c.push("table_id = ?"); a.push(f.form); }
  if (f.status && Q_STATUS[f.status]) { c.push("r_status ~ ?"); a.push(Q_STATUS[f.status]); }
  if (f.dept) { c.push("r_dept = ?"); a.push(f.dept); }
  if (f.node) { c.push("r_node = ?"); a.push(f.node); }
  if (f.files === "1") c.push("r_files > 0");
  if (f.from) { c.push("r_sday >= ?"); a.push(f.from.replace(/-/g, "")); }
  if (f.to) { c.push("r_sday <= ?"); a.push(f.to.replace(/-/g, "")); }
  if (f.q && f.q.trim()) { c.push("r_search ILIKE ?"); a.push(`%${f.q.trim().toLowerCase()}%`); }
  const where = c.length ? "WHERE " + c.join(" AND ") : "";
  const limit = Math.min(f.limit ?? 200, 500);
  return db
    .prepare(`SELECT record_id, fields FROM feishu_records ${where} ORDER BY modified_time DESC LIMIT ? OFFSET ?`)
    .all<{ record_id: string; fields: OaDoc }>(...a, limit, f.offset ?? 0);
}

/** รายชื่อแผนก (ไว้ทำ dropdown ตัวกรอง) */
export async function oaDepts(): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT DISTINCT r_dept d FROM feishu_records WHERE r_dept IS NOT NULL AND r_dept <> '' ORDER BY 1`)
    .all<{ d: string }>();
  return rows.map((r) => r.d).filter(Boolean);
}
