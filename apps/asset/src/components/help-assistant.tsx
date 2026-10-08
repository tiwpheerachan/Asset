'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Send, ArrowRight, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { buildAssetSnapshot } from '@/lib/help-snapshot';
import { pageByPath, HELP_PAGES } from '@/lib/help-catalog';
import { Drawer, Button, cx } from './ui';

interface Link { label: string; href: string }
interface Turn { q: string; answer: string; links: Link[]; followups: string[]; loading?: boolean; source?: string }

const STARTERS = [
  'เริ่มใช้งานต้องทำอะไรบ้าง',
  'นำเข้าทรัพย์สินจากบัญชีทำยังไง',
  'คิดค่าเสื่อมและปิดงวดทำยังไง',
  'ทำไมทรัพย์สินไม่คิดค่าเสื่อม',
];

export function HelpAssistant() {
  const { lang } = useI18n();
  const { state } = useStore();
  const router = useRouter();
  const path = usePathname();
  const here = pageByPath(path || '/');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ('');
    setBusy(true);
    setTurns((t) => [...t, { q: text, answer: '', links: [], followups: [], loading: true }]);
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, path, lang, snapshot: buildAssetSnapshot(state) }),
      });
      const data = await res.json();
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = {
          q: text,
          answer: data.answer || 'ขออภัย ยังตอบไม่ได้ ลองใหม่อีกครั้ง',
          links: Array.isArray(data.links) ? data.links : [],
          followups: Array.isArray(data.followups) ? data.followups : [],
          source: data.source,
        };
        return copy;
      });
    } catch {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { q: text, answer: 'เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง', links: [], followups: [] };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <>
      <style>{`
        @keyframes aiHelperBob {
          0%,60%,100% { transform: translateY(0) scale(1); }
          72% { transform: translateY(-7px) scale(1.06); }
          84% { transform: translateY(-2px) scale(1.02); }
        }
        .ai-helper-bob { animation: aiHelperBob 2.6s ease-in-out infinite; transform-origin: bottom center; }
        @media (prefers-reduced-motion: reduce) { .ai-helper-bob { animation: none; } }
      `}</style>
      {/* ปุ่มลอยทุกหน้า */}
      <button
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-2 pr-4 text-[13px] font-semibold text-white shadow-pop transition hover:bg-brand-700"
        aria-label="ผู้ช่วยคู่มือ AI"
      >
        <img src="/ai-helper.png" alt="" className="ai-helper-bob h-10 w-10 shrink-0 drop-shadow" /> ผู้ช่วย AI
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={<span className="flex items-center gap-2"><img src="/ai-helper.png" alt="" className="h-7 w-7" /> ผู้ช่วยคู่มือ AI</span>}
        sub="ถามวิธีใช้งาน แล้วผมพาไปหน้าที่ถูกต้องให้"
        width="max-w-md"
        footer={
          <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="พิมพ์คำถาม เช่น นำเข้าทรัพย์สินทำยังไง"
              className="h-10 flex-1 rounded-md border border-line bg-white px-3 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={busy || !q.trim()}>ถาม</Button>
          </form>
        }
      >
        <div
          ref={bodyRef}
          className="min-h-full space-y-4"
          style={{
            backgroundImage: 'url(/ai-helper-watermark.png)',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center bottom',
            backgroundSize: 'contain',
          }}
        >
          {/* รู้ว่าอยู่หน้าไหน */}
          {here && (
            <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-[12.5px] text-brand-800">
              <MapPin size={15} className="mt-0.5 shrink-0" />
              <div>
                ตอนนี้คุณอยู่ที่หน้า <b>{here.title}</b>
                <div className="mt-0.5 text-[11.5px] text-brand-700/80">{here.purpose}</div>
              </div>
            </div>
          )}

          {turns.length === 0 && (
            <div>
              <div className="mb-2 text-[12px] font-medium text-ink-3">เริ่มจากคำถามยอดฮิต</div>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] text-ink-2 hover:border-brand-400 hover:text-brand-700">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-[13px] text-white">{t.q}</div>
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-canvas px-3.5 py-2.5 text-[13px] text-ink">
                {t.loading ? (
                  <span className="text-ink-3">กำลังค้นคู่มือ…</span>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap leading-relaxed">{t.answer}</div>
                    {t.links.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        {t.links.map((l) => (
                          <button key={l.href} onClick={() => go(l.href)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-white px-3 py-2 text-[12.5px] font-medium text-brand-700 hover:border-brand-400 hover:bg-brand-50">
                            <span>ไปที่ “{l.label}”</span><ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                    {t.followups.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {t.followups.map((f) => (
                          <button key={f} onClick={() => ask(f)}
                            className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-brand-400 hover:text-brand-700">
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
