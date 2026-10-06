import "server-only";
import nodemailer from "nodemailer";

/**
 * ส่งอีเมลแจ้งเตือน
 *
 * ที่มา: คิวแจ้งเตือนมีมาตั้งแต่ต้น แต่ส่งออกได้ทาง Lark ทางเดียว — พอยังไม่ได้ใส่
 * credential ของ Lark ก็เท่ากับไม่มีการแจ้งเตือนเลย คนต้องเปิดเว็บมาเช็คเอง
 * ซึ่งเป็นเหตุผลใหญ่ที่ระบบอนุมัติถูกลืม
 *
 * เพิ่มอีเมลเป็นช่องทางสำรอง ไม่ได้มาแทน Lark — ตั้ง Lark เมื่อไหร่ Lark ชนะเสมอ
 * เพราะการ์ดในแชทกดอนุมัติได้เลย ส่วนอีเมลทำได้แค่พาเข้าเว็บ
 *
 * ใช้ nodemailer แทนการเขียน SMTP เอง ต่างจากที่โปรเจกต์นี้ทำกับ OIDC —
 * เพราะ SMTP จริงมีทั้ง STARTTLS, AUTH หลายแบบ และการเข้ารหัสหัวข้อภาษาไทย
 * ซึ่งเขียนเองแล้วพังเงียบๆ ได้ง่ายมาก และพังแบบที่ไม่มีใครรู้จนกว่าจะมีคนถามหาอีเมล
 */

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function mailConfig(): MailConfig {
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: Number.isFinite(port) ? port : 587,
    // 465 = TLS ตั้งแต่เชื่อมต่อ · 587 = ต่อธรรมดาแล้วยกระดับด้วย STARTTLS
    secure: (process.env.SMTP_SECURE ?? "").trim() === "true" || port === 465,
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "",
  };
}

/** ตั้งค่าครบพอที่จะส่งจริงไหม */
export function mailReady(cfg = mailConfig()): boolean {
  return Boolean(cfg.host && cfg.from);
}

let cached: nodemailer.Transporter | null = null;
let cachedKey = "";

function transporter(cfg: MailConfig): nodemailer.Transporter {
  // ใช้ตัวเดิมซ้ำเพื่อไม่ต้องเปิดการเชื่อมต่อใหม่ทุกฉบับ แต่สร้างใหม่ถ้าค่าตั้งเปลี่ยน
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (cached && cachedKey === key) return cached;
  cached = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  cachedKey = key;
  return cached;
}

/**
 * ส่งอีเมลหนึ่งฉบับ — โยน error ออกไปให้ผู้เรียกจัดการ
 * ตัวเรียกคือคิวแจ้งเตือนซึ่งนับ attempts และลองใหม่ให้อยู่แล้ว
 */
export async function sendMail(to: string, subject: string, text: string, link?: string) {
  const cfg = mailConfig();
  if (!mailReady(cfg)) throw new Error("ยังไม่ได้ตั้งค่า SMTP");

  await transporter(cfg).sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    // HTML แบบเรียบที่สุด — ปุ่มเดียวพาเข้าเว็บ ไม่ต้องสวย ต้องอ่านออกในทุกโปรแกรมอ่านเมล
    html: link
      ? `<div style="font-family:sans-serif;line-height:1.6">
           <p style="white-space:pre-line">${escapeHtml(text.replace(link, "").trim())}</p>
           <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#5b5bd6;color:#fff;border-radius:8px;text-decoration:none">เปิดในระบบ</a></p>
         </div>`
      : undefined,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
