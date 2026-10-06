"use server";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, USER_SELECT } from "./db";
import { putFile, deleteFile } from "./storage";
import {
  createSession, destroySession, hashPassword, requireAdmin, requireUser, verifyPassword,
} from "./auth";
import {
  canView, currentStepApprovers, drawdownFor, getActiveFields, getApprovers, getFlowNodes,
  getRequest, getTemplate, getUser, listActiveUsers, logAudit, nextDocNo, upsertDirectoryUser,
} from "./queries";
import { overBudgetBy } from "./drawdown";
import { voidApproved } from "./void";
import { transferQueue, TRANSFER_ERROR } from "./transfer";
import { mentionsIn, mentionsToNotify } from "./mention";
import { translator } from "./i18n";
import { canBeManager, type OrgEdge } from "./org";
import { hasPrelim, type FlowStep } from "./flow";
import { buildFlow, writeFlow } from "./build-flow";
import { createRequest, notifyMentions, overDrawMessage } from "./create-request";
import { advanceFrom, applyDecision, closeStage } from "./approval";
import { enqueueWebhook } from "./integration";
import { closeCards, enqueue, flushInBackground } from "./lark/notify";
import { rolesAreLocal, ssoConfig, ssoReady } from "./sso/config";
import { endSessionUrl } from "./sso/oidc";
import {
  cellKey, inputName, parseCellKey, parseForm, parseJson, type FormValues,
} from "./form";
import {
  blocksSubmit, checkLeadTime, leadBlockMessage, leadReasonMessage, needsUrgentReason,
} from "./leadtime";
import {
  isCondOp, isColumnType, isFieldType, isJobRole, isNodeKind, isNodeMode, isRole, isStage,
  JOB_ROLE_LABEL, STAGE_LABEL, TEMPLATE_COLORS,
  type Field, type JobRole, type Stage, type User,
} from "./types";




/**
 * React 19 รีเซ็ต <form action={...}> อัตโนมัติหลัง action จบ
 * ทำให้ค่าที่ผู้ใช้พิมพ์หายเมื่อ validate ไม่ผ่าน — จึงส่ง `values` กลับไปให้ฟอร์มใช้ต่อ
 */
export type ActionState = {
  error?: string;
  ok?: string;
  values?: Record<string, string>;
  /** ข้อผิดพลาดรายช่อง — ฟอร์มเอาไปแสดงใต้ช่องที่ผิดจริง ไม่ใช่ก้อนเดียวบนหัว */
  fieldErrors?: Record<string, string>;
};

const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB ต่อไฟล์
/** ชนิดไฟล์ที่ใช้เป็นไอคอนของฟอร์มได้ — SVG เสิร์ฟกลับแบบ sandbox ไว้แล้ว ดู /api/icon */
const ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const now = () => new Date().toISOString();

/* ======================= auth ======================= */

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };

  const { callerIp, checkLoginAllowed, recordLoginAttempt } = await import("./rate-limit");
  const ip = await callerIp();

  const limit = await checkLoginAllowed(email, ip);
  if (limit.blocked) {
    return {
      error: `พยายามล็อกอินผิดหลายครั้งเกินไป กรุณารออีก ${limit.retryAfterMin} นาที`,
      values: { email },
    };
  }

  const user = (await db.prepare(`${USER_SELECT} WHERE u.email = ?`).get(email)) as
    | (User & { password: string })
    | undefined;

  // บัญชีที่ถูกปิดใช้งานนับเป็นความล้มเหลวด้วย ไม่งั้นจะกลายเป็นช่องให้ยิงไม่จำกัด
  if (!user || !user.active || !verifyPassword(password, user.password)) {
    await recordLoginAttempt(email, ip, false);
    // ข้อความเดียวกันทุกกรณี ไม่บอกว่าอีเมลนี้มีอยู่จริงหรือไม่
    return {
      error: user && !user.active ? "บัญชีนี้ถูกปิดใช้งาน" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      values: { email },
    };
  }

  await recordLoginAttempt(email, ip, true);
  await createSession(user.id);
  redirect("/");
}

/**
 * ออกจากระบบ — ปิดทั้งเซสชันของแอปนี้และของระบบกลาง
 *
 * ปิดแค่ฝั่งเราไม่พอ เพราะเซสชันที่ระบบกลางยังอยู่ พอกดเข้าใหม่จะถูกส่งกลับเข้าบัญชีเดิม
 * ทันทีโดยไม่มีจังหวะให้เลือก — คนที่อยากสลับบัญชีจึงทำไม่ได้
 *
 * ต้องแนบ id_token ที่เก็บไว้ตอนล็อกอินไปด้วย ไม่งั้นระบบกลางจะปิดเซสชันให้ก็จริง
 * แต่พากลับไปหน้าล็อกอินของตัวเองแทนที่จะกลับมาที่นี่ (กันคนใช้ลิงก์นี้พาผู้ใช้ไปเว็บปลอม)
 *
 * เคยปิดฟีเจอร์นี้ไว้เพราะปลายทางเดิม (/api/auth/logout) รับเฉพาะ POST แล้วได้ 405
 * ตอนนี้ระบบกลางย้ายไป /api/v1/oidc/end-session ซึ่งรับ GET แล้ว
 */
export async function logoutAction() {
  const { idToken } = await destroySession();

  const cfg = ssoConfig();
  if (!idToken || !ssoReady(cfg)) redirect("/login");

  const endSession = await endSessionUrl(cfg).catch(() => null);
  // ระบบกลางไม่ตอบตอนอ่านค่าตั้งต้น = ยังไม่รู้ที่อยู่ปลายทาง อย่างน้อยฝั่งเราออกแล้ว
  if (!endSession) redirect("/login");

  const url = new URL(endSession);
  url.searchParams.set("id_token_hint", idToken);
  url.searchParams.set("post_logout_redirect_uri", `${cfg.baseUrl}/login`);
  redirect(url.toString());
}

/* ======================= คำขอ: สร้าง / แก้ไข ======================= */

