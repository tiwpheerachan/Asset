import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locales";
import { getDictionary, translator, type T } from "./index";

/** ภาษาที่ผู้ใช้เลือกไว้ — เก็บใน cookie จึงอ่านได้ทั้งใน server component และ action */
export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/** ใช้ในหน้า server: const t = await getT(); */
export async function getT(): Promise<T> {
  return translator(await getLocale());
}

/** ใช้ตอนต้องส่ง dictionary ทั้งชุดไปให้ client component */
export async function getLocaleBundle(): Promise<{
  locale: Locale;
  dict: Record<string, string>;
}> {
  const locale = await getLocale();
  return { locale, dict: getDictionary(locale) };
}
