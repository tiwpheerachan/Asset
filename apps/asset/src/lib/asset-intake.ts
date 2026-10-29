/**
 * ตัวช่วยตอน "รับทรัพย์สินเข้าทะเบียน" (OA import / สร้างเอง)
 *  - suggestSubcategoryHeuristic: เดาหมวดจากชื่อรายการ (ใช้เป็น fallback ของ AI)
 *  - nearDuplicates: หาทรัพย์สิน/รายการที่ "ใกล้เคียง" เพื่อกันสร้างซ้ำ (เหมือน + คล้าย)
 *  - intakeChecklist: เช็กว่าข้อมูลที่ควรมีครบไหม
 * ฟังก์ชันทั้งหมดบริสุทธิ์ (ไม่พึ่ง store/React) ใช้ซ้ำได้ทั้งฝั่ง client และ API route
 */

const STOP = new Set([
  'และ', 'หรือ', 'ของ', 'ชุด', 'รุ่น', 'แบบ', 'สำหรับ', 'จำนวน', 'เครื่อง', 'ตัว', 'อัน', 'ชิ้น', 'ใหม่',
  'the', 'and', 'or', 'for', 'set', 'pcs', 'ea', 'unit', 'new', 'with',
]);

export function normName(s: string): string {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function nameTokens(s: string): string[] {
  return normName(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}

/** ความคล้ายของสองชุดคำ (Dice coefficient 0–1) */
export function diceSim(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export type SubcatOption = { id: string; path: string; keywords?: string[] };

/** เดาหมวดย่อยจากชื่อรายการด้วยการจับคู่คำ — คืนตัวที่คะแนนสูงสุด (0 = ไม่เจอ) */
export function suggestSubcategoryHeuristic(text: string, opts: SubcatOption[]): { id: string; score: number } | null {
  const nt = nameTokens(text);
  if (!nt.length) return null;
  let best: { id: string; score: number } | null = null;
  for (const o of opts) {
    const ct = [...nameTokens(o.path), ...(o.keywords ?? []).flatMap(nameTokens)];
    const s = diceSim(nt, ct);
    if (!best || s > best.score) best = { id: o.id, score: Math.round(s * 100) / 100 };
  }
  return best && best.score > 0 ? best : null;
}

export type DupMatch = {
  id: string;
  code: string;
  name: string;
  reason: 'serial' | 'name_cost' | 'name';
  score: number;
};

type AssetLike = {
  id: string; code: string; nameTh: string; nameEn: string;
  serialNumber: string; originalCost: number; additionalCost?: number; quantity: number;
};

/**
 * หาทรัพย์สินที่ "ใกล้เคียง" กับรายการที่จะสร้าง — กันสร้างซ้ำ
 * - serial ตรง = ซ้ำแน่นอน
 * - ชื่อคล้าย (≥0.6) + ราคาต่อหน่วยใกล้กัน (±5%) = น่าจะซ้ำ
 * - ชื่อคล้ายมาก (≥0.82) = ควรเช็ก
 */
export function nearDuplicates(
  cand: { itemName: string; unitCost: number; serials?: string[] },
  assets: AssetLike[],
  limit = 6,
): DupMatch[] {
  const nt = nameTokens(cand.itemName);
  const out: DupMatch[] = [];
  for (const a of assets) {
    const aName = a.nameTh || a.nameEn || a.code;
    const serialHit = (cand.serials ?? []).some((s) => s && a.serialNumber.split(/,\s*/).includes(s));
    if (serialHit) { out.push({ id: a.id, code: a.code, name: aName, reason: 'serial', score: 1 }); continue; }
    const sim = diceSim(nt, nameTokens(aName));
    if (!sim) continue;
    const aUnit = (a.originalCost + (a.additionalCost ?? 0)) / Math.max(1, a.quantity);
    const costClose = cand.unitCost > 0 && aUnit > 0 && Math.abs(cand.unitCost - aUnit) / Math.max(cand.unitCost, aUnit) <= 0.05;
    if (sim >= 0.6 && costClose) out.push({ id: a.id, code: a.code, name: aName, reason: 'name_cost', score: sim });
    else if (sim >= 0.82) out.push({ id: a.id, code: a.code, name: aName, reason: 'name', score: sim });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

export type CheckItem = { key: string; ok: boolean; required: boolean };

/** รายการข้อมูลที่ "ควรมี" ตอนขึ้นทะเบียน — ใช้แสดงว่าครบไหม/ขาดอะไร */
export function intakeChecklist(c: {
  subId: string; hasPolicy: boolean; amount: number; supplier: string;
  approvedDate: string; documents: number; costCenterId: string; departmentId: string; serials: number;
}): CheckItem[] {
  return [
    { key: 'category', ok: !!c.subId, required: true },
    { key: 'policy', ok: c.hasPolicy, required: true },
    { key: 'cost', ok: c.amount > 0, required: true },
    { key: 'supplier', ok: !!c.supplier, required: false },
    { key: 'approvedDate', ok: !!c.approvedDate, required: false },
    { key: 'costCenter', ok: !!c.costCenterId, required: false },
    { key: 'department', ok: !!c.departmentId, required: false },
    { key: 'documents', ok: c.documents > 0, required: false },
    { key: 'serial', ok: c.serials > 0, required: false },
  ];
}
