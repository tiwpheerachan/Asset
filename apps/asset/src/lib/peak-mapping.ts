/**
 * Mapping: บรรทัดค่าใช้จ่ายที่เป็นทรัพย์สินจาก PEAK → OARecord ของระบบ Asset
 * ใช้คิว review/สร้างทรัพย์สินเดิมซ้ำ (แหล่งต่างกันแค่ที่มา — templateCode = 'PEAK')
 *
 * พก "รหัสบัญชีสินทรัพย์ของ PEAK" (เช่น 124106) มาใน rawFields เพื่ออ้างอิง/เดาหมวดตอน review
 * หมายเหตุ: PEAK ทำบัญชีค่าเสื่อมของตัวเอง — เราแค่ดึงมาขึ้นทะเบียน + คิดค่าเสื่อมฝั่งเรา (ไม่ยิงกลับ)
 */
import type { OARecord } from './types';
import type { PeakCandidate } from './peak';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

export function mapPeakCandidates(rows: PeakCandidate[]): OARecord[] {
  return rows
    .filter((c) => c.line_id && c.document_id)
    .map((c) => {
      // อ้างด้วย document+line เพื่อกันนำเข้าซ้ำ (dedupe ด้วย docNo ใน store)
      const ref = `PK-${c.document_id}#${c.line_id}`;
      const qty = Math.max(1, num(c.quantity));
      return {
        id: ref,
        docNo: ref,
        oaNo: str(c.doc_number),
        templateCode: 'PEAK',
        rawFields: {
          peakAccountCode: str(c.account_code),
          peakAccountName: str(c.account_name),
          peakAccountSubCode: str(c.account_sub_code),
          peakDocId: str(c.document_id),
          peakLineId: str(c.line_id),
          peakDocNumber: str(c.doc_number),
          peakAssetCode: str(c.asset_code),
          peakJournalNo: str(c.journal_number),
        },
        companyId: 'C-SHD', // บริษัทเดียวในระบบ Asset
        branchId: '',
        departmentId: '',
        costCenterId: '',
        requester: '',
        approvedDate: str(c.doc_date).slice(0, 10),
        // ชื่อทรัพย์สิน: "ชื่อบัญชี (รหัสทรัพย์สิน PEAK)" เช่น "อุปกรณ์สำนักงาน (OEQ-00014)"
        itemName:
          (str(c.account_name) || 'ทรัพย์สิน') + (c.asset_code ? ` (${str(c.asset_code)})` : ''),
        itemDescription: str(c.description) || `PEAK ${str(c.account_code)} · ${str(c.doc_number)}`,
        quantity: qty,
        unit: 'unit',
        amount: num(c.amount),
        supplier: str(c.vendor_name),
        invoiceNo: str(c.doc_number),
        invoiceDate: str(c.doc_date).slice(0, 10),
        approvalRef: str(c.doc_number),
        status: 'NEW' as const,
        documents: [],
        serialNumbers: [],
        createdAssetIds: [],
        importedAt: new Date().toISOString(),
      };
    });
}
