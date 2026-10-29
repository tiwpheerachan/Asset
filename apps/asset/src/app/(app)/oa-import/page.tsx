'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2, Copy, FileText, Landmark, RefreshCw, Sparkles, Split, XCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { intakeChecklist, nearDuplicates, type DupMatch, type SubcatOption } from '@/lib/asset-intake';
import type { OARecord, OAStatus } from '@/lib/types';
import { OAStatusBadge } from '@/components/badges';
import { SETTINGS } from '@/data/masters';
import { Badge, Button, Card, CardHeader, DL, Drawer, Empty, FormField, Input, Notice, PageHeader, Select, Table, Tabs, Td, Textarea, Th, Toggle, cx } from '@/components/ui';

const ORDER: OAStatus[] = ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR', 'DUPLICATE', 'CREATED', 'REJECTED'];

export default function OAImportPage() {
  const { t, money, date, dateTime } = useI18n();
  const { state, syncOA, syncOnebook, syncPeak, can, createFromOA } = useStore();
  const lk = useLookups();
  const [tab, setTab] = useState<'queue' | 'mapping'>('queue');
  const [status, setStatus] = useState<OAStatus | 'ALL' | 'PENDING'>('PENDING');
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkSub, setBulkSub] = useState('');
  const [impResult, setImpResult] = useState<{ source: string; added: number; total: number } | null>(null);
  const [impError, setImpError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncingOb, setSyncingOb] = useState(false);
  const [syncingPk, setSyncingPk] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of state.oa) m[o.status] = (m[o.status] ?? 0) + 1;
    return m;
  }, [state.oa]);
  const pendingN = ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].reduce((s, k) => s + (counts[k] ?? 0), 0);
  const rows = state.oa
    .filter((o) => (status === 'ALL' ? true : status === 'PENDING' ? ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].includes(o.status) : o.status === status))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.approvedDate.localeCompare(a.approvedDate));

  // #11 จัดการเป็นชุด: เลือกหลายรายการ ตั้งหมวดร่วมกัน แล้วสร้างทีเดียว (Serial เติมรายเครื่องภายหลัง)
  const canBulk = can('createAsset') && can('importOa');
  const bulkable = (o: OARecord) => ['NEW', 'REVIEWING', 'READY_TO_CREATE'].includes(o.status);
  const selRows = rows.filter((o) => sel.has(o.id) && bulkable(o));
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkCreate = () => {
    if (!bulkSub) return;
    for (const o of selRows) createFromOA(o.id, { split: o.quantity > 1, subcategoryId: bulkSub });
    setSel(new Set());
    setBulkSub('');
  };

  return (
    <>
      <PageHeader
        title={t('oa.title')}
        sub={t('oa.subtitle')}
        actions={
          <>
            <span className="text-[12.5px] text-ink-3">
              {t('oa.lastSync')}: {dateTime(state.oaIntegration.lastSyncAt)}
            </span>
            <Button
              icon={<BookOpen size={15} className={syncingOb ? 'animate-pulse' : ''} />}
              disabled={!can('importOa') || syncingOb}
              onClick={async () => {
                setSyncingOb(true); setImpError('');
                try {
                  const r = await syncOnebook();
                  setImpResult({ source: 'ONEBOOK', added: r.added, total: r.total });
                  setStatus('PENDING');
                } catch (e) {
                  setImpError(String((e as Error)?.message || e));
                } finally {
                  setSyncingOb(false);
                }
              }}
            >
              {syncingOb ? t('oa.syncing') : t('oa.fromAccounting')}
            </Button>
            <Button
              icon={<Landmark size={15} className={syncingPk ? 'animate-pulse' : ''} />}
              disabled={!can('importOa') || syncingPk}
              onClick={async () => {
                setSyncingPk(true); setImpError('');
                try {
                  const r = await syncPeak();
                  setImpResult({ source: 'PEAK', added: r.added, total: r.total });
                  setStatus('PENDING');
                } catch (e) {
                  setImpError(String((e as Error)?.message || e));
                } finally {
                  setSyncingPk(false);
                }
              }}
            >
              {syncingPk ? t('oa.syncing') : t('oa.fromPeak')}
            </Button>
            <Button
              variant="primary"
              icon={<RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />}
              disabled={!can('importOa') || syncing}
              onClick={async () => {
                setSyncing(true); setImpError('');
                try {
                  const r = await syncOA();
                  setImpResult({ source: 'OA', added: r.added, total: r.total });
                  setStatus('PENDING');
                } catch (e) {
                  setImpError(String((e as Error)?.message || e));
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? t('oa.syncing') : t('oa.syncNow')}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
        {['OA APPROVED', 'IMPORT / SYNC', 'ASSET CANDIDATE', 'CLASSIFY', 'CREATE ASSET (DRAFT)', 'REVIEW', 'ACTIVATE'].map((s, i, arr) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cx('rounded border px-2 py-0.5 font-mono text-[11px]', i < 4 ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-white')}>{s}</span>
            {i < arr.length - 1 && <ArrowRight size={12} className="text-ink-4" />}
          </span>
        ))}
      </div>

      {impError && <Notice tone="red" icon={<AlertCircle size={15} />} className="mb-3">{t('oa.importFailed')}: {impError}</Notice>}
      {impResult && (
        <Notice tone={impResult.added > 0 ? 'green' : 'gray'} icon={<RefreshCw size={15} />} className="mb-3">
          {t('oa.importDone', { src: impResult.source })} — {t('oa.importNew')}: <b>{impResult.added}</b> · {t('oa.importDup')}: <b>{impResult.total - impResult.added}</b> · {t('common.all')}: {impResult.total}
        </Notice>
      )}
      <Card>
        <div className="px-2">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'queue', label: t('oa.queue'), count: pendingN }, { id: 'mapping', label: t('oa.mapping') }]} />
        </div>
        {tab === 'queue' ? (
          <>
            <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5">
              {(['PENDING', 'ALL', ...ORDER] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cx('rounded-full border px-2.5 py-1 text-[12px] transition-colors', status === s ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-line bg-white text-ink-3 hover:text-ink')}
                >
                  {s === 'PENDING' ? t('oa.pending') : s === 'ALL' ? t('common.all') : t(`oaStatus.${s}`)}
                  <span className="ml-1 tabular-nums opacity-70">{s === 'PENDING' ? pendingN : s === 'ALL' ? state.oa.length : counts[s] ?? 0}</span>
                </button>
              ))}
            </div>
            {canBulk && selRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-brand-200 bg-brand-50/60 px-3 py-2.5">
                <span className="text-[13px] font-medium text-brand-800">{t('oa.selected', { n: selRows.length })}</span>
                <Select value={bulkSub} onChange={(e) => setBulkSub(e.target.value)} className="h-8 w-56">
                  <option value="">{t('oa.bulkPickCat')}</option>
                  {state.categories.filter((c) => !c.parentId).map((p) => (
                    <optgroup key={p.id} label={lk.category(p.id)}>
                      {state.categories.filter((c) => c.parentId === p.id).map((sc) => <option key={sc.id} value={sc.id}>{lk.category(sc.id)}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <Button size="sm" variant="primary" disabled={!bulkSub} onClick={bulkCreate}>{t('oa.bulkCreate')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t('common.cancel')}</Button>
              </div>
            )}
            <Table>
              <thead>
                <tr>
                  {canBulk && <Th />}
                  <Th>{t('field.oaNo')}</Th>
                  <Th>{t('field.approvedDate')}</Th>
                  <Th>{t('field.itemName')}</Th>
                  <Th>{t('field.department')}</Th>
                  <Th right>{t('field.quantity')}</Th>
                  <Th right>{t('field.amount')}</Th>
                  <Th>{t('field.supplier')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => setOpen(o.id)}>
                    {canBulk && (
                      <Td>
                        {bulkable(o) && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggleSel(o.id)} className="h-4 w-4 cursor-pointer accent-brand-600" aria-label={t('oa.select')} />
                          </span>
                        )}
                      </Td>
                    )}
                    <Td mono className="whitespace-nowrap font-medium text-brand-700">{o.oaNo}</Td>
                    <Td className="whitespace-nowrap">{date(o.approvedDate)}</Td>
                    <Td className="min-w-[240px] text-ink">
                      {o.itemName}
                      {o.quantity > 0 && o.amount / o.quantity < SETTINGS.capitalizationThreshold && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800" title={`ราคาต่อหน่วยต่ำกว่าเกณฑ์ทรัพย์สิน (${SETTINGS.capitalizationThreshold})`}>
                          <AlertCircle size={11} /> ต่ำกว่าเกณฑ์
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{lk.department(o.departmentId) || <span className="text-red-700">—</span>}</Td>
                    <Td right>{o.quantity} <span className="text-ink-4">{lk.unit(o.unit)}</span></Td>
                    <Td right>{money(o.amount)}</Td>
                    <Td className="whitespace-nowrap">{o.supplier}</Td>
                    <Td><OAStatusBadge status={o.status} /></Td>
                    <Td><Button size="sm">{t('oa.review')}</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {rows.length === 0 && <Empty>{t('common.noData')}</Empty>}
          </>
        ) : (
          <MappingTab />
        )}
      </Card>

      {open && <ReviewDrawer oa={state.oa.find((o) => o.id === open)!} onClose={() => setOpen(null)} />}
    </>
  );
}

function MappingTab() {
  const { t } = useI18n();
  const { state, updateOAIntegration, can } = useStore();
  const [m, setM] = useState(state.oaIntegration.mapping);
  const editable = can('manageUsers');
  const FA_FIELDS = ['source.oaNo', 'companyId', 'branchId', 'departmentId', 'costCenterId', 'nameTh', 'nameEn', 'description', 'quantity', 'unit', 'originalCost', 'source.supplier', 'source.invoiceNo', 'source.poNo', 'source.grNo', 'source.prNo', 'locationId', 'serialNumber', '— ignore —'];
  return (
    <div className="p-4">
      <p className="mb-3 text-[13px] text-ink-3">{t('oa.mappingHint')}</p>
      {!editable && <div className="mb-3"><Notice tone="gray">{t('settings.adminOnly')}</Notice></div>}
      <Table>
        <thead>
          <tr>
            <Th>{t('oa.oaField')}</Th>
            <Th />
            <Th>{t('oa.faField')}</Th>
          </tr>
        </thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={row.oa}>
              <Td mono className="text-ink">OA.{row.oa}</Td>
              <Td className="w-8 text-ink-4"><ArrowRight size={14} /></Td>
              <Td className="w-[320px]">
                <Select value={row.fa} disabled={!editable} onChange={(e) => setM((p) => p.map((x, j) => (j === i ? { ...x, fa: e.target.value } : x)))} className="h-8 font-mono text-[12.5px]">
                  {FA_FIELDS.map((f) => <option key={f} value={f}>Asset.{f}</option>)}
                </Select>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editable && (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={() => updateOAIntegration({ ...state.oaIntegration, mapping: m })}>{t('common.save')}</Button>
        </div>
      )}
    </div>
  );
}

function ReviewDrawer({ oa, onClose }: { oa: OARecord; onClose: () => void }) {
  const { t, money, date, L } = useI18n();
  const { state, setOAStatus, createFromOA, previewCodes, can } = useStore();
  const lk = useLookups();
  const router = useRouter();
  const [sub, setSub] = useState(oa.suggestedSubcategoryId ?? '');
  const [split, setSplit] = useState(oa.quantity > 1);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [fixCC, setFixCC] = useState('');
  const [aiSug, setAiSug] = useState<{ reason: string; source: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const editable = can('importOa');

  // ตัวเลือกหมวดย่อย (ใบ) สำหรับส่งให้ AI/heuristic เดาหมวด
  const subOpts = useMemo<SubcatOption[]>(
    () => state.categories.filter((c) => c.parentId).map((c) => {
      const p = state.categories.find((x) => x.id === c.parentId);
      return { id: c.id, path: `${p ? L(p.name) : ''} › ${L(c.name)}` };
    }),
    [state.categories, L],
  );

  // AI แนะนำหมวดเป็นค่าเริ่มต้น (ครั้งเดียวต่อรายการ) — พนักงานตรวจ/แก้ก่อนสร้าง
  useEffect(() => {
    if (sub || !editable || ['CREATED', 'REJECTED', 'DUPLICATE'].includes(oa.status) || subOpts.length === 0) return;
    let cancelled = false;
    setAiLoading(true);
    const acct = String(oa.rawFields?.onebookAccountCode ?? oa.rawFields?.peakAccountCode ?? oa.rawFields?.onebookAccountName ?? '');
    fetch('/api/assets/suggest-category', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: oa.itemName, description: oa.itemDescription, account: acct, subcategories: subOpts }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.subcategoryId) { setSub(d.subcategoryId); setAiSug({ reason: d.reason || '', source: d.source || '' }); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oa.id]);

  // หาทรัพย์สินที่ "ใกล้เคียง" เพื่อกันสร้างซ้ำ (เหมือน + คล้าย)
  const nearDup: DupMatch[] = useMemo(() => {
    if (['CREATED', 'REJECTED', 'DUPLICATE'].includes(oa.status)) return [];
    const cand = { itemName: oa.itemName, unitCost: oa.quantity > 0 ? oa.amount / oa.quantity : oa.amount, serials: oa.serialNumbers ?? [] };
    const pool = state.assets.filter((a) => a.oaId !== oa.id && !['ARCHIVED', 'DISPOSED'].includes(a.status));
    return nearDuplicates(cand, pool);
  }, [state.assets, oa]);

  const dup = useMemo(() => {
    const others = state.oa.filter((o) => o.id !== oa.id && !['REJECTED', 'DUPLICATE'].includes(o.status));
    const assetsOther = state.assets.filter((a) => a.oaId !== oa.id);
    return {
      oa: others.some((o) => o.oaNo === oa.oaNo) || assetsOther.some((a) => a.source.oaNo === oa.oaNo),
      invoice: !!oa.invoiceNo && (assetsOther.some((a) => a.source.invoiceNo === oa.invoiceNo) || others.some((o) => o.invoiceNo === oa.invoiceNo)),
      serial: (oa.serialNumbers ?? []).some((s) => assetsOther.some((a) => a.serialNumber.split(', ').includes(s))),
      ref: !!oa.duplicateOf || others.some((o) => o.poNo && o.poNo === oa.poNo && o.itemName === oa.itemName && o.amount === oa.amount),
    };
  }, [state.oa, state.assets, oa]);

  const n = split ? oa.quantity : 1;
  const subCat = state.categories.find((c) => c.id === sub);
  const parent = state.categories.find((c) => c.id === subCat?.parentId);
  const codeCatId = subCat?.parentId ?? sub;
  const codes = useMemo(
    () => previewCodes(oa.companyId, codeCatId, n),
    [previewCodes, oa.companyId, codeCatId, n, state.running],
  );
  // เกณฑ์เข้าทรัพย์สิน (capitalization) — ราคาต่อหน่วยต่ำกว่าเกณฑ์ ควรลงเป็นค่าใช้จ่าย
  const unitCost = oa.quantity > 0 ? oa.amount / oa.quantity : oa.amount;
  const belowThreshold = unitCost < SETTINGS.capitalizationThreshold;
  const policy = state.policies.find((p) => p.categoryId === parent?.id && p.active);
  const created = state.assets.filter((a) => oa.createdAssetIds.includes(a.id));

  // เช็กความครบถ้วนของข้อมูลก่อนสร้าง
  const checklist = useMemo(() => intakeChecklist({
    subId: sub, hasPolicy: !!policy || !!subCat, amount: oa.amount, supplier: oa.supplier,
    approvedDate: oa.approvedDate, documents: oa.documents.length, costCenterId: oa.costCenterId,
    departmentId: oa.departmentId, serials: (oa.serialNumbers ?? []).length,
  }), [sub, policy, subCat, oa]);
  const chkReqMissing = checklist.filter((c) => c.required && !c.ok);

  const check = (label: string, found: boolean) => (
    <div className="flex items-center justify-between rounded border border-line px-3 py-2 text-[13px]">
      <span className="text-ink-2">{label}</span>
      {found ? (
        <span className="inline-flex items-center gap-1 font-medium text-violet-700"><Copy size={13} /> {t('oa.found')}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> {t('oa.passed')}</span>
      )}
    </div>
  );

  let footer: React.ReactNode = <Button onClick={onClose}>{t('common.close')}</Button>;
  if (editable && !rejecting) {
    if (oa.status === 'NEW')
      footer = (<>{footer}<Button variant="primary" onClick={() => setOAStatus(oa.id, 'REVIEWING')}>{t('oa.startReview')}</Button></>);
    if (oa.status === 'REVIEWING')
      footer = (
        <>
          {footer}
          <Button variant="danger" onClick={() => setRejecting(true)}>{t('oa.reject')}</Button>
          <Button
            disabled={!sub}
            title="ข้ามขั้น ‘พร้อมสร้าง’ แล้วสร้างทรัพย์สินทันที"
            onClick={() => {
              const ids = createFromOA(oa.id, { split, subcategoryId: sub });
              onClose();
              if (ids.length === 1) router.push(`/assets/${ids[0]}`);
            }}
          >
            {t('oa.createAssets')} ({n})
          </Button>
          <Button variant="primary" disabled={!sub} onClick={() => setOAStatus(oa.id, 'READY_TO_CREATE', { suggestedSubcategoryId: sub })}>{t('oa.markReady')}</Button>
        </>
      );
    if (oa.status === 'READY_TO_CREATE')
      footer = (
        <>
          {footer}
          <Button variant="danger" onClick={() => setRejecting(true)}>{t('oa.reject')}</Button>
          <Button
            variant="primary"
            disabled={!sub}
            onClick={() => {
              const ids = createFromOA(oa.id, { split, subcategoryId: sub });
              onClose();
              if (ids.length === 1) router.push(`/assets/${ids[0]}`);
            }}
          >
            {t('oa.createAssets')} ({n})
          </Button>
        </>
      );
    if (oa.status === 'DUPLICATE')
      footer = (<>{footer}<Button variant="danger" onClick={() => setRejecting(true)}>{t('oa.reject')}</Button></>);
    if (oa.status === 'ERROR')
      footer = (<>{footer}<Button variant="primary" disabled={!fixCC} onClick={() => { const cc = state.costCenters.find((c) => c.id === fixCC)!; setOAStatus(oa.id, 'REVIEWING', { costCenterId: cc.id, departmentId: cc.departmentId, error: undefined }, 'Cost center completed manually'); }}>{t('oa.startReview')}</Button></>);
  }
  if (rejecting)
    footer = (<><Button onClick={() => setRejecting(false)}>{t('common.cancel')}</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => { setOAStatus(oa.id, 'REJECTED', { rejectReason: reason }, reason); setRejecting(false); }}>{t('common.confirm')}</Button></>);

  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={<span className="flex items-center gap-2"><span className="font-mono">{oa.oaNo}</span><OAStatusBadge status={oa.status} /></span>} sub={oa.itemName} footer={footer}>
      <div className="space-y-6">
        {oa.status === 'ERROR' && (
          <Notice tone="red" icon={<AlertCircle size={15} />}>
            <b>{t('oa.errorTitle')}:</b> {t(`issue.${oa.error}`)}
            {editable && (
              <div className="mt-2 max-w-xs">
                <Select value={fixCC} onChange={(e) => setFixCC(e.target.value)} className="h-8">
                  <option value="">{t('field.costCenter')}…</option>
                  {state.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {L(c.name)}</option>)}
                </Select>
              </div>
            )}
          </Notice>
        )}
        {oa.status === 'DUPLICATE' && <Notice tone="amber" icon={<Copy size={15} />}>{t('oa.duplicateOf')}: <b className="font-mono">{oa.duplicateOf}</b></Notice>}
        {oa.status === 'REJECTED' && <Notice tone="gray" icon={<XCircle size={15} />}>{t('oa.rejectReason')}: {oa.rejectReason}</Notice>}
        {rejecting && (
          <FormField label={t('oa.rejectReason')} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} />
          </FormField>
        )}

        <section>
          <h3 className="mb-2.5 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('oa.sourceData')}</h3>
          <DL
            cols={3}
            items={[
              { label: t('field.oaNo'), value: oa.oaNo, mono: true },
              { label: t('field.approvedDate'), value: date(oa.approvedDate) },
              { label: t('field.requester'), value: oa.requester },
              { label: t('field.company'), value: lk.company(oa.companyId) },
              { label: t('field.branch'), value: lk.branch(oa.branchId) },
              { label: t('field.department'), value: lk.department(oa.departmentId) || '—' },
              { label: t('field.costCenter'), value: lk.costCenter(oa.costCenterId) || <span className="text-red-700">—</span> },
              { label: t('field.location'), value: lk.location(oa.locationId) || '—' },
              { label: t('field.supplier'), value: oa.supplier },
              { label: t('field.itemName'), value: oa.itemName },
              { label: t('field.itemDescription'), value: oa.itemDescription },
              { label: t('field.quantity'), value: `${oa.quantity} ${lk.unit(oa.unit)}` },
              { label: t('field.amount'), value: `${money(oa.amount)} ${t('common.thb')}` },
              { label: t('field.poNo'), value: oa.poNo ?? '—', mono: true },
              { label: t('field.grNo'), value: oa.grNo ?? '—', mono: true },
              { label: t('field.invoiceNo'), value: oa.invoiceNo ?? '—', mono: true },
              { label: t('field.invoiceDate'), value: date(oa.invoiceDate) },
              { label: t('field.approvalRef'), value: oa.approvalRef, mono: true },
            ]}
          />
          {oa.serialNumbers?.length ? <p className="mt-3 font-mono text-[12px] text-ink-3">{t('field.serialNumber')}: {oa.serialNumbers.join(', ')}</p> : null}
          {oa.documents.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {oa.documents.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded border border-line bg-canvas px-2 py-1 text-[12px] text-ink-2"><FileText size={12} /> {d}</span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2.5 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('oa.dupCheck')}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {check(t('oa.dupOa'), dup.oa)}
            {check(t('oa.dupInvoice'), dup.invoice)}
            {check(t('oa.dupSerial'), dup.serial)}
            {check(t('oa.dupRef'), dup.ref)}
          </div>
        </section>

        {oa.status === 'CREATED' ? (
          <section>
            <h3 className="mb-2.5 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('oa.createdAssets')}</h3>
            <ul className="space-y-1.5">
              {created.map((a) => (
                <li key={a.id}>
                  <Link href={`/assets/${a.id}`} className="flex items-center justify-between rounded border border-line px-3 py-2 text-[13px] hover:bg-canvas">
                    <span><span className="font-mono font-medium text-brand-700">{a.code}</span> · {lk.assetName(a)}</span>
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          !['REJECTED', 'DUPLICATE'].includes(oa.status) && (
            <section>
              <h3 className="mb-2.5 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('oa.target')}</h3>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <FormField label={t('oa.suggested')} required>
                  <>
                    <Select value={sub} disabled={!editable || oa.status === 'NEW'} onChange={(e) => { setSub(e.target.value); setAiSug(null); }}>
                      <option value="">—</option>
                      {state.categories.filter((c) => !c.parentId).map((p) => (
                        <optgroup key={p.id} label={L(p.name)}>
                          {state.categories.filter((c) => c.parentId === p.id).map((s) => <option key={s.id} value={s.id}>{L(s.name)}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                    {aiLoading && (
                      <div className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-4"><Sparkles size={12} className="animate-pulse" /> {t('oa.aiThinking')}</div>
                    )}
                    {!aiLoading && aiSug && sub && (
                      <div className="mt-1 flex items-start gap-1 text-[11.5px] text-violet-700">
                        <Sparkles size={12} className="mt-0.5 shrink-0" />
                        <span>{t(aiSug.source === 'ai' ? 'oa.aiSuggested' : 'oa.aiSuggestedKw')}{aiSug.reason ? ` · ${aiSug.reason}` : ''} · {t('oa.aiVerify')}</span>
                      </div>
                    )}
                  </>
                </FormField>
                <FormField label={t('field.policy')}>
                  <Input disabled value={subCat ? `เส้นตรง ${subCat.defaultLifeYears} ปี` : policy ? L(policy.name) : '—'} />
                </FormField>
                <FormField label={t('field.assetAccount')}>
                  <Input disabled value={lk.account(parent?.assetAccount)} className="font-mono text-[12.5px]" />
                </FormField>
                <FormField label={t('oa.perUnit')}>
                  <Input disabled value={money(oa.amount / oa.quantity)} className={cx('text-right tabular-nums', belowThreshold && 'text-amber-700')} />
                </FormField>
              </div>

              {/* แจ้งเตือนอัจฉริยะ: เกณฑ์เข้าทรัพย์สิน + อายุค่าเสื่อม */}
              {belowThreshold && (
                <Notice tone="amber" icon={<AlertCircle size={15} />} className="mt-3">
                  ราคาต่อหน่วย {money(unitCost)} <b>ต่ำกว่าเกณฑ์เข้าทรัพย์สิน ({money(SETTINGS.capitalizationThreshold)})</b> — ตามปกติควรลงเป็น<b>ค่าใช้จ่าย</b> ไม่ใช่ทรัพย์สินถาวร (พิจารณาก่อนสร้าง)
                </Notice>
              )}
              {subCat && (
                <Notice tone="gray" icon={<FileText size={15} />} className="mt-2">
                  จะตั้งค่าเสื่อม <b>{subCat.defaultLifeYears} ปี</b> (เส้นตรง) ตามหมวด “{L(subCat.name)}” — ปรับอายุ/ดูอ้างอิงกฎหมายได้ที่เมนู <b>หมวดหมู่</b>
                </Notice>
              )}

              {/* กันสร้างซ้ำ: ทรัพย์สินที่ใกล้เคียง (เหมือน/คล้าย) */}
              {nearDup.length > 0 && (
                <Notice tone="amber" icon={<Copy size={15} />} className="mt-2">
                  <b>{t('oa.nearDupTitle')} ({nearDup.length})</b> — {t('oa.nearDupHint')}
                  <ul className="mt-1.5 space-y-1">
                    {nearDup.map((m) => (
                      <li key={m.id}>
                        <Link href={`/assets/${m.id}`} className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-white/60 px-2.5 py-1.5 hover:bg-white">
                          <span className="min-w-0 truncate"><span className="font-mono text-brand-700">{m.code}</span> · {m.name}</span>
                          <Badge tone={m.reason === 'serial' ? 'red' : 'amber'}>{t(`oa.dupReason.${m.reason}`)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}

              {/* เช็กความครบถ้วนของข้อมูล */}
              {chkReqMissing.length > 0 && (
                <Notice tone="amber" icon={<AlertCircle size={15} />} className="mt-2">
                  <b>{t('oa.chkMissing')}:</b> {chkReqMissing.map((c) => t(`oa.chk.${c.key}`)).join(' · ')}
                </Notice>
              )}
              <div className="mt-3 rounded-md border border-line p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  <CheckCircle2 size={14} className="text-emerald-600" /> {t('oa.completeness')} {checklist.filter((c) => c.ok).length}/{checklist.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {checklist.map((c) => (
                    <span key={c.key} className={cx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px]',
                      c.ok ? 'bg-emerald-50 text-emerald-700' : c.required ? 'bg-amber-50 text-amber-700' : 'bg-canvas text-ink-4')}>
                      {c.ok ? <Check size={11} /> : <XCircle size={11} />}{t(`oa.chk.${c.key}`)}{c.required && !c.ok ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>

              {oa.quantity > 1 && (
                <div className="mt-4 rounded-md border border-line p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><Split size={15} className="text-brand-600" /> {t('oa.split')}</div>
                    <Toggle checked={split} onChange={setSplit} disabled={!editable || !['REVIEWING', 'READY_TO_CREATE'].includes(oa.status)} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-3">{t('oa.splitHint')}</p>
                  <p className="mt-2 text-[13px] text-ink-2">{split ? t('oa.splitOn', { n: oa.quantity }) : t('oa.splitOff', { n: oa.quantity })}</p>
                </div>
              )}
              <div className="mt-4">
                <div className="mb-1.5 text-[12.5px] text-ink-3">{t('oa.willCreate', { n })}</div>
                <div className="flex flex-wrap gap-1.5">
                  {codes.map((c, i) => (
                    <Badge key={c} tone="blue">
                      <span className="font-mono">{c}</span>
                      {split && oa.serialNumbers?.[i] && <span className="opacity-70"> · {oa.serialNumbers[i]}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            </section>
          )
        )}
      </div>
    </Drawer>
  );
}
