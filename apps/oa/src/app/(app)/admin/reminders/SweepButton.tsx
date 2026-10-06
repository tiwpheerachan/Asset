"use client";

import { useActionState } from "react";
import { sweepRemindersAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";

export default function SweepButton() {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState>(sweepRemindersAction, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? t("remind.running") : t("remind.runNow")}
      </button>
      <span className="text-xs text-muted">{t("remind.forceHint")}</span>
      {state.ok && <span className="text-sm text-ok">{state.ok}</span>}
      {state.error && <span className="text-sm text-no">{state.error}</span>}
    </form>
  );
}
