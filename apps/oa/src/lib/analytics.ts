import "server-only";
import { todayLocal } from "./format";
import { db } from "./db";

/**
 * วิเคราะห์ประสิทธิภาพการอนุมัติ
 *
 * คำถามที่หน้านี้ต้องตอบให้ได้คือ "ช้าตรงไหน" ไม่ใช่ "มีกี่ใบ"
 * ตัวเลขจึงเน้นที่เวลาต่อขั้นและตัวคน มากกว่าปริมาณรวม
 *
 * เวลาต่อขั้นวัดจาก notified_at → acted_at คือช่วงที่งานอยู่ในมือคนนั้นจริงๆ
 * ไม่ใช่ตั้งแต่ยื่นเอกสาร ไม่งั้นคนขั้นท้ายจะดูแย่เพราะแบกเวลาของขั้นก่อนหน้ามาด้วย
 */

export type Range = { from: string; to: string };

export function defaultRange(): Range {
  const to = new Date();
  const from = new Date(to.getTime() - 89 * 86400_000);
  return { from: todayLocal(from), to: todayLocal(to) };
}

const params = (r: Range) => ({ from: r.from, to: r.to });

/* ---------- ภาพรวม ---------- */

export type Overview = {
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  avgHours: number | null;
  medianHours: number | null;
};

export async function overview(r: Range): Promise<Overview> {
  const base = `FROM requests WHERE sql_date(submitted_at) BETWEEN sql_date(@from) AND sql_date(@to)`;

  const counts = (await db
    .prepare(
      `SELECT COUNT(*) AS submitted,
              SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN status IN ('PENDING','PRELIM_APPROVED') THEN 1 ELSE 0 END) AS pending
         ${base} AND submitted_at IS NOT NULL`,
    )
    .get(params(r))) as Overview;

  const done = (await db
    .prepare(
      `SELECT (julian(closed_at) - julian(submitted_at)) * 24 AS h
         ${base} AND closed_at IS NOT NULL AND submitted_at IS NOT NULL
        ORDER BY h`,
    )
    .all(params(r))) as { h: number }[];

  // ค่ากลางสำคัญกว่าค่าเฉลี่ย เพราะเอกสารที่ค้างนานผิดปกติไม่กี่ใบดึงค่าเฉลี่ยเพี้ยนได้ง่าย
  const median = done.length ? done[Math.floor(done.length / 2)].h : null;
  const avg = done.length ? done.reduce((s, x) => s + x.h, 0) / done.length : null;

  return {
    submitted: counts.submitted ?? 0,
    approved: counts.approved ?? 0,
    rejected: counts.rejected ?? 0,
    pending: counts.pending ?? 0,
    avgHours: avg,
    medianHours: median,
  };
}

/* ---------- คอขวด: ใครใช้เวลานานที่สุด ---------- */

export type PersonStat = {
  user_id: number;
  name: string;
  department: string;
  handled: number;
  avg_hours: number;
  max_hours: number;
  pending_now: number;
  oldest_pending_days: number | null;
};

export async function bottlenecks(r: Range, limit = 15): Promise<PersonStat[]> {
  return (await db
    .prepare(
      `SELECT u.id AS user_id, u.name, COALESCE(d.name,'') AS department,
              COUNT(*) AS handled,
              AVG((julian(a.acted_at) - julian(a.notified_at)) * 24) AS avg_hours,
              MAX((julian(a.acted_at) - julian(a.notified_at)) * 24) AS max_hours,
              (SELECT COUNT(*) FROM request_approvers p
                 JOIN requests pr ON pr.id = p.request_id
                WHERE p.user_id = u.id AND p.status='PENDING' AND p.kind='APPROVE'
                  AND pr.status='PENDING' AND pr.stage=p.stage AND pr.current_step=p.step_no
              ) AS pending_now,
              (SELECT MAX(julian_now() - julian(p.notified_at)) FROM request_approvers p
                 JOIN requests pr ON pr.id = p.request_id
                WHERE p.user_id = u.id AND p.status='PENDING' AND p.kind='APPROVE'
                  AND pr.status='PENDING' AND pr.stage=p.stage AND pr.current_step=p.step_no
              ) AS oldest_pending_days
         FROM request_approvers a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE a.kind = 'APPROVE'
          AND a.status IN ('APPROVED','REJECTED')
          AND a.notified_at IS NOT NULL AND a.acted_at IS NOT NULL
          AND sql_date(a.acted_at) BETWEEN sql_date(@from) AND sql_date(@to)
        -- Postgres ต้องระบุทุกคอลัมน์ที่ไม่ได้ผ่านฟังก์ชันรวมยอด ยกเว้นคอลัมน์ที่
        -- ขึ้นกับคีย์หลักที่จัดกลุ่มไว้แล้ว — d.name มาจากอีกตารางจึงต้องใส่เอง
        -- (SQLite ยอมให้ละไว้ แล้วหยิบค่าจากแถวใดแถวหนึ่งมาให้)
        GROUP BY u.id, d.name
        ORDER BY avg_hours DESC
        LIMIT @limit`,
    )
    .all({ ...params(r), limit })) as PersonStat[];
}

