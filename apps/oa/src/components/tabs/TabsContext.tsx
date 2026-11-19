"use client";

/**
 * ระบบแท็บเวิร์กสเปซแบบเบราว์เซอร์ (keep-alive)
 * - แต่ละแท็บ = หนึ่งหน้า OA ที่โหลดใน <iframe> (ดู TabWorkspace)
 * - สลับแท็บ = ซ่อน/โชว์ iframe → สถานะ/ฟอร์ม/สกรอลล์คงอยู่ ไม่โหลดใหม่
 * - ดักคลิกลิงก์ภายใน (capture) ให้เปิด/โฟกัสแท็บ แทนการนำทางทั้งหน้า
 * - จำรายการแท็บไว้ใน sessionStorage (รีเฟรชแล้วแท็บยังอยู่ เนื้อหาในแท็บโหลดใหม่ตามปกติ)
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";

export type Tab = { id: string; url: string; title: string };

type Ctx = {
  tabs: Tab[];
  activeId: string | null;
  open: (url: string, title?: string) => void;
  activate: (id: string) => void;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  setMeta: (id: string, patch: Partial<Pick<Tab, "title" | "url">>) => void;
};

const TabsCtx = createContext<Ctx | null>(null);
export const useTabs = () => useContext(TabsCtx);

const KEY = "oa-tabs-v1";
const MAX_TABS = 12;

/** ตัด origin / embed / _tab ออก เหลือ path+query ไว้เทียบว่าเป็นหน้าเดียวกัน */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url, "http://x");
    u.searchParams.delete("embed");
    u.searchParams.delete("_tab");
    const qs = u.searchParams.toString();
    return u.pathname + (qs ? `?${qs}` : "");
  } catch {
    return url;
  }
}

/** ชื่อแท็บเริ่มต้นจาก path (ใช้ชั่วคราวจนกว่า iframe จะส่งชื่อจริงกลับมา) */
export function labelFor(url: string): string {
  const p = normalizeUrl(url);
  const map: Array<[RegExp, string]> = [
    [/^\/dashboard/, "แดชบอร์ด"],
    [/^\/requests\/table/, "ตารางคำขอ"],
    [/^\/requests\/pending/, "รออนุมัติ (รวม)"],
    [/^\/requests\/[^/?]+/, "รายละเอียดคำขอ"],
    [/^\/requests\?tab=awaiting/, "รอฉันอนุมัติ"],
    [/^\/requests\?tab=mine/, "คำขอของฉัน"],
    [/^\/requests/, "ศูนย์การอนุมัติ"],
    [/^\/admin\/company/, "ข้อมูลกิจการ"],
    [/^\/admin\/users/, "ผู้ใช้งาน"],
    [/^\/admin\/forms/, "ฟอร์ม"],
    [/^\/admin\/analytics/, "วิเคราะห์"],
    [/^\/admin\/oa-history/, "ประวัติการซิงก์"],
    [/^\/admin\/oa-documents/, "เอกสาร OA"],
    [/^\/admin\/oa-overview/, "ภาพรวมเอกสาร"],
    [/^\/admin\/accounting/, "ลงบัญชี"],
    [/^\/admin/, "ผู้ดูแลระบบ"],
    [/^\/profile/, "โปรไฟล์"],
    [/^\/help/, "ช่วยเหลือ"],
    [/^\/$/, "ส่งคำขอ"],
  ];
  for (const [re, label] of map) if (re.test(p)) return label;
  return p.replace(/^\//, "").split("?")[0] || "หน้าแรก";
}

function makeTab(url: string, title?: string): Tab {
  const u = normalizeUrl(url);
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.random()}`;
  return { id, url: u, title: title?.trim() || labelFor(u) };
}

export function TabsProvider({ initialUrl, children }: { initialUrl: string; children: React.ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // โหลดแท็บที่จำไว้ หรือเริ่มด้วยหน้าปัจจุบัน
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let restored: { tabs: Tab[]; activeId: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) restored = JSON.parse(raw);
    } catch { /* ignore */ }
    if (restored && Array.isArray(restored.tabs) && restored.tabs.length) {
      setTabs(restored.tabs);
      setActiveId(restored.activeId && restored.tabs.some((t) => t.id === restored!.activeId)
        ? restored.activeId : restored.tabs[0].id);
    } else {
      const first = makeTab(initialUrl);
      setTabs([first]);
      setActiveId(first.id);
    }
  }, [initialUrl]);

  // จำไว้ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (!hydrated.current) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ tabs, activeId })); } catch { /* ignore */ }
  }, [tabs, activeId]);

  const activate = useCallback((id: string) => setActiveId(id), []);

  const open = useCallback((url: string, title?: string) => {
    const norm = normalizeUrl(url);
    setTabs((prev) => {
      const existing = prev.find((t) => t.url === norm);
      if (existing) { setActiveId(existing.id); return prev; }
      const tab = makeTab(norm, title);
      setActiveId(tab.id);
      const next = [...prev, tab];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
  }, []);

  const close = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        if (next.length === 0) return null;
        return (next[idx] ?? next[idx - 1] ?? next[0]).id;
      });
      return next;
    });
  }, []);

  const closeOthers = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id === id));
    setActiveId(id);
  }, []);

  const setMeta = useCallback((id: string, patch: Partial<Pick<Tab, "title" | "url">>) => {
    setTabs((prev) => prev.map((t) => (t.id === id
      ? { ...t, ...(patch.title ? { title: patch.title } : {}), ...(patch.url ? { url: normalizeUrl(patch.url) } : {}) }
      : t)));
  }, []);

  // ---- ดักคลิกลิงก์ภายใน (capture ก่อน Next <Link>) ให้เปิดเป็นแท็บ ----
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;             // เฉพาะลิงก์ภายใน
      if (href.startsWith("/api") || href.startsWith("/_next")) return;
      if (a.target === "_blank" || a.hasAttribute("download") || a.hasAttribute("data-no-tab")) return;
      e.preventDefault();
      open(href, a.textContent || undefined);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open]);

  // ---- รับชื่อ/ที่อยู่จริงจาก iframe (postMessage) ----
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.type !== "oa-tab" || !d.tabId) return;
      setMeta(d.tabId, { title: d.title, url: d.url });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setMeta]);

  const value = useMemo<Ctx>(() => ({ tabs, activeId, open, activate, close, closeOthers, setMeta }),
    [tabs, activeId, open, activate, close, closeOthers, setMeta]);

  return <TabsCtx.Provider value={value}>{children}</TabsCtx.Provider>;
}
