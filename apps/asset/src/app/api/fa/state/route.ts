/**
 * GET  /api/fa/state  — โหลด State ทั้งหมดจาก Postgres (schema fa) · seed อัตโนมัติถ้ายังว่าง
 * POST /api/fa/state  — บันทึก State ทั้งก้อน (ไม่รวม session)
 */
import { NextResponse } from 'next/server';
import { getState, saveState } from '@/lib/fa-repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getState();
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // กัน session หลุดลง DB (session เป็นของแต่ละ browser)
    delete body.session;
    await saveState(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
