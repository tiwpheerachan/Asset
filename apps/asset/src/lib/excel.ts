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
