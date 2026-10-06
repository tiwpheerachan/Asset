'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Button, cx } from '@/components/ui';
import { LangSwitch } from '@/components/shell';

export default function LoginPage() {
  const { t } = useI18n();
  const { state, signIn } = useStore();
  const router = useRouter();
  const [sel, setSel] = useState(state.users[0]?.id);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex justify-end p-4">
        <LangSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-700 text-[14px] font-bold text-white">SHD</div>
            <div>
              <h1 className="text-[20px] font-semibold text-ink">{t('login.title')}</h1>
              <p className="text-[13px] text-ink-3">{t('login.subtitle')}</p>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-5 shadow-card">
            <p className="mb-3 text-[12.5px] font-medium text-ink-3">{t('login.chooseRole')}</p>
            <div className="space-y-2">
              {state.users.map((u) => (
                <label
                  key={u.id}
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
                    sel === u.id ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-200' : 'border-line hover:bg-canvas',
                  )}
                >
                  <input type="radio" name="u" className="mt-1 accent-brand-600" checked={sel === u.id} onChange={() => setSel(u.id)} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">{t(`role.${u.role}`)}</span>
                    <span className="block text-[12.5px] text-ink-3">{t(`role.${u.role}_desc`)}</span>
                    <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">{u.email}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                if (!sel) return;
                signIn(sel);
                router.push('/');
              }}
            >
              {t('login.signIn')}
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-3">
            <ShieldCheck size={14} /> {t('login.sso')}
          </p>
        </div>
      </div>
    </div>
  );
}
