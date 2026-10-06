"use client";

import { useActionState, useState } from "react";
import { decideAction, type ActionState } from "@/lib/actions";
import { SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import { IconCheckCircle, IconAlert } from "@/components/icons";

const initial: ActionState = {};

/**
 * อนุมัติ/ไม่อนุมัติจากหน้ารายการ โดยไม่ต้องเปิดเอกสาร
 *
 * ผู้อนุมัติที่มีงานค้างสิบใบเดิมต้องกดเข้า-ออกสิบรอบ ทั้งที่หลายใบตัดสินได้จากบรรทัดเดียว
 * (เรื่องอะไร ของใคร เท่าไหร่)
 *
 * ตั้งใจ "ไม่" ทำเป็นปุ่มกดครั้งเดียวจบ — การอนุมัติย้อนคืนไม่ได้ และปุ่มที่อยู่ในรายการยาว
 * กดพลาดง่ายกว่าปุ่มในหน้าเอกสารมาก จึงให้กดแล้วเปิดแผงยืนยันก่อนเสมอ
 * ส่วนการตรวจสิทธิ์จริงอยู่ที่ applyDecision ฝั่งเซิร์ฟเวอร์เหมือนเดิม ไม่ได้เชื่อปุ่มนี้
 */
export default function QuickDecide({
  requestId,
  title,
}: {
  requestId: number;
  title: string;
}) {
  const t = useT();
  const [state, action] = useActionState(decideAction, initial);
  const [panel, setPanel] = useState<"" | "APPROVE" | "REJECT">("");

  if (state.ok) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ok">
        <IconCheckCircle className="h-3.5 w-3.5" /> {state.ok}
      </p>
    );
  }

  return (
    <div className="mt-1">
      {panel === "" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPanel("APPROVE")}
                  className="btn btn-soft px-2.5 py-1 text-xs">
            {t("decide.approve")}
          </button>
          <button type="button" onClick={() => setPanel("REJECT")}
                  className="btn btn-ghost px-2.5 py-1 text-xs text-no">
            {t("decide.reject")}
          </button>
        </div>
      ) : (
        <form action={action} className="space-y-2 rounded-xl bg-surface-2 p-2.5 ring-1 ring-border">
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="decision" value={panel} />

          <p className="text-xs text-text-soft">
            {panel === "APPROVE"
              ? t("quick.confirmApprove", { title })
              : t("quick.confirmReject", { title })}
          </p>

          {/* ไม่อนุมัติต้องมีเหตุผลเสมอ — ผู้จัดทำต้องรู้ว่าต้องแก้อะไร
              ส่วนอนุมัติใส่หรือไม่ใส่ก็ได้ ตรงกับกติกาในหน้าเอกสาร */}
          <textarea
            name="comment"
            rows={2}
            required={panel === "REJECT"}
            className="input text-xs"
            placeholder={panel === "REJECT" ? t("decide.rejectReason") : t("decide.comment")}
          />

          {state.error && (
            <p className="flex items-center gap-1.5 text-xs text-no">
              <IconAlert className="h-3.5 w-3.5" /> {state.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <SubmitButton
              className={panel === "APPROVE" ? "btn-success px-3 py-1 text-xs" : "btn-danger px-3 py-1 text-xs"}
              pendingText={t("common.saving")}
            >
              {panel === "APPROVE" ? t("decide.approve") : t("decide.reject")}
            </SubmitButton>
            <button type="button" onClick={() => setPanel("")}
                    className="btn btn-ghost px-3 py-1 text-xs">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
