import type { RequestStatus } from "./types";

/**
 * การเบิกงวดจากใบอนุมัติหลัก
 *
 * ที่มา: ใบอนุมัติหลัก (เช่น trade term ของลูกค้ารายหนึ่ง) อนุมัติวงเงินก้อนเดียว
 * แล้วทยอยออกใบลดหนี้ทีละงวดโดยอ้างถึงใบหลัก ระบบเดิมเก็บแค่ "ลิงก์" — เปิดใบหลัก
 * แล้วเห็นว่ามีลูกกี่ใบ แต่ตอบไม่ได้ว่า *เบิกไปแล้วเท่าไร เหลือเท่าไร ครบงวดหรือยัง*
 * คนทำงานจึงต้องเปิดทีละใบมาบวกเอง ซึ่งพอพลาดก็คือเบิกเกินวงเงินที่อนุมัติไว้
 *
 * แยก "ใช้แล้ว" กับ "จองไว้" ออกจากกัน เพราะใบที่ยังรออนุมัติยังไม่ใช่เงินที่จ่ายจริง
 * แต่ก็กันวงเงินไว้แล้ว ถ้าไม่นับรวม สองคนยื่นพร้อมกันก็เบิกทะลุวงเงินได้ทั้งคู่
 */

/** สถานะที่ถือว่ากินวงเงินของใบหลักไปแล้วจริง */
const USED: RequestStatus[] = ["APPROVED"];
/** สถานะที่ยังไม่จบแต่กันวงเงินไว้ */
const RESERVED: RequestStatus[] = ["PENDING", "PRELIM_APPROVED"];

export type DrawChild = {
  id: number;
  status: RequestStatus;
  amount: number | null;
};

export type Drawdown = {
  /** วงเงินของใบหลัก — null = ใบหลักไม่ได้ระบุวงเงิน จึงไม่มีเพดานให้ตรวจ */
  budget: number | null;
  /** จำนวนงวดที่ตั้งไว้บนใบหลัก — null = ไม่ได้ตั้ง */
  periods: number | null;
  used: number;
  reserved: number;
  /** ใช้แล้ว + จองไว้ = ยอดที่ผูกไว้กับใบหลักทั้งหมด */
  committed: number;
  /** เหลือให้เบิกอีกเท่าไร — null เมื่อใบหลักไม่ได้ระบุวงเงิน */
  remaining: number | null;
  usedCount: number;
  reservedCount: number;
  /** จำนวนงวดที่ออกไปแล้ว (นับทั้งที่อนุมัติแล้วและที่ยังค้าง) */
  count: number;
  /** ครบจำนวนงวดที่ตั้งไว้แล้วหรือยัง */
  full: boolean;
  /** เบิกทะลุวงเงินไปแล้ว */
  over: boolean;
};

const sum = (rows: DrawChild[]) => rows.reduce((n, r) => n + (r.amount ?? 0), 0);

export function drawdown(
  budget: number | null,
  periods: number | null,
  children: DrawChild[],
): Drawdown {
  const usedRows = children.filter((c) => USED.includes(c.status));
  const resRows = children.filter((c) => RESERVED.includes(c.status));
  const used = sum(usedRows);
  const reserved = sum(resRows);
  const committed = used + reserved;
  const count = usedRows.length + resRows.length;

  return {
    budget,
    periods,
    used,
    reserved,
    committed,
    remaining: budget === null ? null : budget - committed,
    usedCount: usedRows.length,
    reservedCount: resRows.length,
    count,
    full: periods !== null && periods > 0 && count >= periods,
    over: budget !== null && committed > budget,
  };
}

/**
 * ยื่นใบนี้แล้วจะทะลุวงเงินของใบหลักไปเท่าไร (null = ไม่ทะลุ)
 *
 * รับ drawdown ที่ "ไม่รวมใบที่กำลังยื่น" มาแล้ว — ไม่งั้นตอนแก้ใบเดิมแล้วยื่นซ้ำ
 * ยอดของตัวเองจะถูกนับสองรอบ กลายเป็นว่าแก้ตัวเลขไม่ได้เลยทั้งที่ไม่ได้เพิ่มอะไร
 */
export function overBudgetBy(d: Drawdown, amount: number | null): number | null {
  if (d.budget === null || d.remaining === null) return null;
  const over = (amount ?? 0) - d.remaining;
  return over > 0 ? over : null;
}
