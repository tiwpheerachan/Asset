import "server-only";

/**
 * ถามสิทธิ์จาก Central Login (ชั้น authz)
 *
 * แยกจากชั้นตัวตน (SSO) โดยสิ้นเชิง — ล็อกอินยังใช้ OIDC เหมือนเดิม ไฟล์นี้ตอบแค่
 * คำถามว่า "คนนี้ทำอะไรได้บ้างในแอปนี้" โดยระบบกลางเป็นคนตัดสิน
 *
 * กติกาข้อเดียวที่ครอบทุกอย่างในไฟล์นี้: แยก "ตอบว่าไม่" ออกจาก "ยังไม่ได้คำตอบ"
 * ถ้าแปล 429/5xx/เน็ตสะดุด เป็น "ไม่มีสิทธิ์" วันที่ระบบกลางสะดุดครึ่งนาที
 * ทุกคนจะโดนปฏิเสธพร้อมกันโดยไม่มีใครหาสาเหตุเจอ
 */

import { CENTRAL_CAPABILITIES, type CentralCapability } from "./schema";

export type Level = "none" | "view" | "edit" | "manage";

export type Effective = {
  hasAccess: boolean;
  roles: string[];
  base_level: Level;
  can_share: boolean;
  resources: Record<string, Level>;
  capabilities: string[];
  masked_fields: string[];
  scopes: Record<string, string[]>;
  grants_version: string;
};

/** ผลของการถาม — แยก "ไม่ได้เปิดใช้" กับ "ถามแล้วไม่ได้คำตอบ" ออกจากกัน */
export type AuthzResult =
  | { state: "off" }
  | { state: "ok"; perms: Effective; cached: false }
  | { state: "stale"; perms: Effective; cached: true }
  | { state: "unknown" }
  | { state: "misconfigured"; detail: string };

const LEVELS: Level[] = ["none", "view", "edit", "manage"];

export function atLeast(level: Level | undefined, need: Level): boolean {
  return LEVELS.indexOf(level ?? "none") >= LEVELS.indexOf(need);
}

export function centralAuthzConfig() {
  const base = (process.env.CENTRAL_DIRECTORY_URL || process.env.SSO_ISSUER || "")
    .replace(/\/+$/, "");
  // คีย์ของแอปใบเดียวใช้ได้ทั้ง /authz/* และ /directory/* — ไม่ต้องออกสองใบ
  const key = (process.env.CENTRAL_API_KEY || process.env.DIRECTORY_API_KEY || "").trim();
  return {
    base,
    key,
    /** เปิดให้ระบบกลางเป็นคนคุมสิทธิ์จริงไหม — ปิดไว้เป็นค่าเริ่มต้นโดยตั้งใจ */
    enforce: process.env.CENTRAL_AUTHZ === "true",
    ready: Boolean(base && key),
  };
}

/* ---------- แคชสิทธิ์ล่าสุดต่อผู้ใช้ ---------- */

const FRESH_MS = 15 * 60_000;
type Hit = { perms: Effective; at: number };
const cache = new Map<string, Hit>();

/** ล้างแคชของคนคนเดียว — ใช้ตอนรู้ว่าสิทธิ์เพิ่งเปลี่ยน */
export function forgetPerms(user: string) {
  cache.delete(user);
}

export function cachedPerms(user: string): Effective | null {
  const hit = cache.get(user);
  if (!hit || Date.now() - hit.at > FRESH_MS) return null;
  return hit.perms;
}

function normalise(raw: Record<string, unknown>): Effective {
  const lv = (v: unknown): Level =>
    typeof v === "string" && (LEVELS as string[]).includes(v) ? (v as Level) : "none";
  const resources: Record<string, Level> = {};
  const rawRes = (raw.resources ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawRes)) resources[k] = lv(v);

  return {
    hasAccess: raw.hasAccess !== false,
    roles: Array.isArray(raw.roles) ? (raw.roles as string[]) : [],
    base_level: lv(raw.base_level),
    can_share: raw.can_share === true,
    resources,
    capabilities: Array.isArray(raw.capabilities) ? (raw.capabilities as string[]) : [],
    masked_fields: Array.isArray(raw.masked_fields) ? (raw.masked_fields as string[]) : [],
    scopes: (raw.scopes ?? {}) as Record<string, string[]>,
    grants_version: typeof raw.grants_version === "string" ? raw.grants_version : "",
  };
}

