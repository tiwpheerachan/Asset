/**
 * เอนจินสายอนุมัติ — แปลง "โหนดที่ผู้ดูแลตั้งไว้ในแม่แบบ" ให้เป็น "รายชื่อผู้อนุมัติจริงของคำขอใบนี้"
 *
 * ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ (ไม่แตะฐานข้อมูล) เพื่อให้ใช้ได้ทั้ง
 *   - ฝั่ง server ตอนส่งอนุมัติจริง (คือค่าที่ถือเป็นทางการ)
 *   - ฝั่ง client ตอนแสดงตัวอย่างสายอนุมัติในฟอร์ม
 * ทั้งสองฝั่งจึงเห็นผลลัพธ์ตรงกันเสมอ
 */
import type { FlowNodeFull, JobRole, NodeKind, NodeMode, Stage, User } from "./types";
import { JOB_ROLE_LABEL } from "./types";

/** ข้อมูลผู้จัดทำเท่าที่การสร้างสายอนุมัติต้องใช้ */
export type Requester = Pick<User, "id" | "department_id">;

export type FlowMemberResolved = {
  user_id: number;
  name: string;
  /** รูปโปรไฟล์จากระบบกลาง — ว่างได้ ตกไปใช้วงกลมตัวอักษร */
  avatar?: string;
  job_role: string;
  title: string;
};

export type FlowStep = {
  step_no: number;
  stage: Stage;
  kind: NodeKind;
  mode: NodeMode;
  name: string;
  members: FlowMemberResolved[];
};

export type FlowResult = {
  steps: FlowStep[];
  /** ตำแหน่งงานที่กติกาต้องการแต่ยังไม่มีผู้ใช้คนไหนถือ */
  missing: JobRole[];
};

/* ---------- เงื่อนไขของโหนด ---------- */

const numeric = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** โหนดนี้ถูกใช้กับคำขอใบนี้ไหม — ดูจากค่าในฟิลด์ที่ตั้งเป็นเงื่อนไข */
export function nodeApplies(node: FlowNodeFull, data: Record<string, unknown>): boolean {
  if (!node.active) return false;
  if (!node.cond_field || !node.cond_op) return true;

  const left = data[node.cond_field];
  const right = node.cond_value;

  if (node.cond_op === "EQ") return String(left ?? "") === right;
  if (node.cond_op === "NEQ") return String(left ?? "") !== right;

  const a = numeric(left);
  const b = numeric(right);
  if (a === null || b === null) return false; // เทียบตัวเลขไม่ได้ = ไม่เข้าเงื่อนไข
  return node.cond_op === "GTE" ? a >= b : a < b;
}

/* ---------- หาตัวบุคคลจากสมาชิกของโหนด ---------- */

function resolveMember(
  member: FlowNodeFull["members"][number],
  users: User[],
  requester: Requester,
): { user: User | null; missing: JobRole | null } {
  if (member.source === "USER") {
    const u = users.find((x) => x.id === member.user_id && x.active);
    return { user: u ?? null, missing: null };
  }

  const role = member.job_role as JobRole;
  const holders = users
    .filter((u) => u.active && u.job_role === role)
    .sort((a, b) => a.id - b.id);
  if (holders.length === 0) return { user: null, missing: role };

  if (member.scope === "DEPT" && requester.department_id !== null) {
    const sameDept = holders.find((u) => u.department_id === requester.department_id);
    if (sameDept) return { user: sameDept, missing: null };
  }
  return { user: holders[0], missing: null };
}

/**
 * สร้างสายอนุมัติของคำขอหนึ่งใบ
 *
 * กติกาที่ใช้เสมอ:
 *  - ผู้จัดทำอนุมัติงานตัวเองได้ (ปิดกฎกันอนุมัติตัวเองแล้ว)
 *  - คนเดิมที่เคยอนุมัติในขั้นก่อนหน้าแล้ว ไม่ต้องอนุมัติซ้ำอีกขั้น
 *  - ขั้นอนุมัติที่ไม่เหลือใครเลย จะถูกข้ามทิ้ง (ขั้นสำเนาถึงไม่ตัดคนซ้ำ)
 */
export function resolveFlow({
  nodes,
  users,
  data,
  requester,
  stage,
}: {
  nodes: FlowNodeFull[];
  users: User[];
  data: Record<string, unknown>;
  requester: Requester;
  /** ระบุเพื่อเอาเฉพาะระดับเดียว — ไม่ระบุ = ทุกระดับ */
  stage?: Stage;
}): FlowResult {
  const applicable = nodes
    .filter((n) => nodeApplies(n, data))
    .filter((n) => (stage ? n.stage === stage : true))
    .sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === "PRELIM" ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });

  const steps: FlowStep[] = [];
  const missing: JobRole[] = [];
  // อนุญาตให้ผู้จัดทำอนุมัติงานตัวเองได้ (ปิดกฎกันอนุมัติตัวเองทั้งระบบ)
  // approvedBy ยังใช้กันอนุมัติซ้ำข้ามขั้นตามเดิม แค่ไม่ตัดผู้จัดทำออกตั้งแต่ต้น
  const approvedBy = new Set<number>();
  const counter: Record<Stage, number> = { PRELIM: 0, FINAL: 0 };

  for (const node of applicable) {
    const members: FlowMemberResolved[] = [];
    const seen = new Set<number>();

    for (const m of node.members) {
      const { user, missing: miss } = resolveMember(m, users, requester);
      if (miss && !missing.includes(miss)) missing.push(miss);
      if (!user) continue;
      if (seen.has(user.id)) continue;
      if (node.kind === "APPROVE" && approvedBy.has(user.id)) continue;
      seen.add(user.id);
      members.push({
        user_id: user.id,
        name: user.name,
        avatar: user.avatar_url || undefined,
        job_role: m.source === "USER" ? "" : m.job_role,
        title: user.position || (m.job_role ? JOB_ROLE_LABEL[m.job_role as JobRole] : ""),
      });
    }

    if (members.length === 0) continue; // ไม่เหลือใครในขั้นนี้ — ข้าม
    if (node.kind === "APPROVE") for (const m of members) approvedBy.add(m.user_id);

    counter[node.stage] += 1;
    steps.push({
      step_no: counter[node.stage],
      stage: node.stage,
      kind: node.kind,
      mode: node.mode,
      name: node.name || defaultNodeName(node, members),
      members,
    });
  }

  return { steps, missing };
}

function defaultNodeName(node: FlowNodeFull, members: FlowMemberResolved[]): string {
  if (node.kind === "CC") return "สำเนาถึง";
  return members[0]?.title || "ผู้อนุมัติ";
}

/** แม่แบบนี้ต้องผ่านอนุมัติเบื้องต้นก่อนไหม (สำหรับค่าในคำขอชุดนี้) */
export function hasPrelim(nodes: FlowNodeFull[], data: Record<string, unknown>): boolean {
  return nodes.some((n) => n.stage === "PRELIM" && n.kind === "APPROVE" && nodeApplies(n, data));
}
