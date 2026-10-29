/**
 * POST /api/assets/suggest-category — AI แนะนำ "หมวดย่อย" ของทรัพย์สินจากชื่อ/รายละเอียด/บัญชี
 * body: { name, description?, account?, subcategories: [{id, path, keywords?}] }
 *   → { subcategoryId, confidence, reason, source: 'ai' | 'heuristic' | 'none' }
 *
 * ใช้ DeepSeek (เหมือนผู้ช่วย AI) ถ้าไม่มี key/ล่ม → fallback เป็นการจับคู่คำ (heuristic)
 * เป็นเพียง "ค่าเริ่มต้นที่แนะนำ" — พนักงานตรวจ/แก้ก่อนสร้างเสมอ
 */
import { NextResponse } from 'next/server';
import { suggestSubcategoryHeuristic, type SubcatOption } from '@/lib/asset-intake';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function askAI(
  name: string, description: string, account: string, opts: SubcatOption[],
): Promise<{ id: string; confidence: number; reason: string } | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const valid = new Set(opts.map((o) => o.id));

  const list = opts.map((o) => `- id:${o.id} | ${o.path}`).join('\n');
  const system = `คุณคือผู้ช่วยจัดหมวดทรัพย์สินถาวรของบริษัทไทย
งาน: เลือก "หมวดย่อย" ที่เหมาะที่สุด 1 รายการ สำหรับทรัพย์สินที่ให้มา จากรายการหมวดด้านล่างเท่านั้น
- เลือกจาก id ในรายการเท่านั้น ห้ามสร้าง id ใหม่
- ถ้าไม่มั่นใจ ให้เลือกที่ใกล้เคียงสุดและตั้ง confidence ต่ำ
- ตอบเป็น JSON เท่านั้น: {"id":string,"confidence":number(0-1),"reason":string(ภาษาไทยสั้นๆ ไม่เกิน 1 บรรทัด)}

หมวดย่อยที่เลือกได้
${list}`;
  const user = `ชื่อรายการ: ${name}
${description ? `รายละเอียด: ${description}\n` : ''}${account ? `บัญชี/รหัสบัญชี: ${account}\n` : ''}เลือกหมวดย่อยที่เหมาะที่สุด`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '{}');
    const id = String(parsed.id ?? '');
    if (!valid.has(id)) return null;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return { id, confidence, reason: String(parsed.reason ?? '').slice(0, 120) };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { name?: string; description?: string; account?: string; subcategories?: SubcatOption[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const name = String(body?.name ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const account = String(body?.account ?? '').trim();
  const opts = Array.isArray(body?.subcategories) ? body!.subcategories!.filter((o) => o?.id && o?.path) : [];
  if (!name || opts.length === 0) {
    return NextResponse.json({ subcategoryId: '', confidence: 0, reason: '', source: 'none' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const ai = await askAI(name, description, account, opts);
  if (ai) {
    return NextResponse.json(
      { subcategoryId: ai.id, confidence: ai.confidence, reason: ai.reason, source: 'ai' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // fallback: จับคู่คำ
  const h = suggestSubcategoryHeuristic(`${name} ${description}`, opts);
  if (h) {
    return NextResponse.json(
      { subcategoryId: h.id, confidence: h.score, reason: 'จับคู่จากคำในชื่อรายการ', source: 'heuristic' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json({ subcategoryId: '', confidence: 0, reason: '', source: 'none' }, { headers: { 'Cache-Control': 'no-store' } });
}
