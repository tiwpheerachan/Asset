"use client";

import { useEffect, useRef, useState } from "react";
import { useTabs } from "./TabsContext";

function embedSrc(url: string, id: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}embed=1&_tab=${encodeURIComponent(id)}`;
}

/**
 * เนื้อหาของทุกแท็บ = iframe ที่โหลดหน้า OA ในโหมด embed
 * - mount เฉพาะแท็บที่เคยเปิด (lazy) แล้วคงไว้ (keep-alive)
 * - ตรึง src ต่อแท็บไว้ (ไม่เปลี่ยนตาม url ที่อัปเดตจาก postMessage) จึงไม่โหลดซ้ำ
 * - โชว์เฉพาะแท็บที่เลือก ตัวอื่นซ่อน (hidden) แต่ยังมีชีวิต
 */
export default function TabWorkspace() {
  const ctx = useTabs();
  const srcRef = useRef<Record<string, string>>({});
  const [mountedIds, setMountedIds] = useState<string[]>([]);

  const tabs = ctx?.tabs ?? [];
  const activeId = ctx?.activeId ?? null;

  useEffect(() => {
    if (!activeId) return;
    const t = tabs.find((x) => x.id === activeId);
    if (t && !srcRef.current[activeId]) srcRef.current[activeId] = embedSrc(t.url, activeId);
    setMountedIds((ids) => (ids.includes(activeId) ? ids : [...ids, activeId]));
  }, [activeId, tabs]);

  // เก็บกวาดแท็บที่ปิดไปแล้ว
  useEffect(() => {
    const liveIds = new Set(tabs.map((t) => t.id));
    setMountedIds((ids) => ids.filter((id) => liveIds.has(id)));
    for (const id of Object.keys(srcRef.current)) if (!liveIds.has(id)) delete srcRef.current[id];
  }, [tabs]);

  if (!ctx) return null;

  return (
    <div className="relative min-h-0 flex-1 bg-bg">
      {tabs.map((tab) => {
        if (!mountedIds.includes(tab.id)) return null;
        const src = srcRef.current[tab.id] || embedSrc(tab.url, tab.id);
        return (
          <iframe
            key={tab.id}
            title={tab.title}
            src={src}
            className={`absolute inset-0 h-full w-full border-0 ${tab.id === activeId ? "" : "hidden"}`}
          />
        );
      })}
    </div>
  );
}
