'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { useI18n } from '@/lib/i18n';

export const C = {
  primary: '#1F4A85',
  primarySoft: '#B7CBE7',
  grid: '#EEF0F3',
  axis: '#98A2B3',
  forecast: '#DCE6F4',
};

/** Horizontal bar list — clean, formal alternative to a chart for ranked categorical values. */
export function BarList({
  rows,
  format,
  secondary,
  secondaryLabel,
  primaryLabel,
}: {
  rows: { label: string; value: number; sub?: number; hint?: string }[];
  format: (n: number) => string;
  secondary?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {secondary && (
        <div className="flex items-center gap-4 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: C.primary }} /> {primaryLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: C.primarySoft }} /> {secondaryLabel}
          </span>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="shrink-0 tabular-nums text-ink">
              {format(r.value)}
              {r.hint && <span className="ml-1.5 text-ink-4">{r.hint}</span>}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-sm bg-canvas">
            <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: secondary ? C.primarySoft : C.primary }} />
            {secondary && r.sub !== undefined && (
              <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(r.sub / max) * 100}%`, background: C.primary }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DepTrendChart({ data, currentIdx }: { data: { period: string; label: string; value: number }[]; currentIdx: number }) {
  const { money } = useI18n();
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} />
          <YAxis
            tick={{ fontSize: 11, fill: C.axis }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: '#F5F6F8' }}
            contentStyle={{ borderRadius: 6, border: '1px solid #E4E7EC', fontSize: 12, boxShadow: '0 8px 24px -8px rgba(16,24,40,.18)' }}
            formatter={(v: number) => [money(v), '']}
            separator=""
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={34}>
            {data.map((_, i) => (
              <Cell key={i} fill={i > currentIdx ? C.forecast : i === currentIdx ? C.primary : '#5A7DB0'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
