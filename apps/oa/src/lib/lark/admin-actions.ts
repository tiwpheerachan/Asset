"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../auth";
import { listActiveUsers } from "../queries";
import { larkConfig, larkReady } from "./config";
import { resolveLarkIds, sendCard, testConnection } from "./client";
import { testCard } from "./card";
import { flush } from "./notify";
import { isLocale } from "../i18n/locales";
import { mailConfig, mailReady, sendMail } from "../mail";

export type IntegrationState = { error?: string; ok?: string };

/** ทดสอบว่าตั้งค่าถูกไหม แล้วส่งการ์ดทดสอบไปหาตัวผู้กดเอง */
export async function testLarkAction(): Promise<IntegrationState> {
  const admin = await requireAdmin();
  if (!larkReady()) return { error: "ยังไม่ได้ตั้งค่า LARK_APP_ID / LARK_APP_SECRET" };

  const conn = await testConnection();
  if (!conn.ok) return { error: conn.error };

  try {
    const ids = await resolveLarkIds([admin]);
    const openId = ids.get(admin.id);
    if (!openId) {
      return { error: `เชื่อมต่อ Lark ได้ แต่ไม่พบบัญชี Lark ของอีเมล ${admin.email}` };
    }
    const locale = isLocale(admin.locale) ? admin.locale : larkConfig().fallbackLocale;
    await sendCard(openId, testCard(locale));
  } catch (e) {
    return { error: `เชื่อมต่อได้ แต่ส่งข้อความไม่สำเร็จ: ${(e as Error).message}` };
  }

  revalidatePath("/admin/integrations");
  return { ok: `เชื่อมต่อกับ ${conn.appName} สำเร็จ — ส่งการ์ดทดสอบไปที่ Lark ของคุณแล้ว` };
}

/** ค้นหา open_id ของผู้ใช้ทุกคนจากอีเมล แล้วเก็บไว้ */
export async function syncLarkIdsAction(): Promise<IntegrationState> {
  await requireAdmin();
  if (!larkReady()) return { error: "ยังไม่ได้ตั้งค่า LARK_APP_ID / LARK_APP_SECRET" };

  const users = await listActiveUsers();
  try {
    const ids = await resolveLarkIds((await users));
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/users");
    return { ok: `จับคู่ได้ ${ids.size} คน จากผู้ใช้ทั้งหมด ${users.length} คน` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * ส่งอีเมลทดสอบไปหาตัวผู้ดูแลเอง
 *
 * ที่มา: หน้านี้บอกได้แค่ว่า "ตั้งตัวแปรครบหรือยัง" ซึ่งไม่เท่ากับ "ส่งได้จริงไหม" —
 * รหัสผิด เซิร์ฟเวอร์ปฏิเสธ หรือกล่องต้นทางไม่มีสิทธิ์ส่ง ล้วนตั้งครบแต่ส่งไม่ออก
 * เดิมกว่าจะรู้ก็ตอนมีคนถามว่าทำไมไม่ได้รับแจ้งเตือน ซึ่งอาจเป็นหลายวันให้หลัง
 *
 * คืนข้อความ error ดิบจาก SMTP มาให้เห็นเลย เพราะตอนตั้งค่าครั้งแรก
 * ข้อความจริงจากเซิร์ฟเวอร์คือสิ่งเดียวที่บอกได้ว่าติดตรงไหน
 */
export async function testMailAction(): Promise<IntegrationState> {
  const admin = await requireAdmin();
  if (!mailReady()) return { error: "ยังไม่ได้ตั้งค่า SMTP_HOST / SMTP_FROM" };

  const cfg = mailConfig();
  try {
    await sendMail(
      admin.email,
      "ทดสอบการแจ้งเตือน — ระบบขออนุมัติภายใน",
      `ถ้าอ่านข้อความนี้ได้ แปลว่าการส่งอีเมลจากระบบใช้งานได้แล้ว\n\nส่งจาก ${cfg.host}:${cfg.port} โดย ${cfg.from}`,
    );
  } catch (e) {
    return { error: `ส่งไม่สำเร็จ — ${(e as Error).message}` };
  }

  revalidatePath("/admin/integrations");
  return { ok: `ส่งอีเมลทดสอบไปที่ ${admin.email} แล้ว — ลองเช็คกล่องขาเข้าและโฟลเดอร์สแปม` };
}

/** ยิงคิวที่ค้างอยู่ใหม่ */
export async function retryQueueAction(): Promise<IntegrationState> {
  await requireAdmin();
  const { sent, failed } = await flush(100);
  revalidatePath("/admin/integrations");
  return { ok: `ส่งสำเร็จ ${sent} · ล้มเหลว ${failed}` };
}
