import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { reminderStatus } from "@/lib/reminders";
import { larkReady } from "@/lib/lark/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { PageShell, PageTitle, SectionCard, StatTile, EmptyState } from "@/components/layout-bits";
import { formatDateTime } from "@/lib/format";
import { IconAlert, IconBell, IconClock } from "@/components/icons";
import SweepButton from "./SweepButton";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const st = await reminderStatus();
  const days = (n: number) => t("remind.daysUnit").replace("{d}", String(n));

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("remind.title")} subtitle={t("remind.subtitle")} />

        {!larkReady() && (
          <div className="alert alert-warn">
            <IconAlert className="mt-0.5 h-[18px] w-[18px]" />
            <span>{t("remind.larkOff")}</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={t("remind.waiting")}
            value={st.waiting}
            hint={`> ${days(st.remindAfter)}`}
            accent="amber"
            dim={!st.waiting}
            icon={<IconClock className="h-[18px] w-[18px]" />}
          />
          <StatTile
            label={t("remind.overdue")}
            value={st.overdue}
            hint={`> ${days(st.escalateAfter)}`}
            accent="rose"
            dim={!st.overdue}
            icon={<IconAlert className="h-[18px] w-[18px]" />}
          />
          <StatTile
            label={t("remind.window")}
            value={st.hours}
            hint={st.inWindow ? t("remind.inWindow") : t("remind.outWindow")}
            accent={st.inWindow ? "emerald" : "sky"}
            dim={!st.inWindow}
            icon={<IconBell className="h-[18px] w-[18px]" />}
          />
        </div>

        <SectionCard title={t("remind.settings")} hint={t("remind.settingsHint")}>
          <ul className="divide-y divide-border text-sm">
            <Row name="REMINDER_ENABLED" value={st.enabled ? t("remind.on") : t("remind.off")} />
            <Row name="REMINDER_AFTER_DAYS" value={String(st.remindAfter)} />
            <Row name="ESCALATE_AFTER_DAYS" value={String(st.escalateAfter)} />
            <Row name="REMINDER_HOURS" value={st.hours} />
            <Row name="REMINDER_SKIP_WEEKENDS" value={st.skipWeekends ? t("remind.on") : t("remind.off")} />
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <SweepButton />
          </div>
        </SectionCard>

        <SectionCard title={t("remind.list")}>
          {st.stale.length === 0 ? (
            <EmptyState>{t("remind.none")}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">{t("remind.doc")}</th>
                    <th scope="col" className="px-4 py-2 text-left">{t("remind.stuckAt")}</th>
                    <th scope="col" className="px-4 py-2 text-left">{t("remind.days")}</th>
                    <th scope="col" className="px-4 py-2 text-left">{t("remind.lastNudge")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {st.stale.map((s) => (
                    <tr key={s.approver_row_id}>
                      <td className="px-4 py-2">
                        <Link href={`/requests/${s.request_id}`} className="text-primary-text hover:underline">
                          {s.doc_no}
                        </Link>
                        <div className="max-w-[22rem] truncate text-xs text-muted">{s.title}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div>{s.approver_name}</div>
                        <div className="text-xs text-muted">{s.step_name}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className={`badge ${s.level === "ESCALATION" ? "tone-rose" : "tone-amber"}`}>
                          {days(s.days)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                        {s.last_nudge ? formatDateTime(s.last_nudge, locale) : t("remind.neverNudged")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("remind.history")}>
          {st.history.length === 0 ? (
            <EmptyState>{t("remind.noHistory")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {st.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={`badge ${h.kind === "ESCALATION" ? "tone-rose" : "tone-amber"}`}>
                    {t(`remind.kind.${h.kind}`)}
                  </span>
                  <span className="text-muted">{formatDateTime(h.created_at, locale)}</span>
                  <span>{h.doc_no}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    → {h.user_name} · {h.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{name}</code>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{value}</span>
    </li>
  );
}
