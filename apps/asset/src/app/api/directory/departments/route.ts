import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/sso';
import { listDepartments } from '@/lib/directory';

export const dynamic = 'force-dynamic';

/** ผังแผนกจากระบบกลาง — เฉพาะแอดมิน · ใช้กรอง/เติมแผนกในหน้า /admin/users */
export async function GET() {
  const jar = await cookies();
  const s = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s || s.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const result = await listDepartments();
  const status = result.ok ? 200 : result.error === 'not_configured' ? 503 : 502;
  return NextResponse.json(result, { status });
}
