'use client';

import { useState } from 'react';
import { Check, Info, Minus, Pencil, Plug, Plus, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { TODAY, useStore } from '@/lib/store';
import { MATRIX, ROLES, type Permission } from '@/lib/rbac';
import type { Localized, Role } from '@/lib/types';
import { Badge, Button, Card, Drawer, FormField, Input, Notice, PageHeader, Select, Table, Tabs, Td, Th, Toggle } from '@/components/ui';

type Tab = 'company' | 'branch' | 'department' | 'costCenter' | 'running' | 'oa' | 'users' | 'permissions';
type MasterKey = 'companies' | 'branches' | 'departments' | 'costCenters' | 'users';

interface FieldDef {
  k: string;
  l: string;
  type?: 'text' | 'localized' | 'select' | 'bool';
  opts?: { v: string; l: string }[];
  mono?: boolean;
}

export default function SettingsPage() {
  const { t, L } = useI18n();
  const { state, can } = useStore();
  const [tab, setTab] = useState<Tab>('company');
  const admin = can('manageUsers');

  const compOpts = state.companies.map((c) => ({ v: c.id, l: L(c.name) }));
  const deptOpts = state.departments.map((d) => ({ v: d.id, l: L(d.name) }));
  const nameF: FieldDef = { k: 'name', l: t('field.name'), type: 'localized' };
  const codeF: FieldDef = { k: 'code', l: t('field.code'), mono: true };
  const activeF: FieldDef = { k: 'active', l: t('common.status'), type: 'bool' };

  const masters: Partial<Record<Tab, { key: MasterKey; fields: FieldDef[]; blank: () => Record<string, unknown> }>> = {
    company: { key: 'companies', fields: [codeF, nameF, { k: 'taxId', l: t('field.taxId'), mono: true }, activeF], blank: () => ({ id: `C-${Date.now().toString(36)}`, code: '', name: { th: '', en: '', zh: '' }, taxId: '', active: true }) },
    branch: { key: 'branches', fields: [codeF, nameF, { k: 'companyId', l: t('field.company'), type: 'select', opts: compOpts }, { k: 'address', l: t('field.address') }, activeF], blank: () => ({ id: `B-${Date.now().toString(36)}`, code: '', companyId: state.companies[0].id, name: { th: '', en: '', zh: '' }, address: '', active: true }) },
    department: { key: 'departments', fields: [codeF, nameF, activeF], blank: () => ({ id: `D-${Date.now().toString(36)}`, code: '', name: { th: '', en: '', zh: '' }, active: true }) },
    costCenter: { key: 'costCenters', fields: [codeF, nameF, { k: 'departmentId', l: t('field.department'), type: 'select', opts: deptOpts }, activeF], blank: () => ({ id: `CC-${Date.now().toString(36)}`, code: '', departmentId: state.departments[0].id, name: { th: '', en: '', zh: '' }, active: true }) },
    users: {
      key: 'users',
      fields: [{ k: 'name', l: t('field.name') }, { k: 'email', l: t('field.email'), mono: true }, { k: 'role', l: t('field.role'), type: 'select', opts: ROLES.map((r) => ({ v: r, l: t(`role.${r}`) })) }, activeF],
      blank: () => ({ id: `U-${Date.now().toString(36)}`, name: '', email: '', role: 'AUDITOR', active: true }),
    },
  };

  return (
    <>
      <PageHeader title={t('settings.title')} sub={t('settings.subtitle')} />
      {!admin && <div className="mb-4"><Notice tone="gray" icon={<ShieldAlert size={15} />}>{t('settings.adminOnly')}</Notice></div>}
      <Card>
        <div className="px-2">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'company', label: t('settings.company') },
              { id: 'branch', label: t('settings.branch') },
              { id: 'department', label: t('settings.department') },
              { id: 'costCenter', label: t('settings.costCenter') },
              { id: 'running', label: t('settings.running') },
              { id: 'oa', label: t('settings.oa') },
              { id: 'users', label: t('settings.users') },
              { id: 'permissions', label: t('settings.permissions') },
            ]}
          />
        </div>
        <div className="p-4">
          {masters[tab] && <MasterTable key={tab} cfg={masters[tab]!} editable={admin} />}
          {tab === 'running' && <RunningTab editable={admin} />}
          {tab === 'oa' && <OATab editable={admin} />}
          {tab === 'permissions' && <PermissionTab />}
        </div>
      </Card>
    </>
  );
}

