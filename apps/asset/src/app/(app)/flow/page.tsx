'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, PieChart, Pie, Cell,
} from 'recharts';
import {
  Package, Coins, TrendingDown, Wallet, FileInput, FileText, UserRound, CheckCircle2,
  BarChart3, PackageCheck, AlertTriangle, MapPin, Inbox, Clock, Paperclip, ArrowRight,
  ChevronRight, CalendarClock,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore, CURRENT_PERIOD } from '@/lib/store';
import { useValuations, useMissingFlags, useLookups } from '@/lib/hooks';
import { addMonths, buildSchedule, isDepreciable, prorationFor, totalCost } from '@/lib/depreciation';
import { PageHeader, cx } from '@/components/ui';

const EXCLUDE = ['DISPOSED', 'ARCHIVED', 'CANDIDATE'];
const ACTIVE_SET = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'];
const OA_PENDING = ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'];
const DONUT = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#94A3B8', '#F43F5E'];

/* ---------------------------------------------------------------- Card shell */
function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-[14px] border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)]', className)}>
      {title && (
        <div className="flex items-center justify-between px-5 pb-0 pt-4">
          <h3 className="text-[16px] font-bold text-slate-900">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- SVG ring */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, Math.max(0, pct / 100)));
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#EEF2F7" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="fill-slate-800 text-[13px] font-bold">{pct.toFixed(1)}%</text>
    </svg>
  );
}

