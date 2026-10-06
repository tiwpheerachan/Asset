import type { Asset, DepPolicy, Proration } from './types';

export interface ScheduleRow {
  period: string; // YYYY-MM
  opening: number;
  depreciation: number;
  accumulated: number;
  closing: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const totalCost = (a: Pick<Asset, 'originalCost' | 'additionalCost'>) => r2(a.originalCost + a.additionalCost);

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthsDiff(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

function daysInMonth(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Asset is eligible for depreciation if active-ish and has a ready-for-use date. */
export function isDepreciable(a: Asset): boolean {
  return (
    !!a.readyDate &&
    ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'].includes(a.status) &&
    a.lifeMonths > 0 &&
    totalCost(a) > a.residual
  );
}

/**
 * Straight-line schedule.
 *  FULL_MONTH  — full month charge in the ready-for-use month.
 *  NEXT_MONTH  — first charge in the month after ready-for-use.
 *  ACTUAL_DAYS — annual × days/365; first month prorated by remaining days.
 * Final period absorbs rounding so closing NBV == residual.
 */
export function buildSchedule(a: Asset, proration: Proration = 'FULL_MONTH'): ScheduleRow[] {
  if (!a.readyDate || a.lifeMonths <= 0) return [];
  const cost = totalCost(a);
  const base = r2(cost - a.residual);
  if (base <= 0) return [];
  const rows: ScheduleRow[] = [];
  let accum = 0;
  const readyPeriod = periodOf(a.readyDate);
  const annual = (base / a.lifeMonths) * 12;
  const monthly = r2(base / a.lifeMonths);

  if (proration === 'ACTUAL_DAYS') {
    const readyDay = Number(a.readyDate.slice(8, 10));
    let p = readyPeriod;
    let guard = 0;
    while (accum < base - 0.005 && guard < a.lifeMonths + 2) {
      const dim = daysInMonth(p);
      const days = p === readyPeriod ? dim - readyDay + 1 : dim;
      let dep = r2((annual * days) / 365);
      if (accum + dep > base || guard === a.lifeMonths + 1) dep = r2(base - accum);
      const opening = r2(cost - accum);
      accum = r2(accum + dep);
      rows.push({ period: p, opening, depreciation: dep, accumulated: accum, closing: r2(cost - accum) });
      p = addMonths(p, 1);
      guard++;
    }
    return rows;
  }

  const start = proration === 'NEXT_MONTH' ? addMonths(readyPeriod, 1) : readyPeriod;
  for (let i = 0; i < a.lifeMonths; i++) {
    const p = addMonths(start, i);
    const dep = i === a.lifeMonths - 1 ? r2(base - accum) : monthly;
    const opening = r2(cost - accum);
    accum = r2(accum + dep);
    rows.push({ period: p, opening, depreciation: dep, accumulated: accum, closing: r2(cost - accum) });
  }
  return rows;
}

export interface Valuation {
  cost: number;
  accumulated: number;
  nbv: number;
  periodDep: number;
  monthsUsed: number;
  remainingMonths: number;
  fullyDepreciated: boolean;
  endPeriod: string | null;
}

export function valuate(a: Asset, asOf: string, proration: Proration = 'FULL_MONTH'): Valuation {
  const cost = totalCost(a);
  if (!a.readyDate || !isDepreciable(a)) {
    return { cost, accumulated: 0, nbv: cost, periodDep: 0, monthsUsed: 0, remainingMonths: a.lifeMonths, fullyDepreciated: false, endPeriod: null };
  }
  const sched = buildSchedule(a, proration);
  let accumulated = 0;
  let periodDep = 0;
  let used = 0;
  for (const row of sched) {
    if (row.period > asOf) break;
    accumulated = row.accumulated;
    used++;
    if (row.period === asOf) periodDep = row.depreciation;
  }
  const end = sched.length ? sched[sched.length - 1].period : null;
  return {
    cost,
    accumulated,
    nbv: r2(cost - accumulated),
    periodDep,
    monthsUsed: used,
    remainingMonths: Math.max(0, sched.length - used),
    fullyDepreciated: sched.length > 0 && used >= sched.length,
    endPeriod: end,
  };
}

export function prorationFor(a: Asset, policies: DepPolicy[]): Proration {
  return policies.find((p) => p.id === a.policyId)?.proration ?? 'FULL_MONTH';
}

/** Validation errors that block a depreciation run for an asset. */
export function depIssues(a: Asset, policies: DepPolicy[]): string[] {
  const issues: string[] = [];
  if (!['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED'].includes(a.status)) return issues;
  if (!a.policyId || !policies.some((p) => p.id === a.policyId && p.active)) issues.push('MISSING_POLICY');
  if (!a.readyDate) issues.push('INVALID_READY_DATE');
  else if (a.acquisitionDate && a.readyDate < a.acquisitionDate) issues.push('READY_BEFORE_ACQ');
  if (a.lifeMonths <= 0) issues.push('INVALID_LIFE');
  if (a.residual < 0 || a.residual >= totalCost(a)) issues.push('INVALID_RESIDUAL');
  return issues;
}
