import "server-only";
import crypto from "node:crypto";
import { db } from "./db";

/**
 * กุญแจสำหรับระบบภายนอกที่เรียก API เข้ามา
 *
 * ที่มา: เดิมมีกุญแจใบเดียวตั้งไว้ใน env — ต่อระบบที่สองต้องเอากุญแจใบเดิมไปให้
 * แปลว่าเพิกถอนใบเดียวคือตัดทุกระบบพร้อมกัน และดูไม่ออกว่าใครเป็นคนเรียกเข้ามา
 *
 * เก็บเฉพาะแฮช ไม่เก็บตัวกุญแจ — ฐานข้อมูลหลุดแล้วเอาไปเรียก API ไม่ได้
 * ผลข้างเคียงคือเปิดดูย้อนหลังไม่ได้ จึงต้องให้คัดลอกตอนสร้างครั้งเดียว
 */

export type ApiKeyRow = {
  id: number;
  name: string;
  prefix: string;
  can_write: number;
  active: number;
  created_at: string;
  last_used_at: string | null;
  calls: number;
};

/** สิทธิ์ที่กุญแจใบหนึ่งมี — อนุมัติผ่าน API ไม่มีในรายการนี้โดยตั้งใจ */
export type ApiScope = "read" | "write";

const hash = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

/** ขึ้นต้นด้วย ia_ ให้ดูออกทันทีว่าเป็นกุญแจของระบบนี้ เวลาไปโผล่ใน log ของที่อื่น */
export function newApiKey(): string {
  return `ia_${crypto.randomBytes(24).toString("hex")}`;
}

export async function createApiKey(name: string, canWrite: boolean, userId: number) {
  const key = newApiKey();
  const info = (await db
    .prepare(
      `INSERT INTO api_keys (name, prefix, key_hash, can_write, created_by)
       VALUES (?,?,?,?,?)`,
    )
    .run(name.trim() || "ระบบภายนอก", key.slice(0, 11), hash(key), canWrite ? 1 : 0, userId));
  return { id: Number(info.lastInsertRowid), key };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return (await db
    .prepare(
      `SELECT id, name, prefix, can_write, active, created_at, last_used_at, calls
         FROM api_keys ORDER BY active DESC, id DESC`,
    )
    .all()) as ApiKeyRow[];
}

/** เพิกถอน ไม่ลบทิ้ง — ประวัติว่าเคยมีใบนี้และถูกเรียกไปกี่ครั้งยังต้องตามได้ */
export async function revokeApiKey(id: number) {
  await db.prepare("UPDATE api_keys SET active=0 WHERE id=?").run(id);
}

export async function deleteApiKey(id: number) {
  await db.prepare("DELETE FROM api_keys WHERE id=?").run(id);
}

export type Caller = { id: number; name: string; canWrite: boolean };

/**
 * ตรวจกุญแจที่ส่งมากับคำขอ
 *
 * ค้นด้วยแฮชตรง ๆ ไม่ต้องไล่เทียบทีละใบ — ค่าที่เทียบเป็นผลแฮชความยาวคงที่
 * จึงไม่มีข้อมูลรั่วจากเวลาที่ใช้เทียบเหมือนการเทียบตัวกุญแจตรง ๆ
 *
 * `API_KEY` ใน env ที่ใช้มาแต่เดิมยังใช้ได้ แต่เป็นสิทธิ์อ่านอย่างเดียว —
 * ของเก่าที่ต่ออยู่แล้วจะได้ไม่พังตอนอัปเกรด
 */
export async function verifyApiKey(given: string): Promise<Caller | null> {
  const key = given.trim();
  if (!key) return null;

  const legacy = process.env.API_KEY || "";
  if (legacy && key.length === legacy.length) {
    const a = Buffer.from(key);
    const b = Buffer.from(legacy);
    if (crypto.timingSafeEqual(a, b)) return { id: 0, name: "env API_KEY", canWrite: false };
  }

  const row = (await db
    .prepare("SELECT id, name, can_write FROM api_keys WHERE key_hash=? AND active=1")
    .get(hash(key))) as { id: number; name: string; can_write: number } | undefined;
  if (!row) return null;

  await db.prepare(
    "UPDATE api_keys SET last_used_at=utc_now_text(), calls=calls+1 WHERE id=?",
  ).run(row.id);

  return { id: row.id, name: row.name, canWrite: row.can_write === 1 };
}

/**
 * จำกัดจำนวนครั้งต่อนาทีของกุญแจแต่ละใบ
 *
 * ระบบปลายทางที่ตั้ง job ผิดพลาดสามารถยิงวนเป็นพันครั้งต่อนาทีได้โดยไม่ตั้งใจ
 * ซึ่งจะทำให้ SQLite ตัวเดียวที่รับงานของคนทั้งบริษัทช้าไปด้วย
 *
 * นับในหน่วยความจำพอ — รีสตาร์ตแล้วเริ่มนับใหม่ก็ไม่เสียหาย เพราะนี่คือกันอุบัติเหตุ
 * ไม่ใช่กันการโจมตี
 */
const hits = new Map<string, { n: number; until: number }>();
export const RATE_PER_MIN = Math.max(10, Number(process.env.API_RATE_PER_MIN || 120));

export function rateLimit(callerId: number, now = Date.now()): boolean {
  const k = String(callerId);
  const cur = hits.get(k);
  if (!cur || now > cur.until) {
    hits.set(k, { n: 1, until: now + 60_000 });
    return true;
  }
  cur.n += 1;
  return cur.n <= RATE_PER_MIN;
}
