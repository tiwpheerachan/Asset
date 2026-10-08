'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  FileBarChart2,
  FolderTree,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  RotateCcw,
  Search,
  Settings,
  TrendingDown,
  Workflow,
  X,
} from 'lucide-react';
import { LANGS, useI18n } from '@/lib/i18n';
import { CURRENT_PERIOD, useStore } from '@/lib/store';
import { AppSwitcher } from './app-switcher';
import { HelpAssistant } from './help-assistant';
import { cx } from './ui';

const NAV = [
  { group: 'nav.groupMain', items: [
    { href: '/', key: 'nav.dashboard', icon: LayoutDashboard },
    { href: '/flow', key: 'nav.flow', icon: Workflow },
  ] },
  {
    group: 'nav.groupOps',
    items: [
      { href: '/oa-import', key: 'nav.oaImport', icon: Inbox, badge: 'oa' as const },
      { href: '/assets', key: 'nav.assets', icon: Boxes },
      { href: '/locations', key: 'nav.locations', icon: MapPin },
      { href: '/verify', key: 'nav.verify', icon: ClipboardCheck },
      { href: '/documents', key: 'nav.documents', icon: Paperclip },
    ],
  },
  {
    group: 'nav.groupAcc',
    items: [
      { href: '/categories', key: 'nav.categories', icon: FolderTree },
      { href: '/depreciation', key: 'nav.depreciation', icon: TrendingDown },
      { href: '/reports', key: 'nav.reports', icon: FileBarChart2 },
      { href: '/knowledge', key: 'nav.knowledge', icon: BookOpen },
    ],
  },
  {
    group: 'nav.groupGov',
    items: [
      { href: '/audit', key: 'nav.audit', icon: History },
      { href: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

export function LangSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded-md border border-line bg-white p-0.5 shadow-card">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={cx(
            'rounded px-2 py-1 text-[12.5px] font-medium transition-colors',
            lang === l.code ? 'bg-brand-600 text-white' : 'text-ink-3 hover:text-ink',
          )}
          title={l.label}
        >
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center">
      <img src="/one-asset-logo.png" alt="ONE Asset" className="h-14 w-auto select-none" draggable={false} />
    </div>
  );
}

function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const path = usePathname();
  const { t } = useI18n();
  const { state } = useStore();
  const oaPending = state.oa.filter((o) => ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].includes(o.status)).length;
  return (
    <nav className="flex h-full flex-col">
      <div className={cx('flex h-16 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'gap-2 px-3')}>
        {!collapsed && <Logo />}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={cx(
              'hidden shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-canvas hover:text-ink lg:inline-flex',
              !collapsed && 'ml-auto',
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.8} /> : <PanelLeftClose size={18} strokeWidth={1.8} />}
          </button>
        )}
      </div>
      <div className={cx('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-2.5')}>
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            {collapsed ? (
              <div className="mx-1 mb-2 border-t border-line/70 first:border-0" />
            ) : (
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t(g.group)}</div>
            )}
            {g.items.map((it) => {
              const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
              const Icon = it.icon;
              const hasBadge = 'badge' in it && it.badge === 'oa' && oaPending > 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  title={collapsed ? t(it.key) : undefined}
                  className={cx(
                    'relative mb-0.5 flex items-center rounded-md py-[7px] text-[13.5px] transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-2.5 px-2',
                    active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-2 hover:bg-canvas',
                  )}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-brand-600' : 'text-ink-3'} />
                  {!collapsed && <span className="flex-1 truncate">{t(it.key)}</span>}
                  {!collapsed && hasBadge && (
                    <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{oaPending}</span>
                  )}
                  {collapsed && hasBadge && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {!collapsed && (
        <div className="border-t border-line p-3">
          <img src="/one-asset-card.png" alt="ONE Asset" className="w-full select-none rounded-xl" draggable={false} />
          <Link
            href="/help"
            onClick={onNavigate}
            className="mt-2 flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-[12px] font-semibold text-white transition hover:bg-brand-700"
          >
            คู่มือการใช้งาน →
          </Link>
        </div>
      )}
    </nav>
  );
}

function UserMenu() {
  const { userName, role, signOut, resetDemo } = useStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-canvas">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-700">
          {userName.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium text-ink">{userName}</span>
          <span className="block text-[11.5px] text-ink-3">{t(`role.${role}`)}</span>
        </span>
        <ChevronDown size={15} className="text-ink-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-60 rounded-md border border-line bg-white py-1 shadow-pop">
            <div className="border-b border-line px-3 py-2 text-[12px] text-ink-3">{t(`role.${role}_desc`)}</div>
            <button
              onClick={() => {
                resetDemo();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-canvas"
            >
              <RotateCcw size={15} /> Reset demo data
            </button>
            <button
              onClick={() => {
                signOut();
                router.push('/login');
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-canvas"
            >
              <LogOut size={15} /> {t('common.signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, period } = useI18n();
  const { state, ready } = useStore();
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState('');
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (ready && !state.session) router.replace('/login');
  }, [ready, state.session, router]);

  useEffect(() => setMobile(false), [path]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('fa_nav_collapsed') === '1');
    } catch {}
  }, []);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      const v = !c;
      try {
        localStorage.setItem('fa_nav_collapsed', v ? '1' : '0');
      } catch {}
      return v;
    });

  if (!ready || !state.session) {
    return <div className="flex h-screen items-center justify-center text-[13px] text-ink-3">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-30 hidden border-r border-line/70 bg-white/70 backdrop-blur-xl transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-pop">
            <button className="absolute right-2 top-3 rounded p-1 text-ink-3" onClick={() => setMobile(false)}>
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <div className={cx('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 bg-white/70 px-4 backdrop-blur-xl md:px-6">
          <button className="rounded p-1.5 text-ink-2 hover:bg-canvas lg:hidden" onClick={() => setMobile(true)} aria-label="menu">
            <Menu size={20} />
          </button>
          <form
            className="relative max-w-xl flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/assets?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.globalSearch')}
              className="h-9 w-full rounded-md border border-line bg-canvas pl-8 pr-3 text-[13.5px] placeholder:text-ink-4 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden rounded-md border border-line px-2 py-1 text-[12px] text-ink-3 xl:inline">
              {t('common.period')}: <b className="font-semibold text-ink-2">{period(CURRENT_PERIOD)}</b>
            </span>
            <AppSwitcher />
            <LangSwitch compact />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-6">{children}</main>
      </div>
      <HelpAssistant />
    </div>
  );
}
