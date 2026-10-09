/**
 * POST /api/help/ask — ผู้ช่วย AI "วิธีใช้งาน + นำทาง" ของ One OA (อ่านอย่างเดียว)
 * body: { question, path?, lang? }  →  { answer, links:[{label,href}], followups:[], source }
 * ตอบจากคู่มือ (HELP_SECTIONS) + รายการหน้า (HELP_PAGES) เท่านั้น · fallback เป็น keyword เมื่อ AI ใช้ไม่ได้
 */
import { NextResponse } from "next/server";
import { HELP_PAGES, pageByPath } from "@/lib/help/catalog";
import { HELP_SECTIONS } from "@/lib/help/content";
import { getCurrentUser } from "@/lib/auth";
import { listAwaitingMe } from "@/lib/queries";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const STATUS_TH: Record<string, string> = {
  DRAFT: "ฉบับร่าง", PENDING: "รออนุมัติ", PRELIM_APPROVED: "อนุมัติเบื้องต้นแล้ว",
  APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", RETURNED: "ถูกส่งกลับให้แก้", CANCELLED: "ยกเลิก",
};

/** สรุปสถานะสดของผู้ใช้คนนี้ (คำนวณฝั่ง server จาก session) */
async function buildOaSnapshot(): Promise<string | undefined> {
  const user = await getCurrentUser();
  if (!user) return undefined;
  try {
    const awaiting = (await listAwaitingMe(user.id)).length;
    const mine = (await db
      .prepare("SELECT status, COUNT(*) AS n FROM requests WHERE requester_id = ? GROUP BY status")
      .all(user.id)) as { status: string; n: number }[];
    const mineLine = mine.length
      ? mine.map((r) => `${STATUS_TH[r.status] ?? r.status} ${r.n}`).join(", ")
      : "ยังไม่มีคำขอ";
    const clearRow = (await db
      .prepare(
        `SELECT COUNT(*) AS n FROM requests
          WHERE requester_id = ? AND status = 'APPROVED'
            AND COALESCE(clear_due_date,'') <> '' AND COALESCE(oa_ref,'') = ''`,
      )
      .get(user.id)) as { n: number };
    return [
      `ผู้ใช้: ${user.name} (บทบาท ${user.role})`,
      `คำขอที่รอฉันอนุมัติ: ${awaiting} รายการ`,
      `คำขอที่ฉันจัดทำ แยกตามสถานะ: ${mineLine}`,
      `คำขอที่อนุมัติแล้วแต่ยังไม่ได้เคลียร์ใน OA: ${clearRow?.n ?? 0} รายการ`,
    ].join("\n");
  } catch {
    return undefined;
  }
}

const LANG: Record<string, string> = { th: "ภาษาไทย", en: "English", zh: "简体中文" };
const validPaths = new Set(HELP_PAGES.map((p) => p.path));

type Link = { label: string; href: string };

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1);
}

function search(question: string) {
  const qt = tokenize(question);
  const ql = question.toLowerCase();
  const scoreOf = (hay: string[], kw: string[], title: string) => {
    let s = 0;
    const text = hay.join(" ").toLowerCase();
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
      answer: 'ยังไม่พบหัวข้อที่ตรงกับคำถามนี้ ลองพิมพ์คำสั้น ๆ เช่น "ยื่นคำขอ" "อนุมัติ" "สายอนุมัติ" "เคลียร์ OA" หรือเลือกจากรายการหน้าทั้งหมดด้านล่าง',
      links: HELP_PAGES.slice(0, 6).map((p) => ({ label: p.title, href: p.path })),
      followups: ["ยื่นคำขอทำยังไง", "อนุมัติคำขอทำยังไง", "สายอนุมัติทำงานยังไง"],
      source: "fallback" as const,
    };
  }
  const top = secs[0];
  const links = top ? linksFor(top.x.paths) : [];
  for (const { p } of pages.slice(0, 3)) if (!links.some((l) => l.href === p.path)) links.push({ label: p.title, href: p.path });
  return {
    answer: top ? `${top.x.title}\n\n${top.x.body}` : pages[0].p.purpose,
    links: links.slice(0, 5),
    followups: secs.slice(1, 4).map((r) => r.x.title),
    source: "fallback" as const,
  };
}

