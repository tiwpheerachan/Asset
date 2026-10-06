"use client";

import { useActionState } from "react";
import { testWebhookAction, retryDeliveryAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useI18n } from "@/components/I18nProvider";
import { formatDateTime } from "@/lib/format";
import type { DeliveryRow } from "@/lib/integration";

const initial = {} as { ok?: string; error?: string };

const TONE: Record<string, string> = {
  SENT: "tone-emerald",
  PENDING: "tone-amber",
  FAILED: "tone-rose",
  SKIPPED: "tone-slate",
};

/**
 * ปุ่มทดสอบ + ประวัติการส่ง
 *
 * ประวัติถูกคำนวณไว้อยู่แล้วแต่ไม่เคยถูกแสดง — เวลาสองฝั่งเถียงกันว่า "ส่งแล้ว"
 * หรือ "ไม่ได้รับ" นี่คือหลักฐานชิ้นเดียวที่ตัดสินได้ ควรอยู่ตรงที่คนตั้งค่ามองเห็น
 */
export default function WebhookPanel({
  ready,
  rows,
}: {
  ready: boolean;
  rows: DeliveryRow[];
}) {
  const { t, locale } = useI18n();
  const [state, action] = useActionState(testWebhookAction, initial);

  return (
    <div className="space-y-3">
      {ready && (
        <form action={action} className="space-y-2">
          <FormMessage state={state} />
          <SubmitButton className="btn-ghost text-sm" pendingText={t("common.sending")}>
            {t("api.hookTest")}
          </SubmitButton>
          <p className="text-xs text-muted">{t("api.hookTestHint")}</p>
        </form>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th scope="col">{t("api.hookEvent")}</th>
                <th scope="col">{t("table.docNo")}</th>
                <th scope="col">{t("api.hookResult")}</th>
                <th scope="col">{t("api.hookWhen")}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.event}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">
                    {r.doc_no ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`badge ${TONE[r.status] ?? ""}`}>{r.status}</span>
                    {r.http_code > 0 && (
                      <span className="ml-1.5 text-xs tabular-nums text-muted">{r.http_code}</span>
                    )}
                    {r.attempts > 1 && (
                      <span className="ml-1.5 text-xs text-muted">
                        {t("api.hookAttempts", { n: String(r.attempts) })}
                      </span>
                    )}
                    {r.error && (
                      <div className="mt-0.5 text-xs text-no" title={r.error}>
                        {r.error.slice(0, 70)}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                    {formatDateTime(r.sent_at ?? r.created_at, locale)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "FAILED" && r.event !== "ping" && (
                      <form action={retryDeliveryAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn-ghost h-8 min-h-0 px-2.5 text-xs">
                          {t("api.hookRetry")}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
