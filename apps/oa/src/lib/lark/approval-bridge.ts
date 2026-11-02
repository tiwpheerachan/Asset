import "server-only";
import { db } from "../db";
import { createApprovalInstance, linkApproval, mapApprovalStatus, approvalReady } from "./approval";

/**
 * สะพาน 2 ทาง: "สร้างในเว็บ OA → สร้าง instance ใน Lark Approval" + "สถานะ Lark → อัปเดตคำขอเว็บ"
 *
 * ปลอดภัยโดยดีไซน์ — ทุกฟังก์ชันเป็น no-op เว้นแต่:
 *   1) เปิด env  LARK_APPROVAL_BRIDGE=on
 *   2) แอปมี scope approval (approvalReady / FEISHU_BASE_*)
 *   3) template นั้นมี mapping ที่ active=true ในตาราง oa_approval_bridge
 * ค่าเริ่มต้นปิดหมด → พฤติกรรมเดิมไม่เปลี่ยน
 */

export const approvalBridgeEnabled = () => (process.env.LARK_APPROVAL_BRIDGE || "").toLowerCase() === "on";

export type BridgeMapping = {
  template_id: number;
  approval_code: string;
  id_type: string;
  field_map: Record<string, { widget_id: string; type: string }>;
  active: boolean;
};

export async function mappingFor(templateId: number): Promise<BridgeMapping | null> {
  const r = await db
    .prepare(`SELECT template_id, approval_code, id_type, field_map, active FROM oa_approval_bridge WHERE template_id = ? AND active = true`)
    .get<BridgeMapping>(templateId)
    .catch(() => null);
  return r ?? null;
}

/** แปลงค่าฟอร์มเว็บ → รูปแบบ widget ของ Lark ตาม field_map */
function buildLarkForm(data: Record<string, any>, map: BridgeMapping["field_map"]): { id: string; type: string; value: unknown }[] {
  const out: { id: string; type: string; value: unknown }[] = [];
  for (const [key, w] of Object.entries(map || {})) {
    const v = data?.[key];
    if (v != null && v !== "" && w?.widget_id) out.push({ id: w.widget_id, type: w.type || "input", value: v });
  }
  return out;
}

/**
 * ยิงสร้างคำขอใน Lark Approval หลัง submit สำเร็จ (best-effort — ล้มเหลวไม่กระทบคำขอในเว็บ)
 * @returns instance_code ถ้าสร้างได้ · null ถ้าไม่เข้าเงื่อนไข/ล้มเหลว
 */
export async function pushNewRequestToLark(req: { id: number; template_id: number; data: string; serial?: string }, requesterOpenId: string): Promise<string | null> {
  try {
    if (!approvalBridgeEnabled() || !approvalReady()) return null;
    if (!requesterOpenId) return null;
    const m = await mappingFor(req.template_id);
    if (!m) return null;
    const data = JSON.parse(req.data || "{}");
    const form = buildLarkForm(data, m.field_map);
    const { instance_code } = await createApprovalInstance({ approvalCode: m.approval_code, openId: requesterOpenId, form });
    await linkApproval({ instanceCode: instance_code, approvalCode: m.approval_code, oaRequestId: req.id, serialNumber: req.serial });
    return instance_code;
  } catch (e) {
    console.error("[approval-bridge] pushNewRequestToLark failed:", (e as Error).message);
    return null;
  }
}

/** Lark → เว็บ: อัปเดตสถานะคำขอจาก event อนุมัติ (เรียกใน callback หลัง handleApprovalEvent) */
export async function applyLarkStatusToRequest(oaRequestId: number | undefined, larkStatus: string | undefined): Promise<void> {
  try {
    if (!approvalBridgeEnabled() || !oaRequestId || !larkStatus) return;
    const to: Record<string, string> = { APPROVED: "APPROVED", REJECTED: "REJECTED", CANCELED: "CANCELLED", PENDING: "PENDING" };
    const s = to[mapApprovalStatus(larkStatus)];
    if (!s) return;
    // อัปเดตเฉพาะถ้ายังไม่ปิด (กันย้อนสถานะที่จบแล้ว)
    await db.prepare(`UPDATE requests SET status = ?, updated_at = utc_now_text() WHERE id = ? AND status NOT IN ('APPROVED','REJECTED','CANCELLED')`).run(s, oaRequestId);
  } catch (e) {
    console.error("[approval-bridge] applyLarkStatusToRequest failed:", (e as Error).message);
  }
}
