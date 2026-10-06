import "server-only";
import crypto from "node:crypto";
import { db, USER_SELECT } from "./db";
import { parseJson } from "./form";
import { actableUserIds } from "./delegation";
import { drawdown, type DrawChild, type Drawdown } from "./drawdown";
import { subordinateIds, type OrgEdge } from "./org";
import { pickPreviewFields } from "./preview";
import type {
  Attachment,
  AuditEntry,
  Comment,
  Department,
  Field,
  FlowNode,
  FlowNodeFull,
  FlowNodeMember,
  FormCategory,
  FormField,
  FormTemplate,
  RequestApprover,
  RequestWithMeta,
  Stage,
  TableColumn,
  TemplateWithCategory,
  User,
} from "./types";

const REQ_SELECT = `
  SELECT r.*,
         u.name                AS requester_name,
         u.position            AS requester_position,
         u.department_id       AS requester_department_id,
         COALESCE(d.name, '')  AS requester_department,
         u.avatar_url          AS requester_avatar,
         t.name                AS template_name,
         t.code                AS template_code,
         t.icon                AS template_icon,
         t.signature_mode      AS template_signature_mode,
         t.print_config        AS template_print_config,
         t.clear_within_days   AS template_clear_within_days
    FROM requests r
    JOIN users u ON u.id = r.requester_id
    JOIN form_templates t ON t.id = r.template_id
    LEFT JOIN departments d ON d.id = u.department_id
`;

/** ลูกน้องทั้งสายของคนนี้ — โหลดผังทั้งองค์กรมาไล่ในหน่วยความจำ (หลักสิบคน ไม่ใช่ปัญหา) */
export async function subordinatesOf(userId: number): Promise<number[]> {
  const edges = (await db.prepare("SELECT id, manager_id FROM users").all()) as OrgEdge[];
  return subordinateIds(edges, userId);
}

/**
 * เงื่อนไขว่าใครเห็นคำขอฉบับไหนได้บ้าง — ใช้ร่วมกันทุกที่ที่ list
 *   ADMIN       เห็นทุกฉบับ
 *   ผู้ตรวจสอบ   เห็นทุกฉบับ (ดูอย่างเดียว — สิทธิ์กดอนุมัติ/แก้ไขไม่ได้มาจากตรงนี้)
 *   หัวหน้า      ของตัวเอง + สายอนุมัติ/สำเนา + ของลูกน้องทั้งสาย + ทั้งแผนกถ้าเป็น MANAGER
 *   USER        ของตัวเอง + ที่ตนอยู่ในสายอนุมัติ/สำเนา
 *
 * "ลูกน้องทั้งสาย" กับ "ทั้งแผนก" อยู่ด้วยกันได้ ไม่ต้องเลือกอย่างใดอย่างหนึ่ง —
 * บางองค์กรคุมด้วยแผนก บางที่คุมด้วยสายบังคับบัญชา และของจริงมักปนกันทั้งสองแบบ
 */
async function visibilityWhere(user: User): Promise<string> {
  if (user.role === "ADMIN" || user.can_audit === 1) return "";

  const parts = [
    "r.requester_id = @uid",
    "EXISTS (SELECT 1 FROM request_approvers a WHERE a.request_id = r.id AND a.user_id = @uid)",
  ];

  if (user.role === "MANAGER" && user.department_id !== null) {
    parts.push(
      "EXISTS (SELECT 1 FROM users ru WHERE ru.id = r.requester_id AND ru.department_id = @dept)",
    );
  }

  const under = await subordinatesOf(user.id);
  if (under.length > 0) parts.push(`r.requester_id IN (${under.join(",")})`);

  return `WHERE ${parts.join("\n      OR ")}`;
}

const scopeParams = (user: User) => ({ uid: user.id, dept: user.department_id });

/* ==================== คำขอ ==================== */

export async function getRequest(id: number): Promise<RequestWithMeta | null> {
  return ((await db.prepare(`${REQ_SELECT} WHERE r.id = ?`).get(id)) as RequestWithMeta) ?? null;
}

export async function listVisibleTo(user: User): Promise<RequestWithMeta[]> {
  return (await db
    .prepare(`${REQ_SELECT} ${await visibilityWhere(user)} ORDER BY r.id DESC`)
    .all(scopeParams(user))) as RequestWithMeta[];
}



/**
 * รายการคำขอแบบกรอง/ค้นหา/แบ่งหน้า — ทำที่ฐานข้อมูลทั้งหมด
 *
 * เดิมโหลดทุกฉบับที่มองเห็นได้ขึ้นมาแล้วค่อยกรองในหน่วยความจำ ซึ่งใช้ได้ตอนมีไม่กี่ร้อยใบ
 * แต่พอถึงหลักหมื่นจะกลายเป็นการอ่านทั้งตารางทุกครั้งที่มีคนเปิดหน้ารายการ
 */
