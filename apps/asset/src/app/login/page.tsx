'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boxes, KeyRound, ScanLine, ShieldCheck, TrendingDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Button, cx } from '@/components/ui';
import { LangSwitch } from '@/components/shell';

export default function LoginPage() {
  const { t } = useI18n();
  const { state, signIn } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [sel, setSel] = useState(state.users[0]?.id);
  const [ssoReady, setSsoReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancel) setSsoReady(Boolean(d?.ssoReady)); })
      .catch(() => { if (!cancel) setSsoReady(false); });
    return () => { cancel = true; };
  }, []);

  const ssoError = params.get('sso_error');

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ───────── ฝั่งซ้าย: ฟอร์ม ───────── */}
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-[13px] font-bold text-white shadow-card ring-1 ring-brand-800/20">SHD</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-ink">ONE Asset</p>
              <p className="text-[11px] text-ink-3">ระบบบริหารทรัพย์สินถาวร</p>
            </div>
          </div>
          <LangSwitch compact />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('login.title')}</h1>
              <p className="text-sm text-ink-3">{t('login.subtitle')}</p>
            </div>

            {ssoError && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
                เข้าสู่ระบบกลางไม่สำเร็จ: {ssoError === 'state' ? 'เซสชันหมดอายุ ลองใหม่อีกครั้ง' : ssoError}
              </div>
            )}

            {ssoReady !== false && (
              <div className="flex flex-col gap-3">
                <a
                  href="/api/auth/sso/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-[14px] font-semibold text-white shadow-card transition-colors hover:bg-brand-800"
                >
                  <ShieldCheck size={17} /> เข้าสู่ระบบกลาง (SSO)
                </a>
                <p className="text-center text-[11.5px] text-ink-3">ล็อกอินด้วยบัญชีพนักงานผ่านระบบกลาง</p>
              </div>
            )}

            {ssoReady === false && (
              <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                <p className="mb-3 text-[12.5px] font-medium text-ink-3">{t('login.chooseRole')}</p>
                <div className="space-y-2">
                  {state.users.map((u) => (
                    <label
                      key={u.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
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
                <Button variant="primary" className="mt-4 w-full" onClick={() => { if (!sel) return; signIn(sel); router.push('/'); }}>
                  {t('login.signIn')}
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-4">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> {t('login.sso')}
        </p>
      </div>

      {/* ───────── ฝั่งขวา: ภาพ hero ไล่สี (เฉพาะจอใหญ่) ───────── */}
      <div
        className="relative hidden overflow-hidden lg:block"
        style={{ background: 'radial-gradient(130% 130% at 15% 15%, #2F5C9A 0%, #1F4A85 42%, #0b223f 100%)' }}
      >
        <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-sky-300/15 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-white/10 text-lg font-bold shadow-pop ring-1 ring-white/15 backdrop-blur">SHD</div>

          <div className="max-w-md">
            <span className="mb-5 inline-flex rounded-full border border-white/25 px-3 py-1 text-xs text-white/80">ONE Asset · SHD Platform</span>
            <h2 className="text-3xl font-semibold leading-snug tracking-tight">บริหารทรัพย์สินถาวร<br />ครบ จบ ในที่เดียว</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">ตั้งแต่รับจาก OA ลงทะเบียน คิดค่าเสื่อม ตรวจนับ ไปจนถึงเชื่อมบัญชี — ติดตามทุกชิ้นได้แบบเรียลไทม์</p>

            <div className="mt-8 grid gap-2.5 text-sm text-white/85">
              <span className="flex items-center gap-2.5"><Boxes className="h-4 w-4 shrink-0 text-cyan-200" strokeWidth={1.8} /> ทะเบียนทรัพย์สินพร้อม QR รายชิ้น</span>
              <span className="flex items-center gap-2.5"><TrendingDown className="h-4 w-4 shrink-0 text-cyan-200" strokeWidth={1.8} /> คำนวณค่าเสื่อมและปิดงวดอัตโนมัติ</span>
              <span className="flex items-center gap-2.5"><ScanLine className="h-4 w-4 shrink-0 text-cyan-200" strokeWidth={1.8} /> ตรวจนับและเชื่อมบัญชี ONEBOOK</span>
              <span className="flex items-center gap-2.5"><KeyRound className="h-4 w-4 shrink-0 text-cyan-200" strokeWidth={1.8} /> ล็อกอินปลอดภัยผ่านระบบกลาง (SSO)</span>
            </div>
          </div>

          <p className="text-[11px] tracking-wide text-white/50">© {new Date().getFullYear()} SHD Technology · ONE Asset</p>
        </div>
      </div>
    </div>
  );
}
