'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Archive, ArrowLeft, Building2, CheckCircle2, Clock, Download, FileEdit, FileText, ImageIcon, Lock, MapPin, Pencil, Printer, RotateCcw, Send, Split, Undo2, Upload, UserCheck, UserRound,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { useLookups, useValuations } from '@/lib/hooks';
import { buildSchedule, depIssues, prorationFor, totalCost } from '@/lib/depreciation';
import { exportXlsx } from '@/lib/excel';
import type { Asset, AssetStatus, DocType } from '@/lib/types';
import { AssetStatusBadge } from '@/components/badges';
import { Badge, Button, Card, CardHeader, DL, Drawer, Empty, FormField, Input, Modal, Notice, PageHeader, Select, Table, Tabs, Td, Textarea, Th, cx } from '@/components/ui';

type Tab = 'overview' | 'accounting' | 'depreciation' | 'location' | 'documents' | 'history';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { state } = useStore();
  const asset = state.assets.find((a) => a.id === id || a.code === id);
  if (!asset) {
    return (
      <Card>
        <Empty>
          {t('common.noData')} —{' '}
          <Link href="/assets" className="text-brand-600 underline">
            {t('nav.assets')}
          </Link>
        </Empty>
      </Card>
    );
  }
  return <Detail asset={asset} />;
}

