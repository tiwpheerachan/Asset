import { NextResponse } from 'next/server';
import { ssoConfig, endSessionUrl, SESSION_COOKIE } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/** ออกจากระบบ — ลบ session cookie แล้วพาไป end-session ของระบบกลาง (ถ้ามี) */
export async function GET() {
  const cfg = ssoConfig();
  const base = cfg.baseUrl;
  const end = await endSessionUrl(cfg).catch(() => null);
  const res = NextResponse.redirect(end ?? new URL('/login', base));
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
