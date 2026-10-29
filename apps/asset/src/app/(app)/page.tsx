'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ArrowRight, ArrowUpRight, Camera, CheckCircle2, Clock3, Coins, FileWarning,
  FolderX, Hourglass, Inbox, Landmark, Link2Off, MapPinOff, Package, PlusCircle, ShieldAlert,
  TrendingDown, Wallet,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups, useMissingFlags, useValuations } from '@/lib/hooks';
import { addMonths, buildSchedule, depIssues, isDepreciable, prorationFor } from '@/lib/depreciation';
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { BarList, DepTrendChart } from '@/components/charts';

// สถานะที่ "รับรู้ทางบัญชี" แล้ว (เข้าเกณฑ์คิดค่าเสื่อม) — ตรงกับรายการในหน้าค่าเสื่อม
const RECOGNIZED = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DISPOSAL_PENDING'];
// สถานะที่ยัง "รอเปิดใช้" — ยอดยังไม่รับรู้ ต้องแยกออกจากยอดรับรู้แล้ว
const PENDING = ['CANDIDATE', 'DRAFT', 'PENDING_REVIEW'];

export default function Dashboard() {
  const { t, money, num, period, periodShort, dateTime } = useI18n();
  const { state } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const flags = useMissingFlags();

  const d = useMemo(() => {
    const recognized = state.assets.filter((a) => RECOGNIZED.includes(a.status));
    const pendingAssets = state.assets.filter((a) => PENDING.includes(a.status));

    // ── ยอดรวม (เฉพาะรับรู้แล้ว) ───────────────────────────────
    let cost = 0, accum = 0, units = 0;
    for (const a of recognized) {
      const v = vals.get(a.id)!;
      cost += v.cost; accum += v.accumulated; units += a.quantity;
    }
    const pendingCost = pendingAssets.reduce((s, a) => s + (vals.get(a.id)?.cost ?? 0), 0);
    const pendingUnits = pendingAssets.reduce((s, a) => s + a.quantity, 0);

    const group = (list: typeof recognized, key: (a: (typeof recognized)[number]) => string, labelFn: (k: string) => string) => {
      const m = new Map<string, { cost: number; nbv: number; count: number; units: number }>();
      for (const a of list) {
        const k = key(a) || '—';
        const v = vals.get(a.id)!;
        const g = m.get(k) ?? { cost: 0, nbv: 0, count: 0, units: 0 };
        g.cost += v.cost; g.nbv += v.nbv; g.count += 1; g.units += a.quantity;
        m.set(k, g);
      }
      return [...m.entries()]
        .map(([k, g]) => ({ key: k, label: k === '—' ? t('common.notSet') : labelFn(k), ...g }))
        .sort((a, b) => b.cost - a.cost);
    };

    // ── แหล่งที่มา ─────────────────────────────────────────────
    const srcOf = (a: (typeof recognized)[number]) => {
      const s = a.source?.sourceSystem;
      if (s === 'OA' || s === 'ONEBOOK' || s === 'PEAK') return s;
      if (a.legacy || /import/i.test(a.createdBy ?? '')) return 'LEGACY';
      return 'INTERNAL';
    };
    const SRC_NAME: Record<string, string> = {
      OA: 'One OA', ONEBOOK: 'ONEBOOK', PEAK: 'PEAK',
      LEGACY: t('dashboard.source.legacy'), INTERNAL: t('dashboard.source.internal'),
    };

    // ── สถานะ (ทุกรายการที่ไม่เก็บถาวร) ────────────────────────
    const statusMap = new Map<string, number>();
    for (const a of state.assets) if (a.status !== 'ARCHIVED') statusMap.set(a.status, (statusMap.get(a.status) ?? 0) + 1);
    const byStatus = [...statusMap.entries()].map(([k, v]) => ({ label: t(`status.${k}`), value: v })).sort((a, b) => b.value - a.value);

    // ── แนวโน้มค่าเสื่อม 12 เดือนหลัง + 3 เดือนหน้า ──────────────
    const trendStart = addMonths(CURRENT_PERIOD, -11);
    const periods = Array.from({ length: 15 }, (_, i) => addMonths(trendStart, i));
    const sums = new Map(periods.map((p) => [p, 0]));
    for (const a of state.assets) {
      if (!isDepreciable(a)) continue;
      for (const r of buildSchedule(a, prorationFor(a, state.policies))) if (sums.has(r.period)) sums.set(r.period, sums.get(r.period)! + r.depreciation);
    }

    // ── ค่าเสื่อมงวดปัจจุบัน: ใช้ snapshot ถ้ารอบถูกล็อก/ลงบัญชี ───
    const curRun = state.runs.find((r) => r.period === CURRENT_PERIOD);
    const useSnap = !!(curRun && (curRun.status === 'LOCKED' || curRun.status === 'POSTED') && curRun.lines?.length);
    let periodTotal = 0;
    let topDep: { id: string; code: string; name: string; dep: number }[] = [];
    if (useSnap) {
      const lines = curRun!.lines!;
      periodTotal = lines.reduce((s, l) => s + l.periodDep, 0);
      topDep = [...lines].sort((a, b) => b.periodDep - a.periodDep).slice(0, 10)
        .map((l) => ({ id: l.assetId, code: l.assetCode, name: l.assetName, dep: l.periodDep }));
    } else {
      const live = recognized
        .filter((a) => isDepreciable(a))
        .map((a) => ({ a, dep: vals.get(a.id)!.periodDep }))
        .filter((x) => x.dep > 0);
      periodTotal = live.reduce((s, x) => s + x.dep, 0);
      topDep = live.sort((a, b) => b.dep - a.dep).slice(0, 10)
        .map((x) => ({ id: x.a.id, code: x.a.code, name: lk.assetName(x.a), dep: x.dep }));
    }

    // ── อายุค่าเสื่อมคงเหลือ (ช่วงไม่ทับกัน) + รายการคำนวณไม่ได้ ──
    const buckets = { done: 0, b03: 0, b36: 0, b612: 0, b1224: 0, b24: 0 };
    let notStarted = 0, incomplete = 0, nonDep = 0;
    const nearing: { a: (typeof recognized)[number]; v: ReturnType<typeof vals.get> }[] = [];
    for (const a of recognized) {
      const v = vals.get(a.id)!;
      if (!isDepreciable(a)) { nonDep++; continue; }
      if (depIssues(a, state.policies).length) { incomplete++; continue; }
      if (a.readyDate && a.readyDate.slice(0, 7) > CURRENT_PERIOD) { notStarted++; continue; }
      if (v.fullyDepreciated || v.remainingMonths <= 0) { buckets.done++; continue; }
      const r = v.remainingMonths;
      if (r <= 3) buckets.b03++;
      else if (r <= 6) buckets.b36++;
      else if (r <= 12) buckets.b612++;
      else if (r <= 24) buckets.b1224++;
      else buckets.b24++;
      if (r <= 6) nearing.push({ a, v });
    }
    nearing.sort((x, y) => x.v!.remainingMonths - y.v!.remainingMonths);

    const flagN = (pick: (f: NonNullable<ReturnType<typeof flags.get>>) => boolean, list = recognized) =>
      list.filter((a) => { const f = flags.get(a.id); return f ? pick(f) : false; }).length;

    return {
      count: recognized.length,
      units,
      pendingCount: pendingAssets.length,
      pendingUnits,
      pendingCost,
      cost, accum, nbv: cost - accum,
      periodTotal, useSnap, topDep,
      curRunStatus: curRun?.status,
      newThisPeriod: state.assets.filter((a) => !a.legacy && !['CANDIDATE', 'ARCHIVED'].includes(a.status) && (a.acquisitionDate.startsWith(CURRENT_PERIOD) || a.createdAt.startsWith(CURRENT_PERIOD))).length,
      buckets, notStarted, incomplete, nonDep,
      nearing,
      bySub: group(recognized, (a) => a.subcategoryId, lk.category),
      byCompany: group(recognized, (a) => a.companyId, lk.company),
      byBranch: group(recognized, (a) => a.branchId, lk.branch),
      bySource: group(recognized, srcOf, (k) => SRC_NAME[k] ?? k),
      byStatus,
      trend: periods.map((p) => ({ period: p, label: periodShort(p), value: Math.round(sums.get(p)! * 100) / 100 })),
      tasks: {
        oa: state.oa.filter((o) => ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].includes(o.status)).length,
        pending: pendingAssets.length,
        noReady: recognized.filter((a) => isDepreciable(a) && !a.readyDate).length,
        noPolicy: flagN((f) => f.policy),
        noMapping: flagN((f) => f.mapping),
        noLocation: flagN((f) => f.location),
        missingDocs: flagN((f) => f.document),
        missingPhoto: flagN((f) => f.photo),
        missingCategory: flagN((f) => f.category),
        nearing: nearing.length,
      },
    };
  }, [state, vals, flags, lk, t, periodShort]);

  const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
  const updatedAt = state.audit[0]?.at;

  // ── KPI หลัก (ยอดการเงิน เฉพาะรับรู้แล้ว) ──────────────────────
  const primary = [
    { label: t('dashboard.kpi.totalAssets'), value: num(d.count), sub: `${num(d.units)} ${t('dashboard.units')} · +${num(d.pendingCount)} ${t('dashboard.scope.pending')}`, icon: Package, href: '/assets' },
    { label: t('dashboard.kpi.totalCost'), value: money(d.cost, 0), sub: `${t('dashboard.scope.recognized')} · +${money(d.pendingCost, 0)} ${t('dashboard.scope.pending')}`, icon: Wallet },
    { label: t('dashboard.kpi.accumDep'), value: money(d.accum, 0), sub: `${pct(d.accum, d.cost)} ${t('dashboard.ofCost')}`, icon: TrendingDown },
    { label: t('dashboard.kpi.nbv'), value: money(d.nbv, 0), sub: `${pct(d.nbv, d.cost)} ${t('dashboard.ofCost')}`, icon: Coins, strong: true },
  ];
  // ── KPI รอง (การดำเนินงานของงวด) ──────────────────────────────
  const secondary: { label: string; value: string; sub?: string; icon: typeof Package; href?: string; tone?: 'green' | 'amber' | 'gray' }[] = [
    {
      label: t('dashboard.kpi.depThisPeriod'), value: money(d.periodTotal, 0),
      sub: d.useSnap ? `${t('dashboard.locked')} · ${period(CURRENT_PERIOD)}` : `${t('dashboard.estimate')} · ${period(CURRENT_PERIOD)}`,
      icon: Landmark, href: '/depreciation', tone: d.useSnap ? 'green' : 'gray',
    },
    { label: t('dashboard.kpi.newThisMonth'), value: num(d.newThisPeriod), sub: period(CURRENT_PERIOD), icon: PlusCircle, href: '/assets' },
    { label: t('dashboard.scope.pending'), value: num(d.pendingCount), sub: `${num(d.pendingUnits)} ${t('dashboard.units')}`, icon: Hourglass, href: '/assets?status=PENDING', tone: d.pendingCount ? 'amber' : 'gray' },
    { label: t('dashboard.kpi.nearingFull'), value: num(d.tasks.nearing), sub: t('dashboard.within6m'), icon: Clock3, href: '/depreciation', tone: d.tasks.nearing ? 'amber' : 'gray' },
  ];

  // ── งานที่ต้องจัดการ: จัดลำดับ ขวางปิดงวด/ส่งบัญชี มาก่อน ───────
  type Task = { key: string; label: string; n: number; href: string; blocking?: boolean; icon: typeof Inbox };
  const tasksAll: Task[] = [
    { key: 'oa', label: t('dashboard.task.oaWaiting'), n: d.tasks.oa, href: '/oa-import', blocking: true, icon: Inbox },
    { key: 'pending', label: t('dashboard.task.pendingReview'), n: d.tasks.pending, href: '/assets?status=PENDING', blocking: true, icon: Hourglass },
    { key: 'noReady', label: t('dashboard.task.noReady'), n: d.tasks.noReady, href: '/depreciation', blocking: true, icon: Clock3 },
    { key: 'noPolicy', label: t('dashboard.task.noPolicy'), n: d.tasks.noPolicy, href: '/assets?missing=policy', blocking: true, icon: ShieldAlert },
    { key: 'noMapping', label: t('dashboard.task.noMapping'), n: d.tasks.noMapping, href: '/depreciation', blocking: true, icon: Link2Off },
    { key: 'noLocation', label: t('dashboard.task.noLocation'), n: d.tasks.noLocation, href: '/assets?missing=location', icon: MapPinOff },
    { key: 'missingDocs', label: t('dashboard.task.missingDocs'), n: d.tasks.missingDocs, href: '/assets?missing=document', icon: FileWarning },
    { key: 'missingPhoto', label: t('dashboard.task.missingPhoto'), n: d.tasks.missingPhoto, href: '/assets?missing=photo', icon: Camera },
    { key: 'missingCategory', label: t('dashboard.task.missingCategory'), n: d.tasks.missingCategory, href: '/assets?missing=category', icon: FolderX },
  ];
  const tasks = tasksAll.filter((x) => x.n > 0).sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking) || b.n - a.n);
  const blockingN = tasks.filter((x) => x.blocking).reduce((s, x) => s + x.n, 0);

  // ── อายุค่าเสื่อมคงเหลือ (buckets) ─────────────────────────────
  const lifeRows = [
    { label: t('dashboard.life.done'), value: d.buckets.done },
    { label: t('dashboard.life.b03'), value: d.buckets.b03 },
    { label: t('dashboard.life.b36'), value: d.buckets.b36 },
    { label: t('dashboard.life.b612'), value: d.buckets.b612 },
    { label: t('dashboard.life.b1224'), value: d.buckets.b1224 },
    { label: t('dashboard.life.b24'), value: d.buckets.b24 },
  ];
  const lifeExcluded = d.notStarted + d.incomplete + d.nonDep;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        sub={t('dashboard.subtitle')}
        crumbs={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{lk.company('C-SHD')}</span>
            <span className="text-ink-4">·</span>
            <span>{t('common.asOf')} {period(CURRENT_PERIOD)}</span>
            <span className="text-ink-4">·</span>
            <span>{t('common.thb')}</span>
            {updatedAt && (<><span className="text-ink-4">·</span><span>{t('dashboard.updated')} {dateTime(updatedAt)}</span></>)}
          </span>
        }
      />

      {/* ── KPI หลัก ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primary.map((k) => <Kpi key={k.label} {...k} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {secondary.map((k) => <Kpi key={k.label} {...k} />)}
      </div>

      {/* ── งานที่ต้องจัดการ ─────────────────────── */}
      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.tasks')}
          sub={blockingN > 0 ? `${t('dashboard.taskBlocking')}: ${num(blockingN)}` : undefined}
          actions={<Link href="/assets" className="text-[13px] font-medium text-brand-600 hover:underline">{t('dashboard.viewAll')}</Link>}
        />
        {tasks.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[13.5px] text-emerald-700">
            <CheckCircle2 size={18} /> {t('dashboard.tasksNone')}
          </div>
        ) : (
          <div className="grid gap-x-4 px-2 py-1 sm:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <Link key={task.key} href={task.href} className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 hover:bg-canvas/70">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  task.blocking ? 'bg-amber-50 text-amber-600' : 'bg-canvas text-ink-4')}>
                  <task.icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                    {task.label}
                    {task.blocking && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={t('dashboard.taskBlocking')} />}
                  </span>
                  <span className="text-[11.5px] text-ink-4">{task.blocking ? t('dashboard.taskBlocking') : t('dashboard.taskData')}</span>
                </span>
                <span className="shrink-0 text-[17px] font-semibold tabular-nums text-ink">{num(task.n)}</span>
                <ArrowRight size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ── แนวโน้มค่าเสื่อม + อายุคงเหลือ ─────────── */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('dashboard.chart.depTrend')} sub={`${period(d.trend[0].period)} – ${period(d.trend[d.trend.length - 1].period)}`} />
          <div className="px-3 py-3"><DepTrendChart data={d.trend} currentIdx={11} /></div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.remainingLife')} sub={t('dashboard.remainingLifeSub')} />
          <div className="px-4 py-4">
            <BarList rows={lifeRows} format={num} />
            {lifeExcluded > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line-soft pt-3 text-[11.5px]">
                {d.notStarted > 0 && <Badge tone="gray">{t('dashboard.life.notStarted')} {num(d.notStarted)}</Badge>}
                {d.incomplete > 0 && <Badge tone="amber">{t('dashboard.life.incomplete')} {num(d.incomplete)}</Badge>}
                {d.nonDep > 0 && <Badge tone="gray">{t('dashboard.life.nonDep')} {num(d.nonDep)}</Badge>}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── ใกล้คิดครบ + Top 10 ค่าเสื่อมงวด ──────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('dashboard.nearingList')}
            sub={t('dashboard.within6m')}
            actions={<Link href="/depreciation" className="text-[13px] font-medium text-brand-600 hover:underline">{t('dashboard.viewAll')}</Link>}
          />
          {d.nearing.length === 0 ? (
            <Empty>{t('dashboard.nearingNone')}</Empty>
          ) : (
            <Table>
              <thead><tr><Th>{t('field.assetCode')}</Th><Th>{t('field.assetName')}</Th><Th right>{t('dashboard.monthsLeft')}</Th><Th right>{t('field.nbv')}</Th></tr></thead>
              <tbody>
                {d.nearing.slice(0, 8).map(({ a, v }) => (
                  <tr key={a.id}>
                    <Td mono><Link href={`/assets/${a.id}`} className="text-brand-700 hover:underline">{a.code}</Link></Td>
                    <Td className="max-w-[220px] truncate">{lk.assetName(a)}</Td>
                    <Td right><Badge tone={v!.remainingMonths <= 3 ? 'red' : 'amber'}>{num(v!.remainingMonths)}</Badge></Td>
                    <Td right className="text-ink">{money(v!.nbv, 0)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader
            title={t('dashboard.topDep')}
            sub={`${d.useSnap ? t('dashboard.locked') : t('dashboard.estimate')} · ${period(CURRENT_PERIOD)}`}
            actions={<Link href="/depreciation" className="text-[13px] font-medium text-brand-600 hover:underline">{t('dashboard.viewAll')}</Link>}
          />
          {d.topDep.length === 0 ? (
            <Empty>{t('dashboard.topDepNone')}</Empty>
          ) : (
            <Table>
              <thead><tr><Th>#</Th><Th>{t('field.assetCode')}</Th><Th>{t('field.assetName')}</Th><Th right>{t('field.periodDep')}</Th></tr></thead>
              <tbody>
                {d.topDep.map((x, i) => (
                  <tr key={x.id}>
                    <Td className="text-ink-4">{i + 1}</Td>
                    <Td mono><Link href={`/assets/${x.id}`} className="text-brand-700 hover:underline">{x.code}</Link></Td>
                    <Td className="max-w-[200px] truncate">{x.name}</Td>
                    <Td right className="font-medium text-ink">{money(x.dep)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* ── มูลค่าตามหมวด + บริษัท/สาขา ───────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.chart.valueByCategory')} sub={t('dashboard.chart.costVsNbv')} />
          <div className="px-4 py-4">
            <BarList
              rows={d.bySub.slice(0, 8).map((r) => ({ label: r.label, value: r.cost, sub: r.nbv, hint: `${num(r.count)}` }))}
              format={(n) => money(n, 0)} secondary primaryLabel={t('field.nbv')} secondaryLabel={t('field.cost')}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.chart.valueByCompany')} />
          <div className="px-4 py-4">
            <BarList rows={d.byCompany.map((r) => ({ label: r.label, value: r.cost, hint: `${num(r.count)}` }))} format={(n) => money(n, 0)} />
            <div className="mt-4 border-t border-line-soft pt-4">
              <div className="mb-2 text-[12px] font-medium text-ink-3">{t('dashboard.chart.valueByBranch')}</div>
              <BarList rows={d.byBranch.map((r) => ({ label: r.label, value: r.cost, hint: `${num(r.count)}` }))} format={(n) => money(n, 0)} />
            </div>
          </div>
        </Card>
      </div>

      {/* ── แหล่งที่มา + สถานะ ────────────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.chart.bySource')} sub={t('dashboard.chart.costVsNbv')} />
          <div className="px-4 py-4">
            <BarList
              rows={d.bySource.map((r) => ({ label: r.label, value: r.cost, sub: r.nbv, hint: `${num(r.count)}` }))}
              format={(n) => money(n, 0)} secondary primaryLabel={t('field.nbv')} secondaryLabel={t('field.cost')}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dashboard.chart.byStatus')} />
          <div className="px-4 py-4"><BarList rows={d.byStatus} format={num} /></div>
        </Card>
      </div>

      {/* ── กิจกรรมล่าสุด ─────────────────────────── */}
      <Card className="mt-4">
        <CardHeader
          title={t('dashboard.recent')}
          sub={t('dashboard.recentAll')}
          actions={<Link href="/audit" className="text-[13px] font-medium text-brand-600 hover:underline">{t('dashboard.viewAll')}</Link>}
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

// ── KPI card ─────────────────────────────────────────────
function Kpi({
  label, value, sub, icon: Icon, href, strong, tone,
}: {
  label: string; value: string; sub?: string; icon: typeof Package; href?: string; strong?: boolean;
  tone?: 'green' | 'amber' | 'gray';
}) {
  const body = (
    <div className={cx('h-full rounded-xl border bg-white px-4 py-3.5 shadow-card transition-all',
      href ? 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md' : '',
      strong ? 'border-brand-200 ring-1 ring-brand-100' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] text-ink-3">{label}</span>
        <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg',
          tone === 'green' ? 'bg-emerald-50 text-emerald-600'
          : tone === 'amber' ? 'bg-amber-50 text-amber-600'
          : strong ? 'bg-brand-50 text-brand-600' : 'bg-canvas text-ink-4')}>
          <Icon size={16} />
        </span>
      </div>
      <div className={cx('mt-2 text-[23px] font-semibold tabular-nums tracking-tight', strong ? 'text-brand-700' : 'text-ink')}>{value}</div>
      {sub && <div className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-3">{href && <ArrowUpRight size={12} className="text-ink-4" />}{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : <div>{body}</div>;
}
