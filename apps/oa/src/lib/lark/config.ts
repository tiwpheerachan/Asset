import "server-only";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n/locales";

/**
 * ตั้งค่าการเชื่อม Lark/Feishu ผ่าน environment variable
 * ความลับ (App Secret / Encrypt Key) ไม่เก็บในฐานข้อมูล เพื่อไม่ให้ติดไปกับไฟล์สำรอง
 *
 * Lark สากลกับ Feishu จีนเป็นคนละคลาวด์ — ต้องตั้ง LARK_DOMAIN ให้ตรงกับที่องค์กรใช้
 */
export type LarkConfig = {
  appId: string;
  appSecret: string;
  domain: string;
  /** ใช้ตรวจว่า callback มาจาก Lark จริง (ตั้งใน Developer Console) */
  verificationToken: string;
  /** ถ้าเปิดการเข้ารหัสใน Developer Console ต้องใส่คีย์นี้ด้วย */
  encryptKey: string;
  /** URL ของระบบนี้ที่เข้าถึงได้จากภายนอก — ใช้ทำปุ่ม "เปิดในระบบ" บนการ์ด */
  baseUrl: string;
  /** ภาษาของข้อความแจ้งเตือน เมื่อผู้รับยังไม่เคยเลือกภาษาในระบบ */
  fallbackLocale: Locale;
};

export function larkConfig(): LarkConfig {
  const raw = process.env.LARK_NOTIFY_LOCALE;
  return {
    appId: process.env.LARK_APP_ID?.trim() ?? "",
    appSecret: process.env.LARK_APP_SECRET?.trim() ?? "",
    domain: (process.env.LARK_DOMAIN?.trim() || "https://open.larksuite.com").replace(/\/$/, ""),
    verificationToken: process.env.LARK_VERIFICATION_TOKEN?.trim() ?? "",
    encryptKey: process.env.LARK_ENCRYPT_KEY?.trim() ?? "",
    baseUrl: (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    fallbackLocale: isLocale(raw) ? raw : DEFAULT_LOCALE,
  };
}

/** ตั้งค่าครบพอที่จะยิงข้อความออกไหม */
export function larkReady(cfg = larkConfig()): boolean {
  return Boolean(cfg.appId && cfg.appSecret);
}

/** ตั้งค่าครบพอที่จะรับปุ่มกดกลับมาจากการ์ดไหม */
export function larkCallbackReady(cfg = larkConfig()): boolean {
  return larkReady(cfg) && Boolean(cfg.verificationToken || cfg.encryptKey);
}
