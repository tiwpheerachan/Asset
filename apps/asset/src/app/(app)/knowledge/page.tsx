'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Info, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input, Notice, PageHeader, cx } from '@/components/ui';

interface Source { name: string; reference: string; url?: string }
interface Article {
  id: string; topic: string; title: string; summary: string; content: string;
  sources: Source[]; tags: string[]; model: string; generatedAt: string; updatedAt: string;
}

const SUGGESTED = [
  'อายุและอัตราค่าเสื่อมราคาทรัพย์สินถาวรตามกฎหมายภาษีไทย',
  'เกณฑ์มูลค่าขั้นต่ำที่ถือเป็นทรัพย์สิน (Capitalization) ของไทย',
  'สิทธิประโยชน์ค่าเสื่อมสำหรับ SME (หักเพิ่มวันแรก)',
  'การคิดค่าเสื่อมราคาวิธีเส้นตรงและการคำนวณตามวันจริง',
  'เพดานค่าเสื่อมรถยนต์นั่งไม่เกิน 1 ล้านบาท',
  'มาตรฐานการบัญชี TFRS for NPAEs เรื่องที่ดิน อาคาร และอุปกรณ์',
];

/** markdown สั้น ๆ: ## หัวข้อ, - bullet, **ตัวหนา** */
function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) {
      out.push(
        <ul key={`u${k}`} className="my-2 list-disc space-y-1 pl-5 text-[13.5px] text-ink-2">
          {bullets.map((b, i) => <li key={i} dangerouslySetInnerHTML={{ __html: inline(b) }} />)}
        </ul>,
      );
      bullets = [];
    }
  };
  const inline = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (/^#{1,6}\s/.test(t)) {
      flush(i);
      const lvl = t.match(/^#+/)![0].length;
      const txt = t.replace(/^#+\s/, '');
      out.push(
        <div key={i} className={cx('font-semibold text-ink', lvl <= 2 ? 'mt-4 text-[15px]' : 'mt-3 text-[13.5px]')}>{txt}</div>,
      );
    } else if (/^[-*]\s/.test(t)) {
      bullets.push(t.replace(/^[-*]\s/, ''));
    } else if (t === '') {
      flush(i);
    } else {
      flush(i);
      out.push(<p key={i} className="my-1.5 text-[13.5px] leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: inline(t) }} />);
    }
  });
  flush(lines.length);
  return out;
}

const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return s; }
};

export default function KnowledgePage() {
  const [items, setItems] = useState<Article[]>([]);
  const [sel, setSel] = useState<Article | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    const r = await fetch('/api/knowledge', { cache: 'no-store' });
    const d = await r.json();
    setItems(d.items ?? []);
    setReady(true);
  };
  useEffect(() => { load(); }, []);

  const generate = async (tp: string) => {
    if (!tp.trim()) return;
    setBusy(tp); setErr('');
    try {
      const r = await fetch('/api/knowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: tp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'สร้างไม่สำเร็จ');
      await load();
      setSel(d.article);
      setTopic('');
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const del = async (id: string) => {
    await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (sel?.id === id) setSel(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="คลังความรู้ (AI)"
        sub="ความรู้บัญชี/ภาษีทรัพย์สิน สร้างและอัปเดตด้วย AI พร้อมแหล่งอ้างอิงให้ตรวจสอบได้"
      />

      <Notice tone="amber" icon={<Info size={15} />} className="mb-4">
        เนื้อหาสร้างโดย AI (DeepSeek) อ้างอิงแหล่งทางการของไทย — <b>ควรตรวจสอบกับต้นฉบับก่อนใช้จริง</b> และยืนยันกับผู้สอบบัญชี
      </Notice>

      {/* แถบสร้างด้วย AI */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="พิมพ์หัวข้อความรู้ที่ต้องการ เช่น การด้อยค่าทรัพย์สิน…"
              onKeyDown={(e) => e.key === 'Enter' && generate(topic)}
            />
          </div>
          <Button variant="primary" icon={<Sparkles size={15} />} disabled={!topic.trim() || !!busy} onClick={() => generate(topic)}>
            {busy === topic ? 'กำลังสร้าง…' : 'สร้างด้วย AI'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              disabled={!!busy}
              onClick={() => generate(s)}
              className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-2 hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
            >
              {busy === s ? '⏳ ' : '+ '}{s}
            </button>
          ))}
        </div>
        {err && <div className="mt-2 text-[12.5px] text-red-600">{err}</div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* รายการบทความ */}
        <div className="space-y-2">
          {!ready && <div className="text-[13px] text-ink-3">กำลังโหลด…</div>}
          {ready && items.length === 0 && (
            <Card className="p-4 text-[13px] text-ink-3">ยังไม่มีบทความ — เลือกหัวข้อแนะนำด้านบนเพื่อให้ AI สร้างให้</Card>
          )}
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => setSel(a)}
              className={cx(
                'block w-full rounded-md border bg-white p-3 text-left transition hover:border-brand-500',
                sel?.id === a.id ? 'border-brand-500 ring-2 ring-brand-100' : 'border-line',
              )}
            >
              <div className="flex items-start gap-2">
                <BookOpen size={15} className="mt-0.5 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{a.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{a.summary}</div>
                  <div className="mt-1 text-[11px] text-ink-4">อัปเดต {fmtDate(a.updatedAt)} · {a.sources.length} แหล่งอ้างอิง</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* เนื้อหาบทความ */}
        <div>
          {!sel ? (
            <Card className="flex h-full items-center justify-center p-10 text-[13px] text-ink-3">
              เลือกบทความทางซ้าย หรือสร้างใหม่ด้วย AI
            </Card>
          ) : (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-ink">{sel.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-4">
                    <Badge tone="blue">{sel.model}</Badge>
                    <span>สร้าง {fmtDate(sel.generatedAt)}</span>
                    {sel.updatedAt !== sel.generatedAt && <span>· อัปเดต {fmtDate(sel.updatedAt)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button icon={<RefreshCw size={14} className={busy === sel.topic ? 'animate-spin' : ''} />} disabled={!!busy} onClick={() => generate(sel.topic)}>
                    {busy === sel.topic ? 'กำลังอัปเดต…' : 'อัปเดต'}
                  </Button>
                  <Button icon={<Trash2 size={14} />} onClick={() => del(sel.id)}>ลบ</Button>
                </div>
              </div>

              {sel.summary && <p className="mt-3 text-[13.5px] text-ink-2">{sel.summary}</p>}

              <div className="mt-2">{renderMarkdown(sel.content)}</div>

              {/* แหล่งอ้างอิง */}
              <div className="mt-5 rounded-md border border-line bg-canvas p-3.5">
                <div className="mb-2 text-[12.5px] font-semibold text-ink-2">แหล่งอ้างอิง (ตรวจสอบกับต้นฉบับได้)</div>
                <ul className="space-y-1.5">
                  {sel.sources.map((s, i) => (
                    <li key={i} className="text-[12.5px] text-ink-2">
                      <b>{s.name}</b> — {s.reference}
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-brand-600 hover:underline">
                          เปิด <ExternalLink size={11} />
                        </a>
                      )}
                    </li>
                  ))}
                  {sel.sources.length === 0 && <li className="text-[12px] text-ink-4">— ไม่มีแหล่งอ้างอิงที่ระบุ —</li>}
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
