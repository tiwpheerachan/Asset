export type Lang = 'th' | 'en' | 'zh';
export type Localized = { th: string; en: string; zh: string };

export type Role = 'ACCOUNTANT' | 'MANAGER' | 'ADMIN' | 'AUDITOR';

export type AssetStatus =
  | 'CANDIDATE'
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'UNDER_REPAIR'
  | 'TEMPORARILY_UNUSED'
  | 'DISPOSAL_PENDING'
  | 'DISPOSED'
  | 'ARCHIVED';

export type OAStatus = 'NEW' | 'REVIEWING' | 'READY_TO_CREATE' | 'CREATED' | 'REJECTED' | 'DUPLICATE' | 'ERROR';
export type RunStatus = 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'LOCKED' | 'POSTED';
export type DepMethod = 'SL' | 'DB' | 'UOP';
export type Proration = 'FULL_MONTH' | 'ACTUAL_DAYS' | 'NEXT_MONTH';
export type StartRule = 'READY_DATE' | 'ACQUISITION_DATE';
export type DocType =
  | 'OA_APPROVAL'
  | 'PO'
  | 'GR'
  | 'INVOICE'
  | 'TAX_INVOICE'
  | 'WARRANTY'
  | 'CONTRACT'
  | 'ACCEPTANCE'
  | 'PHOTO'
  | 'OTHER';
export type AuditSource = 'UI' | 'OA_SYNC' | 'EXCEL_IMPORT' | 'SYSTEM';

export interface Company {
  id: string;
  code: string;
  name: Localized;
  taxId: string;
  active: boolean;
}
export interface Branch {
  id: string;
  code: string;
  companyId: string;
  name: Localized;
  address: string;
  active: boolean;
}
export interface Department {
  id: string;
  code: string;
  name: Localized;
  active: boolean;
}
export interface CostCenter {
  id: string;
  code: string;
  departmentId: string;
  name: Localized;
  active: boolean;
}
export interface Location {
  id: string;
  code: string;
  companyId: string;
  branchId: string;
  building: string;
  floor: string;
  room: string;
  name: Localized;
  /** สถานที่แม่ (null = อยู่ใต้สาขาโดยตรง) — รองรับผังสถานที่ซ้อนได้ไม่จำกัดชั้น (§19) */
  parentLocationId?: string | null;
  active: boolean;
}
export interface Account {
  /** รหัสถาวร (immutable) — หมวดหมู่อ้างอิงบัญชีด้วย id นี้ เพื่อให้เปลี่ยน code ภายหลังได้โดย mapping ไม่พัง */
  id: string;
  /** เลขที่บัญชีตามผังบัญชี (business reference — เปลี่ยนได้) */
  code: string;
  name: Localized;
  kind: 'ASSET' | 'EXPENSE' | 'ACCUM';
}
export interface Category {
  id: string;
  code: string;
  parentId: string | null;
  name: Localized;
  defaultUnit: string;
  defaultLifeYears: number;
  defaultResidual: number;
  method: DepMethod;
  assetAccount: string;
  expenseAccount: string;
  accumAccount: string;
  active: boolean;
}
export interface DepPolicy {
  id: string;
  name: Localized;
  categoryId: string;
  method: DepMethod;
  lifeYears: number;
  residual: number;
  startRule: StartRule;
  proration: Proration;
  rounding: number;
  effectiveDate: string;
  active: boolean;
}

export interface SourceRef {
  oaNo?: string;
  prNo?: string;
  poNo?: string;
  grNo?: string;
  invoiceNo?: string;
  supplier?: string;
  purchaseDate?: string;
  /** รหัสบัญชีสินทรัพย์ของ ONEBOOK (เช่น 1230) — ใช้ตอนส่ง journal ค่าเสื่อมกลับ GL */
  glAccountCode?: string;
  /** company_id ของ ONEBOOK — ใช้ระบุบริษัทตอนลง GL */
  glCompanyId?: string;
}

