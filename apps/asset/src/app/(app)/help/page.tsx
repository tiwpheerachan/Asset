'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, ArrowRight, Search, BookOpen, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { HELP_PAGES, HELP_GROUPS } from '@/lib/help-catalog';
import { HELP_SECTIONS } from '@/lib/help-content';
import { PageHeader, Card, Button, cx } from '@/components/ui';

interface Link { label: string; href: string }

export default function HelpPage() {
  const { lang } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<{ answer: string; links: Link[]; followups: string[] } | null>(null);
  const [filter, setFilter] = useState('');
  const [openSec, setOpenSec] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text);
    setBusy(true);
    setAns(null);
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, path: '/help', lang }),
      });
      const data = await res.json();
      setAns({ answer: data.answer || 'ยังตอบไม่ได้ ลองใหม่', links: data.links || [], followups: data.followups || [] });
    } catch {
      setAns({ answer: 'เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง', links: [], followups: [] });
    } finally {
      setBusy(false);
    }
  }

  const f = filter.trim().toLowerCase();
  const pagesFiltered = HELP_PAGES.filter(
    (p) => !f || p.title.toLowerCase().includes(f) || p.purpose.toLowerCase().includes(f) || p.keywords.some((k) => k.includes(f)),
  );

  return (
    <>
      <PageHeader title="คู่มือการใช้งาน ONE Asset" sub="ถามผู้ช่วย AI หรือเลือกหน้าที่ต้องการ — พาไปที่หน้านั้นได้ทันที" />

      {/* ถามผู้ช่วย AI */}
      <Card className="mb-5 p-4">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
          <img src="/ai-helper.png" alt="" className="h-6 w-6" /> ถามผู้ช่วย AI
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เช่น นำเข้าทรัพย์สินจากบัญชีทำยังไง / ทำไมไม่คิดค่าเสื่อม"
              className="h-10 w-full rounded-md border border-line bg-white pl-8 pr-3 text-[13.5px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={busy || !q.trim()}>{busy ? 'กำลังค้น…' : 'ถาม'}</Button>
        </form>
        {!ans && !busy && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {['เริ่มใช้งานต้องทำอะไรบ้าง', 'คิดค่าเสื่อมและปิดงวดทำยังไง', 'จำหน่ายทรัพย์สินทำยังไง'].map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] text-ink-2 hover:border-brand-400 hover:text-brand-700">{s}</button>
            ))}
          </div>
        )}
        {ans && (
          <div className="mt-3 rounded-lg bg-canvas px-4 py-3 text-[13px] text-ink">
            <div className="whitespace-pre-wrap leading-relaxed">{ans.answer}</div>
            {ans.links.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ans.links.map((l) => (
                  <button key={l.href} onClick={() => router.push(l.href)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-brand-700 hover:border-brand-400 hover:bg-brand-50">
                    ไปที่ “{l.label}” <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            )}
            {ans.followups.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {ans.followups.map((fu) => (
                  <button key={fu} onClick={() => ask(fu)} className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-brand-400 hover:text-brand-700">{fu}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ดัชนีหน้าทั้งหมด (คลิกได้) */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><BookOpen size={16} className="text-brand-600" /> ทุกหน้าในระบบ</div>
          <div className="relative w-56">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="กรองหน้า…"
              className="h-8 w-full rounded-md border border-line bg-white pl-7 pr-2 text-[12.5px] focus:border-brand-500 focus:outline-none" />
          </div>
        </div>
        {HELP_GROUPS.map((g) => {
          const items = pagesFiltered.filter((p) => p.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="mb-3 last:mb-0">
              <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-4">{g}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <button key={p.path} onClick={() => router.push(p.path)}
                    className="group flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2.5 text-left hover:border-brand-400 hover:bg-brand-50/40">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink group-hover:text-brand-700">{p.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-3">{p.purpose}</div>
                    </div>
                    <ChevronRight size={15} className="mt-0.5 shrink-0 text-ink-4 group-hover:text-brand-600" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>

      {/* หัวข้อวิธีใช้งาน */}
      <Card className="p-4">
        <div className="mb-3 text-[13px] font-semibold text-ink">หัวข้อวิธีใช้งาน</div>
        <div className="divide-y divide-line">
          {HELP_SECTIONS.map((s) => (
            <div key={s.id} className="py-2">
              <button onClick={() => setOpenSec(openSec === s.id ? null : s.id)} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="text-[13px] font-medium text-ink">{s.title}</span>
                <ChevronRight size={15} className={cx('shrink-0 text-ink-4 transition-transform', openSec === s.id && 'rotate-90')} />
              </button>
              {openSec === s.id && (
                <div className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                  {s.body}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.paths.map((path) => {
                      const pg = HELP_PAGES.find((p) => p.path === path);
                      if (!pg) return null;
                      return (
                        <button key={path} onClick={() => router.push(path)}
                          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-brand-700 hover:border-brand-400 hover:bg-brand-50">
                          {pg.title} <ArrowRight size={12} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
