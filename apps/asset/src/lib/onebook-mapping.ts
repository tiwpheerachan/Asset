/**
 * Mapping: บิลที่เป็นทรัพย์สินจาก ONEBOOK → OARecord ของระบบ Asset
 * ใช้คิว review/สร้างทรัพย์สินเดิมซ้ำ (แหล่งต่างกันแค่ที่มา)
 *
 * พก "รหัสบัญชีสินทรัพย์ของ ONEBOOK" (เช่น 1230) มาใน rawFields เพื่อ:
 *  - ใช้เดา/อ้างอิงหมวดตอน review
 *  - ใช้ตอนส่ง journal ค่าเสื่อมกลับ ONEBOOK ภายหลัง (accum = รหัส+1, expense = 6170)
 */
import type { OARecord } from './types';
import type { OnebookCandidate } from './onebook';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

export function mapOnebookCandidates(rows: OnebookCandidate[]): OARecord[] {
  return rows
    .filter((c) => c.line_id && c.document_id)
    .map((c) => {
      // อ้างด้วย document+line เพื่อกันนำเข้าซ้ำ (dedupe ด้วย docNo ใน store)
      const ref = `OB-${c.document_id}#${c.line_id}`;
      const qty = Math.max(1, num(c.quantity));
      return {
        id: ref,
        docNo: ref,
        oaNo: str(c.doc_number),
        templateCode: 'ONEBOOK',
        rawFields: {
          onebookAccountCode: str(c.account_code),
          onebookAccountName: str(c.account_name),
          onebookDocId: str(c.document_id),
          onebookLineId: str(c.line_id),
          onebookCompanyId: str(c.company_id),
          onebookCompany: str(c.company_name),
        },
        companyId: 'C-SHD', // บริษัทเดียวในระบบ Asset — จับคู่ด้วยชื่อภายหลังถ้ามีหลายบริษัท
        branchId: '',
        departmentId: '',
        costCenterId: '',
        requester: '',
        approvedDate: str(c.doc_date).slice(0, 10),
        itemName: str(c.description) || str(c.doc_number),
        itemDescription: `${str(c.account_code)} · ${str(c.account_name)}`,
        quantity: qty,
        unit: 'unit',
        amount: num(c.amount),
        supplier: str(c.vendor_name),
        approvalRef: str(c.doc_number),
        status: 'NEW' as const,
        documents: [],
        serialNumbers: [],
        createdAssetIds: [],
        importedAt: new Date().toISOString(),
      };
    });
}
