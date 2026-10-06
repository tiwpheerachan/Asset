'use client';

import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { TODAY, useStore } from '@/lib/store';
import { UNITS } from '@/data/masters';
import { Button, FormField, Input, Modal, Notice, Select } from './ui';

export function AssetCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t, L } = useI18n();
  const { state, createAsset, previewCode } = useStore();
  const subs = state.categories.filter((c) => c.parentId);
  const [f, setF] = useState({
    nameTh: '',
    nameEn: '',
    subcategoryId: subs[0]?.id ?? '',
    companyId: state.companies[0]?.id ?? '',
    branchId: state.branches[0]?.id ?? '',
    departmentId: state.departments[0]?.id ?? '',
    costCenterId: '',
    locationId: '',
    unit: 'unit',
    quantity: 1,
    originalCost: 0,
    acquisitionDate: TODAY,
    serialNumber: '',
    brand: '',
    model: '',
  });
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const sub = state.categories.find((c) => c.id === f.subcategoryId);
  const parentId = sub?.parentId ?? f.subcategoryId;
  const policy = state.policies.find((p) => p.categoryId === parentId && p.active);
  const cc = f.costCenterId || state.costCenters.find((c) => c.departmentId === f.departmentId)?.id || '';
  const locs = useMemo(() => state.locations.filter((l) => l.branchId === f.branchId), [state.locations, f.branchId]);
  const valid = f.nameTh.trim() && f.subcategoryId && f.originalCost > 0 && f.quantity > 0;

  const submit = () => {
    if (!valid) return;
    const id = createAsset({
      ...f,
      nameEn: f.nameEn || f.nameTh,
      description: '',
      categoryId: parentId,
      costCenterId: cc,
      locationId: f.locationId || null,
      holderId: null,
      additionalCost: 0,
      residual: policy?.residual ?? 1,
      lifeMonths: (policy?.lifeYears ?? 5) * 12,
      method: policy?.method ?? 'SL',
      policyId: policy?.id ?? null,
      readyDate: null,
      status: 'DRAFT',
      hasPhoto: false,
      source: {},
    });
    onCreated(id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('assets.createTitle')}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <Notice icon={<Info size={15} />}>{t('assets.createHint')}</Notice>
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <FormField label={t('field.assetCode')}>
          <Input value={previewCode(f.companyId)} disabled className="font-mono" />
        </FormField>
        <FormField label={t('field.subcategory')} required>
          <Select value={f.subcategoryId} onChange={(e) => set('subcategoryId', e.target.value)}>
            {state.categories
              .filter((c) => !c.parentId)
              .map((p) => (
                <optgroup key={p.id} label={L(p.name)}>
                  {subs
                    .filter((s) => s.parentId === p.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {L(s.name)}
                      </option>
                    ))}
                </optgroup>
              ))}
          </Select>
        </FormField>
        <FormField label={t('field.nameTh')} required>
          <Input value={f.nameTh} onChange={(e) => set('nameTh', e.target.value)} />
        </FormField>
        <FormField label={t('field.nameEn')}>
          <Input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </FormField>
        <FormField label={t('field.brand')}>
          <Input value={f.brand} onChange={(e) => set('brand', e.target.value)} />
        </FormField>
        <FormField label={t('field.model')}>
          <Input value={f.model} onChange={(e) => set('model', e.target.value)} />
        </FormField>
        <FormField label={t('field.company')} required>
          <Select value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {L(c.name)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('field.branch')} required>
          <Select value={f.branchId} onChange={(e) => setF((p) => ({ ...p, branchId: e.target.value, locationId: '' }))}>
            {state.branches
              .filter((b) => b.companyId === f.companyId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {L(b.name)}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label={t('field.department')} required>
          <Select value={f.departmentId} onChange={(e) => setF((p) => ({ ...p, departmentId: e.target.value, costCenterId: '' }))}>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {L(d.name)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('field.costCenter')} required>
          <Select value={cc} onChange={(e) => set('costCenterId', e.target.value)}>
            {state.costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {L(c.name)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('field.location')}>
          <Select value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">{t('common.notSet')}</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {L(l.name)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('field.serialNumber')}>
          <Input value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('field.quantity')} required>
            <Input type="number" min={1} value={f.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
          </FormField>
          <FormField label={t('field.unit')}>
            <Select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
              {Object.keys(UNITS).map((u) => (
                <option key={u} value={u}>
                  {L(UNITS[u])}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label={`${t('field.originalCost')} (${t('common.thb')})`} required>
          <Input type="number" min={0} step="0.01" value={f.originalCost || ''} onChange={(e) => set('originalCost', Number(e.target.value))} />
        </FormField>
        <FormField label={t('field.acquisitionDate')} required>
          <Input type="date" value={f.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
        </FormField>
        <FormField label={t('field.policy')}>
          <Input value={policy ? L(policy.name) : t('common.notSet')} disabled />
        </FormField>
      </div>
    </Modal>
  );
}
