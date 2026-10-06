import "server-only";
import { NextResponse } from "next/server";
import { rateLimit, verifyApiKey, type Caller } from "./api-keys";

/**
 * ด่านหน้าของทุก endpoint ใน /api/v1
 *
 * คืนค่าเป็น Response เมื่อไม่ผ่าน และเป็นตัวผู้เรียกเมื่อผ่าน — ให้แต่ละ route
 * เขียนบรรทัดเดียวแล้วจบ ไม่ต้องจำว่าต้องตรวจอะไรบ้าง เพราะ endpoint ที่ลืมตรวจ
 * สักข้อคือช่องที่เปิดทิ้งไว้ทั้งบาน
 */
export type Guard = { caller: Caller } | { res: NextResponse };

export const isDenied = (g: Guard): g is { res: NextResponse } => "res" in g;

export function apiError(status: number, error: string, extra: object = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function guard(req: Request, { write = false } = {}): Promise<Guard> {
  const caller = await verifyApiKey(req.headers.get("x-api-key") ?? "");
  if (!caller) {
    return { res: apiError(401, "กุญแจไม่ถูกต้องหรือถูกเพิกถอนแล้ว (ส่งมาที่ header X-API-Key)") };
  }
  if (write && !caller.canWrite) {
    return { res: apiError(403, `กุญแจ "${caller.name}" เป็นสิทธิ์อ่านอย่างเดียว`) };
  }
  if (!rateLimit(caller.id)) {
    return { res: apiError(429, "เรียกถี่เกินกำหนด — ลองใหม่ในอีกหนึ่งนาที") };
  }
  return { caller: await caller };
}
