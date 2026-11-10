import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDash, filterOptions, type DashFilters } from "@/lib/oa-export/dash";
import { fmtBaht } from "@/lib/oa-export/amount";
import { getLocale } from "@/lib/i18n/server";
import { oaStatus, statusColor, DASH } from "@/lib/oa-export/labels";
import type { Locale } from "@/lib/i18n/locales";
import FilterBar from "./FilterBar";

export const dynamic = "force-dynamic";

const TH_M = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const beYm = (ym: string) => `${TH_M[Number(ym.slice(4, 6))] ?? ""} ${String(Number(ym.slice(0, 4)) + 543).slice(2)}`;
const nf = (n: number) => n.toLocaleString("th-TH");
const sMeta = (s: string, locale: Locale) => {
  const k = /通过/.test(s) ? "approved" : /审批中/.test(s) ? "pending" : /撤回/.test(s) ? "cancelled" : /拒绝/.test(s) ? "rejected" : /删除/.test(s) ? "cancelled" : "";
  return { t: oaStatus(s, locale), c: statusColor(s), k };
};

const Bento = ({ children, className = "", title, eyebrow, right }: { children: React.ReactNode; className?: string; title?: string; eyebrow?: string; right?: React.ReactNode }) => (
  <section className={`rounded-[22px] border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)] ${className}`}>
    {title && (
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>{eyebrow && <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{eyebrow}</div>}<h2 className="text-[15px] font-bold text-gray-800">{title}</h2></div>
        {right}
      </div>
    )}
    {children}
  </section>
);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashFilters> }) {
  const user = await requireUser();
  const locale = await getLocale();
  const D = (k: keyof typeof DASH, vars?: Record<string, string | number>) => {
    let s = DASH[k]?.[locale] ?? String(k);
    if (vars) for (const [vk, vv] of Object.entries(vars)) s = s.replace(`{${vk}}`, String(vv));
    return s;
  };
  const shortName = user.name.replace(/\s*\(.*\)\s*$/, "").trim() || user.name;
  const f = await searchParams;
  const [d, opt] = await Promise.all([loadDash(f), filterOptions()]);

  const maxM = Math.max(1, ...d.months.map((m) => m.n));
  const totalStatus = d.statuses.reduce((a, b) => a + b.n, 0) || 1;
  const maxForm = Math.max(1, ...d.forms.map((x) => x.n));
  const maxSpend = Math.max(1, ...d.amountByForm.map((x) => x.amount));
  const spendTotal = d.amountByForm.reduce((a, b) => a + b.amount, 0) || 1;
  const approvalRate = d.approved + d.rejected > 0 ? Math.round((d.approved / (d.approved + d.rejected)) * 1000) / 10 : null;
  const notPosted = Math.max(0, d.approved - d.posted);

  // radial ring
  const R = 26, C = 2 * Math.PI * R, rate = approvalRate ?? 0;

  const attention = [
    { n: d.pending, label: D("naPending"), sub: D("naPendingSub", { v: fmtBaht(d.amountPending) }), c: "#3b82f6", href: "/admin/oa-documents?status=pending" },
    { n: d.rejected + d.cancelled, label: D("naReject"), sub: D("naRejectSub", { n: Math.round(((d.rejected + d.cancelled) / totalStatus) * 100) }), c: "#f43f5e", href: "/admin/oa-documents?status=rejcan" },
    { n: notPosted, label: D("naNotPosted"), sub: D("naNotPostedSub"), c: "#7c3aed", href: "/admin/accounting" },
    { n: d.withFiles, label: D("naFiles"), sub: D("naFilesSub"), c: "#0ea5e9", href: "/admin/oa-documents?files=1" },
  ];

  const maxAge = Math.max(1, ...d.aging.map((a) => a.n));
  const ageMeta: Record<string, { t: string; c: string }> = { "0-1": { t: D("age01"), c: "#3b82f6" }, "1-3": { t: D("age13"), c: "#60a5fa" }, "4-7": { t: D("age47"), c: "#f59e0b" }, "7+": { t: D("age7"), c: "#f43f5e" } };

  return (
    <div className="min-h-full" style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 md:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-500">{D("eyebrow")}</div>
          <h1 className="text-[26px] font-bold tracking-tight text-gray-900">{D("title")}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-[13px] text-gray-500">{D("greeting", { name: shortName })}
            <span className="inline-flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{D("syncOk")}</span>
          </p>
        </div>
        <Link href="/" className="rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-700">{D("newRequest")}</Link>
      </div>

      <FilterBar opt={opt} />

      {/* KPI — 5 (กดเพื่อเจาะดูเอกสาร) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Link href="/admin/oa-documents" className="group block"><Bento className="!p-4 h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md"><div className="text-[12px] font-medium text-gray-500">{D("kpiTotal")}</div><div className="mt-1 text-[32px] font-bold leading-none tabular-nums text-gray-900">{nf(d.total)}</div><div className="mt-1.5 text-[11px] text-gray-400">{D("kpiFormsMonth", { forms: d.forms.length, month: nf(d.thisMonth) })} <span className="opacity-0 transition group-hover:opacity-100">→</span></div></Bento></Link>

        <Link href="/admin/oa-documents" className="group block"><Bento className="!p-4 h-full !bg-gradient-to-br !from-indigo-50/60 !to-white transition group-hover:-translate-y-0.5 group-hover:shadow-md"><div className="text-[12px] font-medium text-gray-500">{D("kpiValue")}</div><div className="mt-1 text-[32px] font-bold leading-none tabular-nums text-indigo-700">{fmtBaht(d.amountTotal)}</div><div className="mt-1.5 text-[11px] text-gray-400">{D("kpiValueSub")}</div></Bento></Link>

        <Link href="/admin/oa-documents?status=approved" className="group block"><Bento className="!p-4 h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md">
          <div className="flex items-center justify-between">
            <div><div className="text-[12px] font-medium text-gray-500">{D("kpiRate")}</div><div className="mt-1 text-[32px] font-bold leading-none tabular-nums text-emerald-600">{approvalRate != null ? approvalRate : "—"}<span className="text-base">%</span></div><div className="mt-1.5 text-[11px] text-gray-400">{D("kpiApproved", { n: nf(d.approved) })}</div></div>
            <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0"><circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="7" /><circle cx="32" cy="32" r={R} fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - rate / 100)} transform="rotate(-90 32 32)" /></svg>
          </div>
        </Bento></Link>

        <Link href="/admin/oa-documents?status=pending" className="group block"><Bento className="!p-4 h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md"><div className="text-[12px] font-medium text-gray-500">{D("kpiPending")}</div><div className="mt-1 text-[32px] font-bold leading-none tabular-nums text-blue-600">{nf(d.pending)}</div><div className="mt-1.5 text-[11px] text-gray-400">{D("kpiInProgress", { n: Math.round((d.pending / totalStatus) * 100) })} <span className="opacity-0 transition group-hover:opacity-100">→</span></div></Bento></Link>

        <Link href="/admin/oa-documents?status=approved" className="group block"><Bento className="!p-4 h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md"><div className="text-[12px] font-medium text-gray-500">{D("kpiCycle")}</div><div className="mt-1 text-[32px] font-bold leading-none tabular-nums text-violet-600">{d.cycleAvg != null ? d.cycleAvg : "—"}<span className="text-base"> {D("days")}</span></div><div className="mt-1.5 text-[11px] text-gray-400">{D("submitToDone")}</div></Bento></Link>
      </div>

      {/* Need attention */}
      <Bento title={D("needAttention")} eyebrow="Need Attention">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {attention.map((a) => (
            <Link key={a.label} href={a.href} className="group rounded-2xl bg-gray-50 p-3.5 transition hover:bg-gray-100">
              <div className="flex items-baseline gap-2"><span className="h-2 w-2 rounded-full" style={{ background: a.c }} /><span className="text-[26px] font-bold tabular-nums text-gray-900">{nf(a.n)}</span></div>
              <div className="mt-0.5 text-[13px] font-medium text-gray-700">{a.label}</div>
              <div className="text-[11px] text-gray-400">{a.sub} <span className="opacity-0 transition group-hover:opacity-100">→</span></div>
            </Link>
          ))}
        </div>
      </Bento>

      {/* Trend (8) + Status (4) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Bento className="lg:col-span-8" title={D("secTrend")} eyebrow="Trend" right={<span className="text-[11px] text-gray-400">{d.months[0] ? beYm(d.months[0].ym) : ""} – {d.months.length ? beYm(d.months[d.months.length - 1].ym) : ""}</span>}>
          {d.months.length === 0 ? <Empty text={D("emptyRange")} /> : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[640px] items-end gap-1 rounded-2xl bg-gray-50/60 p-3" style={{ height: 200 }}>
                {d.months.map((m) => (
                  <Link key={m.ym} href={`/admin/oa-documents?from=${m.ym}01&to=${m.ym}31`} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <div className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-lg border border-gray-200 bg-white/95 px-2 py-1 text-[10px] tabular-nums text-gray-700 shadow backdrop-blur-md opacity-0 group-hover:opacity-100">{beYm(m.ym)} · {nf(m.n)}</div>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 via-blue-500 to-cyan-400 transition group-hover:brightness-110" style={{ height: `${Math.round((m.n / maxM) * 160)}px` }} />
                    <span className="text-[8px] text-gray-400">{m.ym.slice(4, 6)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Bento>

        <Bento className="lg:col-span-4" title={D("secStatus")} eyebrow="Status">
          {d.statuses.length === 0 ? <Empty text={D("emptyRange")} /> : (
            <div className="space-y-2.5">
              {d.statuses.map((s) => { const m = sMeta(s.status, locale); const pct = Math.round((s.n / totalStatus) * 100); return (
                <Link key={s.status} href={m.k ? `/admin/oa-documents?status=${m.k}` : "/admin/oa-documents"} className="group block text-sm">
                  <div className="mb-1 flex justify-between"><span className="text-gray-600 group-hover:text-indigo-600">{m.t}</span><span className="font-mono text-xs tabular-nums text-gray-500">{nf(s.n)} · {pct}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.c }} /></div>
                </Link>
              ); })}
            </div>
          )}
        </Bento>
      </div>

      {/* SLA by form (7) + Pending Aging (5) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Bento className="lg:col-span-7" title={D("secSla")} eyebrow="Approval SLA">
          {d.sla.length === 0 ? <Empty text={D("emptyRange")} /> : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400"><tr><th className="py-1.5 pr-4">{D("colType")}</th><th className="py-1.5 pr-4 text-right">Avg</th><th className="py-1.5 pr-4 text-right">P90</th><th className="py-1.5 text-right">{D("colPending")}</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {d.sla.map((s) => (
                    <tr key={s.name} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-4 text-gray-700"><span className="block max-w-[16rem] truncate">{s.name}</span></td>
                      <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums"><span className={s.avg != null && s.avg > 30 ? "font-semibold text-rose-600" : "text-gray-700"}>{s.avg != null ? `${s.avg} ${D("d")}` : "—"}</span></td>
                      <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums text-gray-500">{s.p90 != null ? `${s.p90} ${D("d")}` : "—"}</td>
                      <td className="py-2 text-right font-mono text-xs tabular-nums text-gray-600">{nf(s.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-gray-400">{D("slaHint")}</p>
            </div>
          )}
        </Bento>

        <Bento className="lg:col-span-5" title={D("secAging")} eyebrow="Pending Aging" right={<Link href="/admin/oa-documents?status=pending" className="text-[12px] text-indigo-600 hover:underline">{D("viewPending")}</Link>}>
          {d.pending === 0 ? <div className="flex h-24 items-center justify-center text-sm text-gray-400">{D("noPending")}</div> : (
            <div className="space-y-3">
              {d.aging.map((a) => { const m = ageMeta[a.bucket]; const pct = Math.round((a.n / maxAge) * 100); return (
                <div key={a.bucket} className="text-sm">
                  <div className="mb-1 flex justify-between"><span className="text-gray-600">{m.t}</span><span className="font-mono text-xs tabular-nums text-gray-500">{nf(a.n)}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.c }} /></div>
                </div>
              ); })}
              <p className="text-[11px] text-rose-500">{D("over7", { n: nf(d.aging.find((a) => a.bucket === "7+")?.n ?? 0) })}</p>
            </div>
          )}
        </Bento>
      </div>

      {/* Form (7) + Dept (5) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Bento className="lg:col-span-7" title={D("secByForm")} eyebrow="By Form">
          {d.forms.length === 0 ? <Empty text={D("emptyRange")} /> : (
            <div className="space-y-2.5">
              {d.forms.map((x) => { const pct = Math.round((x.n / maxForm) * 100); return (
                <Link key={x.form_code} href={`/admin/oa-documents?form=${encodeURIComponent(x.form_code)}`} className="block text-sm">
                  <div className="mb-1 flex justify-between gap-2"><span className="min-w-0 flex-1 truncate text-gray-600" title={x.name}>{x.name}</span><span className="font-mono text-xs tabular-nums text-gray-500">{nf(x.n)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${pct}%` }} /></div>
                </Link>
              ); })}
            </div>
          )}
        </Bento>

        <Bento className="lg:col-span-5" title={D("secSpending")} eyebrow="Spending">
          {d.amountByForm.length === 0 ? <div className="flex h-24 items-center justify-center text-sm text-gray-400">{D("noValue")}</div> : (
            <div className="space-y-2.5">
              {d.amountByForm.slice(0, 7).map((x) => { const pct = Math.round((x.amount / maxSpend) * 100); const share = Math.round((x.amount / spendTotal) * 100); return (
                <div key={x.name} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2"><span className="min-w-0 flex-1 truncate text-gray-600" title={x.name}>{x.name}</span><span className="font-mono text-xs tabular-nums text-gray-700">{fmtBaht(x.amount)} <span className="text-gray-400">· {share}%</span></span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${pct}%` }} /></div>
                </div>
              ); })}
            </div>
          )}
        </Bento>
      </div>

      {/* Bottleneck */}
      <Bento title={D("secBottleneck")} eyebrow="Bottleneck" right={<span className="text-[11px] text-gray-400">{D("bottleneckRight")}</span>}>
        {d.bottleneck.length === 0 ? <div className="flex h-24 items-center justify-center text-sm text-gray-400">{D("noBottleneck")}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400"><tr><th className="py-1.5 pr-4">{D("colStepHandler")}</th><th className="py-1.5 pr-4 text-right">{D("colPending")}</th><th className="py-1.5 pr-4 text-right">{D("colAvgWait")}</th><th className="py-1.5 pr-4 text-right">P90</th><th className="py-1.5 text-right">{D("colStuckValue")}</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {d.bottleneck.map((b) => (
                  <tr key={b.node} className="hover:bg-gray-50/60">
                    <td className="py-2 pr-4 text-gray-700"><Link href={`/admin/oa-documents?status=pending${b.node !== "—" ? `&node=${encodeURIComponent(b.node)}` : ""}`} className="block max-w-[20rem] truncate hover:text-indigo-600 hover:underline">{b.node}</Link></td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums font-semibold text-gray-800">{nf(b.n)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums"><span className={b.avgWait != null && b.avgWait > 7 ? "font-semibold text-rose-600" : "text-gray-600"}>{b.avgWait != null ? `${b.avgWait} ${D("d")}` : "—"}</span></td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums text-gray-400">{b.p90 != null ? `${b.p90} ${D("d")}` : "—"}</td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums text-gray-600">{b.value > 0 ? fmtBaht(b.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-gray-400">{D("bottleneckHint")}</p>
          </div>
        )}
      </Bento>

      {/* Department performance */}
      <Bento title={D("secDept")} eyebrow="Department Performance">
        {d.deptPerf.length === 0 ? <Empty text={D("emptyRange")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400"><tr><th className="py-1.5 pr-4">{D("colDeptName")}</th><th className="py-1.5 pr-4 text-right">{D("colCount")}</th><th className="py-1.5 pr-4 text-right">{D("colApproved")}</th><th className="py-1.5 pr-4 text-right">{D("colRejWd")}</th><th className="py-1.5 text-right">{D("colAvgTime")}</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {d.deptPerf.map((x) => { const apr = x.n ? Math.round((x.approved / x.n) * 100) : 0; const rej = x.n ? Math.round((x.rejected / x.n) * 100) : 0; return (
                  <tr key={x.dept} className="hover:bg-gray-50/60">
                    <td className="py-2 pr-4 font-medium text-gray-700"><Link href={`/admin/oa-documents?dept=${encodeURIComponent(x.dept)}`} className="hover:text-indigo-600 hover:underline">{x.dept}</Link></td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums text-gray-700">{nf(x.n)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums text-emerald-600">{apr}%</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums"><span className={rej > 15 ? "font-semibold text-rose-600" : "text-gray-500"}>{rej}%</span></td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums text-gray-600">{x.avg != null ? `${x.avg} ${D("d")}` : "—"}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </Bento>

      {/* Recent */}
      <Bento title={D("secRecent")} eyebrow="Action" right={<Link href="/admin/oa-documents" className="text-[12px] text-indigo-600 hover:underline">{D("viewAll")}</Link>}>
        {d.recent.length === 0 ? <Empty text={D("emptyRange")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400"><tr><th className="py-1.5 pr-4">{D("colNo")}</th><th className="py-1.5 pr-4">{D("colForm")}</th><th className="py-1.5 pr-4">{D("colApplicant")}</th><th className="py-1.5 pr-4">{D("colDept")}</th><th className="py-1.5 pr-4">{D("colDate")}</th><th className="py-1.5">{D("colStatus")}</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {d.recent.map((r) => { const m = sMeta(r.status, locale); return (
                  <tr key={r.oa_key} className="hover:bg-gray-50/60">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-700">{r.serial}</td>
                    <td className="py-2 pr-4 text-gray-600"><span className="block max-w-[15rem] truncate">{r.form}</span></td>
                    <td className="py-2 pr-4 text-gray-600">{r.applicant || "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.dept || "—"}</td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{r.date}</td>
                    <td className="py-2"><span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: m.c }}>{m.t}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </Bento>
    </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-24 items-center justify-center text-sm text-gray-400">{text}</div>;
}
