import "server-only";
import { db } from "../db";

/**
 * ตัวโหลด dashboard แบบกรองได้ — ใช้คอลัมน์ scalar (r_status/r_sday/r_dept/r_amount/r_cycle/r_node/r_files)
 * ที่ precompute ไว้ตอน sync → เร็ว ไม่ต้องแกะ JSONB 168MB ทุก query
 */

export type DashFilters = { from?: string; to?: string; form?: string; status?: string; dept?: string };

const STATUS_RE: Record<string, string> = { approved: "通过", pending: "审批中", rejected: "拒绝", cancelled: "撤回|删除" };
// r_sday = 'YYYYMMDD' (เดือน valid); for date math ต้องการ day valid ด้วย
const VALID_SDAY = `r_sday IS NOT NULL AND substr(r_sday,7,2) BETWEEN '01' AND '28'`;
const AGE = `(CURRENT_DATE - to_date(r_sday,'YYYYMMDD'))`;

function where(f: DashFilters): { sql: string; args: unknown[] } {
  const c: string[] = [];
  const a: unknown[] = [];
  if (f.form) { c.push("table_id = ?"); a.push(f.form); }
  if (f.dept) { c.push("r_dept = ?"); a.push(f.dept); }
  if (f.status && STATUS_RE[f.status]) { c.push("r_status ~ ?"); a.push(STATUS_RE[f.status]); }
  if (f.from) { c.push("r_sday >= ?"); a.push(f.from.replace(/-/g, "")); }
  if (f.to) { c.push("r_sday <= ?"); a.push(f.to.replace(/-/g, "")); }
  return { sql: c.length ? "WHERE " + c.join(" AND ") : "", args: a };
}
const and = (w: string, extra: string) => (w ? `${w} AND ${extra}` : `WHERE ${extra}`);
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> { try { return await fn(); } catch { return fallback; } }

export type DashData = {
  total: number; approved: number; pending: number; rejected: number; cancelled: number;
  withFiles: number; posted: number; cycleAvg: number | null; thisMonth: number;
  months: { ym: string; n: number }[];
  statuses: { status: string; n: number }[];
  forms: { form_code: string; name: string; n: number }[];
  depts: { dept: string; n: number }[];
  recent: { oa_key: string; serial: string; form: string; status: string; applicant: string; dept: string; date: string }[];
  aging: { bucket: string; n: number }[];
  sla: { name: string; avg: number | null; p90: number | null; pending: number; n: number }[];
  deptPerf: { dept: string; n: number; approved: number; rejected: number; avg: number | null }[];
  amountTotal: number; amountPending: number; amountByForm: { name: string; amount: number }[];
  bottleneck: { node: string; n: number; avgWait: number | null; p90: number | null; value: number }[];
};

