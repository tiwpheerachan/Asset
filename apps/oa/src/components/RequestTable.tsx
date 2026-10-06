import TemplateGlyph from "@/components/TemplateGlyph";
import Link from "next/link";
import { StatusBadge } from "./ui";
import { EmptyState } from "./layout-bits";
import { formatDate, waitingDays } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { RequestWithMeta } from "@/lib/types";

export default async function RequestTable({
  requests,
  empty,
}: {
  requests: RequestWithMeta[];
  empty?: string;
}) {
  const t = await getT();
  const locale = await getLocale();

  if (requests.length === 0) {
    return <EmptyState>{empty ?? t("list.empty")}</EmptyState>;
  }

  return (
    <>
      {/*
        มือถือ: การ์ดแทนตาราง
        ตาราง 7 คอลัมน์บนจอ 390px ต้องเลื่อนซ้ายขวาทีละแถว และคอลัมน์สถานะ —
        สิ่งที่คนเปิดหน้านี้มาดูเป็นอย่างแรก — จะอยู่นอกจอเสมอ
        การ์ดจัดให้เลขที่กับสถานะอยู่บรรทัดเดียวกัน เห็นครบโดยไม่ต้องเลื่อน
      */}
      <ul className="space-y-2 sm:hidden">
        {requests.map((r) => {
          const waited = r.status === "PENDING" ? waitingDays(r.submitted_at) : 0;
          return (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="block rounded-2xl bg-surface p-3 ring-1 ring-border active:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] text-primary-text">{r.doc_no}</span>
                  <StatusBadge status={r.status} />
                </div>

                <div className="mt-1.5 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">
                    <TemplateGlyph icon={r.template_icon} size={15} />
                  </span>
                  <span className="line-clamp-2 text-sm text-text">{r.template_name}</span>
                </div>

                {/* บรรทัดล่างเป็นข้อมูลประกอบ — ผู้จัดทำ วันที่ ยอดเงิน และจำนวนวันที่ค้าง */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="truncate">{r.requester_name}</span>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap">{formatDate(r.doc_date, locale)}</span>
                  {waited > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span
                        className={`whitespace-nowrap tabular-nums ${
                          waited >= 7 ? "font-medium text-no"
                          : waited >= 3 ? "font-medium text-wait"
                          : ""
                        }`}
                      >
                        {t("table.waitingDays", { n: waited })}
                      </span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="table-wrap hidden sm:block">
      <table className="w-full">
        <thead className="table-head">
          <tr>
            <th scope="col">{t("table.docNo")}</th>
            <th scope="col">{t("table.form")}</th>
            <th scope="col">{t("table.requester")}</th>
            <th scope="col">{t("table.date")}</th>
            <th scope="col">{t("table.status")}</th>
            <th scope="col" className="text-right">{t("table.waiting")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-sm">
          {requests.map((r) => {
            const waited = r.status === "PENDING" ? waitingDays(r.submitted_at) : 0;
            return (
              <tr key={r.id} className="row-dense row-hover row-link cursor-pointer">
                <td className="whitespace-nowrap">
                  <Link
                    href={`/requests/${r.id}`}
                    className="row-target font-mono text-[13px] text-primary-text hover:underline"
                  >
                    {r.doc_no}
                  </Link>
                </td>

                {/* ชื่อฟอร์ม ไม่ใช่หัวเรื่อง — ฟอร์มส่วนใหญ่ที่ใช้จริงไม่ได้ตั้งช่องหัวเรื่องไว้
                    คอลัมน์นี้จึงขึ้นว่า "(ไม่มีหัวข้อ)" แทบทุกแถว ซึ่งไม่ได้บอกอะไรเลย */}
                <td className="max-w-[26rem]">
                  <span className="flex items-center gap-1.5">
                    <span className="shrink-0 text-base leading-none">
                      <TemplateGlyph icon={r.template_icon} size={15} />
                    </span>
                    <span className="truncate text-text">{r.template_name}</span>
                  </span>
                </td>

                {/* ชื่อที่ซิงก์มาจาก Central Login มีตำแหน่งพ่วงท้าย ยาวจนดันตารางบานถ้าไม่ตัด */}
                <td className="max-w-[12rem] truncate text-text-soft" title={r.requester_name}>
                  {r.requester_name}
                </td>
                <td className="whitespace-nowrap text-muted">{formatDate(r.doc_date, locale)}</td>

                <td className="whitespace-nowrap">
                  <StatusBadge status={r.status} />
                  {r.status === "PENDING" && (
                    <span className="ml-2 text-xs text-muted">
                      {t("table.stepN", { n: r.current_step })}
                    </span>
                  )}
                </td>

                {/* ค้างกี่วัน — แยกคอลัมน์เพื่อให้กวาดตาหาใบที่ดองนานได้ในคอลัมน์เดียว */}
                <td className="whitespace-nowrap text-right tabular-nums">
                  {waited > 0 ? (
                    <span
                      className={
                        waited >= 7 ? "font-medium text-no"
                        : waited >= 3 ? "font-medium text-wait"
                        : "text-muted"
                      }
                    >
                      {t("table.waitingDays", { n: waited })}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