async function askAI(question: string, path: string | undefined, lang: string, snapshot?: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const answerLang = LANG[lang] || LANG.th;
  const here = path ? pageByPath(path) : undefined;

  const pagesCtx = HELP_PAGES.map((p) => `- ${p.title} | path:${p.path} | ${p.purpose}`).join("\n");
  const secsCtx = HELP_SECTIONS.map((s) => `### ${s.title}\n${s.body}\nหน้า: ${s.paths.join(", ")}`).join("\n\n");

  const system = `คุณคือผู้ช่วยอัจฉริยะของระบบ "One OA" (ระบบขออนุมัติเอกสารภายในองค์กร) ของบริษัทไทย
หน้าที่มี 2 อย่าง: (1) ช่วย "หาวิธีใช้งาน" และนำทางไปหน้าที่ถูกต้อง (2) ตอบ "สถานะ/ตัวเลขจริงตอนนี้ของผู้ใช้คนนี้" จากข้อมูลสดใน DATA
คุณไม่สามารถยื่น/อนุมัติ/แก้ไขเอกสารแทนผู้ใช้ได้ ทำได้แค่บอกวิธีและชี้หน้า

กติกา
- ตอบด้วย ${answerLang} เสมอ กระชับ ตรงประเด็น เป็นขั้นตอนเมื่อเหมาะสม ไม่เกิน 6 บรรทัด
- คำถาม "วิธีใช้" ให้ตอบจาก PAGES/HOWTO · คำถาม "ตอนนี้มีกี่/สถานะ/ค้างอะไร" ให้ตอบจากตัวเลขใน DATA เท่านั้น ห้ามเดาตัวเลข
- ถ้า DATA ไม่มีตัวเลขที่ถาม ให้บอกตรง ๆ แล้วชี้หน้าที่ดูเองได้
- links ต้องเลือกจาก path ใน PAGES เท่านั้น (ที่เกี่ยวข้องจริง 1-4 อัน) เช่น ถามเรื่องรออนุมัติให้ลิงก์ /requests?tab=awaiting
- ตอบเป็น JSON เท่านั้น: {"answer":string,"links":[{"label":string,"href":string}],"followups":[string]}

PAGES (รายการหน้าทั้งหมด)
${pagesCtx}

HOWTO (วิธีใช้งาน)
${secsCtx}
${snapshot ? `\nDATA (สถานะสดของผู้ใช้ตอนนี้)\n${snapshot}` : ""}`;

  const user = `${here ? `ผู้ใช้กำลังอยู่ที่หน้า: ${here.title} (${here.path})\n` : ""}คำถาม: ${question}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 700,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const links: Link[] = Array.isArray(parsed.links)
      ? parsed.links
          .filter((l: any) => l && validPaths.has(l.href))
          .map((l: any) => ({ label: String(l.label || HELP_PAGES.find((p) => p.path === l.href)?.title || l.href), href: String(l.href) }))
          .slice(0, 4)
      : [];
    const followups: string[] = Array.isArray(parsed.followups) ? parsed.followups.map(String).slice(0, 3) : [];
    const answer = String(parsed.answer || "").trim();
    if (!answer) return null;
    return { answer, links, followups, source: "ai" as const };
  } catch {
    return null;
  }
}

const DATA_HINTS = ["กี่", "เท่าไร", "เท่าไหร่", "เหลือ", "ค้าง", "สถานะ", "ตอนนี้", "จำนวน", "รอฉัน", "ของฉัน", "เคลียร์", "how many", "status", "count", "pending", "mine"];

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const question = String(body?.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "กรุณาพิมพ์คำถาม" }, { status: 400 });
  const lang = String(body?.lang ?? "th");
  const path = body?.path ? String(body.path) : undefined;
  const snapshot = await buildOaSnapshot();

  const ai = await askAI(question, path, lang, snapshot);
  if (ai) return NextResponse.json(ai, { headers: { "Cache-Control": "no-store" } });

  const ql = question.toLowerCase();
  if (snapshot && DATA_HINTS.some((h) => ql.includes(h))) {
    return NextResponse.json(
      { answer: `สรุปสถานะของคุณตอนนี้\n\n${snapshot}`, links: [{ label: "รอฉันอนุมัติ", href: "/requests?tab=awaiting" }, { label: "คำขอของฉัน", href: "/requests?tab=mine" }], followups: ["ยื่นคำขอทำยังไง", "อนุมัติคำขอทำยังไง", "เคลียร์ OA คืออะไร"], source: "snapshot" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(fallback(question), { headers: { "Cache-Control": "no-store" } });
}
