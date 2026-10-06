import "server-only";
import { larkConfig } from "./config";
import { translator } from "../i18n";
import { formatDate, money } from "../format";
import type { Locale } from "../i18n/locales";
import type { RequestWithMeta } from "../types";

/**
 * การ์ดโต้ตอบของ Lark (message card v2)
 * ปุ่มบนการ์ดส่งค่าใน `value` กลับมาที่ callback ของเรา — ค่านี้คือสิ่งที่ระบุว่า
 * ใครกดอนุมัติเอกสารไหนในขั้นไหน
 */
export type CardAction = {
  /**
   * TRANSFER     = ขอดูรายชื่อคนที่โอนให้ได้ (ยังไม่โอน)
   * TRANSFER_TO  = เลือกคนแล้ว โอนจริงตรงนี้
   * CANCEL       = ออกจากหน้าจอเลือกคน กลับไปการ์ดเดิม
   */
  act: "APPROVE" | "REJECT" | "OPEN" | "TRANSFER" | "TRANSFER_TO" | "CANCEL";
  /** id ของแถวใน request_approvers — ผูกกับทั้งคำขอ ขั้น และตัวบุคคล */
  ap: number;
  req: number;
  /** ผู้รับโอน — ใช้เฉพาะ TRANSFER_TO */
  to?: number;
};

const TONE = {
  APPROVE: "green",
  PENDING: "orange",
  REJECT: "red",
  INFO: "blue",
} as const;

type Row = { label: string; value: string };

function fieldRows(req: RequestWithMeta, locale: Locale, t: ReturnType<typeof translator>): Row[] {
  const rows: Row[] = [
    { label: t("table.requester"), value: req.requester_name },
    { label: t("detail.type"), value: `${req.template_icon} ${req.template_name}` },
    { label: t("table.date"), value: formatDate(req.doc_date, locale) },
  ];
  if (req.requester_department) {
    rows.push({ label: t("detail.department"), value: req.requester_department });
  }
  if (req.amount !== null) {
    rows.push({ label: t("table.amount"), value: money(req.amount, locale) });
  }
  return rows;
}

const escape = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

function fieldBlock(rows: Row[]) {
  return {
    tag: "div",
    fields: rows.map((r) => ({
      is_short: true,
      text: { tag: "lark_md", content: `**${escape(r.label)}**\n${escape(r.value)}` },
    })),
  };
}

function linkButton(req: RequestWithMeta, label: string, hash = "") {
  const cfg = larkConfig();
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type: "default",
    url: `${cfg.baseUrl}/requests/${req.id}${hash}`,
  };
}

/**
 * การ์ดขออนุมัติ — มีปุ่มอนุมัติ / ไม่อนุมัติ กดจบได้ในแชท
 * ถ้าส่ง waitingDays มาด้วย จะกลายเป็นการ์ดทวงงานค้าง — ใช้ใบเดิม ไม่ใช่การ์ดใหม่
 * เพราะคนที่โดนทวงต้องกดอนุมัติได้ทันทีตรงนั้น ไม่ใช่ต้องไปเปิดหาการ์ดเก่า
 */
