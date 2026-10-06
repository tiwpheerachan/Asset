/* ==================== ผู้ใช้และองค์กร ==================== */

export type Role = "ADMIN" | "MANAGER" | "USER";

export type JobRole =
  | "NONE" | "SALES" | "SALES_MANAGER" | "PURCHASING"
  | "MARKETING" | "FINANCE" | "FINANCE_MANAGER" | "MD";

export type Department = {
  id: number;
  name: string;
  active: number;
  created_at: string;
};

export type User = {
  id: number;
  email: string;
  name: string;
  position: string;
  department_id: number | null;
  /** หัวหน้าโดยตรง — ใช้ไล่สิทธิ์การมองเห็นตามสายบังคับบัญชา */
  manager_id: number | null;
  /** ผู้ตรวจสอบ: เห็นทุกใบเพื่อตรวจย้อนหลัง แต่ไม่ได้สิทธิ์อนุมัติหรือแก้ */
  can_audit: number;
  /** ชื่อแผนกที่ join มาจากตาราง departments — อ่านอย่างเดียว */
  department: string;
  job_role: JobRole;
  /** open_id ใน Lark/Feishu — ว่างได้ ระบบจะค้นจากอีเมลให้เอง */
  lark_user_id: string;
  /** ภาษาที่ผู้ใช้เลือกล่าสุด ('' = ยังไม่เคยเลือก) ใช้กับข้อความแจ้งเตือน */
  locale: string;
  /** subject จากระบบกลาง — ว่างแปลว่าเป็นบัญชีที่สร้างในแอปนี้เอง */
  sso_sub: string;
  /** roles/groups ที่ระบบกลางส่งมาล่าสุด (JSON) */
  sso_roles: string;
  sso_synced_at: string | null;
  role: Role;
  active: number;
  created_at: string;
  signature: string;
  /** URL รูปโปรไฟล์จากระบบกลาง — ว่าง = ใช้วงกลมตัวอักษร */
  avatar_url: string;
  must_change_password: number;
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  MANAGER: "หัวหน้าทีม",
  USER: "ผู้ใช้ทั่วไป",
};

export const ROLE_HINT: Record<Role, string> = {
  ADMIN: "เห็นและจัดการได้ทุกอย่าง",
  MANAGER: "เห็นเอกสารทุกฉบับของคนในแผนกตัวเอง",
  USER: "เห็นเฉพาะเอกสารที่ตนจัดทำหรืออยู่ในสายอนุมัติ",
};

export const ROLES = Object.keys(ROLE_LABEL) as Role[];

export const JOB_ROLE_LABEL: Record<JobRole, string> = {
  NONE: "— ไม่ระบุ —",
  SALES: "ผู้แทนขาย",
  SALES_MANAGER: "ผู้จัดการฝ่ายขาย",
  PURCHASING: "ฝ่ายจัดซื้อ",
  MARKETING: "ฝ่ายการตลาด",
  FINANCE: "ฝ่ายบัญชี / การเงิน",
  FINANCE_MANAGER: "ผู้จัดการฝ่ายบัญชี",
  MD: "กรรมการผู้จัดการ",
};

export const JOB_ROLES = Object.keys(JOB_ROLE_LABEL) as JobRole[];

/* ==================== แม่แบบฟอร์ม ==================== */

export type FieldType =
  | "TEXT" | "TEXTAREA" | "NUMBER" | "MONEY" | "DATE"
  | "SELECT" | "MULTISELECT" | "USER" | "FILE" | "IMAGE" | "TABLE"
  /** ตัวเลือกแบบเลื่อนลง — เหมือน SELECT แต่ยุบไว้เป็นแถวเดียว ใช้เมื่อตัวเลือกเยอะ */
  | "DROPDOWN"
  /** อ้างถึงคำขออีกใบที่อนุมัติแล้ว เช่น CN อ้างถึง Master approval ของ trade term */
  | "REQUEST"
  /** ไม่ใช่ช่องกรอก — เป็นหัวข้อคั่นกลางฟอร์มพร้อมคำอธิบาย ใช้แบ่งฟอร์มยาวเป็นส่วน ๆ */
  | "HEADING"
  /** ช่วงเวลา เริ่ม–สิ้นสุด เก็บเป็น { from, to } และนับจำนวนวันให้เอง */
  | "DATERANGE"
  /** ยอดรวมที่บวกจากคอลัมน์หนึ่งของตารางให้เอง — คนกรอกแก้ไม่ได้ */
  | "TOTAL";

/**
 * ฟิลด์ที่ระบบหยิบไปใช้เป็นหัวเรื่อง / วงเงิน / วันที่ ของเอกสาร
 *
 * EVENT_DATE ต่างจาก DATE — DATE คือวันที่ของเอกสาร (วันที่เขียน)
 * ส่วน EVENT_DATE คือวันที่จะเกิดค่าใช้จ่ายจริง เช่นวันจัดงาน ใช้นับว่ายื่นล่วงหน้าพอไหม
 */