async function storeFile(
  requestId: number,
  fieldKey: string,
  file: File,
  userId: number,
): Promise<string | null> {
  if (file.size > MAX_UPLOAD) return `${file.name} ใหญ่เกิน 10 MB`;
  const stored = `${requestId}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.name)}`;
  await putFile(stored, Buffer.from(await file.arrayBuffer()), file.type);
  await db.prepare(
    `INSERT INTO attachments
       (request_id, field_key, filename, stored_name, mime, size, uploaded_by)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    requestId, fieldKey, file.name, stored,
    file.type || "application/octet-stream", file.size, userId,
  );
  return null;
}

async function saveFiles(
  requestId: number,
  fields: Field[],
  form: FormData,
  userId: number,
): Promise<string | null> {
  for (const field of fields) {
    if (field.type !== "FILE" && field.type !== "IMAGE") continue;
    const files = form
      .getAll(inputName(field.field_key))
      .filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      const err = await storeFile(requestId, field.field_key, file, userId);
      if (err) return err;
    }
  }

  /*
   * ไฟล์ที่แนบอยู่ใน "เซลล์" ของตาราง — ชื่อ input เป็น tf~ช่อง~แถว~คอลัมน์
   *
   * จำนวนแถวไม่คงที่ จึงไล่ตามนิยามฟิลด์เหมือนด้านบนไม่ได้ ต้องกวาดจากสิ่งที่ส่งมาจริง
   * แล้วตรวจย้อนว่าช่องกับคอลัมน์นั้นมีอยู่จริงและเป็นชนิดไฟล์ — ไม่งั้นใครก็ยัด
   * ชื่อ input อะไรก็ได้เข้ามาให้ระบบเก็บไฟล์ผูกกับคีย์มั่ว ๆ
   */
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("tf~")) continue;
    if (!(value instanceof File) || value.size === 0) continue;

    const cell = parseCellKey(name.slice(3));
    if (!cell) continue;
    const field = fields.find((f) => f.field_key === cell.fieldKey && f.type === "TABLE");
    const col = field?.columns.find((c) => c.col_key === cell.colKey && c.type === "FILE");
    if (!field || !col) continue;

    const err = await storeFile(
      requestId,
      cellKey(cell.fieldKey, cell.rowId, cell.colKey),
      value,
      userId,
    );
    if (err) return err;
  }
  return null;
}

export async function createRequestAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const templateId = Number(form.get("template_id"));
  const template = await getTemplate(templateId);
  if (!template || !template.active) return { error: "ไม่พบแม่แบบฟอร์ม" };

  // ตรรกะการสร้างอยู่ที่ createRequest() ที่เดียว — API ของระบบภายนอกเรียกตัวเดียวกัน
  // เอกสารที่เข้ามาทางไหนจึงผ่านกติกาชุดเดียวกันเสมอ
  const r = (await createRequest({
    template: await template,
    requester: user,
    actorId: user.id,
    form,
    submit: form.get("intent") === "submit",
    urgentReason: String(form.get("urgent_reason") ?? "").trim(),
  }));
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };

  const fileError = await saveFiles(r.id, (await getActiveFields(templateId)), form, user.id);
  if (fileError) return { error: fileError };

  flushInBackground();
  revalidatePath("/");
  redirect(`/requests/${r.id}`);
}

export async function updateRequestAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.requester_id !== user.id && user.role !== "ADMIN") {
    return { error: "แก้ไขได้เฉพาะผู้จัดทำเอกสารเท่านั้น" };
  }
  if (req.status !== "DRAFT" && req.status !== "RETURNED") {
    return { error: "แก้ไขได้เฉพาะฉบับร่างหรือเอกสารที่ถูกส่งกลับ" };
  }

  const fields = await getActiveFields(req.template_id);
  const submit = form.get("intent") === "submit";
  const parsed = parseForm(fields, form, { requireFilled: submit });
  if (parsed.error) return { error: parsed.error, fieldErrors: parsed.errors };

  if (submit) {
    // ไม่นับยอดของใบนี้ซ้ำ — ไม่งั้นแก้ใบเดิมแล้วยื่นใหม่จะติดเพดานทั้งที่ไม่ได้เพิ่มอะไร
    const over = (await overDrawMessage(fields, parsed.values, parsed.amount, req.id));
    if (over) return { error: over };
  }

  const requester = await (await getUser(req.requester_id))!;
  const stage: Stage = hasPrelim((await getFlowNodes(req.template_id)), parsed.values) ? "PRELIM" : "FINAL";
  let flowError: string | null = null;

  try {
    await db.transaction(async () => {
      await db.prepare(
        `UPDATE requests SET title=?, amount=?, doc_date=?, data=?, status=?, stage=?,
                             current_step=?, submitted_at=?, updated_at=utc_now_text()
          WHERE id=?`,
      ).run(
        parsed.title, parsed.amount, parsed.docDate, JSON.stringify(parsed.values),
        submit ? "PENDING" : req.status, stage, submit ? 1 : 0,
        submit ? now() : null, id,
      );

      if (submit) {
        await db.prepare("DELETE FROM request_approvers WHERE request_id=?").run(id);
        flowError = await buildFlow(id, req.template_id, stage, parsed.values, requester);
        if (flowError) throw new Error(flowError);
        const step = await advanceFrom(id, stage, 1);
        if (step === null) throw new Error("สายอนุมัติที่ได้ไม่มีขั้นที่ต้องอนุมัติ");
        await db.prepare("UPDATE requests SET current_step=? WHERE id=?").run(step, id);
        (await notifyMentions(id, fields, parsed.values, req.requester_id));
        await logAudit(id, user.id, "SUBMIT", `ส่ง${STAGE_LABEL[stage]}`, parsed.amount);
        // ให้บัญชีเห็นงานที่กำลังจะเข้ามาล่วงหน้า วางแผนกระแสเงินสดได้
        await enqueueWebhook("request.submitted", id);
      } else {
        await logAudit(id, user.id, "UPDATE", "แก้ไขเอกสาร", parsed.amount);
      }
    })();
  } catch (e) {
    return { error: flowError ?? `บันทึกไม่สำเร็จ: ${(e as Error).message}` };
  }

  const fileError = await saveFiles(id, fields, form, user.id);
  if (fileError) return { error: fileError };

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  redirect(`/requests/${id}`);
}

/**
 * เลือกเองว่าจะสร้างใหม่หรือแก้ของเดิม ตามว่ามีเลขเอกสารติดมากับฟอร์มหรือยัง
 *
 * ที่มา: ฟอร์มเดียวกันนี้เริ่มต้นจาก "ยังไม่มีเอกสาร" แต่ระหว่างกรอก ระบบอาจบันทึก
 * ฉบับร่างให้อัตโนมัติไปแล้ว — ถ้ายังยิงไปที่ "สร้างใหม่" เหมือนเดิม กดส่งทีเดียว
 * ก็ได้เอกสารสองใบ ใบหนึ่งเป็นร่างค้างและอีกใบวิ่งเข้าสายอนุมัติ
 */
export async function saveRequestAction(
  prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return Number(form.get("request_id") ?? 0)
    ? updateRequestAction(prev, form)
    : createRequestAction(prev, form);
}

/** ผลของการบันทึกอัตโนมัติ — id ของร่างที่ได้ (0 = ยังไม่มีอะไรให้บันทึก) */
export type AutosaveResult = { id: number } | { error: string };

/**
 * บันทึกร่างให้เองระหว่างกรอก
 *
 * ที่มา: ฟอร์มจริงยาวหลายจอ กรอกกันครั้งละหลายสิบนาที ปิดแท็บผิด เน็ตหลุด หรือ
 * เครื่องรีสตาร์ตระหว่างนั้น = กรอกใหม่ทั้งใบ คำเตือน "ออกจากหน้านี้ไหม" ช่วยได้
 * เฉพาะตอนที่เบราว์เซอร์ยังทำงานอยู่เท่านั้น
 *
 * ไม่ตรวจว่ากรอกครบไหม เพราะของที่ยังกรอกไม่เสร็จคือสิ่งที่ฟีเจอร์นี้ตั้งใจจะเก็บ
 * และไม่แตะไฟล์แนบ — ไฟล์ส่งไปพร้อมตอนกดบันทึกจริงครั้งเดียว
 */
export async function autosaveDraftAction(form: FormData): Promise<AutosaveResult> {
  const user = await requireUser();
  const id = Number(form.get("request_id") ?? 0);
  const templateId = Number(form.get("template_id"));
  const template = await getTemplate(templateId);
  if (!template || !template.active) return { error: "ไม่พบแม่แบบฟอร์ม" };

  const fields = await getActiveFields(templateId);
  const parsed = parseForm(fields, form, { requireFilled: false });

  if (id) {
    const req = await getRequest(id);
    if (!req) return { error: "ไม่พบคำขอ" };
    if (req.template_id !== templateId) return { error: "แม่แบบไม่ตรงกับเอกสาร" };
    if (req.requester_id !== user.id && user.role !== "ADMIN") return { error: "ไม่มีสิทธิ์" };
    // ส่งเข้าสายอนุมัติไปแล้วจากอีกแท็บหนึ่ง — หยุดเขียนทับ ให้ฝั่งหน้าเว็บเลิกบันทึกเอง
    if (req.status !== "DRAFT" && req.status !== "RETURNED") {
      return { error: "เอกสารนี้ไม่ได้อยู่ในสถานะที่แก้ได้แล้ว" };
    }

    await db.prepare(
      `UPDATE requests SET title=?, amount=?, doc_date=?, data=?, updated_at=utc_now_text()
        WHERE id=?`,
    ).run(parsed.title, parsed.amount, parsed.docDate, JSON.stringify(parsed.values), id);
    return { id };
  }

  // ยังไม่ได้พิมพ์อะไรเลย — เปิดฟอร์มทิ้งไว้เฉย ๆ ไม่ควรกลายเป็นร่างเปล่าในรายการ
  const typed = Object.values(parsed.values).some((v) => {
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.values(v).some((x) => x !== "");
    return true;
  });
  if (!typed) return { id: 0 };

  const info = (await db
    .prepare(
      `INSERT INTO requests
         (doc_no, template_id, requester_id, title, amount, doc_date, data, status, stage, current_step)
       VALUES (?,?,?,?,?,?,?,'DRAFT','FINAL',0)`,
    )
    .run(
      await nextDocNo(template), templateId, user.id, parsed.title, parsed.amount, parsed.docDate,
      JSON.stringify(parsed.values),
    ));
  const newId = Number(info.lastInsertRowid);
  await logAudit(newId, user.id, "CREATE", "บันทึกฉบับร่างอัตโนมัติ", parsed.amount);
  return { id: newId };
}

/** ส่งฉบับร่างเข้าสายอนุมัติ */
export async function submitRequestAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.requester_id !== user.id && user.role !== "ADMIN") return { error: "ไม่มีสิทธิ์" };
  if (req.status !== "DRAFT" && req.status !== "RETURNED") {
    return { error: "เอกสารนี้ส่งอนุมัติไปแล้ว" };
  }

  const data = JSON.parse(req.data) as FormValues;
  const requester = await (await getUser(req.requester_id))!;
  const stage: Stage = hasPrelim((await getFlowNodes(req.template_id)), data) ? "PRELIM" : "FINAL";
  let flowError: string | null = null;

  try {
    await db.transaction(async () => {
      await db.prepare("DELETE FROM request_approvers WHERE request_id=?").run(id);
      flowError = await buildFlow(id, req.template_id, stage, data, requester);
      if (flowError) throw new Error(flowError);
      const step = await advanceFrom(id, stage, 1);
      if (step === null) throw new Error("สายอนุมัติที่ได้ไม่มีขั้นที่ต้องอนุมัติ");
      await db.prepare(
        `UPDATE requests SET status='PENDING', stage=?, current_step=?, submitted_at=?,
                             updated_at=utc_now_text() WHERE id=?`,
      ).run(stage, step, now(), id);
      (await logAudit(id, user.id, "SUBMIT", `ส่ง${STAGE_LABEL[stage]}`, req.amount));
      await enqueueWebhook("request.submitted", id);
    })();
  } catch {
    return { error: flowError ?? "ส่งอนุมัติไม่สำเร็จ" };
  }

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: `ส่ง${STAGE_LABEL[stage]}เรียบร้อย` };
}

/** ยื่นขออนุมัติจริงหลังผ่านเบื้องต้น — ยืนยันมูลค่าจริงซึ่งเป็นตัวกำหนดสายอนุมัติของขั้นนี้ */
export async function submitFinalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.requester_id !== user.id && user.role !== "ADMIN") return { error: "ไม่มีสิทธิ์" };
  if (req.status !== "PRELIM_APPROVED") {
    return { error: "ยื่นอนุมัติจริงได้เฉพาะเอกสารที่ผ่านอนุมัติเบื้องต้นแล้ว" };
  }

  const raw = String(form.get("amount") ?? "").replace(/,/g, "").trim();
  if (raw === "") return { error: "กรุณาระบุมูลค่าจริงก่อนยื่นอนุมัติจริง" };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { error: "มูลค่าต้องเป็นตัวเลขและไม่ติดลบ" };

  const fields = (await getActiveFields(req.template_id));
  const amountField = fields.find((f) => f.field_role === "AMOUNT");
  const data = JSON.parse(req.data) as FormValues;
  if (amountField) data[amountField.field_key] = amount;

  const requester = await (await getUser(req.requester_id))!;
  let flowError: string | null = null;

  try {
    await db.transaction(async () => {
      flowError = await buildFlow(id, req.template_id, "FINAL", data, requester);
      if (flowError) throw new Error(flowError);
      const step = await advanceFrom(id, "FINAL", 1);
      if (step === null) throw new Error("สายอนุมัติจริงไม่มีขั้นที่ต้องอนุมัติ");
      await db.prepare(
        `UPDATE requests SET status='PENDING', stage='FINAL', current_step=?, amount=?, data=?,
                             submitted_at=?, updated_at=utc_now_text() WHERE id=?`,
      ).run(step, amount, JSON.stringify(data), now(), id);
      (await logAudit(
        id, user.id, "SUBMIT_FINAL",
        req.amount !== null && req.amount !== amount
          ? "ยื่นอนุมัติจริง (มูลค่าเปลี่ยนจากที่ขออนุมัติเบื้องต้นไว้)"
          : "ยื่นอนุมัติจริง",
        amount,
      ));
    })();
  } catch {
    return { error: flowError ?? "ยื่นอนุมัติจริงไม่สำเร็จ" };
  }

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: "ยื่นขออนุมัติจริงเรียบร้อย" };
}

/* ======================= คำขอ: พิจารณา ======================= */

export async function decideAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const decision = String(form.get("decision"));
  const comment = String(form.get("comment") ?? "").trim();
  if (decision !== "APPROVE" && decision !== "REJECT") return { error: "คำสั่งไม่ถูกต้อง" };

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  // ตรวจขนาดไฟล์ก่อนตัดสินใจ — ถ้าไฟล์ใหญ่เกินแล้วค่อยรู้ทีหลัง เอกสารจะถูกอนุมัติไป
  // แล้วโดยไม่มีหลักฐานที่ตั้งใจแนบ ซึ่งย้อนกลับไม่ได้
  for (const file of files) {
    if (file.size > MAX_UPLOAD) return { error: `${file.name} ใหญ่เกิน 10 MB` };
  }

  const result = await applyDecision({ user, requestId: id, decision, comment });
  if (!result.ok) {
    const message = {
      NOT_FOUND: "ไม่พบคำขอ",
      NOT_PENDING: "เอกสารนี้ไม่ได้อยู่ระหว่างรออนุมัติ",
      NOT_YOUR_TURN: "ยังไม่ถึงคิวอนุมัติของคุณ",
      NEED_COMMENT: "กรุณาระบุเหตุผลที่ไม่อนุมัติ",
    }[result.reason];
    return { error: message };
  }

  // แนบหลังตัดสินใจสำเร็จเท่านั้น — ถ้าแนบก่อนแล้วการตัดสินใจไม่ผ่าน จะเหลือไฟล์
  // ค้างอยู่ในเอกสารโดยไม่มีบันทึกว่าใครแนบเพราะอะไร
  let attached = 0;
  if (files.length > 0) {
    const saved = await saveAttachments({ requestId: id, userId: user.id, fieldKey: "", files });
    if (saved.ok) attached = saved.count;
  }
  const suffix = attached > 0 ? ` · แนบไฟล์ ${attached} รายการ` : "";

  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  flushInBackground();

  if (decision === "REJECT") return { ok: `บันทึกการไม่อนุมัติแล้ว${suffix}` };
  if (result.stageDone && result.stage === "PRELIM") {
    return { ok: `อนุมัติเบื้องต้นครบทุกขั้นแล้ว — ผู้จัดทำเริ่มดำเนินการได้${suffix}` };
  }
  return { ok: `อนุมัติเรียบร้อย${suffix}` };
}

/** ส่งกลับให้ผู้จัดทำแก้ — ต่างจากไม่อนุมัติตรงที่เอกสารไม่ถูกปิด แก้แล้วส่งใหม่ได้ */
export async function sendBackAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const reason = String(form.get("comment") ?? "").trim();
  if (!reason) return { error: "กรุณาระบุสิ่งที่ต้องการให้แก้ไข" };

  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.status !== "PENDING") return { error: "ส่งกลับได้เฉพาะเอกสารที่รออนุมัติ" };

  const rows = (await currentStepApprovers(id, req.stage, req.current_step));
  const mine = rows.find((r) => r.user_id === user.id && r.status === "PENDING");
  if (!mine && user.role !== "ADMIN") return { error: "ยังไม่ถึงคิวพิจารณาของคุณ" };

  await db.transaction(async () => {
    if (mine) {
      await db.prepare("UPDATE request_approvers SET comment=?, acted_at=? WHERE id=?")
        .run(reason, now(), mine.id);
    }
    await db.prepare(
      `UPDATE requests SET status='RETURNED', current_step=0, updated_at=utc_now_text()
        WHERE id=?`,
    ).run(id);
    (await logAudit(id, user.id, "SEND_BACK", reason, req.amount));
    (await enqueue(id, req.requester_id, "RESULT", { note: reason }));
    // บัญชีอาจตั้งเรื่องรอไว้แล้ว ต้องรู้ว่าใบนี้ยังไม่จบ อย่าเพิ่งลงบัญชี
    await enqueueWebhook("request.returned", id, { reason });
  })();

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: "ส่งกลับให้ผู้จัดทำแก้ไขแล้ว" };
}

/** ถ่ายโอนคิวอนุมัติของตัวเองให้คนอื่น — กฎอยู่ใน transfer.ts ใช้ร่วมกับปุ่มบนการ์ด Lark */
export async function transferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));

  const result = await transferQueue({
    user,
    requestId: id,
    toId: Number(form.get("to_user")),
    note: String(form.get("comment") ?? "").trim(),
  });
  if (!result.ok) return { error: translator()(TRANSFER_ERROR[result.reason]) };

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: `ถ่ายโอนให้ ${result.targetName} แล้ว` };
}

/** แทรกผู้อนุมัติเพิ่มกลางคัน — ก่อนหรือหลังคิวของตัวเอง */
export async function addApproverAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const toId = Number(form.get("to_user"));
  const before = form.get("position") === "BEFORE";

  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.status !== "PENDING") return { error: "เพิ่มผู้อนุมัติได้เฉพาะเอกสารที่รออนุมัติ" };

  const target = await getUser(toId);
  if (!target || !target.active) return { error: "ไม่พบผู้ใช้ที่เลือก" };
  if (target.id === req.requester_id) return { error: "ผู้จัดทำอนุมัติเอกสารตัวเองไม่ได้" };

  const rows = (await currentStepApprovers(id, req.stage, req.current_step));
  const mine = rows.find((r) => r.user_id === user.id && r.status === "PENDING");
  if (!mine && user.role !== "ADMIN") return { error: "ยังไม่ถึงคิวอนุมัติของคุณ" };

  const already = (await getApprovers(id)).some(
    (a) => a.user_id === target.id && a.kind === "APPROVE" && a.status === "PENDING",
  );
  if (already) return { error: `${target.name} อยู่ในสายอนุมัติอยู่แล้ว` };

  const at = before ? req.current_step : req.current_step + 1;

  await db.transaction(async () => {
    // เว้นที่ให้ขั้นใหม่ แล้วแทรกเข้าไป
    await db.prepare(
      `UPDATE request_approvers SET step_no = step_no + 1
        WHERE request_id=? AND stage=? AND step_no >= ?`,
    ).run(id, req.stage, at);
    await db.prepare(
      `INSERT INTO request_approvers
         (request_id, stage, step_no, node_name, kind, mode, user_id, title, status, added_by)
       VALUES (?,?,?,?,'APPROVE','SEQUENTIAL',?,?, 'PENDING', ?)`,
    ).run(id, req.stage, at, "ผู้อนุมัติที่เพิ่มระหว่างทาง", target.id, target.position, user.id);

    if (before) {
      await db.prepare("UPDATE requests SET current_step=?, updated_at=utc_now_text() WHERE id=?")
        .run(at, id);
    }
    (await logAudit(
      id, user.id, "ADD_APPROVER",
      `เพิ่ม ${target.name} ${before ? "ก่อน" : "หลัง"}ขั้นของตนเอง`, req.amount,
    ));
    if (before) {
      const row = (await db
        .prepare(
          `SELECT id FROM request_approvers
            WHERE request_id=? AND stage=? AND step_no=? AND user_id=?`,
        )
        .get(id, req.stage, at, target.id)) as { id: number } | undefined;
      if (row) {
        (await enqueue(id, target.id, "APPROVAL_REQUEST", {
          approverRowId: row.id,
          stepName: "ผู้อนุมัติที่เพิ่มระหว่างทาง",
        }));
      }
    }
  })();

  flushInBackground();
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: `เพิ่ม ${target.name} เข้าสายอนุมัติแล้ว` };
}

export async function cancelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.requester_id !== user.id && user.role !== "ADMIN") return { error: "ไม่มีสิทธิ์" };
  if (req.status === "APPROVED") return { error: "เอกสารที่อนุมัติแล้วยกเลิกไม่ได้" };

  await db.prepare(
    "UPDATE requests SET status='CANCELLED', closed_at=?, updated_at=utc_now_text() WHERE id=?",
  ).run(now(), id);
  (await logAudit(id, user.id, "CANCEL", String(form.get("comment") ?? ""), req.amount));
  // ถ้าบัญชีตั้งเรื่องรอไว้แล้วต้องยกเลิกตาม ไม่งั้นจะมีเอกสารค้างที่ไม่มีต้นเรื่อง
  await enqueueWebhook("request.cancelled", id, { reason: String(form.get("comment") ?? "") });

  void closeCards(id, "ยกเลิกเอกสารแล้ว").catch(() => {});
  revalidatePath(`/requests/${id}`);
  return { ok: "ยกเลิกเอกสารแล้ว" };
}

/**
 * ยกเลิกเอกสารที่อนุมัติไปแล้ว — ผู้ดูแลระบบเท่านั้น และต้องบอกเหตุผล
 *
 * ที่มา: เดิมอนุมัติแล้วคือจบ ยกเลิกไม่ได้เลย ซึ่งถูกในแง่ที่ว่าบันทึกการอนุมัติต้อง
 * เชื่อถือได้ แต่ในชีวิตจริงมีทั้งยื่นผิดใบ ยื่นซ้ำ และดีลที่ล้มหลังอนุมัติ —
 * พอยกเลิกไม่ได้ เอกสารผิดก็ค้างอยู่ในระบบตลอดไป และคนก็เลิกเชื่อรายการที่เห็น
 *
 * ไม่ลบแถวทิ้งและไม่แตะประวัติการอนุมัติเดิม — เปลี่ยนสถานะเป็น "ยกเลิก" แล้วต่อ
 * เหตุผลไว้ในประวัติ แบบเดียวกับ void ในระบบบัญชี เปิดดูย้อนหลังยังเห็นครบว่าใคร
 * อนุมัติอะไรไว้ก่อนหน้า และใครเป็นคนยกเลิกด้วยเหตุผลอะไร
 *
 * กันสองอย่างก่อนยอมให้ยกเลิก เพราะทั้งคู่ทำให้ข้อมูลที่คนอื่นถืออยู่กลายเป็นเท็จเงียบๆ:
 *   - ออกเลขที่เอกสารไปแล้ว (ใบลดหนี้/ใบกำกับ) — เลขนั้นอยู่ในสมุดบัญชีแล้ว ต้องยกเลิกที่ตัวเลขก่อน
 *   - มีใบอื่นอ้างอิงใบนี้อยู่ — ยกเลิกใบหลักทิ้งไว้เฉยๆ จะเหลือใบลูกที่ชี้ไปหาเงื่อนไขที่ถูกยกเลิกแล้ว
 */
export async function voidApprovedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const id = Number(form.get("request_id"));

  const res = await voidApproved(id, String(form.get("reason") ?? ""), user);
  if ("error" in res) return res;

  void closeCards(id, "ยกเลิกเอกสารแล้ว").catch(() => {});
  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  return { ok: "ยกเลิกเอกสารที่อนุมัติแล้วเรียบร้อย" };
}

/** ผู้จัดทำดึงกลับมาแก้ (ได้เฉพาะยังไม่มีใครพิจารณาในระดับปัจจุบัน) */
export async function recallAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.requester_id !== user.id && user.role !== "ADMIN") return { error: "ไม่มีสิทธิ์" };
  if (req.status !== "PENDING") return { error: "ดึงกลับได้เฉพาะเอกสารที่รออนุมัติ" };

  const acted = (await getApprovers(id)).filter(
    (a) => a.stage === req.stage && a.kind === "APPROVE" && a.status !== "PENDING",
  );
  if (acted.length > 0 && user.role !== "ADMIN") {
    return { error: "มีผู้อนุมัติดำเนินการไปแล้ว ไม่สามารถดึงกลับได้" };
  }

  const backToPrelim = req.stage === "FINAL" && req.prelim_at !== null;

  await db.transaction(async () => {
    await db.prepare("DELETE FROM request_approvers WHERE request_id=? AND stage=?")
      .run(id, req.stage);
    if (backToPrelim) {
      await db.prepare(
        `UPDATE requests SET status='PRELIM_APPROVED', stage='PRELIM', current_step=0,
                             updated_at=utc_now_text() WHERE id=?`,
      ).run(id);
    } else {
      await db.prepare(
        `UPDATE requests SET status='DRAFT', current_step=0, submitted_at=NULL,
                             updated_at=utc_now_text() WHERE id=?`,
      ).run(id);
    }
    (await logAudit(
      id, user.id, "RECALL",
      backToPrelim ? "ดึงกลับจากขั้นอนุมัติจริง" : "ดึงเอกสารกลับมาแก้ไข", req.amount,
    ));
  })();

  revalidatePath(`/requests/${id}`);
  return {
    ok: backToPrelim ? "ดึงกลับแล้ว — ยื่นอนุมัติจริงใหม่ได้" : "ดึงเอกสารกลับเป็นฉบับร่างแล้ว",
  };
}

/* ======================= สำเนาถึง / ความคิดเห็น / ไฟล์ ======================= */

/** ทำเครื่องหมายว่าอ่านสำเนาแล้ว — เรียกตอนเปิดหน้ารายละเอียด */
export async function markCcRead(requestId: number, userId: number) {
  await db.prepare(
    `UPDATE request_approvers SET read_at=?
      WHERE request_id=? AND user_id=? AND kind='CC' AND read_at IS NULL`,
  ).run(now(), requestId, userId);
}

export async function commentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const body = String(form.get("body") ?? "").trim();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  // ส่งรูปเปล่า ๆ โดยไม่พิมพ์อะไรถือว่าใช้ได้ — ภาพหน้าจอมักอธิบายตัวเองอยู่แล้ว
  if (!body && files.length === 0) return { error: "กรุณาพิมพ์ข้อความหรือแนบไฟล์" };

  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (!(await canView(req, user))) return { error: "ไม่มีสิทธิ์" };

  const row = await db
    .prepare("INSERT INTO request_comments (request_id, user_id, body) VALUES (?,?,?) RETURNING id")
    .get<{ id: number }>(id, user.id, body);

  if (files.length > 0) {
    const saved = await saveAttachments({
      requestId: id,
      userId: user.id,
      fieldKey: "",
      files,
      commentId: row?.id ?? null,
    });
    // ไฟล์ใหญ่เกินแล้วความคิดเห็นถูกบันทึกไปแล้ว — ลบทิ้งดีกว่าปล่อยให้ค้างแบบไม่มีไฟล์
    // ที่คนเขียนตั้งใจแนบมา เพราะเขาจะไม่รู้เลยว่าไฟล์หาย
    if (!saved.ok) {
      if (row) await db.prepare("DELETE FROM request_comments WHERE id = ?").run(row.id);
      return { error: saved.error };
    }
  }

  revalidatePath(`/requests/${id}`);
  return { ok: "เพิ่มความคิดเห็นแล้ว" };
}

/**
 * เก็บไฟล์แนบลงดิสก์ + ตาราง attachments
 *
 * แยกออกมาเพราะตอนนี้มีสองทางที่แนบไฟล์ได้ — ปุ่มแนบไฟล์ตรง ๆ กับการแนบไปพร้อม
 * การกดอนุมัติ ถ้าปล่อยให้แต่ละทางเขียนเอง กฎเรื่องขนาดไฟล์กับการตั้งชื่อไฟล์ที่เก็บ
 * จะเพี้ยนกันจนไฟล์จากคนละทางเก็บคนละแบบ
 */
async function saveAttachments({
  requestId,
  userId,
  fieldKey,
  files,
  commentId = null,
}: {
  requestId: number;
  userId: number;
  fieldKey: string;
  files: File[];
  commentId?: number | null;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  for (const file of files) {
    if (file.size > MAX_UPLOAD) return { ok: false, error: `${file.name} ใหญ่เกิน 10 MB` };
  }

  for (const file of files) {
    const stored = `${requestId}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.name)}`;
    await putFile(stored, Buffer.from(await file.arrayBuffer()), file.type);
    await db.prepare(
      `INSERT INTO attachments (request_id, field_key, comment_id, filename, stored_name, mime, size, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      requestId, fieldKey, commentId, file.name, stored,
      file.type || "application/octet-stream", file.size, userId,
    );
  }
  await logAudit(requestId, userId, "ATTACH", files.map((f) => f.name).join(", "));
  return { ok: true, count: files.length };
}

