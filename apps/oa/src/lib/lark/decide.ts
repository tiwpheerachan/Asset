import "server-only";
import { revalidatePath } from "next/cache";
import { applyDecision } from "../approval";
import { getRequest, listTransferCandidates } from "../queries";
import { approvalCard, resultCard, transferPickCard } from "./card";
import { closeCards, flushInBackground } from "./notify";
import { larkConfig } from "./config";
import { isLocale } from "../i18n/locales";
import { transferQueue, TRANSFER_ERROR } from "../transfer";
import type { User } from "../types";

type Outcome = {
  ok: boolean;
  messageKey: string;
  card?: unknown;
};

/**
 * กดปุ่มบนการ์ดใน Lark → ใช้ตรรกะเดียวกับหน้าเว็บทุกประการ
 *
 * ข้อจำกัดที่ยอมรับ: การกดจากการ์ดไม่มีช่องพิมพ์เหตุผล จึงใส่ข้อความมาตรฐานให้
 * เมื่อ "ไม่อนุมัติ" (ระบบบังคับต้องมีเหตุผลเสมอ) — ถ้าต้องการเขียนเหตุผลเอง
 * ให้กดปุ่มเปิดในระบบแล้วทำจากหน้าเว็บ
 */
export async function decideFromLark({
  user,
  approverRowId,
  requestId,
  decision,
}: {
  user: User;
  approverRowId: number;
  requestId: number;
  decision: "APPROVE" | "REJECT";
}): Promise<Outcome> {
  const locale = isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;

  const result = await applyDecision({
    user,
    requestId,
    decision,
    comment: decision === "REJECT" ? "ไม่อนุมัติผ่าน Lark" : "",
    approverRowId,
  });

  if (!result.ok) {
    const key =
      result.reason === "NOT_FOUND"
        ? "lark.err.notFound"
        : result.reason === "NOT_PENDING"
          ? "lark.err.alreadyClosed"
          : result.reason === "NEED_COMMENT"
            ? "lark.err.needComment"
            : "lark.err.notYourTurn";

    const request = await getRequest(requestId);
    return {
      ok: false,
      messageKey: key,
      card: request ? resultCard({ request, locale, outcome: "DONE" }) : undefined,
    };
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/");

  // ปุ่มบนการ์ดของคนอื่นในขั้นเดียวกันต้องหายไปด้วย (กรณี "ใครก็ได้ 1 คน")
  void closeCards(requestId, `${user.name}`).catch(() => {});
  flushInBackground();

  return {
    ok: true,
    messageKey: decision === "APPROVE" ? "lark.ok.approved" : "lark.ok.rejected",
    card: resultCard({
      request: result.request,
      locale,
      outcome: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      actorName: user.name,
    }),
  };
}

/**
 * ปุ่ม "ถ่ายโอน" บนการ์ด — สองจังหวะ เพราะการ์ดไม่มีตัวเลือกคน
 * จังหวะแรกเปลี่ยนการ์ดเป็นรายชื่อ จังหวะที่สองคือโอนจริง
 */
export async function transferPicker({
  user,
  requestId,
  approverRowId,
}: {
  user: User;
  requestId: number;
  approverRowId: number;
}): Promise<Outcome> {
  const locale = isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;
  const request = await getRequest(requestId);
  if (!request) return { ok: false, messageKey: "lark.err.notFound" };

  const { rows, more } = await listTransferCandidates(requestId, user.id);
  if (rows.length === 0) return { ok: false, messageKey: "lark.err.noTransferTarget" };

  return {
    ok: true,
    messageKey: "lark.card.transferPick",
    card: transferPickCard({ request, approverRowId, candidates: rows, locale, more }),
  };
}

/** กลับไปการ์ดเดิมโดยไม่ทำอะไร — ปุ่มยกเลิกในหน้าจอเลือกคน */
export async function transferCancel({
  user,
  requestId,
  approverRowId,
  stepName = "",
}: {
  user: User;
  requestId: number;
  approverRowId: number;
  stepName?: string;
}): Promise<Outcome> {
  const locale = isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;
  const request = await getRequest(requestId);
  if (!request) return { ok: false, messageKey: "lark.err.notFound" };

  return {
    ok: true,
    messageKey: "lark.ok.cancelled",
    card: approvalCard({ request, approverRowId, stepName, locale }),
  };
}

export async function transferFromLark({
  user,
  requestId,
  toId,
}: {
  user: User;
  requestId: number;
  toId: number;
}): Promise<Outcome> {
  const locale = isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;
  const result = await transferQueue({ user, requestId, toId, note: "ถ่ายโอนผ่าน Lark" });

  const request = await getRequest(requestId);
  if (!result.ok) {
    return {
      ok: false,
      messageKey: TRANSFER_ERROR[result.reason],
      card: request ? resultCard({ request, locale, outcome: "DONE" }) : undefined,
    };
  }

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/");
  flushInBackground();

  return {
    ok: true,
    messageKey: "lark.ok.transferred",
    card: request
      ? resultCard({ request, locale, outcome: "DONE", actorName: user.name, note: result.targetName })
      : undefined,
  };
}
