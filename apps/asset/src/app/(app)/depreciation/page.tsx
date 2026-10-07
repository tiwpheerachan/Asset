'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Calculator, CheckCheck, Download, Info, Lock, Pencil, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { addMonths, depIssues, isDepreciable, prorationFor, valuate } from '@/lib/depreciation';
import { exportXlsx } from '@/lib/excel';
import type { DepPolicy, RunStatus } from '@/lib/types';
import { RunStatusBadge } from '@/components/badges';
import { PostDepreciationButton } from '@/components/post-depreciation-button';
import { Badge, Button, Card, CardHeader, Drawer, FormField, Input, Notice, PageHeader, Select, Table, Tabs, Td, Textarea, Th, Toggle, cx } from '@/components/ui';

type Tab = 'runs' | 'preview' | 'policies';

function usePeriodCalc(period: string) {
  const { state } = useStore();
  return useMemo(() => {
    const rows = state.assets
      .filter((a) => ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DISPOSAL_PENDING'].includes(a.status))
      .map((a) => {
        const issues = depIssues(a, state.policies);
        const v = valuate(a, period, prorationFor(a, state.policies));
        return { a, v, issues };
      });
    const ok = rows.filter((r) => !r.issues.length && isDepreciable(r.a));
    return {
      rows,
      count: ok.filter((r) => r.v.periodDep > 0).length,
      amount: ok.reduce((s, r) => s + r.v.periodDep, 0),
      accum: rows.reduce((s, r) => s + r.v.accumulated, 0),
      nbv: rows.reduce((s, r) => s + r.v.nbv, 0),
      errors: rows.filter((r) => r.issues.length).length,
      missingPolicy: rows.filter((r) => r.issues.includes('MISSING_POLICY')).length,
      invalidReady: rows.filter((r) => r.issues.includes('INVALID_READY_DATE') || r.issues.includes('READY_BEFORE_ACQ')).length,
    };
  }, [state.assets, state.policies, period]);
}

export default function DepreciationPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('runs');
  const [previewPeriod, setPreviewPeriod] = useState(CURRENT_PERIOD);
  return (
    <>
      <PageHeader title={t('dep.title')} sub={t('dep.subtitle')} />
      <Card>
        <div className="px-2">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'runs', label: t('dep.runs') }, { id: 'preview', label: t('dep.preview') }, { id: 'policies', label: t('dep.policies') }]} />
        </div>
        {tab === 'runs' && <RunsTab onPreview={(p) => { setPreviewPeriod(p); setTab('preview'); }} />}
        {tab === 'preview' && <PreviewTab period={previewPeriod} setPeriod={setPreviewPeriod} />}
        {tab === 'policies' && <PoliciesTab />}
      </Card>
    </>
  );
}

