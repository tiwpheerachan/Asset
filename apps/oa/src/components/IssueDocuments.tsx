"use client";

import { useActionState } from "react";
import { issueDocumentAction, voidDocumentAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";
import type { IssuedDocument } from "@/lib/issue";

const TYPES = ["INVOICE", "CN", "DN", "RECEIPT", "OTHER"] as const;

export default function IssueDocuments({
  requestId,
  docs,
  canIssue,
  isAdmin,
}: {
  requestId: number;
  docs: IssuedDocument[];
  canIssue: boolean;
  isAdmin: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(issueDocumentAction, {});
  const [voidState, voidAction] = useActionState<ActionState, FormData>(voidDocumentAction, {});

  return (
    <div className="space-y-3">
      {docs.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <code className={`text-xs ${d.void ? "line-through opacity-60" : ""}`}>
                {d.doc_number}
              </code>
              <span className="badge tone-neutral">{t(`issue.type.${d.doc_type}`)}</span>
              {d.void ? (
                <span className="badge tone-rose">{t("issue.voided")}</span>
              ) : (
                <a className="btn btn-ghost text-xs" href={`/documents/${d.id}`}>
                  {t("issue.open")}
                </a>
              )}
              {d.note && <span className="truncate text-xs text-muted">{d.note}</span>}
              {d.void_reason && (
                <span className="truncate text-xs text-no">{d.void_reason}</span>
              )}
              {isAdmin && !d.void && (
                <form action={voidAction} className="ml-auto flex items-center gap-1">
                  <input type="hidden" name="id" value={d.id} />
                  <input
                    name="reason"
                    className="input h-8 w-40 text-xs"
                    placeholder={t("issue.voidReason")}
                    required
                  />
                  <button className="btn btn-ghost text-xs">{t("issue.void")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canIssue ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="request_id" value={requestId} />
          <label className="block">
            <span className="label">{t("issue.docType")}</span>
            <select name="doc_type" className="input" defaultValue="INVOICE">
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`issue.type.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[12rem] flex-1">
            <span className="label">{t("issue.note")}</span>
            <input name="note" className="input" placeholder={t("issue.noteHint")} />
          </label>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? t("common.saving") : t("issue.create")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">{t("issue.needApproved")}</p>
      )}

      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
      {state.error && <p className="text-sm text-no">{state.error}</p>}
      {voidState.error && <p className="text-sm text-no">{voidState.error}</p>}
    </div>
  );
}
