import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ssoConfig, ssoReady } from "@/lib/sso/config";
import { authorizeUrl, createPkce, randomToken } from "@/lib/sso/oidc";

export const dynamic = "force-dynamic";

const TEN_MIN = 60 * 10;

/** เริ่มล็อกอินผ่านระบบกลาง — เก็บ state/nonce/PKCE ไว้ใน cookie ชั่วคราว */
export async function GET(req: Request) {
  const cfg = ssoConfig();
  // บน Render req.url = host ภายใน (localhost:PORT) → ใช้ APP_BASE_URL สร้าง URL ภายนอก
  const base = cfg.baseUrl;
  if (!ssoReady(cfg)) {
    return NextResponse.redirect(new URL("/login?sso=unconfigured", base));
  }

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = createPkce();

  const next = new URL(req.url).searchParams.get("next") ?? "/";
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TEN_MIN,
    secure: process.env.NODE_ENV === "production",
  };
  jar.set("sso_state", state, opts);
  jar.set("sso_nonce", nonce, opts);
  jar.set("sso_verifier", verifier, opts);
  jar.set("sso_next", next.startsWith("/") ? next : "/", opts);

  try {
    return NextResponse.redirect(await authorizeUrl({ state, nonce, challenge, cfg }));
  } catch (e) {
    const u = new URL("/login", base);
    u.searchParams.set("sso_error", (e as Error).message);
    return NextResponse.redirect(u);
  }
}
