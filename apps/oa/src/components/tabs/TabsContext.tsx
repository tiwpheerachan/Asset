"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MENU_CATALOG } from "@/lib/menu-access";

/**
 * แท็บด้านบนแบบประวัติการเข้า (client-side · ไม่ใช้ iframe)
 * - เปิดหน้าไหนก็เก็บเป็นแท็บ · คลิกสลับ = นำทางแบบ SPA (เร็ว ไม่โหลดใหม่จากเซิร์ฟเวอร์)
 * - ปิดแท็บได้ · จำไว้ใน sessionStorage · ไม่มีการซ้อน shell เพราะไม่มี iframe
 */
export type Tab = { url: string; title: string };
type Ctx = {
  tabs: Tab[];
  activeUrl: string;
  open: (url: string, title?: string) => void;
  close: (url: string) => void;
};

const TabsCtx = createContext<Ctx | null>(null);
export const useTabs = () => useContext(TabsCtx);

const KEY = "oa-tabs-v2";
const MAX = 12;

/** ตั้งชื่อแท็บจาก path — ยึดเมนูใน catalog ก่อน แล้วเดาจากกรณีพิเศษ */
function labelFor(pathname: string): string {
  const hit = [...MENU_CATALOG]
    .filter((m) => m.href !== "/" && pathname.startsWith(m.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (hit) return hit.label[0];
  if (pathname === "/") return "ส่งคำขอ";
  if (/^\/admin\/users\/\d+/.test(pathname)) return "โปรไฟล์ผู้ใช้";
  if (/^\/requests\/\d+/.test(pathname)) return `คำขอ ${pathname.split("/")[2]}`;
  if (pathname.startsWith("/requests/new")) return "สร้างคำขอ";
  if (pathname.startsWith("/profile")) return "โปรไฟล์ของฉัน";
  if (pathname.startsWith("/help")) return "คู่มือ";
  return pathname;
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const qs = search.toString();
  const url = pathname + (qs ? `?${qs}` : "");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const hydrated = useRef(false);

  // โหลดจาก sessionStorage ครั้งแรก
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setTabs(JSON.parse(raw) as Tab[]);
    } catch { /* ignore */ }
    hydrated.current = true;
  }, []);

  // เก็บหน้าปัจจุบันเป็นแท็บ (เพิ่ม/อัปเดตชื่อ)
  useEffect(() => {
    if (!hydrated.current) return;
    setTabs((prev) => {
      const title = labelFor(pathname);
      const existing = prev.find((t) => t.url === url);
      let next = existing
        ? prev.map((t) => (t.url === url ? { ...t, title } : t))
        : [...prev, { url, title }];
      if (next.length > MAX) next = next.slice(next.length - MAX);
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [url, pathname]);

  const open = useCallback((u: string) => router.push(u), [router]);

  const close = useCallback((u: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.url === u);
      const next = prev.filter((t) => t.url !== u);
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      if (u === url && next.length > 0) {
        const nb = next[Math.min(idx, next.length - 1)];
        router.push(nb.url);
      }
      return next;
    });
  }, [url, router]);

  return <TabsCtx.Provider value={{ tabs, activeUrl: url, open, close }}>{children}</TabsCtx.Provider>;
}
