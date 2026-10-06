"use client";

import { useActionState } from "react";
import { recordOaRefAction, type ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import type { ClearStatus } from "@/lib/clearing";

const initial: ActionState = {};

/**
 * บันทึกเลขที่เอกสารใน OA ที่เคลียร์ค่าใช้จ่ายใบนี้
 *
 * เอกสารที่อนุมัติแล้วยัง "ไม่จบ" จนกว่าค่าใช้จ่ายจะถูกตั้งเบิกใน OA จริง
 * การ์ดนี้คือที่เดียวที่บอกว่าใบนี้ค้างอยู่ตรงไหนของกระบวนการที่เหลือ
 */
export default function ClearPanel({
  requestId,
  status,
}: {
  requestId: number;
  status: ClearStatus;
}) {
  const t = useT();
  const [state, action] = useActionState(recordOaRefAction, initial);

  if (status.state === "off") return null;

  const done = status.state === "done";
  const late = status.state === "overdue";

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-sect">{t("clear.title")}</h2>
        <span className={`badge ${done ? "tone-emerald" : late ? "tone-rose" : "tone-amber"}`}>
          {done
            ? t("clear.done")
            : late
              ? t("clear.overdue", { n: status.daysLate })
              : t("clear.pending", { n: status.daysLeft })}
        </span>
      </div>

      {(status.state === "pending" || status.state === "overdue") && (
        <p className="text-sm text-muted">{t("clear.dueOn", { date: status.due })}</p>
      )}

      <FormMessage state={state} />

      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="request_id" value={requestId} />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="oa_ref">{t("clear.oaRef")}</label>
          <input
            id="oa_ref"
            name="oa_ref"
            defaultValue={done ? status.oaRef : ""}
            maxLength={60}
            placeholder={t("clear.oaRefPlaceholder")}
            className="input font-mono text-sm"
          />
        </div>
        <SubmitButton className={done ? "btn-ghost" : "btn-primary"}>
          {done ? t("common.save") : t("clear.markDone")}
        </SubmitButton>
      </form>

      <p className="text-xs text-muted">{t("clear.hint")}</p>
    </section>
  );
}
