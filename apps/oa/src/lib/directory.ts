import "server-only";

/**
 * ค้นรายชื่อพนักงานจากระบบกลาง (Central Login) — ใช้ตอนตั้งผู้อนุมัติในตัวสร้างฟอร์ม
 *
 * ระบบกลางถือสำเนารายชื่อที่ซิงก์จาก Lark ไว้แล้ว และเปิด endpoint ให้ค้นด้วย API key
 * (ต้องมี scope directory:read:people) แอปนี้จึงไม่ต้องต่อ Lark เองเพื่อ "หาว่าใครชื่ออะไร"
 *
 * API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น — หน้าเว็บเรียกผ่าน /api/directory/search ไม่เคยเห็นคีย์
 */

export interface DirectoryPerson {
  union_id: string;
  name: string;
  en_name: string | null;
  email: string | null;
  job_title: string | null;
  departments: string[];
  avatar_url: string | null;
  status: string;
}

export function directoryConfig() {
  // ไม่ตั้ง CENTRAL_DIRECTORY_URL ก็ใช้ฐานเดียวกับ SSO ได้ (ปกติเป็นระบบกลางตัวเดียวกัน)
  const base = (process.env.CENTRAL_DIRECTORY_URL || process.env.SSO_ISSUER || "").replace(/\/+$/, "");
  const key = process.env.DIRECTORY_API_KEY || "";
  return { base, key, ready: Boolean(base && key) };
}

export function directoryConfigured(): boolean {
  return directoryConfig().ready;
}

export type DirectoryResult =
  | { ok: true; items: DirectoryPerson[]; synced_at: string | null; stale: boolean }
  | { ok: false; error: string };

/** ค้นด้วยชื่อ/อีเมล — ต่ำกว่า 2 ตัวอักษรถือว่าขอทั้งบริษัท ระบบกลางจะปฏิเสธเอง */
export async function searchDirectory(q: string, signal?: AbortSignal): Promise<DirectoryResult> {
  const { base, key, ready } = directoryConfig();
  if (!ready) return { ok: false, error: "not_configured" };

  const term = q.trim();
  if (term.length < 2) return { ok: false, error: "query_too_short" };

  const url = new URL(`${base}/api/v1/directory/search`);
  url.searchParams.set("q", term);
  url.searchParams.set("limit", "20");

  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", signal });
  } catch {
    return { ok: false, error: "central_unreachable" };
  }

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; items?: DirectoryPerson[]; synced_at?: string | null; stale?: boolean; error?: string }
    | null;

  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
  return {
    ok: true,
    items: data.items ?? [],
    synced_at: data.synced_at ?? null,
    stale: Boolean(data.stale),
  };
}
