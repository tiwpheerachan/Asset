"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  IconBuilding, IconChart, IconChevron, IconChevronLeft,
  IconCheckCircle, IconClock, IconDownload, IconForm, IconHome, IconInbox,
  IconTypeTable, IconLink,
  IconSend, IconSettings, IconShield, IconUsers,
} from "@/components/icons";
import { useT } from "@/components/I18nProvider";

type Item = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  badge?: number;
  /** สีประจำเมนู — ทำให้จำเมนูได้ด้วยสี ไม่ใช่ด้วยตำแหน่งอย่างเดียว */
  accent?: string;
  /** ตรงเมื่อ path เท่ากันและ query ที่ระบุตรงกันด้วย (ใช้แยกแท็บในหน้าเดียวกัน) */
  match?: (path: string, tab: string | null) => boolean;
};

type Group = { title: string; icon: (p: { className?: string }) => React.ReactElement; items: Item[] };

export default function Sidebar({
  isAdmin = false,
  pending,
  mobileOpen = false,
  onNavigate,
}: {
  isAdmin?: boolean;
  pending: number;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const groups: Group[] = [
    {
      title: t("nav.group.mine"),
      icon: IconHome,
      items: [
        { href: "/", label: t("nav.submit"), icon: IconSend, accent: "accent-primary", match: (p) => p === "/" },
        {
          href: "/requests?tab=awaiting",
          label: t("nav.awaitingMe"),
          icon: IconCheckCircle,
          accent: "accent-amber",
          badge: pending,
          match: (p, tab) => p === "/requests" && tab === "awaiting",
        },
        {
          href: "/requests?tab=mine",
          label: t("nav.myRequests"),
          icon: IconInbox,
          accent: "accent-violet",
          match: (p, tab) => p === "/requests" && tab === "mine",
        },
      ],
    },
    {
      title: t("nav.group.requests"),
      icon: IconSend,
      items: [
        {
          href: "/requests",
          label: t("nav.center"),
          icon: IconInbox,
          accent: "accent-teal",
          match: (p, tab) => p === "/requests" && !tab,
        },
        {
          // มุมมองตารางแยกเมนูจากศูนย์การอนุมัติ เพราะคนละงานกัน — ศูนย์การอนุมัติคือ
          // "ฉันต้องทำอะไรต่อ" ส่วนตารางรวมคือ "ภาพรวมทั้งหมดไว้กวาดตาและส่งออก"
          href: "/requests/table",
          label: t("grid.title"),
          icon: IconTypeTable,
          accent: "accent-violet",
          match: (p) => p.startsWith("/requests/table"),
        },
      ],
    },
  ];

  if (isAdmin) {
    // ทุกหน้าผู้ดูแลต้องมีทางเข้าจากเมนู — หน้าที่ไม่มีทางเข้าเท่ากับไม่มีอยู่จริง
    // สำหรับคนใช้งาน
    const startsWith = (prefix: string) => (p: string) => p.startsWith(prefix);
    groups.push({
      title: t("nav.group.admin"),
      icon: IconBuilding,
      items: [
        { href: "/admin/forms", label: t("nav.forms"), icon: IconForm, accent: "accent-sky", match: startsWith("/admin/forms") },
        { href: "/admin/analytics", label: t("analytics.title"), icon: IconChart, accent: "accent-emerald", match: startsWith("/admin/analytics") },
      ],
    });
    groups.push({
      title: t("nav.group.system"),
      icon: IconSettings,
      items: [
        { href: "/admin/reminders", label: t("remind.title"), icon: IconClock, accent: "accent-orange", match: startsWith("/admin/reminders") },
        { href: "/admin/api", label: t("api.title"), icon: IconLink, accent: "accent-teal", match: startsWith("/admin/api") },
        { href: "/admin/backup", label: t("backup.title"), icon: IconDownload, accent: "accent-emerald", match: startsWith("/admin/backup") },
        { href: "/admin/sso", label: t("sso.title"), icon: IconShield, accent: "accent-violet", match: startsWith("/admin/sso") },
      ],
    });
  }

  const isActive = (item: Item) =>
    item.match ? item.match(path, tab) : path === item.href;

  return (
    <aside
      id="workspace-navigation"
      aria-label={t("app.short")}
      className={`app-sidebar no-print fixed inset-y-0 left-0 z-40 flex h-screen w-[256px] flex-col border-r border-border bg-surface shadow-e3 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:transition-[width] ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "lg:w-[72px]" : "lg:w-[256px]"}`}
    >
      {/* หัวแถบเมนู */}
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-6">
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-text">
            {t("app.short")}
          </span>
        )}
        {/* จอใหญ่: ปุ่มยุบ · มือถือ: ปุ่มปิด drawer */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="btn-icon hidden h-7 w-7 ring-0 hover:bg-surface-2 lg:inline-flex"
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          <IconChevronLeft className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onNavigate}
          className="btn-icon h-7 w-7 ring-0 hover:bg-surface-2 lg:hidden"
          aria-label={t("nav.collapse")}
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {groups.map((g) => {
          const shut = closed[g.title];
          return (
            <div key={g.title}>
              {collapsed ? (
                <div className="mt-3 flex justify-center py-1 text-muted first:mt-1">
                  <g.icon className="h-4 w-4" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setClosed({ ...closed, [g.title]: !shut })}
                  className="nav-group group"
                  aria-expanded={!shut}
                >
                  <span className="flex-1 text-left">{g.title}</span>
                  <IconChevron
                    className={`h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100 ${
                      shut ? "-rotate-90" : ""
                    }`}
                  />
                </button>
              )}

              {!shut && (
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = isActive(item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          title={collapsed ? item.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={`nav-item ${item.accent ?? "accent-primary"} ${
                            active ? "nav-item-active" : ""
                          } ${collapsed ? "justify-center px-0" : ""}`}
                        >
                          <item.icon className="nav-ico h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                          {item.badge ? (
                            <span
                              className={`flex items-center justify-center rounded-full bg-no font-semibold text-white ${
                                collapsed
                                  ? "absolute right-1.5 top-1 h-2 w-2 p-0"
                                  : "h-[18px] min-w-[18px] px-1 text-[11px]"
                              }`}
                            >
                              {!collapsed && item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}
