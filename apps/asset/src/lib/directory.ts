import 'server-only';

/**
 * ค้นรายชื่อพนักงานจากระบบกลาง (sso.shd) — ใช้ตอนเพิ่มผู้ใช้/ให้สิทธิ์ในหน้า /admin/users
 * ต้องมี scope directory:read:people · API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (เรียกผ่าน /api/directory/search)
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
  const base = (process.env.CENTRAL_DIRECTORY_URL || process.env.SSO_ISSUER || '').replace(/\/+$/, '');
  const key = process.env.CENTRAL_API_KEY || process.env.DIRECTORY_API_KEY || '';
  return { base, key, ready: Boolean(base && key) };
}

export function directoryConfigured(): boolean {
  return directoryConfig().ready;
}

export type DirectoryResult =
  | { ok: true; items: DirectoryPerson[]; synced_at: string | null; stale: boolean }
  | { ok: false; error: string };

export async function searchDirectory(q: string, signal?: AbortSignal): Promise<DirectoryResult> {
  const { base, key, ready } = directoryConfig();
  if (!ready) return { ok: false, error: 'not_configured' };

  const term = q.trim();
  if (term.length < 2) return { ok: false, error: 'query_too_short' };

  const url = new URL(`${base}/api/v1/directory/search`);
  url.searchParams.set('q', term);
  url.searchParams.set('limit', '20');

  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, cache: 'no-store', signal });
  } catch {
    return { ok: false, error: 'central_unreachable' };
  }

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; items?: DirectoryPerson[]; synced_at?: string | null; stale?: boolean; error?: string }
    | null;

  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
  return { ok: true, items: data.items ?? [], synced_at: data.synced_at ?? null, stale: Boolean(data.stale) };
}

/* ───────────── ผังแผนก (directory:read:departments) ───────────── */

export interface DirectoryDept {
  dept_id: string;
  parent_id: string;
  name: string;
  people: number;
}

export type DeptResult =
  | { ok: true; items: DirectoryDept[]; count: number; synced_at: string | null; stale: boolean }
  | { ok: false; error: string };

/** อ่านผังแผนกจากระบบกลาง (ชื่อ + จำนวนคนต่อแผนก) — ไม่มีข้อมูลรายบุคคล */
export async function listDepartments(signal?: AbortSignal): Promise<DeptResult> {
  const { base, key, ready } = directoryConfig();
  if (!ready) return { ok: false, error: 'not_configured' };

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/directory/departments`, { headers: { authorization: `Bearer ${key}` }, cache: 'no-store', signal });
  } catch {
    return { ok: false, error: 'central_unreachable' };
  }

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; items?: DirectoryDept[]; count?: number; synced_at?: string | null; stale?: boolean; error?: string }
    | null;

  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `http_${res.status}` };
  return { ok: true, items: data.items ?? [], count: data.count ?? (data.items?.length ?? 0), synced_at: data.synced_at ?? null, stale: Boolean(data.stale) };
}
