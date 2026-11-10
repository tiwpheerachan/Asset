import "server-only";
import { db } from "../db";

/**
 * โปรไฟล์พนักงาน: จับคู่ user_id (จาก approval) → รูป/ตำแหน่งจาก Lark directory (ผ่าน SSO gateway)
 * - API key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (CENTRAL_API_KEY) ไม่ส่งออกเบราว์เซอร์
 * - จับคู่ด้วย "ชื่อเต็มตรงเป๊ะ" เท่านั้น เพื่อกันแสดงรูปผิดคน (ไม่ตรง = ไม่ใส่รูป ใช้ตัวย่อแทน)
 * - cache ผลลง oa_people (ทั้งที่เจอและไม่เจอ) เพื่อไม่ยิงซ้ำ
 */

export type Profile = { user_id: string; name: string; avatar_url: string | null; title: string | null; dept: string | null };

const BASE = (process.env.CENTRAL_API_URL || "https://sso.shd-technology.co.th").replace(/\/+$/, "");
const KEY = (process.env.CENTRAL_API_KEY || "").trim();
export const peopleReady = () => !!KEY;

const norm = (n?: string) => (n || "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const TTL_DAYS = 14;

async function searchDirectory(q: string): Promise<any[]> {
  const query = q.replace(/\(.*?\)/g, "").trim().slice(0, 24);
  if (query.length < 2) return [];
  try {
    const r = await fetch(`${BASE}/api/v1/directory/search?q=${encodeURIComponent(query)}&limit=8`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.items) ? j.items : [];
  } catch { return []; }
}

/** จับคู่แบบตรงเป๊ะ: ต้องมีผลที่ normalize(name|en_name) == normalize(ชื่อที่ให้มา) เพียงรายการเดียว */
function strictMatch(name: string, items: any[]): any | null {
  const nf = norm(name);
  const hit = items.filter((it) => norm(it.name) === nf || norm(it.en_name) === nf);
  return hit.length === 1 ? hit[0] : null;
}

/**
 * คืนโปรไฟล์ของ user_id ที่ขอ (เท่าที่จับคู่ได้) — cache-first
 * @param people รายการ { user_id, name } จาก approval
 */
export async function resolvePeople(people: { user_id?: string; name?: string }[]): Promise<Record<string, Profile>> {
  const uniq = new Map<string, string>(); // user_id -> name
  for (const p of people) if (p?.user_id && p.name && !uniq.has(p.user_id)) uniq.set(p.user_id, p.name);
  if (uniq.size === 0) return {};

  const ids = [...uniq.keys()];
  const ph = ids.map(() => "?").join(",");
  const cached = await db
    .prepare(`SELECT user_id, name, avatar_url, title, dept, found, resolved_at FROM oa_people WHERE user_id IN (${ph})`)
    .all<{ user_id: string; name: string; avatar_url: string | null; title: string | null; dept: string | null; found: boolean; resolved_at: string }>(...ids)
    .catch(() => []);
  const cmap = new Map(cached.map((c) => [c.user_id, c]));
  const out: Record<string, Profile> = {};
  const stale = (at: string) => (Date.now() - new Date(at).getTime()) / 86400000 > TTL_DAYS;

  for (const uid of ids) {
    const c = cmap.get(uid);
    if (c && !stale(c.resolved_at)) {
      if (c.found) out[uid] = { user_id: uid, name: c.name, avatar_url: c.avatar_url, title: c.title, dept: c.dept };
      continue; // negative cache: ไม่ต้องยิงซ้ำ
    }
    // ยังไม่มี/หมดอายุ → ค้น directory แล้วจับคู่เข้ม
    const name = uniq.get(uid)!;
    if (!peopleReady()) continue;
    const m = strictMatch(name, await searchDirectory(name));
    const prof = m
      ? { avatar_url: m.avatar_url ?? null, title: m.job_title ?? null, dept: Array.isArray(m.departments) ? m.departments[0] ?? null : null, union_id: m.union_id ?? null, email: m.email ?? null }
      : null;
    await db
      .prepare(`INSERT INTO oa_people (user_id, name, union_id, avatar_url, title, dept, email, found, resolved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, union_id=EXCLUDED.union_id, avatar_url=EXCLUDED.avatar_url, title=EXCLUDED.title, dept=EXCLUDED.dept, email=EXCLUDED.email, found=EXCLUDED.found, resolved_at=now()`)
      .run(uid, name, prof?.union_id ?? null, prof?.avatar_url ?? null, prof?.title ?? null, prof?.dept ?? null, prof?.email ?? null, !!m)
      .catch(() => {});
    if (m) out[uid] = { user_id: uid, name, avatar_url: prof!.avatar_url, title: prof!.title, dept: prof!.dept };
  }
  return out;
}
