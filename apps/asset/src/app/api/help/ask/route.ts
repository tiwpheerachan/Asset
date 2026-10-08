/**
 * POST /api/help/ask — ผู้ช่วย AI "วิธีใช้งาน + นำทาง" ของ ONE Asset (อ่านอย่างเดียว)
 * body: { question, path?, lang? }  →  { answer, links:[{label,href}], followups:[], source }
 *
 * - ตอบจากคู่มือ (HELP_SECTIONS) + รายการหน้า (HELP_PAGES) เท่านั้น ไม่แต่งหน้า/ลิงก์ที่ไม่มีจริง
 * - รู้ว่าผู้ใช้อยู่หน้าไหนจาก path ที่ส่งมา
 * - ถ้า DeepSeek ใช้ไม่ได้ (ไม่มี key/เครดิตหมด) จะ fallback เป็นการค้นแบบ keyword
 */
import { NextResponse } from 'next/server';
import { HELP_PAGES, pageByPath } from '@/lib/help-catalog';
import { HELP_SECTIONS } from '@/lib/help-content';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const LANG: Record<string, string> = { th: 'ภาษาไทย', en: 'English', zh: '简体中文' };
const validPaths = new Set(HELP_PAGES.map((p) => p.path));

type Link = { label: string; href: string };

function tokenize(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);
}

/** ค้นแบบ keyword — ให้คะแนนด้วยคำที่ตรงในหัวข้อ/keyword/เนื้อหา */
function search(question: string) {
  const qt = tokenize(question);
  const ql = question.toLowerCase();
  const scoreOf = (hay: string[], kw: string[], title: string) => {
    let s = 0;
    const text = hay.join(' ').toLowerCase();
    for (const k of kw) if (ql.includes(k.toLowerCase())) s += 3;
    for (const w of qt) {
      if (title.toLowerCase().includes(w)) s += 2;
      if (text.includes(w)) s += 1;
    }
    return s;
  };
  const secs = HELP_SECTIONS
    .map((x) => ({ x, s: scoreOf([x.title, x.body, ...x.keywords], x.keywords, x.title) }))
    .filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  const pages = HELP_PAGES
    .map((p) => ({ p, s: scoreOf([p.title, p.purpose, ...p.keywords], p.keywords, p.title) }))
    .filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  return { secs, pages };
}

function linksFor(paths: string[]): Link[] {
  const out: Link[] = [];
  for (const path of paths) {
    const pg = HELP_PAGES.find((p) => p.path === path);
    if (pg && !out.some((l) => l.href === pg.path)) out.push({ label: pg.title, href: pg.path });
  }
  return out;
}

function fallback(question: string) {
  const { secs, pages } = search(question);
  if (secs.length === 0 && pages.length === 0) {
    return {
      answer: 'ยังไม่พบหัวข้อที่ตรงกับคำถามนี้ ลองพิมพ์คำสั้น ๆ เช่น "นำเข้า" "ค่าเสื่อม" "จำหน่าย" "สิทธิ์" หรือเลือกจากรายการหน้าทั้งหมดด้านล่าง',
      links: HELP_PAGES.slice(0, 6).map((p) => ({ label: p.title, href: p.path })),
      followups: ['เริ่มใช้งานต้องทำอะไรบ้าง', 'นำเข้าทรัพย์สินจากบัญชีทำยังไง', 'คิดค่าเสื่อมและปิดงวดทำยังไง'],
      source: 'fallback' as const,
    };
  }
  const top = secs[0];
  const links = top ? linksFor(top.x.paths) : [];
  for (const { p } of pages.slice(0, 3)) if (!links.some((l) => l.href === p.path)) links.push({ label: p.title, href: p.path });
  return {
    answer: top ? `${top.x.title}\n\n${top.x.body}` : pages[0].p.purpose,
    links: links.slice(0, 5),
    followups: secs.slice(1, 4).map((r) => r.x.title),
    source: 'fallback' as const,
  };
}

