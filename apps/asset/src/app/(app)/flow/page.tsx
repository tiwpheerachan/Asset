'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowRight, Boxes, CheckCircle2, ClipboardCheck,
  FileEdit, Inbox, MapPin, Paperclip, TrendingDown, CalendarClock, Clock, LineChart,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore, CURRENT_PERIOD } from '@/lib/store';
import { useValuations, useMissingFlags, useLookups } from '@/lib/hooks';
import { addMonths, buildSchedule, isDepreciable, prorationFor, totalCost } from '@/lib/depreciation';
import { Badge, Card, Modal, PageHeader, Table, Td, Th, cx } from '@/components/ui';

const ACTIVE_SET = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'];
const OA_PENDING = ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'];
const EXCLUDE = ['DISPOSED', 'ARCHIVED', 'CANDIDATE'];

export default function FlowPage() {
  const { t, money, num, period } = useI18n();
  const { state } = useStore();
  const vals = useValuations();
  const miss = useMissingFlags();
  const [listModal, setListModal] = useState<'expiring' | 'fully' | null>(null);

  const d = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    const byStatus = (s: string) => state.assets.filter((a) => a.status === s).length;

    let cost = 0, accum = 0, nbv = 0, periodDep = 0;
    let fullyDep = 0, expiring = 0, depreciating = 0;
    for (const a of live) {
      const v = vals.get(a.id);
      if (!v) continue;
      cost += v.cost; accum += v.accumulated; nbv += v.nbv; periodDep += v.periodDep;
      if (v.fullyDepreciated) fullyDep++;
      else if (v.remainingMonths > 0 && v.remainingMonths <= 6) expiring++;
      if (!v.fullyDepreciated && v.nbv > a.residual) depreciating++;
    }

    const noLocation = live.filter((a) => miss.get(a.id)?.location).length;
    const noDocument = live.filter((a) => miss.get(a.id)?.document).length;
    const noPhoto = live.filter((a) => miss.get(a.id)?.photo).length;
    const openRuns = state.runs.filter((r) => r.status !== 'LOCKED').length;

    return {
      live: live.length,
      oaPending: state.oa.filter((o) => OA_PENDING.includes(o.status)).length,
      oaCreated: state.oa.filter((o) => o.status === 'CREATED').length,
      draft: byStatus('DRAFT'),
      pending: byStatus('PENDING_REVIEW'),
      active: ACTIVE_SET.reduce((n, s) => n + byStatus(s), 0),
      disposed: byStatus('DISPOSED') + byStatus('ARCHIVED'),
      cost, accum, nbv, periodDep,
      depPct: cost > 0 ? (accum / cost) * 100 : 0,
      nbvPct: cost > 0 ? (nbv / cost) * 100 : 0,
      fullyDep, expiring, depreciating, noLocation, noDocument, noPhoto, openRuns,
    };
  }, [state.assets, state.oa, state.runs, vals, miss]);

  // แนวโน้มค่าเสื่อม/NBV รายเดือน — ย้อนหลัง 11 เดือน + พยากรณ์ล่วงหน้า 12 เดือน
  const trend = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    const schedules = live.map((a) => ({
      sched: isDepreciable(a) ? buildSchedule(a, prorationFor(a, state.policies)) : [],
      cost: totalCost(a),
    }));
    const costTotal = schedules.reduce((s, x) => s + x.cost, 0);
    const start = addMonths(CURRENT_PERIOD, -11);
    const periods = Array.from({ length: 24 }, (_, i) => addMonths(start, i));
    const points = periods.map((p) => {
      let accum = 0;
      for (const { sched } of schedules) {
        let a = 0;
        for (const row of sched) { if (row.period > p) break; a = row.accumulated; }
        accum += a;
      }
      return { period: p, accum: Math.round(accum * 100) / 100, nbv: Math.round((costTotal - accum) * 100) / 100 };
    });
    return { points, costTotal, nowIndex: periods.indexOf(CURRENT_PERIOD) };
  }, [state.assets, state.policies]);

  // โหนดกระบวนการ (pipeline ของทรัพย์สิน)
  const flow = [
    { key: 'oa', label: 'นำเข้าจาก OA', sub: 'รอดำเนินการ', count: d.oaPending, icon: Inbox, href: '/oa-import', accent: 'amber' as const, alert: d.oaPending > 0 },
    { key: 'draft', label: 'สร้างทรัพย์สิน', sub: 'ฉบับร่าง', count: d.draft, icon: FileEdit, href: '/assets', accent: 'slate' as const, alert: false },
    { key: 'review', label: 'รอตรวจอนุมัติ', sub: 'Pending review', count: d.pending, icon: ClipboardCheck, href: '/assets', accent: 'amber' as const, alert: d.pending > 0 },
    { key: 'active', label: 'ใช้งาน', sub: 'Active', count: d.active, icon: CheckCircle2, href: '/assets', accent: 'green' as const, alert: false },
    { key: 'dep', label: 'คิดค่าเสื่อม', sub: `งวด ${period(CURRENT_PERIOD)}`, count: d.depreciating, icon: TrendingDown, href: '/depreciation', accent: 'blue' as const, alert: false },
    { key: 'end', label: 'หมดอายุ/จำหน่าย', sub: 'ค่าเสื่อมหมด + จำหน่าย', count: d.fullyDep + d.disposed, icon: Archive, href: '/assets', accent: 'slate' as const, alert: false },
  ];

  const accentBar: Record<string, string> = {
    amber: 'bg-amber-400', slate: 'bg-ink-4', green: 'bg-emerald-500', blue: 'bg-brand-500',
  };

  const kpis = [
    { label: 'ทรัพย์สินทั้งหมด', value: num(d.live), unit: 'รายการ', icon: Boxes, tone: 'ink' },
    { label: 'ราคาทุนรวม', value: money(d.cost), unit: 'บาท', icon: Boxes, tone: 'ink' },
    { label: 'ค่าเสื่อมสะสม', value: money(d.accum), unit: `${d.depPct.toFixed(1)}% ของราคาทุน`, icon: TrendingDown, tone: 'ink' },
    { label: 'มูลค่าคงเหลือ (NBV)', value: money(d.nbv), unit: `${d.nbvPct.toFixed(1)}% ของราคาทุน`, icon: CheckCircle2, tone: 'brand' },
  ];

  // งาน/เอกสารตกค้าง
  const tasks = [
    { label: 'รายการ OA รอดำเนินการ', count: d.oaPending, href: '/oa-import', icon: Inbox, tone: d.oaPending ? 'amber' : 'gray' },
    { label: 'ทรัพย์สินฉบับร่าง', count: d.draft, href: '/assets', icon: FileEdit, tone: d.draft ? 'amber' : 'gray' },
    { label: 'รอตรวจอนุมัติ', count: d.pending, href: '/assets', icon: ClipboardCheck, tone: d.pending ? 'amber' : 'gray' },
    { label: 'งวดค่าเสื่อมที่ยังไม่ปิด', count: d.openRuns, href: '/depreciation', icon: Clock, tone: d.openRuns ? 'amber' : 'gray' },
    { label: 'ทรัพย์สินไม่มีสถานที่', count: d.noLocation, href: '/assets', icon: MapPin, tone: d.noLocation ? 'amber' : 'gray' },
    { label: 'ทรัพย์สินขาดเอกสาร', count: d.noDocument, href: '/documents', icon: Paperclip, tone: d.noDocument ? 'amber' : 'gray' },
  ];

  return (
    <div>
      <PageHeader title="กระบวนการทรัพย์สิน (Flow)" sub="ภาพรวมเส้นทางทรัพย์สินตั้งแต่รับจาก OA จนคิดค่าเสื่อม พร้อมแนวโน้ม งานค้าง และการเตือน" />

      {/* KPI */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-[12.5px] text-ink-3">{k.label}</div>
              <k.icon size={16} className="text-ink-4" />
            </div>
            <div className={cx('mt-1.5 text-[24px] font-semibold leading-none tabular-nums', k.tone === 'brand' ? 'text-brand-700' : 'text-ink')}>{k.value}</div>
            <div className="mt-1 text-[11.5px] text-ink-4">{k.unit}</div>
          </Card>
        ))}
      </div>

      {/* Flow map */}
      <Card className="mb-5 p-5">
        <div className="mb-4 text-[13.5px] font-semibold text-ink">เส้นทางกระบวนการ</div>
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {flow.map((node, i) => (
            <div key={node.key} className="flex items-stretch gap-1">
              <Link
                href={node.href}
                className="group relative flex min-w-[150px] flex-col overflow-hidden rounded-lg border border-line bg-white p-3.5 transition hover:border-brand-500 hover:shadow-card"
              >
                <span className={cx('absolute inset-x-0 top-0 h-1', accentBar[node.accent])} />
                <div className="mt-1 flex items-center justify-between">
                  <node.icon size={18} className="text-ink-3 group-hover:text-brand-600" />
                  {node.alert && <AlertTriangle size={14} className="text-amber-500" />}
                </div>
                <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-ink">{num(node.count)}</div>
                <div className="mt-1.5 text-[13px] font-medium text-ink">{node.label}</div>
                <div className="text-[11.5px] text-ink-4">{node.sub}</div>
              </Link>
              {i < flow.length - 1 && (
                <div className="flex items-center text-ink-4"><ArrowRight size={18} /></div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11.5px] text-ink-4">คลิกแต่ละขั้นเพื่อไปยังหน้าที่เกี่ยวข้อง · ตัวเลขอัปเดตสดจากข้อมูลจริง</div>
      </Card>

      {/* แนวโน้มค่าเสื่อม / NBV */}
      <Card className="mb-5 p-5">
        <div className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          <LineChart size={16} className="text-brand-600" /> แนวโน้มมูลค่าทรัพย์สินรายเดือน
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-4">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-brand-500" /> มูลค่าคงเหลือ (NBV)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" /> ค่าเสื่อมสะสม</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-ink-4" /> ช่วงพยากรณ์</span>
        </div>
        <TrendChart points={trend.points} nowIndex={trend.nowIndex} max={trend.costTotal} money={money} period={period} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* เตือนค่าเสื่อม */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <CalendarClock size={16} className="text-brand-600" /> สถานะค่าเสื่อมราคา
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-md bg-canvas px-3 py-2.5">
              <span className="text-[13px] text-ink-2">ค่าเสื่อมงวดนี้ ({period(CURRENT_PERIOD)})</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink">{money(d.periodDep)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-canvas px-3 py-2.5">
              <span className="text-[13px] text-ink-2">กำลังคิดค่าเสื่อม</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink">{num(d.depreciating)} รายการ</span>
            </div>
            <button
              type="button"
              onClick={() => d.expiring > 0 && setListModal('expiring')}
              className={cx('flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition', d.expiring ? 'bg-amber-50 hover:bg-amber-100' : 'cursor-default bg-canvas')}
            >
              <span className="flex items-center gap-2 text-[13px] text-ink-2">
                {d.expiring > 0 && <AlertTriangle size={14} className="text-amber-500" />}
                ใกล้หมดอายุค่าเสื่อม (ภายใน 6 เดือน)
              </span>
              <span className={cx('flex items-center gap-1 text-[14px] font-semibold tabular-nums', d.expiring ? 'text-amber-700' : 'text-ink')}>
                {num(d.expiring)} รายการ {d.expiring > 0 && <ArrowRight size={13} />}
              </span>
            </button>
            <button
              type="button"
              onClick={() => d.fullyDep > 0 && setListModal('fully')}
              className={cx('flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition', d.fullyDep ? 'bg-canvas hover:bg-line/40' : 'cursor-default bg-canvas')}
            >
              <span className="text-[13px] text-ink-2">ค่าเสื่อมหมดแล้ว (NBV = ซาก)</span>
              <span className="flex items-center gap-1 text-[14px] font-semibold tabular-nums text-ink">
                {num(d.fullyDep)} รายการ {d.fullyDep > 0 && <ArrowRight size={13} className="text-ink-4" />}
              </span>
            </button>
          </div>
        </Card>

        {/* งาน/เอกสารตกค้าง */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <AlertTriangle size={16} className="text-amber-500" /> งานและเอกสารตกค้าง
          </div>
          <div className="space-y-1.5">
            {tasks.map((it) => (
              <Link key={it.label} href={it.href} className="flex items-center justify-between rounded-md px-3 py-2.5 transition hover:bg-canvas">
                <span className="flex items-center gap-2 text-[13px] text-ink-2"><it.icon size={15} className="text-ink-4" /> {it.label}</span>
                <Badge tone={it.count > 0 ? (it.tone === 'amber' ? 'amber' : 'gray') : 'green'}>{it.count > 0 ? num(it.count) : '✓'}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {listModal && <AssetListModal kind={listModal} onClose={() => setListModal(null)} />}
    </div>
  );
}

/* ---------- รายการทรัพย์สินใกล้หมดอายุ / หมดแล้ว (เจาะลึก) ---------- */
function AssetListModal({ kind, onClose }: { kind: 'expiring' | 'fully'; onClose: () => void }) {
  const { money, num, period } = useI18n();
  const { state } = useStore();
  const vals = useValuations();
  const lk = useLookups();

  const rows = useMemo(() => {
    const live = state.assets.filter((a) => !EXCLUDE.includes(a.status));
    return live
      .map((a) => ({ a, v: vals.get(a.id) }))
      .filter(({ v }) => {
        if (!v) return false;
        if (kind === 'fully') return v.fullyDepreciated;
        return !v.fullyDepreciated && v.remainingMonths > 0 && v.remainingMonths <= 6;
      })
      .sort((x, y) => (x.v!.remainingMonths - y.v!.remainingMonths));
  }, [state.assets, vals, kind]);

  const title = kind === 'expiring' ? `ใกล้หมดอายุค่าเสื่อม (ภายใน 6 เดือน) · ${num(rows.length)} รายการ` : `ค่าเสื่อมหมดแล้ว · ${num(rows.length)} รายการ`;

  return (
    <Modal open onClose={onClose} title={title} width="max-w-3xl">
      <p className="mb-3 text-[12.5px] text-ink-3">
        {kind === 'expiring'
          ? 'ทรัพย์สินที่จะคิดค่าเสื่อมครบภายใน 6 เดือนข้างหน้า — ควรเตรียมทบทวนการใช้งาน/การจำหน่าย'
          : 'ทรัพย์สินที่คิดค่าเสื่อมครบแล้ว มูลค่าคงเหลือเท่ากับมูลค่าซาก (ยังอยู่ในทะเบียนจนกว่าจะจำหน่าย)'}
      </p>
      <div className="max-h-[60vh] overflow-auto">
        <Table>
          <thead>
            <tr>
              <Th>รหัส</Th>
              <Th>ชื่อทรัพย์สิน</Th>
              <Th>หมวดหมู่</Th>
              <Th right>คงเหลือ (เดือน)</Th>
              <Th>งวดสุดท้าย</Th>
              <Th right>NBV ปัจจุบัน</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, v }) => (
              <tr key={a.id} className="cursor-pointer" onClick={onClose}>
                <Td mono className="whitespace-nowrap font-medium text-brand-700">
                  <Link href={`/assets/${a.id}`} className="hover:underline">{a.code}</Link>
                </Td>
                <Td className="min-w-[200px] text-ink">{lk.assetName(a)}</Td>
                <Td className="whitespace-nowrap text-ink-3">{lk.category(a.subcategoryId) || lk.category(a.categoryId)}</Td>
                <Td right>
                  <span className={cx('font-semibold tabular-nums', kind === 'expiring' ? 'text-amber-700' : 'text-ink-3')}>
                    {kind === 'fully' ? '0' : v!.remainingMonths}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{v!.endPeriod ? period(v!.endPeriod) : '—'}</Td>
                <Td right className="tabular-nums">{money(v!.nbv)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <div className="py-8 text-center text-[13px] text-ink-3">ไม่มีรายการ</div>}
      </div>
    </Modal>
  );
}

/* ---------- กราฟเส้นแนวโน้ม (SVG, ไม่พึ่งไลบรารีภายนอก) ---------- */
function TrendChart({
  points, nowIndex, max, money, period,
}: {
  points: { period: string; accum: number; nbv: number }[];
  nowIndex: number;
  max: number;
  money: (n: number) => string;
  period: (p: string) => string;
}) {
  const W = 820, H = 260, padL = 64, padR = 12, padT = 16, padB = 34;
  const n = points.length;
  const top = max > 0 ? max : 1;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const base = H - padB;

  const line = (sel: (p: typeof points[number]) => number, from: number, to: number) =>
    points.slice(from, to + 1).map((p, k) => `${x(from + k)},${y(sel(p))}`).join(' ');

  const nbvArea = `${x(0)},${base} ` + points.map((p, i) => `${x(i)},${y(p.nbv)}`).join(' ') + ` ${x(n - 1)},${base}`;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, v: top * f, yy: y(top * f) }));
  const labelEvery = Math.ceil(n / 8);
  const fmtM = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v)));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full min-w-[640px]" preserveAspectRatio="none">
        {/* grid + y labels */}
        {grid.map((g) => (
          <g key={g.f}>
            <line x1={padL} y1={g.yy} x2={W - padR} y2={g.yy} stroke="currentColor" className="text-line" strokeWidth={1} />
            <text x={padL - 8} y={g.yy + 3} textAnchor="end" className="fill-ink-4 text-[10px]">{fmtM(g.v)}</text>
          </g>
        ))}

        {/* เส้นแบ่งปัจจุบัน / พยากรณ์ */}
        {nowIndex >= 0 && (
          <>
            <rect x={x(nowIndex)} y={padT} width={W - padR - x(nowIndex)} height={base - padT} className="fill-ink-4/5" />
            <line x1={x(nowIndex)} y1={padT} x2={x(nowIndex)} y2={base} stroke="currentColor" className="text-ink-3" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(nowIndex) + 4} y={padT + 10} className="fill-ink-4 text-[9.5px]">ปัจจุบัน</text>
          </>
        )}

        {/* พื้นที่ใต้เส้น NBV */}
        <polygon points={nbvArea} className="fill-brand-500/10" />

        {/* เส้น NBV (ก่อนปัจจุบัน = ทึบ, หลัง = ประ) */}
        <polyline points={line((p) => p.nbv, 0, Math.max(0, nowIndex))} fill="none" stroke="currentColor" className="text-brand-500" strokeWidth={2.2} strokeLinejoin="round" />
        {nowIndex < n - 1 && <polyline points={line((p) => p.nbv, Math.max(0, nowIndex), n - 1)} fill="none" stroke="currentColor" className="text-brand-500" strokeWidth={2.2} strokeDasharray="5 4" strokeLinejoin="round" />}

        {/* เส้นค่าเสื่อมสะสม */}
        <polyline points={line((p) => p.accum, 0, Math.max(0, nowIndex))} fill="none" stroke="currentColor" className="text-amber-400" strokeWidth={2} strokeLinejoin="round" />
        {nowIndex < n - 1 && <polyline points={line((p) => p.accum, Math.max(0, nowIndex), n - 1)} fill="none" stroke="currentColor" className="text-amber-400" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}

        {/* จุด + tooltip พื้นเมือง */}
        {points.map((p, i) => (
          <g key={p.period}>
            <circle cx={x(i)} cy={y(p.nbv)} r={2.4} className="fill-brand-600" />
            <circle cx={x(i)} cy={y(p.accum)} r={2.4} className="fill-amber-500" />
            <rect x={x(i) - (W - padL - padR) / (2 * n)} y={padT} width={(W - padL - padR) / n} height={base - padT} fill="transparent">
              <title>{`${period(p.period)}\nNBV: ${money(p.nbv)}\nค่าเสื่อมสะสม: ${money(p.accum)}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-ink-4 text-[9.5px]">{p.period.slice(2)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
