import "server-only";
import type { Role } from "../types";

/**
 * เชื่อมกับ Central Login (OIDC)
 *
 * แนวคิด: ระบบกลางเป็นเจ้าของ "ตัวตน" และ "สิทธิ์" — แอปนี้ไม่ตัดสินใจเอง
 * ทุกครั้งที่ล็อกอิน สิทธิ์จะถูกเขียนทับจาก claim `roles` ที่ระบบกลางส่งมา
 */
export type SsoConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** URL ของระบบนี้ ใช้ประกอบ redirect_uri ที่ต้องไปลงทะเบียนที่ระบบกลาง */
  baseUrl: string;
  scopes: string;
  /** ระบบกลางคุมสิทธิ์ = แอปนี้แก้สิทธิ์เองไม่ได้ */
  centralRoles: boolean;
  /** ยังให้ล็อกอินด้วยรหัสผ่านในแอปได้ไหม (เผื่อ SSO ล่ม / บัญชีผู้ดูแลสำรอง) */
  allowLocalLogin: boolean;
  /** จับคู่ role ของระบบกลาง → สิทธิ์ในแอปนี้ */
  roleMap: Record<string, Role>;
  /** ถ้า role ที่ส่งมาไม่ตรงอันไหนเลย ให้เป็นสิทธิ์นี้ */
  defaultRole: Role;
  /** เอา claim groups มาจับคู่กับชื่อแผนกในระบบไหม */
  mapGroupsToDepartment: boolean;
};

/**
 * บทบาทมาตรฐานของระบบกลาง → สิทธิ์ในแอปนี้
 *
 * editor/viewer เขียนไว้ชัดว่าเป็น USER ไม่ปล่อยให้ตกไปใช้ค่าเริ่มต้น —
 * "Editor" ของระบบกลางแปลว่าแก้ข้อมูลได้ ไม่ใช่ดูแลระบบได้ ถ้าปล่อยไว้เฉยๆ
 * แล้ววันหนึ่งมีคนตั้ง SSO_DEFAULT_ROLE สูงขึ้น มันจะเลื่อนขั้นตามไปเงียบๆ
 */
const DEFAULT_ROLE_MAP: Record<string, Role> = {
  admin: "ADMIN",
  administrator: "ADMIN",
  owner: "ADMIN",
  manager: "MANAGER",
  lead: "MANAGER",
  head: "MANAGER",
  editor: "USER",
  viewer: "USER",
  user: "USER",
  member: "USER",
};

/** อ่านรูปแบบ "admin:ADMIN,hr_manager:MANAGER" จาก env */
function parseRoleMap(raw: string | undefined): Record<string, Role> {
  if (!raw?.trim()) return DEFAULT_ROLE_MAP;
  const out: Record<string, Role> = {};
  for (const pair of raw.split(",")) {
    const [from, to] = pair.split(":").map((x) => x.trim());
    if (!from || !to) continue;
    if (to === "ADMIN" || to === "MANAGER" || to === "USER") out[from.toLowerCase()] = to;
  }
  return Object.keys(out).length ? out : DEFAULT_ROLE_MAP;
}

export function ssoConfig(): SsoConfig {
  const role = process.env.SSO_DEFAULT_ROLE;
  return {
    issuer: (process.env.SSO_ISSUER?.trim() || "").replace(/\/$/, ""),
    clientId: process.env.SSO_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.SSO_CLIENT_SECRET?.trim() ?? "",
    baseUrl: (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    scopes: process.env.SSO_SCOPES?.trim() || "openid profile email",
    centralRoles: process.env.SSO_CENTRAL_ROLES !== "false",
    allowLocalLogin: process.env.SSO_ALLOW_LOCAL_LOGIN === "true",
    roleMap: parseRoleMap(process.env.SSO_ROLE_MAP),
    defaultRole: role === "ADMIN" || role === "MANAGER" ? role : "USER",
    mapGroupsToDepartment: process.env.SSO_MAP_GROUPS !== "false",
  };
}

export function ssoReady(cfg = ssoConfig()): boolean {
  return Boolean(cfg.issuer && cfg.clientId && cfg.clientSecret);
}

export const redirectUri = (cfg = ssoConfig()) => `${cfg.baseUrl}/api/auth/sso/callback`;

/** สิทธิ์ในแอปแก้เองได้ไหม — ปิดเมื่อระบบกลางเป็นคนคุม */
export function rolesAreLocal(cfg = ssoConfig()): boolean {
  return !(ssoReady(cfg) && cfg.centralRoles);
}
