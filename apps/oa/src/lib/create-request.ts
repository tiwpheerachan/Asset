import "server-only";
import { db } from "./db";
import { getActiveFields, getRequest, logAudit, nextDocNo, drawdownFor } from "./queries";
import { overBudgetBy } from "./drawdown";
import { mentionsIn, mentionsToNotify } from "./mention";
import { enqueue } from "./lark/notify";
import { hasPrelim } from "./flow";
import { advanceFrom } from "./approval";
import { buildFlow } from "./build-flow";
import { getFlowNodes } from "./queries";
import { parseForm, type FormValues } from "./form";
import {
  blocksSubmit, checkLeadTime, leadBlockMessage, leadReasonMessage, needsUrgentReason,
} from "./leadtime";
import { STAGE_LABEL, type Field, type FormTemplate, type Stage, type User } from "./types";

const baht = (n: number | null) => (n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/**
 * ยื่นใบนี้แล้วจะทะลุวงเงินหรือจำนวนงวดของใบหลักที่อ้างถึงไหม
 *
 * ตรวจตอนกดส่งเท่านั้น ไม่ตรวจตอนบันทึกร่าง — ร่างยังไม่จองวงเงินของใคร และการห้าม
 * ตั้งแต่ตอนร่างจะทำให้เตรียมงานล่วงหน้าไม่ได้เลยเวลาที่ใบหลักยังรออนุมัติอยู่
 *
 * บอกยอดที่เหลือจริงในข้อความด้วย เพราะ "เกินวงเงิน" อย่างเดียวไม่ช่วยให้แก้ได้ —
 * คนกรอกต้องรู้ว่าต้องลดเหลือเท่าไรถึงจะผ่าน
 */
export async function overDrawMessage(
  fields: Field[],
  values: FormValues,
  amount: number | null,
  selfId: number,
): Promise<string | null> {
  for (const f of fields) {
    if (f.type !== "REQUEST" || !f.active) continue;
    const masterId = Number(values[f.field_key]);
    if (!Number.isInteger(masterId) || masterId <= 0) continue;

    const master = await getRequest(masterId);
    if (!master) continue;

    const d = await drawdownFor(masterId, selfId);
    if (d.full) {
      return `ใบหลัก ${master.doc_no} ออกครบ ${d.periods} งวดแล้ว — แก้จำนวนงวดที่ใบหลักก่อนถ้าต้องเบิกเพิ่ม`;
    }
    const over = overBudgetBy((await d), amount);
    if (over !== null) {
      return `เบิกเกินวงเงินของใบหลัก ${master.doc_no} — เหลือเบิกได้ ${baht(d.remaining)} บาท แต่ใบนี้ขอ ${baht(amount)} บาท (เกิน ${baht(over)} บาท)`;
    }
  }
  return null;
}

/** แจ้งคนที่ถูกระบุชื่อไว้ในฟอร์ม ยกเว้นคนที่จะได้รับแจ้งจากทางอื่นอยู่แล้ว */
export async function notifyMentions(
  requestId: number,
  fields: Field[],
  values: FormValues,
  requesterId: number,
) {
  const inQueue = (
    (await db
      .prepare("SELECT DISTINCT user_id FROM request_approvers WHERE request_id=?")
      .all(requestId)) as { user_id: number }[]
  ).map((r) => r.user_id);

  for (const m of mentionsToNotify(mentionsIn(fields, values), requesterId, inQueue)) {
    await enqueue(requestId, m.userId, "MENTION", { fieldLabel: m.fieldLabel });
  }
}

export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * สร้างคำขอหนึ่งใบ — ใช้ร่วมกันระหว่างหน้าเว็บกับ API ของระบบภายนอก
 *
 * ที่มา: เอกสารที่เกิดจาก API ต้องผ่านกติกาชุดเดียวกับที่คนกรอกหน้าเว็บเจอทุกข้อ
 * (ช่องบังคับ · ยื่นล่วงหน้า · วงเงินของใบหลัก · สายอนุมัติ) ถ้าเขียนแยกกันสองทาง
 * วันหนึ่งกติกาจะเลื่อนออกจากกัน แล้วเอกสารจาก ERP ก็จะข้ามด่านที่คนต้องผ่าน
 *
 * ค่าที่ส่งมาถูกแปลงเป็น FormData ก่อนเสมอ เพื่อให้ใช้ parseForm ตัวเดียวกับหน้าเว็บ
 */
export async function createRequest({
  template,
  requester,
  actorId,
  form,
  submit,
  urgentReason = "",
  source = "",
}: {
  template: FormTemplate;
  /** เจ้าของเอกสาร — สายอนุมัติคิดจากคนนี้ ไม่ใช่คนที่กดสร้าง */
  requester: User;
  /** คนที่กดจริง (null = มาจากระบบภายนอก ไม่มีผู้ใช้ในระบบ) */
  actorId: number | null;
  form: FormData;
  submit: boolean;
  urgentReason?: string;
  /** ชื่อระบบต้นทาง สำหรับบันทึกในประวัติว่าใบนี้มาจากไหน */
  source?: string;
}): Promise<CreateResult> {
  const fields = await getActiveFields(template.id);
  const parsed = parseForm(fields, form, { requireFilled: submit });
  if (parsed.error) return { ok: false, error: parsed.error, fieldErrors: parsed.errors };
  /* ไม่บังคับว่าต้องมีหัวเรื่อง — ฟอร์มที่ไม่ได้ตั้งช่องหัวเรื่องไว้เลยก็ยื่นได้
     ถ้าตั้งช่องไว้และติ๊ก "บังคับกรอก" การตรวจช่องบังคับตามปกติจัดการให้อยู่แล้ว
     เอกสารยังอ้างถึงกันได้ด้วยเลขที่ ชื่อฟอร์ม ผู้จัดทำ และวันที่ */

  const lead = checkLeadTime(template, parsed.eventDate);
  if (submit) {
    if (blocksSubmit(lead)) return { ok: false, error: leadBlockMessage(lead) };
    if (needsUrgentReason(lead) && !urgentReason) {
      return { ok: false, error: leadReasonMessage(lead) };
    }
    const over = await overDrawMessage(fields, parsed.values, parsed.amount, 0);
    if (over) return { ok: false, error: over };
  }

  const stage: Stage = hasPrelim((await getFlowNodes(template.id)), parsed.values) ? "PRELIM" : "FINAL";
  let newId = 0;
  let flowError: string | null = null;

  try {
    await db.transaction(async () => {
      const info = (await db
        .prepare(
          `INSERT INTO requests
             (doc_no, template_id, requester_id, title, amount, doc_date, data,
              status, stage, current_step, urgent_reason, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          await nextDocNo(template), template.id, requester.id, parsed.title, parsed.amount,
          parsed.docDate, JSON.stringify(parsed.values),
          submit ? "PENDING" : "DRAFT", stage, submit ? 1 : 0,
          submit && needsUrgentReason(lead) ? urgentReason : "",
          submit ? new Date().toISOString() : null,
        ));
      newId = Number(info.lastInsertRowid);

      const via = source ? ` (ผ่าน ${source})` : "";
      if (submit) {
        flowError = await buildFlow(newId, template.id, stage, parsed.values, requester);
        if (flowError) throw new Error(flowError);
        const step = await advanceFrom(newId, stage, 1);
        if (step === null) throw new Error("สายอนุมัติที่ได้ไม่มีขั้นที่ต้องอนุมัติ");
        await db.prepare("UPDATE requests SET current_step=? WHERE id=?").run(step, newId);
        await notifyMentions(newId, fields, parsed.values, requester.id);
        await logAudit(newId, actorId, "SUBMIT", `สร้างและส่ง${STAGE_LABEL[stage]}${via}`, parsed.amount);
      } else {
        await logAudit(newId, actorId, "CREATE", `บันทึกฉบับร่าง${via}`, parsed.amount);
      }
    })();
  } catch (e) {
    return { ok: false, error: flowError ?? `บันทึกไม่สำเร็จ: ${(e as Error).message}` };
  }

  return { ok: true, id: newId };
}
