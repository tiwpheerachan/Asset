import "server-only";
import { db } from "../db";
import type { OaDoc } from "../oa-export/client";
import { onebookReady, postImportJob, discardImportJob } from "../onebook/client";

/**
 * ชั้นลงบัญชี: พนักงานบัญชีตรวจเอกสาร OA (เทียบยอดที่ AI อ่าน) แล้วโพสต์เข้า ONEBOOK
 * เก็บสถานะใน oa_accounting · อ้างข้อมูลเอกสารจาก feishu_records (อ่านอย่างเดียว)
 *
 * ยังไม่เขียนลง ONEBOOK จริงในขั้นนี้ (ต้องแมป schema ONEBOOK ก่อน) — onebook_ref ว่างไว้
 * post = บันทึกการตัดสินใจ "ลงบัญชีแล้ว" ในฝั่ง OA ซึ่งถอน/ย้อนได้
 */

const CONFIG_KEY = "oa_accounting_config";
export type FormKind = "accounting" | "asset" | "none";
export type AcctConfig = { accounting: string[]; asset: string[] };

export async function getConfig(): Promise<AcctConfig> {
  const r = await db.prepare("SELECT value FROM app_meta WHERE key = ?").get<{ value: string }>(CONFIG_KEY);
  try {
    const j = r?.value ? JSON.parse(r.value) : {};
    return { accounting: j.accounting ?? [], asset: j.asset ?? [] };
  } catch { return { accounting: [], asset: [] }; }
}

export async function setFormKind(formCode: string, kind: FormKind): Promise<void> {
  const c = await getConfig();
  c.accounting = c.accounting.filter((x) => x !== formCode);
  c.asset = c.asset.filter((x) => x !== formCode);
  if (kind === "accounting") c.accounting.push(formCode);
  if (kind === "asset") c.asset.push(formCode);
  await db
    .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
    .run(CONFIG_KEY, JSON.stringify(c));
}

/** ยอดที่ AI อ่านได้จากไฟล์แนบ (รวม total ของไฟล์ที่อ่านได้) */
export function aiTotalOf(oa: OaDoc): number | null {
  const files = oa.attachments?.files ?? [];
  let sum = 0, found = false;
  for (const f of files) {
    const t = f.ai?.final?.total;
    if (typeof t === "number") { sum += t; found = true; }
  }
  return found ? sum : null;
}