async function askAI(question: string, path: string | undefined, lang: string, snapshot?: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const answerLang = LANG[lang] || LANG.th;
  const here = path ? pageByPath(path) : undefined;

  const pagesCtx = HELP_PAGES.map((p) => `- ${p.title} | path:${p.path} | ${p.purpose}`).join('\n');
  const secsCtx = HELP_SECTIONS.map((s) => `### ${s.title}\n${s.body}\nหน้า: ${s.paths.join(', ')}`).join('\n\n');

  const system = `คุณคือผู้ช่วยอัจฉริยะของระบบ "ONE Asset" (ระบบบริหารทรัพย์สินถาวร) ของบริษัทไทย
หน้าที่มี 2 อย่าง: (1) ช่วย "หาวิธีใช้งาน" และนำทางไปหน้าที่ถูกต้อง (2) ตอบ "สถานะ/ตัวเลขจริงตอนนี้" จากข้อมูลสดใน DATA
คุณไม่สามารถแก้ไขข้อมูลหรือกดปุ่มแทนผู้ใช้ได้ ทำได้แค่บอก/ชี้หน้า

กติกา
- ตอบด้วย ${answerLang} เสมอ กระชับ ตรงประเด็น เป็นขั้นตอนเมื่อเหมาะสม ไม่เกิน 6 บรรทัด
- คำถามเกี่ยวกับ "วิธีใช้" ให้ตอบจาก PAGES/HOWTO · คำถามเกี่ยวกับ "ตอนนี้มีเท่าไร/สถานะ/เหลือเท่าไร/ค้างอะไร" ให้ตอบจากตัวเลขใน DATA เท่านั้น ห้ามเดาตัวเลขเอง
- ถ้า DATA ไม่มีตัวเลขที่ถาม ให้บอกตรง ๆ แล้วชี้หน้าที่ดูเองได้
- links เลือกจาก path ใน PAGES เท่านั้น (ที่เกี่ยวข้องจริง 1-4 อัน) เช่น ถามเรื่องคิว OA ให้ลิงก์ /oa-import
- ตอบเป็น JSON เท่านั้น: {"answer":string,"links":[{"label":string,"href":string}],"followups":[string]}

PAGES (รายการหน้าทั้งหมด)
${pagesCtx}

HOWTO (วิธีใช้งาน)
${secsCtx}
${snapshot ? `\nDATA (สถานะสดของระบบตอนนี้)\n${snapshot}` : ''}`;

  const user = `${here ? `ผู้ใช้กำลังอยู่ที่หน้า: ${here.title} (${here.path})\n` : ''}คำถาม: ${question}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 700,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
    const links: Link[] = Array.isArray(parsed.links)
      ? parsed.links
          .filter((l: any) => l && validPaths.has(l.href))
          .map((l: any) => ({ label: String(l.label || HELP_PAGES.find((p) => p.path === l.href)?.title || l.href), href: String(l.href) }))
          .slice(0, 4)
      : [];
    const followups: string[] = Array.isArray(parsed.followups) ? parsed.followups.map(String).slice(0, 3) : [];
    const answer = String(parsed.answer || '').trim();
    if (!answer) return null;
    return { answer, links, followups, source: 'ai' as const };
  } catch {
    return null;
  }
}

const DATA_HINTS = ['กี่', 'เท่าไร', 'เท่าไหร่', 'เหลือ', 'ค้าง', 'สถานะ', 'ตอนนี้', 'มีกี่', 'จำนวน', 'รวม', 'ยอด', 'เท่าใด', 'how many', 'how much', 'status', 'total', 'count', 'left', 'remaining'];

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const question = String(body?.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'กรุณาพิมพ์คำถาม' }, { status: 400 });
  const lang = String(body?.lang ?? 'th');
  const path = body?.path ? String(body.path) : undefined;
  const snapshot = body?.snapshot ? String(body.snapshot) : undefined;

  const ai = await askAI(question, path, lang, snapshot);
  if (ai) return NextResponse.json(ai, { headers: { 'Cache-Control': 'no-store' } });

  // fallback: ถ้าเป็นคำถามเชิงข้อมูลและมี snapshot ให้คืนสรุปสถานะสด
  const ql = question.toLowerCase();
  if (snapshot && DATA_HINTS.some((h) => ql.includes(h))) {
    return NextResponse.json(
      { answer: `สรุปสถานะระบบตอนนี้\n\n${snapshot}`, links: [{ label: 'แดชบอร์ด', href: '/' }], followups: ['OA รอดำเนินการกี่รายการ', 'ค่าเสื่อมงวดนี้เท่าไร', 'งานค้างมีอะไรบ้าง'], source: 'snapshot' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(fallback(question), { headers: { 'Cache-Control': 'no-store' } });
}
