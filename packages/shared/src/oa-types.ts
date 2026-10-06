/**
 * Types สำหรับ OA (Internal Approval) public API `/api/v1/*`
 * อ้างอิงจาก payload จริงที่ทดสอบแล้ว (ดู docs/INTEGRATION.md)
 * ใช้ร่วมกันทั้งฝั่ง OA (ผู้ผลิต) และ Asset (ผู้บริโภค)
 */

export type OARequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PRELIM_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

/** สถานะที่ระบบปลายทางรายงานกลับผ่าน callback accounting */
export type OAExternalState = 'RECEIVED' | 'RECORDED' | 'PAID' | 'REJECTED';

/** role ของ field ที่ถูกเลื่อนขึ้นเป็น top-level */
export type OAFieldRole = '' | 'TITLE' | 'AMOUNT' | 'DATE' | 'EVENT_DATE' | 'PERIODS';

export interface OATableColumn {
  key: string;
  label: string;
  type: string; // TEXT | NUMBER | MONEY | DATE | USER | ...
  required?: boolean;
  unit?: string;
  options?: string[];
}

export interface OATemplateField {
  key: string;
  label: string;
  type: string;
  role: OAFieldRole;
  required: boolean;
  help?: string;
  options?: string[];
  show_if?: { key: string; value: string };
  sum_of?: string;
  columns?: OATableColumn[];
}

export interface OATemplate {
  id: number;
  code: string; // เช่น "PURCHASE"
  name: string;
  description: string;
  doc_prefix: string;
  fields: OATemplateField[];
}

export interface OAApproval {
  step: number;
  stage: 'PRELIM' | 'FINAL';
  name: string;
  status: string;
  acted_at: string | null;
  acted_by: string | null;
  comment: string | null;
}

export interface OAIssuedDocument {
  number: string;
  type: string;
  issued_at: string;
  void: boolean;
}

export interface OAAttachment {
  id: number;
  filename: string;
  mime: string;
  size: number;
  field_key: string;
  uploaded_by: string; // email
  created_at: string;
  url: string; // "/api/v1/files/{id}"
}

/** แถวของ field ชนิด TABLE */
export interface OATableRow {
  _id: string;
  [column: string]: string | number | null;
}

/** request object กลาง — คืนจาก GET list/single, POST create, และ webhook */
export interface OARequest {
  id: number; // internal id — อย่าใช้เป็น ref หลัก
  doc_no: string; // external key หลัก เช่น "AP-PURC-202610-0001"
  type: { id: number; code: string; name: string };
  title: string; // role=TITLE
  amount: number | null; // role=AMOUNT (อาจ null ถ้าฟอร์มไม่ตั้ง role)
  doc_date: string; // "YYYY-MM-DD"
  status: OARequestStatus;
  requester: {
    id: number;
    name: string;
    department: string | null;
    position: string | null;
  };
  submitted_at: string | null;
  closed_at: string | null; // ตั้งเมื่อ APPROVED/REJECTED/CANCELLED
  fields: Record<string, unknown>; // ค่าฟอร์มดิบ (TABLE = OATableRow[])
  approvals: OAApproval[];
  documents: OAIssuedDocument[];
  attachments: OAAttachment[];
}

export interface OAListResponse {
  total: number;
  count: number;
  offset: number;
  data: OARequest[];
}

export interface OAPingResponse {
  ok: boolean;
  now: string;
  caller: { name: string; can_write: boolean };
  rate_limit_per_min: number;
  webhook: { configured: boolean; signed: boolean; events: string[] };
  accounting_states: OAExternalState[];
  endpoints: string[];
}

/** body ของ callback accounting (Asset → OA) */
export interface OAAccountingCallback {
  state: OAExternalState;
  external_ref?: string; // รหัสทรัพย์สินที่สร้าง
  external_url?: string; // ลิงก์หน้า asset detail
  amount?: number | null;
  occurred_at?: string;
  note?: string; // บังคับเมื่อ state=REJECTED
}
