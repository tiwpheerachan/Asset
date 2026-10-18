import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ssoConfig, exchangeCode, verifyIdToken, mapClaims, signSession, SESSION_COOKIE } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/** ระบบกลางส่งกลับมาพร้อม code — แลก token, ตรวจ id_token, ผูก session */
export async function GET(req: Request) {
  const cfg = ssoConfig();
  const base = cfg.baseUrl;
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const err = u.searchParams.get('error');
  if (err) return NextResponse.redirect(new URL('/login?sso_error=' + encodeURIComponent(err), base));

  const jar = await cookies();
  const savedState = jar.get('fa_state')?.value;
  const nonce = jar.get('fa_nonce')?.value ?? '';
  const verifier = jar.get('fa_verifier')?.value ?? '';

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/login?sso_error=state', base));
  }

  try {
    const tokens = await exchangeCode(code, verifier, cfg);
    const claims = await verifyIdToken(tokens.id_token, nonce, cfg);
    const session = await mapClaims(claims, cfg);

    const res = NextResponse.redirect(new URL('/', base));
    res.cookies.set(SESSION_COOKIE, signSession(session, cfg), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
      secure: process.env.NODE_ENV === 'production',
    });
    for (const n of ['fa_state', 'fa_nonce', 'fa_verifier']) res.cookies.set(n, '', { path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.redirect(new URL('/login?sso_error=' + encodeURIComponent((e as Error).message), base));
  }
}