function Detail({ asset }: { asset: Asset }) {
  const { t, money, period, dateTime } = useI18n();
  const { state, can, setAssetStatus } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const v = vals.get(asset.id)!;
  const [tab, setTab] = useState<Tab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<{ to: AssetStatus; label: string } | null>(null);
  const docs = state.documents.filter((d) => d.assetId === asset.id);
  const history = state.audit.filter((a) => a.assetCode === asset.code);
  const issues = depIssues({ ...asset, status: 'ACTIVE' }, state.policies);

  // ใครต้องอนุมัติ + ใครส่งตรวจ (ใช้กับแถบแจ้งเตือน “รอผู้จัดการอนุมัติ”)
  const managers = state.users.filter((u) => u.role === 'MANAGER' && u.active);
  const submitLog = history.find((h) => h.action === 'STATUS_CHANGE' && h.newValue === 'PENDING_REVIEW');
  const iAmApprover = can('approveAsset');

  const canEdit =
    (['DRAFT', 'PENDING_REVIEW'].includes(asset.status) && can('editDraft')) ||
    (['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'].includes(asset.status) && (can('editDraft') || can('approveAsset')));

  const actions: ReactNode[] = [];
  if (asset.status === 'DRAFT' && can('editDraft'))
    actions.push(<Button key="sub" variant="primary" icon={<Send size={15} />} disabled={issues.length > 0} title={issues.map((i) => t(`issue.${i}`)).join(', ')} onClick={() => setStatusModal({ to: 'PENDING_REVIEW', label: t('detail.submitReview') })}>{t('detail.submitReview')}</Button>);
  if (asset.status === 'PENDING_REVIEW' && can('approveAsset')) {
    actions.push(<Button key="back" icon={<Undo2 size={15} />} onClick={() => setStatusModal({ to: 'DRAFT', label: t('detail.sendBack') })}>{t('detail.sendBack')}</Button>);
    actions.push(<Button key="act" variant="success" icon={<CheckCircle2 size={15} />} onClick={() => setStatusModal({ to: 'ACTIVE', label: t('detail.activate') })}>{t('detail.activate')}</Button>);
  }
  if (asset.status === 'ACTIVE' && can('approveAsset'))
    actions.push(<Button key="inact" onClick={() => setStatusModal({ to: 'INACTIVE', label: t('detail.deactivate') })}>{t('detail.deactivate')}</Button>);
  if (['INACTIVE', 'DISPOSED'].includes(asset.status) && can('approveAsset')) {
    actions.push(<Button key="react" icon={<RotateCcw size={15} />} onClick={() => setStatusModal({ to: 'ACTIVE', label: t('detail.reactivate') })}>{t('detail.reactivate')}</Button>);
    actions.push(<Button key="arch" icon={<Archive size={15} />} onClick={() => setStatusModal({ to: 'ARCHIVED', label: t('detail.archive') })}>{t('detail.archive')}</Button>);
  }

  return (
    <>
      <PageHeader
        crumbs={
          <Link href="/assets" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={13} /> {t('nav.assets')}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{lk.assetName(asset)}</span>
            <AssetStatusBadge status={asset.status} />
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[13px] font-medium text-brand-700">{asset.code}</span>
            <span>·</span>
            <span>{lk.category(asset.categoryId)} / {lk.category(asset.subcategoryId)}</span>
            <span>·</span>
            <span>{lk.branch(asset.branchId)} · {lk.department(asset.departmentId)}</span>
          </span>
        }
        actions={
          <>
            {canEdit && <Button icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>{t('common.edit')}</Button>}
            {['ACTIVE', 'INACTIVE', 'PENDING_REVIEW'].includes(asset.status) && (
              <Link href={`/label/${asset.id}`} target="_blank"><Button icon={<Printer size={15} />}>{t('detail.printLabel')}</Button></Link>
            )}
            {actions}
          </>
        }
      />

      {asset.status === 'DRAFT' && issues.length > 0 && (
        <div className="mb-4">
          <Notice tone="amber">
            {issues.map((i) => t(`issue.${i}`)).join(' · ')}
          </Notice>
        </div>
      )}

      {asset.status === 'PENDING_REVIEW' && (
        <div className="mb-4">
          <Notice tone="amber" icon={<Clock size={16} />}>
            <div className="font-semibold text-amber-900">รอผู้จัดการอนุมัติ</div>
            <div className="mt-0.5 text-amber-900/90">
              {submitLog
                ? <>ส่งตรวจโดย <b>{submitLog.user}</b> · {dateTime(submitLog.at)} — </>
                : <>รายการนี้ถูกส่งตรวจแล้ว — </>}
              รออนุมัติจาก{' '}
              <b>{managers.length ? managers.map((m) => m.name).join(', ') : 'ผู้จัดการบัญชี (MANAGER)'}</b>
              {' '}เพื่อเปิดใช้งานและเริ่มคิดค่าเสื่อม
            </div>
            <div className="mt-1 text-[12px] text-amber-800/80">
              {iAmApprover
                ? 'คุณมีสิทธิ์อนุมัติ — กดปุ่ม “อนุมัติใช้งาน” ด้านบนขวา (หรือ “ส่งกลับแก้ไข”)'
                : 'ต้องเข้าสู่ระบบด้วยสิทธิ์ผู้จัดการจึงจะอนุมัติได้'}
            </div>
          </Notice>
        </div>
      )}

      {asset.status === 'DRAFT' && issues.length === 0 && can('editDraft') && (
        <div className="mb-4">
          <Notice tone="gray" icon={<Send size={15} />}>
            ฉบับร่างพร้อมส่งตรวจแล้ว — กด <b>“ส่งตรวจสอบ”</b> ด้านบนขวา เพื่อส่งให้ผู้จัดการอนุมัติก่อนเปิดใช้งาน
          </Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: t('field.totalCost'), v: money(v.cost) },
          { l: `${t('field.accumDep')} (${period(CURRENT_PERIOD)})`, v: money(v.accumulated) },
          { l: t('field.nbv'), v: money(v.nbv), strong: true },
          { l: t('field.remaining'), v: `${v.remainingMonths} / ${asset.lifeMonths} ${t('common.months')}` },
        ].map((k) => (
          <div key={k.l} className={cx('rounded-lg border bg-white px-4 py-3 shadow-card', k.strong ? 'border-brand-200' : 'border-line')}>
            <div className="text-[12px] text-ink-3">{k.l}</div>
            <div className={cx('mt-1 text-[19px] font-semibold tabular-nums', k.strong ? 'text-brand-700' : 'text-ink')}>{k.v}</div>
          </div>
        ))}
      </div>

      <Card>
        <div className="px-2">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'overview', label: t('detail.tabs.overview') },
              { id: 'accounting', label: t('detail.tabs.accounting') },
              { id: 'depreciation', label: t('detail.tabs.depreciation') },
              { id: 'location', label: t('detail.tabs.location') },
              { id: 'documents', label: t('detail.tabs.documents'), count: docs.length },
              { id: 'history', label: t('detail.tabs.history'), count: history.length },
            ]}
          />
        </div>
        <div className="p-4 md:p-5">
          {tab === 'overview' && <OverviewTab asset={asset} />}
          {tab === 'accounting' && <AccountingTab asset={asset} />}
          {tab === 'depreciation' && <DepreciationTab asset={asset} />}
          {tab === 'location' && <LocationTab asset={asset} />}
          {tab === 'documents' && <DocumentsTab asset={asset} />}
          {tab === 'history' && <HistoryTab asset={asset} />}
        </div>
      </Card>

      {editOpen && <EditDrawer asset={asset} onClose={() => setEditOpen(false)} />}
      {statusModal && (
        <StatusModal
          label={statusModal.label}
          needReason={asset.status === 'ACTIVE' || statusModal.to === 'DRAFT' || statusModal.to === 'ARCHIVED'}
          onClose={() => setStatusModal(null)}
          onConfirm={(reason) => {
            setAssetStatus(asset.id, statusModal.to, reason);
            setStatusModal(null);
          }}
        />
      )}
    </>
  );
}

