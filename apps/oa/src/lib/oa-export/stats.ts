import "server-only";
import { db } from "../db";

/** สถิติเอกสาร OA สำหรับหน้า dashboard — รวมจาก feishu_records (ข้อมูลที่ดึงจาก Export API) */

export async function totals(): Promise<{ total: number; with_files: number; cancelled: number; posted: number; forms: number }> {
  const r = await db
    .prepare(
      `SELECT
         COUNT(*)::int total,
         COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(fields->'attachments'->'files','[]')) > 0)::int with_files,
         COUNT(*) FILTER (WHERE fields->'flags'->>'cancelled' = 'true')::int cancelled
       FROM feishu_records`,
    )
    .get<{ total: number; with_files: number; cancelled: number }>();
  const p = await db.prepare(`SELECT COUNT(*)::int n FROM oa_accounting WHERE status = 'posted'`).get<{ n: number }>();
  const f = await db.prepare(`SELECT COUNT(*)::int n FROM feishu_tables WHERE app_token = 'oa-export'`).get<{ n: number }>();
  return { total: r?.total ?? 0, with_files: r?.with_files ?? 0, cancelled: r?.cancelled ?? 0, posted: p?.n ?? 0, forms: f?.n ?? 0 };
}

/** จำนวนเอกสารต่อเดือน ตามวันที่ยื่น (发起时间) — ไว้ทำ timeline */
export async function byMonth(): Promise<{ ym: string; n: number }[]> {
  return db
    .prepare(
      `SELECT substr(regexp_replace(COALESCE(fields->'fields'->>'发起时间',''), '[^0-9]', '', 'g'), 1, 6) AS ym, COUNT(*)::int n
         FROM feishu_records
        WHERE length(regexp_replace(COALESCE(fields->'fields'->>'发起时间',''), '[^0-9]', '', 'g')) >= 6
        GROUP BY ym ORDER BY ym`,
    )
    .all<{ ym: string; n: number }>();
}

/** แยกตามสถานะคำขอ (申请状态) */
export async function byStatus(): Promise<{ status: string; n: number }[]> {
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(fields->>'status',''),'—') AS status, COUNT(*)::int n
         FROM feishu_records GROUP BY status ORDER BY n DESC`,
    )
    .all<{ status: string; n: number }>();
}

/** แยกตามฟอร์ม */
export async function byForm(): Promise<{ name: string; n: number }[]> {
  return db
    .prepare(`SELECT name, record_count AS n FROM feishu_tables WHERE app_token = 'oa-export' ORDER BY record_count DESC`)
    .all<{ name: string; n: number }>();
}

/** แยกตามแผนก (发起人部门) */
export async function byDept(limit = 10): Promise<{ dept: string; n: number }[]> {
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(fields->'fields'->>'发起人部门',''),'—') AS dept, COUNT(*)::int n
         FROM feishu_records GROUP BY dept ORDER BY n DESC LIMIT ?`,
    )
    .all<{ dept: string; n: number }>(limit);
}

/** ผู้ยื่นที่ยื่นเยอะสุด (发起人) */
export async function topApplicants(limit = 8): Promise<{ who: string; n: number }[]> {
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(fields->'fields'->>'发起人',''),'—') AS who, COUNT(*)::int n
         FROM feishu_records GROUP BY who ORDER BY n DESC LIMIT ?`,
    )
    .all<{ who: string; n: number }>(limit);
}

/** เอกสารล่าสุด */
export async function recent(limit = 12): Promise<{ oa_key: string; serial: string; form: string; status: string; applicant: string; date: string }[]> {
  const rows = await db
    .prepare(
      `SELECT record_id AS oa_key, fields FROM feishu_records ORDER BY modified_time DESC LIMIT ?`,
    )
    .all<{ oa_key: string; fields: any }>(limit);
  return rows.map((r) => ({
    oa_key: r.oa_key,
    serial: r.fields?.serial ?? "",
    form: r.fields?.form_name ?? "",
    status: r.fields?.status ?? "",
    applicant: String(r.fields?.fields?.["发起人"] ?? ""),
    date: String(r.fields?.fields?.["发起时间"] ?? r.fields?.updated_at ?? "").slice(0, 10),
  }));
}
