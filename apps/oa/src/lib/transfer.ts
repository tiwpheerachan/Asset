import "server-only";
import { db } from "./db";
import { currentStepApprovers, getRequest, getUser, logAudit } from "./queries";
import { enqueue } from "./lark/notify";
import type { User } from "./types";

/**
 * ถ่ายโอนคิวอนุมัติของตัวเองให้คนอื่น
 *
 * แยกออกมาจาก server action เพราะตอนนี้มีสองทางเข้า — หน้าเว็บกับปุ่มบนการ์ด Lark
 * ถ้าปล่อยให้ตรรกะอยู่ในตัว action ทางที่สองจะต้องคัดลอกกฎทั้งชุดไปเขียนซ้ำ
 * แล้ววันหนึ่งกฎจะเพี้ยนกันจนสองทางให้ผลไม่เหมือนกัน ซึ่งเป็นบั๊กที่หายากมาก
 */
export type TransferReason =
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "NO_TARGET"
  | "SELF"
  | "REQUESTER"
  | "NOT_YOUR_TURN"
  | "ALREADY_IN_STEP";

export type TransferResult =
  | { ok: true; targetName: string }
  | { ok: false; reason: TransferReason };

export async function transferQueue({
  user,
  requestId,
  toId,
  note = "",
}: {
  user: User;
  requestId: number;
  toId: number;
  note?: string;
}): Promise<TransferResult> {
  const req = await getRequest(requestId);
  if (!req) return { ok: false, reason: "NOT_FOUND" };
  if (req.status !== "PENDING") return { ok: false, reason: "NOT_PENDING" };

  const target = await getUser(toId);
  if (!target || !target.active) return { ok: false, reason: "NO_TARGET" };
  if (target.id === user.id) return { ok: false, reason: "SELF" };
  // ผู้จัดทำอนุมัติเอกสารตัวเองในฐานะผู้รับโอนไม่ได้ — เป็นการเลี่ยงสายอนุมัติทั้งสาย
  if (target.id === req.requester_id) return { ok: false, reason: "REQUESTER" };

  const rows = (await currentStepApprovers(requestId, req.stage, req.current_step));
  const mine = rows.find((r) => r.user_id === user.id && r.status === "PENDING");
  if (!mine) return { ok: false, reason: "NOT_YOUR_TURN" };
  // ถ้าผู้รับโอนอยู่ในขั้นนี้อยู่แล้ว การโอนจะทำให้คนคนเดียวถือสองคิวในขั้นเดียวกัน
  if (rows.some((r) => r.user_id === target.id)) {
    return { ok: false, reason: "ALREADY_IN_STEP" };
  }

  await db.prepare(
    "UPDATE request_approvers SET user_id=?, from_user=?, title=?, job_role='' WHERE id=?",
  ).run(target.id, user.id, target.position || mine.title, mine.id);

  (await logAudit(
    requestId,
    user.id,
    "TRANSFER",
    `ถ่ายโอนให้ ${target.name}${note ? ` — ${note}` : ""}`,
    req.amount,
  ));
  (await enqueue(requestId, target.id, "APPROVAL_REQUEST", {
    approverRowId: mine.id,
    stepName: mine.node_name || mine.title,
  }));

  return { ok: true, targetName: target.name };
}

/**
 * คีย์ข้อความบอกเหตุที่โอนไม่ได้
 *
 * เก็บเป็นคีย์ ไม่ใช่ข้อความไทยสำเร็จรูป เพราะปุ่มบนการ์ด Lark ตอบกลับเป็นภาษาของ
 * ผู้กด ซึ่งอาจเป็นอังกฤษหรือจีน — ถ้าฝังภาษาไทยไว้ที่นี่ คนใช้ภาษาอื่นจะได้ข้อความไทย
 */
export const TRANSFER_ERROR: Record<TransferReason, string> = {
  NOT_FOUND: "lark.err.notFound",
  NOT_PENDING: "transfer.err.notPending",
  NO_TARGET: "transfer.err.noTarget",
  SELF: "transfer.err.self",
  REQUESTER: "transfer.err.requester",
  NOT_YOUR_TURN: "lark.err.notYourTurn",
  ALREADY_IN_STEP: "transfer.err.alreadyInStep",
};
