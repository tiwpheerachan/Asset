import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import {
  KpiCard, AttentionCard, Donut, HBar, Funnel, DualTrend, LineChart, AgingBar, Empty, PALETTE, PANEL, fmtNum,
} from "@/components/dashboard/widgets";
import { StatusBadge } from "@/components/ui";
import {
  IconInbox, IconClock, IconCheckCircle, IconChart, IconAlert, IconArrowRight, IconForm, IconBell,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const baht = (n: number) => "฿ " + Math.round(n).toLocaleString("th-TH");
const delta = (v: number, prev: number | null | undefined) =>
  prev && prev > 0 ? Math.round(((v - prev) / prev) * 100) : null;

function waitLabel(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} นาที`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} ชม.`;
  const d = Math.floor(h / 24);
  return `${d} วัน ${Math.round(h - d * 24)} ชม.`;
}
function dt(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(+d)) return s.slice(0, 16).replace("T", " ");
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const PRI: Record<string, { label: string; cls: string }> = {
  overdue: { label: "เกิน SLA", cls: "bg-rose-50 text-rose-600" },
  urgent: { label: "ด่วน", cls: "bg-amber-50 text-amber-600" },
  near: { label: "ใกล้ SLA", cls: "bg-yellow-50 text-yellow-700" },
  old: { label: "ค้างนาน", cls: "bg-surface-2 text-text-soft" },
  normal: { label: "ปกติ", cls: "bg-surface-2 text-text-soft" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await loadDashboard(user);

  const attn = d.attention;
  const todo = attn.waitingMe + attn.overdueSla + attn.overdueClear;
  const sub =
    attn.overdueSla > 0 ? `${attn.overdueSla} คำขอเกิน SLA แล้ว`
    : attn.waitingMe > 0 ? `คุณมี ${attn.waitingMe} รายการที่ต้องดำเนินการ`
    : "ไม่มีงานค้างของคุณ 🎉";

  const k = d.kpi;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 md:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-text">👋 สวัสดีครับ คุณ{user.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{sub} · มุมมอง: {d.scopeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[12.5px] text-text-soft ring-1 ring-border/70">
            <IconClock className="h-3.5 w-3.5 text-muted" /> เดือนนี้ · {d.range.from} – {d.range.to}
          </span>
          <Link href="/" className="rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-primary-hover hover:shadow">+ สร้างคำขอใหม่</Link>
        </div>
      </div>

      {/* Attention Center */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-text">ต้องจัดการตอนนี้</div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <AttentionCard count={attn.waitingMe} label="รอคุณอนุมัติ" href="/requests?tab=awaiting" tone="rose" icon={<IconCheckCircle className="h-5 w-5" />} />
          <AttentionCard count={attn.nearSla} label="ใกล้เกิน SLA" href="/requests?tab=awaiting" tone="amber" icon={<IconClock className="h-5 w-5" />} />
          <AttentionCard count={attn.overdueSla} label="เกิน SLA" href="/requests?tab=awaiting" tone="rose" icon={<IconAlert className="h-5 w-5" />} />
          <AttentionCard count={attn.returned} label="ถูกส่งกลับให้แก้" href="/requests?tab=mine" tone="blue" icon={<IconArrowRight className="h-5 w-5" />} />
          <AttentionCard count={attn.pendingClear} label="รอเคลียร์เอกสาร" href="/requests?tab=clearing" tone="violet" icon={<IconForm className="h-5 w-5" />} />
          <AttentionCard count={attn.overdueClear} label="เลยกำหนดเคลียร์" href="/requests?tab=clearing" tone="rose" icon={<IconBell className="h-5 w-5" />} />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="คำขอทั้งหมด" value={fmtNum(k.totalRequests.value)} delta={delta(k.totalRequests.value, k.totalRequests.prev)} sub="จากเดือนก่อน" icon={<IconInbox className="h-5 w-5" />} />
        <KpiCard label="มูลค่าที่อนุมัติแล้ว" value={baht(k.approvedValue.value)} tone="emerald" delta={delta(k.approvedValue.value, k.approvedValue.prev)} sub="จากเดือนก่อน" icon={<IconCheckCircle className="h-5 w-5" />} />
        <KpiCard label="มูลค่าที่รออนุมัติ" value={baht(k.pendingValue)} tone="primary" icon={<IconClock className="h-5 w-5" />} />
        <KpiCard label="อัตราอนุมัติ" value={k.approvalRate != null ? `${k.approvalRate}%` : "—"} tone="violet" icon={<IconChart className="h-5 w-5" />} />
        <KpiCard label="เวลาอนุมัติเฉลี่ย" value={k.avgCycleHours != null ? waitLabel(k.avgCycleHours) : "—"} icon={<IconClock className="h-5 w-5" />} />
        <KpiCard label="เกิน SLA" value={fmtNum(k.overdueSla)} tone={k.overdueSla > 0 ? "rose" : "ink"} sub="รายการ" icon={<IconAlert className="h-5 w-5" />} />
      </div>

      {/* Funnel — เต็มความกว้าง เพื่อให้ทุกขั้นแสดงครบในแถวเดียว */}
      <div className={`${PANEL} p-4`}>
        <div className="mb-3 text-[13px] font-semibold text-text">สถานะงานอนุมัติ (Funnel)</div>
        <Funnel stages={d.funnel.map((s) => ({ ...s, href: "/requests" }))} />
      </div>

      {/* Row A: trend · form dist */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 text-[13px] font-semibold text-text">แนวโน้มคำขอรายวัน</div>
          <DualTrend points={d.dailyTrend.map((x) => ({ label: x.day.slice(8), count: x.count, value: x.value }))} />
          <div className="mt-1 flex gap-4 text-[11px] text-muted"><span>▮ จำนวนคำขอ</span><span style={{ color: "#6366f1" }}>— มูลค่า</span></div>
        </div>
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 text-[13px] font-semibold text-text">คำขอแยกตามประเภทฟอร์ม</div>
          {d.formDist.length ? (
            <Donut centerValue={fmtNum(d.formDist.reduce((s, x) => s + x.total, 0))} centerLabel="รายการ"
              items={d.formDist.map((x, i) => ({ label: x.name, value: x.total, color: PALETTE[i % PALETTE.length] }))} />
          ) : <Empty>ยังไม่มีคำขอในช่วงนี้</Empty>}
        </div>
      </div>

      {/* Row B: value by dept · monthly value · SLA */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`${PANEL} p-4`}>
          <div className="mb-3 text-[13px] font-semibold text-text">มูลค่าแยกตามแผนก</div>
          <HBar items={d.valueByDept.map((x) => ({ label: x.dept, value: x.value }))} />
        </div>
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 text-[13px] font-semibold text-text">มูลค่ารายเดือน</div>
          <LineChart points={d.monthlyValue.map((x) => ({ label: x.month.slice(5), a: x.total, b: x.approved }))} />
          <div className="mt-1 flex gap-4 text-[11px] text-muted"><span style={{ color: "#3b82f6" }}>— มูลค่าทั้งหมด</span><span style={{ color: "#8b5cf6" }}>— อนุมัติแล้ว</span></div>
        </div>
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 text-[13px] font-semibold text-text">สถานะ SLA</div>
          {d.sla.total ? (
            <Donut size={130} centerValue={`${Math.round((d.sla.within / d.sla.total) * 100)}%`} centerLabel="ในกำหนด"
              items={[
                { label: "ภายในกำหนด", value: d.sla.within, color: "#10b981" },
                { label: "ใกล้เกินกำหนด", value: d.sla.atRisk, color: "#f59e0b" },
                { label: "เกินกำหนด", value: d.sla.overdue, color: "#ef4444" },
              ]} />
          ) : <Empty>ไม่มีคำขอที่รออนุมัติ</Empty>}
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1.5 text-[11.5px] font-medium text-text-soft">อายุงานค้างอนุมัติ</div>
            <AgingBar buckets={d.aging} />
          </div>
        </div>
      </div>

      {/* Row C: queue · recent */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text">งานรอฉันอนุมัติ ({d.queue.length})</span>
            <Link href="/requests?tab=awaiting" className="text-[12px] text-primary hover:underline">ดูทั้งหมด →</Link>
          </div>
          {d.queue.length === 0 ? <Empty>ยังไม่มีเอกสารรอคุณอนุมัติ 🎉</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-[11px] text-muted">
                  <th className="pb-2 font-medium">ความสำคัญ</th><th className="pb-2 font-medium">เลขที่/หัวข้อ</th>
                  <th className="pb-2 font-medium">ผู้ขอ</th><th className="pb-2 text-right font-medium">จำนวนเงิน</th>
                  <th className="pb-2 font-medium">รอมานาน</th><th className="pb-2"></th>
                </tr></thead>
                <tbody>
                  {d.queue.slice(0, 7).map((q) => (
                    <tr key={q.id} className="border-t border-border">
                      <td className="py-2"><span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${PRI[q.priority].cls}`}>{PRI[q.priority].label}</span></td>
                      <td className="py-2"><Link href={`/requests/${q.id}`} className="font-medium text-primary hover:underline">{q.docNo}</Link><div className="max-w-[180px] truncate text-muted">{q.title}</div></td>
                      <td className="py-2 text-text-soft">{q.requester}</td>
                      <td className="py-2 text-right tabular-nums text-text-soft">{q.amount ? baht(q.amount) : "—"}</td>
                      <td className="py-2 text-text-soft">{waitLabel(q.waitingHours)}</td>
                      <td className="py-2 text-right"><Link href={`/requests/${q.id}`} className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-white">ดู/อนุมัติ</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className={`${PANEL} p-4`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text">คำขอล่าสุด</span>
            <Link href="/requests" className="text-[12px] text-primary hover:underline">ดูทั้งหมด →</Link>
          </div>
          {d.recent.length === 0 ? <Empty>ยังไม่มีคำขอ</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-[11px] text-muted">
                  <th className="pb-2 font-medium">เลขที่/หัวข้อ</th><th className="pb-2 font-medium">ประเภท</th>
                  <th className="pb-2 text-right font-medium">จำนวนเงิน</th><th className="pb-2 font-medium">สถานะ</th><th className="pb-2 font-medium">อัปเดต</th>
                </tr></thead>
                <tbody>
                  {d.recent.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2"><Link href={`/requests/${r.id}`} className="font-medium text-primary hover:underline">{r.docNo}</Link><div className="max-w-[160px] truncate text-muted">{r.title}</div></td>
                      <td className="py-2 text-text-soft">{r.template}</td>
                      <td className="py-2 text-right tabular-nums text-text-soft">{r.amount ? baht(r.amount) : "—"}</td>
                      <td className="py-2"><StatusBadge status={r.status as any} /></td>
                      <td className="py-2 text-muted">{dt(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Data warnings */}
      {d.dataWarnings.length > 0 && (
        <div className="rounded-lg bg-surface-2 px-4 py-2.5 text-[11.5px] text-muted">
          ℹ️ {d.dataWarnings.join(" · ")}
        </div>
      )}
    </div>
  );
}
