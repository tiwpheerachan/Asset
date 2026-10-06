import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { ssoConfig, ssoReady } from "@/lib/sso/config";
import { exchangeCode, fetchUserinfo, verifyIdToken } from "@/lib/sso/oidc";
import { provisionFromClaims } from "@/lib/sso/provision";
import { centralAuthzConfig, fetchEffective } from "@/lib/central/authz";
import { applyCentralRole } from "@/lib/central/role";

export const dynamic = "force-dynamic";

/** ระบบกลางส่งผู้ใช้กลับมาที่นี่พร้อม code */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cfg = ssoConfig();
  // บน Render req.url = http://localhost:PORT (host ภายใน) → ต้องใช้ APP_BASE_URL สร้าง URL ภายนอกจริง
  const base = cfg.baseUrl;
  const fail = (msg: string) => {
    const to = new URL("/login", base);
    to.searchParams.set("sso_error", msg);
    return NextResponse.redirect(to);
  };

  if (!ssoReady(cfg)) return fail("ยังไม่ได้ตั้งค่าการเชื่อมระบบกลาง");

  const err = url.searchParams.get("error");
  if (err) return fail(url.searchParams.get("error_description") || err);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("ข้อมูลตอบกลับไม่ครบ");

  const jar = await cookies();
  const savedState = jar.get("sso_state")?.value;
  const nonce = jar.get("sso_nonce")?.value ?? "";
  const verifier = jar.get("sso_verifier")?.value;
  const next = jar.get("sso_next")?.value ?? "/";

  // ล้าง cookie ชั่วคราวทิ้งเสมอ ไม่ว่าจะสำเร็จหรือไม่
  for (const k of ["sso_state", "sso_nonce", "sso_verifier", "sso_next"]) jar.delete(k);

  if (!savedState || savedState !== state) return fail("state ไม่ตรง — ลองล็อกอินใหม่อีกครั้ง");
  if (!verifier) return fail("เซสชันล็อกอินหมดอายุ — ลองใหม่อีกครั้ง");

  try {
    const tokens = await exchangeCode(code, verifier, cfg);
    const claims = await verifyIdToken(tokens.id_token, nonce, cfg);

    // roles/groups อาจอยู่ที่ userinfo แทน id_token แล้วแต่การตั้งค่าฝั่งระบบกลาง
    const extra = claims.roles || claims.groups ? {} : await fetchUserinfo(tokens.access_token, cfg);

    const { user } = await provisionFromClaims(claims, extra);
    if (!user.active) return fail("บัญชีนี้ถูกปิดใช้งาน");

    // ให้ระบบกลางเป็นคนตัดสินบทบาท (เปิดด้วย CENTRAL_AUTHZ=true)
    //
    // ระบบกลางไม่ตอบ = ยังไม่รู้คำตอบ ไม่ใช่ไม่มีสิทธิ์ — ปล่อยให้เข้าด้วยบทบาทเดิม
    // ที่เก็บไว้ในแอป ดีกว่าล็อกทุกคนออกจากระบบตอนระบบกลางสะดุด
    let session = user;
    if (centralAuthzConfig().enforce) {
      const r = await fetchEffective(user.email || String(claims.sub));
      if ((r.state === "ok" || r.state === "stale") && !r.perms.hasAccess) {
        return fail("บัญชีนี้ยังไม่ได้รับสิทธิ์ให้ใช้ระบบขออนุมัติ — ติดต่อผู้ดูแลระบบกลาง");
      }
      if (r.state === "ok") session = (await applyCentralRole(user, r.perms)).user;
      else if (r.state === "misconfigured") console.error(`[central] ${r.detail}`);
    }

    // เก็บ id_token ไว้กับเซสชัน เพื่อยื่นคืนตอนออกจากระบบ (ดู logoutAction)
    await createSession(session.id, tokens.id_token);
    return NextResponse.redirect(new URL(next, base));
  } catch (e) {
    return fail((e as Error).message);
  }
}
