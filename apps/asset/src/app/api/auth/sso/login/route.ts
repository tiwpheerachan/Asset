import { NextResponse } from 'next/server';
import { ssoConfig, ssoReady, authorizeUrl, createPkce, randomToken } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/** เริ่มล็อกอินผ่านระบบกลาง — เก็บ state/nonce/PKCE ไว้ใน cookie ชั่วคราว */
export async function GET() {
  const cfg = ssoConfig();
  const base = cfg.baseUrl;
  if (!ssoReady(cfg)) return NextResponse.redirect(new URL('/login?sso=unconfigured', base));

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = createPkce();

  let url: string;
  try {
    url = await authorizeUrl({ state, nonce, challenge }, cfg);
  } catch (e) {
    return NextResponse.redirect(new URL('/login?sso_error=' + encodeURIComponent((e as Error).message), base));
  }

  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 600, secure: process.env.NODE_ENV === 'production' };
  res.cookies.set('fa_state', state, opts);
  res.cookies.set('fa_nonce', nonce, opts);
  res.cookies.set('fa_verifier', verifier, opts);
  return res;
}
