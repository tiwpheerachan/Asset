import { dictionaryFor, type MessageKey } from "./messages";
import { DEFAULT_LOCALE, type Locale } from "./locales";

export type Vars = Record<string, string | number>;

/** แทนที่ {name} ในข้อความด้วยค่าที่ส่งมา */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}

export type T = (key: MessageKey | string, vars?: Vars) => string;

/** สร้างฟังก์ชันแปลจาก dictionary ที่โหลดมาแล้ว */
export function makeT(dict: Record<string, string>): T {
  return (key, vars) => interpolate(dict[key] ?? key, vars);
}

const CACHE = new Map<Locale, Record<string, string>>();

export function getDictionary(locale: Locale): Record<string, string> {
  const hit = CACHE.get(locale);
  if (hit) return hit;
  const dict = dictionaryFor(locale);
  CACHE.set(locale, dict);
  return dict;
}

export function translator(locale: Locale = DEFAULT_LOCALE): T {
  return makeT(getDictionary(locale));
}

export type { MessageKey };
