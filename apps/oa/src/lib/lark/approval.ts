import "server-only";
import { db } from "../db";
import { feishuCall, feishuReady } from "./feishu-core";

/**
 * ต่อกับ Lark Approval (审批) API v4 — ใช้สำหรับเอกสารที่ "สร้างจากเว็บ OA"
 * ให้ไหลเข้าสายอนุมัติเดียวกับฟอร์ม Lark และอนุมัติที่ไหนก็ซิงก์กัน
 *
 * ต้องมี scope `approval` (instance + task) ในแอป OA Base Reader
 * โมดูลนี้ "สร้างคำขอใหม่/อนุมัติคำขอที่ OA เป็นเจ้าของ" เท่านั้น
 * ไม่ยุ่ง/ไม่แก้คำขอเดิมที่พนักงานยื่นจากฝั่ง Lark
 */

export { feishuReady as approvalReady };

export type ApprovalFormWidget = { id: string; type: string; value: unknown };

/* ---------- แม็ป: ฟอร์ม OA ↔ approval_code ของ Lark ---------- */

const MAP_KEY = "feishu_approval_map";

export async function getApprovalMap(): Promise<Record<string, string>> {
  const row = await db.prepare("SELECT value FROM app_meta WHERE key = ?").get<{ value: string }>(MAP_KEY);
  try { return row?.value ? JSON.parse(row.value) : {}; } catch { return {}; }
}

export async function setApprovalCode(oaTemplateId: string, approvalCode: string): Promise<void> {
  const map = await getApprovalMap();
  map[oaTemplateId] = approvalCode;
  await db
    .prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
    .run(MAP_KEY, JSON.stringify(map));
}

/* ---------- ชนิดข้อมูล ---------- */

export type ApprovalInstance = {
  instance_code: string;
  status: string; // PENDING / APPROVED / REJECTED / CANCELED / DELETED
  approval_code?: string;
  serial_number?: string;
  task_list?: { id: string; user_id?: string; status: string; node_name?: string }[];
  timeline?: unknown[];
};

export type ApprovalDefinition = {
  approval_code: string;
  approval_name: string;
  form: string; // JSON string ของ widget ทั้งหมด
  node_list?: { name: string; need_approver?: boolean }[];
};

/* ---------- API ---------- */

/** รายละเอียดนิยามฟอร์มอนุมัติ (ไว้ดูว่ามี widget อะไรบ้าง → map กับฟอร์ม OA) */
export async function getApprovalDefinition(approvalCode: string): Promise<ApprovalDefinition> {
  return feishuCall(`/open-apis/approval/v4/approvals/${approvalCode}`, { query: { locale: "th" } });
}

/**
 * สร้างคำขออนุมัติใน Lark (instance) จากข้อมูลที่กรอกในเว็บ OA
 * @param openId  open_id ของผู้ยื่น (ผู้ใช้ OA ที่จับคู่กับ Lark แล้ว)
 * @param form    ค่าฟอร์มตาม widget ของ approval definition
 */
export async function createApprovalInstance(args: {
  approvalCode: string;
  openId: string;
  form: ApprovalFormWidget[];
}): Promise<{ instance_code: string }> {
  return feishuCall(`/open-apis/approval/v4/instances`, {
    method: "POST",
    body: {
      approval_code: args.approvalCode,
      open_id: args.openId,
      form: JSON.stringify(args.form),
    },
  });
}

/** อ่านสถานะ instance (ใช้ตอน sync กลับ/ตรวจสอบ) */
export async function getApprovalInstance(instanceCode: string): Promise<ApprovalInstance> {
  return feishuCall(`/open-apis/approval/v4/instances/${instanceCode}`);
}

/** อนุมัติ task หนึ่ง (เมื่อผู้ใช้กดอนุมัติในเว็บ OA → ดันเข้า Lark) */
export async function approveTask(args: {
  approvalCode: string;
  instanceCode: string;
  taskId: string;
  openId: string;
  comment?: string;
}): Promise<void> {
  await feishuCall(`/open-apis/approval/v4/tasks/approve`, {
    method: "POST",
    body: {
      approval_code: args.approvalCode,
      instance_code: args.instanceCode,
      task_id: args.taskId,
      open_id: args.openId,
      comment: args.comment ?? "",
    },
  });
}

