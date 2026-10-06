"use client";

import { useActionState } from "react";
import { changePasswordAction, type ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";

const initial: ActionState = {};

export default function PasswordForm() {
  const t = useT();
  const [state, action] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="max-w-sm space-y-5">
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="current">{t("profile.currentPassword")}</label>
        <input id="current" name="current" type="password" required className="input"
               autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">{t("profile.newPassword")}</label>
        <input id="next" name="next" type="password" required minLength={8} className="input"
               autoComplete="new-password" />
        <p className="mt-1 text-xs text-muted">{t("profile.minLength")}</p>
      </div>
      <SubmitButton className="btn-primary">{t("profile.savePassword")}</SubmitButton>
    </form>
  );
}
