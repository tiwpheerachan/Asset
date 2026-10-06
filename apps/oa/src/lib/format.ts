import type { Locale } from "./i18n/locales";
import type { T } from "./i18n";

/** โค้ด locale ที่ Intl เข้าใจ — ไทยใช้ปฏิทินพุทธโดยปริยาย */
const INTL: Record<Locale, string> = {
  th: "th-TH",
  en: "en-GB",
  zh: "zh-CN",
};

/**
 * วันที่ของ "วันนี้" ตามเขตเวลาที่เครื่องใช้อยู่ (YYYY-MM-DD)
 *
 * ห้ามใช้ toISOString().slice(0,10) ทำงานนี้ — มันคืนวันที่ตามเวลา UTC เสมอ
 * ต่อให้ตั้ง TZ ไว้แล้วก็ตาม เอกสารที่สร้างช่วงเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย
 * จะกลายเป็นวันที่ของเมื่อวาน
 */
export function todayLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * อ่านเวลาที่เก็บเป็นข้อความในฐานข้อมูล → มิลลิวินาที (NaN ถ้าอ่านไม่ออก)
 *
 * ในระบบมีสองรูปแบบปนกันและเลี่ยงไม่ได้: คอลัมน์ที่ปล่อยให้ Postgres ใส่เองได้
 * "2026-09-10 07:56:40" (UTC ไม่มีเขตเวลาต่อท้าย) ส่วนคอลัมน์ที่โค้ดฝั่ง JS เขียน
 * ได้ "2026-09-10T07:56:40.120Z"
 *
 * เคยมีโค้ดหลายจุดเติม "Z" ต่อท้ายดื้อ ๆ ซึ่งทำให้รูปแบบที่สองกลายเป็น "...120ZZ"
 * แปลงไม่ได้ แล้วถูกข้ามไปเงียบ ๆ — ระบบเตือนงานค้างจึงไม่เคยทำงานเลย
 * ทุกจุดที่อ่านเวลาจากฐานข้อมูลต้องผ่านฟังก์ชันนี้ อย่าเติมเขตเวลาเอง
 */
export function parseDbTime(value: string | null | undefined): number {
  if (!value) return NaN;
  const s = value.trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return Date.parse(hasZone ? s : `${s.replace(" ", "T")}Z`);
}

function toDate(value: string | null | undefined, dateOnly = false): Date | null {
  if (!value) return null;
  const ms = dateOnly
    ? new Date(`${value.slice(0, 10)}T00:00:00`).getTime()
    : parseDbTime(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** "2026-08-17" → ไทย "17 สิงหาคม 2569" · EN "17 August 2026" · 中文 "2026年8月17日" */
export function formatDate(iso: string | null | undefined, locale: Locale = "th"): string {
  const d = toDate(iso, true);
  if (!d) return iso ? iso : "-";
  return new Intl.DateTimeFormat(INTL[locale], { dateStyle: "long" }).format(d);
}

/** วันที่ + เวลา แบบสั้น สำหรับบรรทัดเวลาในประวัติ */
export function formatDateTime(ts: string | null | undefined, locale: Locale = "th"): string {
  const d = toDate(ts);
  if (!d) return ts ? ts : "-";
  return new Intl.DateTimeFormat(INTL[locale], {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** เวลาอย่างเดียว "21:26" — ใช้ในไทม์ไลน์ที่บอกวันไว้ที่หัวกลุ่มแล้ว */
export function formatTime(ts: string | null | undefined, locale: Locale = "th"): string {
  const d = toDate(ts);
  if (!d) return "";
  return new Intl.DateTimeFormat(INTL[locale], { timeStyle: "short" }).format(d);
}

/** วันของรายการนั้นในรูปแบบ YYYY-MM-DD ตามเวลาเครื่อง — ใช้จัดกลุ่มไทม์ไลน์ */
export function dayKey(ts: string | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function money(n: number | null | undefined, locale: Locale = "th"): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString(INTL[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "3 วันที่ผ่านมา" / "3 days ago" / "3 天前" */
export function since(ts: string | null | undefined, t: T): string {
  const d = toDate(ts);
  if (!d) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: Math.floor(hours / 24) });
}

/** จำนวนวันที่ค้างอยู่ที่ขั้นนี้ */
export function waitingDays(ts: string | null | undefined): number {
  const d = toDate(ts);
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