function StatusModal({ label, needReason, onClose, onConfirm }: { label: string; needReason: boolean; onClose: () => void; onConfirm: (r: string) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={label}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={needReason && !reason.trim()} onClick={() => onConfirm(reason)}>{t('common.confirm')}</Button>
        </>
      }
    >
      <FormField label={t('common.reason')} required={needReason}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} />
      </FormField>
    </Modal>
  );
}

/* ================================================================ Overview */
function OverviewTab({ asset }: { asset: Asset }) {
  const { t, date } = useI18n();
  const { state, addDocument, can } = useStore();
  const lk = useLookups();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  // ชุด/กลุ่มที่แยกมา — ทรัพย์สินที่สร้างจากรายการ OA เดียวกัน (แยกเป็นรายชิ้น) จะใช้ oaId ร่วมกัน
  const group = useMemo(() => {
    if (!asset.oaId) return null;
    const siblings = state.assets
      .filter((a) => a.oaId === asset.oaId)
      .sort((a, b) => a.code.localeCompare(b.code));
    if (siblings.length < 2) return null;
    const idx = siblings.findIndex((a) => a.id === asset.id);
    return { siblings, idx, total: siblings.length };
  }, [state.assets, asset.oaId, asset.id]);

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-3">{t('detail.mainPhoto')}</div>
          <div className={cx('flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border', asset.hasPhoto ? 'border-line bg-gradient-to-br from-slate-50 to-slate-100' : 'border-dashed border-amber-300 bg-amber-50/40')}>
            <ImageIcon size={34} className={asset.hasPhoto ? 'text-slate-400' : 'text-amber-500'} />
            <span className="text-[12px] text-ink-3">{asset.hasPhoto ? `${asset.code}_main.jpg` : t('detail.noPhoto')}</span>
          </div>
          {can('uploadDoc') && (
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-white py-1.5 text-[13px] text-ink-2 hover:bg-canvas">
              <Upload size={14} /> {t('detail.uploadPhoto')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addDocument({ assetId: asset.id, type: 'PHOTO', fileName: file.name, sourceSystem: 'FA', sourceDocNo: '', sizeKb: Math.round(file.size / 1024) });
                }}
              />
            </label>
          )}
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[12px] font-medium text-ink-3">{t('detail.qr')}</div>
          {['ACTIVE', 'INACTIVE', 'PENDING_REVIEW'].includes(asset.status) ? (
            <div className="flex items-center gap-3">
              <div className="rounded border border-line bg-white p-1.5">
                <QRCodeSVG value={`${origin}/a/${asset.id}`} size={88} level="M" />
              </div>
              <p className="text-[12px] leading-snug text-ink-3">{t('detail.qrHint')}</p>
            </div>
          ) : (
            <p className="text-[12px] text-ink-3">{t('status.ACTIVE')} → QR</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Section title={t('detail.general')}>
          <DL
            cols={3}
            items={[
              { label: t('field.assetCode'), value: asset.code, mono: true },
              { label: t('field.nameTh'), value: asset.nameTh },
              { label: t('field.nameEn'), value: asset.nameEn || '—' },
              { label: t('field.category'), value: lk.category(asset.categoryId) },
              { label: t('field.subcategory'), value: lk.category(asset.subcategoryId) },
              { label: t('common.status'), value: <AssetStatusBadge status={asset.status} /> },
              { label: t('field.brand'), value: asset.brand || '—' },
              { label: t('field.model'), value: asset.model || '—', mono: !!asset.model },
              { label: t('field.serialNumber'), value: asset.serialNumber || '—', mono: !!asset.serialNumber },
              { label: t('field.quantity'), value: asset.quantity },
              { label: t('field.unit'), value: lk.unit(asset.unit) },
              { label: t('field.description'), value: asset.description || '—' },
            ]}
          />
        </Section>
        <Section title={t('detail.org')}>
          <DL
            cols={3}
            items={[
              { label: t('field.company'), value: lk.company(asset.companyId) },
              { label: t('field.branch'), value: lk.branch(asset.branchId) },
              { label: t('field.department'), value: lk.department(asset.departmentId) },
              { label: t('field.costCenter'), value: lk.costCenter(asset.costCenterId) },
              { label: t('field.location'), value: lk.location(asset.locationId) || <span className="text-amber-700">{t('common.notSet')}</span> },
              { label: t('field.holder'), value: <span className="text-ink-3">Phase 2</span> },
            ]}
          />
        </Section>
        <Section title={t('detail.source')}>
          <DL
            cols={3}
            items={[
              { label: t('field.oaNo'), value: asset.source.oaNo ? <Link href="/oa-import" className="font-mono text-brand-600 hover:underline">{asset.source.oaNo}</Link> : asset.legacy ? <Badge>Legacy import</Badge> : '—' },
              { label: t('field.prNo'), value: asset.source.prNo ?? '—', mono: true },
              { label: t('field.poNo'), value: asset.source.poNo ?? '—', mono: true },
              { label: t('field.grNo'), value: asset.source.grNo ?? '—', mono: true },
              { label: t('field.invoiceNo'), value: asset.source.invoiceNo ?? '—', mono: true },
              { label: t('field.supplier'), value: asset.source.supplier ?? '—' },
              { label: t('field.purchaseDate'), value: date(asset.source.purchaseDate) },
              { label: t('field.acquisitionDate'), value: date(asset.acquisitionDate) },
              { label: t('field.readyDate'), value: date(asset.readyDate) },
            ]}
          />
        </Section>

        {group && (
          <Section
            title={
              <span className="flex items-center gap-2">
                <Split size={15} className="text-brand-600" /> ชุด/กลุ่มที่แยกมา
                <Badge tone="blue">ชิ้นที่ {group.idx + 1} จาก {group.total}</Badge>
              </span>
            }
          >
            <p className="mb-3 text-[12.5px] text-ink-3">
              ทรัพย์สินชิ้นนี้ถูกแยกออกเป็นรายชิ้นจากรายการ OA เดียวกัน{' '}
              {asset.source.oaNo && (
                <Link href="/oa-import" className="font-mono text-brand-600 hover:underline">{asset.source.oaNo}</Link>
              )}{' '}
              — ทั้งชุดมี {group.total} ชิ้น กดดูชิ้นอื่นในชุดได้ด้านล่าง
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.siblings.map((s, i) => {
                const current = s.id === asset.id;
                return current ? (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-[12.5px] font-medium text-brand-700">
                    <span className="font-mono">{s.code}</span>
                    <span className="rounded bg-brand-600 px-1 text-[10px] text-white">#{i + 1}</span>
                  </span>
                ) : (
                  <Link key={s.id} href={`/assets/${s.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12.5px] text-ink-2 transition hover:border-brand-400 hover:bg-canvas">
                    <span className="font-mono">{s.code}</span>
                    <span className="rounded bg-ink-4/15 px-1 text-[10px] text-ink-3">#{i + 1}</span>
                    {s.serialNumber && <span className="text-ink-4">· {s.serialNumber}</span>}
                  </Link>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ================================================================ Accounting */
function AccountingTab({ asset }: { asset: Asset }) {
  const { t, money, L } = useI18n();
  const { state } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const v = vals.get(asset.id)!;
  const cat = state.categories.find((c) => c.id === asset.subcategoryId) ?? state.categories.find((c) => c.id === asset.categoryId);
  const pol = lk.policyObj(asset.policyId);
  const sched = buildSchedule(asset, prorationFor(asset, state.policies));
  const sysClosing = sched.filter((r) => r.period <= '2026-12').slice(-1)[0]?.accumulated ?? 0;
  const sysOpening = sched.filter((r) => r.period <= '2025-12').slice(-1)[0]?.accumulated ?? 0;
  const lifeOverride = pol && pol.lifeYears * 12 !== asset.lifeMonths;
  const resOverride = pol && pol.residual !== asset.residual;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('detail.costInfo')}>
        <table className="w-full text-[13.5px]">
          <tbody>
            {[
              [t('field.originalCost'), asset.originalCost],
              [t('field.additionalCost'), asset.additionalCost],
              [t('field.totalCost'), totalCost(asset), true],
              [t('field.residual'), asset.residual],
              [t('field.accumDep'), -v.accumulated],
              [t('field.nbv'), v.nbv, true],
            ].map(([l, n, strong]) => (
              <tr key={l as string} className={cx('border-b border-line-soft', !!strong && 'font-semibold text-ink')}>
                <td className="py-2 text-ink-2">{l}</td>
                <td className="py-2 text-right tabular-nums">{money(n as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 font-mono text-[12px] text-ink-3">{t('detail.nbvFormula')}</p>
      </Section>

      <Section title={t('field.policy')}>
        <DL
          items={[
            { label: t('field.policy'), value: pol ? L(pol.name) : <span className="text-red-700">{t('issue.MISSING_POLICY')}</span> },
            { label: t('field.method'), value: t(`method.${asset.method}`) },
            { label: t('field.usefulLife'), value: <>{asset.lifeMonths / 12} {t('common.years')} ({asset.lifeMonths} {t('common.months')}) {lifeOverride ? <Badge tone="violet">{t('detail.override')}</Badge> : <Badge>{t('detail.fromPolicy')}</Badge>}</> },
            { label: t('field.residual'), value: <>{money(asset.residual)} {resOverride ? <Badge tone="violet">{t('detail.override')}</Badge> : <Badge>{t('detail.fromPolicy')}</Badge>}</> },
            { label: t('field.proration'), value: pol ? t(`proration.${pol.proration}`) : '—' },
            { label: t('field.startRule'), value: pol ? t(`startRule.${pol.startRule}`) : '—' },
            { label: t('field.monthlyDep'), value: money(sched[1]?.depreciation ?? sched[0]?.depreciation ?? 0) },
            { label: t('field.endDate'), value: v.endPeriod ?? '—' },
          ]}
        />
      </Section>

      <Section title={t('categories.mapping')}>
        <DL
          cols={1}
          items={[
            { label: t('field.assetAccount'), value: lk.account(cat?.assetAccount), mono: true },
            { label: t('field.expenseAccount'), value: lk.account(cat?.expenseAccount), mono: true },
            { label: t('field.accumAccount'), value: lk.account(cat?.accumAccount), mono: true },
          ]}
        />
        <p className="mt-3 text-[12px] text-ink-3">{t('categories.glNote')}</p>
      </Section>

      {asset.legacy && (
        <Section title={t('detail.legacy')}>
          <Table>
            <thead>
              <tr>
                <Th />
                <Th right>Legacy</Th>
                <Th right>{t('detail.systemCalc')}</Th>
                <Th right>{t('detail.variance')}</Th>
              </tr>
            </thead>
            <tbody>
              {[
                [t('detail.legacyOpeningAccum'), asset.legacy.openingAccum, sysOpening],
                [t('detail.legacyPeriodDep'), asset.legacy.periodDep, sysClosing - sysOpening],
                [t('detail.legacyClosingAccum'), asset.legacy.closingAccum, sysClosing],
                [t('detail.legacyClosingNbv'), asset.legacy.closingNbv, totalCost(asset) - sysClosing],
              ].map(([l, a, b]) => {
                const diff = Math.round(((b as number) - (a as number)) * 100) / 100;
                return (
                  <tr key={l as string}>
                    <Td>{l}</Td>
                    <Td right>{money(a as number)}</Td>
                    <Td right>{money(b as number)}</Td>
                    <Td right className={Math.abs(diff) > 1 ? 'text-amber-700' : 'text-emerald-700'}>{money(diff)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-[12px] text-ink-3">{asset.legacy.assetAccount} · {asset.legacy.accumAccount}</p>
        </Section>
      )}
    </div>
  );
}

/* ================================================================ Depreciation */
function DepreciationTab({ asset }: { asset: Asset }) {
  const { t, money, period } = useI18n();
  const { state, can } = useStore();
  const sched = useMemo(() => buildSchedule(asset, prorationFor(asset, state.policies)), [asset, state.policies]);
  const years = [...new Set(sched.map((r) => r.period.slice(0, 4)))];
  const [year, setYear] = useState(years.includes(CURRENT_PERIOD.slice(0, 4)) ? CURRENT_PERIOD.slice(0, 4) : years[0] ?? '');
  const locked = new Set(state.runs.filter((r) => r.status === 'LOCKED').map((r) => r.period));
  const rows = year === 'all' ? sched : sched.filter((r) => r.period.startsWith(year));

  if (!sched.length) return <Notice tone="amber">{t('issue.INVALID_READY_DATE')}</Notice>;

  return (
    <Section
      title={t('detail.schedule')}
      actions={
        <div className="flex items-center gap-2">
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 w-28">
            <option value="all">{t('common.all')}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button
            size="sm"
            icon={<Download size={14} />}
            disabled={!can('exportReport')}
            onClick={() =>
              exportXlsx(`Schedule_${asset.code}`, [
                { name: asset.code, rows: sched.map((r) => ({ Period: r.period, 'Opening NBV': r.opening, Depreciation: r.depreciation, 'Accumulated Depreciation': r.accumulated, 'Closing NBV': r.closing, Status: r.period <= CURRENT_PERIOD ? (locked.has(r.period) ? 'LOCKED' : 'POSTED') : 'PLANNED' })) },
              ])
            }
          >
            {t('common.export')}
          </Button>
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>{t('detail.period')}</Th>
            <Th right>{t('detail.opening')}</Th>
            <Th right>{t('field.periodDep')}</Th>
            <Th right>{t('field.accumDep')}</Th>
            <Th right>{t('detail.closing')}</Th>
            <Th>{t('common.status')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cur = r.period === CURRENT_PERIOD;
            const past = r.period < CURRENT_PERIOD;
            return (
              <tr key={r.period} className={cx(cur && 'bg-brand-50/60')}>
                <Td className={cx('whitespace-nowrap', cur && 'font-semibold text-brand-700')}>{period(r.period)}</Td>
                <Td right>{money(r.opening)}</Td>
                <Td right>{money(r.depreciation)}</Td>
                <Td right>{money(r.accumulated)}</Td>
                <Td right className="font-medium text-ink">{money(r.closing)}</Td>
                <Td>
                  {locked.has(r.period) ? (
                    <Badge tone="green"><Lock size={11} /> {t('runStatus.LOCKED')}</Badge>
                  ) : cur ? (
                    <Badge tone="blue">{t('detail.current')}</Badge>
                  ) : past ? (
                    <Badge>{t('runStatus.REVIEWED')}</Badge>
                  ) : (
                    <span className="text-[12px] text-ink-4">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Section>
  );
}

/* ================================================================ Location */
function LocationTab({ asset }: { asset: Asset }) {
  const { t } = useI18n();
  const lk = useLookups();
  const loc = lk.locationObj(asset.locationId);
  const steps = [
    { icon: Building2, label: t('field.company'), value: lk.company(asset.companyId) },
    { icon: Building2, label: t('field.branch'), value: lk.branch(asset.branchId) },
    { icon: Building2, label: t('field.building'), value: loc?.building },
    { icon: Building2, label: t('field.floor'), value: loc?.floor },
    { icon: MapPin, label: t('field.room'), value: loc?.room },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('loc.hierarchy')}>
        <ol className="relative ml-2 border-l border-line">
          {steps.map((s, i) => (
            <li key={i} className="mb-4 ml-4">
              <span className={cx('absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 bg-white', s.value ? 'border-brand-500' : 'border-amber-400')} />
              <div className="text-[12px] text-ink-3">{s.label}</div>
              <div className="text-[13.5px] text-ink">{s.value || <span className="text-amber-700">{t('common.notSet')}</span>}</div>
            </li>
          ))}
        </ol>
        {loc && <p className="font-mono text-[12px] text-ink-3">{loc.code}</p>}
      </Section>
      <Section title={t('field.holder')}>
        <div className="flex items-start gap-3 rounded-md border border-dashed border-line p-4">
          <UserRound size={20} className="text-ink-4" />
          <p className="text-[13px] text-ink-3">{t('detail.holderPhase2')}</p>
        </div>
        <div className="mt-4">
          <DL items={[{ label: t('field.department'), value: lk.department(asset.departmentId) }, { label: t('field.costCenter'), value: lk.costCenter(asset.costCenterId) }]} />
        </div>
      </Section>
    </div>
  );
}

/* ================================================================ Documents */
const DOC_TYPES: DocType[] = ['OA_APPROVAL', 'PO', 'GR', 'INVOICE', 'TAX_INVOICE', 'WARRANTY', 'CONTRACT', 'ACCEPTANCE', 'PHOTO', 'OTHER'];

function DocumentsTab({ asset }: { asset: Asset }) {
  const { t, date } = useI18n();
  const { state, addDocument, can } = useStore();
  const docs = state.documents.filter((d) => d.assetId === asset.id);
  const [type, setType] = useState<DocType>('INVOICE');
  const [docNo, setDocNo] = useState('');
  const missingTypes = (['INVOICE', 'PHOTO'] as DocType[]).filter((ty) => !docs.some((d) => d.type === ty));

  return (
    <div className="space-y-4">
      {can('uploadDoc') && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-canvas/70 p-3">
          <div className="w-48">
            <FormField label={t('docs.type')}>
              <Select value={type} onChange={(e) => setType(e.target.value as DocType)}>
                {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`docType.${d}`)}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="w-48">
            <FormField label={t('docs.sourceDoc')}>
              <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
            </FormField>
          </div>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-brand-600 bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            <Upload size={15} /> {t('common.upload')}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                addDocument({ assetId: asset.id, type, fileName: file.name, sourceSystem: 'FA', sourceDocNo: docNo, sizeKb: Math.max(1, Math.round(file.size / 1024)) });
                setDocNo('');
                e.target.value = '';
              }}
            />
          </label>
          {missingTypes.length > 0 && <span className="ml-auto text-[12px] text-amber-700">{t('assets.missingDoc')}: {missingTypes.map((m) => t(`docType.${m}`)).join(', ')}</span>}
        </div>
      )}
      {docs.length === 0 ? (
        <Empty>{t('docs.noDocs')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('docs.fileName')}</Th>
              <Th>{t('docs.type')}</Th>
              <Th>{t('docs.sourceSystem')}</Th>
              <Th>{t('docs.sourceDoc')}</Th>
              <Th>{t('docs.uploadedBy')}</Th>
              <Th>{t('docs.uploadedAt')}</Th>
              <Th right>{t('docs.size')}</Th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <Td className="text-ink"><span className="inline-flex items-center gap-1.5">{d.type === 'PHOTO' ? <ImageIcon size={14} className="text-ink-4" /> : <FileText size={14} className="text-ink-4" />}{d.fileName}</span></Td>
                <Td><Badge tone={d.type === 'PHOTO' ? 'teal' : 'blue'}>{t(`docType.${d.type}`)}</Badge></Td>
                <Td>{d.sourceSystem}</Td>
                <Td mono>{d.sourceDocNo || '—'}</Td>
                <Td>{d.uploadedBy}</Td>
                <Td className="whitespace-nowrap">{date(d.uploadedAt)}</Td>
                <Td right>{d.sizeKb} KB</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ================================================================ History */
function HistoryTab({ asset }: { asset: Asset }) {
  const { t, dateTime } = useI18n();
  const { state } = useStore();
  const logs = state.audit.filter((a) => a.assetCode === asset.code);

  // ไทม์ไลน์ผู้ส่งตรวจ / ผู้อนุมัติ — สรุปจากการเปลี่ยนสถานะ (เรียงเก่า→ใหม่)
  const statusLogs = logs.filter((l) => l.action === 'STATUS_CHANGE').slice().reverse();
  const stepOf = (oldV?: string, newV?: string): { label: string; icon: typeof Send; tone: string } => {
    if (newV === 'PENDING_REVIEW') return { label: 'ส่งตรวจสอบ (รออนุมัติ)', icon: Send, tone: 'text-amber-600' };
    if (newV === 'ACTIVE' && oldV === 'PENDING_REVIEW') return { label: 'อนุมัติ — เปิดใช้งาน', icon: UserCheck, tone: 'text-emerald-600' };
    if (newV === 'ACTIVE') return { label: 'เปิดใช้งานอีกครั้ง', icon: RotateCcw, tone: 'text-emerald-600' };
    if (newV === 'DRAFT' && oldV === 'PENDING_REVIEW') return { label: 'ส่งกลับแก้ไข', icon: Undo2, tone: 'text-amber-600' };
    if (newV === 'INACTIVE') return { label: 'พักการใช้งาน', icon: Clock, tone: 'text-ink-4' };
    if (newV === 'ARCHIVED') return { label: 'จำหน่าย / เก็บเข้าคลัง', icon: Archive, tone: 'text-ink-4' };
    return { label: `เปลี่ยนสถานะ → ${newV}`, icon: Clock, tone: 'text-ink-4' };
  };
  const timeline = [
    { icon: FileEdit, tone: 'text-brand-600', label: 'สร้างรายการ', user: asset.createdBy || '—', at: asset.createdAt, reason: undefined as string | undefined },
    ...statusLogs.map((l) => { const s = stepOf(l.oldValue, l.newValue); return { icon: s.icon, tone: s.tone, label: s.label, user: l.user, at: l.at, reason: l.reason }; }),
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="mb-2.5 text-[13px] font-semibold text-ink">สายการอนุมัติ</div>
        <ol className="relative ml-1 border-l border-line">
          {timeline.map((step, i) => (
            <li key={i} className="mb-3.5 ml-4 last:mb-0">
              <span className="absolute -left-[9px] flex h-[17px] w-[17px] items-center justify-center rounded-full border border-line bg-white">
                <step.icon size={10} className={step.tone} />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-ink">{step.label}</span>
                <span className="text-[12px] text-ink-2">{step.user}</span>
                <span className="text-[11.5px] text-ink-4">· {dateTime(step.at)}</span>
              </div>
              {step.reason && <div className="mt-0.5 text-[12px] text-ink-3">เหตุผล: {step.reason}</div>}
            </li>
          ))}
        </ol>
      </div>

      <div className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-3">
        <Lock size={13} /> {t('audit.immutable')}
      </div>
      {logs.length === 0 ? (
        <Empty>
          {t('field.createdBy')}: {asset.createdBy} · {dateTime(asset.createdAt)}
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('audit.at')}</Th>
              <Th>{t('audit.user')}</Th>
              <Th>{t('audit.action')}</Th>
              <Th>{t('audit.field')}</Th>
              <Th>{t('audit.old')}</Th>
              <Th>{t('audit.new')}</Th>
              <Th>{t('common.reason')}</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{dateTime(l.at)}</Td>
                <Td className="whitespace-nowrap">{l.user}<div className="text-[11.5px] text-ink-4">{l.role === 'SYSTEM' ? 'SYSTEM' : t(`role.${l.role}`)}</div></Td>
                <Td mono>{l.action}</Td>
                <Td mono>{l.field ?? '—'}</Td>
                <Td className="text-red-700/80">{l.oldValue ?? '—'}</Td>
                <Td className="text-emerald-800">{l.newValue ?? '—'}</Td>
                <Td>{l.reason ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/* ================================================================ Edit drawer */
function EditDrawer({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { t, L } = useI18n();
  const { state, updateAsset, can } = useStore();
  const isDraft = asset.status === 'DRAFT' || asset.status === 'PENDING_REVIEW';
  const isManager = can('approveAsset');
  const [f, setF] = useState({ ...asset });
  const [reason, setReason] = useState('');
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setF((p) => ({ ...p, [k]: v }));
  const lockedAcc = !isDraft && !isManager; // accounting-sensitive fields need manager on active assets
  const subs = state.categories.filter((c) => c.parentId);

  const save = () => {
    const keys: (keyof Asset)[] = ['nameTh', 'nameEn', 'description', 'brand', 'model', 'serialNumber', 'subcategoryId', 'categoryId', 'branchId', 'departmentId', 'costCenterId', 'locationId', 'quantity', 'unit', 'originalCost', 'additionalCost', 'residual', 'lifeMonths', 'policyId', 'acquisitionDate', 'readyDate'];
    const patch: Partial<Asset> = {};
    for (const k of keys) if (JSON.stringify(f[k]) !== JSON.stringify(asset[k])) (patch as Record<string, unknown>)[k] = f[k];
    updateAsset(asset.id, patch, reason || undefined);
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${t('common.edit')} · ${asset.code}`}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!isDraft && !reason.trim()}>{t('common.save')}</Button>
        </>
      }
    >
      {!isDraft && <div className="mb-4"><Notice tone="amber" icon={<Lock size={14} />}>{t('detail.editLocked')}</Notice></div>}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <FormField label={t('field.nameTh')} required><Input value={f.nameTh} onChange={(e) => set('nameTh', e.target.value)} /></FormField>
        <FormField label={t('field.nameEn')}><Input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></FormField>
        <FormField label={t('field.brand')}><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></FormField>
        <FormField label={t('field.model')}><Input value={f.model} onChange={(e) => set('model', e.target.value)} /></FormField>
        <FormField label={t('field.serialNumber')}><Input value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></FormField>
        <FormField label={t('field.subcategory')}>
          <Select value={f.subcategoryId} disabled={lockedAcc} onChange={(e) => { const s = subs.find((x) => x.id === e.target.value); setF((p) => ({ ...p, subcategoryId: e.target.value, categoryId: s?.parentId ?? p.categoryId })); }}>
            {subs.map((s) => <option key={s.id} value={s.id}>{L(state.categories.find((c) => c.id === s.parentId)?.name)} / {L(s.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.branch')}>
          <Select value={f.branchId} onChange={(e) => set('branchId', e.target.value)}>
            {state.branches.map((b) => <option key={b.id} value={b.id}>{L(b.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.department')}>
          <Select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
            {state.departments.map((d) => <option key={d.id} value={d.id}>{L(d.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.costCenter')}>
          <Select value={f.costCenterId} onChange={(e) => set('costCenterId', e.target.value)}>
            {state.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {L(c.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.location')}>
          <Select value={f.locationId ?? ''} onChange={(e) => set('locationId', e.target.value || null)}>
            <option value="">{t('common.notSet')}</option>
            {state.locations.filter((l) => l.branchId === f.branchId).map((l) => <option key={l.id} value={l.id}>{l.code} · {L(l.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.quantity')}><Input type="number" min={1} value={f.quantity} disabled={lockedAcc} onChange={(e) => set('quantity', Number(e.target.value))} /></FormField>
        <FormField label={t('field.originalCost')}><Input type="number" step="0.01" value={f.originalCost} disabled={lockedAcc} onChange={(e) => set('originalCost', Number(e.target.value))} /></FormField>
        <FormField label={t('field.additionalCost')}><Input type="number" step="0.01" value={f.additionalCost} disabled={lockedAcc} onChange={(e) => set('additionalCost', Number(e.target.value))} /></FormField>
        <FormField label={t('field.residual')}><Input type="number" step="0.01" value={f.residual} disabled={lockedAcc} onChange={(e) => set('residual', Number(e.target.value))} /></FormField>
        <FormField label={`${t('field.usefulLife')} (${t('common.months')})`}><Input type="number" min={1} value={f.lifeMonths} disabled={lockedAcc} onChange={(e) => set('lifeMonths', Number(e.target.value))} /></FormField>
        <FormField label={t('field.policy')}>
          <Select value={f.policyId ?? ''} disabled={lockedAcc} onChange={(e) => set('policyId', e.target.value || null)}>
            <option value="">{t('common.notSet')}</option>
            {state.policies.map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('field.acquisitionDate')}><Input type="date" value={f.acquisitionDate} disabled={lockedAcc} onChange={(e) => set('acquisitionDate', e.target.value)} /></FormField>
        <FormField label={t('field.readyDate')} required><Input type="date" value={f.readyDate ?? ''} disabled={lockedAcc} onChange={(e) => set('readyDate', e.target.value || null)} /></FormField>
        <div className="sm:col-span-2">
          <FormField label={t('field.description')}><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label={t('common.reason')} required={!isDraft} hint={!isDraft ? t('detail.reasonRequired') : undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}
