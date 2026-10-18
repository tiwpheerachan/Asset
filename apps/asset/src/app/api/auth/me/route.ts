import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, ssoReady, SESSION_COOKIE } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/** คืนผู้ใช้จาก session cookie (ให้ client store ใช้แทน dropdown จำลอง) */
export async function GET() {
  const jar = await cookies();
  const s = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s) return NextResponse.json({ user: null, ssoReady: ssoReady() }, { status: 401 });
  return NextResponse.json({
    user: { userId: s.userId, role: s.role, name: s.name, email: s.email, avatarUrl: s.avatarUrl ?? null, title: s.title ?? null, department: s.department ?? null },
    ssoReady: ssoReady(),
  });
}