export type FieldRole = "" | "TITLE" | "AMOUNT" | "DATE" | "EVENT_DATE" | "PERIODS";

export type ColumnType =
  | "TEXT" | "NUMBER" | "MONEY" | "DATE" | "SELECT" | "USER"
  /** เลือกได้หลายค่าในเซลล์เดียว เก็บเป็น array แสดงเป็นชิป */
  | "MULTISELECT"
  /** ไฟล์แนบของ "แถวนั้น" เช่น ใบเสนอราคาของรายการนั้น ไม่ใช่ของทั้งเอกสาร */
  | "FILE";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "ข้อความบรรทัดเดียว",
  TEXTAREA: "ข้อความหลายบรรทัด",
  NUMBER: "ตัวเลข",
  MONEY: "จำนวนเงิน",
  DATE: "วันที่",
  SELECT: "ตัวเลือก (เลือกได้ 1)",
  DROPDOWN: "ดรอปดาวน์ (เลื่อนลงเลือก)",
  MULTISELECT: "ตัวเลือก (เลือกได้หลายข้อ)",
  USER: "เลือกบุคคล",
  FILE: "ไฟล์แนบ",
  IMAGE: "รูปภาพ",
  TABLE: "ตารางรายการ",
  REQUEST: "อ้างอิงคำขอที่อนุมัติแล้ว",
  HEADING: "หัวข้อคั่น (ไม่ใช่ช่องกรอก)",
  DATERANGE: "ช่วงเวลา (เริ่ม–สิ้นสุด)",
  TOTAL: "ยอดรวมจากตาราง (คำนวณให้เอง)",
};

export const FIELD_TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[];

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  TEXT: "ข้อความ",
  NUMBER: "ตัวเลข",
  MONEY: "จำนวนเงิน",
  DATE: "วันที่",
  SELECT: "ตัวเลือก",
  MULTISELECT: "ตัวเลือก (หลายค่า)",
  USER: "บุคคล",
  FILE: "ไฟล์แนบ",
};

export const COLUMN_TYPES = Object.keys(COLUMN_TYPE_LABEL) as ColumnType[];

export const FIELD_ROLE_LABEL: Record<FieldRole, string> = {
  "": "— ไม่ใช่ —",
  TITLE: "หัวเรื่องของเอกสาร",
  AMOUNT: "วงเงิน (ใช้ตัดสินสายอนุมัติ)",
  DATE: "วันที่ของเอกสาร",
  EVENT_DATE: "วันที่จัดงาน / วันที่ใช้เงิน (ใช้นับล่วงหน้า)",
  PERIODS: "จำนวนงวดที่จะทยอยเบิก",
};

export type FormCategory = {
  id: number;
  name: string;
  sort_order: number;
  active: number;
};

/** สีไอคอนของแม่แบบบนการ์ด — เก็บเป็นชื่อสี ไม่ใช่ค่า hex จะได้ปรับธีมทีเดียวได้ */
export const TEMPLATE_COLORS = {
  pink: "#e8388a",
  blue: "#3370ff",
  orange: "#ff8800",
  green: "#34a853",
  purple: "#7f3bf5",
  teal: "#00a3a3",
  red: "#e5484d",
  slate: "#64748b",
} as const;

export type TemplateColor = keyof typeof TEMPLATE_COLORS;
export const TEMPLATE_COLOR_KEYS = Object.keys(TEMPLATE_COLORS) as TemplateColor[];

/**
 * โทนเดียว SHD navy — ให้ไอคอนหมวดฟอร์มเป็นสีเดียวกันทั้งระบบ (เข้าชุด Fixed Asset)
 * เดิมแจกสีรุ้งตามรหัสแม่แบบเหมือน Lark แต่ทำให้ดูเป็น template สำเร็จรูปและไม่เข้ากับ Asset
 * (เก็บ TEMPLATE_COLORS ไว้เผื่อหน้าตั้งค่าแม่แบบในอนาคต)
 */
export function templateColor(_code: string, _color: string): string {
  return "#1f4a85";
}

/**
 * ช่องลายเซ็นบนเอกสารที่พิมพ์
 *
 * เอกสารอนุมัติภายในไม่จำเป็นต้องมีลายเซ็น — ระบบ track อยู่แล้วว่าใครกดอนุมัติเมื่อไหร่
 * แต่เอกสารที่ออกให้ลูกค้าต้องมี จึงให้ตั้งเป็นรายฟอร์ม ไม่ใช่ตั้งทั้งระบบ
 */
export type SignatureMode = "NONE" | "OPTIONAL" | "REQUIRED";

