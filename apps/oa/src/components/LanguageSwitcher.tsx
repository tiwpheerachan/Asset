"use client";

import { setLocaleAction } from "@/lib/i18n/actions";
import { useI18n } from "@/components/I18nProvider";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/locales";

/** ปุ่มสลับภาษาแบบ segmented — ไทย / EN / 中文 */
export default function LanguageSwitcher() {
  const { locale, t } = useI18n();

  return (
    <form action={setLocaleAction} className="flex rounded-xl bg-surface-2 p-0.5 ring-1 ring-border"
          aria-label={t("lang.label")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          type="submit"
          aria-current={locale === l}
          className={`rounded-xl px-2.5 py-1 text-xs transition ${
            locale === l
              ? "bg-surface font-medium text-primary-text ring-1 ring-border"
              : "text-text-soft hover:text-text"
          }`}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </form>
  );
}
