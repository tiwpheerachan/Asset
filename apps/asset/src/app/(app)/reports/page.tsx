'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CalendarRange, ClipboardList, Download, FileWarning, Inbox, Layers, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups, useMissingFlags, useValuations } from '@/lib/hooks';
import { buildSchedule, isDepreciable, prorationFor } from '@/lib/depreciation';
import { exportXlsx, type Row } from '@/lib/excel';
import { OAStatusBadge } from '@/components/badges';
import { Badge, Button, Card, CardHeader, PageHeader, Select, Table, Td, Th, cx } from '@/components/ui';

type R = 'register' | 'category' | 'schedule' | 'location' | 'missing' | 'oa';
const LIST: { id: R; icon: typeof Layers }[] = [
  { id: 'register', icon: ClipboardList },
  { id: 'category', icon: Layers },
  { id: 'schedule', icon: CalendarRange },
  { id: 'location', icon: MapPin },
  { id: 'missing', icon: FileWarning },
  { id: 'oa', icon: Inbox },
];
const LIVE = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DRAFT', 'PENDING_REVIEW'];

function ReportsInner() {
  const { t, money, num, period, date, dateTime, periodShort } = useI18n();
  const { state, can } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const flags = useMissingFlags();
  const sp = useSearchParams();
  const [r, setR] = useState<R>((sp.get('r') as R) || 'register');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState(CURRENT_PERIOD.slice(0, 4));
  const [missType, setMissType] = useState('');
  const assets = state.assets.filter((a) => LIVE.includes(a.status) && (!branch || a.branchId === branch));

  const report = useMemo((): { cols: { k: string; l: string; right?: boolean; mono?: boolean }[]; rows: Row[]; total?: Row; render?: Record<string, (row: Row) => React.ReactNode> } => {
    if (r === 'register') {
      const rows = assets.map((a) => {
        const v = vals.get(a.id)!;
        return { code: a.code, name: lk.assetName(a), category: lk.category(a.subcategoryId), company: lk.companyCode(a.companyId), branch: lk.branch(a.branchId), department: lk.department(a.departmentId), cc: state.costCenters.find((c) => c.id === a.costCenterId)?.code ?? '', location: lk.locationObj(a.locationId)?.code ?? '', cost: v.cost, accum: v.accumulated, nbv: v.nbv };
      });
      return {
        cols: [
          { k: 'code', l: t('field.assetCode'), mono: true }, { k: 'name', l: t('field.assetName') }, { k: 'category', l: t('field.category') }, { k: 'company', l: t('field.company') },
          { k: 'branch', l: t('field.branch') }, { k: 'department', l: t('field.department') }, { k: 'cc', l: t('field.costCenter'), mono: true }, { k: 'location', l: t('field.location'), mono: true },
          { k: 'cost', l: t('field.cost'), right: true }, { k: 'accum', l: t('field.accumDep'), right: true }, { k: 'nbv', l: t('field.nbv'), right: true },
        ],
        rows,
        total: { code: t('common.total'), cost: sum(rows, 'cost'), accum: sum(rows, 'accum'), nbv: sum(rows, 'nbv') },
      };
    }
    if (r === 'category') {
      const rows: Row[] = [];
      for (const p of state.categories.filter((c) => !c.parentId)) {
        const subs = state.categories.filter((c) => c.parentId === p.id);
        const agg = (ids: string[]) => {
          const list = assets.filter((a) => ids.includes(a.subcategoryId) || ids.includes(a.categoryId));
          return { count: list.length, cost: list.reduce((s, a) => s + vals.get(a.id)!.cost, 0), accum: list.reduce((s, a) => s + vals.get(a.id)!.accumulated, 0), nbv: list.reduce((s, a) => s + vals.get(a.id)!.nbv, 0) };
        };
        rows.push({ level: 1, name: lk.category(p.id), account: lk.accountCode(p.assetAccount), ...agg([p.id]) });
        for (const s of subs) rows.push({ level: 2, name: `   ${lk.category(s.id)}`, account: lk.accountCode(s.assetAccount), ...agg([s.id]) });
      }
      const l1 = rows.filter((x) => x.level === 1);
      return {
        cols: [{ k: 'name', l: t('field.category') }, { k: 'account', l: t('field.assetAccount'), mono: true }, { k: 'count', l: t('common.count'), right: true }, { k: 'cost', l: t('field.cost'), right: true }, { k: 'accum', l: t('field.accumDep'), right: true }, { k: 'nbv', l: t('field.nbv'), right: true }],
        rows,
        total: { name: t('common.total'), count: sum(l1, 'count'), cost: sum(l1, 'cost'), accum: sum(l1, 'accum'), nbv: sum(l1, 'nbv') },
      };
    }
    if (r === 'schedule') {
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
      const rows = assets
        .filter(isDepreciable)
        .map((a) => {
          const sch = buildSchedule(a, prorationFor(a, state.policies));
          const row: Row = { code: a.code, name: lk.assetName(a) };
          let tot = 0;
          for (const m of months) {
            const d = sch.find((x) => x.period === m)?.depreciation ?? 0;
            row[m] = d;
            tot += d;
          }
          row.total = tot;
          return row;
        })
        .filter((x) => (x.total as number) > 0);
      const total: Row = { code: t('common.total') };
      for (const m of [...months, 'total']) total[m] = sum(rows, m);
      return { cols: [{ k: 'code', l: t('field.assetCode'), mono: true }, { k: 'name', l: t('field.assetName') }, ...months.map((m) => ({ k: m, l: periodShort(m), right: true })), { k: 'total', l: t('common.total'), right: true }], rows, total };
    }
    if (r === 'location') {
      const rows: Row[] = [];
      for (const b of state.branches.filter((x) => !branch || x.id === branch)) {
        for (const l of [...state.locations.filter((x) => x.branchId === b.id), null]) {
          const list = assets.filter((a) => a.branchId === b.id && (l ? a.locationId === l.id : !a.locationId));
          if (!list.length) continue;
          rows.push({ branch: lk.branch(b.id), code: l?.code ?? '—', location: l ? lk.location(l.id) : t('loc.unassigned'), count: list.length, qty: list.reduce((s, a) => s + a.quantity, 0), cost: list.reduce((s, a) => s + vals.get(a.id)!.cost, 0), nbv: list.reduce((s, a) => s + vals.get(a.id)!.nbv, 0) });
        }
      }
      return {
        cols: [{ k: 'branch', l: t('field.branch') }, { k: 'code', l: t('field.code'), mono: true }, { k: 'location', l: t('field.location') }, { k: 'count', l: t('common.count'), right: true }, { k: 'qty', l: t('field.quantity'), right: true }, { k: 'cost', l: t('field.cost'), right: true }, { k: 'nbv', l: t('field.nbv'), right: true }],
        rows,
        total: { branch: t('common.total'), count: sum(rows, 'count'), qty: sum(rows, 'qty'), cost: sum(rows, 'cost'), nbv: sum(rows, 'nbv') },
      };
    }
    if (r === 'missing') {
      const label: Record<string, string> = { photo: t('assets.missingPhoto'), category: t('dashboard.kpi.missingCategory'), location: t('assets.missingLocation'), mapping: t('categories.mapping'), policy: t('issue.MISSING_POLICY') };
      const rows = assets
        .map((a) => {
          const f = flags.get(a.id)!;
          const miss = (['photo', 'category', 'location', 'mapping', 'policy'] as const).filter((k) => f[k] && (!missType || k === missType));
          return { code: a.code, name: lk.assetName(a), branch: lk.branch(a.branchId), department: lk.department(a.departmentId), missing: miss.map((k) => label[k]).join(', '), n: miss.length };
        })
        .filter((x) => x.n > 0);
      return {
        cols: [{ k: 'code', l: t('field.assetCode'), mono: true }, { k: 'name', l: t('field.assetName') }, { k: 'branch', l: t('field.branch') }, { k: 'department', l: t('field.department') }, { k: 'missing', l: t('reports.missingType') }],
        rows,
        render: { missing: (row) => <span className="flex flex-wrap gap-1">{String(row.missing).split(', ').map((m) => <Badge key={m} tone="amber">{m}</Badge>)}</span> },
      };
    }
    // oa
    const rows = state.oa.map((o) => ({
      imported: o.importedAt,
      oaNo: o.oaNo,
      item: o.itemName,
      status: o.status,
      created: state.assets.filter((a) => o.createdAssetIds.includes(a.id)).map((a) => a.code).join(', '),
      error: o.error ? t(`issue.${o.error}`) : o.duplicateOf ? `${t('oa.duplicateOf')} ${o.duplicateOf}` : o.rejectReason ?? '',
    }));
    return {
      cols: [{ k: 'imported', l: t('field.importedAt') }, { k: 'oaNo', l: t('field.oaNo'), mono: true }, { k: 'item', l: t('field.itemName') }, { k: 'status', l: t('common.status') }, { k: 'created', l: t('reports.assetCreated'), mono: true }, { k: 'error', l: t('reports.error') }],
      rows,
      render: { imported: (row) => dateTime(String(row.imported)), status: (row) => <OAStatusBadge status={row.status as never} /> },
    };
  }, [r, assets, vals, lk, state, t, year, branch, flags, missType, dateTime, periodShort]);

  const fmt = (c: { k: string; right?: boolean }, v: unknown) => (typeof v === 'number' ? (c.k === 'count' || c.k === 'qty' ? num(v) : money(v)) : (v as React.ReactNode) ?? '');
  const title = t(`reports.${r}`);

  return (
    <>
      <PageHeader title={t('reports.title')} sub={t('reports.subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <ul className="py-1.5">
            {LIST.map((x) => (
              <li key={x.id}>
                <button onClick={() => setR(x.id)} className={cx('flex w-full items-start gap-2.5 px-3 py-2.5 text-left', r === x.id ? 'bg-brand-50' : 'hover:bg-canvas')}>
                  <x.icon size={16} className={cx('mt-0.5 shrink-0', r === x.id ? 'text-brand-600' : 'text-ink-4')} />
                  <span>
                    <span className={cx('block text-[13.5px]', r === x.id ? 'font-semibold text-brand-700' : 'font-medium text-ink')}>{t(`reports.${x.id}`)}</span>
                    <span className="block text-[12px] leading-snug text-ink-3">{t(`reports.${x.id}Desc`)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="min-w-0">
          <CardHeader
            title={title}
            sub={`${lk.company('C-SHD')} · ${r === 'schedule' ? `${t('reports.fiscalYear')} ${year}` : `${t('common.asOf')} ${period(CURRENT_PERIOD)}`} · ${num(report.rows.length)} ${t('common.rows')}`}
            actions={
              <>
                {r !== 'oa' && r !== 'category' && (
                  <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-8 w-40">
                    <option value="">{t('field.branch')}: {t('common.all')}</option>
                    {state.branches.map((b) => <option key={b.id} value={b.id}>{lk.branch(b.id)}</option>)}
                  </Select>
                )}
                {r === 'schedule' && (
                  <Select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 w-24">
                    {['2024', '2025', '2026', '2027', '2028'].map((y) => <option key={y} value={y}>{y}</option>)}
                  </Select>
                )}
                {r === 'missing' && (
                  <Select value={missType} onChange={(e) => setMissType(e.target.value)} className="h-8 w-44">
                    <option value="">{t('reports.missingType')}: {t('common.all')}</option>
                    <option value="photo">{t('assets.missingPhoto')}</option>
                    <option value="category">{t('dashboard.kpi.missingCategory')}</option>
                    <option value="location">{t('assets.missingLocation')}</option>
                    <option value="mapping">{t('categories.mapping')}</option>
                    <option value="policy">{t('issue.MISSING_POLICY')}</option>
                  </Select>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Download size={14} />}
                  disabled={!can('exportReport')}
                  onClick={() => {
                    const toRow = (row: Row) => Object.fromEntries(report.cols.map((c) => [c.l, row[c.k] ?? ''])) as Row;
                    exportXlsx(`${title.replace(/\s+/g, '_')}_${r === 'schedule' ? year : CURRENT_PERIOD}`, [{ name: r, rows: [...report.rows.map(toRow), ...(report.total ? [toRow(report.total)] : [])] }]);
                  }}
                >
                  {t('common.exportExcel')}
                </Button>
              </>
            }
          />
          <Table className="scroll-thin max-h-[68vh] overflow-y-auto">
            <thead className="sticky top-0 z-10">
              <tr>{report.cols.map((c) => <Th key={c.k} right={c.right}>{c.l}</Th>)}</tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i} className={cx(row.level === 1 && 'bg-canvas/60 font-semibold')}>
                  {report.cols.map((c) => (
                    <Td key={c.k} right={c.right} mono={c.mono} className={cx(c.k === 'name' && 'min-w-[220px]', row.level === 1 && 'text-ink')}>
                      {report.render?.[c.k] ? report.render[c.k](row) : fmt(c, row[c.k])}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
            {report.total && (
              <tfoot className="sticky bottom-0">
                <tr className="bg-[#F3F5F8] font-semibold text-ink">
                  {report.cols.map((c) => (
                    <td key={c.k} className={cx('border-t border-line px-3 py-2 text-[13px]', c.right && 'text-right tabular-nums')}>{fmt(c, report.total![c.k])}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </Table>
          <div className="px-4 py-2.5 text-[11.5px] text-ink-4">{date(new Date().toISOString())} · {t('common.asOf')} {period(CURRENT_PERIOD)}</div>
        </Card>
      </div>
    </>
  );
}

function sum(rows: Row[], k: string) {
  return Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsInner />
    </Suspense>
  );
}
