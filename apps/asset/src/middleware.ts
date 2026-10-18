import { NextRequest, NextResponse } from 'next/server';

/**
 * กันหน้าแอปเมื่อเปิด SSO แล้ว — ไม่มี session cookie ให้เด้งไปหน้า login
 * (รันบน Edge จึงเช็คแค่ "มี cookie ไหม" ส่วนตรวจลายเซ็นจริงทำที่ /api/auth/me + API ฝั่ง Node)
 * ถ้ายังไม่ตั้งค่า SSO (dev) จะไม่ gate — คงโหมดจำลองเดิมไว้
 */
const PUBLIC_PREFIX = ['/a/', '/verify', '/label', '/api/'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ssoOn = !!(process.env.SSO_ISSUER && process.env.SSO_CLIENT_ID && process.env.SSO_CLIENT_SECRET);
  if (!ssoOn) return NextResponse.next();

  if (pathname === '/login' || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.cookies.get('fa_sso')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js)$).*)'],
};
