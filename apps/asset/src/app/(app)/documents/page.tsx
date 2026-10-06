'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FileText, ImageIcon, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import type { DocType } from '@/lib/types';
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Table, Td, Th, cx } from '@/components/ui';

const TYPES: DocType[] = ['OA_APPROVAL', 'PO', 'GR', 'INVOICE', 'TAX_INVOICE', 'WARRANTY', 'CONTRACT', 'ACCEPTANCE', 'PHOTO', 'OTHER'];

export default function DocumentsPage() {
  const { t, date, num } = useI18n();
  const { state } = useStore();
  const lk = useLookups();
  const [type, setType] = useState<DocType | ''>('');
  const [src, setSrc] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const assetById = useMemo(() => new Map(state.assets.map((a) => [a.id, a])), [state.assets]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of state.documents) m[d.type] = (m[d.type] ?? 0) + 1;
    return m;
  }, [state.documents]);

  const rows = state.documents.filter((d) => {
    if (type && d.type !== type) return false;
    if (src && d.sourceSystem !== src) return false;
    if (q) {
      const a = d.assetId ? assetById.get(d.assetId) : undefined;
      const hay = `${d.fileName} ${d.sourceDocNo} ${a?.code ?? ''} ${a?.nameTh ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader title={t('docs.title')} sub={t('docs.subtitle')} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button onClick={() => setType('')} className={cx('rounded-full border px-2.5 py-1 text-[12px]', !type ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-line bg-white text-ink-3')}>
          {t('common.all')} <span className="opacity-70">{state.documents.length}</span>
        </button>
        {TYPES.map((ty) => (
          <button key={ty} onClick={() => setType(ty)} className={cx('rounded-full border px-2.5 py-1 text-[12px]', type === ty ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-line bg-white text-ink-3 hover:text-ink')}>
            {t(`docType.${ty}`)} <span className="opacity-70">{counts[ty] ?? 0}</span>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('docs.fileName')} / ${t('docs.sourceDoc')} / ${t('field.assetCode')}`} className="pl-8" />
          </div>
          <Select value={src} onChange={(e) => setSrc(e.target.value)} className="w-48">
            <option value="">{t('docs.sourceSystem')}: {t('common.all')}</option>
            <option value="OA">OA</option>
            <option value="FA">Fixed Asset</option>
            <option value="LEGACY">Legacy</option>
          </Select>
        </div>
        {rows.length === 0 ? (
          <Empty>{t('common.noData')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('docs.fileName')}</Th>
                <Th>{t('docs.type')}</Th>
                <Th>{t('docs.asset')}</Th>
                <Th>{t('docs.sourceSystem')}</Th>
                <Th>{t('docs.sourceDoc')}</Th>
                <Th>{t('docs.uploadedBy')}</Th>
                <Th>{t('docs.uploadedAt')}</Th>
                <Th right>{t('docs.size')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((d) => {
                const a = d.assetId ? assetById.get(d.assetId) : undefined;
                return (
                  <tr key={d.id}>
                    <Td className="text-ink"><span className="inline-flex items-center gap-1.5">{d.type === 'PHOTO' ? <ImageIcon size={14} className="text-ink-4" /> : <FileText size={14} className="text-ink-4" />}{d.fileName}</span></Td>
                    <Td><Badge tone={d.type === 'PHOTO' ? 'teal' : 'blue'}>{t(`docType.${d.type}`)}</Badge></Td>
                    <Td className="whitespace-nowrap">
                      {a ? (
                        <Link href={`/assets/${a.id}`} className="hover:underline">
                          <span className="font-mono text-[12.5px] text-brand-700">{a.code}</span>
                          <span className="ml-1.5 text-ink-3">{lk.assetName(a).slice(0, 28)}</span>
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td>{d.sourceSystem}</Td>
                    <Td mono>{d.sourceDocNo || '—'}</Td>
                    <Td className="whitespace-nowrap">{d.uploadedBy}</Td>
                    <Td className="whitespace-nowrap">{date(d.uploadedAt)}</Td>
                    <Td right>{num(d.sizeKb)} KB</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {rows.length > limit && (
          <div className="flex justify-center p-3">
            <Button size="sm" onClick={() => setLimit((l) => l + 100)}>+100 ({num(rows.length - limit)})</Button>
          </div>
        )}
      </Card>
    </>
  );
}
