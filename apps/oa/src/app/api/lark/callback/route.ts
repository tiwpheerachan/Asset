import { NextResponse } from "next/server";
import { readVerified } from "@/lib/lark/verify";
import { getUserByLarkId } from "@/lib/lark/client";
import {
  decideFromLark, transferCancel, transferFromLark, transferPicker,
} from "@/lib/lark/decide";
import { larkConfig } from "@/lib/lark/config";
import { translator } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/locales";
import { cardReply, parseCardCallback } from "@/lib/lark/callback";

export const dynamic = "force-dynamic";

/**
 * ปลายทางที่ Lark เรียกกลับมา — ตั้งค่าใน Developer Console ทั้งสองที่:
 *   Event Subscription → Request URL
 *   Message Card → Request URL
 * ต้องเป็น URL ที่เข้าถึงได้จากอินเทอร์เน็ต (Lark ยิงมาจากคลาวด์ ไม่ใช่จากเครื่องผู้ใช้)
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const result = readVerified(req.headers, raw);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  const body = result.body;

  // 1) ตอน Lark ตรวจ URL ครั้งแรก
  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // 2) ผู้ใช้กดปุ่มบนการ์ด — รับได้ทั้ง payload แบบเดิมและแบบ card.action.trigger
  const hit = parseCardCallback(body);
  if (!hit) {
    // event อื่นๆ ที่เรายังไม่ได้ใช้ — ตอบ 200 ไม่งั้น Lark จะยิงซ้ำ
    return NextResponse.json({ ok: true });
  }

  const user = await getUserByLarkId(hit.openId);
  const locale = user && isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;
  const t = translator(locale);

  if (!user) {
    return NextResponse.json(
      cardReply(hit.v2, { type: "error", content: t("lark.err.noAccount") }),
    );
  }

  // ถ่ายโอนเป็นสองจังหวะ — จังหวะแรกแค่เปลี่ยนการ์ดเป็นรายชื่อ ยังไม่แตะข้อมูล
  const outcome =
    hit.act === "TRANSFER"
      ? (await transferPicker({ user: await user, requestId: hit.req, approverRowId: hit.ap }))
      : hit.act === "CANCEL"
        ? (await transferCancel({ user: await user, requestId: hit.req, approverRowId: hit.ap }))
        : hit.act === "TRANSFER_TO"
          ? await transferFromLark({ user: await user, requestId: hit.req, toId: hit.to })
          : await decideFromLark({
              user: await user,
              approverRowId: hit.ap,
              requestId: hit.req,
              decision: hit.act === "REJECT" ? "REJECT" : "APPROVE",
            });

  // ตอบกลับเป็น toast + การ์ดใหม่ ปุ่มจะได้หายไปทันทีในแชท
  return NextResponse.json(
    cardReply(
      hit.v2,
      { type: outcome.ok ? "success" : "error", content: t(outcome.messageKey) },
      outcome.card,
    ),
  );
}

/** เผื่อเปิดด้วยเบราว์เซอร์เพื่อเช็กว่า route มีอยู่จริง */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "lark-callback" });
}
