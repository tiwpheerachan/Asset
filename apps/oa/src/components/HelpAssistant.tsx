"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Send, ArrowRight, MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { pageByPath, HELP_PAGES } from "@/lib/help/catalog";

interface Link { label: string; href: string }
interface Turn { q: string; answer: string; links: Link[]; followups: string[]; loading?: boolean }

const STARTERS = ["ยื่นคำขอทำยังไง", "อนุมัติคำขอทำยังไง", "สายอนุมัติทำงานยังไง", "มอบหมายอนุมัติแทนตอนลา"];

export default function HelpAssistant() {
  const { locale } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const here = pageByPath(path || "/");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: text, answer: "", links: [], followups: [], loading: true }]);
    try {
      const res = await fetch("/api/help/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, path, lang: locale }),
      });
      const data = await res.json();
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = {
          q: text,
          answer: data.answer || "ขออภัย ยังตอบไม่ได้ ลองใหม่อีกครั้ง",
          links: Array.isArray(data.links) ? data.links : [],
          followups: Array.isArray(data.followups) ? data.followups : [],
        };
        return copy;
      });
    } catch {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = { q: text, answer: "เชื่อมต่อผู้ช่วยไม่สำเร็จ ลองใหม่อีกครั้ง", links: [], followups: [] };
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
      <button
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary py-2 pl-2 pr-4 text-[13px] font-semibold text-white shadow-lg transition hover:bg-primary-hover"
        aria-label="ผู้ช่วยคู่มือ AI"
      >
        <img src="/ai-helper.png" alt="" className="ai-helper-bob h-10 w-10 shrink-0 drop-shadow" /> ผู้ช่วย AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/25" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-[16px] font-semibold text-foreground">
                  <img src="/ai-helper.png" alt="" className="h-7 w-7" /> ผู้ช่วยคู่มือ AI
                </h2>
                <div className="mt-0.5 text-[12.5px] text-muted">ถามวิธีใช้งาน แล้วผมพาไปหน้าที่ถูกต้องให้</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="close"><X size={18} /></button>
            </header>

            <div
              ref={bodyRef}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
              style={{
                backgroundImage: "url(/ai-helper-watermark.png)",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center bottom",
                backgroundSize: "contain",
              }}
            >
              {here && (
                <div className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-[12.5px] text-primary-text">
                  <MapPin size={15} className="mt-0.5 shrink-0" />
                  <div>ตอนนี้คุณอยู่ที่หน้า <b>{here.title}</b>
                    <div className="mt-0.5 text-[11.5px] opacity-80">{here.purpose}</div>
                  </div>
                </div>
              )}

              {turns.length === 0 && (
                <div>
                  <div className="mb-2 text-[12px] font-medium text-muted">เริ่มจากคำถามยอดฮิต</div>
                  <div className="flex flex-wrap gap-2">
                    {STARTERS.map((s) => (
                      <button key={s} onClick={() => ask(s)}
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-foreground hover:border-primary hover:text-primary">{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((t, i) => (
                <div key={i} className="space-y-2">
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[13px] text-white">{t.q}</div>
                  <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2.5 text-[13px] text-foreground">
                    {t.loading ? (
                      <span className="text-muted">กำลังค้นคู่มือ…</span>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap leading-relaxed">{t.answer}</div>
                        {t.links.length > 0 && (
                          <div className="mt-2.5 space-y-1.5">
                            {t.links.map((l) => (
                              <button key={l.href} onClick={() => go(l.href)}
                                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-primary hover:border-primary hover:bg-primary-soft">
                                <span>ไปที่ “{l.label}”</span><ArrowRight size={14} />
                              </button>
                            ))}
                          </div>
                        )}
                        {t.followups.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {t.followups.map((f) => (
                              <button key={f} onClick={() => ask(f)}
                                className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-foreground hover:border-primary hover:text-primary">{f}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-border bg-surface-2/60 px-5 py-3">
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="พิมพ์คำถาม เช่น ยื่นคำขอทำยังไง"
                  className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-[13px] text-foreground focus:border-primary focus:outline-none"
                />
                <button type="submit" disabled={busy || !q.trim()}
                  className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">
                  <Send size={15} /> ถาม
                </button>
              </form>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
