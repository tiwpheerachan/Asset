import "server-only";
import { db, USER_SELECT } from "../db";
import type { Role, User } from "../types";
import { atLeast, type Effective } from "./authz";

/**
 * แปลงสิทธิ์จากระบบกลางเป็นบทบาทในแอปนี้
 *
 * แอปนี้มีบทบาทสามระดับมาแต่เดิม และตรรกะการมองเห็นเอกสารทั้งระบบผูกกับมัน
 * การแปลงจึงตรงไปตรงมากว่าการรื้อทุกจุดให้ไปถาม resource ทีละที่ และย้อนกลับได้ทันที
 * ด้วยการปิดสวิตช์ — สิ่งที่ระบบกลางคุมคือ "ใครได้บทบาทไหน" ซึ่งเป็นคำถามที่แอดมิน
 * ต้องตัดสินใจจริง ส่วนบทบาทแปลว่าอะไร ยังเป็นเรื่องของแอป
 *
 *   ADMIN    จัดการผู้ใช้ในแอปได้ (resource users ถึงระดับ manage)
 *   MANAGER  เห็นคำขอทั้งแผนกของตน (capability team.view)
 *   USER     ที่เหลือ
 */
export function roleFromPerms(perms: Effective): Role {
  const usersLevel = perms.resources.users ?? perms.base_level;
  if (atLeast(usersLevel, "manage")) return "ADMIN";
  if (perms.capabilities.includes("team.view")) return "MANAGER";
  return "USER";
}

/**
 * เขียนบทบาทที่ระบบกลางตัดสินลงผู้ใช้คนนี้
 *
 * คืนค่าเดิมถ้าไม่มีอะไรเปลี่ยน เพื่อให้ผู้เรียกรู้ว่าต้องบันทึกลง log ไหม
 */
export async function applyCentralRole(user: User, perms: Effective): Promise<{ user: User; changed: boolean }> {
  const role = roleFromPerms(perms);
  if (role === user.role) return { user, changed: false };

  await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
  const fresh = (await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(user.id)) as User;
  return { user: fresh, changed: true };
}
