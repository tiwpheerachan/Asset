import "server-only";

/**
 * OA Export API — ดึงข้อมูล OA ทั้งหมดจากระบบ feishu-approval-to-base (OA File Check)
 * อ่านอย่างเดียว · มีทั้งฟิลด์ฟอร์ม, ไฟล์แนบ, สิ่งที่ AI อ่านจากเอกสาร, ผลตรวจ reviewer
 *
 * ทางนี้แทนการอ่าน Feishu Base ตรง — ข้อมูลครบกว่า และไม่ติดสิทธิ์ Base
 * เอกสาร API: /Users/tiw/Downloads/EXPORT_API.md
 */

export function oaExportConfig() {
  return {
    base: (process.env.OA_EXPORT_URL || "https://34-21-223-128.sslip.io").replace(/\/+$/, ""),
    key: (process.env.OA_EXPORT_KEY || "").trim(),
  };
}

export function oaExportReady(): boolean {
  const c = oaExportConfig();
  return Boolean(c.base && c.key);
}

export type OaForm = { form_code: string; form_name: string; oa_count: number; synced_at: string };

/** สิ่งที่ AI อ่านได้จากไฟล์ (ใช้ final เสมอ = edited ถ้ามี ไม่งั้น result) */
export type AiFinal = {
  doc_type?: string | null; doc_no?: string | null; doc_date?: string | null;
  seller?: string | null; buyer?: string | null;
  currency?: string | null; subtotal?: number | null; tax?: number | null; total?: number | null;
  payment_terms?: string | null; reference_no?: string | null;
  items?: { no?: number; description?: string; qty?: number; unit_price?: number; amount?: number }[];
  low_confidence?: string[]; notes?: string | null;
};

export type OaFile = {
  id: number; field: string; name: string; mime: string; size: number; sha256: string;
  download: string;
  ai: { status: string; final?: AiFinal | null; error?: string | null } | null;
};

export type OaDoc = {
  oa_key: string;
  form_code: string;
  form_name: string;
  serial: string;
  status: string;        // 已通过 / 已撤回 ...
  updated_at: string;    // เวลาไทย (UTC+7)
  fields: Record<string, unknown>;
  attachments?: { state?: unknown; files?: OaFile[] };
  checks?: { id: string; status: string; note: string; by: string; at: string; peak_key: string | null }[];
  flags?: { cancelled?: boolean; low_confidence_files?: number; ai_errors?: number; ai_pending?: number };
};

async function call<T>(path: string): Promise<T> {
  const { base, key } = oaExportConfig();
  if (!key) throw new Error("ยังไม่ได้ตั้ง OA_EXPORT_KEY");
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OA Export API ${res.status}${t ? ": " + t.slice(0, 120) : ""}`);
  }
  return res.json() as Promise<T>;
}

/** รายชื่อฟอร์ม + จำนวน OA */
export async function listForms(): Promise<OaForm[]> {
  const d = await call<{ forms: OaForm[] }>("/api/export/v1/forms");
  return d.forms ?? [];
}

/** ดึง OA ทีละหน้า (เรียงตาม updated_at เก่าสุดก่อน) */
export async function fetchOaPage(opts: { after?: string; limit?: number; form?: string } = {}): Promise<{ items: OaDoc[]; next: string; more: boolean }> {
  const q = new URLSearchParams();
  if (opts.after) q.set("after", opts.after);
  q.set("limit", String(opts.limit ?? 200));
  if (opts.form) q.set("form", opts.form);
  return call(`/api/export/v1/oa?${q.toString()}`);
}

/** URL ไฟล์แนบ (ผ่าน proxy ของ OA เองภายหลัง เพื่อแนบ token ฝั่งเซิร์ฟเวอร์) */
export function fileDownloadPath(id: number): string {
  return `/api/export/v1/files/${id}`;
}
