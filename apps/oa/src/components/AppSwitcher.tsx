"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";

// ไอคอนสลับระบบบน navbar — ลิงก์ไปบัญชี (ONEBOOK) และ ทรัพย์สินถาวร (Asset)
const ONEBOOK_URL = process.env.NEXT_PUBLIC_ONEBOOK_URL || "https://onebook-gxyz.onrender.com";
const ASSET_URL = process.env.NEXT_PUBLIC_ASSET_URL || "https://shd-asset.onrender.com";

const LABELS: Record<string, { title: string; oa: string; accounting: string; assets: string; current: string }> = {
  th: { title: "สลับระบบ", oa: "ขออนุมัติ (OA)", accounting: "บัญชี (ONEBOOK)", assets: "ทรัพย์สินถาวร", current: "กำลังใช้" },
  en: { title: "Switch system", oa: "Approvals (OA)", accounting: "Accounting (ONEBOOK)", assets: "Fixed assets", current: "current" },
  zh: { title: "切换系统", oa: "审批（OA）", accounting: "会计（ONEBOOK）", assets: "固定资产", current: "当前" },
};

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export default function AppSwitcher() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const t = LABELS[locale] ?? LABELS.th;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t.title}
        aria-label={t.title}
        className="btn-icon h-9 w-9 ring-0 text-muted hover:bg-surface-2 hover:text-text"
      >
        <GridIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-border bg-surface p-1.5 shadow-lg">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t.title}</div>
            <div className="flex items-center gap-2.5 rounded-md bg-surface-2 px-2 py-2 text-[13px] font-medium text-text">
              {t.oa}<span className="ml-auto text-[10px] text-muted">{t.current}</span>
            </div>
            <a href={ONEBOOK_URL} className="block rounded-md px-2 py-2 text-[13px] text-text hover:bg-surface-2">{t.accounting}</a>
            <a href={ASSET_URL} className="block rounded-md px-2 py-2 text-[13px] text-text hover:bg-surface-2">{t.assets}</a>
          </div>
        </>
      )}
    </div>
  );
}
