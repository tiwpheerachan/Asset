"use client";

import { X } from "lucide-react";
import { useTabs } from "./TabsContext";

/** แถบแท็บเหนือเนื้อหา — คลิกสลับ, กากบาทปิด (ปิดได้เมื่อมีมากกว่า 1 แท็บ) */
export default function TabBar() {
  const ctx = useTabs();
  if (!ctx || ctx.tabs.length === 0) return null;
  const { tabs, activeId, activate, close } = ctx;

  return (
    <div
      role="tablist"
      aria-label="แท็บที่เปิดอยู่"
      className="no-print flex items-stretch gap-1 overflow-x-auto border-b border-border bg-surface/80 px-2 py-1 backdrop-blur"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => activate(tab.id)}
            onAuxClick={(e) => { if (e.button === 1 && tabs.length > 1) { e.preventDefault(); close(tab.id); } }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(tab.id); } }}
            title={tab.title}
            className={`group flex min-w-[120px] max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border px-3 py-1.5 text-[13px] transition ${
              active
                ? "border-border border-b-transparent bg-bg font-medium text-text shadow-sm"
                : "border-transparent text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                type="button"
                aria-label={`ปิดแท็บ ${tab.title}`}
                onClick={(e) => { e.stopPropagation(); close(tab.id); }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-50 hover:bg-no/15 hover:text-no hover:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