/** ยอดที่พนักงานกรอกในฟอร์ม OA (เดาจากชื่อฟิลด์ที่สื่อถึงยอดเงิน) */
export function formAmountOf(oa: OaDoc): number | null {
  for (const [k, v] of Object.entries(oa.fields ?? {})) {
    if (!/amount|总额|金额|ยอด|รวม|total|合计/i.test(k)) continue;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

export type QueueRow = {
  oa_key: string; serial: string; status_oa: string; applicant: string; date: string;
  ai_total: number | null; form_amount: number | null; files: number; cancelled: boolean;
  acct_status: string; amount: number | null; note: string; onebook_ref: string; posted_at: string;
};

export async function queue(
  formCode: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<QueueRow[]> {
  const rows = await db
    .prepare(
      `SELECT r.record_id AS oa_key, r.fields,
              a.status AS acct_status, a.amount, a.note, a.onebook_ref, a.posted_at
         FROM feishu_records r
         LEFT JOIN oa_accounting a ON a.oa_key = r.record_id
        WHERE r.table_id = ?
        ORDER BY r.modified_time DESC
        LIMIT ? OFFSET ?`,
    )
    .all<{ oa_key: string; fields: OaDoc; acct_status: string | null; amount: number | null; note: string | null; onebook_ref: string | null; posted_at: string | null }>(
      formCode, opts.limit ?? 100, opts.offset ?? 0,
    );
  return rows
    .map((r) => {
      const oa = r.fields;
      const acct = r.acct_status ?? "new";
      if (opts.status && opts.status !== "all" && acct !== opts.status) return null;
      return {
        oa_key: r.oa_key,
        serial: oa.serial,
        status_oa: oa.status,
        applicant: String((oa.fields?.["发起人"] ?? oa.fields?.["ผู้ยื่น"] ?? "") || ""),
        date: String((oa.fields?.["发起时间"] ?? oa.updated_at ?? "") || "").slice(0, 10),
        ai_total: aiTotalOf(oa),
        form_amount: formAmountOf(oa),
        files: oa.attachments?.files?.length ?? 0,
        cancelled: Boolean(oa.flags?.cancelled),
        acct_status: acct,
        amount: r.amount ?? null,
        note: r.note ?? "",
        onebook_ref: r.onebook_ref ?? "",
        posted_at: r.posted_at ?? "",
      } as QueueRow;
    })
    .filter((x): x is QueueRow => x !== null);
}

async function upsert(oaKey: string, formCode: string, patch: Record<string, unknown>): Promise<void> {
  const cols = ["oa_key", "form_code", ...Object.keys(patch)];
  const vals = [oaKey, formCode, ...Object.values(patch)];
  const ph = vals.map((_, i) => `$${i + 1}`);
  const upd = Object.keys(patch).map((k) => `${k} = EXCLUDED.${k}`).concat("updated_at = utc_now_text()").join(", ");
  await db
    .prepare(`INSERT INTO oa_accounting (${cols.join(", ")}) VALUES (${ph.join(", ")}) ON CONFLICT (oa_key) DO UPDATE SET ${upd}`)
    .run(...vals);
}

export async function markChecked(oaKey: string, formCode: string, amount: number | null, note: string, by: string) {
  await upsert(oaKey, formCode, { status: "checked", amount, note, checked_by: by, checked_at: new Date().toISOString() });
}
export async function markSkipped(oaKey: string, formCode: string, by: string) {
  await upsert(oaKey, formCode, { status: "skipped", checked_by: by, checked_at: new Date().toISOString() });
}
/** โพสต์เข้า ONEBOOK — ส่งเข้าคิวนำเข้า (ai_import_jobs status 'review') แล้วเก็บ id ไว้ถอน */
export async function markPosted(oaKey: string, formCode: string, amount: number | null, by: string): Promise<string> {
  const row = await db
    .prepare("SELECT fields FROM feishu_records WHERE record_id = ? AND table_id = ?")
    .get<{ fields: OaDoc }>(oaKey, formCode);
  const oa = row?.fields;
  let ref = "";
  if (onebookReady() && oa) {
    const files = oa.attachments?.files ?? [];
    const firstAi = files.map((f) => f.ai?.final).find(Boolean) ?? null;
    ref = await postImportJob({
      file_name: `OA ${oa.serial} · ${oa.form_name}`,
      detected_kind: firstAi?.doc_type ?? oa.form_name,
      extracted: {
        oa_key: oaKey, serial: oa.serial, form: oa.form_name, status: oa.status,
        applicant: oa.fields?.["发起人"] ?? null, amount, ai: firstAi,
        fields: oa.fields,
        files: files.map((f) => ({ name: f.name, download: f.download, ai: f.ai?.final ?? null })),
      },
    });
  }
  await upsert(oaKey, formCode, { status: "posted", amount, onebook_ref: ref, checked_by: by, posted_at: new Date().toISOString() });
  return ref;
}

export async function markReversed(oaKey: string, formCode: string, by: string) {
  const row = await db.prepare("SELECT onebook_ref FROM oa_accounting WHERE oa_key = ?").get<{ onebook_ref: string }>(oaKey);
  if (row?.onebook_ref && onebookReady()) {
    try { await discardImportJob(row.onebook_ref); } catch { /* ถอนฝั่ง ONEBOOK ไม่ได้ก็ยังถอนฝั่ง OA ต่อ */ }
  }
  await upsert(oaKey, formCode, { status: "reversed", onebook_ref: "", checked_by: by });
}

/** เอกสาร OA เต็ม (ไว้แสดง detail การสแกน AI ประกอบการตัดสินใจ) */
export async function getOaDoc(oaKey: string): Promise<OaDoc | null> {
  const r = await db.prepare("SELECT fields FROM feishu_records WHERE record_id = ?").get<{ fields: OaDoc }>(oaKey);
  return r?.fields ?? null;
}

/** สรุปจำนวนตามสถานะของฟอร์มหนึ่ง */
export async function summary(formCode: string): Promise<Record<string, number>> {
  const rows = await db
    .prepare(`SELECT COALESCE(a.status,'new') AS s, COUNT(*)::int n
                FROM feishu_records r LEFT JOIN oa_accounting a ON a.oa_key = r.record_id
               WHERE r.table_id = ? GROUP BY COALESCE(a.status,'new')`)
    .all<{ s: string; n: number }>(formCode);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.s] = r.n;
  return out;
}
