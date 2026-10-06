'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang, Localized } from '../types';
import en from './en';
import th from './th';
import zh from './zh';

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof en>;

const DICTS: Record<Lang, Dict> = { th, en, zh };
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'th', label: 'ไทย', short: 'TH' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh', label: '中文', short: '中' },
];

function lookup(d: unknown, key: string): string | undefined {
  let cur: unknown = d;
  for (const k of key.split('.')) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  L: (v: Localized | undefined | null) => string;
  money: (n: number, digits?: number) => string;
  num: (n: number) => string;
  date: (iso: string | null | undefined) => string;
  dateTime: (iso: string | null | undefined) => string;
  period: (p: string) => string;
  periodShort: (p: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);
const LOCALE: Record<Lang, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fa.lang') as Lang | null;
      if (saved && saved in DICTS) setLangState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('fa.lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nCtx>(() => {
    const dict = DICTS[lang];
    const locale = LOCALE[lang];
    const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const df = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' });
    const dtf = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const pf = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
    const psf = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' });
    return {
      lang,
      setLang,
      t: (key, vars) => {
        let s = lookup(dict, key) ?? lookup(en, key) ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
        return s;
      },
      L: (v) => (v ? v[lang] || v.en || v.th : ''),
      money: (n, digits = 2) =>
        digits === 0 ? nf0.format(n) : nf2.format(n),
      num: (n) => nf0.format(n),
      date: (iso) => (iso ? df.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : '—'),
      dateTime: (iso) => (iso ? dtf.format(new Date(iso)) : '—'),
      period: (p) => pf.format(new Date(`${p}-01T00:00:00`)),
      periodShort: (p) => psf.format(new Date(`${p}-01T00:00:00`)),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used within I18nProvider');
  return v;
}
