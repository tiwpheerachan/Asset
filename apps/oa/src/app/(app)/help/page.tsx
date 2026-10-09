"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ArrowRight, Search, BookOpen, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { PageShell, PageTitle } from "@/components/layout-bits";
import { HELP_PAGES, HELP_GROUPS } from "@/lib/help/catalog";
import { HELP_SECTIONS } from "@/lib/help/content";

interface Link { label: string; href: string }

export default function HelpPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<{ answer: string; links: Link[]; followups: string[] } | null>(null);
  const [filter, setFilter] = useState("");
  const [openSec, setOpenSec] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text);
    setBusy(true);
    setAns(null);
    try {
      const res = await fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, path: "/help", lang: locale }),
      });
      const data = await res.json();
      setAns({ answer: data.answer || "ยังตอบไม่ได้ ลองใหม่", links: data.links || [], followups: data.followups || [] });
    } catch {
      setAns({ answer: "เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง", links: [], followups: [] });
    } finally {
      setBusy(false);
    }
  }

  const f = filter.trim().toLowerCase();
  const pagesFiltered = HELP_PAGES.filter(
    (p) => !f || p.title.toLowerCase().includes(f) || p.purpose.toLowerCase().includes(f) || p.keywords.some((k) => k.includes(f)),
  );

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title="คู่มือการใช้งาน One OA" subtitle="ถามผู้ช่วย AI หรือเลือกหน้าที่ต้องการ — พาไปที่หน้านั้นได้ทันที" />

        {/* ถามผู้ช่วย AI */}
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text">
            <img src="/ai-helper.png" alt="" className="h-6 w-6" /> ถามผู้ช่วย AI
          </div>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="เช่น ยื่นคำขอทำยังไง / สายอนุมัติทำงานยังไง"
                className="h-10 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-[13.5px] text-text focus:border-primary focus:outline-none" />
            </div>
            <button type="submit" disabled={busy || !q.trim()}
              className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">
              <Send size={15} /> {busy ? "กำลังค้น…" : "ถาม"}
            </button>
          </form>
          {!ans && !busy && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {["ยื่นคำขอทำยังไง", "อนุมัติคำขอทำยังไง", "เคลียร์ค่าใช้จ่ายใน OA คืออะไร"].map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-text hover:border-primary hover:text-primary">{s}</button>
              ))}
            </div>
          )}
          {ans && (
            <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-text">
              <div className="whitespace-pre-wrap leading-relaxed">{ans.answer}</div>
              {ans.links.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {ans.links.map((l) => (
                    <button key={l.href} onClick={() => router.push(l.href)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-primary hover:border-primary hover:bg-primary-soft">
                      ไปที่ “{l.label}” <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              )}
              {ans.followups.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ans.followups.map((fu) => (
                    <button key={fu} onClick={() => ask(fu)} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-text hover:border-primary hover:text-primary">{fu}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ดัชนีทุกหน้า */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-text"><BookOpen size={16} className="text-primary" /> ทุกหน้าในระบบ</div>
            <div className="relative w-56">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="กรองหน้า…"
                className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-[12.5px] text-text focus:border-primary focus:outline-none" />
            </div>
          </div>
          {HELP_GROUPS.map((g) => {
            const items = pagesFiltered.filter((p) => p.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="mb-3 last:mb-0">
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{g}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((p) => (
                    <button key={p.path} onClick={() => router.push(p.path)}
                      className="group flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-left hover:border-primary">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-text group-hover:text-primary">{p.title}{p.admin ? " · แอดมิน" : ""}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{p.purpose}</div>
                      </div>
                      <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* หัวข้อวิธีใช้งาน */}
        <div className="card p-4">
          <div className="mb-3 text-[13px] font-semibold text-text">หัวข้อวิธีใช้งาน</div>
          <div className="divide-y divide-border">
            {HELP_SECTIONS.map((s) => (
              <div key={s.id} className="py-2">
                <button onClick={() => setOpenSec(openSec === s.id ? null : s.id)} className="flex w-full items-center justify-between gap-2 text-left">
                  <span className="text-[13px] font-medium text-text">{s.title}</span>
                  <ChevronRight size={15} className={`shrink-0 text-muted transition-transform ${openSec === s.id ? "rotate-90" : ""}`} />
                </button>
                {openSec === s.id && (
                  <div className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    {s.body}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.paths.map((path) => {
                        const pg = HELP_PAGES.find((p) => p.path === path);
                        if (!pg) return null;
                        return (
                          <button key={path} onClick={() => router.push(path)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-primary hover:border-primary hover:bg-primary-soft">
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
        </div>
      </div>
    </PageShell>
  );
}
