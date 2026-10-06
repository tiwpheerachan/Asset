/**
 * อ่าน/ตรวจ/แสดงค่าของฟอร์มที่สร้างจากแม่แบบ
 * ค่าทุกฟิลด์ของคำขอเก็บเป็น JSON ก้อนเดียวใน requests.data — ไฟล์นี้คือกติกาของก้อนนั้น
 */
import type { Field, FieldColumn } from "./types";
import { isFieldVisible } from "./visibility";
import { todayLocal } from "./format";

export type FormValues = Record<string, unknown>;
export type TableRow = Record<string, unknown>;

/** ชื่อ input ในฟอร์ม — นำหน้าด้วย f_ เพื่อไม่ชนกับฟิลด์ระบบ (intent, request_id, ...) */
export const inputName = (key: string) => `f_${key}`;

const toNumber = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const isBlank = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  // ช่วงเวลาถือว่ายังไม่ได้กรอกจนกว่าจะมีทั้งวันเริ่มและวันสิ้นสุด — กรอกข้างเดียว
  // ไม่ได้บอกอะไรเลยว่างานกินเวลาแค่ไหน
  if (isRange(v)) return !v.from || !v.to;
  return false;
};

export type DateRange = { from: string; to: string };

export const isRange = (v: unknown): v is DateRange =>
  typeof v === "object" && v !== null && "from" in v && "to" in v;

/**
 * ไฟล์แนบที่อยู่ใน "เซลล์" ของตาราง
 *
 * ที่มา: ฟอร์มจริงมีคอลัมน์อย่าง invoice&Quotation ที่ต้องแนบไฟล์ของรายการนั้น ๆ
 * ไฟล์แนบเดิมผูกกับเอกสารทั้งใบ พอมีสิบรายการก็ได้ไฟล์สิบก้อนกองรวมกันโดยไม่รู้ว่า
 * ก้อนไหนเป็นของรายการไหน จึงต้องผูกไฟล์กับแถว ไม่ใช่กับเอกสาร
 *
 * แถวจึงต้องมีรหัสประจำตัว (_id) ที่ไม่เปลี่ยนแม้จะสลับลำดับหรือลบแถวอื่นทิ้ง —
 * ใช้ลำดับที่ของแถวเป็นตัวอ้างอิงไม่ได้ เพราะลบแถวที่ 1 ทิ้งแล้วไฟล์ของแถวที่ 2
 * จะกลายเป็นของแถวที่ 1 ทันที
 */
export const ROW_ID = "_id";

/** คั่นด้วย ~ เพราะรหัสช่องและรหัสคอลัมน์เป็น [a-zA-Z0-9_] เท่านั้น จึงไม่มีทางชนกัน */
export const cellKey = (fieldKey: string, rowId: string, colKey: string) =>
  `${fieldKey}~${rowId}~${colKey}`;

/** ชื่อ input ของช่องแนบไฟล์ในเซลล์ — นำหน้าด้วย tf~ ให้ฝั่งเซิร์ฟเวอร์กวาดเก็บได้ */
export const cellFileName = (fieldKey: string, rowId: string, colKey: string) =>
  `tf~${cellKey(fieldKey, rowId, colKey)}`;

/** แยก field_key ของไฟล์แนบกลับเป็นสามส่วน — คืน null ถ้าไม่ใช่ไฟล์ในเซลล์ */
export function parseCellKey(
  key: string,
): { fieldKey: string; rowId: string; colKey: string } | null {
  const parts = key.split("~");
  if (parts.length !== 3 || parts.some((p) => p === "")) return null;
  return { fieldKey: parts[0], rowId: parts[1], colKey: parts[2] };
}

/** รหัสแถวใหม่ — สั้นพอให้อยู่ในชื่อ input ได้ และไม่ซ้ำกันในทางปฏิบัติ */
export function newRowId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `r${rnd}`;
}

/** ชื่อ input ของสองปลายช่วงเวลา — เก็บเป็นค่าเดียวแต่กรอกสองช่อง */
export const rangeName = (key: string, end: "from" | "to") => `${inputName(key)}_${end}`;

