'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Camera, CameraOff, ChevronLeft, ChevronRight, Columns3, Download, FileUp, Filter, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups, useMissingFlags, useValuations } from '@/lib/hooks';
import type { Asset, AssetStatus } from '@/lib/types';
import { exportXlsx } from '@/lib/excel';
import { AssetStatusBadge } from '@/components/badges';
import { AssetCreateModal } from '@/components/asset-create';
import { Badge, Button, Card, DL, Drawer, Empty, Input, PageHeader, Select, Table, Td, Th, cx } from '@/components/ui';

const STATUSES: AssetStatus[] = ['CANDIDATE', 'DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DISPOSAL_PENDING', 'DISPOSED', 'ARCHIVED'];
const MISSING = ['photo', 'document', 'location', 'category', 'policy'] as const;
type Missing = (typeof MISSING)[number];

type ColKey =
  | 'code' | 'name' | 'category' | 'subcategory' | 'company' | 'branch' | 'department' | 'costCenter' | 'location' | 'serial'
  | 'qty' | 'cost' | 'acq' | 'ready' | 'life' | 'residual' | 'accum' | 'nbv' | 'status' | 'photo' | 'oa';

const ALL_COLS: ColKey[] = ['code', 'name', 'category', 'subcategory', 'company', 'branch', 'department', 'costCenter', 'location', 'serial', 'qty', 'cost', 'acq', 'ready', 'life', 'residual', 'accum', 'nbv', 'status', 'photo', 'oa'];
const DEFAULT_COLS: ColKey[] = ['code', 'name', 'subcategory', 'branch', 'department', 'location', 'qty', 'cost', 'accum', 'nbv', 'status', 'photo', 'oa'];

