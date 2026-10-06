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
        className="flex items-stretch gap-3 rounded border border-slate-400 bg-white p-[3mm]"
        style={{ width: '70mm', height: '35mm' }}
      >
        <div className="flex shrink-0 items-center">
          <QRCodeSVG value={`${origin}/a/${asset.id}`} size={96} level="M" style={{ width: '27mm', height: '27mm' }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-[0.5mm]">
          <div>
            <div className="text-[7pt] uppercase tracking-wide text-slate-500">{t('label.property')}</div>
            <div className="truncate text-[8pt] font-semibold leading-tight text-slate-900">{lk.company(asset.companyId)}</div>
          </div>
          <div className="font-mono text-[11pt] font-bold leading-none tracking-tight text-slate-900">{asset.code}</div>
          <div className="line-clamp-2 text-[7.5pt] leading-tight text-slate-700">{lk.assetName(asset)}</div>
          <div className="text-[6pt] text-slate-400">{t('label.scan')}</div>
        </div>
      </div>
    </div>
  );
}