/** ยื่นไม่ทันกำหนดล่วงหน้าแล้วจะทำยังไง */
export type LeadMode = "WARN" | "BLOCK";
export const LEAD_MODES: LeadMode[] = ["WARN", "BLOCK"];

export const SIGNATURE_MODES: SignatureMode[] = ["NONE", "OPTIONAL", "REQUIRED"];

export type FormTemplate = {
  id: number;
  code: string;
  name: string;
  category_id: number | null;
  icon: string;
  color: string;
  description: string;
  active: number;
  sort_order: number;
  record_submitter: number;
  doc_prefix: string;
  /** ต้องเคลียร์ค่าใช้จ่ายใน OA ภายในกี่วันหลังอนุมัติ (0 = ไม่ต้องติดตาม) */
  clear_within_days: number;
  /** ต้องยื่นล่วงหน้ากี่วัน (0 = ไม่บังคับ) */
  lead_days: number;
  /** ยื่นด่วนได้อย่างน้อยกี่วัน — ต่ำกว่านี้ตามกติกาใน lead_mode */
  lead_urgent_days: number;
  /** WARN = ให้ส่งได้แต่ต้องกรอกเหตุผล · BLOCK = ส่งไม่ได้เลย */
  lead_mode: LeadMode;
  print_config: string;
  signature_mode: SignatureMode;
  created_at: string;
  updated_at: string;
};

export type TemplateWithCategory = FormTemplate & { category_name: string };

export type TableColumn = {
  id: number;
  field_id: number;
  col_key: string;
  label: string;
  type: ColumnType;
  required: number;
  options: string;
  /** ข้อความต่อท้ายค่าในช่อง เช่น THB-Baht หรือ % — ไม่มีผลกับการคำนวณ */
  unit: string;
  sort_order: number;
};

export type FormField = {
  id: number;
  template_id: number;
  field_key: string;
  label: string;
  type: FieldType;
  field_role: FieldRole;
  required: number;
  help: string;
  /** ข้อความจาง ๆ ในช่องว่าง — บอกว่าควรกรอกอะไร ต่างจาก help ที่อยู่ใต้ช่อง */
  placeholder: string;
  options: string;
  /** ช่องชนิด TOTAL บวกจากคอลัมน์ไหน — "<รหัสช่องตาราง>.<รหัสคอลัมน์>" */
  sum_of: string;
  /** แสดงช่องนี้เมื่อช่อง show_if_key มีค่าเท่ากับ show_if_value ('' = แสดงเสมอ) */
  show_if_key: string;
  show_if_value: string;
  sort_order: number;
  active: number;
};

/** ฟิลด์พร้อมข้อมูลที่แตกออกมาให้ UI ใช้ได้ทันที */
export type Field = Omit<FormField, "options"> & {
  options: string[];
  columns: (Omit<TableColumn, "options"> & { options: string[] })[];
};

export type FieldColumn = Field["columns"][number];

/* ==================== สายอนุมัติ ==================== */

export type Stage = "PRELIM" | "FINAL";
export type NodeKind = "APPROVE" | "CC";
export type NodeMode = "SEQUENTIAL" | "ANY" | "ALL";
export type CondOp = "" | "GTE" | "LT" | "EQ" | "NEQ";

export const STAGE_LABEL: Record<Stage, string> = {
  PRELIM: "อนุมัติเบื้องต้น",
  FINAL: "อนุมัติจริง",
};

export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  APPROVE: "ต้องอนุมัติ",
  CC: "สำเนาถึง (แจ้งให้ทราบ)",
};

export const NODE_MODE_LABEL: Record<NodeMode, string> = {
  SEQUENTIAL: "คนเดียว",
  ANY: "ใครก็ได้ 1 คน",
  ALL: "ต้องครบทุกคน",
};

export const COND_OP_LABEL: Record<CondOp, string> = {
  "": "ใช้เสมอ",
  GTE: "ตั้งแต่ (≥)",
  LT: "น้อยกว่า (<)",
  EQ: "เท่ากับ",
  NEQ: "ไม่เท่ากับ",
};

export type FlowNodeMember = {
  id: number;
  node_id: number;
  source: "JOB_ROLE" | "USER";
  job_role: JobRole | "";
  user_id: number | null;
  scope: "ANY" | "DEPT";
};

export type FlowNode = {
  id: number;
  template_id: number;
  name: string;
  kind: NodeKind;
  mode: NodeMode;
  stage: Stage;
  sort_order: number;
  cond_field: string;
  cond_op: CondOp;
  cond_value: string;
  active: number;
};

export type FlowNodeFull = FlowNode & { members: FlowNodeMember[] };

/* ==================== คำขอ ==================== */

export type RequestStatus =
  | "DRAFT" | "PENDING" | "PRELIM_APPROVED"
  | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";

