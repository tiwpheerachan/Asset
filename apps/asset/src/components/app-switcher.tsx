'use client';

import { useState } from 'react';
import { LayoutGrid, BookOpen, FileCheck2, Boxes } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// ไอคอนสลับระบบบน navbar — ลิงก์ไปบัญชี (ONEBOOK) และ ขออนุมัติ (OA)
// URL จาก NEXT_PUBLIC_* (ตั้งตอน deploy) ถ้าไม่ตั้งใช้ค่า default ของ Render
const ONEBOOK_URL = process.env.NEXT_PUBLIC_ONEBOOK_URL || 'https://onebook-gxyz.onrender.com';
const OA_URL = process.env.NEXT_PUBLIC_OA_URL || 'https://shd-oa.onrender.com';

const LABELS = {
  th: { title: 'สลับระบบ', assets: 'ทรัพย์สินถาวร', accounting: 'บัญชี (ONEBOOK)', oa: 'ขออนุมัติ (OA)', current: 'กำลังใช้' },
  en: { title: 'Switch system', assets: 'Fixed assets', accounting: 'Accounting (ONEBOOK)', oa: 'Approvals (OA)', current: 'current' },
  zh: { title: '切换系统', assets: '固定资产', accounting: '会计（ONEBOOK）', oa: '审批（OA）', current: '当前' },
};

export function AppSwitcher() {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const t = LABELS[lang] ?? LABELS.th;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t.title}
        aria-label={t.title}
        className="rounded-md p-1.5 text-ink-3 hover:bg-canvas hover:text-ink"
      >
        <LayoutGrid size={19} strokeWidth={1.8} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-line bg-white p-1.5 shadow-pop">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t.title}</div>
            <div className="flex items-center gap-2.5 rounded-md bg-canvas px-2 py-2 text-[13px] font-medium text-ink">
              <Boxes size={16} className="text-brand-600" /> {t.assets}
              <span className="ml-auto text-[10px] text-ink-4">{t.current}</span>
            </div>
            <a href={ONEBOOK_URL} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 hover:bg-brand-50 hover:text-brand-700">
              <BookOpen size={16} /> {t.accounting}
            </a>
            <a href={OA_URL} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 hover:bg-brand-50 hover:text-brand-700">
              <FileCheck2 size={16} /> {t.oa}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