function MasterTable({ cfg, editable }: { cfg: { key: MasterKey; fields: FieldDef[]; blank: () => Record<string, unknown> }; editable: boolean }) {
  const { t, L } = useI18n();
  const { state, upsertMaster } = useStore();
  const list = state[cfg.key] as unknown as Record<string, unknown>[];
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const show = (f: FieldDef, v: unknown) => {
    if (f.type === 'localized') return L(v as Localized);
    if (f.type === 'bool') return v ? <Badge tone="green" dot>{t('common.active')}</Badge> : <Badge dot>{t('common.inactive')}</Badge>;
    if (f.type === 'select') return f.opts?.find((o) => o.v === v)?.l ?? String(v ?? '');
    return String(v ?? '') || '—';
  };
  return (
    <>
      {cfg.key !== 'companies' && cfg.key !== 'users' && <div className="mb-3"><Notice tone="amber" icon={<Info size={14} />}>{t('settings.demoMasters')}</Notice></div>}
      {editable && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEdit(cfg.blank())}>{t('common.add')}</Button>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            {cfg.fields.map((f) => <Th key={f.k}>{f.l}</Th>)}
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.id as string}>
              {cfg.fields.map((f) => (
                <Td key={f.k} mono={f.mono} className={f.type === 'localized' ? 'text-ink' : ''}>{show(f, row[f.k])}</Td>
              ))}
              <Td>{editable && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(row)} />}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {edit && (
        <Drawer
          open
          onClose={() => setEdit(null)}
          title={String(edit.code ?? edit.name ?? '') || t('common.add')}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => { upsertMaster(cfg.key, edit as never); setEdit(null); }}>{t('common.save')}</Button>
            </>
          }
        >
          <div className="grid gap-3.5">
            {cfg.fields.map((f) =>
              f.type === 'localized' ? (
                <div key={f.k} className="grid gap-3 sm:grid-cols-3">
                  {(['th', 'en', 'zh'] as const).map((lg) => (
                    <FormField key={lg} label={`${f.l} (${lg === 'zh' ? '中文' : lg.toUpperCase()})`} required={lg === 'th'}>
                      <Input value={(edit[f.k] as Localized)[lg]} onChange={(e) => setEdit({ ...edit, [f.k]: { ...(edit[f.k] as Localized), [lg]: e.target.value } })} />
                    </FormField>
                  ))}
                </div>
              ) : f.type === 'bool' ? (
                <FormField key={f.k} label={f.l}><Toggle checked={!!edit[f.k]} onChange={(v) => setEdit({ ...edit, [f.k]: v })} /></FormField>
              ) : f.type === 'select' ? (
                <FormField key={f.k} label={f.l}>
                  <Select value={String(edit[f.k] ?? '')} onChange={(e) => setEdit({ ...edit, [f.k]: e.target.value })}>
                    {f.opts?.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </Select>
                </FormField>
              ) : (
                <FormField key={f.k} label={f.l}><Input value={String(edit[f.k] ?? '')} onChange={(e) => setEdit({ ...edit, [f.k]: e.target.value })} className={f.mono ? 'font-mono' : ''} /></FormField>
              ),
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

function RunningTab({ editable }: { editable: boolean }) {
  const { t, L } = useI18n();
  const { state, updateRunning } = useStore();
  const [cfg, setCfg] = useState(state.running[0]);
  const [y, m, d] = TODAY.split('-');
  const preview = `${cfg.prefix}${cfg.includeYear ? y.slice(2) : ''}${cfg.includeMonth ? m : ''}${cfg.includeDay ? d : ''}${String(cfg.nextSeq).padStart(cfg.seqDigits, '0')}`;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <FormField label={t('field.company')}>
          <Select value={cfg.companyId} disabled>
            {state.companies.map((c) => <option key={c.id} value={c.id}>{L(c.name)}</option>)}
          </Select>
        </FormField>
        <FormField label={t('settings.prefix')}><Input value={cfg.prefix} disabled={!editable} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })} className="font-mono" /></FormField>
        {(['includeYear', 'includeMonth', 'includeDay'] as const).map((k) => (
          <FormField key={k} label={t(`settings.${k}`)}><Toggle checked={cfg[k]} disabled={!editable} onChange={(v) => setCfg({ ...cfg, [k]: v })} /></FormField>
        ))}
        <FormField label={t('settings.seqDigits')}><Input type="number" min={3} max={8} value={cfg.seqDigits} disabled={!editable} onChange={(e) => setCfg({ ...cfg, seqDigits: Number(e.target.value) })} /></FormField>
        <FormField label={t('settings.nextSeq')}><Input type="number" min={1} value={cfg.nextSeq} disabled={!editable} onChange={(e) => setCfg({ ...cfg, nextSeq: Number(e.target.value) })} /></FormField>
        {editable && <div className="sm:col-span-2"><Button variant="primary" onClick={() => updateRunning(cfg)}>{t('common.save')}</Button></div>}
      </div>
      <div className="rounded-lg border border-line bg-canvas/60 p-5">
        <div className="text-[12px] text-ink-3">{t('settings.preview')}</div>
        <div className="mt-1 font-mono text-[26px] font-semibold tracking-tight text-brand-700">{preview}</div>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[12px]">
          <Badge tone="blue">{cfg.prefix || 'PREFIX'}</Badge>
          {cfg.includeYear && <Badge>YY</Badge>}
          {cfg.includeMonth && <Badge>MM</Badge>}
          {cfg.includeDay && <Badge>DD</Badge>}
          <Badge tone="violet">{'#'.repeat(cfg.seqDigits)}</Badge>
        </div>
        <p className="mt-3 text-[12px] text-ink-3">e.g. com26092300001 = com · 26 · 09 · 23 · 00001</p>
      </div>
    </div>
  );
}

