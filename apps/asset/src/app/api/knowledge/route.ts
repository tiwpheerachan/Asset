/**
 * คลังความรู้ AI (DeepSeek)
 *   GET  /api/knowledge           — รายการบทความทั้งหมด
 *   POST /api/knowledge           — { topic, tags? } สร้าง/อัปเดตด้วย AI
 *   DELETE /api/knowledge?id=...   — ลบบทความ
 * เรียก DeepSeek ฝั่ง server เท่านั้น (API key ไม่หลุดไป browser)
 */
import { NextResponse } from 'next/server';
import { listKnowledge, generateAndSave, deleteKnowledge } from '@/lib/knowledge-repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ items: await listKnowledge() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = String(body.topic ?? '').trim();
    if (!topic) return NextResponse.json({ error: 'กรุณาระบุหัวข้อ' }, { status: 400 });
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const article = await generateAndSave(topic, tags);
    return NextResponse.json({ article });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    await deleteKnowledge(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