/* KPI mini ascending bars / sparkline */
function MiniBars({ color }: { color: string }) {
  const h = [8, 12, 10, 16, 14, 20, 24];
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20">
      {h.map((v, i) => <rect key={i} x={i * 11} y={28 - v} width="7" height={v} rx="1.5" fill={color} opacity={0.35 + i * 0.09} />)}
    </svg>
  );
}
function MiniSpark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20">
      <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d="M0 22 L13 18 L26 20 L40 12 L53 14 L66 7 L80 4 L80 28 L0 28 Z" fill="url(#sp)" />
      <path d="M0 22 L13 18 L26 20 L40 12 L53 14 L66 7 L80 4" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export default function FlowPage() {
  const { money, num, period } = useI18n();
  const { state } = useStore();
  const vals = useValuations();
  const miss = useMissingFlags();
  const lk = useLookups();
  const [range, setRange] = useState<6 | 12 | 36 | 999>(36);

  const d = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    const byStatus = (s: string) => state.assets.filter((a) => a.status === s).length;
    let cost = 0, accum = 0, nbv = 0, periodDep = 0, fullyDep = 0, expiring = 0, depreciating = 0;
    for (const a of live) {
      const v = vals.get(a.id); if (!v) continue;
      cost += v.cost; accum += v.accumulated; nbv += v.nbv; periodDep += v.periodDep;
      if (v.fullyDepreciated) fullyDep++;
      else if (v.remainingMonths > 0 && v.remainingMonths <= 6) expiring++;
      if (!v.fullyDepreciated && v.nbv > a.residual) depreciating++;
    }
    const noLocation = live.filter((a) => miss.get(a.id)?.location).length;
    const noDocument = live.filter((a) => miss.get(a.id)?.document).length;
    const openRuns = state.runs.filter((r) => r.status !== 'LOCKED' && r.status !== 'POSTED').length;
    return {
      live: live.length, cost, accum, nbv, periodDep, fullyDep, expiring, depreciating, noLocation, noDocument, openRuns,
      depPct: cost > 0 ? (accum / cost) * 100 : 0, nbvPct: cost > 0 ? (nbv / cost) * 100 : 0,
      oaPending: state.oa.filter((o) => OA_PENDING.includes(o.status)).length,
      draft: byStatus('DRAFT'), pending: byStatus('PENDING_REVIEW'),
      active: ACTIVE_SET.reduce((n, s) => n + byStatus(s), 0),
      disposed: byStatus('DISPOSED') + byStatus('ARCHIVED'),
    };
  }, [state.assets, state.oa, state.runs, vals, miss]);

  // แนวโน้ม nbv/accum รายเดือน (actual + forecast)
  const trend = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    const sch = live.map((a) => ({ s: isDepreciable(a) ? buildSchedule(a, prorationFor(a, state.policies)) : [], c: totalCost(a) }));
    const costTotal = sch.reduce((s, x) => s + x.c, 0);
    const back = range === 6 ? 5 : range === 12 ? 8 : 11;
    const fwd = range === 6 ? 6 : range === 12 ? 8 : range === 36 ? 12 : 18;
    const total = back + fwd + 1;
    const start = addMonths(CURRENT_PERIOD, -back);
    const nowIdx = back;
    return Array.from({ length: total }, (_, i) => {
      const p = addMonths(start, i);
      let ac = 0;
      for (const { s } of sch) { let a = 0; for (const r of s) { if (r.period > p) break; a = r.accumulated; } ac += a; }
      const nv = Math.round((costTotal - ac) * 100) / 100;
      ac = Math.round(ac * 100) / 100;
      const isA = i <= nowIdx;
      return {
        label: p.slice(2), p,
        nbvA: isA ? nv : null, nbvF: i >= nowIdx ? nv : null,
        accA: isA ? ac : null, accF: i >= nowIdx ? ac : null,
        nowLabel: i === nowIdx ? p.slice(2) : undefined,
      };
    });
  }, [state.assets, state.policies, range]);
  const nowLabel = trend.find((x) => x.nowLabel)?.label;
  const lastLabel = trend[trend.length - 1]?.label;

  // หมวดหมู่ (จำนวน + มูลค่า)
  const cats = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    const m = new Map<string, { name: string; count: number; cost: number }>();
    for (const a of live) {
      const id = a.categoryId || 'other';
      const name = lk.category(a.categoryId) || 'อื่น ๆ';
      const g = m.get(id) || { name, count: 0, cost: 0 };
      g.count++; g.cost += vals.get(a.id)?.cost ?? 0;
      m.set(id, g);
    }
    const arr = [...m.values()];
    const byCount = [...arr].sort((a, b) => b.count - a.count);
    const byCost = [...arr].sort((a, b) => b.cost - a.cost);
    const topCount = byCount.slice(0, 5);
    const otherC = byCount.slice(5).reduce((s, x) => s + x.count, 0);
    if (otherC) topCount.push({ name: 'อื่น ๆ', count: otherC, cost: 0 });
    const costSum = arr.reduce((s, x) => s + x.cost, 0) || 1;
    return { topCount, byCost: byCost.slice(0, 4).map((x) => ({ ...x, pct: (x.cost / costSum) * 100 })), totalCount: live.length };
  }, [state.assets, vals, lk]);

  const steps = [
    { n: d.oaPending, label: 'นำเข้าจาก OA', sub: 'รอดำเนินการ', icon: FileInput, color: '#3B82F6', href: '/oa-import' },
    { n: d.draft, label: 'สร้างทรัพย์สิน', sub: 'ฉบับร่าง', icon: FileText, color: '#64748B', href: '/assets' },
    { n: d.pending, label: 'รอตรวจอนุมัติ', sub: 'Pending review', icon: UserRound, color: '#8B5CF6', href: '/assets' },
    { n: d.active, label: 'ใช้งาน', sub: 'Active', icon: CheckCircle2, color: '#10B981', href: '/assets' },
    { n: d.depreciating, label: 'คิดค่าเสื่อม', sub: `งวด ${period(CURRENT_PERIOD)}`, icon: BarChart3, color: '#3B82F6', href: '/depreciation' },
    { n: d.fullyDep + d.disposed, label: 'หมดอายุ/จำหน่าย', sub: 'ค่าเสื่อมหมด + จำหน่าย', icon: PackageCheck, color: '#64748B', href: '/assets' },
  ];

  const alerts = [
    { label: 'ใกล้หมดอายุค่าเสื่อม (ภายใน 6 เดือน)', n: d.expiring, icon: CalendarClock, color: '#F43F5E', bg: 'bg-rose-50', href: '/assets' },
    { label: 'ทรัพย์สินขาดเอกสาร', n: d.noDocument, icon: Paperclip, color: '#F59E0B', bg: 'bg-amber-50', href: '/documents' },
    { label: 'ทรัพย์สินไม่มีสถานที่', n: d.noLocation, icon: MapPin, color: '#F59E0B', bg: 'bg-amber-50', href: '/assets' },
    { label: 'รายการ OA รอดำเนินการ', n: d.oaPending, icon: Inbox, color: '#3B82F6', bg: 'bg-blue-50', href: '/oa-import' },
    { label: 'รอตรวจอนุมัติ', n: d.pending, icon: UserRound, color: '#8B5CF6', bg: 'bg-violet-50', href: '/assets' },
  ];
  const alertTotal = alerts.reduce((s, a) => s + a.n, 0);

  const tasks = [
    { label: 'รายการ OA รอดำเนินการ', n: d.oaPending, icon: Inbox, href: '/oa-import' },
    { label: 'ทรัพย์สินฉบับร่าง', n: d.draft, icon: FileText, href: '/assets' },
    { label: 'รอตรวจอนุมัติ', n: d.pending, icon: UserRound, href: '/assets' },
    { label: 'งวดค่าเสื่อมที่ยังไม่ปิด', n: d.openRuns, icon: Clock, href: '/depreciation' },
    { label: 'ทรัพย์สินไม่มีสถานที่', n: d.noLocation, icon: MapPin, href: '/assets' },
    { label: 'ทรัพย์สินขาดเอกสาร', n: d.noDocument, icon: Paperclip, href: '/documents' },
  ];

  const fmtM = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)));

  return (
    <div className="space-y-3">
      <PageHeader title="ภาพรวมทรัพย์สิน" sub="สถานะโดยรวมของทรัพย์สินทุกหมวดหมู่ อัปเดตแบบเรียลไทม์" />

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard tone="blue" icon={Package} label="ทรัพย์สินทั้งหมด" value={num(d.live)} unit="รายการ"
          foot={<span className="text-emerald-600">↑ ปัจจุบัน {num(d.live)} รายการ</span>} chart={<MiniBars color="#3B82F6" />} />
        <KpiCard tone="violet" icon={Coins} label="ราคาทุนรวม" value={money(d.cost)} unit="บาท"
          foot={<span className="text-slate-400">รวมทุกหมวดหมู่</span>} chart={<MiniSpark color="#8B5CF6" />} />
        <KpiCard tone="rose" icon={TrendingDown} label="ค่าเสื่อมสะสม" value={money(d.accum)} unit="บาท"
          foot={<span className="text-rose-500">{d.depPct.toFixed(1)}% ของราคาทุน</span>} chart={<Ring pct={d.depPct} color="#F43F5E" />} />
        <KpiCard tone="emerald" icon={Wallet} label="มูลค่าคงเหลือ (NBV)" value={money(d.nbv)} unit="บาท"
          foot={<span className="text-emerald-600">{d.nbvPct.toFixed(1)}% ของราคาทุน</span>} chart={<Ring pct={d.nbvPct} color="#10B981" />} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        {/* LEFT column */}
        <div className="space-y-3">
          {/* Process flow */}
          <Panel title="เส้นทางกระบวนการทรัพย์สิน" action={<Link href="/assets" className="text-[12.5px] font-medium text-blue-600 hover:underline">ดูรายละเอียดทั้งหมด →</Link>}>
            <div className="flex items-stretch gap-1 overflow-x-auto px-5 pb-5 pt-3">
              {steps.map((s, i) => (
                <div key={i} className="flex items-stretch gap-1">
                  <Link href={s.href} className="group flex min-w-[118px] flex-col items-center rounded-xl px-2 py-2 text-center transition hover:bg-slate-50">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${s.color}14` }}>
                      <s.icon size={20} style={{ color: s.color }} strokeWidth={1.9} />
                    </span>
                    <span className="mt-2 text-[22px] font-bold leading-none tabular-nums text-slate-900">{num(s.n)}</span>
                    <span className="mt-1.5 text-[13px] font-medium text-slate-700">{s.label}</span>
                    <span className="text-[11px] text-slate-400">{s.sub}</span>
                  </Link>
                  {i < steps.length - 1 && <div className="flex items-center text-slate-300"><ArrowRight size={16} /></div>}
                </div>
              ))}
            </div>
          </Panel>

          {/* Trend + Dep status */}
          <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
            <Panel title="แนวโน้มมูลค่าทรัพย์สินรายเดือน"
              action={
                <div className="flex gap-1">
                  {([[6, '6 เดือน'], [12, '1 ปี'], [36, '3 ปี'], [999, 'ทั้งหมด']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setRange(v)} className={cx('rounded-md px-2 py-1 text-[11.5px] font-medium transition', range === v ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100')}>{l}</button>
                  ))}
                </div>
              }>
              <div className="px-3 pb-3 pt-2">
                <div className="mb-1 flex items-center gap-4 px-2 text-[11.5px] text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> มูลค่าคงเหลือ (NBV)</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> ค่าเสื่อมสะสม</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" /> ช่วงพยากรณ์</span>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={trend} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" /><stop offset="100%" stopColor="#3B82F6" stopOpacity="0" /></linearGradient>
                      <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.15" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" /></linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#EEF2F7" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tickFormatter={fmtM} tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={44} />
                    {nowLabel && lastLabel && <ReferenceArea x1={nowLabel} x2={lastLabel} fill="#F1F5F9" fillOpacity={0.6} />}
                    {nowLabel && <ReferenceLine x={nowLabel} stroke="#94A3B8" strokeDasharray="3 3" label={{ value: 'ปัจจุบัน', position: 'top', fontSize: 10, fill: '#94A3B8' }} />}
                    <Tooltip formatter={(v: any, n: any) => [typeof v === 'number' ? money(v) : v, n]} labelFormatter={(l: any) => `งวด ${l}`} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #E2E8F0' }} />
                    <Area dataKey="nbvA" name="NBV" stroke="#3B82F6" strokeWidth={2.2} fill="url(#gN)" connectNulls dot={false} />
                    <Area dataKey="nbvF" name="NBV (พยากรณ์)" stroke="#3B82F6" strokeWidth={2.2} strokeDasharray="5 4" fill="none" connectNulls dot={false} />
                    <Area dataKey="accA" name="ค่าเสื่อมสะสม" stroke="#8B5CF6" strokeWidth={2} fill="url(#gA)" connectNulls dot={false} />
                    <Area dataKey="accF" name="ค่าเสื่อมสะสม (พยากรณ์)" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 4" fill="none" connectNulls dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="สถานะค่าเสื่อมราคา" action={<Link href="/depreciation" className="text-[12.5px] font-medium text-blue-600 hover:underline">รายละเอียด →</Link>}>
              <div className="space-y-2.5 px-5 pb-5 pt-3">
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 ring-1 ring-inset ring-blue-100">
                  <div className="text-[12px] text-slate-500">ค่าเสื่อมงวดนี้ ({period(CURRENT_PERIOD)})</div>
                  <div className="mt-1 text-[22px] font-bold tabular-nums text-slate-900">{money(d.periodDep)} <span className="text-[13px] font-normal text-slate-400">บาท</span></div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-700">● กำลังคิดค่าเสื่อม · {num(d.depreciating)} รายการ</div>
                </div>
                <div className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5', d.expiring ? 'bg-rose-50' : 'bg-slate-50')}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><AlertTriangle size={15} className="text-rose-500" /></span>
                  <span className="flex-1 text-[12.5px] text-slate-600">ใกล้หมดอายุค่าเสื่อม (ภายใน 6 เดือน)</span>
                  <span className={cx('text-[13px] font-bold tabular-nums', d.expiring ? 'text-rose-600' : 'text-slate-700')}>{num(d.expiring)} รายการ</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><CheckCircle2 size={15} className="text-emerald-500" /></span>
                  <span className="flex-1 text-[12.5px] text-slate-600">ค่าเสื่อมหมดแล้ว (NBV = ราคาซาก)</span>
                  <span className="text-[13px] font-bold tabular-nums text-slate-700">{num(d.fullyDep)} รายการ</span>
                </div>
              </div>
            </Panel>
          </div>

          {/* Category donut + value */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="สัดส่วนทรัพย์สินตามหมวดหมู่">
              <div className="flex items-center gap-4 px-5 pb-5 pt-3">
                <div className="relative h-[150px] w-[150px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={cats.topCount} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                        {cats.topCount.map((_, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, n: any) => [`${num(v)} รายการ`, n]} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #E2E8F0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[22px] font-bold leading-none text-slate-900">{num(cats.totalCount)}</span>
                    <span className="text-[11px] text-slate-400">รายการ</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {cats.topCount.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                      <span className="flex-1 truncate text-slate-600">{c.name}</span>
                      <span className="font-semibold tabular-nums text-slate-800">{num(c.count)}</span>
                      <span className="w-12 text-right tabular-nums text-slate-400">{((c.count / cats.totalCount) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            <Panel title="มูลค่าทรัพย์สินตามหมวดหมู่">
              <div className="space-y-3 px-5 pb-5 pt-4">
                {cats.byCost.map((c, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                      <span className="truncate text-slate-600">{c.name}</span>
                      <span className="tabular-nums"><b className="text-slate-800">{money(c.cost)}</b> <span className="text-slate-400">{c.pct.toFixed(1)}%</span></span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, c.pct)}%`, background: DONUT[i % DONUT.length] }} />
                    </div>
                  </div>
                ))}
                {cats.byCost.length === 0 && <div className="py-6 text-center text-[13px] text-slate-400">ยังไม่มีข้อมูล</div>}
              </div>
            </Panel>
          </div>
        </div>

        {/* RIGHT column */}
        <div className="space-y-3">
          <Panel title={<span className="flex items-center gap-2">การแจ้งเตือนสำคัญ {alertTotal > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{alertTotal}</span>}</span>}
            action={<Link href="/assets" className="text-[12.5px] font-medium text-blue-600 hover:underline">ดูทั้งหมด →</Link>}>
            <ul className="px-2.5 pb-3 pt-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition hover:bg-slate-50">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', a.bg)}><a.icon size={16} style={{ color: a.color }} /></span>
                    <span className="flex-1 text-[12.5px] leading-snug text-slate-600">{a.label}</span>
                    <span className="text-[12.5px] font-bold tabular-nums text-slate-800">{num(a.n)}</span>
                    <ChevronRight size={15} className="text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="งานและเอกสารตกค้าง" action={<Link href="/assets" className="text-[12.5px] font-medium text-blue-600 hover:underline">ดูทั้งหมด →</Link>}>
            <ul className="px-2.5 pb-3 pt-2">
              {tasks.map((tk, i) => (
                <li key={i}>
                  <Link href={tk.href} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition hover:bg-slate-50">
                    <tk.icon size={16} className="shrink-0 text-slate-400" />
                    <span className="flex-1 text-[12.5px] text-slate-600">{tk.label}</span>
                    <span className={cx('text-[13px] font-bold tabular-nums', tk.n > 0 ? 'text-rose-600' : 'text-slate-400')}>{num(tk.n)}</span>
                    <ChevronRight size={15} className="text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- KPI card */
function KpiCard({ tone, icon: Icon, label, value, unit, foot, chart }: {
  tone: 'blue' | 'violet' | 'rose' | 'emerald'; icon: typeof Package; label: string; value: string; unit: string; foot: React.ReactNode; chart: React.ReactNode;
}) {
  const T = {
    blue: { grad: 'from-blue-50 to-white', ring: 'ring-blue-100', ic: 'bg-blue-500' },
    violet: { grad: 'from-violet-50 to-white', ring: 'ring-violet-100', ic: 'bg-violet-500' },
    rose: { grad: 'from-rose-50 to-white', ring: 'ring-rose-100', ic: 'bg-rose-500' },
    emerald: { grad: 'from-emerald-50 to-white', ring: 'ring-emerald-100', ic: 'bg-emerald-500' },
  }[tone];
  return (
    <div className={cx('rounded-[14px] bg-gradient-to-br p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] ring-1 ring-inset', T.grad, T.ring)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl text-white', T.ic)}><Icon size={19} strokeWidth={2} /></span>
          <span className="text-[13.5px] font-semibold text-slate-600">{label}</span>
        </div>
        {chart}
      </div>
      <div className="mt-3 text-[26px] font-bold leading-none tabular-nums text-slate-900">{value}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11.5px] text-slate-400">{unit}</span>
        <span className="text-[11.5px] font-medium">{foot}</span>
      </div>
    </div>
  );
}
