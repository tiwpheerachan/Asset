import * as XLSX from 'xlsx';

export type Row = Record<string, string | number | null | undefined>;

/** Export one or more sheets to an .xlsx file in the browser. */
export function exportXlsx(fileName: string, sheets: { name: string; rows: Row[]; widths?: number[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const keys = Object.keys(s.rows[0] ?? {});
    ws['!cols'] = keys.map((k, i) => ({ wch: s.widths?.[i] ?? Math.min(48, Math.max(10, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

/** Read the first sheet of an uploaded workbook as an array of arrays. */
export async function readFirstSheet(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

export const LEGACY_TEMPLATE_HEADERS = [
  'ลำดับที่',
  'หมวดหมู่',
  'หมวดหมู่ย่อย',
  'รหัสกลุ่มสินทรัพย์',
  'ชื่อสินทรัพย์',
  'หน่วย',
  'รหัสบาร์โค้ด',
  'อายุสินทรัพย์ (ปี)',
  'จำนวน',
  'ราคาทุนรวม',
  'มูลค่าซาก',
  'มูลค่าบัญชียกมา (J-M)',
  'ค่าเสื่อมราคาสะสมยกมา',
  'ค่าเสื่อมราคาตามช่วงเวลา',
  'มูลค่าสินทรัพย์ที่ขายในช่วงเวลา',
  'ค่าเสื่อมราคาสะสมตัดขายในช่วงเวลา',
  'มูลค่าบัญชียกไป (J-O-R)',
  'ค่าเสื่อมราคาสะสมยกไป (M+N-P)',
  'บัญชีสินทรัพย์',
  'บัญชีค่าเสื่อมราคา',
  'บัญชีค่าเสื่อมราคาสะสม',
  // Extended columns supported by the new system (optional)
  'บริษัท',
  'สาขา',
  'แผนก',
  'ศูนย์ต้นทุน',
  'สถานที่',
  'Serial Number',
  'วันที่ได้มา',
  'วันที่พร้อมใช้งาน',
];

export function downloadLegacyTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    LEGACY_TEMPLATE_HEADERS,
    [1, 'อุปกรณ์ และเครื่องใช้สำนักงาน', 'คอมพิวเตอร์ และอุปกรณ์คอมพิวเตอร์', 'COM-00100', 'โน๊ตบุ๊ค ตัวอย่าง', 'เครื่อง', '', 5, 1, 25000, 1, 25000, 0, 0, 0, 0, 25000, 0, '124106 - อุปกรณ์สำนักงาน', '530706 - ค่าเสื่อมราคา - อุปกรณ์สำนักงาน', '124206 - ค่าเสื่อมราคาสะสม - อุปกรณ์สำนักงาน', 'SHD', 'HQ', 'IT', 'CC120', 'HQ-A-02', 'SN000001', '2026-09-01', '2026-09-01'],
  ]);
  ws['!cols'] = LEGACY_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
  XLSX.writeFile(wb, 'FA_Legacy_Import_Template.xlsx');
}

/* ─────────────────── PEAK-compatible templates ───────────────────
 * โครงสร้างตรงกับไฟล์นำเข้าของ PEAK: กลุ่มสินทรัพย์ (ImportFixAssetGroup)
 * และสินทรัพย์รายตัว (ImportFixAsset) — ลำดับคอลัมน์ต้องคงไว้ ตัว parser อ่านตามตำแหน่ง
 */
export const PEAK_GROUP_HEADERS = [
  'ลำดับที่*',                      // 0
  'หมวด',                          // 1
  'หมวดย่อย',                       // 2
  'เลขที่กลุ่มสินทรัพย์',              // 3 (เว้นว่าง = ให้ระบบใส่อัตโนมัติ)
  'ชื่อภาษาไทย',                     // 4
  'ชื่อภาษาอังกฤษ',                   // 5
  'หน่วย',                          // 6
  'คำอธิบาย',                       // 7
  'บัญชีที่บันทึกสินทรัพย์',           // 8
  'อายุการใช้งาน(ปี)',               // 9
  'บัญชีที่บันทึกค่าเสื่อมราคา',        // 10
  'บัญชีที่บันทึกค่าเสื่อมราคาสะสม',    // 11
  'มูลค่าซาก',                       // 12
];

export const PEAK_ASSET_HEADERS = [
  'ลำดับที่*',                       // 0
  'เลขที่กลุ่มสินทรัพย์',              // 1
  'วันที่ซื้อสินทรัพย์',               // 2 (YYYYMMDD)
  'มูลค่าสินทรัพย์',                   // 3
  'ค่าเสื่อมสะสมยกมา',                // 4
  'วันที่เริ่มคิดค่าเสื่อมราคา',        // 5 (YYYYMMDD)
];

export function downloadPeakGroupTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    PEAK_GROUP_HEADERS,
    [1, 'อุปกรณ์และเครื่องใช้สำนักงาน', 'คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์', 'COM', 'คอมพิวเตอร์และอุปกรณ์', 'Computer & Accessories', 'เครื่อง', 'ตัวอย่างกลุ่มสินทรัพย์', '124106', 3, '530706', '124206', '1'],
  ]);
  ws['!cols'] = PEAK_GROUP_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'ImportFixAssetGroup');
  XLSX.writeFile(wb, 'PEAK_Import_AssetGroup_Template.xlsx');
}

export function downloadPeakAssetTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    PEAK_ASSET_HEADERS,
    [1, 'COM', '20260901', 25000, 0, '20260901'],
  ]);
  ws['!cols'] = PEAK_ASSET_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'ImportFixAsset');
  XLSX.writeFile(wb, 'PEAK_Import_Asset_Template.xlsx');
}

/** แปลงวันที่รูปแบบ PEAK (YYYYMMDD ปี ค.ศ.) → ISO (YYYY-MM-DD) · รองรับ Date/ISO/เลข */
export function peakDateToIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim().replace(/[^\d]/g, '');
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
    const mi = Number(m), di = Number(d);
    if (mi >= 1 && mi <= 12 && di >= 1 && di <= 31) return `${y}-${m}-${d}`;
  }
  const raw = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}
