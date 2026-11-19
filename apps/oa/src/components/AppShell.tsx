"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useT } from "@/components/I18nProvider";
import TopBar from "@/components/TopBar";
import HelpAssistant from "@/components/HelpAssistant";
import { TabsProvider } from "@/components/tabs/TabsContext";
import TabBar from "@/components/tabs/TabBar";
import TabWorkspace from "@/components/tabs/TabWorkspace";
import EmbedReporter from "@/components/tabs/EmbedReporter";
import type { Role } from "@/lib/types";
import type { MenuKey } from "@/lib/menu-access";

/**
 * เปลือกของแอป — คุมเมนูข้างบนมือถือ (drawer สไลด์)
 * จอใหญ่: sidebar อยู่ประจำ · มือถือ: ซ่อนไว้ กด hamburger ใน topbar เพื่อสไลด์เข้ามา
 */
export default function AppShell({
  user,
  pending,
  visibleKeys,
  children,
}: {
  user: { name: string; position: string; email: string; role: Role; avatar_url?: string };
  pending: number;
  visibleKeys?: MenuKey[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const search = useSearchParams();
  const pathname = usePathname();
  // โหมด embed = หน้าลูกที่ถูกโหลดใน iframe ของแท็บ → แสดงเฉพาะเนื้อหา ไม่มี sidebar/topbar/แท็บ
  const embed = search.get("embed") === "1";
  const initialUrl = (() => {
    const sp = new URLSearchParams(search.toString());
    sp.delete("embed"); sp.delete("_tab");
    const qs = sp.toString();
    return pathname + (qs ? `?${qs}` : "");
  })();

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById("workspace-navigation");
    const content = contentRef.current;
    const oldOverflow = document.body.style.overflow;
    if (content) content.inert = true;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]'
    ) ?? []).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", handleKey);
    return () => {
      if (content) content.inert = false;
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleKey);
      desktop.removeEventListener("change", closeOnDesktop);
      previous?.focus();
    };
  }, [mobileOpen]);

  // หน้าลูกใน iframe: เนื้อหาล้วน + ตัวรายงานชื่อแท็บกลับไปฝั่งพ่อ (ไม่ซ้อน shell)
  if (embed) {
    return (
      <>
        {children}
        <EmbedReporter />
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <a href="#main" className="skip-link btn-primary">{t("workspace.skip")}</a>
      {/* ฉากหลังทึบ (เฉพาะมือถือตอนเปิดเมนู) — แตะเพื่อปิด */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Suspense
        fallback={<div className="hidden w-[256px] shrink-0 border-r border-border bg-surface lg:block" />}
      >
        <Sidebar
          isAdmin={user.role === "ADMIN"}
          visibleKeys={visibleKeys}
          pending={pending}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />
      </Suspense>

      <TabsProvider initialUrl={initialUrl}>
        <div ref={contentRef} className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar user={user} onMenu={() => setMobileOpen(true)} mobileOpen={mobileOpen} />
          <main id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabBar />
            <TabWorkspace />
          </main>
        </div>
      </TabsProvider>
      <HelpAssistant />
    </div>
  );
}
