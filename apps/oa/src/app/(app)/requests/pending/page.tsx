import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listPendingOverview, type PendingOverviewRow } from "@/lib/queries";
import { PageShell, PageTitle, SectionCard, StatTile, EmptyState } from "@/components/layout-bits";
import TemplateGlyph from "@/components/TemplateGlyph";
import { IconInbox, IconClock, IconAlert, IconUsers, IconSearch } from "@/components/icons";
import { money, formatDateTime, waitingDays } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * ภาพรวมรออนุมัติ — เห็นทุกเอกสารที่ยังค้างในสายอนุมัติ ว่า "ใบไหนรอใครอยู่"
 * จัดกลุ่มตามกรุ๊ปเอกสาร (หมวดฟอร์ม) แยกย่อยตามประเภทฟอร์ม + สรุปภาระผู้อนุมัติ
 *
 * เปิดให้ทุกคนเข้า แต่เคารพสิทธิ์การมองเห็น: ADMIN/ผู้ตรวจสอบเห็นทุกใบ,
 * คนอื่นเห็นเฉพาะของตัวเอง + ที่ตนอยู่ในสายอนุมัติ/สำเนา + ลูกน้อง/แผนก (ตามบทบาท)
 */
const waitClass = (d: number) =>
  d >= 7 ? "font-semibold text-no" : d >= 3 ? "font-medium text-wait" : "text-muted";

type SP = {
  q?: string; cat?: string; tpl?: string; dept?: string; stage?: string; who?: string; wait?: string;
};

