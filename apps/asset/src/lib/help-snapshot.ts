/**
 * สรุป "สถานะสด" ของ ONE Asset จาก State ในเครื่อง — ป้อนให้ผู้ช่วย AI ตอบคำถามข้อมูลจริง
 * (เช่น ตอนนี้มีทรัพย์สินกี่ชิ้น ค่าเสื่อมงวดนี้เท่าไร OA รอดำเนินการกี่รายการ งานค้างมีอะไร)
 * เป็นฟังก์ชัน pure ไม่เรียก DB เพิ่ม — ใช้ข้อมูลที่ client โหลดไว้แล้ว
 */
import type { State } from './store-types';
import { valuate, prorationFor } from './depreciation';
import { CURRENT_PERIOD } from './store';

const VALUED = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'];
const STATUS_TH: Record<string, string> = {
  CANDIDATE: 'รอตรวจสอบ', DRAFT: 'ฉบับร่าง', PENDING_REVIEW: 'รออนุมัติ', ACTIVE: 'ใช้งาน',
  INACTIVE: 'ไม่ใช้งาน', UNDER_REPAIR: 'ส่งซ่อม', TEMPORARILY_UNUSED: 'พักการใช้งาน',
  DISPOSAL_PENDING: 'รอจำหน่าย', DISPOSED: 'จำหน่ายแล้ว', ARCHIVED: 'เก็บถาวร',
};
const baht = (n: number) => Math.round(n).toLocaleString('th-TH');

export function buildAssetSnapshot(state: State): string {
  const assets = state.assets;
  const period = CURRENT_PERIOD;

  // นับตามสถานะ
  const byStatus = new Map<string, number>();
  for (const a of assets) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  const statusLine = [...byStatus.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([s, n]) => `${STATUS_TH[s] ?? s} ${n}`)
    .join(', ');

  // มูลค่าเฉพาะทรัพย์สินที่คิดค่าเสื่อม (งวดปัจจุบัน)
  let cost = 0, accum = 0, periodDep = 0, nearEnd = 0, depCount = 0;
  for (const a of assets) {
    if (!VALUED.includes(a.status)) continue;
    const v = valuate(a, period, prorationFor(a, state.policies));
    cost += v.cost; accum += v.accumulated; periodDep += v.periodDep;
    if (v.periodDep > 0) depCount++;
    if (!v.fullyDepreciated && v.remainingMonths > 0 && v.remainingMonths <= 6) nearEnd++;
  }
  const nbv = cost - accum;

  // คิว OA
  const oa = state.oa;
  const oaPending = oa.filter((o) => ['NEW', 'REVIEWING', 'READY_TO_CREATE', 'ERROR'].includes(o.status)).length;
  const oaErr = oa.filter((o) => o.status === 'ERROR').length;
  const oaDup = oa.filter((o) => o.status === 'DUPLICATE').length;
  const oaCreated = oa.filter((o) => o.status === 'CREATED').length;

  // ข้อมูลไม่ครบ (เฉพาะทรัพย์สินที่มีค่า)
  const docAssets = new Set(state.documents.filter((d) => d.type !== 'PHOTO').map((d) => d.assetId));
  const polIds = new Set(state.policies.filter((p) => p.active).map((p) => p.id));
  let noPhoto = 0, noCat = 0, noLoc = 0, noDoc = 0, noPol = 0;
  for (const a of assets) {
    if (!VALUED.includes(a.status)) continue;
    if (!a.hasPhoto) noPhoto++;
    if (!a.categoryId || !a.subcategoryId) noCat++;
    if (!a.locationId) noLoc++;
    if (!docAssets.has(a.id)) noDoc++;
    if (!a.policyId || !polIds.has(a.policyId)) noPol++;
  }

  // ค่าเสื่อม: งวดล่าสุด
  const runs = [...state.runs].sort((a, b) => (a.period < b.period ? 1 : -1));
  const latest = runs[0];
  const RUN_TH: Record<string, string> = { DRAFT: 'ฉบับร่าง', CALCULATED: 'คำนวณแล้ว', REVIEWED: 'ตรวจแล้ว', LOCKED: 'ปิดงวดแล้ว', POSTED: 'ลงบัญชีแล้ว' };

  // ตรวจนับ
  const openCampaigns = state.verifyCampaigns.filter((c) => c.status === 'OPEN').length;

  const lines = [
    `งวดปัจจุบัน: ${period}`,
    `ทรัพย์สินทั้งหมด: ${assets.length} ชิ้น (${statusLine})`,
    `มูลค่า (งวดนี้): ราคาทุนรวม ${baht(cost)} บาท, ค่าเสื่อมสะสม ${baht(accum)} บาท, มูลค่าตามบัญชี NBV ${baht(nbv)} บาท`,
    `ค่าเสื่อมงวดนี้: ${baht(periodDep)} บาท จากทรัพย์สิน ${depCount} ชิ้นที่กำลังคิดค่าเสื่อม`,
    `ใกล้ครบอายุค่าเสื่อม (เหลือ ≤6 เดือน): ${nearEnd} ชิ้น`,
    `คิวนำเข้าจาก OA: รอดำเนินการ ${oaPending} รายการ (ผิดพลาด ${oaErr}, ซ้ำ ${oaDup}, สร้างแล้ว ${oaCreated})`,
    `งานค้าง/ข้อมูลไม่ครบ (เฉพาะทรัพย์สินที่ใช้งาน): ไม่มีรูป ${noPhoto}, ไม่มีหมวดหมู่ ${noCat}, ไม่ระบุสถานที่ ${noLoc}, ขาดเอกสาร ${noDoc}, ไม่มีนโยบายค่าเสื่อม ${noPol}`,
    latest ? `รอบค่าเสื่อมล่าสุด: งวด ${latest.period} สถานะ ${RUN_TH[latest.status] ?? latest.status}` : `ยังไม่มีรอบค่าเสื่อม`,
    `แคมเปญตรวจนับที่เปิดอยู่: ${openCampaigns}`,
    `จำนวนหมวดหมู่: ${state.categories.length}, สถานที่: ${state.locations.length}`,
  ];
  return lines.join('\n');
}