function OATab({ editable }: { editable: boolean }) {
  const { t, dateTime } = useI18n();
  const { state, updateOAIntegration } = useStore();
  const [cfg, setCfg] = useState(state.oaIntegration);
  const [tested, setTested] = useState(false);
  const logs = state.audit.filter((a) => a.source === 'OA_SYNC').slice(0, 8);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid gap-3.5">
        <FormField label={t('settings.endpoint')}><Input value={cfg.endpoint} disabled={!editable} onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })} className="font-mono text-[12.5px]" /></FormField>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <FormField label={t('settings.auth')}>
            <Select value={cfg.authType} disabled={!editable} onChange={(e) => setCfg({ ...cfg, authType: e.target.value as never })}>
              <option value="API_KEY">API Key</option>
              <option value="OAUTH2">OAuth 2.0</option>
              <option value="BASIC">Basic</option>
            </Select>
          </FormField>
          <FormField label={t('settings.syncMode')}>
            <Select value={cfg.syncMode} disabled={!editable} onChange={(e) => setCfg({ ...cfg, syncMode: e.target.value as never })}>
              <option value="MANUAL">Manual</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="WEBHOOK">Webhook</option>
            </Select>
          </FormField>
          <FormField label={t('settings.schedule')}><Input value={cfg.schedule} disabled={!editable || cfg.syncMode !== 'SCHEDULED'} onChange={(e) => setCfg({ ...cfg, schedule: e.target.value })} className="font-mono" /></FormField>
        </div>
        <FormField label="API Key"><Input type="password" value="••••••••••••••••" disabled readOnly /></FormField>
        {editable && (
          <div className="flex gap-2">
            <Button icon={<Plug size={15} />} onClick={() => setTested(true)}>{t('settings.test')}</Button>
            <Button variant="primary" onClick={() => updateOAIntegration(cfg)}>{t('common.save')}</Button>
          </div>
        )}
        {tested && <Notice tone="green" icon={<Check size={14} />}>{t('settings.testOk')}</Notice>}
        <p className="text-[12px] text-ink-3">{t('oa.lastSync')}: {dateTime(cfg.lastSyncAt)} · {t('oa.mapping')}: {cfg.mapping.length}</p>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink">{t('settings.importLog')}</div>
        <Table>
          <thead><tr><Th>{t('audit.at')}</Th><Th>{t('audit.action')}</Th><Th>{t('audit.new')}</Th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}><Td className="whitespace-nowrap">{dateTime(l.at)}</Td><Td mono>{l.action}</Td><Td>{l.newValue}</Td></tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function PermissionTab() {
  const { t } = useI18n();
  const perms = Object.keys(MATRIX) as Permission[];
  return (
    <>
      <div className="mb-3 text-[13px] font-semibold text-ink">{t('settings.matrix')}</div>
      <Table>
        <thead>
          <tr>
            <Th>Function</Th>
            {ROLES.map((r: Role) => <Th key={r} className="text-center">{t(`role.${r}`)}</Th>)}
          </tr>
        </thead>
        <tbody>
          {perms.map((p) => (
            <tr key={p}>
              <Td className="text-ink">{t(`settings.perm.${p}`)}</Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  {MATRIX[p].includes(r) ? <Check size={16} className="mx-auto text-emerald-700" /> : <Minus size={16} className="mx-auto text-ink-4" />}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

