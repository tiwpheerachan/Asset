import { money } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Drawdown } from "@/lib/drawdown";

/**
 * สรุปการเบิกงวดของใบอนุมัติหลัก
 *
 * คำถามที่คนถามจริงเวลาเปิดใบหลักคือ "เหลือเบิกได้อีกเท่าไร" — คำถามเดียว
 * ตัวเลขนั้นจึงเป็นตัวใหญ่ที่สุดในการ์ด ส่วนยอดที่ใช้ไปแล้วกับที่จองไว้เป็นที่มา
 * ของมัน ไม่ใช่คำตอบ จึงเล็กลงมาอยู่ใต้แถบ
 *
 * แยกยอดที่อนุมัติแล้วออกจากยอดที่ยังรออนุมัติ เพราะสองอย่างนี้ต่างกันในทางบัญชี
 * แต่กันวงเงินไว้เหมือนกัน — รวมเป็นก้อนเดียวจะอ่านไม่ออกว่าอะไรจบแล้วอะไรยัง
 */
export default async function DrawdownCard({ d }: { d: Drawdown }) {
  const t = await getT();
  const locale = await getLocale();

  const budget = d.budget && d.budget > 0 ? d.budget : null;
  const pctOf = (n: number) => (budget ? Math.min(100, (n / budget) * 100) : 0);

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h-sect">{t("draw.title")}</h2>
        <span className={`badge ${d.full ? "tone-amber" : "tone-neutral"}`}>
          {d.periods
            ? t("draw.periods", { count: String(d.count), periods: String(d.periods) })
            : t("draw.periodsOpen", { count: String(d.count) })}
        </span>
      </div>

      {/* คำตอบของคำถามหลักอยู่บนสุด ตัวใหญ่ที่สุด */}
      <div>
        <div className="text-xs text-muted">{t("draw.remaining")}</div>
        <div
          className={`text-[28px] font-semibold leading-none tabular-nums ${
            d.over ? "text-no" : "text-ok"
          }`}
        >
          {d.remaining === null ? "—" : money(d.remaining, locale)}
        </div>
        {budget && (
          <div className="mt-1 text-xs text-muted">
            {t("draw.ofBudget", { amount: money(budget, locale) })}
          </div>
        )}
      </div>

      {budget && (
        <>
          {/* แถบเดียวสามช่วง — เห็นสัดส่วนได้ทันทีโดยไม่ต้องอ่านตัวเลขมาเทียบกันเอง
              สีตรงกับจุดในคำอธิบายใต้แถบ จะได้ไม่ต้องเดาว่าช่วงไหนคืออะไร */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-ok" style={{ width: `${pctOf(d.used)}%` }} />
            <div className="h-full bg-wait" style={{ width: `${pctOf(d.reserved)}%` }} />
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ok" />
              <dt className="text-muted">{t("draw.used")}</dt>
              <dd className="font-medium tabular-nums text-text">
                {money(d.used, locale)}
                <span className="ml-1 font-normal text-muted">({d.usedCount})</span>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-wait" />
              <dt className="text-muted">{t("draw.reserved")}</dt>
              <dd className="font-medium tabular-nums text-text">
                {money(d.reserved, locale)}
                <span className="ml-1 font-normal text-muted">({d.reservedCount})</span>
              </dd>
            </div>
          </dl>
        </>
      )}

      {d.over && d.remaining !== null && (
        <p role="status" className="rounded-xl tone-rose px-3 py-2 text-sm ring-1">
          {t("draw.over", { amount: money(-d.remaining, locale) })}
        </p>
      )}
      {d.full && !d.over && (
        <p role="status" className="rounded-xl tone-amber px-3 py-2 text-sm ring-1">
          {t("draw.full")}
        </p>
      )}
    </section>
  );
}
