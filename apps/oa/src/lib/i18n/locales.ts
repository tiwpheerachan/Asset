export const LOCALES = ["th", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "th";

/** ป้ายบนปุ่มสลับภาษา — เขียนด้วยภาษาของตัวเองเสมอ */
export const LOCALE_LABEL: Record<Locale, string> = {
  th: "ไทย",
  en: "EN",
  zh: "中文",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  th: "th",
  en: "en",
  zh: "zh-Hans",
};

export const LOCALE_COOKIE = "ia-lang";

export const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);
