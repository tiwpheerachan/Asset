import "server-only";
import { db } from "./db";
import { currentStepApprovers, getRequest, logAudit } from "./queries";
import { enqueue } from "./lark/notify";
import { canActFor, notifyTargetFor } from "./delegation";
import { enqueueWebhook } from "./integration";
import { STAGE_LABEL, type RequestWithMeta, type Stage, type User } from "./types";
import { clearDueDate } from "./clearing";
import { todayLocal } from "./format";
import { getActiveFields } from "./queries";
import { parseJson, type FormValues } from "./form";

/** วันที่จะเกิดค่าใช้จ่ายจริงของคำขอใบนี้ ('' = ฟอร์มไม่มีฟิลด์นั้น) */
async function eventDateOf(req: RequestWithMeta): Promise<string> {
  const f = (await getActiveFields(req.template_id)).find((x) => x.field_role === "EVENT_DATE");
  if (!f) return "";
  return String(parseJson<FormValues>(req.data, {})[f.field_key] ?? "");
}

const now = () => new Date().toISOString();

/**
 * แกนกลางของการเดินเอกสาร — ใช้ร่วมกันระหว่างหน้าเว็บกับปุ่มบนการ์ด Lark
 * ทั้งสองทางต้องได้ผลเหมือนกันเป๊ะ จึงห้ามมีตรรกะการอนุมัติซ้ำที่อื่น
 */

/**
 * หาขั้นถัดไปที่ต้อง "หยุดรอ" จริงๆ เริ่มจาก step ที่ระบุ
 * ขั้นสำเนาถึงไม่บล็อก — ทำเครื่องหมายว่าแจ้งแล้ว เข้าคิวแจ้งเตือน แล้วเดินต่อทันที
 * คืน null ถ้าเดินจนจบระดับนี้แล้ว
 */
export async function advanceFrom(requestId: number, stage: Stage, fromStep: number): Promise<number | null> {
  const steps = (await db
    .prepare(
      `SELECT DISTINCT step_no FROM request_approvers
        WHERE request_id = ? AND stage = ? AND step_no >= ? ORDER BY step_no`,
    )
    .all(requestId, stage, fromStep)) as { step_no: number }[];

  for (const { step_no } of steps) {
    const rows = await currentStepApprovers(requestId, stage, step_no);
    if (rows.length === 0) continue;

    if ((await rows)[0].kind === "CC") {
      await db.prepare(
        `UPDATE request_approvers SET status='NOTIFIED', acted_at=?
          WHERE request_id=? AND stage=? AND step_no=? AND status='PENDING'`,
      ).run(now(), requestId, stage, step_no);
      for (const r of (await rows)) await enqueue(requestId, (await notifyTargetFor(r.user_id)), "CC");
      continue;
    }

    if (rows.some((r) => r.status === "PENDING")) {
      for (const r of (await rows)) {
        if (r.status === "PENDING") {
          // ประทับเวลาไว้ตรงนี้ เพราะนี่คือจังหวะที่งานตกถึงมือเขาจริงๆ
          // ใช้นับว่าค้างกี่วัน โดยไม่เอาเวลาที่ขั้นก่อนหน้าดองไว้มารวมด้วย
          await db.prepare("UPDATE request_approvers SET notified_at=? WHERE id=?").run(now(), r.id);
          // ส่งหาคนที่รับแทนถ้าเจ้าตัวลาอยู่ — ยิงหาคนที่ไม่อยู่คือยิงทิ้ง
          await enqueue(requestId, (await notifyTargetFor(r.user_id)), "APPROVAL_REQUEST", {
            approverRowId: r.id,
            stepName: r.node_name || r.title,
          });
        }
      }
      return step_no;
    }
  }
  return null;
}

/** ปิดระดับปัจจุบัน — เบื้องต้นจบ = รอผู้จัดทำยื่นจริง, จริงจบ = อนุมัติสมบูรณ์ */
export async function closeStage(
  requestId: number,
  stage: Stage,
  actorId: number,
  amount: number | null,
  requesterId: number,
) {
  if (stage === "PRELIM") {
    await db.prepare(
      `UPDATE requests SET status='PRELIM_APPROVED', prelim_at=?, updated_at=utc_now_text()
        WHERE id=?`,
    ).run(now(), requestId);
    await logAudit(requestId, actorId, "PRELIM_DONE", "ผ่านอนุมัติเบื้องต้นครบทุกขั้น — เริ่มดำเนินการได้", amount);
  } else {
    // ตั้งกำหนดเคลียร์ OA ตอนนี้ ไม่ใช่ตอนที่มีคนเปิดดู — กำหนดต้องนิ่งตั้งแต่วันอนุมัติ
    // ไม่ใช่ขยับตามวันที่เปิดหน้า และต้องมีอยู่จริงให้หน้ารายการค้นเจอ
    const req = await getRequest(requestId);
    const due = req
      ? clearDueDate(
          req.template_clear_within_days ?? 0,
          todayLocal(),
          await eventDateOf(req),
        )
      : "";

    await db.prepare(
      `UPDATE requests SET status='APPROVED', closed_at=?, clear_due_date=?,
                          updated_at=utc_now_text() WHERE id=?`,
    ).run(now(), due, requestId);
    await logAudit(requestId, actorId, "APPROVED_DONE", "อนุมัติครบทุกขั้น", amount);
    if (due) {
      await logAudit(requestId, actorId, "CLEAR_DUE", `ต้องเคลียร์ค่าใช้จ่ายใน OA ภายใน ${due}`, null);
    }
  }
  await enqueue(requestId, requesterId, "RESULT");
  if (stage === "FINAL") await enqueueWebhook("request.approved", requestId);
}

