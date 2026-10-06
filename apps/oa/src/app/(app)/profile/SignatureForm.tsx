"use client";

import { useActionState } from "react";
import { saveSignatureAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";

export default function SignatureForm({ current }: { current: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSignatureAction, {});

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-52 items-center justify-center rounded-xl border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/signature/${encodeURIComponent(current)}`}
              alt={t("sign.current")}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <form action={action}>
            <input type="hidden" name="remove" value="1" />
            <button className="btn btn-ghost text-xs" disabled={pending}>
              {t("sign.remove")}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("sign.none")}</p>
      )}

      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">{t("sign.upload")}</span>
          <input
            type="file"
            name="signature"
            accept="image/png,image/jpeg,image/webp"
            className="input py-1.5"
            required
          />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </form>

      <p className="text-xs text-muted">{t("sign.hint")}</p>
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
      {state.error && <p className="text-sm text-no">{state.error}</p>}
    </div>
  );
}
