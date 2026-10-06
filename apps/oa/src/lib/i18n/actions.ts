"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { isLocale, LOCALE_COOKIE } from "./locales";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * เปลี่ยนภาษา — เก็บใน cookie สำหรับหน้าเว็บ
 * และเก็บลงโปรไฟล์ด้วย เพราะการ์ดแจ้งเตือนใน Lark ไม่มี cookie ให้อ่าน
 */
export async function setLocaleAction(form: FormData) {
  const raw = String(form.get("locale") ?? "");
  if (!isLocale(raw)) return;

  (await cookies()).set(LOCALE_COOKIE, raw, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  const user = await getCurrentUser();
  if (user) (await db.prepare("UPDATE users SET locale = ? WHERE id = ?").run(raw, user.id));

  revalidatePath("/", "layout");
}
