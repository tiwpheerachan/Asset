'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, FolderOpen, FolderTree, Info, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups, useValuations } from '@/lib/hooks';
import type { Category } from '@/lib/types';
import { UNITS, LEGAL_DEPRECIATION, LEGAL_DEPRECIATION_SOURCE, LEGAL_DEPRECIATION_UPDATED, SETTINGS } from '@/data/masters';
import { Badge, Button, Card, CardHeader, FormField, Input, Notice, PageHeader, Select, Toggle, cx } from '@/components/ui';

export default function CategoriesPage() {
  const { t, L, money, num } = useI18n();
  const { state, can, upsertMaster, accounts } = useStore();
  const vals = useValuations();
  const lk = useLookups();
  const roots = state.categories.filter((c) => !c.parentId);
  const [selId, setSelId] = useState(state.categories[1]?.id ?? roots[0]?.id);
  const sel = state.categories.find((c) => c.id === selId);
  const [draft, setDraft] = useState<Category | null>(null);
  const editCat = can('editCategory');
  const editGl = can('editGl');

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; cost: number; nbv: number }>();
    for (const a of state.assets) {
      if (['DISPOSED', 'ARCHIVED', 'CANDIDATE'].includes(a.status)) continue;
      const v = vals.get(a.id)!;
      for (const k of [a.categoryId, a.subcategoryId]) {
        const s = m.get(k) ?? { count: 0, cost: 0, nbv: 0 };
        s.count++;
        s.cost += v.cost;
        s.nbv += v.nbv;
        m.set(k, s);
      }
    }
    return m;
  }, [state.assets, vals]);

  const cur = draft ?? sel;
  const set = <K extends keyof Category>(k: K, v: Category[K]) => setDraft((d) => ({ ...(d ?? sel!), [k]: v }));
  const startNew = (parentId: string | null) => {
    const parent = state.categories.find((c) => c.id === parentId);
    setDraft({
      id: `CAT-${Date.now().toString(36)}`,
      code: '',
      parentId,
      name: { th: '', en: '', zh: '' },
      defaultUnit: parent?.defaultUnit ?? 'unit',
      defaultLifeYears: parent?.defaultLifeYears ?? 5,
      defaultResidual: parent?.defaultResidual ?? 1,
      method: 'SL',
      assetAccount: parent?.assetAccount ?? '',
      expenseAccount: parent?.expenseAccount ?? '',
      accumAccount: parent?.accumAccount ?? '',
      active: true,
    });
  };
  const isNew = draft && !state.categories.some((c) => c.id === draft.id);
  const st = cur ? stats.get(cur.id) : undefined;
  const acc = (kind: 'ASSET' | 'EXPENSE' | 'ACCUM') => accounts.filter((a) => a.kind === kind);

  return (
    <>
      <PageHeader
        title={t('categories.title')}
        sub={t('categories.subtitle')}
        actions={editCat && <Button variant="primary" icon={<Plus size={15} />} onClick={() => startNew(null)}>{t('categories.newCategory')}</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title={t('categories.tree')} />
          <ul className="py-1.5">
            {roots.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => { setSelId(r.id); setDraft(null); }}
                  className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] font-semibold', selId === r.id && !draft ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-canvas')}
                >
                  <FolderTree size={15} className="shrink-0 text-ink-3" />
                  <span className="flex-1 truncate">{L(r.name)}</span>
                  <span className="text-[12px] font-normal tabular-nums text-ink-3">{stats.get(r.id)?.count ?? 0}</span>
                </button>
                <ul>
                  {state.categories.filter((c) => c.parentId === r.id).map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => { setSelId(s.id); setDraft(null); }}
                        className={cx('flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left text-[13px]', selId === s.id && !draft ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-canvas')}
                      >
                        <ChevronRight size={13} className="shrink-0 text-ink-4" />
                        <span className="flex-1 truncate">{L(s.name)}</span>
                        {!s.active && <Badge>{t('common.inactive')}</Badge>}
                        <span className="text-[12px] tabular-nums text-ink-3">{stats.get(s.id)?.count ?? 0}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        {cur && (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <FolderOpen size={16} className="text-brand-600" />
                  {isNew ? (cur.parentId ? t('categories.newSub') : t('categories.newCategory')) : L(cur.name)}
                  <Badge tone={cur.parentId ? 'blue' : 'violet'}>{cur.parentId ? t('categories.level2') : t('categories.level1')}</Badge>
                </span>
              }
              sub={cur.parentId ? `${t('field.parent')}: ${lk.category(cur.parentId)}` : undefined}
              actions={
                <>
                  {!cur.parentId && editCat && !isNew && <Button size="sm" icon={<Plus size={14} />} onClick={() => startNew(cur.id)}>{t('categories.newSub')}</Button>}
                  {!isNew && (
                    <Link href={`/assets`} className="text-[13px] text-brand-600 hover:underline">{t('categories.assetsIn')}: {num(st?.count ?? 0)}</Link>
                  )}
                </>
              }
            />
            <div className="space-y-6 p-4">
              {!isNew && (
                <div className="grid grid-cols-3 gap-2">
                  {[[t('common.count'), num(st?.count ?? 0)], [t('field.cost'), money(st?.cost ?? 0, 0)], [t('field.nbv'), money(st?.nbv ?? 0, 0)]].map(([l, v]) => (
                    <div key={l} className="rounded-md border border-line px-3 py-2">
                      <div className="text-[11.5px] text-ink-3">{l}</div>
                      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{v}</div>
                    </div>
                  ))}
                </div>
              )}

              <section>
                <h3 className="mb-3 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('detail.general')}</h3>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label={t('field.code')} required><Input value={cur.code} disabled={!editCat} onChange={(e) => set('code', e.target.value)} className="font-mono" /></FormField>
                  <FormField label={`${t('field.name')} (TH)`} required><Input value={cur.name.th} disabled={!editCat} onChange={(e) => set('name', { ...cur.name, th: e.target.value })} /></FormField>
                  <FormField label={`${t('field.name')} (EN)`}><Input value={cur.name.en} disabled={!editCat} onChange={(e) => set('name', { ...cur.name, en: e.target.value })} /></FormField>
                  <FormField label={`${t('field.name')} (中文)`}><Input value={cur.name.zh} disabled={!editCat} onChange={(e) => set('name', { ...cur.name, zh: e.target.value })} /></FormField>
                  <FormField label={t('field.parent')}>
                    <Select value={cur.parentId ?? ''} disabled={!editCat} onChange={(e) => set('parentId', e.target.value || null)}>
                      <option value="">—</option>
                      {roots.filter((r) => r.id !== cur.id).map((r) => <option key={r.id} value={r.id}>{L(r.name)}</option>)}
                    </Select>
                  </FormField>
                  <FormField label={t('common.status')}>
                    <div className="flex h-9 items-center gap-2"><Toggle checked={cur.active} disabled={!editCat} onChange={(v) => set('active', v)} /><span className="text-[13px] text-ink-2">{cur.active ? t('common.active') : t('common.inactive')}</span></div>
                  </FormField>
                </div>
              </section>

              <section>
                <h3 className="mb-3 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('categories.defaults')}</h3>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField label={t('field.defaultUnit')}>
                    <Select value={cur.defaultUnit} disabled={!editCat} onChange={(e) => set('defaultUnit', e.target.value)}>
                      {Object.keys(UNITS).map((u) => <option key={u} value={u}>{L(UNITS[u])}</option>)}
                    </Select>
                  </FormField>
                  <FormField label={`${t('field.defaultLife')} (${t('common.years')})`}><Input type="number" min={1} value={cur.defaultLifeYears} disabled={!editCat} onChange={(e) => set('defaultLifeYears', Number(e.target.value))} /></FormField>
                  <FormField label={`${t('field.defaultResidual')} (${t('common.thb')})`}><Input type="number" min={0} value={cur.defaultResidual} disabled={!editCat} onChange={(e) => set('defaultResidual', Number(e.target.value))} /></FormField>
                  <FormField label={t('field.method')}>
                    <Select value={cur.method} disabled={!editCat} onChange={(e) => set('method', e.target.value as Category['method'])}>
                      <option value="SL">{t('method.SL')}</option>
                      <option value="DB" disabled>{t('method.DB')} (Phase 2)</option>
                      <option value="UOP" disabled>{t('method.UOP')} (Phase 2)</option>
                    </Select>
                  </FormField>
                </div>
                {/* Knowledge: อ้างอิงกฎหมายค่าเสื่อม — ให้บัญชีอ่านประกอบตอนแก้อายุ */}
                <div className="mt-4 rounded-md border border-line bg-canvas p-3.5">
                  <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink-2">
                    <Info size={14} className="text-brand-600" />
                    อ้างอิงกฎหมายค่าเสื่อมราคา (Knowledge) — บัญชีปรับอายุด้านบนได้ ค่านี้เป็นเพียงข้อมูลแนะนำ
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-ink-3">
                          <th className="py-1 pr-3 font-medium">ประเภททรัพย์สิน</th>
                          <th className="py-1 pr-3 font-medium">อายุขั้นต่ำ (ปี)</th>
                          <th className="py-1 pr-3 font-medium">อัตราสูงสุด/ปี</th>
                          <th className="py-1 font-medium">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LEGAL_DEPRECIATION.map((r) => (
                          <tr key={r.key} className="border-t border-line align-top">
                            <td className="py-1.5 pr-3 text-ink">{L(r.asset)}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{r.minYears ?? '—'}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{r.maxRatePct != null ? `${r.maxRatePct}%` : '—'}</td>
                            <td className="py-1.5 text-ink-3">{L(r.note)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2.5 text-[11.5px] text-ink-4">
                    เกณฑ์เข้าทรัพย์สิน (capitalization): ราคา ≥ {money(SETTINGS.capitalizationThreshold)} · ต่ำกว่านี้ลงเป็นค่าใช้จ่าย<br />
                    ที่มา: {LEGAL_DEPRECIATION_SOURCE} · อัปเดต {LEGAL_DEPRECIATION_UPDATED} · <b>ควรให้ผู้สอบบัญชียืนยันก่อนตั้งค่าจริง</b>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 border-b border-line pb-2 text-[13.5px] font-semibold text-ink">{t('categories.mapping')}</h3>
                <div className="grid gap-3.5 lg:grid-cols-3">
                  {([['assetAccount', 'ASSET'], ['expenseAccount', 'EXPENSE'], ['accumAccount', 'ACCUM']] as const).map(([k, kind]) => (
                    <FormField key={k} label={t(`field.${k}`)} required>
                      <Select value={lk.accountId(cur[k])} disabled={!editGl} onChange={(e) => set(k, e.target.value)} className="font-mono text-[12.5px]">
                        <option value="">—</option>
                        {acc(kind).map((a) => <option key={a.id} value={a.id}>{a.code} — {L(a.name)}</option>)}
                      </Select>
                    </FormField>
                  ))}
                </div>
                <div className="mt-3"><Notice tone="gray" icon={<Info size={14} />}>{t('categories.glNote')}</Notice></div>
              </section>

              {(editCat || editGl) && (
                <div className="flex justify-end gap-2 border-t border-line pt-3">
                  {draft && <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>}
                  <Button
                    variant="primary"
                    disabled={!draft || !draft.code || !draft.name.th}
                    onClick={() => {
                      upsertMaster('categories', draft!);
                      setSelId(draft!.id);
                      setDraft(null);
                    }}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
