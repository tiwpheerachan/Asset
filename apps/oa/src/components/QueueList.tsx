import TemplateGlyph from "@/components/TemplateGlyph";
import Link from "next/link";
import { StatusBadge } from "./ui";
import { formatDate, money, waitingDays } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Field, RequestWithMeta } from "@/lib/types";
import type { Locale } from "@/lib/i18n/locales";
import { previewFieldsFor } from "@/lib/queries";
import { previewValue } from "@/lib/preview";
import { parseJson } from "@/lib/form";
import type { T } from "@/lib/i18n";
import QuickDecide from "./QuickDecide";

/**
 * รายการงานแบบกระชับสำหรับหน้าเริ่มงาน
 *
 * ไม่ใช้ตารางเต็มเหมือนหน้ารายการ เพราะที่นี่คนไม่ได้มาค้นหรือเปรียบเทียบ —
 * มาดูว่า "มีอะไรค้างอยู่ที่ฉัน" แล้วกดเข้าไปทำ หนึ่งบรรทัดจึงต้องตอบให้ครบว่า
 * เรื่องอะไร ของใคร เท่าไหร่ ค้างมากี่วัน แล้วกดได้ทั้งบรรทัด
 */
export default async function QueueList({
  items,
  variant = "incoming",
  max = 5,
  moreHref,
  decidable = false,
}: {
  items: RequestWithMeta[];
  /** incoming = งานที่รอเราตัดสิน · outgoing = คำขอที่เราเป็นคนส่ง */
  variant?: "incoming" | "outgoing";
  max?: number;
  moreHref?: string;
  /** ให้ตัดสินได้จากบรรทัดเลย ไม่ต้องเปิดเอกสาร (เฉพาะคิวที่รอเราจริงๆ) */
  decidable?: boolean;
}) {
  const t = await getT();
  const locale = await getLocale();
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;

  // ช่องที่ยกมาแสดงต่างกันตามแม่แบบ — ดึงทีเดียวสำหรับทุกแม่แบบที่อยู่ในรายการนี้
  const previews = await previewFieldsFor(shown.map((r) => r.template_id));

  return (
    <div>
      <ul className="divide-y divide-border">
        {shown.map((r) => {
          const waited = r.status === "PENDING" ? waitingDays(r.submitted_at) : 0;
          return (
            <li key={r.id} className="px-1 py-2.5">
              <Link
                href={`/requests/${r.id}`}
                className="-mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-1 py-0.5 transition hover:bg-surface-2"
              >
                <span className="shrink-0 text-base leading-none" title={r.template_name}>
                  <TemplateGlyph icon={r.template_icon} size={15} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {r.title || t("table.noSubject")}
                  </span>

                  {/* ค่าจากช่องแรก ๆ ของฟอร์มเอง — บรรทัดเดิมบอกแค่หัวเรื่อง ผู้จัดทำ
                      วันที่ ยอดเงิน ซึ่งเหมือนกันแทบทุกใบ คนอนุมัติจึงต้องเปิดทีละใบ
                      เพื่อดูว่าเรื่องอะไรกันแน่ ทั้งที่คำตอบอยู่ในฟอร์มอยู่แล้ว */}
                  {rowPreview(r, previews.get(r.template_id) ?? [], locale).map((line) => (
                    <span key={line.label} className="block truncate text-xs text-text-soft">
                      <span className="text-muted">{line.label}</span>
                      {" : "}
                      {line.value}
                    </span>
                  ))}

                  <span className="block truncate text-xs text-muted">
                    {variant === "incoming" ? t("queue.fromWho", { name: r.requester_name }) : outgoingNote(r, t)}
                    {" · "}
                    {formatDate(r.doc_date, locale)}
                  </span>
                </span>

                {r.amount !== null && (
                  <span className="shrink-0 tabular-nums text-sm text-text-soft">
                    {money(r.amount, locale)}
                  </span>
                )}

                {variant === "outgoing" ? (
                  <StatusBadge status={r.status} />
                ) : (
                  /* ค้างกี่วันสำคัญกว่าสถานะในคิวขาเข้า — ทุกใบในนี้สถานะเดียวกันหมด */
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      waited >= 3 ? "font-semibold text-no" : "text-muted"
                    }`}
                  >
                    {waited > 0 ? t("queue.waitedDays", { n: waited }) : t("queue.today")}
                  </span>
                )}
              </Link>

              {decidable && <QuickDecide requestId={r.id} title={r.title || t("table.noSubject")} />}
            </li>
          );
        })}
      </ul>

      {rest > 0 && moreHref && (
        <Link
          href={moreHref}
          className="mt-2 inline-block text-xs font-medium text-primary-text hover:underline"
        >
          {t("queue.more", { n: rest })} →
        </Link>
      )}
    </div>
  );
}

/**
 * บรรทัดรองของคำขอที่เราเป็นคนส่ง — ต้องตอบว่า "ตอนนี้มันอยู่ตรงไหน"
 * ใบร่างกับใบที่ถูกส่งกลับยังไม่ได้เดินในสาย current_step จึงเป็น 0
 * บอกว่า "อยู่ที่ขั้นที่ 0" จะไม่มีความหมาย ต้องบอกว่าเจ้าของต้องทำอะไรแทน
 */
function outgoingNote(r: RequestWithMeta, t: T): string {
  if (r.status === "DRAFT") return t("queue.draftNote");
  if (r.status === "RETURNED") return t("queue.returnedNote");
  return t("queue.stepNow", { n: r.current_step });
}

/** บรรทัดย่อของคำขอหนึ่งใบ — ข้ามช่องที่ยังไม่ได้กรอก จะได้ไม่เหลือบรรทัดเปล่า */
function rowPreview(r: RequestWithMeta, fields: Field[], locale: Locale) {
  const data = parseJson<Record<string, unknown>>(r.data, {});
  return fields
    .map((f) => ({ label: f.label, value: previewValue(f, data[f.field_key], locale) }))
    .filter((line) => line.value !== "");
}
