"use client";

import { useActionState } from "react";
import { saveDelegationAction, deleteDelegationAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";
import type { Delegation } from "@/lib/delegation";

type Person = { id: number; name: string; department: string };

export default function DelegationForm({
  people,
  rows,
  today,
  forUser,
  pickOwner = false,
}: {
  people: Person[];
  rows: Delegation[];
  today: string;
  forUser: number;
  /** ผู้ดูแลตั้งแทนคนอื่นได้ จึงต้องเลือกว่าตั้งให้ใคร */
  pickOwner?: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDelegationAction, {});
  const isNow = (d: Delegation) =>
    d.active === 1 && today >= d.from_date && today <= d.to_date;

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        {pickOwner ? (
          <label className="block">
            <span className="label">{t("deleg.fromUser")}</span>
            <select name="from_user" className="input" defaultValue={forUser} required>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.department ? ` · ${p.department}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="from_user" value={forUser} />
        )}

        <label className="block">
          <span className="label">{t("deleg.toUser")}</span>
          <select name="to_user" className="input" required defaultValue="">
            <option value="" disabled>
              {t("deleg.pickPerson")}
            </option>
            {people
              .filter((p) => pickOwner || p.id !== forUser)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.department ? ` · ${p.department}` : ""}
                </option>
              ))}
          </select>
        </label>

        <label className="block">
          <span className="label">{t("deleg.fromDate")}</span>
          <input type="date" name="from_date" className="input" defaultValue={today} required />
        </label>

        <label className="block">
          <span className="label">{t("deleg.toDate")}</span>
          <input type="date" name="to_date" className="input" defaultValue={today} required />
        </label>

        <label className="block sm:col-span-2">
          <span className="label">{t("deleg.reason")}</span>
          <input name="reason" className="input" placeholder={t("deleg.reasonHint")} />
        </label>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn btn-primary" disabled={pending}>
            {pending ? t("common.saving") : t("deleg.add")}
          </button>
          {state.ok && <span className="text-sm text-ok">{state.ok}</span>}
          {state.error && <span className="text-sm text-no">{state.error}</span>}
        </div>
      </form>

      {rows.length > 0 && (
        <ul className="divide-y divide-border border-t border-border text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className={`badge ${isNow(d) ? "tone-emerald" : "tone-neutral"}`}>
                {isNow(d) ? t("deleg.activeNow") : t("deleg.scheduled")}
              </span>
              <span className="text-text">
                {d.from_name} → <strong>{d.to_name}</strong>
              </span>
              <span className="text-muted">
                {d.from_date} – {d.to_date}
              </span>
              {d.reason && <span className="truncate text-xs text-muted">{d.reason}</span>}
              <form action={deleteDelegationAction} className="ml-auto">
                <input type="hidden" name="id" value={d.id} />
                <button className="btn btn-ghost text-xs">{t("common.delete")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
