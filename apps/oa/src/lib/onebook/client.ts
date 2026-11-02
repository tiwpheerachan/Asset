import "server-only";

/**
 * เขียนเข้า ONEBOOK (Supabase) — ผ่าน "คิวนำเข้า ai_import_jobs" เท่านั้น
 *
 * ทำไมเข้า ai_import_jobs ไม่เขียน journal ตรง: ONEBOOK เป็นบัญชีคู่จริง (accounts/
 * contacts/tax/journal) การลงรายการจริงต้องใช้ logic ของ ONEBOOK เอง เราแค่ "ส่งเข้า
 * คิวให้ตรวจ+นำเข้า" (status 'review') แล้วพนักงานบัญชีใน ONEBOOK กดนำเข้าเป็นเอกสารจริง
 * → ปลอดภัย ไม่เสี่ยงลงบัญชีผิด
 */

export function onebookConfig() {
  return {
    url: (process.env.ONEBOOK_SUPABASE_URL || "").replace(/\/+$/, ""),
    key: (process.env.ONEBOOK_SERVICE_KEY || "").trim(),
    company: (process.env.ONEBOOK_COMPANY_ID || "c440378b-f9b7-4a51-b01b-8a75ec32bd1d").trim(), // ค่าปริยาย = SHD
  };
}

export function onebookReady(): boolean {
  const c = onebookConfig();
  return Boolean(c.url && c.key);
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = onebookConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
}

export type ImportJob = {
  file_name: string;
  source?: string;
  status?: "queued" | "review" | "imported" | "discarded";
  detected_kind?: string | null;
  confidence?: number | null;
  extracted?: unknown;
};

/** สร้างงานนำเข้าใน ONEBOOK — คืน id ไว้อ้างอิง/ถอน */
export async function postImportJob(job: ImportJob): Promise<string> {
  const c = onebookConfig();
  const res = await rest("ai_import_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ company_id: c.company, source: "oa", status: "review", ...job }),
  });
  if (!res.ok) throw new Error(`ONEBOOK ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? "";
}

/** ถอน: ทำเครื่องหมายงานนำเข้าเป็น discarded (เก็บไว้ตรวจย้อน ไม่ลบทิ้ง) */
export async function discardImportJob(id: string): Promise<void> {
  const res = await rest(`ai_import_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "discarded" }),
  });
  if (!res.ok) throw new Error(`ONEBOOK ${res.status}`);
}
