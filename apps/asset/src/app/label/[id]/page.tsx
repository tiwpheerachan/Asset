'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { Button } from '@/components/ui';
import { LangSwitch } from '@/components/shell';
import { BarcodeBars } from '@/components/barcode';

/**
 * ป้ายทรัพย์สิน — เรนเดอร์ทั้งใบเป็น SVG ชิ้นเดียว (QR + บาร์โค้ดประเภท + บาร์โค้ด SN + ข้อความ)
 * เพื่อให้: (1) ดาวน์โหลดเป็น PNG/SVG ได้ (2) พิมพ์ด้วย @page ขนาดตรงกับสติกเกอร์ของเครื่องพิมพ์บาร์โค้ด
 * ระบบพิกัดคงที่ 700 × 350 (อัตราส่วน 2:1) — ขนาดจริงกำหนดเป็นมิลลิเมตรตอนพิมพ์/ดาวน์โหลด
 */

const VB_W = 700;
const VB_H = 350;

// สต็อกสติกเกอร์ยอดนิยม (อัตราส่วน 2:1 ให้พอดีกับดีไซน์เดียว)
const SIZES = [
  { w: 70, h: 35 },
  { w: 100, h: 50 },
  { w: 60, h: 30 },
  { w: 50, h: 25 },
];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * ข้อความที่ "ย่อให้พอดีกรอบ" แทนการตัดทิ้ง — ถ้าความกว้างโดยประมาณเกิน max
 * จะบีบตัวอักษรให้พอดีด้วย textLength (ไม่ตัด ไม่ล้นกรอบ) ถ้าสั้นก็แสดงขนาดปกติ
 */
function FitText({
  x, y, text, max, fontSize, fill, fontWeight, mono, anchor, factor = 0.6,
}: {
  x: number; y: number; text: string; max: number; fontSize: number;
  fill?: string; fontWeight?: number; mono?: boolean; anchor?: 'start' | 'middle' | 'end'; factor?: number;
}) {
  const fit = text.length * fontSize * factor > max;
  return (
    <text
      x={x} y={y} fontSize={fontSize} fill={fill} fontWeight={fontWeight}
      textAnchor={anchor} fontFamily={mono ? 'ui-monospace, monospace' : undefined}
      textLength={fit ? max : undefined} lengthAdjust={fit ? 'spacingAndGlyphs' : undefined}
    >
      {text}
    </text>
  );
}

