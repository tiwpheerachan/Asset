import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, USER_SELECT } from "./db";
import type { User } from "./types";

const COOKIE = "ia_session";
const SESSION_DAYS = 7;

/* ---------- password (scrypt, ไม่ต้องพึ่ง native lib เพิ่ม) ---------- */

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(plain, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/* ---------- session ---------- */

/**
 * idToken = ตั๋วที่ระบบกลางออกให้ตอนล็อกอิน เก็บไว้ยื่นคืนตอนออกจากระบบ
 * ล็อกอินด้วยรหัสผ่านในแอปไม่มีตั๋วนี้ ส่งค่าว่างไว้
 */
export async function createSession(userId: number, idToken = "") {
  const id = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at, id_token) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    expires.toISOString(),
    idToken,
  );
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * ปิดเซสชันของแอปนี้ แล้วคืน id_token ของเซสชันนั้นให้ผู้เรียกเอาไปใช้ต่อ
 * ต้องอ่านก่อนลบ — ลบไปแล้วไม่มีทางรู้ว่าเซสชันนั้นมาจากระบบกลางหรือเปล่า
 */
export async function destroySession(): Promise<{ idToken: string }> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  let idToken = "";
  if (id) {
    const row = (await db.prepare("SELECT id_token FROM sessions WHERE id = ?").get(id)) as
      | { id_token: string }
      | undefined;
    idToken = row?.id_token ?? "";
    await db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
  jar.delete(COOKIE);
  return { idToken };
}

export async function getCurrentUser(): Promise<User | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;

  const row = (await db
    .prepare(
      `${USER_SELECT}
         JOIN sessions s ON s.user_id = u.id
        WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(id, new Date().toISOString())) as User | undefined;

  return row ?? null;
}

/** ใช้ในทุกหน้าที่ต้อง login — เด้งไป /login ถ้ายังไม่ได้เข้าระบบ */
export async function requireUser(
  // รับพารามิเตอร์ไว้เฉยๆ เพื่อไม่ให้ผู้เรียกที่ส่งมาอยู่แล้วพัง
  _opts: { allowPasswordChange?: boolean } = {},
): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
