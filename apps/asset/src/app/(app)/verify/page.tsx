'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Lock, ArrowLeft, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import type { VerifyResult } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select, Table, Td, Th, cx } from '@/components/ui';

const RESULTS: VerifyResult[] = ['FOUND', 'WRONG_LOCATION', 'DAMAGED', 'NOT_FOUND'];
const RESULT_TONE: Record<VerifyResult, 'green' | 'amber' | 'red' | 'gray' | 'violet'> = {
  FOUND: 'green', WRONG_LOCATION: 'amber', DAMAGED: 'red', NOT_FOUND: 'red', UNKNOWN: 'violet',
};
const EXCLUDE = ['ARCHIVED', 'DISPOSED', 'CANDIDATE'];

export default function VerifyPage() {
  const { t, date, L } = useI18n();
  const { state, can, createCampaign, closeCampaign, recordVerify } = useStore();
  const lk = useLookups();
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [q, setQ] = useState('');
  void L;

  const campaign = state.verifyCampaigns.find((c) => c.id === sel);
  const liveAssets = useMemo(() => state.assets.filter((a) => !EXCLUDE.includes(a.status)), [state.assets]);

  const progressOf = (cid: string) => {
    const recs = state.verifyRecords.filter((r) => r.campaignId === cid);
    return { done: recs.length, total: liveAssets.length };
  };

  if (!campaign) {
    return (
      <>
        <PageHeader title={t('verify.title')} sub={t('verify.subtitle')} />
        {can('runDep') && (
          <Card className="mb-4 p-3">
            <div className="flex items-center gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('verify.namePlaceholder')} className="max-w-sm" />
              <Button variant="primary" icon={<Plus size={15} />} disabled={!newName.trim()} onClick={() => { const id = createCampaign(newName.trim()); setNewName(''); setSel(id); }}>
                {t('verify.newCampaign')}
              </Button>
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title={t('verify.campaigns')} />
          {state.verifyCampaigns.length === 0 ? (
            <Empty>{t('common.noData')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('verify.name')}</Th>
                  <Th>{t('verify.startDate')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th right>{t('verify.progress')}</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {state.verifyCampaigns.map((c) => {
                  const p = progressOf(c.id);
                  return (
                    <tr key={c.id}>
                      <Td className="font-medium text-ink">{c.name}</Td>
                      <Td className="whitespace-nowrap">{date(c.startDate)}</Td>
                      <Td><Badge tone={c.status === 'OPEN' ? 'blue' : 'gray'} dot>{t(`verify.${c.status}`)}</Badge></Td>
                      <Td right className="tabular-nums">{p.done}/{p.total}</Td>
                      <Td right><Button size="sm" onClick={() => setSel(c.id)}>{t('common.open')}</Button></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </>
    );
  }

  const recMap = new Map(state.verifyRecords.filter((r) => r.campaignId === campaign.id).map((r) => [r.assetId, r]));
  const summary = { FOUND: 0, WRONG_LOCATION: 0, DAMAGED: 0, NOT_FOUND: 0, UNKNOWN: 0 } as Record<VerifyResult, number>;
  for (const r of recMap.values()) summary[r.result]++;
  const unverified = liveAssets.length - recMap.size;
  const readOnly = campaign.status === 'CLOSED' || !can('runDep');

  const filtered = liveAssets.filter((a) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return a.code.toLowerCase().includes(s) || a.nameTh.toLowerCase().includes(s) || (a.serialNumber ?? '').toLowerCase().includes(s);
  });

  return (
    <>
      <PageHeader
        title={campaign.name}
        sub={`${t('verify.startDate')}: ${date(campaign.startDate)}`}
        actions={
          <>
            <Button icon={<ArrowLeft size={15} />} onClick={() => setSel(null)}>{t('common.back')}</Button>
            {campaign.status === 'OPEN' && can('runDep') && (
              <Button variant="primary" icon={<Lock size={15} />} onClick={() => closeCampaign(campaign.id)}>{t('verify.close')}</Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {([['found', summary.FOUND, 'text-emerald-700'], ['wrong', summary.WRONG_LOCATION, 'text-amber-700'], ['damaged', summary.DAMAGED, 'text-rose-700'], ['notfound', summary.NOT_FOUND, 'text-rose-700'], ['verified', recMap.size, 'text-ink'], ['unverified', unverified, 'text-ink-3']] as const).map(([k, n, cls]) => (
          <Card key={k} className="p-3">
            <div className={cx('text-[22px] font-bold tabular-nums', cls)}>{n}</div>
            <div className="text-[12px] text-ink-3">{t(`verify.sum.${k}`)}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title={t('verify.assets')} actions={
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="h-8 w-56 pl-8" />
          </div>
        } />
        {filtered.length === 0 ? (
          <Empty>{t('common.noData')}</Empty>
        ) : (
          <Table className="max-h-[640px] overflow-y-auto">
            <thead>
              <tr>
                <Th>{t('field.assetCode')}</Th>
                <Th>{t('field.assetName')}</Th>
                <Th>{t('verify.expectedLocation')}</Th>
                <Th>{t('verify.result')}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((a) => {
                const rec = recMap.get(a.id);
                return (
                  <tr key={a.id}>
                    <Td mono><Link href={`/assets/${a.id}`} className="text-brand-700 hover:underline">{a.code}</Link></Td>
                    <Td className="max-w-[260px] truncate text-ink">{lk.assetName(a)}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{lk.locationPath(a.locationId) || '—'}</Td>
                    <Td>
                      {readOnly ? (
                        rec ? <Badge tone={RESULT_TONE[rec.result]} dot>{t(`verify.${rec.result}`)}</Badge> : <span className="text-ink-4">—</span>
                      ) : (
                        <Select
                          value={rec?.result ?? ''}
                          onChange={(e) => e.target.value && recordVerify(campaign.id, a.id, e.target.value as VerifyResult)}
                          className={cx('h-8 w-44 text-[12.5px]', !rec && 'text-ink-4')}
                        >
                          <option value="">{t('verify.markResult')}</option>
                          {RESULTS.map((r) => <option key={r} value={r}>{t(`verify.${r}`)}</option>)}
                        </Select>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