export default async function PendingOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const sp = await searchParams;

  const all = await listPendingOverview(user);
  const waitOf = (r: PendingOverviewRow) => (r.submitted_at ? waitingDays(r.submitted_at) : 0);

  // ---- ตัวเลือกตัวกรอง (อิงจากชุดที่เห็นได้จริง ไม่ยัดตัวเลือกที่ไม่มีของค้าง) ----
  const catOpts = [...new Map(all.map((r) => [String(r.category_id ?? "x"), r.category_name])).entries()]
    .map(([id, name]) => ({ id, name }));
  const tplOpts = [...new Map(all.map((r) => [r.template_code || r.template_name, r.template_name])).entries()]
    .map(([code, name]) => ({ code, name }));
  const deptOpts = [...new Set(all.map((r) => r.requester_department).filter(Boolean))] as string[];
  const whoOpts = [...new Map(all.flatMap((r) => r.current_handlers).map((h) => [String(h.id), h.name])).entries()]
    .map(([id, name]) => ({ id, name }));

  // ---- ใช้ตัวกรอง ----
  const q = (sp.q ?? "").trim().toLowerCase();
  const minWait = sp.wait ? Number(sp.wait) : 0;
  const data = all.filter((r) =>
    (!sp.cat || String(r.category_id ?? "x") === sp.cat) &&
    (!sp.tpl || (r.template_code || r.template_name) === sp.tpl) &&
    (!sp.dept || r.requester_department === sp.dept) &&
    (!sp.stage || r.stage === sp.stage) &&
    (!sp.who || r.current_handlers.some((h) => String(h.id) === sp.who)) &&
    (!minWait || waitOf(r) >= minWait) &&
    (!q ||
      r.doc_no.toLowerCase().includes(q) ||
      (r.title ?? "").toLowerCase().includes(q) ||
      (r.requester_name ?? "").toLowerCase().includes(q)),
  );
  const hasFilter = Boolean(sp.q || sp.cat || sp.tpl || sp.dept || sp.stage || sp.who || sp.wait);

  // ---- สรุป (อิงผลหลังกรอง) ----
  const total = data.length;
  const totalValue = data.reduce((s, r) => s + (r.amount ?? 0), 0);
  const waits = data.map(waitOf);
  const longest = waits.length ? Math.max(...waits) : 0;
  const stale = waits.filter((w) => w >= 7).length;

  // ---- ภาระผู้อนุมัติ ----
  const desk = new Map<number, { name: string; count: number; oldest: number }>();
  for (const r of data) {
    const w = waitOf(r);
    for (const h of r.current_handlers) {
      const d = desk.get(h.id) ?? { name: h.name, count: 0, oldest: 0 };
      d.count += 1;
      d.oldest = Math.max(d.oldest, w);
      desk.set(h.id, d);
    }
  }
  const deskList = [...desk.values()].sort((a, b) => b.count - a.count || b.oldest - a.oldest);

  // ---- จัดกลุ่ม: กรุ๊ปเอกสาร → ประเภทฟอร์ม ----
  type Cat = { id: number | null; name: string; rows: PendingOverviewRow[] };
  const cats = new Map<string, Cat>();
  for (const r of data) {
    const key = String(r.category_id ?? "x");
    const g = cats.get(key) ?? { id: r.category_id, name: r.category_name, rows: [] };
    g.rows.push(r);
    cats.set(key, g);
  }
  const catList = [...cats.values()].sort((a, b) => b.rows.length - a.rows.length);
  const groupByTemplate = (rs: PendingOverviewRow[]) => {
    const m = new Map<string, { name: string; icon: string | null; rows: PendingOverviewRow[] }>();
    for (const r of rs) {
      const k = r.template_code || r.template_name;
      const g = m.get(k) ?? { name: r.template_name, icon: r.template_icon, rows: [] };
      g.rows.push(r);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length);
  };

  const isAdmin = user.role === "ADMIN" || user.can_audit === 1;

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle
          title={t("pending.title")}
          subtitle={isAdmin ? t("pending.subtitle") : t("pending.subtitleMine")}
        />

        {/* ตัวกรองละเอียด */}
        <form action="/requests/pending" className="bar flex-wrap lg:flex-nowrap">
          <div className="relative min-w-[160px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <IconSearch className="h-4 w-4" />
            </span>
            <input name="q" defaultValue={sp.q ?? ""} aria-label={t("pending.filter.search")}
                   className="bar-field w-full pl-10" placeholder={t("pending.filter.search")} />
          </div>

          <select name="cat" defaultValue={sp.cat ?? ""} aria-label={t("pending.filter.category")} className="bar-field w-36 shrink-0">
            <option value="">{t("pending.filter.allCat")}</option>
            {catOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select name="tpl" defaultValue={sp.tpl ?? ""} aria-label={t("pending.filter.template")} className="bar-field w-40 shrink-0">
            <option value="">{t("pending.filter.allTpl")}</option>
            {tplOpts.map((tp) => <option key={tp.code} value={tp.code}>{tp.name}</option>)}
          </select>

          <select name="who" defaultValue={sp.who ?? ""} aria-label={t("pending.filter.approver")} className="bar-field w-36 shrink-0">
            <option value="">{t("pending.filter.allApprover")}</option>
            {whoOpts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <select name="dept" defaultValue={sp.dept ?? ""} aria-label={t("detail.department")} className="bar-field w-36 shrink-0">
            <option value="">{t("pending.filter.allDept")}</option>
            {deptOpts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <select name="stage" defaultValue={sp.stage ?? ""} aria-label={t("pending.col.stage")} className="bar-field w-32 shrink-0">
            <option value="">{t("pending.filter.allStage")}</option>
            <option value="PRELIM">{t("pending.stagePrelim")}</option>
            <option value="FINAL">{t("pending.stageFinal")}</option>
          </select>

          <select name="wait" defaultValue={sp.wait ?? ""} aria-label={t("pending.filter.wait")} className="bar-field w-32 shrink-0">
            <option value="">{t("pending.filter.anyWait")}</option>
            <option value="3">{t("pending.filter.wait3")}</option>
            <option value="7">{t("pending.filter.wait7")}</option>
            <option value="14">{t("pending.filter.wait14")}</option>
          </select>

          <button className="btn-primary h-11 shrink-0 px-4" title={t("pending.filter.apply")}>
            {t("pending.filter.apply")}
          </button>
          {hasFilter && (
            <Link href="/requests/pending" className="btn btn-ghost h-11 shrink-0 px-3">
              {t("pending.filter.clear")}
            </Link>
          )}
        </form>

        {total === 0 ? (
          <EmptyState>{hasFilter ? t("pending.noMatch") : t("pending.empty")}</EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label={t("pending.sumTotal")} value={total} icon={<IconInbox className="h-5 w-5" />} />
              <StatTile label={t("pending.sumValue")} value={money(totalValue, locale)} hint={t("pending.sumValueHint")} />
              <StatTile label={t("pending.sumStale")} value={stale} hint={t("pending.sumStaleHint")} icon={<IconAlert className="h-5 w-5" />} />
              <StatTile label={t("pending.sumLongest")} value={t("table.waitingDays", { n: longest })} icon={<IconClock className="h-5 w-5" />} />
            </div>

            <SectionCard
              title={<span className="inline-flex items-center gap-2"><IconUsers className="h-4 w-4" />{t("pending.desk.title")}</span>}
              hint={t("pending.desk.hint")}
            >
              {deskList.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted">{t("pending.desk.none")}</p>
              ) : (
                <div className="table-wrap">
                  <table className="w-full text-sm">
                    <thead className="table-head">
                      <tr>
                        <th scope="col">{t("pending.desk.approver")}</th>
                        <th scope="col" className="text-right">{t("pending.desk.count")}</th>
                        <th scope="col" className="text-right">{t("pending.desk.oldest")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {deskList.map((d, i) => (
                        <tr key={i} className="row-hover">
                          <td className="px-3 py-2 font-medium text-text">{d.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums"><span className="badge tone-primary">{d.count}</span></td>
                          <td className={`px-3 py-2 text-right tabular-nums ${waitClass(d.oldest)}`}>{t("table.waitingDays", { n: d.oldest })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {catList.map((cat) => {
              const catValue = cat.rows.reduce((s, r) => s + (r.amount ?? 0), 0);
              return (
                <SectionCard
                  key={String(cat.id ?? "x")}
                  title={
                    <span className="inline-flex items-center gap-2">
                      {cat.name}
                      <span className="badge tone-primary">{t("pending.catCount", { n: cat.rows.length })}</span>
                    </span>
                  }
                  hint={catValue > 0 ? `${t("pending.catValue")} ${money(catValue, locale)}` : undefined}
                >
                  <div className="space-y-6">
                    {groupByTemplate(cat.rows).map((tpl, ti) => (
                      <div key={ti}>
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                          <TemplateGlyph icon={tpl.icon ?? ""} size={15} />
                          <span>{tpl.name}</span>
                          <span className="text-xs font-normal text-muted">{t("pending.tplCount", { n: tpl.rows.length })}</span>
                        </div>
                        <div className="table-wrap overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="table-head">
                              <tr>
                                <th scope="col">{t("pending.col.docNo")}</th>
                                <th scope="col">{t("pending.col.subject")}</th>
                                <th scope="col">{t("pending.col.requester")}</th>
                                <th scope="col" className="text-right">{t("table.amount")}</th>
                                <th scope="col">{t("pending.col.stage")}</th>
                                <th scope="col">{t("pending.col.node")}</th>
                                <th scope="col">{t("pending.col.waitingOn")}</th>
                                <th scope="col" className="text-right">{t("table.waiting")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {tpl.rows.map((r) => {
                                const w = waitOf(r);
                                return (
                                  <tr key={r.id} className="row-hover align-top">
                                    <td className="whitespace-nowrap px-3 py-2">
                                      <Link href={`/requests/${r.id}`} className="font-mono text-[13px] text-primary-text hover:underline">{r.doc_no}</Link>
                                      <div className="mt-0.5 text-[11px] text-muted">{r.submitted_at ? formatDateTime(r.submitted_at, locale) : "—"}</div>
                                    </td>
                                    <td className="max-w-[16rem] px-3 py-2">
                                      <span className="block truncate" title={r.title}>{r.title || <span className="text-muted">—</span>}</span>
                                    </td>
                                    <td className="max-w-[12rem] px-3 py-2 text-text-soft">
                                      <span className="block truncate" title={r.requester_name}>{r.requester_name}</span>
                                      {r.requester_department && <span className="block truncate text-[11px] text-muted">{r.requester_department}</span>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-text-soft">
                                      {r.amount === null ? <span className="text-muted">—</span> : money(r.amount, locale)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2">
                                      <span className={`badge ${r.stage === "PRELIM" ? "tone-wait" : "tone-primary"}`}>
                                        {r.stage === "PRELIM" ? t("pending.stagePrelim") : t("pending.stageFinal")}
                                      </span>
                                    </td>
                                    <td className="max-w-[11rem] px-3 py-2 text-text-soft">
                                      <span className="block truncate" title={r.current_node}>{r.current_node || <span className="text-muted">—</span>}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      {r.current_handlers.length > 0 ? (
                                        <span className="flex flex-wrap gap-1">
                                          {r.current_handlers.map((h) => (
                                            <span key={h.id} className="badge bg-surface text-text-soft ring-border-strong">{h.name}</span>
                                          ))}
                                        </span>
                                      ) : <span className="text-muted">—</span>}
                                    </td>
                                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${waitClass(w)}`}>
                                      {w > 0 ? t("table.waitingDays", { n: w }) : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              );
            })}
          </>
        )}
      </div>
    </PageShell>
  );
}
