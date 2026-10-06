'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Lock, Search, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { exportXlsx } from '@/lib/excel';
import { Badge, Button, Card, Empty, Input, Notice, PageHeader, Select, Table, Td, Th } from '@/components/ui';

export default function AuditPage() {
  const { t, dateTime, num } = useI18n();
  const { state, can } = useStore();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [source, setSource] = useState('');
  const [user, setUser] = useState('');
  const actions = useMemo(() => [...new Set(state.audit.map((a) => a.action))].sort(), [state.audit]);
  const users = useMemo(() => [...new Set(state.audit.map((a) => a.user))].sort(), [state.audit]);
  const codeToId = useMemo(() => new Map(state.assets.map((a) => [a.code, a.id])), [state.assets]);

  const rows = state.audit.filter((a) => {
    if (action && a.action !== action) return false;
    if (source && a.source !== source) return false;
    if (user && a.user !== user) return false;
    if (q) {
      const hay = `${a.assetCode ?? ''} ${a.field ?? ''} ${a.oldValue ?? ''} ${a.newValue ?? ''} ${a.reason ?? ''} ${a.entity}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        sub={t('audit.subtitle')}
        actions={
          <Button
            icon={<Download size={15} />}
            disabled={!can('exportReport')}
            onClick={() =>
              exportXlsx('Audit_Log', [
                { name: 'audit', rows: rows.map((a) => ({ [t('audit.at')]: a.at, [t('audit.user')]: a.user, Role: a.role, [t('audit.action')]: a.action, [t('field.assetCode')]: a.assetCode ?? '', [t('audit.entity')]: a.entity, [t('audit.field')]: a.field ?? '', [t('audit.old')]: a.oldValue ?? '', [t('audit.new')]: a.newValue ?? '', [t('common.reason')]: a.reason ?? '', [t('audit.source')]: a.source })) },
              ])
            }
          >
            {t('common.exportExcel')}
          </Button>
        }
      />
      <div className="mb-4">
        <Notice tone="gray" icon={<ShieldCheck size={15} />}>
          <b className="font-semibold">{t('audit.immutable')}.</b> {t('audit.retention')}
        </Notice>
      </div>
      <Card>
        <div className="grid gap-2 border-b border-line p-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('field.assetCode')} / ${t('audit.field')} / ${t('common.reason')}`} className="pl-8" />
          </div>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('audit.action')}: {t('common.all')}</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">{t('audit.user')}: {t('common.all')}</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t('audit.source')}: {t('common.all')}</option>
            {['UI', 'OA_SYNC', 'EXCEL_IMPORT', 'SYSTEM'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {rows.length === 0 ? (
          <Empty>{t('common.noData')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('audit.at')}</Th>
                <Th>{t('audit.user')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('field.assetCode')}</Th>
                <Th>{t('audit.field')}</Th>
                <Th>{t('audit.old')}</Th>
                <Th>{t('audit.new')}</Th>
                <Th>{t('common.reason')}</Th>
                <Th>{t('audit.source')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{dateTime(a.at)}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="text-ink">{a.user}</span>
                    <div className="text-[11.5px] text-ink-4">{a.role === 'SYSTEM' ? 'SYSTEM' : t(`role.${a.role}`)}</div>
                  </Td>
                  <Td><span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{a.action}</span></Td>
                  <Td mono>{a.assetCode ? codeToId.has(a.assetCode) ? <Link href={`/assets/${codeToId.get(a.assetCode)}`} className="text-brand-700 hover:underline">{a.assetCode}</Link> : a.assetCode : <span className="text-ink-4">{a.entity}</span>}</Td>
                  <Td mono>{a.field ?? '—'}</Td>
                  <Td className="max-w-[160px] truncate text-red-700/80">{a.oldValue ?? '—'}</Td>
                  <Td className="max-w-[220px] truncate text-emerald-800">{a.newValue ?? '—'}</Td>
                  <Td className="max-w-[240px] truncate">{a.reason ?? '—'}</Td>
                  <Td><Badge tone={a.source === 'UI' ? 'gray' : a.source === 'OA_SYNC' ? 'blue' : 'violet'}>{a.source}</Badge></Td>
                  <Td><Lock size={12} className="text-ink-4" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="px-3 py-2.5 text-[12.5px] text-ink-3">{num(rows.length)} {t('common.rows')}</div>
      </Card>
    </>
  );
}