export async function uploadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const fieldKey = String(form.get("field_key") ?? "");
  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (!(await canView(req, user))) return { error: "ไม่มีสิทธิ์" };

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "ยังไม่ได้เลือกไฟล์" };

  const saved = await saveAttachments({ requestId: id, userId: user.id, fieldKey, files });
  if (!saved.ok) return { error: saved.error };

  revalidatePath(`/requests/${id}`);
  return { ok: `แนบไฟล์แล้ว ${saved.count} รายการ` };
}

export async function deleteAttachmentAction(form: FormData) {
  const user = await requireUser();
  const attId = Number(form.get("attachment_id"));
  const row = (await db.prepare("SELECT * FROM attachments WHERE id = ?").get(attId)) as
    | { id: number; request_id: number; stored_name: string; uploaded_by: number; filename: string }
    | undefined;
  if (!row) return;
  if (row.uploaded_by !== user.id && user.role !== "ADMIN") return;

  await db.prepare("DELETE FROM attachments WHERE id = ?").run(attId);
  await deleteFile(row.stored_name);
  await logAudit(row.request_id, user.id, "DETACH", row.filename);
  revalidatePath(`/requests/${row.request_id}`);
}

/* ======================= บัญชีผู้ใช้ ======================= */

export async function changePasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser({ allowPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = form.get("confirm");

  if (next.length < 8) return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" };
  if (confirm !== null && String(confirm) !== next) return { error: "ยืนยันรหัสผ่านไม่ตรงกัน" };
  if (next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" };

  const row = (await db.prepare("SELECT password FROM users WHERE id=?").get(user.id)) as {
    password: string;
  };
  if (!verifyPassword(current, row.password)) return { error: "รหัสผ่านเดิมไม่ถูกต้อง" };

  // ล้างธงบังคับเปลี่ยนพร้อมกัน ไม่งั้นจะยังโดนเด้งกลับมาหน้านี้อีก
  await db.prepare("UPDATE users SET password=?, must_change_password=0 WHERE id=?")
    .run(hashPassword(next), user.id);
  revalidatePath("/", "layout");
  return { ok: "เปลี่ยนรหัสผ่านเรียบร้อย" };
}

export async function saveDepartmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "กรุณากรอกชื่อแผนก", values: { id: String(id), name } };

  try {
    if (id) (await db.prepare("UPDATE departments SET name=? WHERE id=?").run(name, id));
    else (await db.prepare("INSERT INTO departments (name) VALUES (?)").run(name));
  } catch (e) {
    const msg = (e as Error).message.includes("UNIQUE")
      ? "มีแผนกชื่อนี้อยู่แล้ว"
      : (e as Error).message;
    return { error: msg, values: { id: String(id), name } };
  }

  revalidatePath("/admin/departments");
  revalidatePath("/admin/users");
  return { ok: id ? "เปลี่ยนชื่อแผนกแล้ว" : "เพิ่มแผนกแล้ว" };
}

