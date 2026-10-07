/**
 * GET  /api/fa/state  — โหลด State ทั้งหมดจาก Postgres (schema fa) · seed อัตโนมัติถ้ายังว่าง
 * POST /api/fa/state  — บันทึกข้อมูล
 *   - ถ้า body มี `changes` → บันทึกแบบส่วนต่าง (upsert/delete ราย id, ไม่แตะแถวอื่น) ← โหมดปกติ
 *   - ไม่งั้น → บันทึกทั้งก้อน (ใช้ตอน seed/ย้ายข้อมูล)
 */
import { NextResponse } from 'next/server';
import { getState, saveState, saveStateDiff, ConflictError } from '@/lib/fa-repo';

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
    if (body && typeof body === 'object' && 'changes' in body) {
      // โหมดส่วนต่าง: เขียนเฉพาะที่เปลี่ยน ไม่ลบทั้งตาราง + ตรวจเวอร์ชันราย record
      await saveStateDiff(body);
      return NextResponse.json({ ok: true });
    }
    // โหมดทั้งก้อน (เผื่อ client เก่า/การ seed) — กัน session หลุดลง DB
    delete body.session;
    await saveState(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) {
      // 409: มีคนอื่นแก้แถวนี้ไปก่อน — client จะ refetch แล้ว merge
      return NextResponse.json({ error: 'conflict', conflicts: e.conflicts }, { status: 409 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
