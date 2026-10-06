import "server-only";
import { db } from "./db";
import { getFlowNodes, listActiveUsers } from "./queries";
import { resolveFlow, type FlowStep } from "./flow";
import { JOB_ROLE_LABEL, STAGE_LABEL, type JobRole, type Stage, type User } from "./types";
import type { FormValues } from "./form";

/**
 * สร้างสายอนุมัติจากแม่แบบแล้วเขียนลงตาราง
 *
 * แยกออกมาจาก actions.ts เพราะทั้งหน้าเว็บและ API ของระบบภายนอกต้องใช้ตัวเดียวกัน
 * — เอกสารที่เข้ามาทางไหนก็ต้องวิ่งไปหาคนชุดเดียวกันตามกติกาเดียวกัน
 */

/** สร้างสายอนุมัติของระดับหนึ่งแล้วเขียนลงตาราง — คืนข้อความ error ถ้าสร้างไม่ได้ */
export async function buildFlow(
  requestId: number,
  templateId: number,
  stage: Stage,
  data: FormValues,
  requester: User,
): Promise<string | null> {
  const nodes = getFlowNodes(templateId);
  const { steps, missing } = resolveFlow({
    nodes: await nodes, users: await listActiveUsers(), data, requester, stage,
  });

  if (missing.length > 0) {
    const names = missing.map((r) => JOB_ROLE_LABEL[r as JobRole]).join(", ");
    return `ยังไม่มีผู้ใช้งานที่ถือตำแหน่ง: ${names} — ให้ผู้ดูแลระบบกำหนดตำแหน่งงานให้ผู้ใช้ก่อน`;
  }
  if (!steps.some((s) => s.kind === "APPROVE")) {
    return `แม่แบบนี้ยังไม่มีขั้นอนุมัติที่ใช้ได้ในระดับ${STAGE_LABEL[stage]} — ให้ผู้ดูแลระบบตั้งค่าที่เมนูแม่แบบฟอร์ม`;
  }

  await writeFlow(requestId, stage, steps);
  return null;
}

export async function writeFlow(requestId: number, stage: Stage, steps: FlowStep[]) {
  await db.prepare("DELETE FROM request_approvers WHERE request_id = ? AND stage = ?")
    .run(requestId, stage);
  const stmt = db.prepare(
    `INSERT INTO request_approvers
       (request_id, stage, step_no, node_name, kind, mode, user_id, job_role, title, status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const s of steps) {
    for (const m of s.members) {
      await stmt.run(
        requestId, stage, s.step_no, s.name, s.kind, s.mode,
        m.user_id, m.job_role, m.title,
        s.kind === "CC" ? "PENDING" : "PENDING",
      );
    }
  }
}
