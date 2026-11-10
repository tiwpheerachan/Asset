import "server-only";
import { db } from "../db";

/**
 * ชั้น amount mapping — แต่ละฟอร์มเก็บยอดเงินคนละช่อง (nested/ชื่อต่างกัน)
 * map: form_code -> ชื่อช่องยอด (เก็บใน app_meta 'oa_amount_map', auto-detect มาแล้ว แก้ได้)
 * สกุลเงินส่วนใหญ่เป็น THB — รุ่นนี้รวมเป็นยอด "ตามที่กรอก" (ยังไม่แปลง FX)
 */

export async function getAmountMap(): Promise<Record<string, string>> {
  const r = await db.prepare("SELECT value FROM app_meta WHERE key = 'oa_amount_map'").get<{ value: string }>();
  try { return r?.value ? JSON.parse(r.value) : {}; } catch { return {}; }
}

export async function setAmountMap(map: Record<string, string>): Promise<void> {
  await db.prepare("INSERT INTO app_meta (key, value) VALUES ('oa_amount_map', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value").run(JSON.stringify(map));
}

const esc = (s: string) => s.replace(/'/g, "''");

/** SQL expression: ยอดเงินของแต่ละแถว (เลือก key ตาม table_id จาก map, ดึงตัวเลขตัวแรก) */
export function amountExpr(map: Record<string, string>): string {
  const whens = Object.entries(map).map(([form, key]) => `WHEN '${esc(form)}' THEN '${esc(key)}'`).join(" ");
  if (!whens) return "0::numeric";
  const keyExpr = `(CASE table_id ${whens} ELSE NULL END)`;
  return `COALESCE(NULLIF(replace((regexp_match(fields->'fields'->>${keyExpr}, '[0-9][0-9,]*\\.?[0-9]*'))[1], ',', ''), '')::numeric, 0)`;
}

/** ย่อยอดเงิน: ฿218.4M / ฿18.4K / ฿1,234 */
export function fmtBaht(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `฿${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `฿${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `฿${(n / 1e3).toFixed(1)}K`;
  return `฿${Math.round(n).toLocaleString("th-TH")}`;
}