export interface LegacyFigures {
  openingNbv: number;
  openingAccum: number;
  periodDep: number;
  closingNbv: number;
  closingAccum: number;
  assetAccount: string;
  expenseAccount: string;
  accumAccount: string;
}

export interface LegacyAssetRow {
  legacyNo: number;
  code: string;
  nameTh: string;
  nameEn: string;
  subcategoryId: string;
  unit: string;
  quantity: number;
  cost: number;
  residual: number;
  lifeYears: number;
  acquisitionDate: string;
  readyDate: string;
  legacy: LegacyFigures;
}

export interface Asset {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  companyId: string;
  branchId: string;
  departmentId: string;
  costCenterId: string;
  locationId: string | null;
  holderId: string | null; // Phase 2 — Employee holder (reserved)
  serialNumber: string;
  brand: string;
  model: string;
  unit: string;
  quantity: number;
  originalCost: number;
  additionalCost: number;
  residual: number;
  lifeMonths: number;
  method: DepMethod;
  policyId: string | null;
  acquisitionDate: string;
  readyDate: string | null;
  status: AssetStatus;
  hasPhoto: boolean;
  source: SourceRef;
  oaId?: string;
  legacy?: LegacyFigures;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AssetDocument {
  id: string;
  assetId: string | null;
  oaId?: string;
  type: DocType;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  sourceSystem: 'OA' | 'FA' | 'LEGACY';
  sourceDocNo: string;
  sizeKb: number;
}

export interface AuditLog {
  id: string;
  at: string;
  user: string;
  role: Role | 'SYSTEM';
  action: string;
  assetCode?: string;
  entity: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  source: AuditSource;
}

export interface OARecord {
  id: string;
  oaNo: string;
  /** เลขเอกสารหลักจากระบบ OA (external key) เช่น AP-PURC-202610-0001 — ใช้ dedupe */
  docNo?: string;
  /** รหัสฟอร์ม OA เช่น PURCHASE */
  templateCode?: string;
  /** ค่าฟอร์มดิบจาก OA (เก็บไว้อ้างอิง/debug) */
  rawFields?: Record<string, unknown>;
  companyId: string;
  branchId: string;
  departmentId: string;
  costCenterId: string;
  requester: string;
  approvedDate: string;
  itemName: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  amount: number;
  supplier: string;
  invoiceNo?: string;
  invoiceDate?: string;
  poNo?: string;
  grNo?: string;
  locationId?: string;
  serialNumbers?: string[];
  documents: string[];
  approvalRef: string;
  status: OAStatus;
  suggestedSubcategoryId?: string;
  duplicateOf?: string;
  error?: string;
  rejectReason?: string;
  createdAssetIds: string[];
  importedAt: string;
}

export interface DepRun {
  id: string;
  period: string; // YYYY-MM
  status: RunStatus;
  assetCount: number;
  amount: number;
  createdBy: string;
  createdAt: string;
  calculatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  postedBy?: string;
  postedAt?: string;
}

/** บันทึกการเคลื่อนย้าย/โอนย้ายทรัพย์สิน (§24) — เก็บประวัติทุกครั้งที่ย้ายที่/สาขา */
export interface AssetMovement {
  id: string;
  assetId: string;
  fromBranchId: string | null;
  toBranchId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  movementDate: string;
  reason: string;
  by: string;
  at: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface RunningNumberConfig {
  companyId: string;
  prefix: string;
  includeYear: boolean;
  includeMonth: boolean;
  includeDay: boolean;
  seqDigits: number;
  nextSeq: number;
  /** ลำดับที่แยกตามหมวดหมู่ สำหรับรหัสแบบ COMPANY-CAT-YY-SEQ (เริ่ม 1 ต่อหมวด) */
  seqByCategory?: Record<string, number>;
}

export interface OAIntegration {
  endpoint: string;
  authType: 'API_KEY' | 'OAUTH2' | 'BASIC';
  syncMode: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK';
  schedule: string;
  lastSyncAt: string;
  mapping: { oa: string; fa: string }[];
}
