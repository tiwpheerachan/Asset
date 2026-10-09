import Link from "next/link";
import type { ReactNode } from "react";

/* ปุ่มลัด/กราฟของ Dashboard — presentational (SVG/มาร์กอัป) เรนเดอร์ฝั่ง server ได้ */

const fmt = (n: number) => Math.round(n).toLocaleString("th-TH");
const fmtK = (n: number) => (Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : Math.abs(n) >= 1000 ? Math.round(n / 1000) + "K" : String(Math.round(n)));

export const PALETTE = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899", "#14b8a6"];

/* การ์ดฐาน — ขอบมน 16px + ring บาง + เงานุ่ม ให้ดูพรีเมียมแบบ Linear/Stripe */
export const PANEL = "rounded-2xl bg-surface ring-1 ring-border/70 shadow-[0_1px_2px_rgba(16,24,40,.04),0_1px_3px_rgba(16,24,40,.06)]";

type Tone = "slate" | "ink" | "primary" | "emerald" | "amber" | "rose" | "violet" | "blue" | "yellow";
const TONE: Record<Tone, { text: string; chip: string }> = {
  slate: { text: "text-text", chip: "bg-slate-100 text-slate-500" },
  ink: { text: "text-text", chip: "bg-slate-100 text-slate-500" },
  primary: { text: "text-primary", chip: "bg-primary-soft text-primary" },
  emerald: { text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-600" },
  amber: { text: "text-amber-600", chip: "bg-amber-50 text-amber-500" },
  rose: { text: "text-rose-600", chip: "bg-rose-50 text-rose-500" },
  violet: { text: "text-violet-600", chip: "bg-violet-50 text-violet-500" },
  blue: { text: "text-blue-600", chip: "bg-blue-50 text-blue-500" },
  yellow: { text: "text-yellow-700", chip: "bg-yellow-50 text-yellow-600" },
};

/* ---------- KPI card ---------- */
export function KpiCard({
  label, value, sub, delta, tone = "slate", icon, href,
}: {
  label: string; value: ReactNode; sub?: string; delta?: number | null;
  tone?: Tone; icon?: ReactNode; href?: string;
}) {
  const T = TONE[tone] ?? TONE.slate;
  const body = (
    <div className={`${PANEL} h-full p-4`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] text-muted">{label}</span>
        {icon && <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${T.chip}`}>{icon}</span>}
      </div>
      <div className={`mt-2.5 text-[27px] font-bold leading-none tracking-tight ${T.text}`}>{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
        {delta != null && Number.isFinite(delta) && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
        {sub && <span className="text-muted">{sub}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

/* ---------- Attention action card ---------- */
export function AttentionCard({
  count, label, href, tone, icon,
}: { count: number; label: string; href: string; tone: "rose" | "amber" | "yellow" | "blue" | "violet" | "emerald"; icon?: ReactNode }) {
  const T = TONE[tone];
  const dim = count === 0;
  return (
    <Link href={href} className={`group flex items-start gap-3 p-3.5 transition hover:-translate-y-0.5 hover:shadow-md ${PANEL} ${dim ? "opacity-75" : ""}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${T.chip}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[24px] font-bold leading-none ${dim ? "text-text-soft" : T.text}`}>{count}</div>
        <div className="mt-1 text-[12px] leading-tight text-text-soft">{label}</div>
        <div className="mt-0.5 text-[11px] text-primary opacity-60 transition group-hover:opacity-100">ดูรายการ ›</div>
      </div>
    </Link>
  );
}

/* ---------- Donut ---------- */
export function Donut({
  items, centerLabel, centerValue, size = 150,
}: { items: { label: string; value: number; color: string }[]; centerLabel?: string; centerValue?: string; size?: number }) {
  const total = items.reduce((s, x) => s + x.value, 0);
  const r = 54, c = 2 * Math.PI * r, cx = 80, cy = 80;
  let off = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 160 160" width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0f4" strokeWidth="18" />
        {total > 0 && items.map((it, i) => {
          const len = (it.value / total) * c;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={it.color} strokeWidth="18"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
          );
          off += len;
          return el;
        })}
        {centerValue && <text x={cx} y={cy - 2} textAnchor="middle" fill="#101828" style={{ fontSize: 22, fontWeight: 700 }}>{centerValue}</text>}
        {centerLabel && <text x={cx} y={cy + 16} textAnchor="middle" fill="#98a2b3" style={{ fontSize: 10 }}>{centerLabel}</text>}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-text-soft">{it.label}</span>
            <span className="tabular-nums text-muted">{fmt(it.value)}{total > 0 ? ` (${Math.round((it.value / total) * 100)}%)` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Horizontal bars ---------- */
export function HBar({ items, unit = "฿" }: { items: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  if (items.length === 0) return <Empty>ยังไม่มีข้อมูลมูลค่า</Empty>;
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[100px_1fr_auto] items-center gap-2 text-[12px]">
          <span className="truncate text-text-soft">{it.label}</span>
          <span className="h-2.5 rounded-full bg-primary/15">
            <span className="block h-2.5 rounded-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="tabular-nums text-text-soft">{unit} {fmt(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Funnel ---------- */
export function Funnel({ stages }: { stages: { key: string; label: string; count: number; href?: string }[] }) {
  const first = Math.max(1, stages[0]?.count ?? 1);
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const col = PALETTE[i % PALETTE.length];
        const conv = Math.round((s.count / first) * 100); // แปลงจากต้นทาง
        const fill = Math.max(6, Math.round((s.count / first) * 100)); // ความสูงแท่ง = สัดส่วนที่เหลือ → เห็นเป็นกรวย
        const inner = (
          <div className="relative flex h-full min-w-[104px] flex-1 flex-col rounded-xl p-3 ring-1 ring-border/70 transition group-hover:ring-primary/30"
            style={{ background: `linear-gradient(180deg, ${col}1f, ${col}08)` }}>
            <div className="text-[22px] font-bold leading-none" style={{ color: col }}>{fmt(s.count)}</div>
            <div className="mt-1 text-[11px] leading-tight text-text-soft">{s.label}</div>
            <div className="mt-auto pt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div className="h-full rounded-full" style={{ width: `${fill}%`, background: col }} />
              </div>
              {i > 0 && <div className="mt-1 text-[10px] text-muted">{conv}% จากต้นทาง</div>}
            </div>
          </div>
        );
        return (
          <div key={s.key} className="group flex flex-1 items-center">
            {s.href ? <Link href={s.href} className="flex-1">{inner}</Link> : <div className="flex-1">{inner}</div>}
            {i < stages.length - 1 && <span className="mx-0.5 shrink-0 text-[14px] text-muted">›</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Dual-axis trend (bars=count, line=value) ---------- */
export function DualTrend({ points }: { points: { label: string; count: number; value: number }[] }) {
  if (points.length === 0) return <Empty>ยังไม่มีข้อมูลเพียงพอสำหรับแนวโน้ม</Empty>;
  const W = 640, H = 220, pad = 28;
  const maxC = Math.max(1, ...points.map((p) => p.count));
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const bw = (W - pad * 2) / n * 0.55;
  const x = (i: number) => pad + ((W - pad * 2) / n) * (i + 0.5);
  const yC = (v: number) => H - pad - (v / maxC) * (H - pad * 2);
  const yV = (v: number) => H - pad - (v / maxV) * (H - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yV(p.value).toFixed(1)}`).join(" ");
  const step = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} stroke="#eef0f4" />
      ))}
      {points.map((p, i) => (
        <rect key={i} x={x(i) - bw / 2} y={yC(p.count)} width={bw} height={H - pad - yC(p.count)} rx={2} fill="#bfdbfe" />
      ))}
      <path d={line} fill="none" stroke="#6366f1" strokeWidth={2} />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={yV(p.value)} r={2.5} fill="#6366f1" />)}
      {points.map((p, i) => i % step === 0 ? (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 9 }} fill="#98a2b3">{p.label}</text>
      ) : null)}
    </svg>
  );
}