export type DecisionResult =
  | { ok: true; stageDone: boolean; stage: Stage; decision: "APPROVE" | "REJECT"; request: RequestWithMeta }
  | { ok: false; reason: "NOT_FOUND" | "NOT_PENDING" | "NOT_YOUR_TURN" | "NEED_COMMENT" };

/**
 * บันทึกผลการพิจารณาของผู้อนุมัติหนึ่งคน แล้วเดินเอกสารต่อ
 * `approverRowId` ใช้เมื่อสั่งมาจากการ์ด Lark (ผูกกับขั้นที่ส่งการ์ดไป)
 */
export async function applyDecision({
  user,
  requestId,
  decision,
  comment = "",
  approverRowId,
}: {
  user: User;
  requestId: number;
  decision: "APPROVE" | "REJECT";
  comment?: string;
  approverRowId?: number;
}): Promise<DecisionResult> {
  const req = await getRequest(requestId);
  if (!req) return { ok: false, reason: "NOT_FOUND" };
  if (req.status !== "PENDING") return { ok: false, reason: "NOT_PENDING" };
  if (decision === "REJECT" && !comment.trim()) return { ok: false, reason: "NEED_COMMENT" };

  const rows = (await currentStepApprovers(requestId, req.stage, req.current_step));
  const eligible = rows.filter(
    (r) =>
      r.status === "PENDING" &&
      r.kind === "APPROVE" &&
      (approverRowId === undefined || r.id === approverRowId),
  );

  // แถวของตัวเองมาก่อนเสมอ ค่อยดูแถวที่รับหน้าที่แทน
  //
  // การตรวจสิทธิ์รับแทนต้องถามฐานข้อมูล จึงใส่ใน .find() ไม่ได้ — Promise เป็นค่าจริง
  // เสมอ ถ้าใส่ไปทุกคนจะกลายเป็นผู้มีสิทธิ์อนุมัติแทนโดยไม่มีอะไรฟ้อง
  let mine = eligible.find((r) => r.user_id === user.id);
  if (!mine) {
    for (const r of eligible) {
      if (await canActFor(user.id, r.user_id)) {
        mine = r;
        break;
      }
    }
  }
  if (!mine) return { ok: false, reason: "NOT_YOUR_TURN" };

  const onBehalf = mine.user_id !== user.id;

  // ห้ามใช้สิทธิ์แทนมาอนุมัติเอกสารของตัวเอง
  // ไม่งั้นคนยื่นที่บังเอิญรับแทนผู้อนุมัติอยู่ จะอนุมัติเรื่องตัวเองได้
  if (onBehalf && req.requester_id === user.id) return { ok: false, reason: "NOT_YOUR_TURN" };

  const stage = req.stage;
  let stageDone = false;

  await db.transaction(async () => {
    await db.prepare(
      "UPDATE request_approvers SET status=?, comment=?, acted_at=?, acted_by=? WHERE id=?",
    ).run(
      decision === "APPROVE" ? "APPROVED" : "REJECTED",
      comment,
      now(),
      user.id,
      mine.id,
    );

    if (decision === "REJECT") {
      await db.prepare(
        `UPDATE request_approvers SET status='SKIPPED'
          WHERE request_id=? AND status='PENDING' AND kind='APPROVE'`,
      ).run(requestId);
      await db.prepare(
        "UPDATE requests SET status='REJECTED', closed_at=?, updated_at=utc_now_text() WHERE id=?",
      ).run(now(), requestId);
      (await logAudit(
        requestId,
        user.id,
        "REJECT",
        `${STAGE_LABEL[stage]}: ${comment}${onBehalf ? ` (อนุมัติแทน ${mine.name})` : ""}`,
        req.amount,
      ));
      (await enqueue(requestId, req.requester_id, "RESULT", { note: comment }));
      await enqueueWebhook("request.rejected", requestId, { reason: comment });
      return;
    }

    // ขั้นแบบ "ใครก็ได้ 1 คน" — คนอื่นในขั้นเดียวกันไม่ต้องพิจารณาต่อ
    if (mine.mode === "ANY") {
      await db.prepare(
        `UPDATE request_approvers SET status='SKIPPED'
          WHERE request_id=? AND stage=? AND step_no=? AND status='PENDING'`,
      ).run(requestId, stage, req.current_step);
    }

    // ขั้นแบบ "ครบทุกคน" — ถ้ายังมีคนค้าง ให้รออยู่ขั้นเดิม
    const stillPending = (await db
      .prepare(
        `SELECT COUNT(*) AS n FROM request_approvers
          WHERE request_id=? AND stage=? AND step_no=? AND status='PENDING'`,
      )
      .get(requestId, stage, req.current_step)) as { n: number };

    (await logAudit(
      requestId,
      user.id,
      "APPROVE",
      onBehalf ? `${comment}${comment ? " " : ""}(อนุมัติแทน ${mine.name})` : comment,
      req.amount,
    ));
    if (stillPending.n > 0) return;

    const next = (await advanceFrom(requestId, stage, req.current_step + 1));
    if (next === null) {
      stageDone = true;
      (await closeStage(requestId, stage, user.id, req.amount, req.requester_id));
    } else {
      await db.prepare("UPDATE requests SET current_step=?, updated_at=utc_now_text() WHERE id=?").run(
        next,
        requestId,
      );
    }
  })();

  return { ok: true, stageDone, stage, decision, request: (await getRequest(requestId)) ?? req };
}
