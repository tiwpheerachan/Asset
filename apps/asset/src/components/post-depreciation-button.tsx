'use client';

import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './ui';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { Asset } from '@/lib/types';
import type { Valuation } from '@/lib/depreciation';

// ส่งค่าเสื่อมของงวดกลับเข้า GL ของ ONEBOOK — เฉพาะทรัพย์สินที่มาจากบัญชี (มี glAccountCode/glCompanyId)
export function PostDepreciationButton({
  period, rows, disabled,
}: {
  period: string;
  rows: { a: Asset; v: Valuation }[];
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { setRunStatus } = useStore();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  const groups = new Map<string, { asset_account_code: string; amount: number; description: string }[]>();
  for (const { a, v } of rows) {
    const code = a.source.glAccountCode;
    const comp = a.source.glCompanyId;
    if (!code || !comp || v.periodDep <= 0) continue;
    const arr = groups.get(comp) || [];
    arr.push({ asset_account_code: code, amount: v.periodDep, description: `${a.code} ${a.nameTh}` });
    groups.set(comp, arr);
  }
  const n = [...groups.values()].reduce((s, l) => s + l.length, 0);

  function run() {
    setMsg('');
    start(async () => {
      try {
        let posted = 0;
        let reused = false;
        for (const [companyId, lines] of groups) {
          const res = await fetch('/api/onebook/post-depreciation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: companyId, period_end: `${period}-01`, lines }),
          });
          const data = await res.json();
          if (!res.ok) { setMsg(data.error || t('dep.postFailed')); return; }
          posted += data.count ?? 0;
          if (data.reused) reused = true;
        }
        // ส่งเข้า ONEBOOK สำเร็จ → ปิดลูป: ตั้งสถานะรอบค่าเสื่อมเป็น POSTED
        setRunStatus(period, 'POSTED');
        setMsg(reused ? t('dep.postedAlready') : t('dep.postedOk').replace('{n}', String(posted)));
      } catch (e) {
        setMsg(String((e as Error)?.message || e));
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-ink-3">{msg}</span>}
      <Button icon={<Upload size={15} />} disabled={disabled || pending || n === 0} onClick={run}>
        {t('dep.postToOnebook')}{n > 0 ? ` (${n})` : ''}
      </Button>
    </div>
  );
}