/* ---------- Two-line chart (monthly value) ---------- */
export function LineChart({ points }: { points: { label: string; a: number; b: number }[] }) {
  if (points.length < 2) return <Empty>ยังไม่มีข้อมูลเพียงพอสำหรับแนวโน้ม</Empty>;
  const W = 640, H = 220, pad = 30;
  const max = Math.max(1, ...points.map((p) => Math.max(p.a, p.b)));
  const n = points.length;
  const x = (i: number) => pad + ((W - pad * 2) / (n - 1)) * i;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (key: "a" | "b") => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const step = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} stroke="#eef0f4" />
      ))}
      {[0.5, 1].map((g) => (
        <text key={g} x={6} y={H - pad - g * (H - pad * 2) + 3} style={{ fontSize: 9 }} fill="#98a2b3">{fmtK(max * g)}</text>
      ))}
      <path d={path("a")} fill="none" stroke="#3b82f6" strokeWidth={2} />
      <path d={path("b")} fill="none" stroke="#8b5cf6" strokeWidth={2} />
      {points.map((p, i) => i % step === 0 ? (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 9 }} fill="#98a2b3">{p.label}</text>
      ) : null)}
    </svg>
  );
}

/* ---------- Stacked aging bar ---------- */
export function AgingBar({ buckets }: { buckets: { label: string; count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const colors = ["#10b981", "#f59e0b", "#f97316", "#ef4444", "#b91c1c"];
  if (total === 0) return <Empty>ไม่มีงานค้างอนุมัติ 🎉</Empty>;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {buckets.map((b, i) => b.count > 0 ? <span key={i} style={{ width: `${(b.count / total) * 100}%`, background: colors[i] }} /> : null)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {buckets.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5 text-text-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: colors[i] }} /> {b.label} วัน · {b.count}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-[120px] items-center justify-center text-center text-[12.5px] text-muted">{children}</div>;
}

export { fmt as fmtNum, fmtK };
