import { formatDate, money } from "./format";
import { isRange, isValueField, rangeDays } from "./form";
import type { Field } from "./types";
import type { Locale } from "./i18n/locales";

/**
 * ข้อมูลย่อของคำขอที่แสดงในรายการงาน
 *
 * ที่มา: บรรทัดในรายการเดิมบอกแค่หัวเรื่อง ผู้จัดทำ วันที่ และยอดเงิน ซึ่งเหมือนกัน
 * แทบทุกใบ — คนอนุมัติจึงต้องเปิดทีละใบเพื่อดูว่าเรื่องอะไรกันแน่ ทั้งที่คำตอบอยู่ใน
 * ช่องแรก ๆ ของฟอร์มเอง (งานไหน สาขาไหน ครบกำหนดเมื่อไหร่)
 *
 * หยิบมาแค่ไม่กี่ช่องพอให้แยกใบออกจากกันได้ ไม่ใช่ย่อทั้งฟอร์มลงมา — ถ้ายาวกว่านี้
 * รายการจะกลายเป็นเอกสารซ้อนเอกสาร แล้วหมดประโยชน์ของการเป็น "รายการ"
 */

/** ชนิดที่ย่อลงมาเป็นบรรทัดเดียวไม่ได้ — ตารางและไฟล์ต้องเปิดดูของจริง */
const TOO_BIG = new Set(["TABLE", "FILE", "IMAGE", "HEADING"]);

/**
 * ช่องที่ควรยกมาแสดง
 *
 * ตัดช่องที่ระบบแสดงไว้ที่อื่นบนบรรทัดเดียวกันอยู่แล้วออก (หัวเรื่อง ยอดเงิน วันที่เอกสาร)
 * ไม่งั้นจะเห็นค่าเดียวกันสองที่ในบรรทัดเดียว
 */
export function pickPreviewFields(fields: Field[], limit = 3): Field[] {
  return fields
    .filter(
      (f) =>
        f.active === 1 &&
        isValueField(f) &&
        !TOO_BIG.has(f.type) &&
        f.field_role !== "TITLE" &&
        f.field_role !== "AMOUNT" &&
        f.field_role !== "DATE",
    )
    .slice(0, limit);
}

/** ค่าของช่องหนึ่งในรูปข้อความสั้น — คืนค่าว่างเมื่อยังไม่ได้กรอก จะได้ข้ามไป */
export function previewValue(field: Field, value: unknown, locale: Locale): string {
  if (value === null || value === undefined) return "";

  if (field.type === "DATERANGE") {
    if (!isRange(value) || !value.from || !value.to) return "";
    const days = rangeDays(value);
    const span = `${formatDate(value.from, locale)} – ${formatDate(value.to, locale)}`;
    return days === null ? span : `${span} (${days})`;
  }
  if (field.type === "DATE") {
    const s = String(value).trim();
    return s ? formatDate(s, locale) : "";
  }
  if (field.type === "MONEY") {
    return value === "" ? "" : money(Number(value), locale);
  }
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(", ");

  return String(value).trim();
}
