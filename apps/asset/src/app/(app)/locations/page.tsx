'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building, Building2, MapPin, MapPinOff, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups, useValuations } from '@/lib/hooks';
import type { Location } from '@/lib/types';
import { AssetStatusBadge } from '@/components/badges';
import { Button, Card, CardHeader, Drawer, Empty, FormField, Input, Notice, PageHeader, Select, Table, Td, Th, cx } from '@/components/ui';

export default function LocationsPage() {
  const { t, L, money, num } = useI18n();
  const { state, can, upsertMaster } = useStore();
  const lk = useLookups();
  const vals = useValuations();
  const [sel, setSel] = useState<string>(state.locations[0]?.id ?? '__none');
  const [edit, setEdit] = useState<Location | null>(null);
  const live = state.assets.filter((a) => !['ARCHIVED', 'DISPOSED', 'CANDIDATE'].includes(a.status));

  const stat = useMemo(() => {
    const m = new Map<string, { n: number; cost: number }>();
    for (const a of live) {
      for (const k of [a.locationId ?? '__none', `B:${a.branchId}`]) {
        const s = m.get(k) ?? { n: 0, cost: 0 };
        s.n++;
        s.cost += vals.get(a.id)!.cost;
        m.set(k, s);
      }
    }
    return m;
  }, [live, vals]);

  const assets = live.filter((a) => (sel === '__none' ? !a.locationId : a.locationId === sel));
  const loc = state.locations.find((l) => l.id === sel);

  return (
    <>
      <PageHeader
        title={t('loc.title')}
        sub={t('loc.subtitle')}
        actions={
          can('manageUsers') && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({ id: `L-${Date.now().toString(36)}`, code: '', companyId: state.companies[0].id, branchId: state.branches[0].id, building: '', floor: '', room: '', name: { th: '', en: '', zh: '' }, active: true })}>
              {t('loc.newLocation')}
            </Button>
          )
        }
      />
      <div className="mb-4"><Notice tone="gray">{t('settings.demoMasters')}</Notice></div>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title={t('loc.hierarchy')} />
          <div className="py-1.5">
            {state.companies.map((c) => (
              <div key={c.id}>
                <div className="flex items-center gap-2 px-3 py-2 text-[13.5px] font-semibold text-ink">
                  <Building2 size={15} className="text-ink-3" /> {L(c.name)}
                </div>
                {state.branches.filter((b) => b.companyId === c.id).map((b) => (
                  <div key={b.id}>
                    <div className="flex items-center gap-2 py-1.5 pl-7 pr-3 text-[13px] font-medium text-ink-2">
                      <Building size={14} className="text-ink-4" />
                      <span className="flex-1">{L(b.name)}</span>
                      <span className="text-[12px] tabular-nums text-ink-3">{stat.get(`B:${b.id}`)?.n ?? 0}</span>
                    </div>
                    {state.locations.filter((l) => l.branchId === b.id).map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setSel(l.id)}
                        className={cx('flex w-full items-center gap-2 py-1.5 pl-12 pr-3 text-left text-[13px]', sel === l.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-canvas')}
                      >
                        <MapPin size={13} className="shrink-0 text-ink-4" />
                        <span className="flex-1 truncate">
                          <span className="font-mono text-[12px] text-ink-3">{l.code}</span> · {l.room}
                        </span>
                        <span className="text-[12px] tabular-nums text-ink-3">{stat.get(l.id)?.n ?? 0}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            <button
              onClick={() => setSel('__none')}
              className={cx('mt-1 flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[13px]', sel === '__none' ? 'bg-amber-50 font-medium text-amber-800' : 'text-amber-700 hover:bg-canvas')}
            >
              <MapPinOff size={14} /> <span className="flex-1">{t('loc.unassigned')}</span>
              <span className="tabular-nums">{stat.get('__none')?.n ?? 0}</span>
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={loc ? `${loc.code} · ${L(loc.name)}` : t('loc.unassigned')}
            sub={loc ? `${lk.company(loc.companyId)} / ${lk.branch(loc.branchId)} / ${t('field.building')} ${loc.building} / ${t('field.floor')} ${loc.floor} / ${loc.room}` : undefined}
            actions={
              <>
                <span className="text-[12.5px] text-ink-3">{num(assets.length)} · {money(assets.reduce((s, a) => s + vals.get(a.id)!.cost, 0), 0)} {t('common.thb')}</span>
                {loc && can('manageUsers') && <Button size="sm" onClick={() => setEdit(loc)}>{t('common.edit')}</Button>}
              </>
            }
          />
          {assets.length === 0 ? (
            <Empty>{t('common.noData')}</Empty>
          ) : (
            <Table className="max-h-[640px] overflow-y-auto">
              <thead>
                <tr>
                  <Th>{t('field.assetCode')}</Th>
                  <Th>{t('field.assetName')}</Th>
                  <Th>{t('field.department')}</Th>
                  <Th right>{t('field.quantity')}</Th>
                  <Th right>{t('field.nbv')}</Th>
                  <Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <Td mono><Link href={`/assets/${a.id}`} className="text-brand-700 hover:underline">{a.code}</Link></Td>
                    <Td className="max-w-[320px] truncate text-ink">{lk.assetName(a)}</Td>
                    <Td className="whitespace-nowrap">{lk.department(a.departmentId)}</Td>
                    <Td right>{a.quantity}</Td>
                    <Td right>{money(vals.get(a.id)!.nbv)}</Td>
                    <Td><AssetStatusBadge status={a.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {edit && (
        <Drawer
          open
          onClose={() => setEdit(null)}
          title={edit.code || t('loc.newLocation')}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={!edit.code || !edit.name.th} onClick={() => { upsertMaster('locations', edit); setSel(edit.id); setEdit(null); }}>{t('common.save')}</Button>
            </>
          }
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <FormField label={t('field.code')} required><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="font-mono" /></FormField>
            <FormField label={t('field.branch')} required>
              <Select value={edit.branchId} onChange={(e) => setEdit({ ...edit, branchId: e.target.value })}>
                {state.branches.map((b) => <option key={b.id} value={b.id}>{L(b.name)}</option>)}
              </Select>
            </FormField>
            <FormField label={t('field.building')}><Input value={edit.building} onChange={(e) => setEdit({ ...edit, building: e.target.value })} /></FormField>
            <FormField label={t('field.floor')}><Input value={edit.floor} onChange={(e) => setEdit({ ...edit, floor: e.target.value })} /></FormField>
            <FormField label={t('field.room')}><Input value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></FormField>
            <FormField label={`${t('field.name')} (TH)`} required><Input value={edit.name.th} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, th: e.target.value } })} /></FormField>
            <FormField label={`${t('field.name')} (EN)`}><Input value={edit.name.en} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, en: e.target.value } })} /></FormField>
            <FormField label={`${t('field.name')} (中文)`}><Input value={edit.name.zh} onChange={(e) => setEdit({ ...edit, name: { ...edit.name, zh: e.target.value } })} /></FormField>
          </div>
        </Drawer>
      )}
    </>
  );
}
