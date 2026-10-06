"use client";

import { useActionState, useState } from "react";
import { voidApprovedAction, type ActionState } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import { IconTrash } from "@/components/icons";
import { SubmitButton } from "@/components/ui";

const initial: ActionState = {};

/**
 * ยกเลิกเอกสารที่อนุมัติไปแล้ว (ผู้ดูแลระบบเท่านั้น)
 *
 * ซ่อนไว้หลังปุ่มเดียวและบังคับพิมพ์เหตุผลก่อน เพราะเป็นการลบล้างสิ่งที่ผู้อนุมัติ
 * ตัดสินใจไว้แล้ว — ไม่ควรกดพลาดได้ง่ายเท่าปุ่มอื่นในหน้าเดียวกัน
 */
export default function VoidApproved({ requestId }: { requestId: number }) {
  const t = useT();
  const [state, action] = useActionState(voidApprovedAction, initial);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost gap-1.5 text-no">
          <IconTrash className="h-4 w-4" />
          {t("void.open")}
        </button>
        {state.ok && <p className="text-xs text-ok">{state.ok}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="request_id" value={requestId} />
      <p className="text-sm text-text-soft">{t("void.hint")}</p>
      <input
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("void.reasonPlaceholder")}
        className="input"
      />
      {state.error && <p className="text-xs text-no">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          className="btn-ghost text-no"
          pendingText={t("void.working")}
          onClickConfirm={t("void.confirm")}
          disabled={!reason.trim()}
        >
          {t("void.submit")}
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