export default function LabelPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { state, ready } = useStore();
  const lk = useLookups();
  const svgRef = useRef<SVGSVGElement>(null);
  const [origin, setOrigin] = useState('');
  const [si, setSi] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const asset = state.assets.find((a) => a.id === id);
  if (!ready) return null;
  if (!asset) return <div className="p-8 text-sm">{t('common.noData')}</div>;

  const size = SIZES[si];
  const typeCode = asset.subcategoryId || asset.categoryId || '';
  const typeName = lk.category(asset.subcategoryId || asset.categoryId);
  const previewW = 560;
  const previewH = (previewW * VB_H) / VB_W;

  const serialize = () => {
    const svg = svgRef.current;
    if (!svg) return '';
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(VB_W));
    clone.setAttribute('height', String(VB_H));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const downloadSVG = () => {
    const s = serialize();
    if (!s) return;
    triggerDownload(URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })), `label-${asset.code}.svg`);
  };

  const downloadPNG = () => {
    const s = serialize();
    if (!s) return;
    setBusy(true);
    const scale = 4; // ความละเอียดสูงให้คมเวลาพิมพ์
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = VB_W * scale;
      c.height = VB_H * scale;
      const ctx = c.getContext('2d');
      if (!ctx) { setBusy(false); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (b) triggerDownload(URL.createObjectURL(b), `label-${asset.code}.png`);
        setBusy(false);
      }, 'image/png');
    };
    img.onerror = () => setBusy(false);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  };

  return (
    <div id="print-root" className="min-h-screen bg-canvas p-6 print:bg-white print:p-0">
      {/* ขนาดกระดาษตอนพิมพ์ = สติกเกอร์ที่เลือก (ขอบ 0) เหมาะกับเครื่องพิมพ์บาร์โค้ด */}
      <style>{`@media print{
        @page{ size:${size.w}mm ${size.h}mm; margin:0; }
        html,body{ margin:0 !important; background:#fff !important; }
        .no-print{ display:none !important; }
        #print-root{ position:fixed; inset:0; padding:0 !important; }
        #label-artboard{ width:${size.w}mm !important; height:${size.h}mm !important; }
      }`}</style>

      {/* แถบควบคุม (ไม่พิมพ์) */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[18px] font-semibold text-ink">{t('detail.labelTitle')}</h1>
        <span className="font-mono text-[13px] text-ink-3">{asset.code}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
            {t('label.size')}
            <select
              value={si}
              onChange={(e) => setSi(Number(e.target.value))}
              className="rounded-md border border-line bg-white px-2 py-1 text-[12px] text-ink"
            >
              {SIZES.map((s, i) => (
                <option key={i} value={i}>{s.w} × {s.h} mm</option>
              ))}
            </select>
          </label>
          <LangSwitch compact />
          <Button variant="ghost" icon={<ImageIcon size={15} />} onClick={downloadPNG} disabled={busy}>
            {busy ? '…' : 'PNG'}
          </Button>
          <Button variant="ghost" icon={<Download size={15} />} onClick={downloadSVG}>SVG</Button>
          <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
        </div>
      </div>

      {/* พื้นที่พรีวิว (แสดงขยายให้ดูง่าย — ขนาดจริงกำหนดตอนพิมพ์/ดาวน์โหลด) */}
      <div className="no-print mb-2 text-[12px] text-ink-3">{t('label.actualSize')}: {size.w} × {size.h} mm</div>
      <div className="inline-block rounded-lg bg-white p-4 shadow-sm ring-1 ring-line print:p-0 print:shadow-none print:ring-0">
        <svg
          id="label-artboard"
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width={previewW}
          height={previewH}
          style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Noto Sans Thai", "Sarabun", sans-serif', display: 'block' }}
        >
          {/* พื้นหลัง + กรอบ */}
          <rect x={0.5} y={0.5} width={VB_W - 1} height={VB_H - 1} rx={14} fill="#ffffff" stroke="#cbd5e1" strokeWidth={1.5} />

          {/* QR → หน้าทรัพย์สินแบบอ่านอย่างเดียว */}
          <g transform="translate(26,81)">
            <QRCodeSVG value={`${origin}/a/${asset.id}`} size={188} level="M" marginSize={0} />
          </g>
          <text x={120} y={300} textAnchor="middle" fontSize={15} fill="#94a3b8">{t('label.scan')}</text>

          {/* เส้นแบ่ง */}
          <line x1={240} y1={34} x2={240} y2={316} stroke="#e2e8f0" strokeWidth={1.5} />

          {/* ข้อมูลหัว — ย่อพอดีกรอบ ไม่ตัด */}
          <FitText x={262} y={52} text={clip(lk.company(asset.companyId), 70)} max={412} fontSize={17} fontWeight={600} fill="#64748b" factor={0.56} />
          <FitText x={262} y={80} text={clip(lk.assetName(asset), 70)} max={412} fontSize={22} fontWeight={700} fill="#1e293b" factor={0.56} />
          <text x={262} y={102} fontSize={16} fontFamily="ui-monospace, monospace" fill="#64748b">{asset.code}</text>

          {/* บาร์โค้ด "ประเภท" — เป็นอะไร */}
          {typeCode && (
            <>
              <text x={262} y={126} fontSize={13} fontWeight={600} fill="#94a3b8">CATEGORY</text>
              <BarcodeBars value={typeCode} x={262} y={132} width={412} height={50} />
              <FitText x={468} y={200} text={clip(`${typeCode} · ${typeName}`, 60)} max={408} anchor="middle" fontSize={18} fontWeight={700} mono fill="#0f172a" />
            </>
          )}

          {/* บาร์โค้ด "SN" — ตัวไหน */}
          {asset.serialNumber ? (
            <>
              <text x={262} y={224} fontSize={13} fontWeight={600} fill="#94a3b8">SERIAL NO.</text>
              <BarcodeBars value={asset.serialNumber} x={262} y={230} width={412} height={50} />
              <FitText x={468} y={298} text={`SN: ${asset.serialNumber}`} max={408} anchor="middle" fontSize={18} mono fill="#334155" />
            </>
          ) : null}
        </svg>
      </div>

      <div className="no-print mt-3 max-w-[560px] text-[11.5px] leading-relaxed text-ink-3">
        {t('label.printerHint')}
      </div>
    </div>
  );
}
