"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useT } from "@/components/I18nProvider";
import TopBar from "@/components/TopBar";
import type { Role } from "@/lib/types";

/**
 * เปลือกของแอป — คุมเมนูข้างบนมือถือ (drawer สไลด์)
 * จอใหญ่: sidebar อยู่ประจำ · มือถือ: ซ่อนไว้ กด hamburger ใน topbar เพื่อสไลด์เข้ามา
 */
export default function AppShell({
  user,
  pending,
  children,
}: {
  user: { name: string; position: string; email: string; role: Role };
  pending: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);

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
          pending={pending}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />
      </Suspense>

      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onMenu={() => setMobileOpen(true)} mobileOpen={mobileOpen} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
