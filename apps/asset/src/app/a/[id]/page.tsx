'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Boxes, Building2, Calendar, LogIn, MapPin, PackageSearch, ScanLine, Tag } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { AssetStatusBadge } from '@/components/badges';
import { LangSwitch } from '@/components/shell';

/**
 * หน้าสาธารณะสำหรับสแกน QR บนป้ายทรัพย์สิน — เปิดดูได้โดยไม่ต้องเข้าสู่ระบบ
 * แสดงเฉพาะข้อมูลระบุตัวตน/สถานที่/สถานะ (ไม่โชว์ข้อมูลบัญชี/ค่าเสื่อม)
 */
export default function PublicAssetPage() {
  const { id } = useParams<{ id: string }>();
  const { t, date, L } = useI18n();
  const { state, ready } = useStore();
  const lk = useLookups();
  const asset = state.assets.find((a) => a.id === id || a.code === id);
  const loc = lk.locationObj(asset?.locationId);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-[13px] text-ink-3">Loading…</div>;
  }

  if (!asset) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <PackageSearch size={40} className="text-ink-4" />
        <div className="text-[15px] font-semibold text-ink">ไม่พบทรัพย์สินนี้</div>
        <div className="text-[13px] text-ink-3">รหัส/QR อาจไม่ถูกต้อง หรือทรัพย์สินถูกจำหน่ายไปแล้ว</div>
      </div>
    );
  }

  const rows: { icon: typeof Tag; label: string; value: React.ReactNode }[] = [
    { icon: Tag, label: 'หมวดหมู่', value: `${lk.category(asset.categoryId)}${asset.subcategoryId ? ` / ${lk.category(asset.subcategoryId)}` : ''}` },
    { icon: Boxes, label: 'ยี่ห้อ / รุ่น', value: [asset.brand, asset.model].filter(Boolean).join(' · ') || '—' },
    { icon: ScanLine, label: 'Serial No.', value: asset.serialNumber || '—' },
    { icon: Boxes, label: 'จำนวน', value: `${asset.quantity} ${lk.unit(asset.unit)}` },
    { icon: Building2, label: 'บริษัท / สาขา', value: `${lk.company(asset.companyId)} · ${lk.branch(asset.branchId)}` },
    { icon: MapPin, label: 'สถานที่', value: loc ? `${L(loc.name)} (${[loc.building, loc.floor, loc.room].filter(Boolean).join(' / ')})` : 'ยังไม่ระบุ' },
    { icon: Calendar, label: 'วันที่พร้อมใช้งาน', value: date(asset.readyDate) },
  ];

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-3 flex items-center justify-between">
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-ink">Fixed Asset</div>
            <div className="text-[11.5px] text-ink-3">{lk.company(asset.companyId)}</div>
          </div>
          <LangSwitch compact />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {/* หัวการ์ด */}
          <div className="bg-brand-700 px-5 py-5 text-white">
            <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-wide text-white/70">
              <ScanLine size={13} /> ทรัพย์สินถาวร
            </div>
            <div className="mt-1 font-mono text-[22px] font-bold tracking-tight">{asset.code}</div>
            <div className="mt-1 text-[15px] font-medium leading-snug">{lk.assetName(asset)}</div>
            {asset.description && <div className="mt-1 text-[12.5px] leading-snug text-white/80">{asset.description}</div>}
            <div className="mt-3"><AssetStatusBadge status={asset.status} /></div>
          </div>

          {/* รายละเอียด */}
          <dl className="divide-y divide-line-soft">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-3 px-5 py-3">
                <r.icon size={16} className="mt-0.5 shrink-0 text-ink-4" />
                <dt className="w-28 shrink-0 text-[12.5px] text-ink-3">{r.label}</dt>
                <dd className="min-w-0 flex-1 text-[13.5px] text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ปุ่มเข้าสู่ระบบเพื่อดูข้อมูลบัญชี */}
        <Link
          href={`/assets/${asset.id}`}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-[13.5px] font-medium text-brand-700 shadow-card transition hover:border-brand-400 hover:bg-brand-50"
        >
          <LogIn size={16} /> เข้าสู่ระบบเพื่อดูข้อมูลบัญชีและค่าเสื่อม
        </Link>
        <p className="mt-3 text-center text-[11px] text-ink-4">
          หน้านี้แสดงข้อมูลระบุตัวทรัพย์สินเท่านั้น · {t('app.subtitle')}
        </p>
      </div>
    </div>
  );
}
