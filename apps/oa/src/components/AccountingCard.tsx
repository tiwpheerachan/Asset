import { getLocale, getT } from "@/lib/i18n/server";
import { formatDateTime, money } from "@/lib/format";
import { IconCheck, IconClock } from "@/components/icons";
import type { ExternalStatus } from "@/lib/types";

/**
 * ความคืบหน้าฝั่งบัญชี (OneBook)
 *
 * แสดงเป็นไทม์ไลน์ ไม่ใช่ป้ายสถานะเดียว เพราะคำถามของคนยื่นเรื่องไม่ได้มีแค่
 * "จ่ายหรือยัง" แต่มี "ถึงมือบัญชีเมื่อไหร่" และ "ค้างอยู่ขั้นไหนมานานแค่ไหน" ด้วย
 *
 * ทุกแถวมาจากระบบบัญชีที่ยิงกลับมา ไม่ใช่สิ่งที่ใครในระบบนี้กรอกเองได้ —
 * จึงแสดงชื่อระบบต้นทางกำกับไว้ ให้รู้ว่าเชื่อถือได้แค่ไหนและไปถามต่อที่ไหน
 */
const TONE: Record<string, string> = {
  RECEIVED: "text-muted",
  RECORDED: "text-primary-text",
  PAID: "text-ok",
  REJECTED: "text-no",
};

export default async function AccountingCard({ rows }: { rows: ExternalStatus[] }) {
  const t = await getT();
  const locale = await getLocale();
  const latest = rows[rows.length - 1];

  return (
    <section className="card space-y-3">
      <h2 className="h-sect">{t("acct.title")}</h2>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-sm font-medium ${TONE[latest.state] ?? "text-text"}`}>
          {t(`acct.state.${latest.state}`)}
        </span>
        {latest.external_ref && (
          <span className="font-mono text-xs text-muted">{latest.external_ref}</span>
        )}
      </div>

      <ol className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-2.5 text-sm">
            <span className={`mt-0.5 shrink-0 ${TONE[r.state] ?? "text-muted"}`}>
              {r.state === "PAID" ? (
                <IconCheck className="h-4 w-4" />
              ) : (
                <IconClock className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-text">
                  {t(`acct.state.${r.state}`)}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                  {formatDateTime(r.occurred_at, locale)}
                </span>
              </div>
              {r.amount !== null && (
                <div className="text-xs tabular-nums text-text-soft">{money(r.amount, locale)}</div>
              )}
              {r.note && (
                <p className="mt-0.5 whitespace-pre-line border-l-2 border-border pl-2.5 text-[13px] text-text-soft">
                  {r.note}
                </p>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {r.source && <span>{r.source}</span>}
                {r.external_url && (
                  <a href={r.external_url} target="_blank" rel="noreferrer"
                     className="text-primary-text hover:underline">
                    {t("acct.openExternal")}
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
