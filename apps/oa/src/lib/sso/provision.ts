import "server-only";
import crypto from "node:crypto";
import { db, USER_SELECT } from "../db";
import { ssoConfig, type SsoConfig } from "./config";
import type { IdClaims } from "./oidc";
import type { Role, User } from "../types";

/** claim อาจมาเป็น string เดี่ยว, array, หรือคั่นด้วยช่องว่าง/คอมมา — รับให้หมด */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[\s,]+/).filter(Boolean);
  return [];
}

/**
 * แปลง roles จากระบบกลางเป็นสิทธิ์ในแอปนี้
 * ถ้ามีหลาย role ที่จับคู่ได้ ให้ยึดอันที่สิทธิ์สูงสุด — กันกรณีคนหนึ่งอยู่หลายกลุ่ม
 */
export function mapRole(roles: string[], cfg: SsoConfig): Role {
  const rank: Record<Role, number> = { USER: 0, MANAGER: 1, ADMIN: 2 };
  let best: Role | null = null;

  for (const raw of roles) {
    const hit = cfg.roleMap[raw.toLowerCase()];
    if (hit && (best === null || rank[hit] > rank[best])) best = hit;
  }
  return best ?? cfg.defaultRole;
}

/** ถ้าชื่อกลุ่มตรงกับแผนกที่มีอยู่ ให้ผูกให้เลย (ไม่สร้างแผนกใหม่เอง) */
async function matchDepartment(groups: string[]): Promise<number | null> {
  for (const g of groups) {
    const row = (await db
      .prepare("SELECT id FROM departments WHERE lower(name) = lower(?) AND active = 1")
      .get(g.trim())) as { id: number } | undefined;
    if (row) return row.id;
  }
  return null;
}

export type ProvisionResult = {
  user: User;
  created: boolean;
  roles: string[];
  groups: string[];
};

/**
 * สร้าง/อัปเดตผู้ใช้จากข้อมูลที่ระบบกลางส่งมา
 *
 * หลักที่ยึด: ระบบกลางเป็นเจ้าของ ตัวตน · ชื่อ · อีเมล · สิทธิ์
 * ส่วน "ตำแหน่งงาน" (ใช้ผูกสายอนุมัติ) ยังเป็นของแอปนี้ เพราะเป็นเรื่องของกระบวนการอนุมัติ
 * ไม่ใช่สิทธิ์การเข้าถึง — จึงไม่ถูกเขียนทับ
 */
export async function provisionFromClaims(
  claims: IdClaims,
  extra: Record<string, unknown> = {},
): Promise<ProvisionResult> {
  const cfg = ssoConfig();
  const merged = { ...extra, ...claims } as Record<string, unknown>;

  const sub = String(claims.sub);
  const email = String(merged.email ?? "").trim().toLowerCase();
  const name = String(merged.name ?? "").trim() || email || sub;
  const roles = toList(merged.roles);
  const groups = toList(merged.groups);
  const role = cfg.centralRoles ? mapRole(roles, cfg) : null;
  const deptId = cfg.mapGroupsToDepartment ? await matchDepartment(groups) : null;
  const now = new Date().toISOString();
  const snapshot = JSON.stringify({ roles, groups });
  // รูปโปรไฟล์จากระบบกลาง — เก็บไว้แสดงในบันทึกการอนุมัติ ให้รู้ว่าใครอนุมัติด้วยหน้าตา
  // ไม่ใช่แค่ชื่อ · ว่างเมื่อไหร่ก็ตกกลับไปใช้วงกลมตัวอักษรเหมือนเดิม
  const avatar = String(merged.picture ?? merged.avatar_url ?? "").trim().slice(0, 500);

  // หาผู้ใช้เดิม: ยึด sub ก่อน แล้วค่อยลองอีเมล (กรณีเคยมีบัญชีในแอปอยู่แล้ว)
  const bySub = (await db.prepare(`${USER_SELECT} WHERE u.sso_sub = ?`).get(sub)) as User | undefined;
  const byEmail = !bySub && email
    ? ((await db.prepare(`${USER_SELECT} WHERE u.email = ?`).get(email)) as User | undefined)
    : undefined;
  const existing = bySub ?? byEmail;

  if (existing) {
    await db.prepare(
      `UPDATE users
          SET sso_sub = ?, sso_roles = ?, sso_synced_at = ?,
              name = ?, ${avatar ? "avatar_url = ?," : ""}${email ? "email = ?," : ""}
              ${role ? "role = ?," : ""}
              ${deptId ? "department_id = ?," : ""}
              active = 1
        WHERE id = ?`,
    ).run(
      ...[
        sub, snapshot, now, name,
        ...(avatar ? [avatar] : []),
        ...(email ? [email] : []),
        ...(role ? [role] : []),
        ...(deptId ? [deptId] : []),
        existing.id,
      ],
    );
    const user = (await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(existing.id)) as User;
    return { user, created: false, roles, groups };
  }

  // ผู้ใช้ใหม่ — ไม่มีรหัสผ่านในแอปนี้ ล็อกอินผ่านระบบกลางอย่างเดียว
  const info = (await db
    .prepare(
      `INSERT INTO users (email, password, name, department_id, role, active, sso_sub, sso_roles, sso_synced_at, avatar_url)
       VALUES (?,?,?,?,?,1,?,?,?,?)`,
    )
    .run(
      email || `${sub}@sso.local`,
      `sso$${crypto.randomBytes(16).toString("hex")}`, // ค่าที่ verifyPassword ไม่มีทางผ่าน
      name,
      deptId,
      role ?? cfg.defaultRole,
      sub,
      snapshot,
      now,
      avatar,
    ));

  const user = (await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(Number(info.lastInsertRowid))) as User;
  return { user, created: true, roles, groups };
}
