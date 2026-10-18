'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Boxes, CheckCircle2, Download, FileSpreadsheet, Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { readFirstSheet, downloadPeakGroupTemplate, downloadPeakAssetTemplate, peakDateToIso } from '@/lib/excel';
import { ACCOUNTS } from '@/data/masters';
import type { Asset, Category, DepPolicy } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Notice, PageHeader, Table, Tabs, Td, Th, cx } from '@/components/ui';

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const seg = (s: string, fb: string) => (String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || fb);
const ACC_BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a.id]));
const n2 = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0;

type NewAsset = Omit<Asset, 'id' | 'code' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>;

interface GroupRow {
  rowNo: number;
  parentName: string;
  subName: string;
  code: string;
  action: 'new' | 'update' | null;
  errors: string[];
  notes: string[];
  lifeYears: number;
  salvageRaw: string;
  parent?: Category;      // parent to upsert (only when new)
  policy?: DepPolicy;     // policy to upsert (only when new parent)
  child?: Category;       // the group (subcategory) to upsert
}

interface AssetRow {
  rowNo: number;
  groupCode: string;
  catName: string;
  buyDate: string | null;
  cost: number;
  accum: number;
  depStart: string | null;
  errors: string[];
  asset?: NewAsset;
}

export default function PeakImportPage() {
  const { t, money, num, L } = useI18n();
  const { state, importAssets, upsertMaster, createAsset, can } = useStore();

  const [tab, setTab] = useState<'group' | 'asset'>('group');
  const [fileName, setFileName] = useState('');
  const [gRows, setGRows] = useState<GroupRow[]>([]);
  const [aRows, setARows] = useState<AssetRow[]>([]);
  const [done, setDone] = useState<{ kind: 'group' | 'asset'; n: number } | null>(null);

  const topByName = useMemo(
    () => state.categories.filter((c) => !c.parentId),
    [state.categories],
  );
  const subByCode = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of state.categories) if (c.parentId && c.code) m.set(c.code.toUpperCase(), c);
    return m;
  }, [state.categories]);

  const resetTo = (which: 'group' | 'asset') => { setTab(which); setGRows([]); setARows([]); setDone(null); setFileName(''); };

  // แก้ GL code → Account.id (ถ้าพบในผังบัญชี ไม่งั้นคงรูป ACC-<code>) + หมายเหตุถ้าไม่พบ
  const resolveAcc = (code: string, fallback: string, notes: string[], label: string): string => {
    const c = String(code ?? '').trim();
    if (!c) return fallback;
    const id = ACC_BY_CODE.get(c);
    if (id) return id;
    notes.push(`${label} ${c} ${t('imp.pk.accNotFound')}`);
    return `ACC-${c}`;
  };

  // ───────────── กลุ่มสินทรัพย์ (ImportFixAssetGroup) ─────────────
  const parseGroup = async (file: File) => {
    setFileName(file.name); setDone(null);
    const aoa = await readFirstSheet(file);
    const existingCodes = new Set(state.categories.map((c) => (c.code || '').toUpperCase()));
    const newParents = new Map<string, { parent: Category; policy: DepPolicy }>();
    const seenCode = new Set<string>();
    const out: GroupRow[] = [];

    aoa.slice(1).forEach((r, i) => {
      if (typeof r[0] !== 'number') return; // ต้องมีลำดับที่ ไม่งั้นข้าม
      const parentName = String(r[1] ?? '').trim();
      const subName = String(r[2] ?? '').trim();
      const nameTh = String(r[4] ?? subName).trim();
      const nameEn = String(r[5] ?? '').trim();
      const unit = String(r[6] ?? '').trim() || 'unit';
      const lifeYears = Math.max(1, Math.min(99, Math.round(n2(r[9]) || 5)));
      const salvageRaw = String(r[12] ?? '').trim();
      const errors: string[] = [];
      const notes: string[] = [];
      if (!parentName) errors.push(t('imp.pk.noParent'));
      if (!nameTh && !nameEn) errors.push(t('imp.pk.noName'));

      // หาหมวดหลัก (parent) จากชื่อ — ถ้าไม่พบให้สร้างใหม่
      let parent = topByName.find((c) => norm(c.name.th) === norm(parentName) || norm(c.name.th).includes(norm(parentName)) || norm(parentName).includes(norm(c.name.th)));
      let newParent: Category | undefined;
      let newPolicy: DepPolicy | undefined;
      if (!parent && parentName) {
        const pid = `CAT-${seg(parentName, 'GRP')}`;
        const cached = newParents.get(pid);
        if (cached) { parent = cached.parent; }
        else {
          const assetAcc = resolveAcc(String(r[8] ?? ''), 'ACC-124106', notes, t('imp.pk.assetAcc'));
          const expAcc = resolveAcc(String(r[10] ?? ''), 'ACC-530706', notes, t('imp.pk.expAcc'));
          const accAcc = resolveAcc(String(r[11] ?? ''), 'ACC-124206', notes, t('imp.pk.accumAcc'));
          newParent = {
            id: pid, code: seg(parentName, 'GRP'), parentId: null,
            name: { th: parentName, en: nameEn || parentName, zh: parentName },
            defaultUnit: unit, defaultLifeYears: lifeYears, defaultResidual: 1, method: 'SL',
            assetAccount: assetAcc, expenseAccount: expAcc, accumAccount: accAcc, active: true,
          };
          newPolicy = {
            id: `P-${pid}`, name: { th: `นโยบาย ${parentName}`, en: `Policy ${nameEn || parentName}`, zh: parentName },
            categoryId: pid, method: 'SL', lifeYears, residual: 1,
            startRule: 'READY_DATE', proration: 'FULL_MONTH', rounding: 2,
            effectiveDate: '2026-01-01', active: true,
          };
          newParents.set(pid, { parent: newParent, policy: newPolicy });
          parent = newParent;
        }
      }

      // รหัสกลุ่ม (subcategory code) — ว่าง = ออกให้อัตโนมัติจากชื่อ
      let code = seg(String(r[3] ?? ''), '');
      if (!code) code = seg(nameEn || nameTh, 'GRP');
      const dupInFile = seenCode.has(code);
      seenCode.add(code);
      const existsInSystem = existingCodes.has(code);
      const action: GroupRow['action'] = errors.length ? null : existsInSystem ? 'update' : 'new';

      let child: Category | undefined;
      if (!errors.length && parent) {
        const pGL = parent;
        const assetAcc = resolveAcc(String(r[8] ?? ''), pGL.assetAccount, notes, t('imp.pk.assetAcc'));
        const expAcc = resolveAcc(String(r[10] ?? ''), pGL.expenseAccount, notes, t('imp.pk.expAcc'));
        const accAcc = resolveAcc(String(r[11] ?? ''), pGL.accumAccount, notes, t('imp.pk.accumAcc'));
        if (salvageRaw.includes('%')) notes.push(t('imp.pk.salvagePct'));
        const residual = salvageRaw.includes('%') ? 1 : (n2(salvageRaw) || 1);
        const existingSub = subByCode.get(code);
        child = {
          id: existingSub?.id ?? `CAT-${code}`,
          code,
          parentId: parent.id,
          name: { th: nameTh || subName || code, en: nameEn || nameTh || code, zh: nameTh || code },
          defaultUnit: unit, defaultLifeYears: lifeYears, defaultResidual: residual, method: 'SL',
          assetAccount: assetAcc, expenseAccount: expAcc, accumAccount: accAcc, active: true,
        };
      }

      out.push({ rowNo: i + 2, parentName, subName: nameTh || subName, code, action, errors, notes, lifeYears, salvageRaw, parent: newParent, policy: newPolicy, child });
      void dupInFile;
    });
    setGRows(out);
  };

  const commitGroup = () => {
    const valid = gRows.filter((r) => !r.errors.length && r.child);
    // สร้างหมวดหลักใหม่ (ไม่ซ้ำ) + นโยบาย ก่อน แล้วค่อยหมวดย่อย
    const seenParent = new Set<string>();
    for (const r of valid) {
      if (r.parent && !seenParent.has(r.parent.id)) {
        seenParent.add(r.parent.id);
        upsertMaster('categories', r.parent);
        if (r.policy) upsertMaster('policies', r.policy);
      }
    }
    for (const r of valid) if (r.child) upsertMaster('categories', r.child);
    setDone({ kind: 'group', n: valid.length });
  };

  // ───────────── สินทรัพย์รายตัว (ImportFixAsset) ─────────────
  const parseAsset = async (file: File) => {
    setFileName(file.name); setDone(null);
    const aoa = await readFirstSheet(file);
    const out: AssetRow[] = [];
    aoa.slice(1).forEach((r, i) => {
      if (typeof r[0] !== 'number') return;
      const groupCode = seg(String(r[1] ?? ''), '');
      const buyDate = peakDateToIso(r[2]);
      const cost = n2(r[3]);
      const accum = n2(r[4]);
      const depStart = peakDateToIso(r[5]);
      const errors: string[] = [];
      const sub = subByCode.get(groupCode);
      if (!groupCode) errors.push(t('imp.pk.noGroup'));
      else if (!sub) errors.push(`${t('imp.pk.unknownGroup')}: ${groupCode}`);
      if (!(cost > 0)) errors.push(t('imp.invalidCost'));
      if (r[2] && !buyDate) errors.push(t('imp.pk.badDate'));

      let asset: NewAsset | undefined;
      if (!errors.length && sub) {
        const ready = depStart ?? buyDate ?? '2026-01-01';
        const acq = buyDate ?? ready;
        const nbv = Math.round((cost - accum) * 100) / 100;
        asset = {
          nameTh: L(sub.name), nameEn: sub.name.en || sub.name.th, description: '',
          categoryId: sub.parentId!, subcategoryId: sub.id,
          companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ADM', costCenterId: 'CC-ADM',
          locationId: null, holderId: null, serialNumber: '', brand: '', model: '',
          unit: sub.defaultUnit || 'unit', quantity: 1, originalCost: cost, additionalCost: 0,
          residual: sub.defaultResidual || 1, lifeMonths: (sub.defaultLifeYears || 5) * 12,
          method: sub.method, policyId: `P-${sub.parentId}`,
          acquisitionDate: acq, readyDate: ready, status: 'ACTIVE', hasPhoto: false,
          source: { sourceSystem: 'PEAK' },
          legacy: {
            openingNbv: nbv, openingAccum: accum, periodDep: 0, closingNbv: nbv, closingAccum: accum,
            assetAccount: sub.assetAccount, expenseAccount: sub.expenseAccount, accumAccount: sub.accumAccount,
          },
        };
      }
      out.push({ rowNo: i + 2, groupCode, catName: sub ? L(sub.name) : '—', buyDate, cost, accum, depStart, errors, asset });
    });
    setARows(out);
  };

  const commitAsset = () => {
    const valid = aRows.filter((r) => !r.errors.length && r.asset);
    for (const r of valid) if (r.asset) createAsset(r.asset, 'PEAK template import');
    void importAssets;
    setDone({ kind: 'asset', n: valid.length });
  };

  const gValid = gRows.filter((r) => !r.errors.length);
  const gErr = gRows.filter((r) => r.errors.length);
  const aValid = aRows.filter((r) => !r.errors.length);
  const aErr = aRows.filter((r) => r.errors.length);

  const canGroup = can('editCategory');
  const canAsset = can('createAsset');

  const dropBox = (onFile: (f: File) => void, hint: string, enabled: boolean) => (
    <label className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors', enabled ? 'border-line hover:border-brand-300 hover:bg-brand-50/30' : 'pointer-events-none opacity-50')}>
      <FileSpreadsheet size={28} className="text-ink-4" />
      <span className="text-[14px] font-medium text-ink">{fileName || t('imp.drop')}</span>
      <span className="text-[12px] text-ink-3">{hint}</span>
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );

  return (
    <>
      <PageHeader
        crumbs={<Link href="/assets/import" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={13} /> {t('imp.title')}</Link>}
        title={t('imp.pk.title')}
        sub={t('imp.pk.subtitle')}
      />

      <Card>
        <div className="px-3 pt-1">
          <Tabs
            value={tab}
            onChange={(v) => resetTo(v as 'group' | 'asset')}
            items={[
              { id: 'group', label: t('imp.pk.tabGroup') },
              { id: 'asset', label: t('imp.pk.tabAsset') },
            ]}
          />
        </div>
        <div className="space-y-3 p-4">
          <Notice icon={tab === 'group' ? <Layers size={15} /> : <Boxes size={15} />}>
            {tab === 'group' ? t('imp.pk.groupHint') : t('imp.pk.assetHint')}
          </Notice>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Download size={15} />} onClick={tab === 'group' ? downloadPeakGroupTemplate : downloadPeakAssetTemplate}>
              {tab === 'group' ? t('imp.pk.groupTemplate') : t('imp.pk.assetTemplate')}
            </Button>
            <span className="text-[12px] text-ink-3">{t('imp.pk.sameAsPeak')}</span>
          </div>
          {tab === 'group' ? dropBox(parseGroup, 'PEAKAsset_Import_AssetGroup_Templete.xlsx', canGroup) : dropBox(parseAsset, 'PEAKAsset_Import_Asset_Templete.xlsx', canAsset)}
          {tab === 'group' && !canGroup && <p className="text-[12px] text-rose-600">{t('imp.pk.needEditCategory')}</p>}
          {tab === 'asset' && !canAsset && <p className="text-[12px] text-rose-600">{t('imp.pk.needCreateAsset')}</p>}
        </div>
      </Card>

      {done && (
        <div className="mt-4">
          <Notice tone="green" icon={<CheckCircle2 size={15} />}>
            {done.kind === 'group' ? t('imp.pk.doneGroup', { n: done.n }) : t('imp.pk.doneAsset', { n: done.n })}
            {' — '}
            <Link href={done.kind === 'group' ? '/categories' : '/assets'} className="underline">
              {done.kind === 'group' ? t('nav.categories') : t('nav.assets')}
            </Link>
          </Notice>
        </div>
      )}

      {/* ── preview: กลุ่ม ── */}
      {tab === 'group' && gRows.length > 0 && !done && (
        <Card className="mt-4">
          <CardHeader
            title={t('imp.step2')}
            sub={`${fileName} · ${num(gRows.length)} ${t('common.rows')} · ${t('imp.valid')} ${gValid.length} · ${t('imp.errorRows')} ${gErr.length}`}
            actions={<Button variant="primary" disabled={!gValid.length || !canGroup} onClick={commitGroup}>{t('imp.pk.commitGroup', { n: gValid.length })}</Button>}
          />
          <Table className="max-h-[520px] overflow-y-auto">
            <thead>
              <tr>
                <Th>#</Th><Th>{t('imp.pk.colCat')}</Th><Th>{t('imp.pk.colGroup')}</Th><Th>{t('field.assetCode')}</Th>
                <Th right>{t('imp.pk.colLife')}</Th><Th>{t('imp.pk.colSalvage')}</Th><Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {gRows.map((r) => (
                <tr key={r.rowNo}>
                  <Td className="text-ink-4">{r.rowNo}</Td>
                  <Td className="whitespace-nowrap">{r.parentName}{r.parent && <Badge tone="amber">{t('imp.pk.newCat')}</Badge>}</Td>
                  <Td className="max-w-[280px] truncate text-ink">{r.subName}</Td>
                  <Td mono>{r.code}</Td>
                  <Td right>{r.lifeYears}</Td>
                  <Td className="text-ink-3">{r.salvageRaw || '—'}</Td>
                  <Td>
                    {r.errors.length ? <Badge tone="red">{r.errors.join(' · ')}</Badge>
                      : r.action === 'update' ? <Badge tone="blue">{t('imp.pk.willUpdate')}</Badge>
                        : <Badge tone="green">{t('imp.pk.willCreate')}</Badge>}
                    {!r.errors.length && r.notes.length > 0 && <span className="ml-1 text-[11px] text-amber-700">· {r.notes.join(' · ')}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* ── preview: สินทรัพย์ ── */}
      {tab === 'asset' && aRows.length > 0 && !done && (
        <Card className="mt-4">
          <CardHeader
            title={t('imp.step2')}
            sub={`${fileName} · ${num(aRows.length)} ${t('common.rows')} · ${t('imp.valid')} ${aValid.length} · ${t('imp.errorRows')} ${aErr.length}`}
            actions={<Button variant="primary" disabled={!aValid.length || !canAsset} onClick={commitAsset}>{t('imp.pk.commitAsset', { n: aValid.length })}</Button>}
          />
          <Table className="max-h-[520px] overflow-y-auto">
            <thead>
              <tr>
                <Th>#</Th><Th>{t('imp.pk.colGroupCode')}</Th><Th>{t('field.subcategory')}</Th>
                <Th>{t('imp.pk.colBuyDate')}</Th><Th right>{t('field.cost')}</Th><Th right>{t('field.accumDep')}</Th>
                <Th>{t('imp.pk.colDepStart')}</Th><Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {aRows.map((r) => (
                <tr key={r.rowNo}>
                  <Td className="text-ink-4">{r.rowNo}</Td>
                  <Td mono>{r.groupCode}</Td>
                  <Td className="max-w-[240px] truncate">{r.catName}</Td>
                  <Td className="whitespace-nowrap">{r.buyDate ?? '—'}</Td>
                  <Td right>{money(r.cost || 0)}</Td>
                  <Td right>{money(r.accum)}</Td>
                  <Td className="whitespace-nowrap">{r.depStart ?? '—'}</Td>
                  <Td>{r.errors.length ? <Badge tone="red">{r.errors.join(' · ')}</Badge> : <Badge tone="green">{t('imp.valid')}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
