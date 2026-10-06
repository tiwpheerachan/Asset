"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createApiKey, deleteApiKey, revokeApiKey } from "@/lib/api-keys";
import { retryDelivery, sendTestWebhook } from "@/lib/integration";
import type { ActionState } from "@/lib/actions";

/**
 * สร้างกุญแจใหม่ แล้วส่งตัวกุญแจกลับมาโชว์ครั้งเดียว
 *
 * เก็บไว้ในฐานข้อมูลเฉพาะค่าแฮช จึงเปิดดูย้อนหลังไม่ได้ — ถ้าไม่คัดลอกตอนนี้
 * ต้องสร้างใบใหม่ ซึ่งเป็นราคาที่ยอมจ่ายเพื่อให้ฐานข้อมูลที่หลุดออกไปใช้เรียก API ไม่ได้
 */
export async function createKeyAction(
  _prev: ActionState & { key?: string },
  form: FormData,
): Promise<ActionState & { key?: string }> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "ตั้งชื่อให้รู้ว่ากุญแจใบนี้ให้ระบบไหนใช้" };

  const { key } = await createApiKey(name, form.get("can_write") === "1", admin.id);
  revalidatePath("/admin/api");
  return { ok: `สร้างกุญแจสำหรับ "${name}" แล้ว`, key };
}

export async function revokeKeyAction(form: FormData) {
  await requireAdmin();
  await revokeApiKey(Number(form.get("id")));
  revalidatePath("/admin/api");
}

export async function deleteKeyAction(form: FormData) {
  await requireAdmin();
  await deleteApiKey(Number(form.get("id")));
  revalidatePath("/admin/api");
}

/**
 * ยิงข้อความทดสอบไปปลายทางเดี๋ยวนี้
 *
 * ให้คนตั้งค่ารู้ผลทันทีว่า URL กับความลับใช้ได้ไหม แทนที่จะต้องรออนุมัติเอกสารจริง
 * แล้วค่อยรู้ว่าพลาด — ซึ่งตอนนั้นเอกสารใบจริงตกหล่นไปแล้ว
 */
export async function testWebhookAction(_prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const r = await sendTestWebhook();
  revalidatePath("/admin/api");
  return r.ok
    ? { ok: `ปลายทางรับแล้ว (HTTP ${r.status})` }
    : { error: `ส่งไม่สำเร็จ: ${r.error || `HTTP ${r.status}`}` };
}

/** สั่งส่งซ้ำรายการที่ล้มเหลว หลังปลายทางแก้ปัญหาเสร็จ */
export async function retryDeliveryAction(form: FormData) {
  await requireAdmin();
  await retryDelivery(Number(form.get("id")));
  revalidatePath("/admin/api");
}
