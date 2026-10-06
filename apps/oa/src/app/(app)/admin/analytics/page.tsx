import TemplateGlyph from "@/components/TemplateGlyph";
import { requireAdmin } from "@/lib/auth";
import {
  aging, bottlenecks, byTemplate, defaultRange, humanHours, overview, weekly,
} from "@/lib/analytics";
import { getT } from "@/lib/i18n/server";
import { PageShell, PageTitle, SectionCard, StatTile, EmptyState } from "@/components/layout-bits";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const t = await getT();
  const sp = await searchParams;
  const def = defaultRange();
  const range = { from: sp.from || def.from, to: sp.to || def.to };

  const ov = await overview(range);
  const people = await bottlenecks(range);
  const templates = await byTemplate(range);
  const buckets = await aging();
  const weeks = await weekly(range);

  const dur = (h: number | null | undefined) => {
    const v = humanHours(h);
    return v ? `${v.n} ${t(`analytics.unit.${v.unit}`)}` : "—";
  };
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.submitted));
  const maxAvg = Math.max(1, ...people.map((p) => p.avg_hours || 0));

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("analytics.title")} subtitle={t("analytics.subtitle")} />

        <form action="/admin/analytics" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">{t("analytics.from")}</span>
            <input type="date" name="from" defaultValue={range.from} className="input" />
          </label>
          <label className="block">
            <span className="label">{t("analytics.to")}</span>
            <input type="date" name="to" defaultValue={range.to} className="input" />
          </label>
          <button className="btn btn-primary">{t("common.search")}</button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("analytics.submitted")} value={ov.submitted} accent="primary" />
          <StatTile
            label={t("analytics.approvedRate")}
            value={ov.submitted ? `${Math.round((ov.approved / ov.submitted) * 100)}%` : "—"}
            hint={`${ov.approved} / ${ov.submitted}`}
            accent="emerald"
          />
          <StatTile
            label={t("analytics.medianTime")}
            value={dur(ov.medianHours)}
            hint={t("analytics.medianHint")}
            accent="teal"
          />
          <StatTile
            label={t("analytics.avgTime")}
            value={dur(ov.avgHours)}
            hint={t("analytics.avgHint")}
            accent="violet"
          />
        </div>

        <SectionCard title={t("analytics.bottleneck")} hint={t("analytics.bottleneckHint")}>
          {people.length === 0 ? (
            <EmptyState>{t("analytics.noData")}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">{t("analytics.person")}</th>
                    <th scope="col" className="px-4 py-2 text-left">{t("analytics.avgPerStep")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("analytics.handled")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("analytics.slowest")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("analytics.pendingNow")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {people.map((p) => (
                    <tr key={p.user_id}>
                      <td className="px-4 py-2">
                        <div className="text-text">{p.name}</div>
                        <div className="text-xs text-muted">{p.department || "—"}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round(((p.avg_hours || 0) / maxAvg) * 100)}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap">{dur(p.avg_hours)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">{p.handled}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-muted">
                        {dur(p.max_hours)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {p.pending_now > 0 ? (
                          <span
                            className={`badge ${
                              (p.oldest_pending_days ?? 0) >= 7 ? "tone-rose" : "tone-amber"
                            }`}
                          >
                            {p.pending_now}
                            {p.oldest_pending_days !== null &&
                              ` · ${Math.floor(p.oldest_pending_days)}${t("analytics.dayShort")}`}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("analytics.aging")} hint={t("analytics.agingHint")}>
            <ul className="space-y-2 text-sm">
              {buckets.map((b) => (
                <li key={b.label} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-muted">
                    {b.label} {t("analytics.dayShort")}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${
                        b.label === "15+" || b.label === "8-14" ? "bg-no" : "bg-primary"
                      }`}
                      style={{ width: `${Math.round((b.count / maxBucket) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right">{b.count}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title={t("analytics.weekly")}>
            {weeks.length === 0 ? (
              <EmptyState>{t("analytics.noData")}</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {weeks.slice(-8).map((w) => (
                  <li key={w.week} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-muted">{w.week}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((w.submitted / maxWeek) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right">{w.submitted}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard title={t("analytics.byType")}>
          {templates.length === 0 ? (
            <EmptyState>{t("analytics.noData")}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">{t("detail.type")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("analytics.total")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("status.APPROVED")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("status.REJECTED")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("analytics.avgTime")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {templates.map((x) => (
                    <tr key={x.template_id}>
                      <td className="px-4 py-2">
                        <TemplateGlyph icon={x.icon} size={15} /> {x.name}
                      </td>
                      <td className="px-4 py-2 text-right">{x.total}</td>
                      <td className="px-4 py-2 text-right text-ok">{x.approved}</td>
                      <td className="px-4 py-2 text-right text-no">{x.rejected}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{dur(x.avg_hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
