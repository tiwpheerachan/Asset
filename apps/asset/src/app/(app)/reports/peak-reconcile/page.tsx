'use client';

import { useMemo } from 'react';
import { Scale, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { totalCost } from '@/lib/depreciation';
import { Card, CardHeader, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import tbJson from '@/data/peak/peak-trial-balance.json';

type TB = { period: string; pulledAt: string; accounts: { code: string; name: string; debit: number; credit: number }[] };
const tb = tbJson as unknown as TB;

const LIVE = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'TEMPORARILY_UNUSED', 'DRAFT', 'PENDING_REVIEW', 'DISPOSAL_PENDING'];
const EPS = 1; // ส่วนต่างที่ยอมรับได้ (บาท)

export default function PeakReconcilePage() {
  const { money, num } = useI18n();
  const { state } = useStore();

  const data = useMemo(() => {
    const acctMap = new Map(tb.accounts.map((a) => [a.code, a]));
    const reg = new Map<string, { cost: number; accum: number; count: number }>();
    for (const a of state.assets) {
      if (!LIVE.includes(a.status)) continue;
      const code = (a.source?.glAccountCode || a.legacy?.assetAccount || '').trim();
      if (!code) continue;
      const cost = totalCost(a);
      const accum = a.legacy?.closingAccum ?? 0; // ยอดยกมาจาก PEAK ณ วันขึ้นทะเบียน
      const e = reg.get(code) ?? { cost: 0, accum: 0, count: 0 };
      e.cost += cost; e.accum += accum; e.count++;
      reg.set(code, e);
    }
    const costCodes = new Set<string>([...tb.accounts.filter((a) => /^1241/.test(a.code)).map((a) => a.code), ...reg.keys()]);
    const rows = [...costCodes].sort().map((code) => {
      const accumCode = code.replace(/^1241/, '1242');
      const pc = acctMap.get(code); const pa = acctMap.get(accumCode);
      const peakCost = (pc?.debit ?? 0) - (pc?.credit ?? 0);
      const peakAccum = (pa?.credit ?? 0) - (pa?.debit ?? 0);
      const r = reg.get(code) ?? { cost: 0, accum: 0, count: 0 };
      return {
        code, name: pc?.name ?? code, count: r.count,
        peakCost, regCost: r.cost, dCost: peakCost - r.cost,
        peakAccum, regAccum: r.accum, dAccum: peakAccum - r.accum,
        peakNbv: peakCost - peakAccum, regNbv: r.cost - r.accum, dNbv: (peakCost - peakAccum) - (r.cost - r.accum),
      };
    });
    const tot = rows.reduce((s, x) => ({
      count: s.count + x.count, peakCost: s.peakCost + x.peakCost, regCost: s.regCost + x.regCost,
      peakAccum: s.peakAccum + x.peakAccum, regAccum: s.regAccum + x.regAccum,
      peakNbv: s.peakNbv + x.peakNbv, regNbv: s.regNbv + x.regNbv,
    }), { count: 0, peakCost: 0, regCost: 0, peakAccum: 0, regAccum: 0, peakNbv: 0, regNbv: 0 });
    const maxDiff = Math.max(...rows.map((x) => Math.abs(x.dCost)), ...rows.map((x) => Math.abs(x.dNbv)), 0);
    return { rows, tot, maxDiff };
  }, [state.assets]);

  const asOf = (tb.period.split('..')[1] || tb.period).trim();
  const matched = data.maxDiff <= EPS;
  const diffCell = (v: number) => <span className={cx('tabular-nums', Math.abs(v) > EPS ? 'font-semibold text-rose-600' : 'text-emerald-600')}>{Math.abs(v) <= EPS ? '✓' : money(v)}</span>;

  return (
    <>
      <PageHeader title="กระทบยอด PEAK ↔ ทะเบียนทรัพย์สิน" sub={`เทียบราคาทุน / ค่าเสื่อมสะสม / มูลค่าคงเหลือ รายบัญชี · งวด ${tb.period} · ดึง PEAK ${(tb.pulledAt || '').slice(0, 10)}`} />

      <div className={cx('mb-4 flex items-start gap-3 rounded-2xl border p-4 text-sm', matched ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60')}>
        {matched ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />}
        <div>
          <p className="font-medium text-ink">{matched ? 'ตรงกับ PEAK' : 'มีส่วนต่างกับ PEAK'}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            ทะเบียน {num(data.tot.count)} ชิ้น · ทุนรวม {money(data.tot.regCost)} (PEAK {money(data.tot.peakCost)}) · NBV รวม {money(data.tot.regNbv)} (PEAK {money(data.tot.peakNbv)})
            {!matched && ` · ส่วนต่างสูงสุด ${money(data.maxDiff)}`}
            {' '}· ค่าเสื่อมสะสมใช้ยอดยกมาจาก PEAK ณ วันขึ้นทะเบียน (ค่าเสื่อมงวดถัดไปคิดในระบบ ดูหน้าค่าเสื่อมราคา)
          </p>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader title="รายบัญชีสินทรัพย์ถาวร (1241xx)" sub={`ณ ${asOf} · ✓ = ตรง (ส่วนต่าง ≤ ${EPS} บาท)`} />
        <Table className="scroll-thin max-h-[68vh] overflow-y-auto">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th>บัญชี</Th><Th>ชื่อบัญชี</Th><Th right>ชิ้น</Th>
              <Th right>ทุน (PEAK)</Th><Th right>ทุน (ทะเบียน)</Th><Th right>ต่าง</Th>
              <Th right>ค่าเสื่อมสะสม (PEAK)</Th><Th right>สะสม (ทะเบียน)</Th><Th right>ต่าง</Th>
              <Th right>NBV (PEAK)</Th><Th right>NBV (ทะเบียน)</Th><Th right>ต่าง</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((x) => (
              <tr key={x.code}>
                <Td mono>{x.code}</Td><Td className="min-w-[180px]">{x.name}</Td><Td right>{num(x.count)}</Td>
                <Td right>{money(x.peakCost)}</Td><Td right>{money(x.regCost)}</Td><Td right>{diffCell(x.dCost)}</Td>
                <Td right>{money(x.peakAccum)}</Td><Td right>{money(x.regAccum)}</Td><Td right>{diffCell(x.dAccum)}</Td>
                <Td right>{money(x.peakNbv)}</Td><Td right>{money(x.regNbv)}</Td><Td right>{diffCell(x.dNbv)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-[#F3F5F8] font-semibold text-ink">
              <td className="border-t border-line px-3 py-2 text-[13px]" colSpan={2}>รวม</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{num(data.tot.count)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.peakCost)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.regCost)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px]">{diffCell(data.tot.peakCost - data.tot.regCost)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.peakAccum)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.regAccum)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px]">{diffCell(data.tot.peakAccum - data.tot.regAccum)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.peakNbv)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px] tabular-nums">{money(data.tot.regNbv)}</td>
              <td className="border-t border-line px-3 py-2 text-right text-[13px]">{diffCell(data.tot.peakNbv - data.tot.regNbv)}</td>
            </tr>
          </tfoot>
        </Table>
        <div className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] text-ink-4"><Scale size={13} /> เทียบกับงบทดลอง PEAK (อ่านอย่างเดียว) · ไม่มีการเขียนกลับไป PEAK</div>
      </Card>
    </>
  );
}
