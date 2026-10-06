"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";

export default function ForcedPasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">{t("pwd.current")}</span>
        <input type="password" name="current" className="input" required autoComplete="current-password" />
      </label>
      <label className="block">
        <span className="label">{t("pwd.new")}</span>
        <input type="password" name="next" className="input" required minLength={8} autoComplete="new-password" />
      </label>
      <label className="block">
        <span className="label">{t("pwd.confirm")}</span>
        <input type="password" name="confirm" className="input" required minLength={8} autoComplete="new-password" />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? t("common.saving") : t("pwd.submit")}
        </button>
        {state.ok && <span className="text-sm text-ok">{state.ok}</span>}
        {state.error && <span className="text-sm text-no">{state.error}</span>}
      </div>
    </form>
  );
}
