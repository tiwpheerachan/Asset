import { todayLocal } from "./format";
import type { LeadMode } from "./types";

/**
 * ตรวจว่ายื่นล่วงหน้าพอไหม
 *
 * ที่มา: ค่าใช้จ่ายที่ต้องเตรียมของล่วงหน้า (จัดงาน ออกบูธ) ถ้าอนุมัติวันนี้เพื่อใช้เงิน
 * พรุ่งนี้ ผู้อนุมัติไม่มีเวลาพิจารณาจริงและฝ่ายจัดซื้อเตรียมไม่ทัน — กติกาว่าต้องล่วงหน้า
 * กี่วันจึงเป็นเรื่องของกระบวนการ ไม่ใช่ความสุภาพ
 *
 * ตั้งเป็นรายฟอร์มเพราะแต่ละงานต่างกันจริง — จัดงานต้องล่วงหน้าเป็นสัปดาห์
 * แต่เบิกค่าเดินทางที่จ่ายไปแล้วไม่มีอะไรให้ล่วงหน้า
 */

export type LeadRule = {
  /** 0 = ไม่บังคับ */
  lead_days: number;
  lead_urgent_days: number;
  lead_mode: LeadMode;
};

export type LeadCheck =
  /** ฟอร์มนี้ไม่ได้ตั้งกติกา หรือไม่มีวันที่ให้นับ */
  | { state: "off" }
  /** ทันกำหนดปกติ */
  | { state: "ok"; daysAhead: number }
  /** ไม่ทันปกติแต่ยังอยู่ในช่วงด่วน — ส่งได้ถ้ากรอกเหตุผล */
  | { state: "urgent"; daysAhead: number; need: number }
  /** ต่ำกว่าช่วงด่วน — ตามกติกาของฟอร์ม (เตือน หรือ ห้ามส่ง) */
  | { state: "late"; daysAhead: number; need: number; mode: LeadMode };

/**
 * นับจำนวนวันจากวันนี้ถึงวันที่กำหนด
 *
 * เทียบเป็น "วัน" ไม่ใช่มิลลิวินาที — ยื่น 23:00 วันนี้เพื่อใช้เงินพรุ่งนี้ 09:00
 * ต้องนับเป็น 1 วัน ไม่ใช่ 0 วัน เพราะคนคิดเป็นวันปฏิทิน ไม่ได้คิดเป็นชั่วโมง
 */
export function daysUntil(dateStr: string, today = todayLocal()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400_000);
}

export function checkLeadTime(
  rule: LeadRule,
  eventDate: string | null | undefined,
  today = todayLocal(),
): LeadCheck {
  if (!rule.lead_days || rule.lead_days <= 0) return { state: "off" };
  if (!eventDate) return { state: "off" };

  const daysAhead = daysUntil(eventDate, today);
  if (daysAhead === null) return { state: "off" };

  if (daysAhead >= rule.lead_days) return { state: "ok", daysAhead };

  // ช่วงด่วนต้องน้อยกว่าช่วงปกติจึงจะมีความหมาย ถ้าตั้งมาไม่สมเหตุสมผลให้ถือว่าไม่มีช่วงด่วน
  const urgent = rule.lead_urgent_days > 0 && rule.lead_urgent_days < rule.lead_days
    ? rule.lead_urgent_days
    : 0;

  if (urgent && daysAhead >= urgent) {
    return { state: "urgent", daysAhead, need: rule.lead_days };
  }
  return { state: "late", daysAhead, need: urgent || rule.lead_days, mode: rule.lead_mode };
}

/** ต้องกรอกเหตุผลความเร่งด่วนไหม */
export function needsUrgentReason(check: LeadCheck): boolean {
  return check.state === "urgent" || (check.state === "late" && check.mode === "WARN");
}

/** ส่งไม่ได้เลยไหม */
export function blocksSubmit(check: LeadCheck): boolean {
  return check.state === "late" && check.mode === "BLOCK";
}

/** บอกให้ครบว่ายื่นล่วงหน้ากี่วัน ต้องกี่วัน และตอนนี้ขาดไปเท่าไหร่ */
export function leadBlockMessage(c: LeadCheck): string {
  if (c.state !== "late") return "ยื่นไม่ทันกำหนดล่วงหน้า";
  return c.daysAhead < 0
    ? `วันที่ระบุผ่านมาแล้ว ${-c.daysAhead} วัน — ฟอร์มนี้ต้องยื่นล่วงหน้าอย่างน้อย ${c.need} วัน`
    : `เหลืออีก ${c.daysAhead} วัน — ฟอร์มนี้ต้องยื่นล่วงหน้าอย่างน้อย ${c.need} วัน`;
}

export function leadReasonMessage(c: LeadCheck): string {
  const ahead = c.state === "urgent" || c.state === "late" ? c.daysAhead : 0;
  const need = c.state === "urgent" || c.state === "late" ? c.need : 0;
  return `เหลืออีก ${ahead} วัน น้อยกว่ากำหนด ${need} วัน — กรุณาระบุเหตุผลที่ต้องยื่นด่วน`;
}
