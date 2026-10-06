/**
 * ตั้งค่าการพิมพ์ของแม่แบบฟอร์มหนึ่งใบ
 *
 * เอกสารแต่ละชนิดพิมพ์ไม่เหมือนกันจริงๆ — บางใบพิมพ์ลงกระดาษหัวจดหมายที่มีโลโก้อยู่แล้ว
 * จึงต้องปิดหัวกระดาษของระบบ บางใบมีตารางกว้างต้องพิมพ์แนวนอน บางใบต้องบีบให้จบหน้าเดียว
 * เดิมค่าพวกนี้ฝังตายอยู่ใน CSS ใบเดียวใช้กับทุกฟอร์ม
 *
 * เก็บเป็น JSON ก้อนเดียวในคอลัมน์ print_config แทนการเพิ่มคอลัมน์ทีละตัว เพราะเป็นค่า
 * ที่ไม่มีใครค้นหรือ join ด้วย และจะมีเพิ่มอีกเรื่อยๆ ตามที่หน้างานเจอ
 */

export type PaperSize = "A4" | "A5" | "LETTER";
export type Orientation = "portrait" | "landscape";

export type PrintConfig = {
  paper: PaperSize;
  orientation: Orientation;
  /** ระยะขอบกระดาษ (มม.) */
  margin: number;
  /** ขนาดตัวอักษรในเอกสาร (px) */
  fontSize: number;
  /** แสดงชื่อบริษัทหัวกระดาษไหม — ปิดเมื่อพิมพ์ลงกระดาษหัวจดหมาย */
  showCompany: boolean;
  /** ข้อความปิดท้ายก่อนช่องลงนาม ("" = ใช้ข้อความมาตรฐานตามภาษา) */
  closing: string;
  /** จำนวนช่องลงนามต่อแถว */
  signPerRow: number;
};

export const PRINT_DEFAULTS: PrintConfig = {
  paper: "A4",
  orientation: "portrait",
  margin: 16,
  fontSize: 15,
  showCompany: true,
  closing: "",
  signPerRow: 2,
};

export const PAPER_SIZES: PaperSize[] = ["A4", "A5", "LETTER"];
export const SIGN_PER_ROW = [2, 3, 4];

/** ขนาดกระดาษแนวตั้ง (มม.) — แนวนอนสลับสองค่านี้ */
const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  LETTER: [216, 279],
};

export function sheetSize(cfg: PrintConfig): { width: number; height: number } {
  const [w, h] = PAPER_MM[cfg.paper] ?? PAPER_MM.A4;
  return cfg.orientation === "landscape" ? { width: h, height: w } : { width: w, height: h };
}

/**
 * อ่านตัวเลขในช่วงที่ยอมรับได้
 *
 * ต้องดักค่าว่างก่อนแปลงเป็นตัวเลข เพราะ Number(null) กับ Number("") ได้ 0 ซึ่งเป็น
 * ตัวเลขที่ใช้ได้ — ถ้าปล่อยผ่าน ช่องที่แอดมินลบค่าทิ้งจะกลายเป็น "ขอบกระดาษ 0 มม."
 * แทนที่จะกลับไปใช้ค่ามาตรฐาน
 */
function num(v: unknown, lo: number, hi: number, fallback: number): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * อ่านค่าจาก JSON ที่เก็บไว้ — ค่าที่หายหรือเพี้ยนให้ตกกลับไปใช้ค่ามาตรฐานทีละตัว
 * ไม่ทิ้งทั้งก้อน เพราะฟอร์มที่ตั้งค่าไว้ครึ่งเดียวควรได้อีกครึ่งเป็นค่ามาตรฐาน
 */
export function parsePrintConfig(raw: string | null | undefined): PrintConfig {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
  } catch {
    /* ค่าเสีย = ใช้ค่ามาตรฐานทั้งชุด */
  }

  const paper = PAPER_SIZES.includes(obj.paper as PaperSize)
    ? (obj.paper as PaperSize)
    : PRINT_DEFAULTS.paper;

  return {
    paper,
    orientation: obj.orientation === "landscape" ? "landscape" : "portrait",
    margin: num(obj.margin, 0, 40, PRINT_DEFAULTS.margin),
    fontSize: num(obj.fontSize, 10, 22, PRINT_DEFAULTS.fontSize),
    showCompany: obj.showCompany !== false,
    closing: typeof obj.closing === "string" ? obj.closing.slice(0, 300) : "",
    signPerRow: SIGN_PER_ROW.includes(Number(obj.signPerRow))
      ? Number(obj.signPerRow)
      : PRINT_DEFAULTS.signPerRow,
  };
}

export function serialisePrintConfig(cfg: PrintConfig): string {
  return JSON.stringify(cfg);
}
