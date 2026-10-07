"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AppSwitcher from "@/components/AppSwitcher";
import { useT } from "@/components/I18nProvider";
import { Avatar } from "@/components/ui";
import { IconSearch, IconChevron, IconLogout, IconUsers } from "@/components/icons";
import { logoutAction } from "@/lib/actions";
import type { Role } from "@/lib/types";

type User = { name: string; position: string; email: string; role: Role };

/**
 * แถบบน — เลย์เอาต์เดียวกับระบบ Fixed Asset:
 * [ปุ่มเมนูมือถือ] [ช่องค้นหากลาง] … [สลับภาษา] [สลับโหมด] [เมนูผู้ใช้]
 * เมนูผู้ใช้ย้ายมาจากมุมล่างซ้ายของเมนู มาอยู่บนขวาเหมือน Asset
 */
export default function TopBar({ user, onMenu, mobileOpen }: { user: User; onMenu?: () => void; mobileOpen?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <header className="no-print sticky top-0 z-20 border-b border-border/70 bg-surface/70 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* ปุ่มเปิดเมนู (เฉพาะมือถือ) */}
        <button
          type="button"
          onClick={onMenu}
          className="btn-icon h-9 w-9 shrink-0 ring-0 hover:bg-surface-2 lg:hidden"
          aria-label={t("nav.expand")}
          aria-controls="workspace-navigation"
          aria-expanded={mobileOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* ช่องค้นหากลาง */}
        <form
          className="relative max-w-xl flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/requests?q=${encodeURIComponent(q)}`);
          }}
        >
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
            aria-label={t("list.searchPlaceholder")}
            className="h-9 w-full rounded-md bg-surface-2 pl-8 pr-3 text-sm text-text ring-1 ring-border placeholder:text-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <AppSwitcher />
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: User }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.name} size={32} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium text-text">{user.name}</span>
          <span className="block text-[11.5px] text-muted">{t(`role.${user.role}`)}</span>
        </span>
        <IconChevron className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-60 rounded-md border border-border bg-surface py-1 shadow-e3">
            <div className="border-b border-border px-3 py-2">
              <div className="truncate text-sm font-semibold text-text">{user.name}</div>
              {user.position && <div className="truncate text-xs text-muted">{user.position}</div>}
            </div>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-soft hover:bg-surface-2"
            >
              <IconUsers className="h-4 w-4" /> {t("profile.title")}
            </Link>
            <form action={logoutAction}>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-soft hover:bg-surface-2">
                <IconLogout className="h-4 w-4" /> {t("nav.logout")}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
