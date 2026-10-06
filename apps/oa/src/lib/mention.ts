import type { Field } from "./types";
import type { FormValues } from "./form";

/**
 * คนที่ถูกระบุชื่อไว้ในฟอร์ม (ช่องชนิด "เลือกบุคคล")
 *
 * ที่มา: ฟอร์มจริงมีช่องอย่าง "เรียนแจ้ง (ATTENTION)" และ "สำเนาเรียน (CC)" ที่ระบุตัวคนไว้
 * แต่ระบบไม่เคยแจ้งคนเหล่านั้นเลย — เขาจะรู้ตัวก็ต่อเมื่อมีคนไปบอกด้วยปากหรือส่งลิงก์ให้
 * ซึ่งแปลว่าการกรอกชื่อลงช่องนั้นไม่ได้ทำให้อะไรเกิดขึ้นจริง เป็นแค่ข้อความในเอกสาร
 *
 * คนละเรื่องกับ "ขั้นสำเนาถึง" ในสายอนุมัติ — อันนั้นผู้ดูแลตั้งไว้ล่วงหน้าว่าใครจะได้รับ
 * ทุกใบ ส่วนอันนี้คนกรอกเป็นคนเลือกเองเป็นราย ๆ ตามเนื้องาน
 */
export type Mention = { userId: number; fieldLabel: string };

/**
 * ไล่เก็บคนที่ถูกระบุในฟอร์ม
 *
 * คนเดียวถูกระบุได้หลายช่อง — เก็บช่องแรกที่เจอพอ เพราะปลายทางคือแจ้งเตือนหนึ่งครั้ง
 * ไม่ใช่แจ้งซ้ำตามจำนวนช่องที่มีชื่อเขาอยู่
 */
export function mentionsIn(fields: Field[], values: FormValues): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<number>();

  for (const f of fields) {
    if (f.type !== "USER" || f.active !== 1) continue;
    const id = Number(values[f.field_key]);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ userId: id, fieldLabel: f.label });
  }
  return out;
}

/**
 * ตัดคนที่จะได้รับแจ้งเตือนจากทางอื่นอยู่แล้วออก
 *
 * ผู้จัดทำรู้อยู่แล้วว่าตัวเองกรอกอะไรไป ส่วนคนที่อยู่ในสายอนุมัติจะได้การ์ด "ถึงคิวคุณ"
 * หรือ "สำเนาถึง" ของตัวเองอยู่แล้ว — ส่งซ้ำอีกใบทำให้คนเริ่มมองข้ามการแจ้งเตือนทั้งหมด
 */
export function mentionsToNotify(
  mentions: Mention[],
  requesterId: number,
  alreadyNotified: number[],
): Mention[] {
  const skip = new Set([requesterId, ...alreadyNotified]);
  return mentions.filter((m) => !skip.has(m.userId));
}
