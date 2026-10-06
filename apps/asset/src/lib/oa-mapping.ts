/**
 * Mapping layer: OA request (ฟอร์ม PURCHASE) → OARecord ของระบบ Asset
 *
 * หลักการ (ดู docs/INTEGRATION.md §3–4):
 *  - map ด้วย field "role" ก่อน (title/amount/doc_date) แล้ว fallback เป็น field key
 *  - ฟอร์ม PURCHASE มี field ตาราง `items` (name/qty/unit_price) → แตกเป็น OARecord ต่อรายการ
 *  - field ที่ OA ไม่มี (PO/invoice/GR/cost-center/serial) ปล่อยว่างให้เจ้าหน้าที่กรอกตอน review
 */
import type { OARequest, OATableRow } from '@shd/shared';
import type { OARecord } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** อ่านแถวตาราง items จาก fields (รองรับทั้ง key มาตรฐาน 'items' และ TABLE แรกที่เจอ) */
function itemRows(req: OARequest): OATableRow[] {
  const direct = req.fields['items'];
  if (Array.isArray(direct)) return direct as OATableRow[];
  for (const v of Object.values(req.fields)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] && '_id' in (v[0] as object)) {
      return v as OATableRow[];
    }
  }
  return [];
}

const str = (v: unknown): string => (v == null ? '' : String(v));

/**
 * แปลง 1 OA request เป็น OARecord อย่างน้อย 1 รายการ
 * (1 แถวในตาราง items = 1 OARecord — รองรับ OA ที่มีหลายสินค้าในใบเดียว)
 */
export function mapOARequestToRecords(req: OARequest): OARecord[] {
  const vendor = str(req.fields['vendor']);
  const approvedDate = (req.closed_at ?? req.doc_date ?? '').slice(0, 10);
  const docs = (req.attachments ?? []).map((a) => a.filename);
  const rows = itemRows(req);

  const base = {
    companyId: 'C-SHD',
    // org จาก OA ยังเป็นชื่อแผนก (ไทย) — เฟสแรกปล่อยให้เจ้าหน้าที่เลือกตอน review
    branchId: '',
    departmentId: '',
    costCenterId: '',
    requester: req.requester?.name ?? '',
    approvedDate,
    supplier: vendor,
    documents: docs,
    approvalRef: req.doc_no,
    status: 'NEW' as const,
    createdAssetIds: [],
    importedAt: new Date().toISOString(),
  };

  if (rows.length === 0) {
    // ไม่มีตารางรายการ → ใช้ title + amount เป็นรายการเดียว
    const amount = req.amount != null ? r2(req.amount) : 0;
    return [
      {
        ...base,
        id: req.doc_no,
        docNo: req.doc_no,
        templateCode: req.type?.code,
        oaNo: req.doc_no,
        itemName: req.title,
        itemDescription: str(req.fields['body']),
        quantity: 1,
        unit: 'unit',
        amount,
        rawFields: req.fields,
      },
    ];
  }

  return rows.map((row, i) => {
    const qty = Math.max(1, num(row['qty'] ?? row['quantity'] ?? 1));
    const unitPrice = num(row['unit_price'] ?? row['price'] ?? 0);
    const lineAmount = r2(unitPrice * qty);
    const lineRef = rows.length > 1 ? `${req.doc_no}#${i + 1}` : req.doc_no;
    return {
      ...base,
      id: lineRef,
      docNo: req.doc_no,
      templateCode: req.type?.code,
      oaNo: req.doc_no,
      itemName: str(row['name'] ?? req.title),
      itemDescription: str(row['note'] ?? req.fields['body']),
      quantity: qty,
      unit: str(row['unit'] ?? 'unit'),
      amount: lineAmount,
      rawFields: req.fields,
    };
  });
}

/** แปลงหลาย request ทีเดียว */
export function mapOARequests(reqs: OARequest[]): OARecord[] {
  return reqs.flatMap(mapOARequestToRecords);
}
