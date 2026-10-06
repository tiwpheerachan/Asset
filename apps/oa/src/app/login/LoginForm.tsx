"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";

const initial: ActionState = {};

export default function LoginForm() {
  const t = useT();
  const [state, action] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="email">{t("login.email")}</label>
        <input id="email" name="email" type="email" autoComplete="username"
               required className="input" placeholder="you@company.co.th"
               defaultValue={state.values?.email ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("login.password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password"
               required className="input" placeholder="••••••••" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText={t("login.pending")}>
        {t("login.submit")}
      </SubmitButton>
    </form>
  );
}