export async function toggleDepartmentAction(form: FormData) {
  await requireAdmin();
  await db.prepare("UPDATE departments SET active = 1 - active WHERE id = ?").run(Number(form.get("id")));
  revalidatePath("/admin/departments");
  revalidatePath("/admin/users");
}

/* ======================= admin: แม่แบบฟอร์ม ======================= */

/**
 * สร้างแม่แบบเปล่าแล้วเข้าหน้าตัวสร้างฟอร์มทันที
 *
 * ที่มา: เดิมต้องกรอกชื่อ รหัส ไอคอน หมวด และคำอธิบาย ในหน้าต่างซ้อนก่อนถึงจะเริ่มได้
 * ทั้งห้าช่องนั้นแก้ได้ในหน้าตัวสร้างฟอร์มอยู่แล้ว และตอนกดปุ่ม "สร้าง" คนยังไม่รู้ด้วยซ้ำ
 * ว่าฟอร์มจะออกมาหน้าตายังไง — การบังคับตั้งชื่อก่อนลงมือจึงเป็นด่านที่ไม่ได้ช่วยอะไร
 *
 * ตั้งชื่อและรหัสให้อัตโนมัติ แล้วให้เปลี่ยนทีหลังตอนรู้แล้วว่าฟอร์มนี้คืออะไร
 */
export async function createBlankTemplateAction() {
  await requireAdmin();
  const t = translator();

  const taken = db.prepare("SELECT 1 FROM form_templates WHERE code=?");
  let code = `FORM_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  while ((await taken.get(code))) code = `FORM_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const info = (await db
    .prepare(
      `INSERT INTO form_templates (code, name, category_id, icon, color, description, sort_order)
       VALUES (?,?,NULL,'ic:doc','','',0)`,
    )
    .run(code, t("admin.forms.untitled")));
  const newId = Number(info.lastInsertRowid);

  // ฟอร์มใหม่ต้องมีหัวเรื่องเสมอ ไม่งั้นเอกสารจะไม่มีชื่อ
  await db.prepare(
    `INSERT INTO form_fields (template_id, field_key, label, type, field_role, required, sort_order)
     VALUES (?, 'subject', ?, 'TEXT', 'TITLE', 1, 1)`,
  ).run(newId, t("admin.forms.subjectField"));

  revalidatePath("/admin/forms");
  revalidatePath("/");
  redirect(`/admin/forms/${newId}`);
}

export async function saveTemplateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = String(form.get("name") ?? "").trim();
  const catRaw = String(form.get("category_id") ?? "").trim();
  const category_id = catRaw === "" || catRaw === "0" ? null : Number(catRaw);
  // "ic:box" / "img:ชื่อไฟล์" / อีโมจิของเดิม — ยาวขึ้นกว่าเดิมเพราะต้องเก็บชื่อไฟล์ได้
  let icon = String(form.get("icon") ?? "").trim().slice(0, 80) || "ic:doc";

  // อัปโหลดรูปไอคอนมาด้วยไหม — ถ้ามีให้รูปชนะตัวเลือกไอคอนสำเร็จรูปเสมอ
  // เพราะคนเพิ่งเลือกไฟล์มาหมาด ๆ ย่อมตั้งใจใช้รูปนั้น
  const iconFile = form.get("icon_file");
  if (iconFile instanceof File && iconFile.size > 0) {
    if (!ICON_TYPES.has(iconFile.type)) {
      return { error: "ไอคอนรองรับเฉพาะไฟล์ PNG, JPG, WebP หรือ SVG" };
    }
    if (iconFile.size > 2_000_000) return { error: "ไฟล์ไอคอนต้องไม่เกิน 2 MB" };

    const ext =
      iconFile.type === "image/png" ? ".png"
        : iconFile.type === "image/webp" ? ".webp"
          : iconFile.type === "image/svg+xml" ? ".svg"
            : ".jpg";
    const stored = `ico-${id || 0}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    await putFile(stored, Buffer.from(await iconFile.arrayBuffer()), iconFile.type);
    icon = `img:${stored}`;
  }
  const colorRaw = String(form.get("color") ?? "").trim();
  const color = colorRaw in TEMPLATE_COLORS ? colorRaw : "";
  const description = String(form.get("description") ?? "").trim();
  const sort_order = Number(form.get("sort_order") ?? 0) || 0;
  const doc_prefix = String(form.get("doc_prefix") ?? "")
    .replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);

  if (!code) return { error: "กรุณากรอกรหัสแม่แบบ (ภาษาอังกฤษ)" };
  if (!name) return { error: "กรุณากรอกชื่อแม่แบบ" };

  let newId = id;
  try {
    if (id) {
      /* ตั้งค่าที่ถอดออกจากหน้าตั้งค่าแล้ว (บันทึกชื่อผู้กรอก · ยื่นล่วงหน้า · เคลียร์ OA ·
         ลายเซ็น) ไม่อยู่ในคำสั่งนี้อีก — ถ้ายังเขียนทับอยู่ ค่าที่เคยตั้งไว้จะถูกล้าง
         เป็นค่าเริ่มต้นทุกครั้งที่มีคนกดบันทึกชื่อฟอร์ม โดยไม่มีใครรู้ */
      await db.prepare(
        `UPDATE form_templates SET code=?, name=?, category_id=?, icon=?, color=?, description=?,
                                   sort_order=?, doc_prefix=?, updated_at=utc_now_text()
          WHERE id=?`,
      ).run(code, name, category_id, icon, color, description, sort_order, doc_prefix, id);
    } else {
      const info = (await db
        .prepare(
          `INSERT INTO form_templates (code, name, category_id, icon, color, description, sort_order)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(code, name, category_id, icon, color, description, sort_order));
      newId = Number(info.lastInsertRowid);
      // ฟอร์มใหม่ต้องมีหัวเรื่องเสมอ ไม่งั้นเอกสารจะไม่มีชื่อ
      await db.prepare(
        `INSERT INTO form_fields (template_id, field_key, label, type, field_role, required, sort_order)
         VALUES (?, 'subject', 'หัวข้อเรื่อง', 'TEXT', 'TITLE', 1, 1)`,
      ).run(newId);
    }
  } catch (e) {
    const msg = (e as Error).message.includes("UNIQUE")
      ? "มีแม่แบบที่ใช้รหัสนี้อยู่แล้ว"
      : (e as Error).message;
    return { error: msg };
  }

  revalidatePath("/admin/forms");
  revalidatePath("/");
  if (!id) redirect(`/admin/forms/${newId}`);
  return { ok: "บันทึกแม่แบบแล้ว" };
}

/** ตั้งค่าการพิมพ์ของแม่แบบ — เก็บเป็น JSON ก้อนเดียว (ดู src/lib/print.ts) */
export async function recordOaRefAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(form.get("request_id"));
  const ref = String(form.get("oa_ref") ?? "").trim().slice(0, 60);

  const req = await getRequest(id);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (!(await canView(req, user))) return { error: "ไม่มีสิทธิ์เข้าถึงคำขอนี้" };
  if (!req.clear_due_date) return { error: "คำขอนี้ไม่ได้ตั้งให้ติดตามการเคลียร์" };

  if (!ref) {
    // ล้างค่า = ยกเลิกการเคลียร์ เผื่อกรอกเลขผิดแล้วต้องแก้
    await db.prepare("UPDATE requests SET oa_ref='', cleared_at=NULL, cleared_by=NULL WHERE id=?").run(id);
    await logAudit(id, user.id, "CLEAR_UNDO", "ยกเลิกการบันทึกเลข OA", null);
    revalidatePath(`/requests/${id}`);
    revalidatePath("/");
    return { ok: "ล้างเลข OA แล้ว" };
  }

  await db.prepare(
    "UPDATE requests SET oa_ref=?, cleared_at=?, cleared_by=?, updated_at=utc_now_text() WHERE id=?",
  ).run(ref, new Date().toISOString(), user.id, id);
  await logAudit(id, user.id, "CLEAR_DONE", `เคลียร์ค่าใช้จ่ายใน OA เลขที่ ${ref}`, req.amount);
  revalidatePath(`/requests/${id}`);
  revalidatePath("/");
  return { ok: "บันทึกเลข OA แล้ว" };
}

