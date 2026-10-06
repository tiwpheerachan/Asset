"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type T } from "@/lib/i18n";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

type Ctx = { locale: Locale; t: T };

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  t: (k) => String(k),
});

/** ส่ง dictionary ที่ server เลือกไว้แล้วลงมาให้ client component ทั้งหมดใช้ร่วมกัน */
export default function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Record<string, string>;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: makeT(dict) }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** ทางลัดที่ใช้บ่อยที่สุด: const t = useT(); */
export function useT(): T {
  return useContext(I18nContext).t;
}