/**
 * ช่วงเวลากินเวลากี่วัน — นับแบบรวมวันแรกและวันสุดท้าย
 *
 * งานที่เริ่มและจบวันเดียวกันคือทำงาน 1 วัน ไม่ใช่ 0 วัน ซึ่งเป็นวิธีนับแบบที่คน
 * คุยกันจริงเวลาบอกว่า "งานนี้ใช้เวลากี่วัน"
 */
export function rangeDays(v: unknown): number | null {
  if (!isRange(v) || !v.from || !v.to) return null;
  const a = Date.parse(`${v.from}T00:00:00Z`);
  const b = Date.parse(`${v.to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** ฟิลด์ที่เก็บค่าลง data JSON (FILE/IMAGE เก็บเป็นไฟล์แนบแยก จึงไม่นับ) */
/** ช่องที่เก็บค่าลงเอกสารจริง — ไฟล์แนบเก็บแยกตาราง ส่วนหัวข้อคั่นไม่มีค่าให้เก็บ */
export const isValueField = (f: Field) =>
  f.type !== "FILE" && f.type !== "IMAGE" && f.type !== "HEADING";

function coerceColumn(col: FieldColumn, raw: unknown): unknown {
  if (col.type === "NUMBER" || col.type === "MONEY") return toNumber(raw);
  if (col.type === "USER") return toNumber(raw);
  if (col.type === "MULTISELECT") {
    const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
    return list.map((v) => String(v).trim()).filter((v) => v !== "");
  }
  // ไฟล์ในเซลล์ไม่ได้เก็บค่าลง data — ตัวไฟล์อยู่ในตารางไฟล์แนบ ผูกกับ _id ของแถว
  if (col.type === "FILE") return "";
  return String(raw ?? "").trim();
}

function coerceField(field: Field, form: FormData): unknown {
  const name = inputName(field.field_key);

  switch (field.type) {
    case "NUMBER":
    case "MONEY":
      return toNumber(form.get(name));

    case "USER":
    // อ้างอิงคำขอเก็บเป็น id ไม่ใช่เลขที่เอกสาร — เลขที่เปลี่ยนรูปแบบได้ (เคยเปลี่ยนมาแล้ว)
    // แต่ id ไม่เปลี่ยน และผูกกลับไปหาเอกสารจริงได้เสมอ
    case "REQUEST":
      return toNumber(form.get(name));

    case "MULTISELECT":
      return form.getAll(name).map((v) => String(v)).filter((v) => v !== "");

    case "TABLE": {
      let rows: unknown;
      try {
        rows = JSON.parse(String(form.get(name) ?? "[]"));
      } catch {
        return [];
      }
      if (!Array.isArray(rows)) return [];
      return rows.map((row, i) => {
        const src = (row ?? {}) as TableRow;
        // เก็บรหัสแถวที่ฝั่งหน้าเว็บสร้างไว้ต่อ — ไฟล์แนบในเซลล์ผูกกับรหัสนี้
        // แถวเก่าที่บันทึกไว้ก่อนมีฟีเจอร์นี้ยังไม่มีรหัส จึงแจกให้ตามลำดับที่
        const id = String(src[ROW_ID] ?? "").trim();
        const out: TableRow = { [ROW_ID]: id || `r${i}` };
        for (const col of field.columns) {
          out[col.col_key] = coerceColumn(col, src[col.col_key]);
        }
        return out;
      });
    }

    case "DATERANGE":
      return {
        from: String(form.get(rangeName(field.field_key, "from")) ?? "").trim(),
        to: String(form.get(rangeName(field.field_key, "to")) ?? "").trim(),
      };

    case "TEXTAREA":
      return String(form.get(name) ?? "");

    default:
      return String(form.get(name) ?? "").trim();
  }
}

export type ParsedForm = {
  values: FormValues;
  /** ข้อความผิดพลาดของช่องแรกที่พบ — ใช้แสดงสรุปบนหัวฟอร์ม */
  error: string | null;
  /**
   * ข้อผิดพลาด "ทุกช่อง" แยกตามรหัสช่อง
   *
   * เดิมหยุดตรวจทันทีที่เจอช่องแรกที่ผิด คนกรอกจึงต้องกดส่ง–แก้–กดส่งใหม่ทีละช่อง
   * ฟอร์มที่มีช่องบังคับสิบช่องก็ต้องวนสิบรอบกว่าจะรู้ว่าต้องกรอกอะไรบ้าง
   */
  errors: Record<string, string>;
  /** ค่าที่ระบบหยิบไปเก็บเป็นคอลัมน์ของคำขอ */
  title: string;
  amount: number | null;
  docDate: string;
  /** วันที่จะเกิดค่าใช้จ่ายจริง — ใช้นับว่ายื่นล่วงหน้าพอไหม ('' = ฟอร์มไม่มีฟิลด์นี้) */
  eventDate: string;
};

/**
 * อ่านค่าจาก FormData ตามนิยามฟิลด์ของแม่แบบ พร้อมตรวจว่าครบตามที่บังคับไหม
 *
 * ตอนบันทึกร่างให้ส่ง requireFilled=false — ร่างคือของที่ยังกรอกไม่เสร็จ ถ้าบังคับให้
 * ครบก่อนถึงจะเก็บได้ ปุ่ม "บันทึกแบบร่าง" ก็ไม่เหลือประโยชน์อะไร ส่วนค่าที่พิมพ์ผิด
 * ชนิด (เช่น ตัวเลขเป็นตัวหนังสือ) ยังตรวจอยู่ เพราะเก็บลงฐานข้อมูลไม่ได้จริง ๆ
 */
export function parseForm(
  fields: Field[],
  form: FormData,
  { requireFilled = true }: { requireFilled?: boolean } = {},
): ParsedForm {
  const values: FormValues = {};
  const errors: Record<string, string> = {};
  const fail = (field: Field, message: string) => {
    if (!errors[field.field_key]) errors[field.field_key] = message;
  };

  // อ่านค่าทุกช่องให้ครบก่อน แล้วค่อยตัดสินว่าช่องไหนแสดงอยู่จริง — ตัดสินไปพร้อมกัน
  // ไม่ได้ เพราะช่องเงื่อนไขต้องรู้ค่าของช่องควบคุมซึ่งอาจยังอ่านไม่ถึง
  for (const field of fields) {
    if (!field.active || !isValueField(field)) continue;
    values[field.field_key] = coerceField(field, form);
  }

  // ยอดรวมคิดใหม่ที่ฝั่งเซิร์ฟเวอร์เสมอ ไม่รับค่าที่ส่งมากับฟอร์ม — ยอดนี้ใช้ตัดสิน
  // สายอนุมัติได้ (ผูกเป็นช่องวงเงินได้) ถ้าเชื่อค่าจากหน้าเว็บ ก็แก้ให้ต่ำกว่าเพดาน
  // เพื่อข้ามขั้นอนุมัติได้ทันที
  for (const field of fields) {
    if (!field.active || field.type !== "TOTAL") continue;
    values[field.field_key] = totalOf(field, fields, values);
  }

  for (const field of fields) {
    if (!field.active || !isValueField(field)) continue;

    // ช่องที่ไม่เข้าเงื่อนไขถือว่าไม่มีอยู่ในฟอร์มใบนี้ — ล้างค่าทิ้งและไม่ตรวจว่าบังคับ
    // ไม่งั้นคนกรอกจะติดอยู่กับข้อความ "กรุณากรอก X" ที่หาช่อง X บนหน้าจอไม่เจอ
    if (!isFieldVisible(field, fields, values)) {
      values[field.field_key] =
        field.type === "TABLE" || field.type === "MULTISELECT"
          ? []
          : field.type === "DATERANGE"
            ? { from: "", to: "" }
            : "";
      continue;
    }

    const value = values[field.field_key];

    if (field.required && requireFilled) {
      if (field.type === "TABLE") {
        const rows = value as TableRow[];
        if (rows.length === 0) fail(field, `กรุณาเพิ่มอย่างน้อย 1 รายการใน "${field.label}"`);
        else {
          for (const col of field.columns) {
            // คอลัมน์ไฟล์ไม่มีค่าใน data (ไฟล์อยู่คนละตาราง) จึงตรวจจากตรงนี้ไม่ได้
            if (col.type === "FILE") continue;
            if (col.required && rows.some((r) => isBlank(r[col.col_key]))) {
              fail(field, `กรุณากรอก "${col.label}" ให้ครบทุกแถว`);
              break;
            }
          }
        }
      } else if (isBlank(value)) {
        fail(field, `จำเป็นต้องกรอก "${field.label}"`);
      }
    }

    // กรอกครบสองปลายแล้วแต่สลับหัวท้าย — ปล่อยผ่านคือได้เอกสารที่บอกว่างานจบก่อนเริ่ม
    if (field.type === "DATERANGE" && isRange(value) && value.from && value.to) {
      if (value.to < value.from) fail(field, "วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม");
    }

    if (field.type === "NUMBER" || field.type === "MONEY") {
      const raw = String(form.get(inputName(field.field_key)) ?? "").trim();
      if (raw !== "" && value === null) fail(field, "ต้องเป็นตัวเลข");
      else if (typeof value === "number" && value < 0) fail(field, "ต้องไม่ติดลบ");
    }
  }

  const roleOf = (role: string) => fields.find((f) => f.field_role === role);
  const titleField = roleOf("TITLE");
  const amountField = roleOf("AMOUNT");
  const dateField = roleOf("DATE");
  const eventField = roleOf("EVENT_DATE");

  // ข้อความสรุปบนหัวฟอร์มบอกจำนวนด้วย — ไม่งั้นคนแก้ช่องที่เห็นแล้วกดส่ง
  // แล้วเจอข้อความเดิมอีกโดยไม่รู้ว่ายังเหลืออีกกี่ช่องที่ต้องเลื่อนลงไปดู
  const keys = Object.keys(errors);
  const error =
    keys.length === 0
      ? null
      : keys.length === 1
        ? errors[keys[0]]
        : `ยังกรอกไม่ครบ ${keys.length} ช่อง — ดูข้อความสีแดงใต้แต่ละช่อง`;

  return {
    values,
    error,
    errors,
    title: titleField ? String(values[titleField.field_key] ?? "") : "",
    amount: amountField ? (values[amountField.field_key] as number | null) ?? null : null,
    docDate: dateField
      ? String(values[dateField.field_key] || todayLocal())
      : todayLocal(),
    eventDate: eventField ? String(values[eventField.field_key] ?? "") : "",
  };
}

/**
 * ยอดรวมของช่องชนิด TOTAL — บวกคอลัมน์เดียวของตารางเดียวที่ผู้ดูแลชี้ไว้
 *
 * ปัดเป็นทศนิยมสองตำแหน่ง เพราะบวกเลขทศนิยมแบบ floating point แล้วได้หางอย่าง
 * 1234.5600000000002 ซึ่งเอาไปแสดงเป็นจำนวนเงินไม่ได้
 */
export function totalOf(field: Field, fields: Field[], values: FormValues): number {
  const [tableKey, colKey] = String(field.sum_of ?? "").split(".");
  if (!tableKey || !colKey) return 0;
  const table = fields.find((f) => f.field_key === tableKey && f.type === "TABLE");
  if (!table) return 0;
  const rows = Array.isArray(values[tableKey]) ? (values[tableKey] as TableRow[]) : [];
  const sum = rows.reduce((acc, r) => acc + (toNumber(r?.[colKey]) ?? 0), 0);
  return Math.round(sum * 100) / 100;
}

/** ผลรวมของคอลัมน์ตัวเลขในตาราง — แสดงใต้ตารางแบบเดียวกับ "ปริมาณรวม" ของ Lark */
export function tableTotals(
  field: Field,
  rows: TableRow[],
): { key: string; label: string; total: number; unit: string }[] {
  return field.columns
    .filter((c) => c.type === "NUMBER" || c.type === "MONEY")
    .map((c) => ({
      key: c.col_key,
      label: c.label,
      unit: c.unit ?? "",
      total: Math.round(rows.reduce((sum, r) => sum + (toNumber(r[c.col_key]) ?? 0), 0) * 100) / 100,
    }));
}

export function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