function RegisterInner() {
  const { t, money, num, date, period } = useI18n();
  const { state, can } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const flags = useMissingFlags();
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get('q') ?? '');
  const [f, setF] = useState({
    company: '', branch: '', department: '', costCenter: '', location: '', category: '', subcategory: '',
    status: sp.get('status') ?? '', acqFrom: '', acqTo: '', readyFrom: '', readyTo: '',
  });
  const [missing, setMissing] = useState<Missing[]>(sp.get('missing') ? [sp.get('missing') as Missing] : []);
  const [more, setMore] = useState(false);
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [colMenu, setColMenu] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [quick, setQuick] = useState<Asset | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => setQ(sp.get('q') ?? ''), [sp]);
  useEffect(() => setPage(1), [q, f, missing, pageSize]);

  const colLabel: Record<ColKey, string> = {
    code: t('field.assetCode'), name: t('field.assetName'), category: t('field.category'), subcategory: t('field.subcategory'),
    company: t('field.company'), branch: t('field.branch'), department: t('field.department'), costCenter: t('field.costCenter'),
    location: t('field.location'), serial: t('field.serialNumber'), qty: t('field.quantity'), cost: t('field.cost'),
    acq: t('field.acquisitionDate'), ready: t('field.readyDate'), life: t('field.usefulLife'), residual: t('field.residual'),
    accum: t('field.accumDep'), nbv: t('field.nbv'), status: t('common.status'), photo: t('assets.photoStatus'), oa: t('field.oaRef'),
  };
  const missingLabel: Record<Missing, string> = {
    photo: t('assets.missingPhoto'), document: t('assets.missingDoc'), location: t('assets.missingLocation'),
    category: t('dashboard.kpi.missingCategory'), policy: t('issue.MISSING_POLICY'),
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.assets.filter((a) => {
      if (s) {
        const hay = [a.code, a.nameTh, a.nameEn, a.serialNumber, a.source.invoiceNo, a.source.oaNo, a.source.poNo].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (f.company && a.companyId !== f.company) return false;
      if (f.branch && a.branchId !== f.branch) return false;
      if (f.department && a.departmentId !== f.department) return false;
      if (f.costCenter && a.costCenterId !== f.costCenter) return false;
      if (f.location && (f.location === '__none' ? a.locationId : a.locationId !== f.location)) return false;
      if (f.category && a.categoryId !== f.category) return false;
      if (f.subcategory && a.subcategoryId !== f.subcategory) return false;
      if (f.status === 'PENDING' ? !['CANDIDATE', 'DRAFT', 'PENDING_REVIEW'].includes(a.status) : f.status && a.status !== f.status) return false;
      if (f.acqFrom && a.acquisitionDate < f.acqFrom) return false;
      if (f.acqTo && a.acquisitionDate > f.acqTo) return false;
      if (f.readyFrom && (!a.readyDate || a.readyDate < f.readyFrom)) return false;
      if (f.readyTo && (!a.readyDate || a.readyDate > f.readyTo)) return false;
      const fl = flags.get(a.id)!;
      for (const m of missing) if (!fl[m]) return false;
      return true;
    });
  }, [state.assets, q, f, missing, flags]);

  const totals = useMemo(() => {
    let cost = 0, accum = 0, nbv = 0, qty = 0;
    for (const a of rows) {
      const v = vals.get(a.id)!;
      cost += v.cost; accum += v.accumulated; nbv += v.nbv; qty += a.quantity;
    }
    return { cost, accum, nbv, qty };
  }, [rows, vals]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice((page - 1) * pageSize, page * pageSize);
  const activeFilterCount = Object.values(f).filter(Boolean).length + missing.length + (q ? 1 : 0);
  const show = (c: ColKey) => cols.includes(c);

  const doExport = () => {
    exportXlsx(`Asset_Register_${CURRENT_PERIOD}`, [
      {
        name: 'Asset Register',
        rows: rows.map((a) => {
          const v = vals.get(a.id)!;
          return {
            [colLabel.code]: a.code, [t('field.nameTh')]: a.nameTh, [t('field.nameEn')]: a.nameEn,
            [colLabel.category]: lk.category(a.categoryId), [colLabel.subcategory]: lk.category(a.subcategoryId),
            [colLabel.company]: lk.company(a.companyId), [colLabel.branch]: lk.branch(a.branchId), [colLabel.department]: lk.department(a.departmentId),
            [colLabel.costCenter]: lk.costCenter(a.costCenterId), [colLabel.location]: lk.location(a.locationId), [colLabel.serial]: a.serialNumber,
            [colLabel.qty]: a.quantity, [t('field.unit')]: lk.unit(a.unit), [colLabel.cost]: v.cost, [colLabel.acq]: a.acquisitionDate,
            [colLabel.ready]: a.readyDate ?? '', [`${colLabel.life} (${t('common.months')})`]: a.lifeMonths, [colLabel.residual]: a.residual,
            [colLabel.accum]: v.accumulated, [colLabel.nbv]: v.nbv, [colLabel.status]: t(`status.${a.status}`),
            [colLabel.photo]: a.hasPhoto ? t('assets.hasPhoto') : t('assets.noPhoto'), [colLabel.oa]: a.source.oaNo ?? '',
          };
        }),
      },
    ]);
  };

  const sel = (key: keyof typeof f, label: string, opts: { v: string; l: string }[], extra?: { v: string; l: string }) => (
    <Select value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} className={cx('min-w-0', f[key] && 'border-brand-200 bg-brand-50/40')}>
      <option value="">{label}: {t('common.all')}</option>
      {extra && <option value={extra.v}>{extra.l}</option>}
      {opts.map((o) => (
        <option key={o.v} value={o.v}>{o.l}</option>
      ))}
    </Select>
  );

  return (
    <>
      <PageHeader
        title={t('assets.title')}
        sub={t('assets.subtitle')}
        actions={
          <>
            <Button icon={<Download size={15} />} onClick={doExport} disabled={!can('exportReport')}>{t('common.exportExcel')}</Button>
            {can('createAsset') && (
              <>
                <Link href="/assets/import"><Button icon={<FileUp size={15} />}>{t('assets.importLegacy')}</Button></Link>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>{t('assets.newAsset')}</Button>
              </>
            )}
          </>
        }
      />

      <Card>
        <div className="space-y-3 border-b border-line p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.globalSearch')} className="pl-8" />
            </div>
            {sel('category', t('field.category'), state.categories.filter((c) => !c.parentId).map((c) => ({ v: c.id, l: lk.category(c.id) })))}
            {sel('branch', t('field.branch'), state.branches.map((b) => ({ v: b.id, l: lk.branch(b.id) })))}
            {sel('department', t('field.department'), state.departments.map((d) => ({ v: d.id, l: lk.department(d.id) })))}
            {sel('status', t('common.status'), STATUSES.map((s) => ({ v: s, l: t(`status.${s}`) })), { v: 'PENDING', l: `— ${t('dashboard.kpi.pendingActivation')} —` })}
            <Button icon={<SlidersHorizontal size={15} />} onClick={() => setMore((m) => !m)} className={more ? 'border-brand-200 text-brand-700' : ''}>
              {t('assets.advanced')}
            </Button>
          </div>
          {more && (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-canvas/70 p-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {sel('company', t('field.company'), state.companies.map((c) => ({ v: c.id, l: lk.company(c.id) })))}
              {sel('costCenter', t('field.costCenter'), state.costCenters.map((c) => ({ v: c.id, l: lk.costCenter(c.id) })))}
              {sel('location', t('field.location'), state.locations.map((l) => ({ v: l.id, l: `${l.code} · ${lk.location(l.id)}` })), { v: '__none', l: `— ${t('assets.missingLocation')} —` })}
              {sel('subcategory', t('field.subcategory'), state.categories.filter((c) => c.parentId && (!f.category || c.parentId === f.category)).map((c) => ({ v: c.id, l: lk.category(c.id) })))}
              <div className="flex items-center gap-1.5">
                <span className="w-24 shrink-0 text-[12px] text-ink-3">{t('field.acquisitionDate')}</span>
                <Input type="date" value={f.acqFrom} onChange={(e) => setF((p) => ({ ...p, acqFrom: e.target.value }))} />
                <Input type="date" value={f.acqTo} onChange={(e) => setF((p) => ({ ...p, acqTo: e.target.value }))} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-24 shrink-0 text-[12px] text-ink-3">{t('field.readyDate')}</span>
                <Input type="date" value={f.readyFrom} onChange={(e) => setF((p) => ({ ...p, readyFrom: e.target.value }))} />
                <Input type="date" value={f.readyTo} onChange={(e) => setF((p) => ({ ...p, readyTo: e.target.value }))} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter size={14} className="mr-1 text-ink-4" />
            {MISSING.map((m) => {
              const on = missing.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => setMissing((p) => (on ? p.filter((x) => x !== m) : [...p, m]))}
                  className={cx('rounded-full border px-2.5 py-1 text-[12px] transition-colors', on ? 'border-amber-300 bg-amber-50 font-medium text-amber-800' : 'border-line bg-white text-ink-3 hover:text-ink')}
                >
                  {missingLabel[m]}
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-2 text-[12.5px] text-ink-3">
              {t('assets.result', { n: num(rows.length) })}
              {activeFilterCount > 0 && (
                <button
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  onClick={() => {
                    setQ('');
                    setMissing([]);
                    setF({ company: '', branch: '', department: '', costCenter: '', location: '', category: '', subcategory: '', status: '', acqFrom: '', acqTo: '', readyFrom: '', readyTo: '' });
                    router.replace('/assets');
                  }}
                >
                  <X size={13} /> {t('common.clearAll')}
                </button>
              )}
              <span className="relative">
                <Button size="sm" variant="ghost" icon={<Columns3 size={15} />} onClick={() => setColMenu((o) => !o)}>{t('assets.columns')}</Button>
                {colMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setColMenu(false)} />
                    <div className="absolute right-0 z-40 mt-1 max-h-80 w-56 overflow-y-auto rounded-md border border-line bg-white p-1.5 shadow-pop">
                      {ALL_COLS.map((c) => (
                        <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-ink-2 hover:bg-canvas">
                          <input type="checkbox" className="accent-brand-600" checked={show(c)} disabled={c === 'code'} onChange={() => setCols((p) => (p.includes(c) ? p.filter((x) => x !== c) : ALL_COLS.filter((x) => p.includes(x) || x === c)))} />
                          {colLabel[c]}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </span>
            </span>
          </div>
        </div>

        <Table className="scroll-thin">
          <thead>
            <tr>
              {ALL_COLS.filter(show).map((c) => (
                <Th key={c} right={['qty', 'cost', 'accum', 'nbv', 'residual', 'life'].includes(c)} sticky={c === 'code'}>{colLabel[c]}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((a) => {
              const v = vals.get(a.id)!;
              return (
                <tr key={a.id} className="cursor-pointer bg-white" onClick={() => setQuick(a)}>
                  {show('code') && <Td mono sticky className="whitespace-nowrap font-medium text-brand-700">{a.code}</Td>}
                  {show('name') && <Td className="min-w-[240px] max-w-[340px] text-ink"><div className="truncate">{lk.assetName(a)}</div></Td>}
                  {show('category') && <Td className="whitespace-nowrap">{lk.category(a.categoryId)}</Td>}
                  {show('subcategory') && <Td className="whitespace-nowrap">{lk.category(a.subcategoryId)}</Td>}
                  {show('company') && <Td className="whitespace-nowrap">{lk.companyCode(a.companyId)}</Td>}
                  {show('branch') && <Td className="whitespace-nowrap">{lk.branch(a.branchId)}</Td>}
                  {show('department') && <Td className="whitespace-nowrap">{lk.department(a.departmentId)}</Td>}
                  {show('costCenter') && <Td mono className="whitespace-nowrap">{state.costCenters.find((c) => c.id === a.costCenterId)?.code}</Td>}
                  {show('location') && <Td className="whitespace-nowrap">{a.locationId ? lk.locationObj(a.locationId)?.code : <span className="text-amber-700">—</span>}</Td>}
                  {show('serial') && <Td mono>{a.serialNumber || '—'}</Td>}
                  {show('qty') && <Td right className="whitespace-nowrap">{num(a.quantity)} <span className="text-ink-4">{lk.unit(a.unit)}</span></Td>}
                  {show('cost') && <Td right>{money(v.cost)}</Td>}
                  {show('acq') && <Td className="whitespace-nowrap">{date(a.acquisitionDate)}</Td>}
                  {show('ready') && <Td className="whitespace-nowrap">{date(a.readyDate)}</Td>}
                  {show('life') && <Td right>{a.lifeMonths / 12} {t('common.years')}</Td>}
                  {show('residual') && <Td right>{money(a.residual)}</Td>}
                  {show('accum') && <Td right>{money(v.accumulated)}</Td>}
                  {show('nbv') && <Td right className="font-medium text-ink">{money(v.nbv)}</Td>}
                  {show('status') && <Td><AssetStatusBadge status={a.status} /></Td>}
                  {show('photo') && <Td>{a.hasPhoto ? <Camera size={15} className="text-emerald-700" /> : <CameraOff size={15} className="text-amber-600" />}</Td>}
                  {show('oa') && <Td mono className="whitespace-nowrap">{a.source.oaNo ?? '—'}</Td>}
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-[#F9FAFB] font-semibold text-ink">
                {ALL_COLS.filter(show).map((c, i) => (
                  <td key={c} className={cx('border-t border-line px-3 py-2 text-[13px]', ['qty', 'cost', 'accum', 'nbv'].includes(c) && 'text-right tabular-nums', i === 0 && 'sticky left-0 bg-[#F9FAFB]')}>
                    {i === 0 ? t('assets.totals') : c === 'qty' ? num(totals.qty) : c === 'cost' ? money(totals.cost) : c === 'accum' ? money(totals.accum) : c === 'nbv' ? money(totals.nbv) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
        {rows.length === 0 && <Empty>{t('common.noData')}</Empty>}

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[12.5px] text-ink-3">
          <span>
            {t('common.showing')} {rows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, rows.length)} {t('common.of')} {num(rows.length)} · {t('common.asOf')} {period(CURRENT_PERIOD)}
          </span>
          <div className="flex items-center gap-2">
            <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 w-20">
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft size={15} />} />
            <span className="tabular-nums">{page} / {pages}</span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} icon={<ChevronRight size={15} />} />
          </div>
        </div>
      </Card>

      <QuickView asset={quick} onClose={() => setQuick(null)} />
      {createOpen && <AssetCreateModal open onClose={() => setCreateOpen(false)} onCreated={(id) => router.push(`/assets/${id}`)} />}
    </>
  );
}

function QuickView({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const { t, money, date } = useI18n();
  const lk = useLookups();
  const vals = useValuations();
  if (!asset) return null;
  const v = vals.get(asset.id)!;
  return (
    <Drawer
      open
      onClose={onClose}
      title={lk.assetName(asset)}
      sub={<span className="font-mono">{asset.code}</span>}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Link href={`/assets/${asset.id}`}><Button variant="primary">{t('assets.openDetail')}</Button></Link>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AssetStatusBadge status={asset.status} />
        {!asset.hasPhoto && <Badge tone="amber">{t('assets.missingPhoto')}</Badge>}
        {!asset.locationId && <Badge tone="amber">{t('assets.missingLocation')}</Badge>}
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          [t('field.cost'), v.cost],
          [t('field.accumDep'), v.accumulated],
          [t('field.nbv'), v.nbv],
        ].map(([l, n]) => (
          <div key={l as string} className="rounded-md border border-line px-3 py-2">
            <div className="text-[11.5px] text-ink-3">{l}</div>
            <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{money(n as number)}</div>
          </div>
        ))}
      </div>
      <DL
        items={[
          { label: t('field.category'), value: lk.category(asset.categoryId) },
          { label: t('field.subcategory'), value: lk.category(asset.subcategoryId) },
          { label: t('field.company'), value: lk.company(asset.companyId) },
          { label: t('field.branch'), value: lk.branch(asset.branchId) },
          { label: t('field.department'), value: lk.department(asset.departmentId) },
          { label: t('field.costCenter'), value: lk.costCenter(asset.costCenterId) },
          { label: t('field.location'), value: lk.location(asset.locationId) || t('common.notSet') },
          { label: t('field.quantity'), value: `${asset.quantity} ${lk.unit(asset.unit)}` },
          { label: t('field.acquisitionDate'), value: date(asset.acquisitionDate) },
          { label: t('field.readyDate'), value: date(asset.readyDate) },
          { label: t('field.usefulLife'), value: `${asset.lifeMonths / 12} ${t('common.years')} · ${t(`method.${asset.method}`)}` },
          { label: t('field.remaining'), value: `${v.remainingMonths} ${t('common.months')}` },
          { label: t('field.oaRef'), value: asset.source.oaNo ?? '—', mono: true },
          { label: t('field.serialNumber'), value: asset.serialNumber || '—', mono: true },
        ]}
      />
    </Drawer>
  );
}

export default function AssetRegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
