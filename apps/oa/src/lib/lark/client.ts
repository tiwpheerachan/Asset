import "server-only";
import { db, USER_SELECT } from "../db";
import { larkConfig, larkReady } from "./config";
import type { User } from "../types";

/** ผลลัพธ์มาตรฐานของ Open API — code 0 คือสำเร็จ */
type LarkResponse<T = unknown> = { code: number; msg: string; data?: T };

class LarkError extends Error {
  constructor(public code: number, msg: string) {
    super(`Lark API ${code}: ${msg}`);
  }
}

/* ---------- tenant access token (แคชไว้จนใกล้หมดอายุ) ---------- */

let cached: { token: string; expiresAt: number } | null = null;

async function tenantToken(): Promise<string> {
  const cfg = larkConfig();
  if (!larkReady(cfg)) throw new Error("ยังไม่ได้ตั้งค่า LARK_APP_ID / LARK_APP_SECRET");

  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`${cfg.domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    cache: "no-store",
  });
  const json = (await res.json()) as LarkResponse & {
    tenant_access_token?: string;
    expire?: number;
  };
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new LarkError(json.code, json.msg || "ขอ tenant_access_token ไม่สำเร็จ");
  }

  cached = {
    token: json.tenant_access_token,
    expiresAt: Date.now() + (json.expire ?? 7200) * 1000,
  };
  return cached.token;
}

/** เรียก Open API พร้อมแนบ token ให้อัตโนมัติ */
async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const cfg = larkConfig();
  const token = await tenantToken();
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";

  const res = await fetch(`${cfg.domain}${path}${qs}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json()) as LarkResponse<T>;
  if (json.code !== 0) throw new LarkError(json.code, json.msg);
  return json.data as T;
}

/* ---------- จับคู่ผู้ใช้ในระบบกับผู้ใช้ใน Lark ---------- */

/**
 * หา open_id จากอีเมล แล้วจำไว้ในตาราง users
 * (เรียก batch ได้ทีละหลายอีเมล — Lark จำกัด 50 ต่อครั้ง)
 */
export async function resolveLarkIds(users: User[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const need: User[] = [];

  for (const u of users) {
    if (u.lark_user_id) out.set(u.id, u.lark_user_id);
    else if (u.email) need.push(u);
  }
  if (need.length === 0) return out;

  const save = db.prepare("UPDATE users SET lark_user_id = ? WHERE id = ?");

  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    const data = await call<{
      user_list?: { email?: string; user_id?: string; status?: { is_activated?: boolean } }[];
    }>("/open-apis/contact/v3/users/batch_get_id", {
      method: "POST",
      query: { user_id_type: "open_id" },
      body: { emails: chunk.map((u) => u.email) },
    });

    for (const row of data.user_list ?? []) {
      const match = chunk.find((u) => u.email.toLowerCase() === (row.email ?? "").toLowerCase());
      if (!match || !row.user_id) continue;
      out.set(match.id, row.user_id);
      await save.run(row.user_id, match.id);
    }
  }
  return out;
}

/**
 * ดึงรูปโปรไฟล์จาก Lark (Contact API) ด้วย open_id แล้วเก็บลง users.avatar_url
 * - ใช้ scope อ่าน contact เดียวกับ batch_get_id ที่ใช้อยู่แล้ว (ไม่ต้องขอสิทธิ์เพิ่ม)
 * - ทำเฉพาะคนที่ "มี open_id แต่ยังไม่มีรูป" · Lark จำกัด 50 ต่อครั้ง
 * - คืนจำนวนคนที่อัปเดตรูปสำเร็จ
 */
export async function syncLarkAvatars(users: User[]): Promise<number> {
  const byOpenId = new Map<string, number[]>();
  for (const u of users) {
    if (!u.lark_user_id || u.avatar_url) continue;
    const ids = byOpenId.get(u.lark_user_id) ?? [];
    ids.push(u.id);
    byOpenId.set(u.lark_user_id, ids);
  }
  const openIds = [...byOpenId.keys()];
  if (openIds.length === 0) return 0;

  const save = db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?");
  let updated = 0;

  for (let i = 0; i < openIds.length; i += 50) {
    const chunk = openIds.slice(i, i + 50);
    const qs = new URLSearchParams();
    qs.set("user_id_type", "open_id");
    for (const id of chunk) qs.append("user_ids", id);

    const data = await call<{
      items?: {
        open_id?: string;
        avatar?: { avatar_240?: string; avatar_640?: string; avatar_origin?: string; avatar_72?: string };
      }[];
    }>(`/open-apis/contact/v3/users/batch?${qs.toString()}`);

    for (const row of data.items ?? []) {
      const url =
        row.avatar?.avatar_640 || row.avatar?.avatar_240 || row.avatar?.avatar_origin || row.avatar?.avatar_72;
      if (!row.open_id || !url) continue;
      for (const uid of byOpenId.get(row.open_id) ?? []) {
        await save.run(url, uid);
        updated++;
      }
    }
  }
  return updated;
}

export async function getUserByLarkId(openId: string): Promise<User | null> {
  return (
    ((await db.prepare(`${USER_SELECT} WHERE u.lark_user_id = ? AND u.active = 1`).get(openId)) as User) ??
    null
  );
}

/* ---------- ส่งข้อความ ---------- */

/** ส่งการ์ดโต้ตอบไปหาผู้ใช้คนหนึ่ง — คืน message_id ไว้ใช้อัปเดตการ์ดภายหลัง */
export async function sendCard(openId: string, card: unknown): Promise<string> {
  const data = await call<{ message_id: string }>("/open-apis/im/v1/messages", {
    method: "POST",
    query: { receive_id_type: "open_id" },
    body: {
      receive_id: openId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
  return data.message_id;
}

/** แทนที่เนื้อการ์ดที่ส่งไปแล้ว (ใช้ตอนมีคนกดอนุมัติ ปุ่มจะได้หายไปจากทุกเครื่อง) */
export async function updateCard(messageId: string, card: unknown): Promise<void> {
  await call(`/open-apis/im/v1/messages/${messageId}`, {
    method: "PATCH",
    body: { content: JSON.stringify(card) },
  });
}

/** ทดสอบว่าตั้งค่าถูกต้องไหม — คืนชื่อแอปที่เชื่อมอยู่ */
export async function testConnection(): Promise<{ ok: true; appName: string } | { ok: false; error: string }> {
  try {
    await tenantToken();
    const data = await call<{ app?: { app_name?: string } }>("/open-apis/application/v6/applications/" +
      larkConfig().appId, { query: { lang: "en_us" } }).catch(() => null);
    return { ok: true, appName: data?.app?.app_name ?? larkConfig().appId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export { LarkError };