function RunsTab({ onPreview }: { onPreview: (p: string) => void }) {
  const { t, money, num, period, dateTime } = useI18n();
  const { state, can, setRunStatus, createRun } = useStore();
  const runs = [...state.runs].sort((a, b) => b.period.localeCompare(a.period));
  const latest = runs[0];
  const nextPeriod = latest ? addMonths(latest.period, 1) : CURRENT_PERIOD;
  const calc = usePeriodCalc(latest?.period ?? CURRENT_PERIOD);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          {(['DRAFT', 'CALCULATED', 'REVIEWED', 'LOCKED', 'POSTED'] as RunStatus[]).map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <RunStatusBadge status={s} />
              {i < arr.length - 1 && <ArrowRight size={12} className="text-ink-4" />}
            </span>
          ))}
          <span className="ml-2 text-ink-3">· {t('dep.glNote')}</span>
        </div>
        {can('runDep') && (
          <Button icon={<Plus size={15} />} disabled={latest && latest.status !== 'LOCKED' && latest.status !== 'POSTED'} onClick={() => createRun(nextPeriod)}>
            {t('dep.newRun')} · {period(nextPeriod)}
          </Button>
        )}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>{t('common.period')}</Th>
            <Th>{t('common.status')}</Th>
            <Th right>{t('dep.assetsCalculated')}</Th>
            <Th right>{t('dep.depThisPeriod')}</Th>
            <Th>{t('field.createdBy')}</Th>
            <Th>{t('runStatus.REVIEWED')}</Th>
            <Th>{t('runStatus.LOCKED')}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <RunRow key={r.id} runPeriod={r.period}>
              {(c) => (
                <tr>
                  <Td className="whitespace-nowrap font-medium text-ink">{period(r.period)}</Td>
                  <Td><RunStatusBadge status={r.status} /></Td>
                  <Td right>{r.status === 'DRAFT' ? '—' : num((r.status === 'LOCKED' || r.status === 'POSTED') && r.amount ? r.assetCount : c.count)}</Td>
                  <Td right className="font-medium text-ink">{r.status === 'DRAFT' ? '—' : money((r.status === 'LOCKED' || r.status === 'POSTED') && r.amount ? r.amount : c.amount)}</Td>
                  <Td className="whitespace-nowrap">{r.createdBy}<div className="text-[11.5px] text-ink-4">{dateTime(r.createdAt)}</div></Td>
                  <Td className="whitespace-nowrap">{r.reviewedBy ?? '—'}{r.reviewedAt && <div className="text-[11.5px] text-ink-4">{dateTime(r.reviewedAt)}</div>}</Td>
                  <Td className="whitespace-nowrap">{r.lockedBy ?? '—'}{r.lockedAt && <div className="text-[11.5px] text-ink-4">{dateTime(r.lockedAt)}</div>}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => onPreview(r.period)}>{t('dep.preview')}</Button>
                      {r.status === 'DRAFT' && can('runDep') && <Button size="sm" variant="primary" icon={<Calculator size={14} />} onClick={() => setRunStatus(r.period, 'CALCULATED', { assetCount: c.count, amount: c.amount })}>{t('dep.calculate')}</Button>}
                      {r.status === 'CALCULATED' && can('runDep') && <Button size="sm" icon={<Calculator size={14} />} onClick={() => setRunStatus(r.period, 'CALCULATED', { assetCount: c.count, amount: c.amount })}>{t('dep.calculate')}</Button>}
                      {r.status === 'CALCULATED' && can('approveAsset') && <Button size="sm" variant="primary" icon={<CheckCheck size={14} />} disabled={c.errors > 0} onClick={() => setRunStatus(r.period, 'REVIEWED')}>{t('dep.review')}</Button>}
                      {r.status === 'REVIEWED' && can('lockDep') && <Button size="sm" variant="success" icon={<Lock size={14} />} onClick={() => setRunStatus(r.period, 'LOCKED', { assetCount: c.count, amount: c.amount })}>{t('dep.lock')}</Button>}
                    </div>
                  </Td>
                </tr>
              )}
            </RunRow>
          ))}
        </tbody>
      </Table>
      {latest && latest.status !== 'LOCKED' && calc.errors > 0 && (
        <div className="mt-3"><Notice tone="amber" icon={<AlertTriangle size={14} />}>{t('dep.errors')}: {calc.errors} — {period(latest.period)}</Notice></div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3"><Lock size={12} /> {t('dep.lockedNote')}</p>
    </div>
  );
}

function RunRow({ runPeriod, children }: { runPeriod: string; children: (c: ReturnType<typeof usePeriodCalc>) => React.ReactNode }) {
  const c = usePeriodCalc(runPeriod);
  return <>{children(c)}</>;
}

