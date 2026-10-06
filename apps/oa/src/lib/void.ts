import "server-only";
import { db } from "./db";
import { getRequest, listReferencing, logAudit } from "./queries";
import type { User } from "./types";

/**
 * ยกเลิกเอกสารที่อนุมัติไปแล้ว
 *
 * ที่มา: เดิมอนุมัติแล้วคือจบ ยกเลิกไม่ได้เลย ซึ่งถูกในแง่ที่ว่าบันทึกการอนุมัติต้อง
 * เชื่อถือได้ แต่ในชีวิตจริงมีทั้งยื่นผิดใบ ยื่นซ้ำ และดีลที่ล้มหลังอนุมัติ —
 * พอยกเลิกไม่ได้ เอกสารผิดก็ค้างในระบบตลอดไป แล้วคนก็เลิกเชื่อรายการที่เห็น
 *
 * ไม่ลบแถวและไม่แตะประวัติการอนุมัติเดิม — เปลี่ยนสถานะเป็นยกเลิกแล้วต่อเหตุผลไว้
 * ในประวัติ แบบเดียวกับ void ในระบบบัญชี · ย้อนดูภายหลังยังเห็นครบว่าใครอนุมัติอะไรไว้
 * ก่อนหน้า และใครยกเลิกด้วยเหตุผลอะไร
 *
 * แยกจาก actions.ts เพราะไฟล์นั้นเป็น server action ล้วน เทสต์ไม่ได้ —
 * และกติกาการกันตรงนี้คือส่วนที่พังแล้วเจ็บที่สุด จึงต้องมีเทสต์คุม
 */
export type VoidResult = { error: string } | { ok: true };

export async function voidApproved(id: number, reason: string, user: User): Promise<VoidResult> {
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.status !== "APPROVED") return { error: "ใช้ได้เฉพาะเอกสารที่อนุมัติแล้ว" };
  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ยกเลิก" };

  // เลขที่ออกไปแล้วอยู่ในสมุดบัญชี — ต้องยกเลิกที่ตัวเลขก่อน ไม่ใช่ถอนใบต้นเรื่องเงียบๆ
  const issued = (await db
    .prepare("SELECT COUNT(*) AS n FROM issued_documents WHERE request_id = ? AND void = 0")
    .get(id)) as { n: number };
  if (issued.n > 0) {
    return { error: `ใบนี้ออกเลขที่เอกสารไปแล้ว ${issued.n} ฉบับ — ยกเลิกเลขที่เหล่านั้นก่อน` };
  }

  // ยกเลิกใบหลักทิ้งไว้เฉยๆ จะเหลือใบลูกที่ชี้ไปหาเงื่อนไขซึ่งถูกยกเลิกแล้ว
  // โดยไม่มีอะไรบอก — ใบที่ถูกยกเลิก/ตีกลับไปแล้วไม่นับ เพราะไม่มีผลอะไรต่อ
  //
  // listReferencing กรองตามสิทธิ์การมองเห็นของ user — ผู้เรียกจึงต้องเป็น ADMIN เท่านั้น
  // (ดู voidApprovedAction) ไม่งั้นใบลูกที่คนเรียกไม่มีสิทธิ์เห็นจะหลุดการตรวจนี้ไป
  const children = (await listReferencing(user, id)).filter(
    (r) => r.status !== "CANCELLED" && r.status !== "REJECTED",
  );
  if (children.length > 0) {
    const names = children.slice(0, 3).map((r) => r.doc_no).join(", ");
    const more = children.length > 3 ? ` และอีก ${children.length - 3} ใบ` : "";
    return { error: `ยังมีเอกสารที่อ้างอิงใบนี้อยู่ (${names}${more}) — จัดการใบเหล่านั้นก่อน` };
  }

  await db.prepare(
    "UPDATE requests SET status='CANCELLED', closed_at=?, updated_at=utc_now_text() WHERE id=?",
  ).run(new Date().toISOString(), id);
  (await logAudit(id, user.id, "VOID_APPROVED", reason.trim(), req.amount));
  return { ok: true };
}