/**
 * ดึงสิทธิ์ทั้งชุดของคนคนหนึ่ง
 *
 * user ใส่เป็น sub จาก SSO, อีเมล หรือ open_id ก็ได้ — เราส่งอีเมลเพราะเป็นค่าที่มีครบทุกคน
 * แม้คนที่ยังไม่เคยล็อกอินผ่านระบบกลาง
 */
export async function fetchEffective(user: string): Promise<AuthzResult> {
  const cfg = centralAuthzConfig();
  if (!cfg.ready) return { state: "off" };

  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/authz/effective`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user }),
      cache: "no-store",
    });
  } catch {
    // เน็ตสะดุด = ยังไม่รู้คำตอบ ไม่ใช่ไม่มีสิทธิ์
    const stale = cachedPerms(user);
    return stale ? { state: "stale", perms: stale, cached: true } : { state: "unknown" };
  }

  // ตั้งค่าผิด — ลองใหม่กี่ครั้งก็ไม่หาย ต้องให้คนไปแก้ ไม่ใช่แปลว่าผู้ใช้ไม่มีสิทธิ์
  if (res.status === 401 || res.status === 403) {
    return {
      state: "misconfigured",
      detail: `ระบบกลางปฏิเสธ API key (HTTP ${res.status}) — ตรวจ CENTRAL_API_KEY`,
    };
  }

  if (!res.ok) {
    const stale = cachedPerms(user);
    return stale ? { state: "stale", perms: stale, cached: true } : { state: "unknown" };
  }

  const perms = normalise((await res.json()) as Record<string, unknown>);
  cache.set(user, { perms, at: Date.now() });
  return { state: "ok", perms, cached: false };
}

/**
 * ทำสิ่งนี้ได้ไหม — ใช้ตอนกำลังจะเขียนข้อมูลจริง
 *
 * destructive = การกระทำที่ย้อนคืนไม่ได้ (ยกเลิกเอกสารที่ออกไปแล้ว ฯลฯ)
 * ตอนระบบกลางไม่ตอบ ของแบบนี้ต้องปฏิเสธเสมอ ต่อให้มีสิทธิ์ในแคชก็ตาม
 * เพราะแก้ผิดแล้วแก้กลับได้ ลบแล้วหายเลย ผลของการเดาผิดไม่เท่ากัน
 */
export async function mayDo(
  user: string,
  need: { resource?: string; level?: Level; capability?: CentralCapability },
  opts: { destructive?: boolean } = {},
): Promise<{ allow: boolean; degraded: boolean; reason?: string }> {
  const cfg = centralAuthzConfig();
  if (!cfg.enforce) return { allow: true, degraded: false };

  const r = await fetchEffective(user);

  if (r.state === "off") return { allow: true, degraded: false };
  if (r.state === "misconfigured") return { allow: false, degraded: true, reason: r.detail };
  if (r.state === "unknown") {
    return { allow: false, degraded: true, reason: "ระบบสิทธิ์ส่วนกลางไม่ตอบ" };
  }
  if (r.state === "stale" && opts.destructive) {
    return { allow: false, degraded: true, reason: "ระบบสิทธิ์ส่วนกลางขัดข้อง — ปิดคำสั่งที่ย้อนคืนไม่ได้ไว้ก่อน" };
  }

  return {
    allow: allowedBy(r.perms, need),
    degraded: r.state === "stale",
    reason: r.state === "stale" ? "ใช้สิทธิ์ชุดล่าสุดที่เก็บไว้" : undefined,
  };
}

/** ตัดสินจากชุดสิทธิ์ที่มีอยู่แล้ว ไม่ยิงเน็ต */
export function allowedBy(
  perms: Effective,
  need: { resource?: string; level?: Level; capability?: CentralCapability },
): boolean {
  if (!perms.hasAccess) return false;
  if (need.capability && !perms.capabilities.includes(need.capability)) return false;
  if (need.resource) {
    // resource ที่ไม่ได้ประกาศ override ไว้ ใช้ระดับพื้นฐานของบทบาท
    const level = perms.resources[need.resource] ?? perms.base_level;
    if (!atLeast(level, need.level ?? "view")) return false;
  } else if (need.level) {
    if (!atLeast(perms.base_level, need.level)) return false;
  }
  return true;
}

export { CENTRAL_CAPABILITIES };
export type { CentralCapability };