/* ---------- แยกตามประเภทเอกสาร ---------- */

export type TemplateStat = {
  template_id: number;
  name: string;
  icon: string;
  total: number;
  approved: number;
  rejected: number;
  avg_hours: number | null;
};

export async function byTemplate(r: Range): Promise<TemplateStat[]> {
  return (await db
    .prepare(
      `SELECT t.id AS template_id, t.name, t.icon,
              COUNT(*) AS total,
              SUM(CASE WHEN r.status='APPROVED' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN r.status='REJECTED' THEN 1 ELSE 0 END) AS rejected,
              AVG(CASE WHEN r.closed_at IS NOT NULL
                       THEN (julian(r.closed_at) - julian(r.submitted_at)) * 24 END) AS avg_hours
         FROM requests r
         JOIN form_templates t ON t.id = r.template_id
        WHERE r.submitted_at IS NOT NULL
          AND sql_date(r.submitted_at) BETWEEN sql_date(@from) AND sql_date(@to)
        GROUP BY t.id
        ORDER BY total DESC`,
    )
    .all(params(r))) as TemplateStat[];
}

/* ---------- อายุงานที่ค้างอยู่ตอนนี้ ---------- */

export type AgingBucket = { label: string; count: number };

export async function aging(): Promise<AgingBucket[]> {
  const rows = (await db
    .prepare(
      `SELECT julian_now() - julian(COALESCE(a.notified_at, r.submitted_at)) AS d
         FROM request_approvers a
         JOIN requests r ON r.id = a.request_id
        WHERE a.status='PENDING' AND a.kind='APPROVE' AND r.status='PENDING'
          AND r.stage = a.stage AND r.current_step = a.step_no`,
    )
    .all()) as { d: number | null }[];

  const buckets: AgingBucket[] = [
    { label: "0-1", count: 0 },
    { label: "2-3", count: 0 },
    { label: "4-7", count: 0 },
    { label: "8-14", count: 0 },
    { label: "15+", count: 0 },
  ];
  for (const { d } of rows) {
    const days = Math.floor(d ?? 0);
    const i = days <= 1 ? 0 : days <= 3 ? 1 : days <= 7 ? 2 : days <= 14 ? 3 : 4;
    buckets[i].count++;
  }
  return buckets;
}

/* ---------- ปริมาณรายสัปดาห์ ---------- */

export type WeekPoint = { week: string; submitted: number; closed: number };

export async function weekly(r: Range): Promise<WeekPoint[]> {
  return (await db
    .prepare(
      `SELECT to_char(sql_ts(submitted_at), 'IYYY-"W"IW') AS week,
              COUNT(*) AS submitted,
              SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END) AS closed
         FROM requests
        WHERE submitted_at IS NOT NULL
          AND sql_date(submitted_at) BETWEEN sql_date(@from) AND sql_date(@to)
        GROUP BY week ORDER BY week`,
    )
    .all(params(r))) as WeekPoint[];
}

/** แปลงชั่วโมงเป็นตัวเลข + หน่วย ให้หน้าจอไปแปลภาษาเอง */
export function humanHours(
  h: number | null | undefined,
): { n: string; unit: "min" | "hr" | "day" } | null {
  if (h === null || h === undefined || !Number.isFinite(h)) return null;
  if (h < 1) return { n: String(Math.round(h * 60)), unit: "min" };
  if (h < 48) return { n: h.toFixed(1), unit: "hr" };
  return { n: (h / 24).toFixed(1), unit: "day" };
}
