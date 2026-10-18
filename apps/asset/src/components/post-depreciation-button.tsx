'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { Badge, Button, Drawer, Notice, Table, Td, Th } from './ui';
import { useI18n } from '@/lib/i18n';
import { useLookups } from '@/lib/hooks';
import { useStore } from '@/lib/store';
import type { DepLine } from '@/lib/onebook';
import type { DepRunLine } from '@/lib/types';

// ส่งค่าเสื่อมของงวดกลับเข้า GL ของ ONEBOOK — เฉพาะทรัพย์สินที่มาจากบัญชี (มี glAccountCode/glCompanyId)
// ใช้ snapshot (DepRunLine[]) ที่ตรึงไว้ ณ วันที่ล็อก — ไม่คำนวณสดใหม่ตอนส่ง
export function PostDepreciationButton({
  period, lines, disabled, alreadyPosted,
}: {
  period: string;
  lines: DepRunLine[];
  disabled?: boolean;
  alreadyPosted?: boolean;
}) {
  const { t, money, num } = useI18n();
  const lk = useLookups();
  const { setRunStatus } = useStore();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  // แยกรายการเป็น "ส่งได้" (มีรหัสบัญชี + บริษัท) กับ "ส่งไม่ได้"
  const { sendable, blocked, byCompany, sendAmt, blockAmt } = useMemo(() => {
    const sendable: DepRunLine[] = [];
    const blocked: DepRunLine[] = [];
    for (const l of lines) {
      if (l.periodDep <= 0) continue;
      if (l.glAccountCode && l.glCompanyId) sendable.push(l);
      else blocked.push(l);
    }
    const byCompany = new Map<string, DepLine[]>();
    for (const l of sendable) {
      const arr = byCompany.get(l.glCompanyId!) || [];
      arr.push({
        asset_account_code: l.glAccountCode!,
        amount: l.periodDep,
        description: `${l.assetCode} ${l.assetName}`,
        expense_account_code: l.expenseAccountCode ?? null,
        accum_account_code: l.accumAccountCode ?? null,
      });
      byCompany.set(l.glCompanyId!, arr);
    }
    return {
      sendable, blocked, byCompany,
      sendAmt: sendable.reduce((s, l) => s + l.periodDep, 0),
      blockAmt: blocked.reduce((s, l) => s + l.periodDep, 0),
    };
  }, [lines]);

  function run() {
    setMsg('');
    start(async () => {
      try {
        let posted = 0;
        let reused = false;
        for (const [companyId, ls] of byCompany) {
          const res = await fetch('/api/onebook/post-depreciation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: companyId, period_end: `${period}-01`, lines: ls }),
          });
          const data = await res.json();
          if (!res.ok) { setMsg(data.error || t('dep.postFailed')); return; }
          posted += data.count ?? 0;
          if (data.reused) reused = true;
        }
        // ส่งเข้า ONEBOOK สำเร็จ → ปิดลูป: ตั้งสถานะรอบค่าเสื่อมเป็น POSTED
        setRunStatus(period, 'POSTED');
        setDone(true);
        setMsg(reused ? t('dep.postedAlready') : t('dep.postedOk').replace('{n}', String(posted)));
      } catch (e) {
        setMsg(String((e as Error)?.message || e));
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {msg && <span className={done ? 'text-[12px] text-emerald-700' : 'text-[12px] text-ink-3'}>{msg}</span>}
        <Button icon={<Upload size={15} />} disabled={disabled || sendable.length === 0} onClick={() => { setMsg(''); setDone(false); setOpen(true); }}>
          {t('dep.postToOnebook')}{sendable.length > 0 ? ` (${sendable.length})` : ''}
        </Button>
      </div>

      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          title={t('dep.postReview')}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>{t('common.close')}</Button>
              {!done && (
                <Button variant="primary" icon={<Upload size={15} />} disabled={pending || sendable.length === 0} onClick={run}>
                  {t('dep.postConfirm')} ({num(sendable.length)})
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-4">
            {alreadyPosted && <Notice tone="amber" icon={<AlertTriangle size={14} />}>{t('dep.postedAlready')}</Notice>}
            {done && <Notice tone="green" icon={<CheckCircle2 size={14} />}>{msg}</Notice>}

            {/* สรุปสองกล่อง: พร้อมส่ง / ส่งไม่ได้ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
                <div className="text-[11.5px] text-emerald-800">{t('dep.sendable')}</div>
                <div className="mt-1 text-[16px] font-semibold tabular-nums text-emerald-800">{num(sendable.length)} · {money(sendAmt)}</div>
              </div>
              <div className={blocked.length ? 'rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2.5' : 'rounded-md border border-line px-3 py-2.5'}>
                <div className="text-[11.5px] text-ink-3">{t('dep.cantSend')}</div>
                <div className={'mt-1 text-[16px] font-semibold tabular-nums ' + (blocked.length ? 'text-amber-800' : 'text-ink')}>{num(blocked.length)} · {money(blockAmt)}</div>
              </div>
            </div>

            {/* แยกตามบริษัท (ONEBOOK ลง GL ทีละบริษัท) */}
            <div className="rounded-md border border-line">
              <div className="border-b border-line px-3 py-2 text-[13px] font-semibold text-ink">{t('dep.byCompany')}</div>
              <Table>
                <thead><tr><Th>{t('field.company')}</Th><Th right>{t('common.count')}</Th><Th right>{t('field.periodDep')}</Th></tr></thead>
                <tbody>
                  {[...byCompany.entries()].map(([cid, ls]) => (
                    <tr key={cid}>
                      <Td>{lk.company(cid) || cid}</Td>
                      <Td right>{ls.length}</Td>
                      <Td right className="font-medium text-ink">{money(ls.reduce((s, l) => s + l.amount, 0))}</Td>
                    </tr>
                  ))}
                  {byCompany.size === 0 && <tr><Td className="text-ink-3" >{t('dep.nothingToSend')}</Td><Td /><Td /></tr>}
                </tbody>
              </Table>
            </div>

            {/* รายการที่ส่งไม่ได้ + เหตุผล */}
            {blocked.length > 0 && (
              <div className="rounded-md border border-amber-200">
                <div className="border-b border-amber-200 bg-amber-50/40 px-3 py-2 text-[13px] font-semibold text-amber-900">{t('dep.cantSend')} — {t('dep.noGlReason')}</div>
                <Table className="max-h-[260px] overflow-y-auto">
                  <thead><tr><Th>{t('field.assetCode')}</Th><Th>{t('field.assetName')}</Th><Th right>{t('field.periodDep')}</Th><Th /></tr></thead>
                  <tbody>
                    {blocked.slice(0, 300).map((l) => (
                      <tr key={l.assetId}>
                        <Td mono>{l.assetCode}</Td>
                        <Td className="max-w-[220px] truncate">{l.assetName}</Td>
                        <Td right>{money(l.periodDep)}</Td>
                        <Td><Badge tone="amber">{l.glCompanyId ? t('dep.noGlAccount') : t('dep.noGlCompany')}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}
