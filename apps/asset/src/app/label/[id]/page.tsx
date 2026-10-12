'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { Button } from '@/components/ui';
import { LangSwitch } from '@/components/shell';
import { Barcode128 } from '@/components/barcode';

/** Printable asset label — 70 × 35 mm. Contents per spec: Company, Asset code, Asset name, QR code. */
export default function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { state, ready } = useStore();
  const lk = useLookups();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const asset = state.assets.find((a) => a.id === id);
  if (!ready) return null;
  if (!asset) return <div className="p-8 text-sm">{t('common.noData')}</div>;

  return (
    <div className="min-h-screen bg-canvas p-8 print:bg-white print:p-0">
      <div className="no-print mb-6 flex items-center gap-3">
        <h1 className="text-[18px] font-semibold text-ink">{t('detail.labelTitle')}</h1>
        <span className="font-mono text-[13px] text-ink-3">{asset.code}</span>
        <div className="ml-auto flex items-center gap-2">
          <LangSwitch compact />
          <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
        </div>
      </div>
      <div
        className="flex items-stretch gap-[2.5mm] overflow-hidden rounded-[1.5mm] border border-slate-300 bg-white p-[2.5mm]"
        style={{ width: '70mm', height: '35mm' }}
      >
        {/* ซ้าย: QR (เปิดหน้าทรัพย์สินแบบอ่านอย่างเดียว) */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-[0.8mm]">
          <QRCodeSVG value={`${origin}/a/${asset.id}`} size={96} level="M" style={{ width: '21mm', height: '21mm' }} />
          <div className="text-[5pt] uppercase tracking-wide text-slate-400">{t('label.scan')}</div>
        </div>

        {/* เส้นแบ่ง */}
        <div className="w-px shrink-0 self-stretch bg-slate-200" />

        {/* ขวา: ชื่อบริษัท/ทรัพย์สิน + บาร์โค้ด + SN */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="min-w-0">
            <div className="truncate text-[6pt] font-semibold uppercase tracking-wide text-slate-500">{lk.company(asset.companyId)}</div>
            <div className="line-clamp-2 text-[7.5pt] font-medium leading-tight text-slate-800">{lk.assetName(asset)}</div>
          </div>

          {/* บาร์โค้ดของรหัสทรัพย์สิน */}
          <div className="min-w-0">
            <Barcode128 value={asset.code} height={40} style={{ width: '100%', height: '7mm' }} />
            <div className="mt-[0.3mm] text-center font-mono text-[9pt] font-bold leading-none tracking-[0.18em] text-slate-900">{asset.code}</div>
          </div>

          {/* Serial Number (ถ้ามี) */}
          {asset.serialNumber ? (
            <div className="truncate font-mono text-[6.5pt] leading-none tracking-wide text-slate-600">SN: {asset.serialNumber}</div>
          ) : (
            <div className="text-[6pt] uppercase tracking-wide text-slate-400">{t('label.property')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