function PreviewTab({ period: p, setPeriod }: { period: string; setPeriod: (p: string) => void }) {
  const { t, money, num, period } = useI18n();
  const { state, can } = useStore();
  const lk = useLookups();
  const c = usePeriodCalc(p);
  const [onlyErr, setOnlyErr] = useState(false);
  const periods = Array.from({ length: 15 }, (_, i) => addMonths(CURRENT_PERIOD, 3 - i));
  const rows = (onlyErr ? c.rows.filter((r) => r.issues.length) : c.rows).sort((a, b) => b.issues.length - a.issues.length || b.v.periodDep - a.v.periodDep);
  const byCat = useMemo(() => {
    const m = new Map<string, { n: number; dep: number; accum: number; nbv: number }>();
    for (const r of c.rows) {
      const g = m.get(r.a.subcategoryId) ?? { n: 0, dep: 0, accum: 0, nbv: 0 };
      g.n++; g.dep += r.v.periodDep; g.accum += r.v.accumulated; g.nbv += r.v.nbv;
      m.set(r.a.subcategoryId, g);
    }
    return [...m.entries()].sort((a, b) => b[1].dep - a[1].dep);
  }, [c.rows]);
  const run = state.runs.find((r) => r.period === p);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={p} onChange={(e) => setPeriod(e.target.value)} className="w-44">
          {periods.map((x) => <option key={x} value={x}>{period(x)}</option>)}
        </Select>
        {run ? <RunStatusBadge status={run.status} /> : <Badge>—</Badge>}
        <Button
          className="ml-auto"
          icon={<Download size={15} />}
          disabled={!can('exportReport')}
          onClick={() =>
            exportXlsx(`Depreciation_Preview_${p}`, [
              { name: p, rows: c.rows.map((r) => ({ [t('field.assetCode')]: r.a.code, [t('field.assetName')]: lk.assetName(r.a), [t('field.subcategory')]: lk.category(r.a.subcategoryId), [t('field.cost')]: r.v.cost, [t('field.periodDep')]: r.v.periodDep, [t('field.accumDep')]: r.v.accumulated, [t('field.nbv')]: r.v.nbv, Issues: r.issues.map((i) => t(`issue.${i}`)).join('; ') })) },
            ])
          }
        >
          {t('common.exportExcel')}
        </Button>
        <PostDepreciationButton period={p} rows={c.rows} disabled={!can('runDep') || run?.status !== 'LOCKED'} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {[
          [t('dep.assetsCalculated'), num(c.count)],
          [t('dep.depThisPeriod'), money(c.amount)],
          [t('field.accumDep'), money(c.accum, 0)],
          [t('field.nbv'), money(c.nbv, 0)],
          [t('dep.errors'), num(c.errors), c.errors > 0],
          [t('issue.MISSING_POLICY'), num(c.missingPolicy), c.missingPolicy > 0],
          [t('issue.INVALID_READY_DATE'), num(c.invalidReady), c.invalidReady > 0],
        ].map(([l, v, warn]) => (
          <div key={l as string} className={cx('rounded-md border px-3 py-2.5', warn ? 'border-amber-200 bg-amber-50/50' : 'border-line')}>
            <div className="text-[11.5px] leading-tight text-ink-3">{l}</div>
            <div className={cx('mt-1 text-[16px] font-semibold tabular-nums', warn ? 'text-amber-800' : 'text-ink')}>{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <div className="rounded-md border border-line">
          <div className="border-b border-line px-3 py-2 text-[13px] font-semibold text-ink">{t('dep.byCategory')}</div>
          <Table>
            <thead><tr><Th>{t('field.subcategory')}</Th><Th right>{t('common.count')}</Th><Th right>{t('field.periodDep')}</Th><Th right>{t('field.nbv')}</Th></tr></thead>
            <tbody>
              {byCat.map(([k, g]) => (
                <tr key={k}><Td>{lk.category(k)}</Td><Td right>{g.n}</Td><Td right>{money(g.dep)}</Td><Td right>{money(g.nbv, 0)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="rounded-md border border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold text-ink">{t('dep.drill')}</span>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-3"><Toggle checked={onlyErr} onChange={setOnlyErr} /> {t('dep.onlyErrors')}</label>
          </div>
          <Table className="max-h-[460px] overflow-y-auto">
            <thead><tr><Th>{t('field.assetCode')}</Th><Th>{t('field.assetName')}</Th><Th right>{t('field.periodDep')}</Th><Th right>{t('field.accumDep')}</Th><Th right>{t('field.nbv')}</Th><Th /></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((r) => (
                <tr key={r.a.id}>
                  <Td mono><Link href={`/assets/${r.a.id}`} className="text-brand-700 hover:underline">{r.a.code}</Link></Td>
                  <Td className="max-w-[260px] truncate">{lk.assetName(r.a)}</Td>
                  <Td right>{money(r.v.periodDep)}</Td>
                  <Td right>{money(r.v.accumulated)}</Td>
                  <Td right className="text-ink">{money(r.v.nbv)}</Td>
                  <Td>{r.issues.length ? <Badge tone="red">{r.issues.map((i) => t(`issue.${i}`)).join(', ')}</Badge> : r.v.fullyDepreciated ? <Badge>{t('field.endDate')}</Badge> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function PoliciesTab() {
  const { t, L, date, money } = useI18n();
  const { state, can, upsertMaster } = useStore();
  const lk = useLookups();
  const [edit, setEdit] = useState<DepPolicy | null>(null);
  const [reason, setReason] = useState('');
  const editable = can('approveAsset');
  const roots = state.categories.filter((c) => !c.parentId);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Notice tone="gray" icon={<Info size={14} />}>{t('role.MANAGER_desc')}</Notice>
        {editable && (
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => setEdit({ id: `P-${Date.now().toString(36)}`, name: { th: '', en: '', zh: '' }, categoryId: roots[0].id, method: 'SL', lifeYears: 5, residual: 1, startRule: 'READY_DATE', proration: 'FULL_MONTH', rounding: 2, effectiveDate: '2026-10-01', active: true })}
          >
            {t('dep.newPolicy')}
          </Button>
        )}
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{t('dep.policyName')}</Th>
            <Th>{t('field.category')}</Th>
            <Th>{t('field.method')}</Th>
            <Th right>{t('field.usefulLife')}</Th>
            <Th right>{t('field.residual')}</Th>
            <Th>{t('field.startRule')}</Th>
            <Th>{t('field.proration')}</Th>
            <Th>{t('field.effectiveDate')}</Th>
            <Th>{t('common.status')}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {state.policies.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-ink">{L(p.name)}</Td>
              <Td>{lk.category(p.categoryId)}</Td>
              <Td>{t(`method.${p.method}`)}</Td>
              <Td right>{p.lifeYears} {t('common.years')}</Td>
              <Td right>{money(p.residual)}</Td>
              <Td>{t(`startRule.${p.startRule}`)}</Td>
              <Td>{t(`proration.${p.proration}`)}</Td>
              <Td className="whitespace-nowrap">{date(p.effectiveDate)}</Td>
              <Td>{p.active ? <Badge tone="green" dot>{t('common.active')}</Badge> : <Badge dot>{t('common.inactive')}</Badge>}</Td>
              <Td>{editable && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(p)} />}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {edit && (
        <Drawer
          open
          onClose={() => setEdit(null)}
          title={L(edit.name) || t('dep.newPolicy')}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={!edit.name.th || !reason.trim()} onClick={() => { upsertMaster('policies', edit, reason); setEdit(null); setReason(''); }}>{t('common.save')}</Button>
            </>
          }
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <FormField label={`${t('dep.policyName')} (TH)`} required><Input value={edit.name.th} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, th: e.target.value } })} /></FormField>
            <FormField label={`${t('dep.policyName')} (EN)`}><Input value={edit.name.en} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, en: e.target.value } })} /></FormField>
            <FormField label={`${t('dep.policyName')} (中文)`}><Input value={edit.name.zh} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, zh: e.target.value } })} /></FormField>
            <FormField label={t('field.category')}>
              <Select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>
                {roots.map((r) => <option key={r.id} value={r.id}>{L(r.name)}</option>)}
              </Select>
            </FormField>
            <FormField label={t('field.method')}>
              <Select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value as DepPolicy['method'] })}>
                <option value="SL">{t('method.SL')}</option>
                <option value="DB" disabled>{t('method.DB')} (Phase 2)</option>
                <option value="UOP" disabled>{t('method.UOP')} (Phase 2)</option>
              </Select>
            </FormField>
            <FormField label={`${t('field.usefulLife')} (${t('common.years')})`}><Input type="number" min={1} value={edit.lifeYears} onChange={(e) => setEdit({ ...edit, lifeYears: Number(e.target.value) })} /></FormField>
            <FormField label={`${t('field.residual')} (${t('common.thb')})`}><Input type="number" min={0} value={edit.residual} onChange={(e) => setEdit({ ...edit, residual: Number(e.target.value) })} /></FormField>
            <FormField label={t('field.startRule')}>
              <Select value={edit.startRule} onChange={(e) => setEdit({ ...edit, startRule: e.target.value as DepPolicy['startRule'] })}>
                <option value="READY_DATE">{t('startRule.READY_DATE')}</option>
                <option value="ACQUISITION_DATE">{t('startRule.ACQUISITION_DATE')}</option>
              </Select>
            </FormField>
            <FormField label={t('field.proration')}>
              <Select value={edit.proration} onChange={(e) => setEdit({ ...edit, proration: e.target.value as DepPolicy['proration'] })}>
                {(['FULL_MONTH', 'ACTUAL_DAYS', 'NEXT_MONTH'] as const).map((x) => <option key={x} value={x}>{t(`proration.${x}`)}</option>)}
              </Select>
            </FormField>
            <FormField label={t('field.rounding')}><Input type="number" min={0} max={4} value={edit.rounding} onChange={(e) => setEdit({ ...edit, rounding: Number(e.target.value) })} /></FormField>
            <FormField label={t('field.effectiveDate')}><Input type="date" value={edit.effectiveDate} onChange={(e) => setEdit({ ...edit, effectiveDate: e.target.value })} /></FormField>
            <FormField label={t('common.status')}><div className="flex h-9 items-center"><Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} /></div></FormField>
            <div className="sm:col-span-2">
              <FormField label={t('common.reason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} /></FormField>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
