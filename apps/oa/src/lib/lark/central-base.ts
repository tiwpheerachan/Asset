import "server-only";
import type { BaseRecord } from "./bitable";

/**
 * อ่าน Feishu Base ผ่าน "ระบบกลาง" (sso.shd) แทนการต่อ Feishu ตรง
 *
 * ข้อดี: ไม่ต้องมี Feishu app ของตัวเอง / ไม่ต้องรอแอดมินอนุมัติ — ใช้แอป Feishu
 * ที่ระบบกลางตั้งไว้แล้ว ผ่าน API key ของแอปเราในระบบกลาง (scope feishu:base:read)
 *
 * สเปก (จากคู่มือระบบกลาง):
 *   GET {base}/api/v1/feishu/base?app_token=..&table_id=..[&page_token=..]
 *   headers: Authorization: Bearer <CENTRAL_FEISHU_KEY>
 *   → { data: { items: [{ record_id, fields }], has_more, page_token } }
 */

export function centralBaseConfig() {
  return {
    base: (process.env.CENTRAL_DIRECTORY_URL || process.env.SSO_ISSUER || "").replace(/\/+$/, ""),
    key: (process.env.CENTRAL_FEISHU_KEY || "").trim(),
  };
}

export function centralBaseReady(): boolean {
  const c = centralBaseConfig();
  return Boolean(c.base && c.key);
}

async function fetchPage(
  appToken: string,
  tableId: string,
  pageToken?: string,
): Promise<{ items: BaseRecord[]; has_more: boolean; page_token?: string; total?: number }> {
  const { base, key } = centralBaseConfig();
  const u = new URL(`${base}/api/v1/feishu/base`);
  u.searchParams.set("app_token", appToken);
  u.searchParams.set("table_id", tableId);
  if (pageToken) u.searchParams.set("page_token", pageToken);

  const res = await fetch(u, { headers: { authorization: `Bearer ${key}` }, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json || json.ok === false) {
    const msg = json?.error || json?.hint || `central base error ${res.status}`;
    throw new Error(String(msg));
  }
  const d = json.data ?? json;
  return {
    items: (d.items ?? []) as BaseRecord[],
    has_more: Boolean(d.has_more),
    page_token: d.page_token,
    total: d.total,
  };
}

/** ดึงเรคคอร์ดทั้งหมด (วนหน้า) — signature เข้ากับ listAllRecords ของ bitable.ts */
export async function centralListAllRecords(
  appToken: string,
  tableId: string,
  opts: { pageSize?: number; onPage?: (rows: BaseRecord[], fetched: number, total?: number) => void | Promise<void> } = {},
): Promise<BaseRecord[]> {
  const out: BaseRecord[] = [];
  let pageToken: string | undefined;
  let total: number | undefined;
  do {
    const d = await fetchPage(appToken, tableId, pageToken);
    out.push(...d.items);
    total = d.total ?? total;
    if (opts.onPage) await opts.onPage(d.items, out.length, total);
    pageToken = d.has_more ? d.page_token : undefined;
  } while (pageToken);
  return out;
}

/** ทดสอบเชื่อม: ลองอ่าน 1 ตารางที่รู้จัก — คืน error ที่อ่านง่ายถ้ายังไม่ได้เพิ่มแอปเข้า Base */
export async function centralBaseTest(appToken: string, tableId: string): Promise<{ ok: true; sample: number } | { ok: false; error: string }> {
  try {
    const d = await fetchPage(appToken, tableId);
    return { ok: true, sample: d.items.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
