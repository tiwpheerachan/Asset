'use client';

import { useState } from 'react';
import { Building2, Upload, Stamp, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Company } from '@/lib/types';
import { Button, Card, CardHeader, FormField, Input, Notice, PageHeader } from '@/components/ui';

export default function CompanySettingsPage() {
  const { state, can, upsertMaster } = useStore();
  const canEdit = can('manageUsers');
  const company = state.companies[0];
  const [draft, setDraft] = useState<Company | null>(company ?? null);
  const [saved, setSaved] = useState(false);

  if (!draft) return <><PageHeader title="ข้อมูลกิจการ" /><Notice tone="amber">ไม่พบข้อมูลบริษัทในระบบ</Notice></>;

  const set = <K extends keyof Company>(k: K, v: Company[K]) => { setDraft((d) => (d ? { ...d, [k]: v } : d)); setSaved(false); };
  const setName = (k: 'th' | 'en', v: string) => set('name', { ...draft.name, [k]: v });

  // อัปโหลดไฟล์รูป → base64 data URL (เตือนถ้าไฟล์ใหญ่เกิน ~400KB)
  const upload = (k: 'logo' | 'stamp') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 400 * 1024) { alert('ไฟล์ใหญ่เกิน 400KB — ใช้รูปเล็กลงเพื่อให้โหลดเร็ว'); return; }
    const r = new FileReader();
    r.onload = () => set(k, String(r.result));
    r.readAsDataURL(f);
  };

  const save = () => { upsertMaster('companies', draft, 'แก้ข้อมูลกิจการ/โลโก้/ตราประทับ'); setSaved(true); };

  const ImageField = ({ label, field, icon: Icon }: { label: string; field: 'logo' | 'stamp'; icon: typeof Upload }) => (
    <FormField label={label}>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-canvas">
          {draft[field] ? <img src={draft[field]} alt={label} className="max-h-full max-w-full object-contain" /> : <Icon size={28} className="text-ink-4" />}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas">
              <Upload size={14} /> อัปโหลดรูป
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={upload(field)} />
            </label>
            {draft[field] && <button className="text-left text-xs text-rose-600 hover:underline" onClick={() => set(field, undefined)}>ลบรูป</button>}
            <span className="text-[11px] text-ink-4">PNG/JPG/SVG · ไม่เกิน 400KB</span>
          </div>
        )}
      </div>
    </FormField>
  );

  return (
    <>
      <PageHeader
        title="ข้อมูลกิจการ"
        sub="ตั้งค่าชื่อบริษัท ที่อยู่ โลโก้ และตราประทับ — ใช้บนป้ายทรัพย์สิน รายงาน และเอกสาร"
        actions={canEdit && <Button variant="primary" icon={<Check size={15} />} onClick={save}>บันทึก</Button>}
      />
      {saved && <Notice tone="green">บันทึกข้อมูลกิจการแล้ว</Notice>}

      <Card className="mb-4">
        <CardHeader title="ข้อมูลกิจการ" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <FormField label="ชื่อบริษัท (ไทย)" required><Input value={draft.name.th} disabled={!canEdit} onChange={(e) => setName('th', e.target.value)} /></FormField>
          <FormField label="ชื่อบริษัท (อังกฤษ)"><Input value={draft.name.en} disabled={!canEdit} onChange={(e) => setName('en', e.target.value)} /></FormField>
          <FormField label="เลขประจำตัวผู้เสียภาษี"><Input value={draft.taxId} disabled={!canEdit} maxLength={13} className="font-mono" onChange={(e) => set('taxId', e.target.value.replace(/\D/g, ''))} /></FormField>
          <FormField label="สาขา"><Input value={draft.branchName ?? ''} disabled={!canEdit} placeholder="สำนักงานใหญ่" onChange={(e) => set('branchName', e.target.value)} /></FormField>
          <div className="md:col-span-2"><FormField label="ที่อยู่"><Input value={draft.address ?? ''} disabled={!canEdit} onChange={(e) => set('address', e.target.value)} /></FormField></div>
          <FormField label="โทรศัพท์"><Input value={draft.phone ?? ''} disabled={!canEdit} onChange={(e) => set('phone', e.target.value)} /></FormField>
          <FormField label="อีเมล"><Input value={draft.email ?? ''} disabled={!canEdit} onChange={(e) => set('email', e.target.value)} /></FormField>
          <FormField label="เว็บไซต์"><Input value={draft.website ?? ''} disabled={!canEdit} onChange={(e) => set('website', e.target.value)} /></FormField>
          <FormField label="ผู้มีอำนาจลงนาม"><Input value={draft.authorizedSigner ?? ''} disabled={!canEdit} onChange={(e) => set('authorizedSigner', e.target.value)} /></FormField>
          <div className="md:col-span-2"><FormField label="หมายเหตุท้ายเอกสาร"><Input value={draft.footerNote ?? ''} disabled={!canEdit} onChange={(e) => set('footerNote', e.target.value)} /></FormField></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="โลโก้และตราประทับ" />
        <div className="grid gap-6 p-4 md:grid-cols-2">
          <ImageField label="โลโก้บริษัท" field="logo" icon={Building2} />
          <ImageField label="ตราประทับ / ตรายาง" field="stamp" icon={Stamp} />
        </div>
      </Card>
    </>
  );
}
