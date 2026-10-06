'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { downloadLegacyTemplate, readFirstSheet } from '@/lib/excel';
import { addMonths } from '@/lib/depreciation';
import type { Asset } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Notice, PageHeader, Table, Tabs, Td, Th, cx } from '@/components/ui';

const UNIT_MAP: Record<string, string> = { เครื่อง: 'unit', ตัว: 'piece', คัน: 'vehicle', สิทธิ: 'license', ชุด: 'set' };
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').replace('ซอฟท์', 'ซอฟต์');

interface ParsedRow {
  rowNo: number;
  code: string;
  name: string;
  sub: string;
  subId?: string;
  qty: number;
  cost: number;
  accumEnd: number;
  errors: string[];
  duplicate: boolean;
  asset?: Asset;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export default function ImportPage() {
  const { t, money, num } = useI18n();
  const { state, importAssets, can } = useStore();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [view, setView] = useState<'all' | 'valid' | 'error' | 'dup'>('all');
  const [done, setDone] = useState<number | null>(null);

  const subByName = useMemo(() => new Map(state.categories.filter((c) => c.parentId).map((c) => [norm(c.name.th), c])), [state.categories]);
  const brByCode = useMemo(() => new Map(state.branches.map((b) => [b.code, b.id])), [state.branches]);
  const depByCode = useMemo(() => new Map(state.departments.map((d) => [d.code, d.id])), [state.departments]);
  const ccByCode = useMemo(() => new Map(state.costCenters.map((c) => [c.code, c.id])), [state.costCenters]);
  const locByCode = useMemo(() => new Map(state.locations.map((l) => [l.code, l.id])), [state.locations]);

  const parse = async (file: File) => {
    setFileName(file.name);
    setDone(null);
    const aoa = await readFirstSheet(file);
    const existing = new Set(state.assets.map((a) => a.code));
    const seen = new Set<string>();
    const out: ParsedRow[] = [];
    aoa.slice(1).forEach((r, i) => {
      if (typeof r[0] !== 'number') return; // skip totals / blank lines
      const code = String(r[3] ?? '').trim();
      const sub = String(r[2] ?? '').trim();
      const subCat = subByName.get(norm(sub));
      const cost = Number(r[9]);
      const residual = Number(r[10] ?? 1) || 0;
      const life = Number(r[7] ?? 5) || 5;
      const accumEnd = Number(r[17] ?? 0) || 0;
      const errors: string[] = [];
      if (!code) errors.push(t('imp.missingCode'));
      if (!subCat) errors.push(`${t('imp.unknownCategory')}: ${sub}`);
      if (!(cost > 0)) errors.push(t('imp.invalidCost'));
      const duplicate = !!code && (existing.has(code) || seen.has(code));
      seen.add(code);
      let asset: Asset | undefined;
      if (!errors.length && subCat) {
        const lifeM = life * 12;
        const monthly = (cost - residual) / lifeM;
        const used = monthly > 0 ? Math.max(1, Math.min(lifeM, Math.round(accumEnd / monthly))) : 1;
        const derived = `${addMonths('2026-12', -used + 1)}-01`;
        const ready = toIso(r[28]) ?? derived;
        const branchId = brByCode.get(String(r[22] ?? '')) ?? 'B-HQ';
        const departmentId = depByCode.get(String(r[23] ?? '')) ?? 'D-ADM';
        asset = {
          id: `A-IMP-${Date.now().toString(36)}-${i}`,
          code,
          nameTh: String(r[4] ?? ''),
          nameEn: String(r[4] ?? ''),
          description: '',
          categoryId: subCat.parentId!,
          subcategoryId: subCat.id,
          companyId: 'C-SHD',
          branchId,
          departmentId,
          costCenterId: ccByCode.get(String(r[24] ?? '')) ?? `CC-${departmentId.replace('D-', '')}`,
          locationId: locByCode.get(String(r[25] ?? '')) ?? null,
          holderId: null,
          serialNumber: String(r[26] ?? r[6] ?? ''),
          brand: '',
          model: '',
          unit: UNIT_MAP[String(r[5] ?? '')] ?? 'unit',
          quantity: Number(r[8] ?? 1) || 1,
          originalCost: cost,
          additionalCost: 0,
          residual,
          lifeMonths: lifeM,
          method: 'SL',
          policyId: `P-${subCat.parentId}`,
          acquisitionDate: toIso(r[27]) ?? ready,
          readyDate: ready,
          status: 'ACTIVE',
          hasPhoto: false,
          source: {},
          legacy: {
            openingNbv: Number(r[11] ?? 0), openingAccum: Number(r[12] ?? 0), periodDep: Number(r[13] ?? 0),
            closingNbv: Number(r[16] ?? 0), closingAccum: accumEnd,
            assetAccount: String(r[18] ?? ''), expenseAccount: String(r[19] ?? ''), accumAccount: String(r[20] ?? ''),
          },
          createdAt: new Date().toISOString(),
          createdBy: 'Excel Import',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Excel Import',
        };
      }
      out.push({ rowNo: i + 2, code, name: String(r[4] ?? ''), sub, subId: subCat?.id, qty: Number(r[8] ?? 0), cost, accumEnd, errors, duplicate, asset });
    });
    setRows(out);
    setView('all');
  };

  const valid = rows.filter((r) => !r.errors.length && !r.duplicate);
  const errs = rows.filter((r) => r.errors.length);
  const dups = rows.filter((r) => !r.errors.length && r.duplicate);
  const shown = view === 'valid' ? valid : view === 'error' ? errs : view === 'dup' ? dups : rows;
  const step = done !== null ? 3 : rows.length ? 2 : 1;

  return (
    <>
      <PageHeader
        crumbs={<Link href="/assets" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={13} /> {t('nav.assets')}</Link>}
        title={t('imp.title')}
        sub={t('imp.subtitle')}
        actions={<Button icon={<Download size={15} />} onClick={downloadLegacyTemplate}>{t('imp.template')}</Button>}
      />

      <ol className="mb-4 grid grid-cols-3 gap-2">
        {[t('imp.step1'), t('imp.step2'), t('imp.step3')].map((s, i) => (
          <li key={s} className={cx('flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]', step === i + 1 ? 'border-brand-300 bg-brand-50 font-medium text-brand-800' : step > i + 1 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-ink-3')}>
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold', step > i + 1 ? 'bg-emerald-600 text-white' : step === i + 1 ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-3')}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <Card>
        <div className="p-4">
          <label className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors', can('createAsset') ? 'border-line hover:border-brand-300 hover:bg-brand-50/30' : 'pointer-events-none opacity-50')}>
            <FileSpreadsheet size={28} className="text-ink-4" />
            <span className="text-[14px] font-medium text-ink">{fileName || t('imp.drop')}</span>
            <span className="text-[12px] text-ink-3">Fixed_Asset_report_Group_export.xlsx</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
          </label>
        </div>
      </Card>

      {done !== null && (
        <div className="mt-4">
          <Notice tone="green" icon={<CheckCircle2 size={15} />}>
            {t('imp.done', { n: done })} — <Link href="/assets" className="underline">{t('nav.assets')}</Link>
          </Notice>
        </div>
      )}

      {rows.length > 0 && done === null && (
        <Card className="mt-4">
          <CardHeader
            title={t('imp.step2')}
            sub={`${fileName} · ${num(rows.length)} ${t('common.rows')}`}
            actions={
              <Button
                variant="primary"
                icon={<Upload size={15} />}
                disabled={!valid.length || !can('createAsset')}
                onClick={() => setDone(importAssets(valid.map((r) => r.asset!)))}
              >
                {t('imp.commit', { n: valid.length })}
              </Button>
            }
          />
          <div className="px-3">
            <Tabs
              value={view}
              onChange={setView}
              items={[
                { id: 'all', label: t('common.all'), count: rows.length },
                { id: 'valid', label: t('imp.valid'), count: valid.length },
                { id: 'error', label: t('imp.errorRows'), count: errs.length },
                { id: 'dup', label: t('imp.duplicates'), count: dups.length },
              ]}
            />
          </div>
          <Table className="max-h-[520px] overflow-y-auto">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>{t('field.assetCode')}</Th>
                <Th>{t('field.assetName')}</Th>
                <Th>{t('field.subcategory')}</Th>
                <Th right>{t('field.quantity')}</Th>
                <Th right>{t('field.cost')}</Th>
                <Th right>{t('field.accumDep')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.rowNo}>
                  <Td className="text-ink-4">{r.rowNo}</Td>
                  <Td mono>{r.code}</Td>
                  <Td className="max-w-[320px] truncate text-ink">{r.name}</Td>
                  <Td className="whitespace-nowrap">{r.sub}</Td>
                  <Td right>{r.qty}</Td>
                  <Td right>{money(r.cost || 0)}</Td>
                  <Td right>{money(r.accumEnd)}</Td>
                  <Td>
                    {r.errors.length ? (
                      <Badge tone="red">{r.errors.join(' · ')}</Badge>
                    ) : r.duplicate ? (
                      <Badge tone="violet">{t('imp.dupCode')}</Badge>
                    ) : (
                      <Badge tone="green">{t('imp.valid')}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