/** ปฏิเสธ task หนึ่ง */
export async function rejectTask(args: {
  approvalCode: string;
  instanceCode: string;
  taskId: string;
  openId: string;
  comment?: string;
}): Promise<void> {
  await feishuCall(`/open-apis/approval/v4/tasks/reject`, {
    method: "POST",
    body: {
      approval_code: args.approvalCode,
      instance_code: args.instanceCode,
      task_id: args.taskId,
      open_id: args.openId,
      comment: args.comment ?? "",
    },
  });
}

/** map สถานะ Lark Approval → สถานะภายใน OA (ภาษากลาง) */
export function mapApprovalStatus(larkStatus: string): "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" {
  switch ((larkStatus || "").toUpperCase()) {
    case "APPROVED": return "APPROVED";
    case "REJECTED": return "REJECTED";
    case "CANCELED":
    case "DELETED": return "CANCELED";
    default: return "PENDING";
  }
}

/* ---------- ผูก/อ่าน mapping OA ↔ instance ---------- */

/** บันทึกคู่ความสัมพันธ์ตอน OA สร้าง instance สำเร็จ */
export async function linkApproval(args: {
  instanceCode: string;
  approvalCode: string;
  oaRequestId?: number;
  serialNumber?: string;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feishu_approvals (instance_code, approval_code, oa_request_id, serial_number)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (instance_code)
       DO UPDATE SET approval_code = EXCLUDED.approval_code, oa_request_id = EXCLUDED.oa_request_id, serial_number = EXCLUDED.serial_number`,
    )
    .run(args.instanceCode, args.approvalCode, args.oaRequestId ?? null, args.serialNumber ?? "");
}

export async function getApprovalByRequest(oaRequestId: number) {
  return db
    .prepare(`SELECT * FROM feishu_approvals WHERE oa_request_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get<{ instance_code: string; approval_code: string; status: string; serial_number: string }>(oaRequestId);
}

/* ---------- รับ event จาก Lark (สถานะอนุมัติเปลี่ยน) ---------- */

/** แกะ payload event อนุมัติ รองรับทั้ง schema 2.0 และแบบเดิม */
export function parseApprovalEvent(
  body: any,
): { instanceCode: string; status: string; approvalCode: string } | null {
  const et = body?.header?.event_type ?? body?.event?.type;
  if (et !== "approval_instance") return null;
  const ev = body?.event ?? {};
  const instanceCode = ev.instance_code ?? ev.instanceCode;
  if (!instanceCode) return null;
  return {
    instanceCode,
    status: ev.status ?? "",
    approvalCode: ev.approval_code ?? ev.approvalCode ?? "",
  };
}

/**
 * ประมวลผล event อนุมัติ: อัปเดตสถานะใน mapping
 * (การซิงก์ต่อไปยังสถานะคำขอ OA ทำในชั้น wiring ของ create-request เมื่อทดสอบได้)
 * คืน oa_request_id ถ้ามี เพื่อให้ผู้เรียกไปอัปเดตต่อ
 */
export async function handleApprovalEvent(body: any): Promise<{ handled: boolean; oaRequestId?: number; status?: string }> {
  const ev = parseApprovalEvent(body);
  if (!ev) return { handled: false };
  const status = mapApprovalStatus(ev.status);
  const row = await db
    .prepare(
      `UPDATE feishu_approvals SET status = ?, updated_at = utc_now_text() WHERE instance_code = ?`,
    )
    .run(status, ev.instanceCode);
  // ถ้ายังไม่เคยมี (เช่น instance ที่ OA ยังไม่รู้จัก) บันทึกไว้ก่อน
  if (row.changes === 0) {
    await db
      .prepare(
        `INSERT INTO feishu_approvals (instance_code, approval_code, status) VALUES (?, ?, ?)
         ON CONFLICT (instance_code) DO UPDATE SET status = EXCLUDED.status, updated_at = utc_now_text()`,
      )
      .run(ev.instanceCode, ev.approvalCode, status);
  }
  const link = await db
    .prepare(`SELECT oa_request_id FROM feishu_approvals WHERE instance_code = ?`)
    .get<{ oa_request_id: number | null }>(ev.instanceCode);
  return { handled: true, oaRequestId: link?.oa_request_id ?? undefined, status };
}