export async function loadDash(f: DashFilters): Promise<DashData> {
  const w = where(f);
  const nameRows = await safe(() => db.prepare(`SELECT table_id, name FROM feishu_tables WHERE app_token='oa-export'`).all<{ table_id: string; name: string }>(), []);
  const nameMap = new Map(nameRows.map((r) => [r.table_id, r.name]));

  const agg = await safe(() => db.prepare(
    `SELECT COUNT(*)::int total,
       COUNT(*) FILTER (WHERE r_status ~ '通过')::int approved,
       COUNT(*) FILTER (WHERE r_status ~ '审批中')::int pending,
       COUNT(*) FILTER (WHERE r_status ~ '拒绝')::int rejected,
       COUNT(*) FILTER (WHERE r_status ~ '撤回|删除')::int cancelled,
       COUNT(*) FILTER (WHERE r_files > 0)::int with_files,
       COALESCE(SUM(r_amount),0)::numeric amt_total,
       COALESCE(SUM(r_amount) FILTER (WHERE r_status ~ '审批中'),0)::numeric amt_pending,
       ROUND(AVG(r_cycle)::numeric,1) cycle_avg
     FROM feishu_records ${w.sql}`,
  ).get<any>(...w.args), {});

  const months = await safe(() => db.prepare(
    `SELECT substr(r_sday,1,6) ym, COUNT(*)::int n FROM feishu_records ${and(w.sql, "r_sday IS NOT NULL")} GROUP BY ym ORDER BY ym`,
  ).all<{ ym: string; n: number }>(...w.args), []);

  const statuses = await safe(() => db.prepare(
    `SELECT COALESCE(NULLIF(r_status,''),'—') status, COUNT(*)::int n FROM feishu_records ${w.sql} GROUP BY status ORDER BY n DESC`,
  ).all<{ status: string; n: number }>(...w.args), []);

  const formsRaw = await safe(() => db.prepare(
    `SELECT table_id, COUNT(*)::int n FROM feishu_records ${w.sql} GROUP BY table_id ORDER BY n DESC`,
  ).all<{ table_id: string; n: number }>(...w.args), []);
  const forms = formsRaw.map((r) => ({ form_code: r.table_id, name: nameMap.get(r.table_id) ?? r.table_id, n: r.n }));

  const depts = await safe(() => db.prepare(
    `SELECT COALESCE(NULLIF(r_dept,''),'—') dept, COUNT(*)::int n FROM feishu_records ${w.sql} GROUP BY dept ORDER BY n DESC LIMIT 10`,
  ).all<{ dept: string; n: number }>(...w.args), []);

  const amtFormRaw = await safe(() => db.prepare(
    `SELECT table_id, COALESCE(SUM(r_amount),0)::numeric s FROM feishu_records ${w.sql} GROUP BY table_id ORDER BY s DESC NULLS LAST`,
  ).all<{ table_id: string; s: string }>(...w.args), []);
  const amountByForm = amtFormRaw.map((r) => ({ name: nameMap.get(r.table_id) ?? r.table_id, amount: Number(r.s ?? 0) })).filter((x) => x.amount > 0);

  const agingRaw = await safe(() => db.prepare(
    `SELECT CASE WHEN age<=1 THEN '0-1' WHEN age<=3 THEN '1-3' WHEN age<=7 THEN '4-7' ELSE '7+' END b, COUNT(*)::int n
       FROM (SELECT ${AGE} age FROM feishu_records ${and(w.sql, `r_status ~ '审批中' AND ${VALID_SDAY}`)}) q WHERE age>=0 GROUP BY b`,
  ).all<{ b: string; n: number }>(...w.args), []);
  const aging = ["0-1", "1-3", "4-7", "7+"].map((b) => ({ bucket: b, n: agingRaw.find((x) => x.b === b)?.n ?? 0 }));

  const slaRaw = await safe(() => db.prepare(
    `SELECT table_id, ROUND(AVG(r_cycle)::numeric,1) avg, ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY r_cycle))::numeric,1) p90, COUNT(*)::int n
       FROM feishu_records ${and(w.sql, "r_cycle IS NOT NULL")} GROUP BY table_id ORDER BY avg DESC NULLS LAST`,
  ).all<{ table_id: string; avg: string | null; p90: string | null; n: number }>(...w.args), []);
  const pendRaw = await safe(() => db.prepare(
    `SELECT table_id, COUNT(*)::int n FROM feishu_records ${and(w.sql, "r_status ~ '审批中'")} GROUP BY table_id`,
  ).all<{ table_id: string; n: number }>(...w.args), []);
  const pendMap = new Map(pendRaw.map((r) => [r.table_id, r.n]));
  const sla = slaRaw.map((r) => ({ name: nameMap.get(r.table_id) ?? r.table_id, avg: r.avg != null ? Number(r.avg) : null, p90: r.p90 != null ? Number(r.p90) : null, pending: pendMap.get(r.table_id) ?? 0, n: r.n }));

  const deptPerf = await safe(() => db.prepare(
    `SELECT COALESCE(NULLIF(r_dept,''),'—') dept, COUNT(*)::int n,
            COUNT(*) FILTER (WHERE r_status ~ '通过')::int approved,
            COUNT(*) FILTER (WHERE r_status ~ '拒绝|撤回|删除')::int rejected,
            ROUND(AVG(r_cycle)::numeric,1) avg
       FROM feishu_records ${w.sql} GROUP BY dept ORDER BY n DESC LIMIT 8`,
  ).all<{ dept: string; n: number; approved: number; rejected: number; avg: string | null }>(...w.args), [])
    .then((rows) => rows.map((r) => ({ dept: r.dept, n: r.n, approved: r.approved, rejected: r.rejected, avg: r.avg != null ? Number(r.avg) : null })));

  const bnRaw = await safe(() => db.prepare(
    `SELECT node, COUNT(*)::int n, ROUND(AVG(wait)::numeric,1) avg_wait,
            ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY wait))::numeric,1) p90, ROUND(SUM(amt)::numeric,0) value
       FROM (SELECT COALESCE(NULLIF(r_node,''),'—') node, CASE WHEN ${VALID_SDAY} THEN ${AGE} END wait, COALESCE(r_amount,0) amt
               FROM feishu_records ${and(w.sql, "r_status ~ '审批中'")}) q
      GROUP BY node ORDER BY n DESC LIMIT 8`,
  ).all<{ node: string; n: number; avg_wait: string | null; p90: string | null; value: string | null }>(...w.args), []);
  const bottleneck = bnRaw.map((r) => ({ node: r.node, n: r.n, avgWait: r.avg_wait != null ? Number(r.avg_wait) : null, p90: r.p90 != null ? Number(r.p90) : null, value: Number(r.value ?? 0) }));

  const recentRows = await safe(() => db.prepare(
    `SELECT record_id oa_key, fields->>'serial' serial, fields->>'form_name' form, r_status status, r_dept dept,
            fields->'fields'->>'发起人' applicant, r_sday sday, fields->'fields'->>'发起时间' sraw
       FROM feishu_records ${w.sql} ORDER BY modified_time DESC LIMIT 10`,
  ).all<any>(...w.args), []);
  const recent = recentRows.map((r) => ({
    oa_key: r.oa_key, serial: r.serial ?? "", form: r.form ?? "", status: r.status ?? "", applicant: r.applicant ?? "",
    dept: r.dept ?? "", date: String(r.sraw ?? "").slice(0, 10),
  }));

  const postedRow = await safe(() => db.prepare("SELECT COUNT(*)::int n FROM oa_accounting WHERE status='posted'").get<{ n: number }>(), { n: 0 });

  const thisYm = new Date().toISOString().slice(0, 7).replace("-", "");
  return {
    total: agg.total ?? 0, approved: agg.approved ?? 0, pending: agg.pending ?? 0, rejected: agg.rejected ?? 0, cancelled: agg.cancelled ?? 0,
    withFiles: agg.with_files ?? 0, posted: postedRow?.n ?? 0, cycleAvg: agg.cycle_avg != null ? Number(agg.cycle_avg) : null,
    thisMonth: months.find((m) => m.ym === thisYm)?.n ?? 0,
    months, statuses, forms, depts, recent, aging, sla, deptPerf, bottleneck,
    amountTotal: Number(agg.amt_total ?? 0), amountPending: Number(agg.amt_pending ?? 0), amountByForm,
  };
}

export async function filterOptions(): Promise<{ forms: { code: string; name: string }[]; depts: string[] }> {
  const forms = await safe(() => db.prepare(`SELECT table_id code, name FROM feishu_tables WHERE app_token='oa-export' ORDER BY record_count DESC`).all<{ code: string; name: string }>(), []);
  const depts = await safe(() => db.prepare(`SELECT DISTINCT r_dept d FROM feishu_records WHERE r_dept IS NOT NULL AND r_dept<>'' ORDER BY 1`).all<{ d: string }>(), []);
  return { forms, depts: depts.map((x) => x.d).filter(Boolean) };
}
