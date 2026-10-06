import "server-only";
import { parseDbTime } from "./format";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * กันการเดารหัสผ่าน
 *
 * นับสองแกน เพราะมันแก้คนละปัญหา:
 *   - ต่อบัญชี  กันคนไล่เดารหัสของคนคนเดียว
 *   - ต่อ IP    กันคนไล่ยิงรหัสเดียวใส่หลายบัญชี (password spraying) ซึ่งการนับต่อบัญชีจับไม่ได้
 *
 * เก็บลงตารางไม่ใช่ในหน่วยความจำ เพื่อให้รีสตาร์ตแล้วไม่รีเซ็ตให้คนยิงฟรี
 * และผู้ดูแลย้อนดูได้ว่ามีใครพยายามยิงบัญชีไหน
 */

const WINDOW_MIN = Math.max(1, Number(process.env.LOGIN_WINDOW_MINUTES || 15));
const MAX_PER_EMAIL = Math.max(1, Number(process.env.LOGIN_MAX_PER_EMAIL || 5));
const MAX_PER_IP = Math.max(1, Number(process.env.LOGIN_MAX_PER_IP || 20));

export const rateLimitConfig = () => ({
  windowMinutes: WINDOW_MIN,
  maxPerEmail: MAX_PER_EMAIL,
  maxPerIp: MAX_PER_IP,
});

/** ที่อยู่ผู้เรียก — เชื่อ x-forwarded-for ได้ต่อเมื่ออยู่หลัง proxy ที่เราคุมเอง */
export async function callerIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || h.get("x-real-ip") || "").trim() || "unknown";
}

const since = () => `-${WINDOW_MIN} minutes`;

export type LimitCheck = { blocked: boolean; retryAfterMin: number; reason: "EMAIL" | "IP" | "" };

/** ตรวจก่อนตรวจรหัสผ่าน — นับเฉพาะครั้งที่ล้มเหลว ครั้งที่สำเร็จไม่ควรทำให้คนอื่นโดนล็อก */
export async function checkLoginAllowed(email: string, ip: string): Promise<LimitCheck> {
  const byEmail = (await db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(at) AS first FROM login_attempts
        WHERE ok = 0 AND email = ? AND at > utc_now_text(?)`,
    )
    .get(email, since())) as { n: number; first: string | null };

  if (byEmail.n >= MAX_PER_EMAIL) {
    return { blocked: true, retryAfterMin: remaining(byEmail.first), reason: "EMAIL" };
  }

  const byIp = (await db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(at) AS first FROM login_attempts
        WHERE ok = 0 AND ip = ? AND ip <> 'unknown' AND at > utc_now_text(?)`,
    )
    .get(ip, since())) as { n: number; first: string | null };

  if (byIp.n >= MAX_PER_IP) {
    return { blocked: true, retryAfterMin: remaining(byIp.first), reason: "IP" };
  }

  return { blocked: false, retryAfterMin: 0, reason: "" };
}

function remaining(firstAt: string | null): number {
  if (!firstAt) return WINDOW_MIN;
  const t = parseDbTime(firstAt);
  if (!Number.isFinite(t)) return WINDOW_MIN;
  const left = WINDOW_MIN - Math.floor((Date.now() - t) / 60_000);
  return Math.max(1, left);
}

export async function recordLoginAttempt(email: string, ip: string, ok: boolean) {
  await db.prepare("INSERT INTO login_attempts (email, ip, ok) VALUES (?,?,?)").run(email, ip, ok ? 1 : 0);

  // ล็อกอินผ่านแล้วให้ล้างประวัติที่ล้มเหลวของบัญชีนั้น
  // ไม่งั้นคนที่พิมพ์ผิด 4 ครั้งแล้วเข้าได้ จะยังเหลือโควตาแค่ครั้งเดียวในอีก 15 นาทีถัดไป
  if (ok) (await db.prepare("DELETE FROM login_attempts WHERE email = ? AND ok = 0").run(email));

  // เก็บย้อนหลังพอให้ผู้ดูแลดูได้ ไม่ให้ตารางโตไม่จำกัด
  await db.prepare("DELETE FROM login_attempts WHERE at < utc_now_text('-30 days')").run();
}

/* ---------- ข้อมูลสำหรับหน้าผู้ดูแล ---------- */

export type LockedAccount = { email: string; fails: number; last: string; ips: string };

export async function loginSecurityStatus() {
  const locked = (await db
    .prepare(
      `SELECT email, COUNT(*) AS fails, MAX(at) AS last, string_agg(DISTINCT ip, ',') AS ips
         FROM login_attempts
        WHERE ok = 0 AND at > utc_now_text(?)
        GROUP BY email HAVING COUNT(*) >= ?
        ORDER BY fails DESC`,
    )
    .all(since(), MAX_PER_EMAIL)) as LockedAccount[];

  const recent = (await db
    .prepare(
      `SELECT email, ip, ok, at FROM login_attempts
        WHERE at > utc_now_text('-24 hours') ORDER BY id DESC LIMIT 30`,
    )
    .all()) as { email: string; ip: string; ok: number; at: string }[];

  const fails24h = (await db
    .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0 AND at > utc_now_text('-24 hours')")
    .get()) as { n: number };

  return { ...rateLimitConfig(), locked, recent, fails24h: fails24h.n };
}

/** ปลดล็อกให้ก่อนครบเวลา — ใช้ตอนพนักงานลืมรหัสแล้วโทรมาหาผู้ดูแล */
export async function unlockAccount(email: string) {
  await db.prepare("DELETE FROM login_attempts WHERE email = ? AND ok = 0").run(email);
}
