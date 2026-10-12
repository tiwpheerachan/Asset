'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useLookups } from '@/lib/hooks';
import { AssetStatusBadge } from '@/components/badges';
import { cx } from '@/components/ui';
import type { Asset } from '@/lib/types';

const MAX = 8;

/** ไฮไลต์ส่วนที่ตรงกับคำค้น (ครั้งแรก) */
function highlight(text: string, q: string): ReactNode {
  const s = q.trim();
  if (!s) return text;
  const idx = text.toLowerCase().indexOf(s.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[2px] bg-brand-100 px-0.5 text-ink">{text.slice(idx, idx + s.length)}</mark>
      {text.slice(idx + s.length)}
    </>
  );
}

/**
 * ช่องค้นหาแบบ typeahead — พิมพ์แล้วเด้งรายการทรัพย์สินที่น่าจะใช่ขึ้นมาทันที
 * จัดอันดับตามความเกี่ยวข้อง เลือกด้วยลูกศร/Enter หรือคลิกเพื่อไปหน้าทรัพย์สิน
 */
export function AssetSearch() {
  const { t } = useI18n();
  const { state } = useStore();
  const lk = useLookups();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { list, total } = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { list: [] as Asset[], total: 0 };
    const scored: { a: Asset; score: number }[] = [];
    for (const a of state.assets) {
      const code = (a.code || '').toLowerCase();
      const nth = (a.nameTh || '').toLowerCase();
      const nen = (a.nameEn || '').toLowerCase();
      const sn = (a.serialNumber || '').toLowerCase();
      const inv = (a.source?.invoiceNo || '').toLowerCase();
      const oa = (a.source?.oaNo || '').toLowerCase();
      const po = (a.source?.poNo || '').toLowerCase();
      if (!`${code} ${nth} ${nen} ${sn} ${inv} ${oa} ${po}`.includes(s)) continue;
      // คะแนนความเกี่ยวข้อง: ตรงรหัส/SN เป๊ะ > ขึ้นต้น > อยู่ในคำ > เอกสารอ้างอิง
      let score = 15;
      if (code === s || sn === s) score = 100;
      else if (code.startsWith(s)) score = 90;
      else if (nth.startsWith(s) || nen.startsWith(s)) score = 80;
      else if (sn.startsWith(s)) score = 72;
      else if (code.includes(s)) score = 60;
      else if (nth.includes(s) || nen.includes(s)) score = 50;
      else if (sn.includes(s)) score = 40;
      scored.push({ a, score });
    }
    scored.sort((x, y) => y.score - x.score || x.a.code.localeCompare(y.a.code));
    return { list: scored.slice(0, MAX).map((x) => x.a), total: scored.length };
  }, [q, state.assets]);

  useEffect(() => setActive(0), [q]);

  const rows = list.length; // ดัชนี rows = ปุ่ม "ดูผลทั้งหมด"
  const go = (a: Asset) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    router.push(`/assets/${a.id}`);
  };
  const seeAll = () => {
    setOpen(false);
    router.push(`/assets?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => Math.min(i + 1, rows));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows > 0 && active < rows) go(list[active]);
      else if (q.trim()) seeAll();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && q.trim().length > 0;

  return (
    <div className="relative max-w-xl flex-1">
      <Search size={16} className="pointer-events-none absolute left-2.5 top-[18px] -translate-y-1/2 text-ink-4" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => q.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('common.globalSearch')}
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        className="h-9 w-full rounded-md border border-line bg-canvas pl-8 pr-3 text-[13.5px] placeholder:text-ink-4 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {showPanel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-pop">
            {rows === 0 ? (
              <div className="px-3 py-4 text-center text-[13px] text-ink-3">
                {t('search.none')} “{q.trim()}”
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {list.map((a, i) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(a)}
                      className={cx(
                        'flex w-full items-center gap-3 px-3 py-2 text-left',
                        i === active ? 'bg-brand-50' : 'hover:bg-canvas',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{highlight(lk.assetName(a), q)}</div>
                        <div className="truncate text-[11.5px] text-ink-3">
                          <span className="font-mono">{highlight(a.code, q)}</span>
                          {a.serialNumber ? <> · SN {highlight(a.serialNumber, q)}</> : null}
                          <> · {lk.category(a.subcategoryId || a.categoryId)}</>
                        </div>
                      </div>
                      <AssetStatusBadge status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {rows > 0 && (
              <button
                type="button"
                onMouseEnter={() => setActive(rows)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={seeAll}
                className={cx(
                  'flex w-full items-center gap-2 border-t border-line px-3 py-2 text-[12.5px]',
                  active === rows ? 'bg-brand-50 text-brand-700' : 'text-ink-3 hover:bg-canvas',
                )}
              >
                <Search size={13} />
                <span className="flex-1 text-left">{t('search.seeAll')} ({total})</span>
                <CornerDownLeft size={13} className="text-ink-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