export type RequestQuery = {
  tab?: "all" | "awaiting" | "mine" | "team" | "clearing";
  status?: string;
  templateId?: number;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

async function buildRequestQuery(user: User, f: RequestQuery) {
  const where: string[] = [];
  const params: Record<string, unknown> = { uid: user.id, dept: user.department_id };
  let join = "";

  if (f.tab === "awaiting") {
    // รวมงานของคนที่ฉันรับหน้าที่แทนอยู่ ไม่งั้นคนแทนจะไม่เห็นว่ามีอะไรรอตัวเองอยู่
    const actable = [user.id, ...(await actableUserIds(user.id))];
    join = `JOIN request_approvers a
              ON a.request_id = r.id AND a.stage = r.stage AND a.step_no = r.current_step`;
    where.push(
      "r.status = 'PENDING'",
      `a.user_id IN (${actable.join(",")})`,
      "a.status = 'PENDING'",
      "a.kind = 'APPROVE'",
    );
  } else if (f.tab === "mine") {
    where.push("r.requester_id = @uid");
  } else if (f.tab === "clearing") {
    // อนุมัติแล้วแต่ยังไม่ได้เคลียร์ใน OA — เรียงของที่เลยกำหนดขึ้นก่อน
    // ผูกกับสิทธิ์การมองเห็นชุดเดียวกับแท็บรวม ไม่ได้เปิดให้เห็นข้ามสิทธิ์
    const vis = (await visibilityWhere(user)).replace(/^\s*WHERE\s*/i, "");
    if (vis) where.push(`(${vis})`);
    where.push("r.clear_due_date <> ''", "r.oa_ref = ''", "r.status = 'APPROVED'");
  } else if (f.tab === "team") {
    // ทีมของฉัน = คนในแผนกเดียวกัน (ถ้าผูกแผนกไว้) + ลูกน้องทั้งสายบังคับบัญชา
    // เดิมใช้แผนกอย่างเดียว หัวหน้าที่คุมคนข้ามแผนกจึงกดแท็บนี้ไม่ได้เลย
    const team: string[] = [];
    if (user.department_id !== null) {
      team.push("EXISTS (SELECT 1 FROM users ru WHERE ru.id = r.requester_id AND ru.department_id = @dept)");
    }
    const under = await subordinatesOf(user.id);
    if (under.length > 0) team.push(`r.requester_id IN (${under.join(",")})`);
    if (team.length === 0) return null;
    where.push(`(${team.join(" OR ")})`);
  } else {
    // แท็บรวม — ผูกกับสิทธิ์การมองเห็นตามบทบาท
    const vis = (await visibilityWhere(user)).replace(/^\s*WHERE\s*/i, "");
    if (vis) where.push(`(${vis})`);
  }

  if (f.status) {
    where.push("r.status = @status");
    params.status = f.status;
  }
  if (f.templateId) {
    where.push("r.template_id = @tpl");
    params.tpl = f.templateId;
  }
  if (f.from) {
    where.push("sql_date(r.doc_date) >= sql_date(@from)");
    params.from = f.from;
  }
  if (f.to) {
    where.push("sql_date(r.doc_date) <= sql_date(@to)");
    params.to = f.to;
  }
  if (f.q?.trim()) {
    where.push(`(r.title LIKE @q OR r.doc_no LIKE @q OR u.name LIKE @q OR t.name LIKE @q)`);
    params.q = `%${f.q.trim()}%`;
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { join, clause, params };
}

export async function listRequests(
  user: User,
  f: RequestQuery = {},
): Promise<{ rows: RequestWithMeta[]; total: number }> {
  const built = await buildRequestQuery(user, f);
  if (!built) return { rows: [], total: 0 };
  const { join, clause, params } = built;

  const total = (
    (await db
      .prepare(
        `SELECT COUNT(*) AS n FROM requests r
           JOIN users u ON u.id = r.requester_id
           JOIN form_templates t ON t.id = r.template_id
           ${join} ${clause}`,
      )
      .get(params)) as { n: number }
  ).n;

  const order = f.tab === "awaiting" ? "r.submitted_at" : "r.id DESC";
  const rows = (await db
    .prepare(`${REQ_SELECT} ${join} ${clause} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: f.limit ?? 50, offset: f.offset ?? 0 })) as RequestWithMeta[];

  return { rows, total };
}

/**
 * แถวสำหรับมุมมองตาราง — เพิ่ม "ตอนนี้อยู่ขั้นไหน" กับ "รอใครอยู่"
 *
 * สองอย่างนี้ไม่ได้อยู่ในตาราง requests เพราะมันเป็นสภาพ ณ ขณะนั้นของสายอนุมัติ
 * ไม่ใช่คุณสมบัติของเอกสาร — ต้องไปดูที่แถวผู้อนุมัติของขั้นปัจจุบัน
 */
export type RequestTableRow = RequestWithMeta & {
  current_node: string;
  current_handlers: string[];
};

export async function listRequestsForTable(
  user: User,
  f: RequestQuery = {},
): Promise<{ rows: RequestTableRow[]; total: number }> {
  const { rows, total } = await listRequests(user, f);
  if (rows.length === 0) return { rows: [], total };

  /*
   * ดึงผู้อนุมัติของขั้นปัจจุบันทั้งหน้าในคำสั่งเดียว ไม่ใช่ทีละใบ
   * ตารางหน้าหนึ่งมีได้ถึง 100 แถว — ถามทีละแถวคือวิ่งข้ามเครือข่าย 100 รอบ
   */
  const ids = rows.map((r) => r.id);
  const pending = (await db
    .prepare(
      `SELECT a.request_id, a.node_name, u.name
         FROM request_approvers a
         JOIN requests r ON r.id = a.request_id
         JOIN users u    ON u.id = a.user_id
        WHERE a.request_id = ANY(?)
          AND a.status = 'PENDING' AND a.kind = 'APPROVE'
          AND a.stage = r.stage AND a.step_no = r.current_step
        ORDER BY a.id`,
    )
    .all<{ request_id: number; node_name: string; name: string }>(ids));

  const byRequest = new Map<number, { node: string; who: string[] }>();
  for (const p of pending) {
    const hit = byRequest.get(p.request_id) ?? { node: p.node_name, who: [] };
    hit.who.push(p.name);
    byRequest.set(p.request_id, hit);
  }

  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      current_node: byRequest.get(r.id)?.node ?? "",
      current_handlers: byRequest.get(r.id)?.who ?? [],
    })),
  };
}

/** คำขอที่ถึงคิวให้ user คนนี้อนุมัติตอนนี้ */
export async function listAwaitingMe(userId: number): Promise<RequestWithMeta[]> {
  const ids = [userId, ...(await actableUserIds(userId))];
  return (await db
    .prepare(
      `${REQ_SELECT}
        JOIN request_approvers a
          ON a.request_id = r.id AND a.stage = r.stage AND a.step_no = r.current_step
       WHERE r.status = 'PENDING' AND a.user_id IN (${ids.map(() => "?").join(",")})
         AND a.status = 'PENDING' AND a.kind = 'APPROVE'
       ORDER BY r.submitted_at`,
    )
    .all(...ids)) as RequestWithMeta[];
}

/** สำเนาถึงฉันที่ยังไม่ได้อ่าน */
export async function listUnreadCc(userId: number): Promise<RequestWithMeta[]> {
  return (await db
    .prepare(
      `${REQ_SELECT}
        JOIN request_approvers a ON a.request_id = r.id
       WHERE a.user_id = ? AND a.kind = 'CC' AND a.read_at IS NULL
       ORDER BY r.id DESC`,
    )
    .all(userId)) as RequestWithMeta[];
}

/**
 * คำขอของฉันที่ยังไม่จบ — ยังเดินอยู่ในสาย หรือถูกส่งกลับมาให้แก้ หรือยังเป็นร่าง
 *
 * เรียงตามความเร่ง: ของที่ต้องลงมือ (ส่งกลับ/ร่าง) มาก่อนของที่แค่รอคนอื่น
 * เพราะสองอย่างนี้ต้องการคนละอย่างจากเจ้าของ — อย่างหนึ่งรอเขา อีกอย่างเขารอคนอื่น
 */
/**
 * คำขอที่อนุมัติแล้วแต่ยังไม่ได้เคลียร์ใน OA
 *
 * เรียงตามวันครบกำหนด ของที่เลยกำหนดจึงลอยขึ้นบนสุดเอง — คนเปิดหน้านี้มาเพื่อตาม
 * ของที่ค้าง ไม่ได้มาไล่อ่านตามลำดับเวลาที่ยื่น
 */
export async function listPendingClearance(user: User, limit = 200): Promise<RequestWithMeta[]> {
  const vis = (await visibilityWhere(user)).replace(/^\s*WHERE\s*/i, "");
  return (await db
    .prepare(
      `${REQ_SELECT}
        WHERE ${vis ? `(${vis}) AND ` : ""}r.status = 'APPROVED'
          AND r.clear_due_date <> '' AND r.oa_ref = ''
        ORDER BY r.clear_due_date
        LIMIT @limit`,
    )
    .all({ ...scopeParams(user), limit })) as RequestWithMeta[];
}

/**
 * คำขอที่อนุมัติแล้วซึ่งเอามาอ้างอิงได้ (ใช้กับฟิลด์ชนิด REQUEST)
 *
 * เช่น ใบลดหนี้แต่ละงวดอ้างถึง Master approval ของ trade term ใบเดียว
 * ให้เลือกจากรายการแทนพิมพ์เลขเอง — พิมพ์เลขที่เอกสารเองผิดแล้วไม่มีอะไรฟ้อง
 * และการอ้างอิงที่ผิดจะตามรอยกลับไม่ได้เลย
 *
 * จำกัดตามสิทธิ์การมองเห็นเหมือนทุกที่ — อ้างถึงเอกสารที่ตัวเองไม่มีสิทธิ์เห็นไม่ได้
 */
export async function listReferenceable(user: User, limit = 200): Promise<RequestWithMeta[]> {
  const vis = (await visibilityWhere(user)).replace(/^\s*WHERE\s*/i, "");
  return (await db
    .prepare(
      `${REQ_SELECT}
        WHERE ${vis ? `(${vis}) AND ` : ""}r.status = 'APPROVED'
        ORDER BY r.id DESC
        LIMIT @limit`,
    )
    .all({ ...scopeParams(user), limit })) as RequestWithMeta[];
}

/**
 * คำขอที่อ้างอิงถึงใบนี้ (ทางกลับของฟิลด์ชนิด REQUEST)
 *
 * ทางไปคือเปิด CN แล้วกดลิงก์กลับไปหาใบหลัก ซึ่งทำได้อยู่แล้ว
 * แต่คำถามที่คนถามจริงคือทางกลับ — "ใบหลักนี้ออก CN ไปแล้วกี่งวด งวดไหนบ้าง"
 * ถ้าตอบไม่ได้ การอ้างอิงก็เป็นแค่ลิงก์ ไม่ใช่การตามรอย
 *
 * ค้นจากค่าที่เก็บใน data โดยดูจากนิยามฟิลด์ของแต่ละแม่แบบว่าช่องไหนเป็นชนิด REQUEST
 * เก็บเป็น id ไม่ใช่เลขที่เอกสาร การค้นจึงไม่พังเวลาเลขที่เปลี่ยนรูปแบบ
 */
export async function listReferencing(user: User, requestId: number): Promise<RequestWithMeta[]> {
  const vis = (await visibilityWhere(user)).replace(/^\s*WHERE\s*/i, "");
  return (await db
    .prepare(
      `${REQ_SELECT}
         JOIN form_fields f
           ON f.template_id = r.template_id AND f.type = 'REQUEST' AND f.active = 1
        WHERE ${vis ? `(${vis}) AND ` : ""}
              json_int(r.data, f.field_key) = @refId
        ORDER BY r.id DESC`,
    )
    .all({ ...scopeParams(user), refId: requestId })) as RequestWithMeta[];
}

/**
 * คนที่โอนคิวอนุมัติให้ได้ — ใช้ทำรายชื่อปุ่มบนการ์ด Lark
 *
 * ตัดคนที่โอนให้ไม่ได้ตามกฎออกตั้งแต่ตอนทำรายการ (ตัวเอง / ผู้จัดทำ / คนที่อยู่ในขั้นนี้แล้ว)
 * ไม่ใช่ปล่อยให้กดแล้วค่อยเด้งว่าไม่ได้ — บนการ์ดที่มีแต่ปุ่ม การกดผิดแล้วโดนปฏิเสธ
 * เสียเวลากว่าบนเว็บมาก เพราะต้องรอการ์ดตอบกลับทีละครั้ง
 */
export async function listTransferCandidates(
  requestId: number,
  actorId: number,
  limit = 8,
): Promise<{ rows: { id: number; name: string }[]; more: boolean }> {
  const req = await getRequest(requestId);
  if (!req) return { rows: [], more: false };

  const inStep = (await currentStepApprovers(requestId, req.stage, req.current_step)).map((r) => r.user_id);
  const skip = [...new Set([actorId, req.requester_id, ...inStep])];

  const all = (await db
    .prepare(
      `SELECT id, name FROM users
        WHERE active = 1 AND id NOT IN (${skip.map(() => "?").join(",")})
        ORDER BY name`,
    )
    .all(...skip)) as { id: number; name: string }[];

  return { rows: all.slice(0, limit), more: all.length > limit };
}

/**
 * สรุปการเบิกงวดของใบอนุมัติหลักใบหนึ่ง
 *
 * ไม่กรองตามสิทธิ์การมองเห็นโดยตั้งใจ — ยอดที่เบิกไปแล้วต้องเป็นยอดจริงเสมอ
 * ถ้ากรองตามคนดู คนที่มองไม่เห็นใบลูกบางใบจะเห็นวงเงินคงเหลือมากกว่าความจริง
 * แล้วยื่นเบิกทะลุวงเงินโดยที่ตัวเลขบนหน้าจอบอกว่ายังเหลือ
 *
 * excludeId ใช้ตอนตรวจใบที่กำลังยื่น เพื่อไม่ให้ยอดของตัวเองถูกนับสองรอบ
 */
export async function drawdownFor(masterId: number, excludeId = 0): Promise<Drawdown> {
  const master = (await db
    .prepare("SELECT id, template_id, amount, data FROM requests WHERE id = ?")
    .get(masterId)) as { id: number; template_id: number; amount: number | null; data: string } | undefined;
  if (!master) return drawdown(null, null, []);

  const pf = (await db
    .prepare(
      "SELECT field_key FROM form_fields WHERE template_id=? AND field_role='PERIODS' AND active=1",
    )
    .get(master.template_id)) as { field_key: string } | undefined;

  let periods: number | null = null;
  if (pf) {
    const raw = parseJson<Record<string, unknown>>(master.data, {})[pf.field_key];
    const n = Number(raw);
    periods = Number.isFinite(n) && n > 0 ? n : null;
  }

  // GROUP BY กันนับซ้ำ — แม่แบบหนึ่งใบมีช่องอ้างอิงได้หลายช่อง ถ้าชี้มาที่ใบเดียวกัน
  // ทั้งคู่ JOIN จะคืนคำขอใบเดิมมาสองแถว แล้วยอดเบิกจะบวมเป็นสองเท่า
  const children = (await db
    .prepare(
      `SELECT r.id, r.status, r.amount
         FROM requests r
         JOIN form_fields f
           ON f.template_id = r.template_id AND f.type = 'REQUEST' AND f.active = 1
        WHERE json_int(r.data, f.field_key) = @masterId
          AND r.id <> @excludeId
        GROUP BY r.id`,
    )
    .all({ masterId, excludeId })) as DrawChild[];

  return drawdown(master.amount, periods, children);
}

/**
 * ช่องที่จะยกมาแสดงย่อในรายการงาน แยกตามแม่แบบ
 *
 * ดึงทีเดียวสำหรับทุกแม่แบบที่อยู่ในรายการ ไม่ใช่ยิงทีละใบ — รายการหนึ่งหน้ามีคำขอ
 * หลายใบที่มาจากแม่แบบซ้ำ ๆ กัน ถ้ายิงตามจำนวนคำขอจะกลายเป็นสิบกว่าคิวรีต่อการโหลดหนึ่งครั้ง
 */
export async function previewFieldsFor(templateIds: number[], limit = 3): Promise<Map<number, Field[]>> {
  const ids = [...new Set(templateIds)].filter((n) => Number.isInteger(n) && n > 0);
  const out = new Map<number, Field[]>();
  if (ids.length === 0) return out;

  const rows = (await db
    .prepare(
      `SELECT * FROM form_fields
        WHERE template_id IN (${ids.map(() => "?").join(",")}) AND active = 1
        ORDER BY template_id, sort_order, id`,
    )
    .all(...ids)) as FormField[];

  for (const id of ids) {
    const fields = rows
      .filter((r) => r.template_id === id)
      .map((r) => ({ ...r, options: parseJson<string[]>(r.options, []), columns: [] }));
    out.set(id, pickPreviewFields(fields, limit));
  }
  return out;
}

/** จำนวนร่างของฉัน — ใช้บอกบนปุ่ม "กล่องแบบร่าง" ว่ามีของค้างอยู่กี่ใบ */
export async function countMyDrafts(userId: number): Promise<number> {
  return (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM requests WHERE requester_id = ? AND status = 'DRAFT'")
      .get(userId)) as { n: number }
  ).n;
}

export async function listMyOpenRequests(userId: number): Promise<RequestWithMeta[]> {
  return (await db
    .prepare(
      `${REQ_SELECT}
        WHERE r.requester_id = ?
          AND r.status IN ('DRAFT','RETURNED','PENDING','PRELIM_APPROVED')
        ORDER BY CASE r.status
                   WHEN 'RETURNED' THEN 0
                   WHEN 'DRAFT' THEN 1
                   ELSE 2
                 END,
                 r.updated_at DESC`,
    )
    .all(userId)) as RequestWithMeta[];
}

export async function canView(req: RequestWithMeta, user: User): Promise<boolean> {
  if (user.role === "ADMIN" || user.can_audit === 1) return true;
  if (req.requester_id === user.id) return true;
  if (
    user.role === "MANAGER" &&
    user.department_id !== null &&
    req.requester_department_id === user.department_id
  ) {
    return true;
  }
  // หัวหน้าเปิดเอกสารของลูกน้องได้ทุกใบ ไม่ต้องรอให้ใครส่งลิงก์ให้
  if ((await subordinatesOf(user.id)).includes(req.requester_id)) return true;
  // รวมคนที่รับหน้าที่แทนช่วงลาด้วย ไม่งั้นเปิดเอกสารไม่ได้ก็กดแทนไม่ได้จริง
  const ids = [user.id, ...(await actableUserIds(user.id))];
  return Boolean(
    (await db
      .prepare(
        `SELECT 1 FROM request_approvers
          WHERE request_id = ? AND user_id IN (${ids.map(() => "?").join(",")})`,
      )
      .get(req.id, ...ids)),
  );
}


/**
 * ตัวย่อของฟอร์มที่ใช้ในเลขที่เอกสาร
 *
 * ตั้งเองได้ที่หน้าตั้งค่าแม่แบบ ถ้าไม่ตั้งก็ย่อจาก code ให้ 4 ตัว
 * (MARKETING → MARK) พอให้คนอ่านเลขแล้วเดาออกว่าเป็นเอกสารประเภทไหน
 */
export function docPrefixOf(tpl: { code: string; doc_prefix?: string }): string {
  const own = (tpl.doc_prefix ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (own) return own;
  const fromCode = tpl.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4);
  return fromCode || "DOC";
}

/**
 * เลขที่เอกสารรูปแบบ AP-{ตัวย่อฟอร์ม}-{ปีเดือน}-{ลำดับ 4 หลัก}
 *
 * เช่น AP-MARK-202608-0007 — ออกแบบให้พิมพ์ลงช่องอ้างอิงใน OA แล้วคนอ่านรู้เรื่อง
 * ว่าเป็นเอกสารอะไร เดือนไหน (เลขเดิมเป็นตัวเลขล้วนจึงบอกอะไรไม่ได้เลย)
 *
 * ลำดับเดินแยกของใครของมันต่อฟอร์มต่อเดือน แบบเดียวกับเลขเอกสารที่ออกใน issue.ts
 * เอกสารเก่าที่เป็นเลขรูปแบบเดิมไม่ถูกแตะและไม่เข้ามาปนในการนับ เพราะขึ้นต้นคนละแบบ
 */
/**
 * ขอลำดับถัดไปของชุดเลขหนึ่ง — ปลอดภัยเมื่อหลายคนขอพร้อมกัน
 *
 * ทั้งหมดเป็นคำสั่งเดียว คนที่มาทีหลังจะรอแถวเดียวกันนี้แล้วได้เลขถัดไปเสมอ
 * ต่างจากการอ่านค่าสูงสุดมาบวกหนึ่งแล้วค่อยเขียน ซึ่งสองคนอ่านค่าเดิมได้พร้อมกัน
 *
 * floor คือเลขต่ำสุดที่ยอมรับได้ (ปกติคือเลขสูงสุดที่ใช้ไปแล้ว + 1) ใส่ไว้เพื่อให้
 * ตัวนับไล่ตามทันเอกสารที่เกิดนอกทางนี้ เช่น ข้อมูลที่นำเข้ามาหรือแถวที่แก้ด้วยมือ
 */
/**
 * แปลงสิ่งที่ระบบภายนอกส่งมาเป็น id ของคำขอ — รับได้ทั้ง id และเลขที่เอกสาร
 *
 * ต้องกันค่าที่เกินช่วงจำนวนเต็ม 4 ไบต์ด้วย เพราะเอกสารรุ่นเก่าใช้เลขล้วนอย่าง
 * 202609150002 ซึ่งดูเหมือน id ทุกประการ แต่ใหญ่เกินกว่าที่คอลัมน์ id รับได้
 * ถ้าปล่อยผ่านไปถาม Postgres ตรง ๆ จะได้ error ระดับ 500 แทนที่จะค้นเจอตามปกติ
 */
const INT4_MAX = 2147483647;

export async function resolveRequestId(idOrDocNo: string): Promise<number> {
  const n = Number(idOrDocNo);
  if (Number.isInteger(n) && n > 0 && n <= INT4_MAX) return n;

  const row = (await db.prepare("SELECT id FROM requests WHERE doc_no=?").get(idOrDocNo)) as
    | { id: number }
    | undefined;
  return row?.id ?? 0;
}

export async function nextSeq(scope: string, period: string, floor: number): Promise<number> {
  const row = (await db
    .prepare(
      `INSERT INTO doc_counters (scope, period, seq) VALUES (?,?,?)
       ON CONFLICT (scope, period)
       DO UPDATE SET seq = GREATEST(doc_counters.seq + 1, EXCLUDED.seq)
       RETURNING seq`,
    )
    .get(scope, period, Math.max(1, floor))) as { seq: number };
  return row.seq;
}

export async function nextDocNo(
  tpl: { code: string; doc_prefix?: string },
  date = new Date(),
): Promise<string> {
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const scope = `AP-${docPrefixOf(tpl)}`;
  const head = `${scope}-${period}-`;
  // นับจากตัวเลขท้ายจริงๆ ไม่ใช่เรียงตัวอักษร เผื่อวันหนึ่งลำดับยาวเกิน 4 หลัก
  const row = (await db
    .prepare(
      `SELECT MAX(CAST(substr(doc_no, ?) AS INTEGER)) AS n FROM requests WHERE doc_no LIKE ?`,
    )
    .get(head.length + 1, `${head}%`)) as { n: number | null };
  const seq = await nextSeq(scope, period, (row?.n ?? 0) + 1);
  return `${head}${String(seq).padStart(4, "0")}`;
}

/* ==================== ผู้อนุมัติ / สำเนา ==================== */

const APPROVER_SELECT = `
  SELECT a.*, u.name, u.position, u.email, u.avatar_url,
         fu.name AS from_user_name,
         ab.name AS acted_by_name,
         ab.avatar_url AS acted_by_avatar
    FROM request_approvers a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users fu ON fu.id = a.from_user
    LEFT JOIN users ab ON ab.id = a.acted_by
`;

export async function getApprovers(requestId: number): Promise<RequestApprover[]> {
  return (await db
    .prepare(
      `${APPROVER_SELECT}
        WHERE a.request_id = ?
        ORDER BY CASE a.stage WHEN 'PRELIM' THEN 0 ELSE 1 END, a.step_no, a.id`,
    )
    .all(requestId)) as RequestApprover[];
}

export async function getStageApprovers(requestId: number, stage: Stage): Promise<RequestApprover[]> {
  return (await db
    .prepare(`${APPROVER_SELECT} WHERE a.request_id = ? AND a.stage = ? ORDER BY a.step_no, a.id`)
    .all(requestId, stage)) as RequestApprover[];
}

/** ผู้อนุมัติทุกคนที่อยู่ในขั้นปัจจุบัน (ขั้นแบบขนานมีหลายคน) */
export async function currentStepApprovers(
  requestId: number,
  stage: Stage,
  step: number,
): Promise<RequestApprover[]> {
  return (await db
    .prepare(
      `${APPROVER_SELECT} WHERE a.request_id = ? AND a.stage = ? AND a.step_no = ? ORDER BY a.id`,
    )
    .all(requestId, stage, step)) as RequestApprover[];
}

/* ==================== ไฟล์แนบ / ความคิดเห็น / ประวัติ ==================== */

export async function getAttachments(requestId: number): Promise<Attachment[]> {
  return (await db
    .prepare(
      `SELECT f.*, u.name AS uploader_name
         FROM attachments f JOIN users u ON u.id = f.uploaded_by
        WHERE f.request_id = ? ORDER BY f.id`,
    )
    .all(requestId)) as Attachment[];
}

export async function getComments(requestId: number): Promise<Comment[]> {
  const rows = (await db
    .prepare(
      `SELECT c.*, u.name AS author_name
         FROM request_comments c JOIN users u ON u.id = c.user_id
        WHERE c.request_id = ? ORDER BY c.id`,
    )
    .all(requestId)) as Comment[];
  if (rows.length === 0) return [];

  // ดึงไฟล์ของทุกความคิดเห็นด้วยคำสั่งเดียว ไม่ใช่ทีละความคิดเห็น
  const files = (await db
    .prepare(
      `SELECT a.*, u.name AS uploader_name
         FROM attachments a JOIN users u ON u.id = a.uploaded_by
        WHERE a.comment_id = ANY(?) ORDER BY a.id`,
    )
    .all(rows.map((c) => c.id))) as Attachment[];

  const byComment = new Map<number, Attachment[]>();
  for (const f of files) {
    const list = byComment.get(f.comment_id as number);
    if (list) list.push(f);
    else byComment.set(f.comment_id as number, [f]);
  }
  return rows.map((c) => ({ ...c, files: byComment.get(c.id) ?? [] }));
}

export async function getAuditLog(requestId: number): Promise<AuditEntry[]> {
  return (await db
    .prepare(
      `SELECT l.*, u.name AS actor_name
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.request_id = ? ORDER BY l.id DESC`,
    )
    .all(requestId)) as AuditEntry[];
}

export async function logAudit(
  requestId: number,
  actorId: number | null,
  action: string,
  detail = "",
  amount: number | null = null,
) {
  await db.prepare(
    "INSERT INTO audit_log (request_id, actor_id, action, detail, amount) VALUES (?,?,?,?,?)",
  ).run(requestId, actorId, action, detail, amount);
}

/* ==================== แม่แบบฟอร์ม ==================== */

export async function listCategories(): Promise<FormCategory[]> {
  return (await db
    .prepare("SELECT * FROM form_categories ORDER BY sort_order, name")
    .all()) as FormCategory[];
}

export async function listTemplates(): Promise<TemplateWithCategory[]> {
  return (await db
    .prepare(
      `SELECT t.*, COALESCE(c.name, 'ไม่ระบุหมวด') AS category_name
         FROM form_templates t
         LEFT JOIN form_categories c ON c.id = t.category_id
        ORDER BY t.active DESC, c.sort_order, t.sort_order, t.name`,
    )
    .all()) as TemplateWithCategory[];
}

/** แม่แบบที่ยังใช้ไม่ได้จริง — ไม่มีฟิลด์ ไม่มีหัวเรื่อง หรือไม่มีขั้นอนุมัติ */
export async function templateReadiness(): Promise<Map<number, string[]>> {
  const rows = (await db
    .prepare(
      `SELECT t.id,
              (SELECT COUNT(*) FROM form_fields f WHERE f.template_id=t.id AND f.active=1) AS fields,
              (SELECT COUNT(*) FROM form_fields f WHERE f.template_id=t.id AND f.field_role='TITLE') AS titles,
              (SELECT COUNT(*) FROM flow_nodes n WHERE n.template_id=t.id AND n.active=1
                                              AND n.kind='APPROVE') AS steps,
              -- ขั้นอนุมัติจริงมีไหม — ฟอร์มที่มีแต่ขั้น "อนุมัติเบื้องต้น" จะเดินไปได้ครึ่งทาง
              -- แล้วค้างตลอดกาล เพราะไม่มีขั้นไหนให้ปิดจ๊อบ · เกิดขึ้นจริงมาแล้วกับฟอร์ม KAA
              -- และไม่มีอะไรฟ้องจนกระทั่งมีคนกดยื่นขออนุมัติจริงแล้วเจอ error
              (SELECT COUNT(*) FROM flow_nodes n WHERE n.template_id=t.id AND n.active=1
                                              AND n.kind='APPROVE' AND n.stage='FINAL') AS "finalSteps",
              -- ขั้นอนุมัติที่ยังไม่ได้ระบุว่าใครเป็นคนอนุมัติ
              -- ถ้าไม่ตรวจตรงนี้ ฟอร์มจะดูพร้อมใช้ แล้วไปพังเอาตอนผู้ใช้กดส่ง
              (SELECT COUNT(*) FROM flow_nodes n
                WHERE n.template_id=t.id AND n.active=1 AND n.kind='APPROVE'
                  AND NOT EXISTS (SELECT 1 FROM flow_node_members m WHERE m.node_id=n.id)
              ) AS "emptySteps"
         FROM form_templates t`,
    )
    .all()) as {
      id: number; fields: number; titles: number; steps: number; finalSteps: number;
      emptySteps: number;
    }[];

  const out = new Map<number, string[]>();
  for (const r of rows) {
    const problems: string[] = [];
    /* ไม่มีฟิลด์หัวเรื่องไม่ใช่ปัญหาอีกต่อไป — เอกสารมีเลขที่ ชื่อฟอร์ม ผู้จัดทำ และวันที่
       ซึ่งพอให้อ้างถึงกันได้อยู่แล้ว ฟอร์มอย่าง "Vat税金" ที่ทุกใบเป็นเรื่องเดียวกัน
       การบังคับให้มีช่องหัวเรื่องคือบังคับให้คนกรอกพิมพ์ข้อความซ้ำ ๆ ทิ้งไว้เฉย ๆ */
    if (r.fields === 0) problems.push("admin.forms.needFields");
    if (r.steps === 0) problems.push("admin.forms.needSteps");
    else if (r.finalSteps === 0) problems.push("admin.forms.needFinalStep");
    else if (r.emptySteps > 0) problems.push("admin.forms.needApprovers");
    if (problems.length) out.set(r.id, problems);
  }
  return out;
}

export async function listActiveTemplates(): Promise<TemplateWithCategory[]> {
  return (await listTemplates()).filter((t) => t.active);
}

/**
 * ฟอร์มที่ผู้ใช้คนนี้เพิ่งส่งไปล่าสุด — เอาไว้วางไว้บนสุดของหน้าแรก
 *
 * คนส่วนใหญ่วนอยู่กับฟอร์มไม่กี่ใบเป็นประจำ แต่ต้องกวาดตาหาในแคตตาล็อกทั้งหมดทุกครั้ง
 * เรียงตามคำขอล่าสุดของแต่ละฟอร์ม ไม่ใช่ตามจำนวนครั้ง — ของที่เพิ่งทำมักคือของที่จะทำอีก
 */
export async function listRecentTemplatesFor(userId: number, limit = 4): Promise<TemplateWithCategory[]> {
  const rows = (await db
    .prepare(
      `SELECT r.template_id AS id
         FROM requests r
         JOIN form_templates t ON t.id = r.template_id
        WHERE r.requester_id = ? AND t.active = 1
        GROUP BY r.template_id
        ORDER BY MAX(r.id) DESC
        LIMIT ?`,
    )
    .all(userId, limit)) as { id: number }[];

  const byId = new Map((await listActiveTemplates()).map((t) => [t.id, t]));
  return rows.map((r) => byId.get(r.id)).filter((t): t is TemplateWithCategory => Boolean(t));
}

export async function getTemplate(id: number): Promise<FormTemplate | null> {
  return ((await db.prepare("SELECT * FROM form_templates WHERE id = ?").get(id)) as FormTemplate) ?? null;
}

/** ฟิลด์ของแม่แบบ พร้อมคอลัมน์ของตารางและตัวเลือกที่แตก JSON แล้ว */
export async function getFields(templateId: number): Promise<Field[]> {
  const rows = (await db
    .prepare("SELECT * FROM form_fields WHERE template_id = ? ORDER BY sort_order, id")
    .all(templateId)) as FormField[];
  const cols = (await db
    .prepare(
      `SELECT c.* FROM form_table_columns c
         JOIN form_fields f ON f.id = c.field_id
        WHERE f.template_id = ? ORDER BY c.sort_order, c.id`,
    )
    .all(templateId)) as TableColumn[];

  return rows.map((f) => ({
    ...f,
    options: parseJson<string[]>(f.options, []),
    columns: cols
      .filter((c) => c.field_id === f.id)
      .map((c) => ({ ...c, options: parseJson<string[]>(c.options, []) })),
  }));
}

export async function getActiveFields(templateId: number): Promise<Field[]> {
  return (await getFields(templateId)).filter((f) => f.active);
}

/**
 * ช่องกรอกของหลายแม่แบบพร้อมกัน — 2 คำสั่งไม่ว่าจะกี่แม่แบบ
 *
 * ที่มา: หน้าตัวสร้างฟอร์มและ API รายการแม่แบบเคยวนเรียก getFields() ทีละใบ
 * ซึ่งกลายเป็นคำสั่ง 2 ครั้งต่อแม่แบบหนึ่งใบ — พอมี 200 ฟอร์มก็เป็น 400 ครั้งต่อการ
 * เปิดหนึ่งหน้า ตอนใช้ SQLite ไม่รู้สึกเพราะอ่านไฟล์ในเครื่อง แต่พอฐานข้อมูลอยู่คนละ
 * เครื่อง ทุกครั้งมีค่าเดินทาง และยังกิน connection จากสระที่มีจำกัดไปพร้อมกันด้วย
 */
export async function getFieldsByTemplate(templateIds: number[]): Promise<Map<number, Field[]>> {
  const out = new Map<number, Field[]>();
  if (templateIds.length === 0) return out;

  const rows = (await db
    .prepare("SELECT * FROM form_fields WHERE template_id = ANY(?) ORDER BY template_id, sort_order, id")
    .all(templateIds)) as FormField[];
  const cols = (await db
    .prepare(
      `SELECT c.*, f.template_id FROM form_table_columns c
         JOIN form_fields f ON f.id = c.field_id
        WHERE f.template_id = ANY(?) ORDER BY c.sort_order, c.id`,
    )
    .all(templateIds)) as (TableColumn & { template_id: number })[];

  // จัดคอลัมน์เข้ากลุ่มตามช่องก่อน เพื่อไม่ต้องไล่หาทั้งกองซ้ำทุกช่อง
  const colsByField = new Map<number, typeof cols>();
  for (const c of cols) {
    const list = colsByField.get(c.field_id) ?? [];
    list.push(c);
    colsByField.set(c.field_id, list);
  }

  for (const id of templateIds) out.set(id, []);
  for (const f of rows) {
    const list = out.get(f.template_id);
    if (!list) continue;
    list.push({
      ...f,
      options: parseJson<string[]>(f.options, []),
      columns: (colsByField.get(f.id) ?? []).map((c) => ({
        ...c,
        options: parseJson<string[]>(c.options, []),
      })),
    });
  }
  return out;
}

/** เหมือน getFieldsByTemplate แต่ตัดช่องที่ปิดใช้ออก */
export async function getActiveFieldsByTemplate(
  templateIds: number[],
): Promise<Map<number, Field[]>> {
  const all = await getFieldsByTemplate(templateIds);
  for (const [id, list] of all) all.set(id, list.filter((f) => f.active));
  return all;
}

export async function getFlowNodes(templateId: number): Promise<FlowNodeFull[]> {
  const nodes = (await db
    .prepare("SELECT * FROM flow_nodes WHERE template_id = ? ORDER BY sort_order, id")
    .all(templateId)) as FlowNode[];
  if (nodes.length === 0) return [];
  const members = (await db
    .prepare(
      `SELECT m.* FROM flow_node_members m
         JOIN flow_nodes n ON n.id = m.node_id
        WHERE n.template_id = ? ORDER BY m.id`,
    )
    .all(templateId)) as FlowNodeMember[];
  return nodes.map((n) => ({ ...n, members: members.filter((m) => m.node_id === n.id) }));
}

/** ตำแหน่งงานที่กติกาอ้างถึงแต่ยังไม่มีใครถือ — ใช้เตือนผู้ดูแล */
export async function flowRolesMissingHolders(): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT DISTINCT m.job_role
         FROM flow_node_members m
         JOIN flow_nodes n ON n.id = m.node_id
        WHERE m.source = 'JOB_ROLE' AND n.active = 1 AND m.job_role <> ''
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.active = 1 AND u.job_role = m.job_role)`,
    )
    .all()) as { job_role: string }[];
  return rows.map((r) => r.job_role);
}

/* ==================== ผู้ใช้ / แผนก ==================== */

export async function listActiveUsers(): Promise<User[]> {
  return (await db.prepare(`${USER_SELECT} WHERE u.active = 1 ORDER BY u.name`).all()) as User[];
}

/**
 * หา/สร้างผู้ใช้ในระบบจากคนใน Central Login directory
 *
 * ใช้ตอนตั้งผู้อนุมัติด้วยชื่อ Lark: คนที่เลือกอาจยังไม่เคยล็อกอินแอปนี้ จึงยังไม่มีแถวใน users
 * เราสร้างแถวไว้ล่วงหน้าโดยยึด "อีเมล" เป็นตัวเทียบ — พอเขาล็อกอินผ่านระบบกลางภายหลัง
 * provisionFromClaims จะจับคู่ด้วยอีเมลเดิมนี้ ไม่เกิดบัญชีซ้ำ
 *
 * รหัสผ่านตั้งเป็นค่าที่ verifyPassword ไม่มีทางผ่าน (ล็อกอินผ่านระบบกลางเท่านั้น)
 * การแจ้งเตือน Lark ใช้ resolveLarkIds แปลงอีเมล→open_id ให้เองตอนส่ง จึงไม่ต้องเก็บ id Lark ที่นี่
 */
export async function upsertDirectoryUser(person: { email: string; name: string }): Promise<User> {
  const email = person.email.trim().toLowerCase();
  const name = person.name.trim() || email;

  const existing = (await db.prepare(`${USER_SELECT} WHERE u.email = ?`).get(email)) as User | undefined;
  if (existing) {
    if (!existing.active) (await db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(existing.id));
    return (await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(existing.id)) as User;
  }

  const info = (await db
    .prepare(
      `INSERT INTO users (email, password, name, role, active, must_change_password)
       VALUES (?,?,?,?,1,0)`,
    )
    .run(email, `sso$${crypto.randomBytes(16).toString("hex")}`, name, "USER"));

  return (await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(Number(info.lastInsertRowid))) as User;
}

export async function getUser(id: number): Promise<User | null> {
  return ((await db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id)) as User) ?? null;
}


export async function listDepartments(): Promise<(Department & { members: number })[]> {
  return (await db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.active = 1)
                   AS members
         FROM departments d ORDER BY d.active DESC, d.name`,
    )
    .all()) as (Department & { members: number })[];
}

export async function listActiveDepartments(): Promise<Department[]> {
  return (await db
    .prepare("SELECT * FROM departments WHERE active = 1 ORDER BY name")
    .all()) as Department[];
}
