'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Camera, FolderX, Hourglass, Inbox, MapPinOff, FileWarning, Clock3, Package, PlusCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups, useMissingFlags, useValuations } from '@/lib/hooks';
import { addMonths, buildSchedule, isDepreciable, prorationFor } from '@/lib/depreciation';
import { Card, CardHeader, PageHeader, cx } from '@/components/ui';
import { BarList, DepTrendChart } from '@/components/charts';

const VALUED = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DISPOSAL_PENDING', 'DRAFT', 'PENDING_REVIEW'];
const PENDING = ['CANDIDATE', 'DRAFT', 'PENDING_REVIEW'];

export default function Dashboard() {
  const { t, money, num, period, periodShort, dateTime } = useI18n();
  const { state } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const flags = useMissingFlags();

  const d = useMemo(() => {
    const assets = state.assets.filter((a) => VALUED.includes(a.status));
    let cost = 0,
      accum = 0,
      units = 0;
    for (const a of assets) {
      const v = vals.get(a.id)!;
      cost += v.cost;
      accum += v.accumulated;
      units += a.quantity;
    }
    const group = (key: (a: (typeof assets)[number]) => string, labelFn: (k: string) => string) => {
      const m = new Map<string, { cost: number; nbv: number; count: number }>();
      for (const a of assets) {
        const k = key(a) || '—';
        const v = vals.get(a.id)!;
        const g = m.get(k) ?? { cost: 0, nbv: 0, count: 0 };
        g.cost += v.cost;
        g.nbv += v.nbv;
        g.count += 1;
        m.set(k, g);
      }
      return [...m.entries()].map(([k, g]) => ({ key: k, label: k === '—' ? t('common.notSet') : labelFn(k), ...g })).sort((a, b) => b.cost - a.cost);
    };

    // depreciation trend: 12 months back + 3 forward
    const trendStart = addMonths(CURRENT_PERIOD, -11);
    const periods = Array.from({ length: 15 }, (_, i) => addMonths(trendStart, i));
    const sums = new Map(periods.map((p) => [p, 0]));
    for (const a of state.assets) {
      if (!isDepreciable(a)) continue;
      for (const r of buildSchedule(a, prorationFor(a, state.policies))) if (sums.has(r.period)) sums.set(r.period, sums.get(r.period)! + r.depreciation);
    }
    const nearing = state.assets.filter((a) => {
      const v = vals.get(a.id)!;
      return a.status === 'ACTIVE' && !v.fullyDepreciated && v.remainingMonths > 0 && v.remainingMonths <= 6;
    }).length;

    return {
      count: assets.length,
      units,
      cost,
      accum,
      nbv: cost - accum,
      newThisMonth: state.assets.filter((a) => !a.legacy && !['CANDIDATE', 'ARCHIVED'].includes(a.status) && (a.acquisitionDate.startsWith(CURRENT_PERIOD) || a.createdAt.startsWith(CURRENT_PERIOD))).length,
      missingPhoto: state.assets.filter((a) => VALUED.includes(a.status) && flags.get(a.id)?.photo).length,
      missingCategory: state.assets.filter((a) => flags.get(a.id)?.category).length,
      pending: state.assets.filter((a) => PENDING.includes(a.status)).length,
      bySub: group((a) => a.subcategoryId, lk.category),
      byCompany: group((a) => a.companyId, lk.company),
      byBranch: group((a) => a.branchId, lk.branch),
      byDept: group((a) => a.departmentId, lk.department),
      trend: periods.map((p) => ({ period: p, label: periodShort(p), value: Math.round(sums.get(p)! * 100) / 100 })),
      alerts: {
        oa: state.oa.filter((o) => ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].includes(o.status)).length,
        noLocation: state.assets.filter((a) => VALUED.includes(a.status) && flags.get(a.id)?.location).length,
        noPolicy: state.assets.filter((a) => VALUED.includes(a.status) && flags.get(a.id)?.policy).length,
        missingDocs: state.assets.filter((a) => VALUED.includes(a.status) && flags.get(a.id)?.document).length,
        nearing,
      },
    };
  }, [state, vals, flags, lk, t, periodShort]);

  const kpis = [
    { label: t('dashboard.kpi.totalAssets'), value: num(d.count), sub: `${num(d.units)} ${t('dashboard.units')}`, icon: Package, href: '/assets' },
    { label: t('dashboard.kpi.totalCost'), value: money(d.cost, 0), sub: t('common.thb'), icon: null },
    { label: t('dashboard.kpi.accumDep'), value: money(d.accum, 0), sub: `${((d.accum / d.cost) * 100).toFixed(1)}% ${t('dashboard.ofCost')}`, icon: null },
    { label: t('dashboard.kpi.nbv'), value: money(d.nbv, 0), sub: `${((d.nbv / d.cost) * 100).toFixed(1)}% ${t('dashboard.ofCost')}`, icon: null, strong: true },
    { label: t('dashboard.kpi.newThisMonth'), value: num(d.newThisMonth), sub: period(CURRENT_PERIOD), icon: PlusCircle, href: '/assets' },
    { label: t('dashboard.kpi.missingPhoto'), value: num(d.missingPhoto), sub: t('dashboard.records'), icon: Camera, href: '/assets?missing=photo', warn: d.missingPhoto > 0 },
    { label: t('dashboard.kpi.missingCategory'), value: num(d.missingCategory), sub: t('dashboard.records'), icon: FolderX, href: '/assets?missing=category', warn: d.missingCategory > 0 },
    { label: t('dashboard.kpi.pendingActivation'), value: num(d.pending), sub: t('dashboard.records'), icon: Hourglass, href: '/assets?status=PENDING', warn: d.pending > 0 },
  ];

  const alerts = [
    { label: t('dashboard.alert.oaWaiting'), n: d.alerts.oa, icon: Inbox, href: '/oa-import' },
    { label: t('dashboard.alert.noLocation'), n: d.alerts.noLocation, icon: MapPinOff, href: '/assets?missing=location' },
    { label: t('dashboard.alert.noPolicy'), n: d.alerts.noPolicy, icon: AlertTriangle, href: '/assets?missing=policy' },
    { label: t('dashboard.alert.missingDocs'), n: d.alerts.missingDocs, icon: FileWarning, href: '/assets?missing=document' },
    { label: t('dashboard.alert.nearingFull'), n: d.alerts.nearing, icon: Clock3, href: '/reports?r=schedule' },
  ];

  return (
    <>
      <PageHeader title={t('dashboard.title')} sub={t('dashboard.subtitle')} crumbs={`${lk.company('C-SHD')} · ${t('common.asOf')} ${period(CURRENT_PERIOD)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k, i) => {
          const body = (
            <div className={cx('h-full rounded-lg border bg-white px-4 py-3.5 shadow-card transition-colors', k.href ? 'hover:border-brand-200' : '', k.strong ? 'border-brand-200' : 'border-line')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-ink-3">{k.label}</span>
                {k.icon && <k.icon size={16} className={k.warn ? 'text-amber-600' : 'text-ink-4'} />}
              </div>
              <div className={cx('mt-1.5 text-[22px] font-semibold tabular-nums tracking-tight', k.strong ? 'text-brand-700' : 'text-ink')}>{k.value}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">{k.sub}</div>
            </div>
          );
          return k.href ? (
            <Link key={i} href={k.href}>
              {body}
            </Link>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('dashboard.chart.depTrend')} sub={`${period(d.trend[0].period)} – ${period(d.trend[d.trend.length - 1].period)}`} />
          <div className="px-3 py-3">
            <DepTrendChart data={d.trend} currentIdx={11} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.alerts')} />
          <ul className="divide-y divide-line-soft">
            {alerts.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas/70">
                  <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', a.n ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-ink-4')}>
                    <a.icon size={16} />
                  </span>
                  <span className="flex-1 text-[13px] text-ink-2">{a.label}</span>
                  <span className={cx('text-[15px] font-semibold tabular-nums', a.n ? 'text-ink' : 'text-ink-4')}>{a.n}</span>
                  <ArrowRight size={14} className="text-ink-4" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.chart.valueByCategory')} sub={t('dashboard.chart.costVsNbv')} />
          <div className="px-4 py-4">
            <BarList
              rows={d.bySub.map((r) => ({ label: r.label, value: r.cost, sub: r.nbv }))}
              format={(n) => money(n, 0)}
              secondary
              primaryLabel={t('field.nbv')}
              secondaryLabel={t('field.cost')}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.chart.countByCategory')} />
          <div className="px-4 py-4">
            <BarList rows={[...d.bySub].sort((a, b) => b.count - a.count).map((r) => ({ label: r.label, value: r.count }))} format={num} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('dashboard.chart.valueByCompany')} />
          <div className="px-4 py-4">
            <BarList rows={d.byCompany.map((r) => ({ label: r.label, value: r.cost, hint: `${r.count}` }))} format={(n) => money(n, 0)} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.chart.valueByBranch')} />
          <div className="px-4 py-4">
            <BarList rows={d.byBranch.map((r) => ({ label: r.label, value: r.cost, hint: `${r.count}` }))} format={(n) => money(n, 0)} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.chart.valueByDepartment')} />
          <div className="px-4 py-4">
            <BarList rows={d.byDept.map((r) => ({ label: r.label, value: r.cost, hint: `${r.count}` }))} format={(n) => money(n, 0)} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.recent')}
          actions={
            <Link href="/audit" className="text-[13px] font-medium text-brand-600 hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        />
        <ul className="divide-y divide-line-soft">
          {state.audit.slice(0, 6).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="w-40 shrink-0 text-[12px] text-ink-3">{dateTime(a.at)}</span>
              <span className="font-medium text-ink">{a.user}</span>
              <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{a.action}</span>
              {a.assetCode && <span className="font-mono text-[12.5px] text-brand-700">{a.assetCode}</span>}
              <span className="min-w-0 flex-1 truncate text-ink-3">
                {a.field ? `${a.field}: ${a.oldValue ?? ''} → ${a.newValue ?? ''}` : a.newValue}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
