import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/sso';
import { searchDirectory } from '@/lib/directory';

export const dynamic = 'force-dynamic';

/** ค้นพนักงานจากไดเรกทอรีกลาง — เฉพาะแอดมิน (คนที่จัดการสิทธิ์) · API key อยู่ฝั่งเซิร์ฟเวอร์ */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const s = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s || s.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const result = await searchDirectory(q);
  const status = result.ok
    ? 200
    : result.error === 'query_too_short'
      ? 400
      : result.error === 'not_configured'
        ? 503
        : 502;
  return NextResponse.json(result, { status });
}