export function approvalCard({
  request,
  approverRowId,
  stepName,
  locale,
  waitingDays = 0,
}: {
  request: RequestWithMeta;
  approverRowId: number;
  stepName: string;
  locale: Locale;
  waitingDays?: number;
}) {
  const t = translator(locale);
  const value = (act: CardAction["act"]): CardAction => ({
    act,
    ap: approverRowId,
    req: request.id,
  });

  const nudging = waitingDays > 0;

  return {
    config: { wide_screen_mode: true },
    header: {
      template: nudging ? TONE.REJECT : TONE.PENDING,
      title: {
        tag: "plain_text",
        content: `${nudging ? t("lark.card.reminder") : t("lark.card.needApproval")} · ${request.doc_no}`,
      },
    },
    elements: [
      ...(nudging
        ? [{
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**${escape(t("lark.card.waitingDays").replace("{d}", String(waitingDays)))}**`,
            },
          }]
        : []),
      {
        tag: "div",
        text: { tag: "lark_md", content: `**${escape(request.title || t("table.noSubject"))}**` },
      },
      fieldBlock(fieldRows(request, locale, t)),
      { tag: "hr" },
      {
        tag: "div",
        text: { tag: "lark_md", content: `${t("lark.card.step")}: ${escape(stepName)}` },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: t("lark.card.approve") },
            type: "primary",
            value: value("APPROVE"),
            confirm: {
              title: { tag: "plain_text", content: t("lark.card.approve") },
              text: { tag: "plain_text", content: t("decide.confirmApprove") },
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: t("lark.card.reject") },
            type: "danger",
            value: value("REJECT"),
            confirm: {
              title: { tag: "plain_text", content: t("lark.card.reject") },
              text: { tag: "plain_text", content: t("lark.card.rejectConfirm") },
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: t("lark.card.transfer") },
            type: "default",
            value: value("TRANSFER"),
          },
          // สองปุ่มนี้พาไปหน้าเว็บให้ตรงจุด ไม่ใช่กดจบในแชท — การ์ดของ Lark
          // ไม่มีช่องพิมพ์ข้อความและไม่มีตัวอัปโหลดไฟล์ให้ใช้เลย
          linkButton(request, t("lark.card.comment"), "?tab=comments"),
          linkButton(request, t("lark.card.attach")),
        ],
      },
    ],
  };
}

/**
 * การ์ดเลือกผู้รับโอน — ขั้นที่สองของการถ่ายโอน
 *
 * การ์ด Lark ไม่มีช่องค้นหาคน จึงต้องยกรายชื่อมาเป็นปุ่มให้กด และยกได้จำกัด
 * เลยตัดเหลือชุดที่พอกดได้จริง แล้วมีทางออกไปหน้าเว็บสำหรับคนที่ไม่อยู่ในรายการ
 */
export function transferPickCard({
  request,
  approverRowId,
  candidates,
  locale,
  more,
}: {
  request: RequestWithMeta;
  approverRowId: number;
  candidates: { id: number; name: string }[];
  locale: Locale;
  /** ยังมีคนอื่นอีกที่ไม่ได้ยกมาแสดง */
  more: boolean;
}) {
  const t = translator(locale);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: TONE.INFO,
      title: { tag: "plain_text", content: `${t("lark.card.transfer")} · ${request.doc_no}` },
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: escape(t("lark.card.transferPick")) },
      },
      {
        tag: "action",
        actions: [
          ...candidates.map((c) => ({
            tag: "button",
            text: { tag: "plain_text", content: c.name },
            type: "default",
            value: { act: "TRANSFER_TO", ap: approverRowId, req: request.id, to: c.id },
          })),
          ...(more ? [linkButton(request, t("lark.card.transferMore"))] : []),
          {
            tag: "button",
            text: { tag: "plain_text", content: t("common.cancel") },
            type: "default",
            value: { act: "CANCEL", ap: approverRowId, req: request.id },
          },
        ],
      },
    ],
  };
}

/** การ์ดหลังมีคนกดแล้ว — ปุ่มหายไป เหลือผลลัพธ์ */
export function resultCard({
  request,
  locale,
  outcome,
  actorName,
  note,
}: {
  request: RequestWithMeta;
  locale: Locale;
  outcome: "APPROVED" | "REJECTED" | "RETURNED" | "DONE";
  actorName?: string;
  note?: string;
}) {
  const t = translator(locale);
  const tone =
    outcome === "REJECTED" ? TONE.REJECT : outcome === "RETURNED" ? TONE.PENDING : TONE.APPROVE;
  const headline =
    outcome === "APPROVED"
      ? t("lark.card.youApproved")
      : outcome === "REJECTED"
        ? t("lark.card.youRejected")
        : outcome === "RETURNED"
          ? t("status.RETURNED")
          : t("lark.card.finished");

  const elements: unknown[] = [
    {
      tag: "div",
      text: { tag: "lark_md", content: `**${escape(request.title || t("table.noSubject"))}**` },
    },
    fieldBlock(fieldRows(request, locale, t)),
  ];
  if (actorName) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `${escape(actorName)}${note ? ` — ${escape(note)}` : ""}` },
    });
  }
  elements.push({ tag: "action", actions: [linkButton(request, t("lark.card.open"))] });

  return {
    config: { wide_screen_mode: true },
    header: {
      template: tone,
      title: { tag: "plain_text", content: `${headline} · ${request.doc_no}` },
    },
    elements,
  };
}

/**
 * การ์ดแจ้งให้ทราบ — ไม่มีปุ่มตัดสิน
 *
 * ใช้ทั้งขั้น "สำเนาถึง" ในสายอนุมัติ และกรณีถูกระบุชื่อไว้ในช่องของฟอร์ม
 * เนื้อการ์ดเหมือนกัน ต่างแค่หัวการ์ดที่บอกว่าทำไมถึงได้รับใบนี้ — ซึ่งเป็นสิ่งแรก
 * ที่คนรับอยากรู้ ถ้าใช้หัวเดียวกันหมดจะแยกไม่ออกว่าเป็นสำเนาตามสายหรือมีคนระบุชื่อมา
 */
export function ccCard({
  request,
  locale,
  mentionIn,
}: {
  request: RequestWithMeta;
  locale: Locale;
  /** ชื่อช่องที่ระบุชื่อผู้รับไว้ — มีค่าเมื่อเป็นการถูกระบุชื่อ ไม่ใช่ขั้นสำเนาถึง */
  mentionIn?: string;
}) {
  const t = translator(locale);
  const title = mentionIn
    ? `${t("lark.card.mention")} (${mentionIn}) · ${request.doc_no}`
    : `${t("lark.card.cc")} · ${request.doc_no}`;
  return {
    config: { wide_screen_mode: true },
    header: {
      template: TONE.INFO,
      title: { tag: "plain_text", content: title },
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: `**${escape(request.title || t("table.noSubject"))}**` },
      },
      fieldBlock(fieldRows(request, locale, t)),
      { tag: "action", actions: [linkButton(request, t("lark.card.open"))] },
    ],
  };
}

/** การ์ดแจ้งผู้จัดทำว่าเอกสารเดินต่อไปถึงไหนแล้ว */
export function statusCard({
  request,
  locale,
  note,
}: {
  request: RequestWithMeta;
  locale: Locale;
  note?: string;
}) {
  const t = translator(locale);
  const tone =
    request.status === "REJECTED"
      ? TONE.REJECT
      : request.status === "APPROVED"
        ? TONE.APPROVE
        : request.status === "RETURNED"
          ? TONE.PENDING
          : TONE.INFO;

  const elements: unknown[] = [
    {
      tag: "div",
      text: { tag: "lark_md", content: `**${escape(request.title || t("table.noSubject"))}**` },
    },
    fieldBlock(fieldRows(request, locale, t)),
  ];
  if (note) elements.push({ tag: "div", text: { tag: "lark_md", content: escape(note) } });
  elements.push({ tag: "action", actions: [linkButton(request, t("lark.card.open"))] });

  return {
    config: { wide_screen_mode: true },
    header: {
      template: tone,
      title: {
        tag: "plain_text",
        content: `${t(`status.${request.status}`)} · ${request.doc_no}`,
      },
    },
    elements,
  };
}

/**
 * การ์ดแจ้งหัวหน้าและผู้ยื่นว่าเอกสารค้างเกินกำหนด
 * ตั้งใจไม่ใส่ปุ่มอนุมัติ — คนกลุ่มนี้ไม่ใช่คิวของเรื่องนี้ หน้าที่คือรู้ว่าค้างที่ใคร
 */
export function escalationCard({
  request,
  locale,
  days,
  approverName,
  stepName,
}: {
  request: RequestWithMeta;
  locale: Locale;
  days: number;
  approverName: string;
  stepName: string;
}) {
  const t = translator(locale);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: TONE.REJECT,
      title: { tag: "plain_text", content: `${t("lark.card.escalation")} · ${request.doc_no}` },
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: `**${escape(request.title || t("table.noSubject"))}**` },
      },
      fieldBlock([
        ...fieldRows(request, locale, t),
        { label: t("lark.card.stuckAt"), value: `${approverName}${stepName ? ` (${stepName})` : ""}` },
        { label: t("lark.card.waiting"), value: t("lark.card.waitingDays").replace("{d}", String(days)) },
      ]),
      { tag: "action", actions: [linkButton(request, t("lark.card.open"))] },
    ],
  };
}

/** การ์ดสั้นๆ สำหรับปุ่ม "ทดสอบการเชื่อมต่อ" */
export function testCard(locale: Locale) {
  const t = translator(locale);
  return {
    config: { wide_screen_mode: true },
    header: {
      template: TONE.APPROVE,
      title: { tag: "plain_text", content: t("lark.test.title") },
    },
    elements: [{ tag: "div", text: { tag: "lark_md", content: t("lark.test.body") } }],
  };
}
