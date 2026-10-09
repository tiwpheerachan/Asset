import "server-only";
import { db } from "./db";
import { todayLocal } from "./format";
import { byTemplate, aging, type AgingBucket, type TemplateStat } from "./analytics";
import { listAwaitingMe } from "./queries";
import type { RequestWithMeta, User } from "./types";

/**
 * ชั้นรวมข้อมูลของหน้า Dashboard (OA Command Center)
 *
 * หลักการ:
 *  - คำนวณฝั่ง server ที่เดียว (ไม่ยิง DB จากแต่ละ component)
 *  - เคารพสิทธิ์การมองเห็นด้วย scope ใน SQL (ไม่ใช่แค่ซ่อน UI)
 *    ADMIN / ผู้ตรวจสอบ = เห็นทั้งหมด · MANAGER = แผนกตัวเอง + ของตน · USER = ของตน + ที่ตนอยู่ในสาย
 *  - reuse analytics.ts (byTemplate / aging) และ listAwaitingMe
 *  - amount บางใบ = 0 จึงแยก "ทั้งหมด" กับ "ใบที่มีมูลค่า" เสมอ
 */

export type Range = { from: string; to: string };

export function monthRange(d = new Date()): Range {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: todayLocal(from), to: todayLocal(to) };
}
function prevMonthRange(d = new Date()): Range {
  return monthRange(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

/** scope การมองเห็น — คืน SQL fragment (อ้าง r = requests) + params */
function scopeOf(user: User): { sql: string; params: Record<string, unknown>; canSeeAll: boolean; label: string } {
  const admin = user.role === "ADMIN" || (user as any).can_audit === 1 || (user as any).can_audit === true;
  if (admin) return { sql: "1=1", params: {}, canSeeAll: true, label: "ทั้งองค์กร" };
  if (user.role === "MANAGER") {
    return {
      sql: "(r.requester_id = @me OR ru.department_id = @dept OR EXISTS (SELECT 1 FROM request_approvers a WHERE a.request_id=r.id AND a.user_id=@me))",
      params: { me: user.id, dept: user.department_id ?? -1 },
      canSeeAll: false,
      label: "แผนกของฉัน",
    };
  }
  return {
    sql: "(r.requester_id = @me OR EXISTS (SELECT 1 FROM request_approvers a WHERE a.request_id=r.id AND a.user_id=@me))",
    params: { me: user.id },
    canSeeAll: false,
    label: "ของฉัน",
  };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export type Kpi = { value: number; prev: number | null };
export type FunnelStage = { key: string; label: string; count: number };
export type Delta = number | null;

export interface DashboardData {
  role: string;
  scopeLabel: string;
  canSeeAll: boolean;
  range: Range;
  attention: {
    waitingMe: number;
    nearSla: number;
    overdueSla: number;
    returned: number;
    pendingClear: number;
    overdueClear: number;
  };
  kpi: {
    totalRequests: Kpi;
    approvedValue: Kpi;
    pendingValue: number;
    approvalRate: number | null;
    avgCycleHours: number | null;
    overdueSla: number;
  };
  funnel: FunnelStage[];
  formDist: (TemplateStat & { pct: number })[];
  valueByDept: { dept: string; value: number }[];
  monthlyValue: { month: string; total: number; approved: number }[];
  sla: { within: number; atRisk: number; overdue: number; total: number };
  aging: AgingBucket[];
  dailyTrend: { day: string; count: number; value: number }[];
  queue: QueueItem[];
  recent: RecentItem[];
  dataWarnings: string[];
}

export interface QueueItem {
  id: number;
  docNo: string;
  title: string;
  template: string;
  requester: string;
  department: string;
  amount: number;
  submittedAt: string;
  waitingHours: number | null;
  currentStep: string;
  urgent: boolean;
  slaDays: number | null;
  priority: "overdue" | "urgent" | "near" | "old" | "normal";
}

export interface RecentItem {
  id: number;
  docNo: string;
  title: string;
  template: string;
  amount: number;
  status: string;
  updatedAt: string;
}

/* ====================== ตัวโหลดหลัก ====================== */

export async function loadDashboard(user: User, range?: Range): Promise<DashboardData> {
  const r = range ?? monthRange();
  const prev = prevMonthRange();
  const s = scopeOf(user);
  const p = { ...s.params, from: r.from, to: r.to };
  const pPrev = { ...s.params, from: prev.from, to: prev.to };
  const W = `WHERE ${s.sql}`;
  const join = "LEFT JOIN users ru ON ru.id = r.requester_id LEFT JOIN departments rd ON rd.id = ru.department_id";
  const warnings: string[] = [];

  /* ---- KPI: นับ + มูลค่า ช่วงนี้ vs เดือนก่อน ---- */
  const kpiRow = async (pp: Record<string, unknown>) =>
    (await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN r.status='APPROVED' THEN COALESCE(r.amount,0) ELSE 0 END) AS approved_val,
                SUM(CASE WHEN r.status IN ('PENDING','PRELIM_APPROVED') THEN COALESCE(r.amount,0) ELSE 0 END) AS pending_val,
                SUM(CASE WHEN r.status='APPROVED' THEN 1 ELSE 0 END) AS approved_n,
                SUM(CASE WHEN r.status='REJECTED' THEN 1 ELSE 0 END) AS rejected_n,
                SUM(CASE WHEN r.amount IS NULL OR r.amount=0 THEN 1 ELSE 0 END) AS no_amount
           FROM requests r ${join}
          ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)`,
      )
      .get(pp)) as any;
  const cur = await kpiRow(p);
  const pre = await kpiRow(pPrev);

  /* ---- Cycle time (ส่ง→ปิด) ช่วงนี้ ---- */
  const cyc = (await db
    .prepare(
      `SELECT AVG((julian(r.closed_at) - julian(r.submitted_at)) * 24) AS h
         FROM requests r ${join}
        ${W} AND r.closed_at IS NOT NULL AND r.submitted_at IS NOT NULL
          AND sql_date(r.closed_at) BETWEEN sql_date(@from) AND sql_date(@to)`,
    )
    .get(p)) as any;

  /* ---- SLA health บนใบที่ยัง PENDING (อายุ vs lead_days ของฟอร์ม) ---- */
  const pend = (await db
    .prepare(
      `SELECT (julian_now() - julian(r.submitted_at)) AS age_days,
              t.lead_days AS lead_days, t.lead_urgent_days AS lead_urgent, r.urgent_reason AS urgent
         FROM requests r ${join}
         JOIN form_templates t ON t.id = r.template_id
        ${W} AND r.status='PENDING' AND r.submitted_at IS NOT NULL`,
    )
    .all(p)) as any[];
  let within = 0, atRisk = 0, overdue = 0;
  for (const x of pend) {
    const lead = num(x.urgent && x.urgent !== "" ? x.lead_urgent || x.lead_days : x.lead_days);
    const age = num(x.age_days);
    if (lead <= 0) { within++; continue; } // ฟอร์มไม่ได้ตั้ง SLA
    if (age > lead) overdue++;
    else if (age >= lead * 0.8) atRisk++;
    else within++;
  }

  /* ---- Attention center ---- */
  const myQueue = await listAwaitingMe(user.id);
  const returnedRow = (await db
    .prepare(`SELECT COUNT(*) AS n FROM requests r ${join} ${W} AND r.status='RETURNED'`)
    .get(s.params)) as any;
  const clearRow = (await db
    .prepare(
      `SELECT
          COUNT(*) FILTER (WHERE COALESCE(r.clear_due_date,'')<>'' AND COALESCE(r.oa_ref,'')='') AS pending_clear,
          COUNT(*) FILTER (WHERE COALESCE(r.clear_due_date,'')<>'' AND COALESCE(r.oa_ref,'')='' AND r.clear_due_date < @today) AS overdue_clear
         FROM requests r ${join} ${W} AND r.status='APPROVED'`,
    )
    .get({ ...s.params, today: todayLocal() })) as any;

  // SLA บนคิวของฉันเอง (สำหรับ action card)
  let myNear = 0, myOver = 0;
  for (const q of myQueue) {
    const t = (q as any).template_lead_days ?? 0;
    const sub = (q as any).submitted_at;
    if (!sub || !t) continue;
    const age = (Date.now() - new Date(sub).getTime()) / 86400_000;
    if (age > t) myOver++; else if (age >= t * 0.8) myNear++;
  }

  /* ---- Funnel ---- */
  const funnelRow = (await db
    .prepare(
      `SELECT
         SUM(CASE WHEN r.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN r.submitted_at IS NOT NULL AND r.status IN ('PENDING','PRELIM_APPROVED','APPROVED') THEN 1 ELSE 0 END) AS in_flow,
         SUM(CASE WHEN r.status='APPROVED' THEN 1 ELSE 0 END) AS approved
       FROM requests r ${join}
      ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)`,
    )
    .get(p)) as any;
  const extRow = (await db
    .prepare(
      `SELECT COUNT(DISTINCT r.id) FILTER (WHERE es.state IN ('RECORDED','PAID')) AS external,
              COUNT(DISTINCT r.id) FILTER (WHERE es.state='PAID') AS paid
         FROM requests r ${join}
         JOIN external_status es ON es.request_id = r.id
        ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)`,
    )
    .get(p)) as any;
  const funnel: FunnelStage[] = [
    { key: "submitted", label: "ส่งคำขอ", count: num(funnelRow?.submitted) },
    { key: "in_flow", label: "เข้าสู่การอนุมัติ", count: num(funnelRow?.in_flow) },
    { key: "approved", label: "อนุมัติแล้ว", count: num(funnelRow?.approved) },
    { key: "external", label: "ส่งบัญชี/ดำเนินการ", count: num(extRow?.external) },
    { key: "paid", label: "เสร็จสิ้น", count: num(extRow?.paid) },
  ];

  /* ---- Form distribution (scope ตาม query ของเราเอง) ---- */
  const formRows = (await db
    .prepare(
      `SELECT t.id AS template_id, t.name, t.icon, COUNT(*) AS total
         FROM requests r ${join}
         JOIN form_templates t ON t.id = r.template_id
        ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)
        GROUP BY t.id, t.name, t.icon ORDER BY total DESC`,
    )
    .all(p)) as any[];
  const formTotal = formRows.reduce((s2, x) => s2 + num(x.total), 0) || 1;
  const formDist = formRows.map((x) => ({ ...x, total: num(x.total), approved: 0, rejected: 0, avg_hours: null, pct: Math.round((num(x.total) / formTotal) * 100) })) as any;

  /* ---- Value by department ---- */
  const deptRows = (await db
    .prepare(
      `SELECT COALESCE(rd.name,'(ไม่ระบุ)') AS dept, SUM(COALESCE(r.amount,0)) AS value
         FROM requests r ${join}
        ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)
        GROUP BY rd.name HAVING SUM(COALESCE(r.amount,0)) > 0 ORDER BY value DESC LIMIT 8`,
    )
    .all(p)) as any[];

  /* ---- Monthly value trend (12 เดือนย้อนหลัง) ---- */
  const monthRows = (await db
    .prepare(
      `SELECT to_char(sql_ts(r.created_at),'YYYY-MM') AS month,
              SUM(COALESCE(r.amount,0)) AS total,
              SUM(CASE WHEN r.status='APPROVED' THEN COALESCE(r.amount,0) ELSE 0 END) AS approved
         FROM requests r ${join}
        ${W} AND sql_ts(r.created_at) >= (now() - interval '12 months')
        GROUP BY month ORDER BY month`,
    )
    .all(s.params)) as any[];

  /* ---- Daily trend (ช่วงที่เลือก) ---- */
  const dailyRows = (await db
    .prepare(
      `SELECT to_char(sql_ts(r.created_at),'YYYY-MM-DD') AS day,
              COUNT(*) AS count, SUM(COALESCE(r.amount,0)) AS value
         FROM requests r ${join}
        ${W} AND sql_date(r.created_at) BETWEEN sql_date(@from) AND sql_date(@to)
        GROUP BY day ORDER BY day`,
    )
    .all(p)) as any[];

  /* ---- Aging (reuse) + bottleneck ไว้เฟสถัดไป ---- */
  const agingBuckets = await aging();

  /* ---- Queue (จาก listAwaitingMe + จัดลำดับ) ---- */
  const queue: QueueItem[] = myQueue.slice(0, 20).map((q: any) => {
    const sub = q.submitted_at as string | null;
    const waitingHours = sub ? (Date.now() - new Date(sub).getTime()) / 3600_000 : null;
    const lead = num(q.template_lead_days ?? 0);
    const ageDays = waitingHours != null ? waitingHours / 24 : 0;
    const urgent = !!(q.urgent_reason && q.urgent_reason !== "");
    let priority: QueueItem["priority"] = "normal";
    if (lead > 0 && ageDays > lead) priority = "overdue";
    else if (urgent) priority = "urgent";
    else if (lead > 0 && ageDays >= lead * 0.8) priority = "near";
    else if (ageDays >= 2) priority = "old";
    return {
      id: q.id, docNo: q.doc_no, title: q.title || "(ไม่มีหัวข้อ)", template: q.template_name,
      requester: q.requester_name, department: q.requester_department || "", amount: num(q.amount),
      submittedAt: sub || "", waitingHours, currentStep: q.current_step ? `ขั้น ${q.current_step}` : "",
      urgent, slaDays: lead || null, priority,
    };
  });
  const order: Record<QueueItem["priority"], number> = { overdue: 0, urgent: 1, near: 2, old: 3, normal: 4 };
  queue.sort((a, b) => order[a.priority] - order[b.priority] || (b.waitingHours ?? 0) - (a.waitingHours ?? 0));

  /* ---- Recent requests (scope) ---- */
  const recentRows = (await db
    .prepare(
      `SELECT r.id, r.doc_no, r.title, t.name AS template, COALESCE(r.amount,0) AS amount, r.status, r.updated_at
         FROM requests r ${join}
         JOIN form_templates t ON t.id = r.template_id
        ${W}
        ORDER BY r.updated_at DESC LIMIT 10`,
    )
    .all(s.params)) as any[];

  if (num(cur?.no_amount) > 0) warnings.push(`มี ${num(cur.no_amount)} คำขอที่ยังไม่มีมูลค่า (ไม่นับรวมในกราฟมูลค่า)`);
  if (num(pre?.total) === 0) warnings.push("เดือนก่อนไม่มีข้อมูล จึงไม่เทียบ % การเปลี่ยนแปลง");

  const approvalRate = num(cur?.approved_n) + num(cur?.rejected_n) > 0
    ? Math.round((num(cur.approved_n) / (num(cur.approved_n) + num(cur.rejected_n))) * 100)
    : null;

  return {
    role: user.role,
    scopeLabel: s.label,
    canSeeAll: s.canSeeAll,
    range: r,
    attention: {
      waitingMe: myQueue.length,
      nearSla: myNear,
      overdueSla: myOver,
      returned: num(returnedRow?.n),
      pendingClear: num(clearRow?.pending_clear),
      overdueClear: num(clearRow?.overdue_clear),
    },
    kpi: {
      totalRequests: { value: num(cur?.total), prev: num(pre?.total) || null },
      approvedValue: { value: num(cur?.approved_val), prev: num(pre?.approved_val) || null },
      pendingValue: num(cur?.pending_val),
      approvalRate,
      avgCycleHours: cyc?.h != null ? num(cyc.h) : null,
      overdueSla: overdue,
    },
    funnel,
    formDist,
    valueByDept: deptRows.map((x) => ({ dept: x.dept, value: num(x.value) })),
    monthlyValue: monthRows.map((x) => ({ month: x.month, total: num(x.total), approved: num(x.approved) })),
    sla: { within, atRisk, overdue, total: within + atRisk + overdue },
    aging: agingBuckets,
    dailyTrend: dailyRows.map((x) => ({ day: x.day, count: num(x.count), value: num(x.value) })),
    queue,
    recent: recentRows.map((x) => ({ id: x.id, docNo: x.doc_no, title: x.title || "(ไม่มีหัวข้อ)", template: x.template, amount: num(x.amount), status: x.status, updatedAt: x.updated_at })),
    dataWarnings: warnings,
  };
}
