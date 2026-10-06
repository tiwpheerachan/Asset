import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRequestsForTable, listTemplates } from "@/lib/queries";
import { PageShell, PageTitle, EmptyState } from "@/components/layout-bits";
import { StatusBadge } from "@/components/ui";
import TemplateGlyph from "@/components/TemplateGlyph";
import { IconDownload, IconSearch } from "@/components/icons";
import { formatDate, formatDateTime, money, waitingDays } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { STATUS_LABEL } from "@/lib/types";
import type { RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * ตารางรวมเอกสาร — มุมมองไว้กวาดตาและส่งออกไปวิเคราะห์ต่อ
 *
 * แยกจาก "ศูนย์การอนุมัติ" เพราะตอบคนละคำถาม: ศูนย์การอนุมัติตอบว่า "ฉันต้องทำอะไรต่อ"
 * จึงแสดงน้อยคอลัมน์และเน้นสิ่งที่ค้างอยู่ · หน้านี้ตอบว่า "ภาพรวมทั้งหมดเป็นยังไง"
 * จึงยัดคอลัมน์ให้ครบแล้วปล่อยให้เลื่อนดู เหมือนเปิดสเปรดชีต
 *
 * ยังเคารพสิทธิ์การมองเห็นเหมือนทุกหน้า — เห็นเฉพาะใบที่ตัวเองมีสิทธิ์เห็น
 * ไม่ใช่ทุกใบในบริษัท
 */
const PER_PAGE = 100;

export default async function RequestGridPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string; tpl?: string; q?: string; from?: string; to?: string; page?: string;
  }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { rows, total } = await listRequestsForTable(user, {
    tab: "all",
    status: sp.status && sp.status in STATUS_LABEL ? sp.status : undefined,
    templateId: sp.tpl ? Number(sp.tpl) : undefined,
    q: sp.q,
    from: sp.from,
    to: sp.to,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });
  const templates = await listTemplates();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      status: sp.status, tpl: sp.tpl, q: sp.q, from: sp.from, to: sp.to,
      page: undefined as string | undefined, ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/requests/table?${p.toString()}`;
  };
  const exportUrl = (() => {
    const p = new URLSearchParams({ tab: "all" });
    for (const [k, v] of Object.entries({ status: sp.status, tpl: sp.tpl, q: sp.q, from: sp.from, to: sp.to }))
      if (v) p.set(k, v);
    return `/api/requests/export?${p.toString()}`;
  })();

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("grid.title")} subtitle={t("grid.subtitle")} />

        {/* ตัวกรองชุดเดียวกับศูนย์การอนุมัติ ตั้งใจให้คุ้นมือ — ต่างกันแค่ไม่มีแท็บ
            เพราะหน้านี้ดูทั้งหมดเสมอ ไม่ได้แบ่งเป็นงานของฉัน/ของทีม */}
        <form action="/requests/table" className="bar flex-wrap lg:flex-nowrap">
          <div className="relative min-w-[170px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <IconSearch className="h-4 w-4" />
            </span>
            <input name="q" aria-label={t("list.searchPlaceholder")} defaultValue={sp.q ?? ""}
                   className="bar-field w-full pl-10" placeholder={t("list.searchPlaceholder")} />
          </div>

          <select name="status" aria-label={t("table.status")} defaultValue={sp.status ?? ""}
                  className="bar-field w-32 shrink-0">
            <option value="">{t("list.filter.anyStatus")}</option>
            {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((st) => (
              <option key={st} value={st}>{t(`status.${st}`)}</option>
            ))}
          </select>

          <select name="tpl" aria-label={t("detail.type")} defaultValue={sp.tpl ?? ""}
                  className="bar-field w-36 shrink-0">
            <option value="">{t("list.filter.anyType")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>

          <input type="date" name="from" aria-label={t("list.filter.from")} defaultValue={sp.from ?? ""}
                 title={t("list.filter.from")} className="bar-field w-36 shrink-0" />
          {sp.to && <input type="hidden" name="to" value={sp.to} />}

          <button className="btn-primary h-11 w-11 shrink-0 rounded-full px-0"
                  title={t("list.filter.apply")} aria-label={t("list.filter.apply")}>
            <IconSearch className="h-[18px] w-[18px]" />
          </button>

          <a className="btn btn-ghost ml-auto h-11 w-11 shrink-0 rounded-full px-0"
             href={exportUrl} title={t("list.exportCsv")} aria-label={t("list.exportCsv")}>
            <IconDownload className="h-[18px] w-[18px]" />
          </a>
        </form>

        {rows.length === 0 ? (
          <EmptyState>{t("list.empty")}</EmptyState>
        ) : (
          <>
            {/* คอลัมน์เยอะเกินจอตั้งใจ — เลื่อนแนวนอนดูเหมือนสเปรดชีต
                เลขที่เอกสารตรึงไว้ซ้ายสุด ไม่งั้นเลื่อนไปขวาแล้วไม่รู้ว่ากำลังดูแถวไหน */}
            <div className="table-wrap max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 bg-surface-2">{t("table.docNo")}</th>
                    <th scope="col">{t("table.status")}</th>
                    <th scope="col">{t("table.form")}</th>
                    <th scope="col">{t("table.subject")}</th>
                    <th scope="col">{t("table.requester")}</th>
                    <th scope="col">{t("detail.department")}</th>
                    <th scope="col" className="text-right">{t("table.amount")}</th>
                    <th scope="col">{t("grid.submittedAt")}</th>
                    <th scope="col">{t("grid.closedAt")}</th>
                    <th scope="col">{t("grid.node")}</th>
                    <th scope="col">{t("grid.handler")}</th>
                    <th scope="col" className="text-right">{t("table.waiting")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const waited = r.status === "PENDING" ? waitingDays(r.submitted_at) : 0;
                    return (
                      <tr key={r.id} className="row-hover">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2">
                          <Link href={`/requests/${r.id}`}
                                className="font-mono text-[13px] text-primary-text hover:underline">
                            {r.doc_no}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="max-w-[16rem] px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <span className="shrink-0"><TemplateGlyph icon={r.template_icon} size={14} /></span>
                            <span className="truncate">{r.template_name}</span>
                          </span>
                        </td>
                        <td className="max-w-[18rem] truncate px-3 py-2" title={r.title}>
                          {r.title || <span className="text-muted">—</span>}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-text-soft" title={r.requester_name}>
                          {r.requester_name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-soft">
                          {r.requester_department || <span className="text-muted">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-text-soft">
                          {r.amount === null ? <span className="text-muted">—</span> : money(r.amount, locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                          {r.submitted_at ? formatDateTime(r.submitted_at, locale) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                          {r.closed_at ? formatDateTime(r.closed_at, locale) : "—"}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2 text-text-soft" title={r.current_node}>
                          {r.current_node || <span className="text-muted">—</span>}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-text-soft"
                            title={r.current_handlers.join(" / ")}>
                          {r.current_handlers.length > 0
                            ? r.current_handlers.join(" / ")
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {waited > 0 ? (
                            <span className={
                              waited >= 7 ? "font-medium text-no"
                              : waited >= 3 ? "font-medium text-wait"
                              : "text-muted"
                            }>
                              {t("table.waitingDays", { n: waited })}
                            </span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                {t("grid.showing", { from: String(from), to: String(to), total: String(total) })}
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <Link href={qs({ page: String(Math.max(1, page - 1)) })}
                        aria-disabled={page === 1}
                        className={`btn btn-ghost h-9 min-h-0 px-3 text-[13px] ${page === 1 ? "pointer-events-none opacity-40" : ""}`}>
                    {t("grid.prev")}
                  </Link>
                  <span className="tabular-nums text-muted">{page} / {pages}</span>
                  <Link href={qs({ page: String(Math.min(pages, page + 1)) })}
                        aria-disabled={page === pages}
                        className={`btn btn-ghost h-9 min-h-0 px-3 text-[13px] ${page === pages ? "pointer-events-none opacity-40" : ""}`}>
                    {t("grid.next")}
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