export async function toggleTemplateAction(form: FormData) {
  await requireAdmin();
  await db.prepare("UPDATE form_templates SET active = 1 - active WHERE id = ?")
    .run(Number(form.get("id")));
  revalidatePath("/admin/forms");
  revalidatePath("/");
}

/**
 * ลบแม่แบบฟอร์ม — ได้เฉพาะฟอร์มที่ยังไม่เคยมีใครใช้
 *
 * เอกสารที่ยื่นไปแล้วอ้างแม่แบบไว้เพื่อรู้ว่า "ใบนี้เป็นคำขอชนิดไหน" และหน้ารายละเอียด
 * ก็อ่านนิยามฟิลด์จากแม่แบบเพื่อรู้ว่าค่าที่เก็บไว้แต่ละตัวคือช่องอะไร ลบแม่แบบทิ้ง
 * ทั้งที่มีเอกสารอยู่ = ประวัติการอนุมัติทั้งชุดอ่านไม่ออกอีกต่อไป
 *
 * ฐานข้อมูลกันไว้อยู่แล้ว (requests.template_id ไม่ได้ตั้ง CASCADE) แต่ถ้าปล่อยให้ชน
 * ที่ชั้นนั้น คนกดจะเจอข้อความ SQL ที่ไม่มีใครอ่านออก — จึงตรวจเองแล้วบอกเป็นภาษาคน
 * พร้อมทางออกที่ใช้ได้จริงคือ "ปิดใช้" ซึ่งซ่อนฟอร์มจากคนยื่นโดยไม่แตะของเก่า
 */
export async function deleteTemplateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const tpl = await getTemplate(id);
  if (!tpl) return { error: "ไม่พบแม่แบบฟอร์ม" };

  const used = (await db
    .prepare("SELECT COUNT(*) AS n FROM requests WHERE template_id = ?")
    .get(id)) as { n: number };
  if (used.n > 0) {
    return {
      error: `ลบไม่ได้ — มีเอกสารที่ใช้ฟอร์มนี้อยู่ ${used.n} ใบ · ใช้ "ปิดใช้" แทน ฟอร์มจะหายจากรายการของคนยื่นโดยเอกสารเดิมยังอ่านได้`,
    };
  }

  // ฟิลด์ คอลัมน์ และสายอนุมัติหายตามด้วย CASCADE ที่ตั้งไว้ในโครงตาราง
  await db.prepare("DELETE FROM form_templates WHERE id = ?").run(id);

  revalidatePath("/admin/forms");
  revalidatePath("/");
  return { ok: `ลบฟอร์ม "${tpl.name}" แล้ว` };
}

export async function saveCategoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "กรุณากรอกชื่อหมวด" };

  try {
    if (id) {
      await db.prepare("UPDATE form_categories SET name=? WHERE id=?").run(name, id);
    } else {
      // หมวดใหม่ต่อท้ายเสมอ — ลำดับปรับด้วยปุ่มลูกศรทีหลังได้
      const last = (await db
        .prepare("SELECT COALESCE(MAX(sort_order),0) AS n FROM form_categories")
        .get()) as { n: number };
      await db.prepare("INSERT INTO form_categories (name, sort_order) VALUES (?,?)")
        .run(name, last.n + 1);
    }
  } catch {
    return { error: "มีหมวดชื่อนี้อยู่แล้ว" };
  }

  revalidatePath("/admin/forms");
  revalidatePath("/");
  return { ok: id ? "บันทึกหมวดแล้ว" : "เพิ่มหมวดแล้ว" };
}

/**
 * สลับลำดับหมวดกับตัวที่อยู่ติดกัน
 *
 * ลำดับคือลำดับที่หมวดจะเรียงบนแถบหน้าแรก — เดิมให้กรอกเป็นตัวเลขเอง ซึ่งเป็นช่อง
 * ที่เดาไม่ออกว่าคืออะไร และต้องคิดเลขเองว่าจะแทรกหมวดใหม่ไว้กลาง ๆ ต้องใส่เท่าไร
 *
 * แยกเป็นสองแอ็กชันเพราะปุ่มที่ใช้ formAction เป็นฟังก์ชันใส่ name/value ของตัวเองไม่ได้
 */
async function moveCategory(id: number, dir: -1 | 1) {
  const cur = (await db.prepare("SELECT id, sort_order FROM form_categories WHERE id=?").get(id)) as
    | { id: number; sort_order: number }
    | undefined;
  if (!cur) return;

  const cmp = dir < 0 ? "<" : ">";
  const order = dir < 0 ? "DESC" : "ASC";
  const other = (await db
    .prepare(
      `SELECT id, sort_order FROM form_categories
        WHERE (sort_order ${cmp} ? OR (sort_order = ? AND id ${cmp} ?))
        ORDER BY sort_order ${order}, id ${order} LIMIT 1`,
    )
    .get(cur.sort_order, cur.sort_order, cur.id)) as { id: number; sort_order: number } | undefined;
  if (!other) return;

  await db.transaction(async () => {
    const upd = db.prepare("UPDATE form_categories SET sort_order=? WHERE id=?");
    const a = other.sort_order;
    const b = cur.sort_order;
    await upd.run(a === b ? a + dir : a, cur.id);
    await upd.run(b, other.id);
  })();

  revalidatePath("/admin/forms");
  revalidatePath("/");
}

export async function moveCategoryUpAction(form: FormData) {
  await requireAdmin();
  await moveCategory(Number(form.get("id")), -1);
}

export async function moveCategoryDownAction(form: FormData) {
  await requireAdmin();
  await moveCategory(Number(form.get("id")), 1);
}

/**
 * ลบหมวด — ฟอร์มที่อยู่ในหมวดนั้นไม่ได้หายไปด้วย แค่กลายเป็น "ไม่ระบุหมวด"
 *
 * ที่มา: หมวดเป็นแค่ป้ายจัดกลุ่มบนหน้าแคตตาล็อก ไม่ได้มีผลกับสายอนุมัติหรือเอกสาร
 * การบังคับให้ย้ายฟอร์มออกให้หมดก่อนถึงจะลบได้ จึงเป็นด่านที่ไม่ได้ปกป้องอะไรเลย
 */
export async function deleteCategoryAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!id) return;

  await db.transaction(async () => {
    await db.prepare("UPDATE form_templates SET category_id=NULL WHERE category_id=?").run(id);
    await db.prepare("DELETE FROM form_categories WHERE id=?").run(id);
  })();

  revalidatePath("/admin/forms");
  revalidatePath("/");
}

