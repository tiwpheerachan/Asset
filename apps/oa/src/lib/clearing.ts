import { daysUntil } from "./leadtime";
import { todayLocal } from "./format";

/**
 * ติดตามการเคลียร์ค่าใช้จ่ายใน OA
 *
 * ที่มา: ระบบนี้ใช้ "ขออนุมัติก่อน" แล้วค่อยไปตั้งเบิกจริงใน OA ทีหลัง โดยอ้างเลข
 * Approval จากที่นี่ — ปัญหาคือพออนุมัติผ่านแล้วเรื่องก็จบในสายตาทุกคน ทั้งที่ยังมี
 * ค่าใช้จ่ายค้างที่ยังไม่ถูกบันทึกในระบบบัญชี ไม่มีใครรู้ว่าใบไหนยังไม่ได้เคลียร์
 *
 * ตั้งเป็นรายฟอร์มเพราะไม่ใช่ทุกเรื่องที่มีค่าใช้จ่ายต้องเคลียร์ — บันทึกข้อความทั่วไป
 * ไม่มีอะไรให้เคลียร์เลย
 */

export type ClearStatus =
  /** ฟอร์มนี้ไม่ได้เปิดติดตาม หรือเอกสารยังไม่อนุมัติ */
  | { state: "off" }
  /** เคลียร์แล้ว */
  | { state: "done"; oaRef: string }
  /** ยังไม่เคลียร์ ยังไม่ถึงกำหนด */
  | { state: "pending"; due: string; daysLeft: number }
  /** ยังไม่เคลียร์ และเลยกำหนดแล้ว */
  | { state: "overdue"; due: string; daysLate: number };

export type ClearFields = {
  clear_due_date: string;
  oa_ref: string;
};

/**
 * ครบกำหนดเคลียร์วันไหน
 *
 * นับจากวันที่จะเกิดค่าใช้จ่ายจริงถ้าฟอร์มมีให้กรอก ไม่ใช่จากวันอนุมัติ —
 * งานที่อนุมัติล่วงหน้าสองเดือนแล้วให้เคลียร์ภายใน 15 วันนับจากวันอนุมัติ
 * คือกำหนดที่ครบก่อนงานจะเกิดขึ้นด้วยซ้ำ ซึ่งเป็นไปไม่ได้
 * ไม่มีวันงานค่อยนับจากวันอนุมัติ
 */
export function clearDueDate(
  withinDays: number,
  approvedOn: string,
  eventDate?: string | null,
): string {
  if (!withinDays || withinDays <= 0) return "";

  const base = eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? (Date.parse(`${eventDate}T00:00:00Z`) >= Date.parse(`${approvedOn}T00:00:00Z`)
        ? eventDate
        : approvedOn)
    : approvedOn;

  const ms = Date.parse(`${base}T00:00:00Z`);
  if (!Number.isFinite(ms)) return "";
  const due = new Date(ms + withinDays * 86400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${due.getUTCFullYear()}-${p(due.getUTCMonth() + 1)}-${p(due.getUTCDate())}`;
}

export function clearStatus(r: ClearFields, today = todayLocal()): ClearStatus {
  if (!r.clear_due_date) return { state: "off" };
  if (r.oa_ref) return { state: "done", oaRef: r.oa_ref };

  const left = daysUntil(r.clear_due_date, today);
  if (left === null) return { state: "off" };
  return left >= 0
    ? { state: "pending", due: r.clear_due_date, daysLeft: left }
    : { state: "overdue", due: r.clear_due_date, daysLate: -left };
}
