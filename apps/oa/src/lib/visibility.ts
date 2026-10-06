import type { Field } from "./types";
import type { FormValues } from "./form";

/**
 * ช่องที่แสดงเมื่อเข้าเงื่อนไข ("ช่องนี้โผล่เมื่อช่องก่อนหน้าเลือกค่านี้")
 *
 * ฟอร์มขออนุมัติจริงมีช่องที่ใช้เฉพาะบางกรณีเสมอ เช่น "เหตุผลที่ขอเกินวงเงิน"
 * ที่ควรโผล่เฉพาะตอนเลือกว่าเกินวงเงิน การโชว์ทุกช่องตลอดเวลาทำให้ฟอร์มยาวเกินจำเป็น
 * และคนกรอกต้องเดาเองว่าช่องไหนเกี่ยวกับตน
 *
 * กติกาที่ยึดไว้ให้เข้าใจง่าย: อ้างได้เฉพาะช่องชนิดตัวเลือกที่อยู่ "ก่อนหน้า" เท่านั้น
 * อ้างย้อนหลังอย่างเดียวจึงวนเป็นวงกลมไม่ได้ตั้งแต่ต้น และคนกรอกอ่านจากบนลงล่าง
 * ก็เห็นเหตุก่อนผลเสมอ
 */

/** ค่าของช่องควบคุมตรงกับที่ตั้งไว้ไหม — MULTISELECT นับว่าตรงเมื่อ "มี" ค่านั้นอยู่ */
function matches(value: unknown, want: string): boolean {
  if (Array.isArray(value)) return value.some((v) => String(v) === want);
  return String(value ?? "") === want;
}

/**
 * ช่องนี้ควรแสดงไหม เมื่อดูจากค่าที่กรอกมาแล้ว
 *
 * ถ้าช่องควบคุมเองก็ถูกซ่อนอยู่ ช่องลูกต้องซ่อนตามด้วย ไม่งั้นจะเกิดกรณีที่คนกรอก
 * มองไม่เห็นเหตุผลว่าทำไมช่องนี้ถึงโผล่มา
 */
export function isFieldVisible(field: Field, fields: Field[], values: FormValues): boolean {
  const seen = new Set<string>();
  let cur: Field | undefined = field;

  while (cur?.show_if_key) {
    if (seen.has(cur.field_key)) return true; // กันวนซ้ำ (ข้อมูลเก่าที่อาจตั้งไว้ผิด)
    seen.add(cur.field_key);

    const parent: Field | undefined = fields.find((f) => f.field_key === cur!.show_if_key);
    // ช่องควบคุมหายไปแล้ว (ถูกลบทีหลัง) — แสดงไว้ดีกว่าซ่อนข้อมูลที่อาจจำเป็น
    if (!parent) return true;
    if (!matches(values[parent.field_key], cur.show_if_value)) return false;
    cur = parent;
  }
  return true;
}

/** ช่องที่ต้องแสดงทั้งหมด ตามค่าที่กรอกมา ณ ตอนนี้ */
export function visibleFields(fields: Field[], values: FormValues): Field[] {
  return fields.filter((f) => isFieldVisible(f, fields, values));
}

/** ช่องที่ตั้งเป็น "ช่องควบคุม" ของช่องที่กำลังแก้ได้ — ตัวเลือกที่อยู่ก่อนหน้าเท่านั้น */
export function conditionSources(fields: Field[], target: Field): Field[] {
  return fields.filter(
    (f) =>
      f.id !== target.id &&
      f.active &&
      (f.type === "SELECT" || f.type === "DROPDOWN" || f.type === "MULTISELECT") &&
      f.options.length > 0 &&
      f.sort_order < target.sort_order,
  );
}