export async function saveFieldAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const template_id = Number(form.get("template_id"));
  const field_key = String(form.get("field_key") ?? "").trim().replace(/[^a-zA-Z0-9_]/g, "");
  const label = String(form.get("label") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "TEXT");
  const roleRaw = String(form.get("field_role") ?? "");
  const required = form.get("required") ? 1 : 0;
  const help = String(form.get("help") ?? "").trim();
  const placeholder = String(form.get("placeholder") ?? "").trim().slice(0, 120);
  // "<รหัสช่องตาราง>.<รหัสคอลัมน์>" — ตรวจว่าชี้ไปที่ของจริงด้านล่างอีกที
  const sumRaw = String(form.get("sum_of") ?? "").trim();
  const sort_order = Number(form.get("sort_order") ?? 0) || 0;
  const options = String(form.get("options") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);

  if (!field_key) return { error: "กรุณากรอกรหัสฟิลด์ (a-z, 0-9, _)" };
  if (!label) return { error: "กรุณากรอกชื่อฟิลด์" };
  if (!isFieldType(typeRaw)) return { error: "ชนิดฟิลด์ไม่ถูกต้อง" };
  // EVENT_DATE เคยตกหล่นจากรายการนี้ ทำให้ฟอร์มที่ตั้งวันจัดงานไว้ถูกล้างบทบาททิ้ง
  // ตอนแก้ช่องอื่น แล้วกฎ "ยื่นล่วงหน้ากี่วัน" ก็เงียบไปเฉย ๆ โดยไม่มีใครรู้
  const field_role =
    roleRaw === "TITLE" || roleRaw === "AMOUNT" || roleRaw === "DATE" ||
    roleRaw === "EVENT_DATE" || roleRaw === "PERIODS"
      ? roleRaw
      : "";
  // ยอดรวมจากตารางเป็นช่องวงเงินได้ — ฟอร์มแบบ "มีตารางรายการแล้วสรุปยอดข้างบน"
  // ต้องให้ยอดที่บวกได้เองเป็นตัวตัดสินสายอนุมัติ ไม่ใช่เลขที่คนกรอกพิมพ์ซ้ำอีกช่อง
  if (field_role === "AMOUNT" && typeRaw !== "MONEY" && typeRaw !== "NUMBER" && typeRaw !== "TOTAL") {
    return { error: "ฟิลด์วงเงินต้องเป็นชนิดจำนวนเงิน ตัวเลข หรือยอดรวมจากตาราง" };
  }
  if (field_role === "DATE" && typeRaw !== "DATE") return { error: "ฟิลด์วันที่ต้องเป็นชนิดวันที่" };
  if (field_role === "EVENT_DATE" && typeRaw !== "DATE") {
    return { error: "ฟิลด์วันที่เกิดค่าใช้จ่ายต้องเป็นชนิดวันที่" };
  }
  if (field_role === "PERIODS" && typeRaw !== "NUMBER") {
    return { error: "ฟิลด์จำนวนงวดต้องเป็นชนิดตัวเลข" };
  }

  // ช่องยอดรวมต้องชี้ไปที่คอลัมน์ตัวเลขที่มีอยู่จริง — ชี้ผิดแล้วจะได้ยอด 0 เงียบ ๆ
  // ซึ่งอันตรายกว่าตั้งค่าไม่สำเร็จ เพราะยอดนี้ใช้ตัดสินสายอนุมัติได้
  let sum_of = "";
  if (typeRaw === "TOTAL" && sumRaw) {
    const [tableKey, colKey] = sumRaw.split(".");
    const col = (await db
      .prepare(
        `SELECT c.id FROM form_table_columns c
           JOIN form_fields f ON f.id = c.field_id
          WHERE f.template_id=? AND f.field_key=? AND f.type='TABLE'
            AND c.col_key=? AND c.type IN ('NUMBER','MONEY')`,
      )
      .get(template_id, tableKey ?? "", colKey ?? ""));
    if (!col) return { error: "คอลัมน์ที่จะเอามาบวกไม่มีอยู่จริง" };
    sum_of = sumRaw;
  }

  // เงื่อนไขการแสดงช่อง — รับได้เฉพาะที่ชี้ไปยังช่องตัวเลือกซึ่งอยู่ "ก่อนหน้า" จริง
  // และค่าที่ตั้งต้องเป็นตัวเลือกที่มีอยู่จริง ไม่งั้นช่องจะหายไปตลอดกาลโดยไม่มีทางปลุก
  let show_if_key = String(form.get("show_if_key") ?? "").trim();
  let show_if_value = String(form.get("show_if_value") ?? "").trim();
  if (show_if_key) {
    const src = (await db
      .prepare(
        `SELECT type, options, sort_order FROM form_fields
          WHERE template_id=? AND field_key=? AND active=1`,
      )
      .get(template_id, show_if_key)) as
      | { type: string; options: string; sort_order: number }
      | undefined;
    const opts = src ? parseJson<string[]>(src.options, []) : [];
    const usable =
      src !== undefined &&
      (src.type === "SELECT" || src.type === "DROPDOWN" || src.type === "MULTISELECT") &&
      src.sort_order < sort_order &&
      opts.includes(show_if_value);
    if (!usable) {
      show_if_key = "";
      show_if_value = "";
    }
  } else {
    show_if_value = "";
  }

  try {
    await db.transaction(async () => {
      // บทบาทพิเศษมีได้ฟิลด์เดียวต่อแม่แบบ
      if (field_role) {
        await db.prepare(
          "UPDATE form_fields SET field_role='' WHERE template_id=? AND field_role=? AND id<>?",
        ).run(template_id, field_role, id);
      }
      if (id) {
        await db.prepare(
          `UPDATE form_fields SET field_key=?, label=?, type=?, field_role=?, required=?, help=?,
                                  placeholder=?, options=?, sum_of=?, show_if_key=?,
                                  show_if_value=?, sort_order=? WHERE id=?`,
        ).run(
          field_key, label, typeRaw, field_role, required, help, placeholder,
          JSON.stringify(options), sum_of, show_if_key, show_if_value, sort_order, id,
        );
      } else {
        await db.prepare(
          `INSERT INTO form_fields
             (template_id, field_key, label, type, field_role, required, help, placeholder,
              options, sum_of, show_if_key, show_if_value, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          template_id, field_key, label, typeRaw, field_role, required, help, placeholder,
          JSON.stringify(options), sum_of, show_if_key, show_if_value, sort_order,
        );
      }
    })();
  } catch (e) {
    const msg = (e as Error).message.includes("UNIQUE")
      ? "มีฟิลด์ที่ใช้รหัสนี้อยู่แล้วในแม่แบบนี้"
      : (e as Error).message;
    return { error: msg };
  }

  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: "บันทึกฟิลด์แล้ว" };
}

/**
 * เพิ่มคำถามเปล่าทันทีที่กดปุ่ม + (แบบ Google Form)
 * สร้างก่อนแล้วค่อยให้ผู้ใช้พิมพ์ทับ จะได้ไม่ต้องมีฟอร์ม "เพิ่มคำถาม" แยกต่างหาก
 */
export async function addFieldAction(form: FormData) {
  await requireAdmin();
  const templateId = Number(form.get("template_id"));
  const after = Number(form.get("after") ?? 0);
  // ปุ่ม "เพิ่มหัวข้อคั่น" กับ "เพิ่มตาราง" ใช้ทางเดียวกับปุ่มเพิ่มคำถาม
  // ต่างแค่ชนิดที่ตั้งให้ตอนสร้าง
  const typeRaw = String(form.get("type") ?? "TEXT");
  const type = isFieldType(typeRaw) ? typeRaw : "TEXT";

  const last = (await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM form_fields WHERE template_id=?")
    .get(templateId)) as { n: number };
  const at = after > 0 ? after + 1 : last.n + 1;

  let key = `q_${Date.now().toString(36).slice(-6)}`;
  const taken = db.prepare("SELECT 1 FROM form_fields WHERE template_id=? AND field_key=?");
  while ((await taken.get(templateId, key))) key = `q_${Math.random().toString(36).slice(2, 8)}`;

  await db.transaction(async () => {
    await db.prepare(
      "UPDATE form_fields SET sort_order = sort_order + 1 WHERE template_id=? AND sort_order >= ?",
    ).run(templateId, at);
    await db.prepare(
      `INSERT INTO form_fields (template_id, field_key, label, type, required, sort_order)
       VALUES (?,?,'',?,0,?)`,
    ).run(templateId, key, type, at);
  })();

  revalidatePath(`/admin/forms/${templateId}`);
}

/** แก้ชื่อ/คำอธิบายฟอร์มจากหัวการ์ด — บันทึกเงียบๆ ระหว่างพิมพ์ */
export async function updateTemplateHeadAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!id) return { error: "ไม่พบแม่แบบ" };
  if (!name) return { error: "กรุณากรอกชื่อฟอร์ม" };

  await db.prepare(
    "UPDATE form_templates SET name=?, description=?, updated_at=utc_now_text() WHERE id=?",
  ).run(name, description, id);

  revalidatePath(`/admin/forms/${id}`);
  revalidatePath("/");
  return { ok: "saved" };
}

/** ทำสำเนาฟิลด์ทั้งดุ้น รวมคอลัมน์ของตาราง — ปุ่ม "ทำสำเนา" แบบ Google Form */
export async function duplicateFieldAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const src = (await db.prepare("SELECT * FROM form_fields WHERE id=?").get(id)) as
    | {
        id: number; template_id: number; field_key: string; label: string; type: string;
        field_role: string; required: number; help: string; placeholder: string;
        options: string; sum_of: string; sort_order: number;
      }
    | undefined;
  if (!src) return;

  // หา field_key ที่ยังไม่ซ้ำ
  let key = `${src.field_key}_copy`;
  let n = 2;
  const taken = db.prepare("SELECT 1 FROM form_fields WHERE template_id=? AND field_key=?");
  while ((await taken.get(src.template_id, key))) key = `${src.field_key}_copy${n++}`;

  await db.transaction(async () => {
    const info = (await db
      .prepare(
        `INSERT INTO form_fields
           (template_id, field_key, label, type, field_role, required, help, placeholder,
            options, sum_of, sort_order)
         VALUES (?,?,?,?,'',?,?,?,?,?,?)`,
      )
      .run(
        src.template_id, key, `${src.label} (2)`, src.type,
        src.required, src.help, src.placeholder, src.options, src.sum_of, src.sort_order + 1,
      ));
    const newId = Number(info.lastInsertRowid);

    // ขยับฟิลด์ที่อยู่หลังลงไปหนึ่งช่อง เพื่อให้สำเนาอยู่ติดของเดิม
    await db.prepare(
      "UPDATE form_fields SET sort_order = sort_order + 1 WHERE template_id=? AND id<>? AND sort_order > ?",
    ).run(src.template_id, newId, src.sort_order);

    for (const c of (await db
      .prepare("SELECT * FROM form_table_columns WHERE field_id=?")
      .all(src.id)) as {
        col_key: string; label: string; type: string; required: number;
        options: string; unit: string; sort_order: number;
      }[]) {
      await db.prepare(
        `INSERT INTO form_table_columns
           (field_id, col_key, label, type, required, options, unit, sort_order)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(newId, c.col_key, c.label, c.type, c.required, c.options, c.unit, c.sort_order);
    }
  })();

  revalidatePath(`/admin/forms/${src.template_id}`);
}

/**
 * คัดลอกคำถามจากฟอร์มอื่นมาต่อท้ายฟอร์มนี้
 *
 * ฟอร์มขออนุมัติในองค์กรเดียวกันซ้ำกันเป็นครึ่งใบ (ผู้ติดต่อ เหตุผล เอกสารแนบ ตาราง SKU)
 * เดิมต้องพิมพ์ใหม่ทีละช่องทุกครั้งที่สร้างฟอร์มใหม่ ซึ่งนอกจากช้าแล้วยังทำให้ชื่อช่อง
 * เพี้ยนกันทีละนิดจนรายงานรวมข้ามฟอร์มไม่ได้
 *
 * ทุกใบที่ลอกมาได้ field_key ใหม่ที่ไม่ชนของเดิม ส่วนเงื่อนไขการแสดงช่องจะติดมาด้วย
 * เฉพาะเมื่อลอกช่องควบคุมของมันมาพร้อมกัน ไม่งั้นจะกลายเป็นช่องที่ไม่มีวันโผล่
 */
export async function importFieldsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const template_id = Number(form.get("template_id"));
  const source_id = Number(form.get("source_id"));
  const ids = form
    .getAll("ids")
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);

  if (!template_id || !source_id) return { error: "ไม่พบแม่แบบต้นทาง" };
  if (source_id === template_id) return { error: "เลือกฟอร์มอื่นที่ไม่ใช่ฟอร์มนี้" };
  if (ids.length === 0) return { error: "เลือกคำถามที่ต้องการคัดลอกอย่างน้อย 1 ข้อ" };

  type Row = {
    id: number; field_key: string; label: string; type: string; required: number;
    help: string; placeholder: string; options: string; sum_of: string;
    show_if_key: string; show_if_value: string; sort_order: number;
  };
  const rows = (await db
    .prepare(
      `SELECT * FROM form_fields
        WHERE template_id=? AND id IN (${ids.map(() => "?").join(",")})
        ORDER BY sort_order, id`,
    )
    .all(source_id, ...ids)) as Row[];
  if (rows.length === 0) return { error: "ไม่พบคำถามที่เลือก" };

  const taken = db.prepare("SELECT 1 FROM form_fields WHERE template_id=? AND field_key=?");
  const last = (await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM form_fields WHERE template_id=?")
    .get(template_id)) as { n: number };

  // ชื่อรหัสช่องใหม่ต้องรู้ล่วงหน้าทั้งชุด เพราะเงื่อนไขของช่องหลังอ้างถึงช่องหน้า
  const renamed = new Map<string, string>();
  const used = new Set<string>();
  for (const r of rows) {
    let key = r.field_key;
    let n = 2;
    while (used.has(key) || (await taken.get(template_id, key))) key = `${r.field_key}_${n++}`;
    used.add(key);
    renamed.set(r.field_key, key);
  }

  await db.transaction(() => {
    rows.forEach(async (r, i) => {
      const parent = renamed.get(r.show_if_key);

      // ช่องยอดรวมชี้ไปที่ตารางด้วย "รหัสช่อง" ซึ่งเปลี่ยนไปตอนคัดลอกข้ามฟอร์ม —
      // ถ้าตารางต้นทางไม่ได้ถูกคัดลอกมาด้วย ก็ไม่มีอะไรให้บวก ล้างทิ้งดีกว่าปล่อยให้
      // ชี้ไปหาช่องของฟอร์มอื่นที่บังเอิญใช้รหัสเดียวกัน
      const [sumTable, sumCol] = String(r.sum_of ?? "").split(".");
      const sumMapped = sumTable ? renamed.get(sumTable) : undefined;
      const sum_of = sumMapped && sumCol ? `${sumMapped}.${sumCol}` : "";

      const info = (await db
        .prepare(
          `INSERT INTO form_fields
             (template_id, field_key, label, type, field_role, required, help, placeholder,
              options, sum_of, show_if_key, show_if_value, sort_order)
           VALUES (?,?,?,?,'',?,?,?,?,?,?,?,?)`,
        )
        .run(
          template_id, renamed.get(r.field_key), r.label, r.type, r.required, r.help,
          r.placeholder, r.options, sum_of,
          parent ?? "", parent ? r.show_if_value : "", last.n + i + 1,
        ));
      const newId = Number(info.lastInsertRowid);

      for (const c of (await db
        .prepare("SELECT * FROM form_table_columns WHERE field_id=? ORDER BY sort_order, id")
        .all(r.id)) as {
          col_key: string; label: string; type: string; required: number;
          options: string; unit: string; sort_order: number;
        }[]) {
        await db.prepare(
          `INSERT INTO form_table_columns
             (field_id, col_key, label, type, required, options, unit, sort_order)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).run(newId, c.col_key, c.label, c.type, c.required, c.options, c.unit, c.sort_order);
      }
    });
  })();

  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: `คัดลอกมาแล้ว ${rows.length} ข้อ` };
}

/** เรียงฟิลด์ใหม่ตามลำดับ id ที่ส่งมา (ลากสลับหรือกดขึ้น/ลง) */
export async function reorderFieldsAction(form: FormData) {
  await requireAdmin();
  const templateId = Number(form.get("template_id"));
  const ids = String(form.get("order") ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length === 0) return;

  const stmt = db.prepare("UPDATE form_fields SET sort_order=? WHERE id=? AND template_id=?");
  await db.transaction(() => {
    ids.forEach(async (id, i) => (await stmt.run(i + 1, id, templateId)));
  })();
  revalidatePath(`/admin/forms/${templateId}`);
}

export async function deleteFieldAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const row = (await db.prepare("SELECT template_id FROM form_fields WHERE id=?").get(id)) as
    | { template_id: number } | undefined;
  await db.prepare("DELETE FROM form_fields WHERE id=?").run(id);
  if (row) revalidatePath(`/admin/forms/${row.template_id}`);
}

/**
 * เพิ่มคอลัมน์เปล่าต่อท้ายตารางด้วยคลิกเดียว แล้วค่อยตั้งชื่อทีหลัง
 *
 * ที่มา: เดิมต้องกรอกชื่อ รหัส ชนิด หน่วย ลำดับ ให้ครบก่อนถึงจะกดเพิ่มได้ ทั้งที่
 * รหัสคอลัมน์เป็นของที่ระบบใช้เองล้วน ๆ คนตั้งฟอร์มไม่เคยเห็นมันบนหน้าจอที่คนกรอกใช้
 * — เดาชื่อรหัสให้เลย แล้วให้คนตั้งฟอร์มสนใจแค่ "คอลัมน์นี้ชื่ออะไร ชนิดไหน"
 */
export async function addColumnAction(form: FormData) {
  await requireAdmin();
  const field_id = Number(form.get("field_id"));
  const template_id = Number(form.get("template_id"));
  if (!field_id) return;

  const last = (await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM form_table_columns WHERE field_id=?")
    .get(field_id)) as { n: number };

  let key = `c_${Date.now().toString(36).slice(-6)}`;
  const taken = db.prepare("SELECT 1 FROM form_table_columns WHERE field_id=? AND col_key=?");
  while ((await taken.get(field_id, key))) key = `c_${Math.random().toString(36).slice(2, 8)}`;

  await db.prepare(
    `INSERT INTO form_table_columns (field_id, col_key, label, type, required, options, unit, sort_order)
     VALUES (?,?,'','TEXT',0,'[]','',?)`,
  ).run(field_id, key, last.n + 1);

  revalidatePath(`/admin/forms/${template_id}`);
}

export async function saveColumnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const field_id = Number(form.get("field_id"));
  const template_id = Number(form.get("template_id"));
  const label = String(form.get("label") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "TEXT");
  const required = form.get("required") ? 1 : 0;
  const unit = String(form.get("unit") ?? "").trim().slice(0, 20);
  const options = String(form.get("options") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);

  if (!label) return { error: "กรุณากรอกชื่อคอลัมน์" };
  if (!isColumnType(typeRaw)) return { error: "ชนิดคอลัมน์ไม่ถูกต้อง" };

  try {
    if (id) {
      /*
       * แก้ได้ทุกอย่างยกเว้นรหัสคอลัมน์ — รหัสคือที่อยู่ของค่าในเอกสารทุกใบที่กรอกไปแล้ว
       * และเป็นที่อยู่ของไฟล์ที่แนบไว้ในเซลล์ เปลี่ยนเมื่อไหร่ข้อมูลเก่ากำพร้าทันที
       */
      await db.prepare(
        `UPDATE form_table_columns SET label=?, type=?, required=?, options=?, unit=?
          WHERE id=?`,
      ).run(label, typeRaw, required, JSON.stringify(options), unit, id);
    } else {
      const col_key = String(form.get("col_key") ?? "").trim().replace(/[^a-zA-Z0-9_]/g, "");
      const sort_order = Number(form.get("sort_order") ?? 0) || 0;
      if (!col_key) return { error: "กรุณากรอกรหัสคอลัมน์" };
      await db.prepare(
        `INSERT INTO form_table_columns
           (field_id, col_key, label, type, required, options, unit, sort_order)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        field_id, col_key, label, typeRaw, required, JSON.stringify(options), unit, sort_order,
      );
    }
  } catch (e) {
    const msg = (e as Error).message.includes("UNIQUE")
      ? "มีคอลัมน์รหัสนี้อยู่แล้ว"
      : (e as Error).message;
    return { error: msg };
  }
  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: id ? "บันทึกคอลัมน์แล้ว" : "เพิ่มคอลัมน์แล้ว" };
}

/**
 * สลับลำดับคอลัมน์กับตัวข้าง ๆ — ลำดับคอลัมน์คือลำดับที่คนกรอกอ่านจากซ้ายไปขวา
 *
 * แยกเป็นสองแอ็กชันแทนที่จะส่งทิศทางมากับฟอร์ม เพราะปุ่มที่ใช้ formAction เป็นฟังก์ชัน
 * จะใส่ name/value ของตัวเองไม่ได้ (React ใช้ช่องนั้นเก็บว่าจะเรียกแอ็กชันไหน)
 */
async function moveColumn(id: number, dir: -1 | 1, templateId: number) {
  const col = (await db.prepare("SELECT * FROM form_table_columns WHERE id=?").get(id)) as
    | { id: number; field_id: number; sort_order: number }
    | undefined;
  if (!col) return;

  const cmp = dir < 0 ? "<" : ">";
  const order = dir < 0 ? "DESC" : "ASC";
  const neighbour = (await db
    .prepare(
      `SELECT id, sort_order FROM form_table_columns
        WHERE field_id=?
          AND (sort_order ${cmp} ? OR (sort_order = ? AND id ${cmp} ?))
        ORDER BY sort_order ${order}, id ${order} LIMIT 1`,
    )
    .get(col.field_id, col.sort_order, col.sort_order, col.id)) as
    | { id: number; sort_order: number }
    | undefined;
  if (!neighbour) return;

  await db.transaction(async () => {
    const upd = db.prepare("UPDATE form_table_columns SET sort_order=? WHERE id=?");
    // ลำดับซ้ำกันได้ถ้าข้อมูลเก่าไม่เรียบร้อย — สลับแล้วยังซ้ำอยู่ ให้ดันตัวที่ย้ายไปก่อน/หลัง
    const a = neighbour.sort_order;
    const b = col.sort_order;
    await upd.run(a === b ? a + dir : a, col.id);
    await upd.run(b, neighbour.id);
  })();

  revalidatePath(`/admin/forms/${templateId}`);
}

export async function moveColumnLeftAction(form: FormData) {
  await requireAdmin();
  await moveColumn(Number(form.get("id")), -1, Number(form.get("template_id")));
}

export async function moveColumnRightAction(form: FormData) {
  await requireAdmin();
  await moveColumn(Number(form.get("id")), 1, Number(form.get("template_id")));
}

export async function deleteColumnAction(form: FormData) {
  await requireAdmin();
  await db.prepare("DELETE FROM form_table_columns WHERE id=?").run(Number(form.get("id")));
  revalidatePath(`/admin/forms/${Number(form.get("template_id"))}`);
}

/**
 * เพิ่มขั้นตอนเปล่าต่อท้ายสาย แล้วเปิดให้แก้ทันที
 *
 * ที่มา: เดิมกด "เพิ่มขั้นตอน" แล้วได้ฟอร์มที่ยังไม่มีตัวตนในฐานข้อมูล จึงใส่ผู้อนุมัติ
 * ไม่ได้ (การผูกคนต้องมี id ของขั้นก่อน) คนตั้งค่าเลยเจอฟอร์มที่ไม่มีช่องใส่คน
 * ต้องบันทึกก่อนแล้วค่อยกลับมาใส่ — ซึ่งไม่มีอะไรบนหน้าจอบอกไว้เลย
 *
 * สร้างจริงตั้งแต่กดปุ่ม ขั้นก็มี id ทันที ช่องใส่ผู้อนุมัติจึงใช้ได้เลย
 */
export async function addNodeAction(form: FormData) {
  await requireAdmin();
  const template_id = Number(form.get("template_id"));
  if (!template_id) return;

  const last = (await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM flow_nodes WHERE template_id=?")
    .get(template_id)) as { n: number };

  await db.prepare(
    `INSERT INTO flow_nodes (template_id, name, kind, mode, stage, sort_order, cond_field, cond_op, cond_value)
     VALUES (?, '', 'APPROVE', 'SEQUENTIAL', 'FINAL', ?, '', '', '')`,
  ).run(template_id, last.n + 1);

  revalidatePath(`/admin/forms/${template_id}`);
}

export async function saveNodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id") ?? 0);
  const template_id = Number(form.get("template_id"));
  const name = String(form.get("name") ?? "").trim();
  const kindRaw = String(form.get("kind") ?? "APPROVE");
  const modeRaw = String(form.get("mode") ?? "SEQUENTIAL");
  // สายอนุมัติเหลือสายเดียวแล้ว ขั้นที่ตั้งใหม่หรือแก้จึงเป็น FINAL เสมอ
  // ไม่รับค่าจากฟอร์ม เพื่อไม่ให้เกิดขั้นระดับเบื้องต้นใหม่ขึ้นมาอีก
  const stageRaw = "FINAL";
  // ลำดับมาจากการลากสลับการ์ด ไม่ใช่ช่องกรอก — ค่าที่ส่งมาคือลำดับเดิมของขั้นนั้น
  // (ขั้นที่เพิ่งสร้างจะได้เลขต่อท้ายสาย) จึงไม่ต้องให้คนตั้งมานั่งไล่เลขเอง
  const sort_order = Number(form.get("sort_order") ?? 1) || 1;
  const cond_field = String(form.get("cond_field") ?? "").trim();
  const condOpRaw = String(form.get("cond_op") ?? "");
  const cond_value = String(form.get("cond_value") ?? "").replace(/,/g, "").trim();

  if (!isNodeKind(kindRaw)) return { error: "ชนิดขั้นตอนไม่ถูกต้อง" };
  if (!isNodeMode(modeRaw)) return { error: "รูปแบบการอนุมัติไม่ถูกต้อง" };
  if (!isStage(stageRaw)) return { error: "ระดับการอนุมัติไม่ถูกต้อง" };
  if (!isCondOp(condOpRaw)) return { error: "เงื่อนไขไม่ถูกต้อง" };
  if (condOpRaw && !cond_field) return { error: "เลือกฟิลด์ที่ใช้เป็นเงื่อนไขด้วย" };

  if (id) {
    await db.prepare(
      `UPDATE flow_nodes SET name=?, kind=?, mode=?, stage=?, sort_order=?,
                             cond_field=?, cond_op=?, cond_value=? WHERE id=?`,
    ).run(name, kindRaw, modeRaw, stageRaw, sort_order, condOpRaw ? cond_field : "", condOpRaw, cond_value, id);
  } else {
    await db.prepare(
      `INSERT INTO flow_nodes
         (template_id, name, kind, mode, stage, sort_order, cond_field, cond_op, cond_value)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(template_id, name, kindRaw, modeRaw, stageRaw, sort_order, condOpRaw ? cond_field : "", condOpRaw, cond_value);
  }

  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: "บันทึกขั้นตอนแล้ว" };
}

/**
 * เรียงขั้นตอนใหม่ตามลำดับ id ที่ลากสลับมา
 *
 * ลำดับของสายอนุมัติคือ "ใครได้เอกสารก่อนหลัง" ซึ่งเป็นเรื่องเชิงพื้นที่ —
 * การให้พิมพ์เลขลำดับในช่องตัวเลขแปลว่าคนตั้งต้องแปลงภาพในหัวเป็นตัวเลขเอง
 * แล้วไล่แก้เลขของขั้นอื่นให้ไม่ชนกันเองด้วย ลากสลับจึงตรงกับสิ่งที่ต้องการจริง
 */
export async function reorderNodesAction(form: FormData) {
  await requireAdmin();
  const template_id = Number(form.get("template_id"));
  const ids = String(form.get("order") ?? "")
    .split(",")
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
  if (!template_id || ids.length === 0) return;

  const stmt = db.prepare("UPDATE flow_nodes SET sort_order=? WHERE id=? AND template_id=?");
  await db.transaction(() => {
    ids.forEach(async (id, i) => (await stmt.run(i + 1, id, template_id)));
  })();
  revalidatePath(`/admin/forms/${template_id}`);
}

export async function deleteNodeAction(form: FormData) {
  await requireAdmin();
  await db.prepare("DELETE FROM flow_nodes WHERE id=?").run(Number(form.get("id")));
  revalidatePath(`/admin/forms/${Number(form.get("template_id"))}`);
}

export async function toggleNodeAction(form: FormData) {
  await requireAdmin();
  await db.prepare("UPDATE flow_nodes SET active = 1 - active WHERE id=?").run(Number(form.get("id")));
  revalidatePath(`/admin/forms/${Number(form.get("template_id"))}`);
}

export async function saveNodeMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const node_id = Number(form.get("node_id"));
  const template_id = Number(form.get("template_id"));
  const source = form.get("source") === "USER" ? "USER" : "JOB_ROLE";
  const scope = form.get("scope") === "DEPT" ? "DEPT" : "ANY";
  const jobRoleRaw = String(form.get("job_role") ?? "");
  const user_id = Number(form.get("user_id") ?? 0) || null;

  if (source === "JOB_ROLE" && (!isJobRole(jobRoleRaw) || jobRoleRaw === "NONE")) {
    return { error: "กรุณาเลือกตำแหน่งงาน" };
  }
  if (source === "USER" && !user_id) return { error: "กรุณาเลือกบุคคล" };

  await db.prepare(
    "INSERT INTO flow_node_members (node_id, source, job_role, user_id, scope) VALUES (?,?,?,?,?)",
  ).run(node_id, source, source === "JOB_ROLE" ? jobRoleRaw : "", source === "USER" ? user_id : null, scope);

  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: "เพิ่มผู้รับผิดชอบแล้ว" };
}

export async function deleteNodeMemberAction(form: FormData) {
  await requireAdmin();
  await db.prepare("DELETE FROM flow_node_members WHERE id=?").run(Number(form.get("id")));
  revalidatePath(`/admin/forms/${Number(form.get("template_id"))}`);
}

/**
 * เพิ่มผู้อนุมัติจากรายชื่อ Central Login (พิมพ์ชื่อ Lark แล้วเลือก)
 *
 * แปลงคนที่เลือกให้เป็นแถวใน users (ยึดอีเมล) แล้วผูกเข้าขั้นเป็น source='USER'
 * จึงใช้ engine เดิม (สายอนุมัติ + แจ้งเตือน Lark ที่แปลงอีเมล→open_id) ได้โดยไม่ต้องแก้อะไร
 */
export async function addApproverFromDirectoryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const node_id = Number(form.get("node_id"));
  const template_id = Number(form.get("template_id"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();

  if (!node_id || !email) return { error: "กรุณาเลือกบุคคลจากรายชื่อ" };

  const user = await upsertDirectoryUser({ email, name });

  // กันซ้ำ: คนเดียวกันในขั้นเดียวกันไม่ต้องเพิ่มอีก
  const dup = (await db
    .prepare("SELECT 1 FROM flow_node_members WHERE node_id = ? AND source = 'USER' AND user_id = ?")
    .get(node_id, user.id));
  if (dup) return { error: `${user.name} อยู่ในขั้นนี้แล้ว` };

  await db.prepare(
    "INSERT INTO flow_node_members (node_id, source, job_role, user_id, scope) VALUES (?, 'USER', '', ?, 'ANY')",
  ).run(node_id, user.id);

  revalidatePath(`/admin/forms/${template_id}`);
  return { ok: `เพิ่ม ${user.name} เป็นผู้อนุมัติแล้ว` };
}

/* ---------- สำรองข้อมูล ---------- */

export async function runBackupAction(_prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const { runBackup } = await import("./backup");
  const r = await runBackup("MANUAL");
  revalidatePath("/admin/backup");
  if (!r.ok) return { error: `สำรองข้อมูลไม่สำเร็จ: ${r.error}` };
  return {
    ok: `สำรองข้อมูลแล้ว ${r.filename} (${(r.size / 1048576).toFixed(1)} MB` +
      `${r.filesAdded ? `, ไฟล์แนบใหม่ ${r.filesAdded} ไฟล์` : ""})`,
  };
}

/**
 * ย้ายไฟล์ที่ค้างบนดิสก์ขึ้นที่เก็บใหม่ — กดจากหน้าสำรองข้อมูล
 *
 * กดซ้ำได้ไม่เสียหาย ไฟล์ที่ส่งไปแล้วถูกข้าม และไม่ลบไฟล์บนดิสก์เลย
 */
export async function migrateFilesAction(_prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const { migrateLocalFiles } = await import("./migrate-files");
  const r = await migrateLocalFiles();
  revalidatePath("/admin/backup");

  if (r.error) return { error: r.error };
  if (r.total === 0) return { ok: "ไม่มีไฟล์บนดิสก์ให้ย้าย" };

  const mb = (r.bytes / 1048576).toFixed(1);
  if (!r.ok) {
    const first = r.failures.slice(0, 3).map((f) => `${f.name} (${f.reason})`).join(" · ");
    return {
      error:
        `ย้ายได้ ${r.sent} จาก ${r.total} ไฟล์ · ล้มเหลว ${r.failed} — ${first}` +
        `${r.failures.length > 3 ? ` และอีก ${r.failures.length - 3} ไฟล์` : ""}`,
    };
  }
  if (r.sent === 0) return { ok: `ย้ายครบอยู่แล้วทั้ง ${r.skipped} ไฟล์ ไม่มีอะไรต้องทำเพิ่ม` };
  return {
    ok: `ย้ายแล้ว ${r.sent} ไฟล์ (${mb} MB)` +
      `${r.skipped ? ` · ข้ามที่ย้ายไปแล้ว ${r.skipped} ไฟล์` : ""} · ไฟล์บนดิสก์ยังอยู่ครบ`,
  };
}

/* ---------- เตือนงานค้าง ---------- */

export async function sweepRemindersAction(_prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const { sweep } = await import("./reminders");
  const { flushInBackground } = await import("./lark/notify");
  // สั่งเองคือตั้งใจให้ส่งเดี๋ยวนี้ จึงข้ามทั้งเวลาทำการและกติกาวันละครั้ง
  const r = await sweep({ force: true });
  flushInBackground();
  revalidatePath("/admin/reminders");
  return {
    ok: `ตรวจแล้ว — ค้าง ${r.stale} รายการ ทวง ${r.reminded} แจ้งหัวหน้า ${r.escalated}`,
  };
}

/* ---------- มอบหมายให้อนุมัติแทน ---------- */

/** ผู้ใช้ทั่วไปตั้งของตัวเองได้ ผู้ดูแลตั้งแทนคนอื่นได้ */
export async function saveDelegationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { saveDelegation } = await import("./delegation");

  const asked = Number(form.get("from_user") ?? 0) || user.id;
  if (asked !== user.id && user.role !== "ADMIN") {
    return { error: "ตั้งการมอบหมายแทนคนอื่นได้เฉพาะผู้ดูแลระบบ" };
  }

  const r = await saveDelegation({
    id: Number(form.get("id") ?? 0) || undefined,
    fromUser: asked,
    toUser: Number(form.get("to_user") ?? 0),
    fromDate: String(form.get("from_date") ?? ""),
    toDate: String(form.get("to_date") ?? ""),
    reason: String(form.get("reason") ?? "").trim(),
    createdBy: user.id,
  });
  if (r.error) return { error: r.error };

  revalidatePath("/profile");
  revalidatePath("/admin/delegations");
  return { ok: "บันทึกการมอบหมายแล้ว" };
}

export async function deleteDelegationAction(form: FormData) {
  const user = await requireUser();
  const { deleteDelegation } = await import("./delegation");
  const id = Number(form.get("id"));

  const row = (await db.prepare("SELECT from_user FROM delegations WHERE id=?").get(id)) as
    | { from_user: number }
    | undefined;
  if (!row) return;
  if (row.from_user !== user.id && user.role !== "ADMIN") return;

  await deleteDelegation(id);
  revalidatePath("/profile");
  revalidatePath("/admin/delegations");
}

/* ---------- ลายเซ็น ---------- */

const SIGNATURE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function saveSignatureAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const file = form.get("signature");

  if (form.get("remove") === "1") {
    const old = String(
      ((await db.prepare("SELECT signature FROM users WHERE id=?").get(user.id)) as { signature: string })
        ?.signature ?? "",
    );
    if (old) await deleteFile(old);
    await db.prepare("UPDATE users SET signature='' WHERE id=?").run(user.id);
    revalidatePath("/profile");
    return { ok: "ลบลายเซ็นแล้ว" };
  }

  if (!(file instanceof File) || file.size === 0) return { error: "กรุณาเลือกไฟล์รูปลายเซ็น" };
  // จำกัดชนิดไฟล์ตรงนี้ ไม่ใช่เชื่อ MIME ที่เบราว์เซอร์ส่งมาอย่างเดียว
  if (!SIGNATURE_TYPES.has(file.type)) return { error: "รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP" };
  if (file.size > 1_000_000) return { error: "ไฟล์ลายเซ็นต้องไม่เกิน 1 MB" };

  const ext = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
  const stored = `sig-${user.id}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await putFile(stored, Buffer.from(await file.arrayBuffer()), file.type);

  const old = ((await db.prepare("SELECT signature FROM users WHERE id=?").get(user.id)) as
    | { signature: string }
    | undefined)?.signature;
  if (old) await deleteFile(old);

  await db.prepare("UPDATE users SET signature=? WHERE id=?").run(stored, user.id);
  revalidatePath("/profile");
  return { ok: "บันทึกลายเซ็นแล้ว" };
}

/* ---------- ออกเอกสาร ---------- */

export async function issueDocumentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { issueDocument } = await import("./issue");
  const requestId = Number(form.get("request_id"));

  const req = await getRequest(requestId);
  if (!req) return { error: "ไม่พบคำขอ" };
  if (!(await canView(req, user))) return { error: "ไม่มีสิทธิ์เข้าถึงคำขอนี้" };

  const r = await issueDocument({
    requestId,
    docType: String(form.get("doc_type") ?? "OTHER") as never,
    note: String(form.get("note") ?? "").trim(),
    userId: user.id,
  });
  if (r.error) return { error: r.error };

  revalidatePath(`/requests/${requestId}`);
  return { ok: `ออกเอกสารเลขที่ ${r.doc!.doc_number} แล้ว` };
}

export async function voidDocumentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const { voidDocument } = await import("./issue");
  const r = await voidDocument(Number(form.get("id")), String(form.get("reason") ?? ""), user.id);
  if (r.error) return { error: r.error };
  revalidatePath(`/requests/${r.doc!.request_id}`);
  return { ok: "ยกเลิกเอกสารแล้ว" };
}

/* ---------- ผู้ดูแลออกรหัสชั่วคราวให้พนักงาน ---------- */

/**
 * สุ่มรหัสที่พิมพ์ต่อทางโทรศัพท์ได้ไม่ผิด
 * ตัด 0/O/1/l/I ออก เพราะอ่านออกเสียงแล้วแยกไม่ออก
 */
function tempPassword(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join("");
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}