export type ApproverStatus =
  | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED" | "NOTIFIED";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: "ฉบับร่าง",
  PENDING: "รออนุมัติ",
  PRELIM_APPROVED: "อนุมัติเบื้องต้นแล้ว",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  RETURNED: "ถูกส่งกลับให้แก้",
  CANCELLED: "ยกเลิก",
};

export const APPROVER_STATUS_LABEL: Record<ApproverStatus, string> = {
  PENDING: "รอพิจารณา",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  SKIPPED: "ไม่ต้องพิจารณาแล้ว",
  NOTIFIED: "แจ้งให้ทราบ",
};

export type RequestRecord = {
  id: number;
  doc_no: string;
  template_id: number;
  requester_id: number;
  title: string;
  amount: number | null;
  doc_date: string;
  data: string;
  status: RequestStatus;
  stage: Stage;
  current_step: number;
  urgent_reason: string;
  clear_due_date: string;
  oa_ref: string;
  clear_nudged_on: string | null;
  cleared_at: string | null;
  cleared_by: number | null;
  submitted_at: string | null;
  prelim_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestWithMeta = RequestRecord & {
  requester_name: string;
  requester_position: string;
  requester_department_id: number | null;
  requester_department: string;
  requester_avatar?: string;
  template_name: string;
  template_code: string;
  template_icon: string;
  template_signature_mode: SignatureMode;
  template_print_config: string;
  template_clear_within_days: number;
};

export type RequestApprover = {
  /** รูปโปรไฟล์ของผู้อนุมัติ และของคนที่กดจริง (ต่างกันเมื่ออนุมัติแทน) */
  avatar_url?: string;
  acted_by_avatar?: string | null;
  id: number;
  request_id: number;
  stage: Stage;
  step_no: number;
  node_name: string;
  kind: NodeKind;
  mode: NodeMode;
  user_id: number;
  job_role: string;
  title: string;
  status: ApproverStatus;
  comment: string;
  acted_at: string | null;
  read_at: string | null;
  added_by: number | null;
  from_user: number | null;
  acted_by: number | null;
  acted_by_name?: string | null;
  name: string;
  position: string;
  email: string;
  from_user_name: string | null;
};

export type Attachment = {
  id: number;
  request_id: number;
  field_key: string;
  /** ถ้ามีค่า แปลว่าไฟล์นี้แนบมากับความคิดเห็น ไม่ใช่กับตัวฟอร์ม */
  comment_id: number | null;
  filename: string;
  stored_name: string;
  mime: string;
  size: number;
  uploaded_by: number;
  created_at: string;
  uploader_name: string;
};

export type Comment = {
  id: number;
  request_id: number;
  user_id: number;
  body: string;
  created_at: string;
  author_name: string;
  files: Attachment[];
};

/* ---------- สถานะฝั่งบัญชี (OneBook) ---------- */

export const EXTERNAL_STATES = ["RECEIVED", "RECORDED", "PAID", "REJECTED"] as const;
export type ExternalState = (typeof EXTERNAL_STATES)[number];

export const EXTERNAL_STATE_LABEL: Record<ExternalState, string> = {
  RECEIVED: "บัญชีรับเรื่องแล้ว",
  RECORDED: "บันทึกบัญชีแล้ว",
  PAID: "จ่ายเงินแล้ว",
  REJECTED: "บัญชีตีกลับ",
};

export type ExternalStatus = {
  id: number;
  request_id: number;
  source: string;
  state: ExternalState;
  external_ref: string;
  external_url: string;
  amount: number | null;
  occurred_at: string;
  note: string;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  request_id: number;
  actor_id: number | null;
  action: string;
  detail: string;
  amount: number | null;
  created_at: string;
  actor_name: string | null;
};

/* ==================== ตัวตรวจชนิด ==================== */

export const isRole = (v: unknown): v is Role => typeof v === "string" && v in ROLE_LABEL;
export const isJobRole = (v: unknown): v is JobRole =>
  typeof v === "string" && v in JOB_ROLE_LABEL;
export const isStage = (v: unknown): v is Stage => v === "PRELIM" || v === "FINAL";
export const isFieldType = (v: unknown): v is FieldType =>
  typeof v === "string" && v in FIELD_TYPE_LABEL;
export const isColumnType = (v: unknown): v is ColumnType =>
  typeof v === "string" && v in COLUMN_TYPE_LABEL;
export const isNodeKind = (v: unknown): v is NodeKind => v === "APPROVE" || v === "CC";
export const isNodeMode = (v: unknown): v is NodeMode =>
  v === "SEQUENTIAL" || v === "ANY" || v === "ALL";
export const isCondOp = (v: unknown): v is CondOp =>
  typeof v === "string" && v in COND_OP_LABEL;
