import "server-only";

/**
 * แกนกลางเรียก Feishu Open API — ใช้ร่วมกันระหว่างโมดูลที่ต่อกับแอป feishu.cn
 * ตัวเดียวกัน (อ่าน Base + Lark Approval). แยกจาก lark/client.ts ซึ่งเป็นแอป
 * แจ้งเตือน (อาจอยู่คลาวด์สากล larksuite)
 *
 * แอปนี้คือ "OA Base Reader" (feishu.cn) — ตั้งค่าใน env ชุด FEISHU_BASE_*
 */

export type FeishuConfig = { appId: string; appSecret: string; domain: string };

export function feishuConfig(): FeishuConfig {
  return {
    appId: process.env.FEISHU_BASE_APP_ID?.trim() ?? "",
    appSecret: process.env.FEISHU_BASE_APP_SECRET?.trim() ?? "",
    domain: (process.env.FEISHU_BASE_DOMAIN?.trim() || "https://open.feishu.cn").replace(/\/$/, ""),
  };
}

export function feishuReady(cfg = feishuConfig()): boolean {
  return Boolean(cfg.appId && cfg.appSecret);
}

export type FeishuResponse<T = unknown> = { code: number; msg: string; data?: T };

export class FeishuError extends Error {
  constructor(public code: number, msg: string) {
    super(`Feishu API ${code}: ${msg}`);
  }
}

/* ---------- tenant access token (แคชไว้จนใกล้หมดอายุ) ---------- */

let cached: { token: string; expiresAt: number } | null = null;

export async function feishuToken(): Promise<string> {
  const cfg = feishuConfig();
  if (!feishuReady(cfg)) throw new Error("ยังไม่ได้ตั้งค่า FEISHU_BASE_APP_ID / FEISHU_BASE_APP_SECRET");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`${cfg.domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
    cache: "no-store",
  });
  const json = (await res.json()) as FeishuResponse & { tenant_access_token?: string; expire?: number };
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new FeishuError(json.code, json.msg || "ขอ tenant_access_token ไม่สำเร็จ");
  }
  cached = { token: json.tenant_access_token, expiresAt: Date.now() + (json.expire ?? 7200) * 1000 };
  return cached.token;
}

/** เรียก Open API พร้อมแนบ token ให้อัตโนมัติ */
export async function feishuCall<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const cfg = feishuConfig();
  const token = await feishuToken();
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
  const json = (await res.json()) as FeishuResponse<T>;
  if (json.code !== 0) throw new FeishuError(json.code, json.msg);
  return json.data as T;
}
