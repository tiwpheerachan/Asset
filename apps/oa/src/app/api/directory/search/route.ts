import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchDirectory } from "@/lib/directory";

// GET /api/directory/search?q=...
//
// ใช้ในตัวสร้างฟอร์มตอนพิมพ์ชื่อเลือกผู้อนุมัติ · เฉพาะผู้ดูแล (คนที่ออกแบบฟอร์ม)
// API key ของระบบกลางถูกแนบฝั่งเซิร์ฟเวอร์ใน searchDirectory() เบราว์เซอร์ไม่เคยเห็น
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const result = await searchDirectory(q);

  const status = result.ok
    ? 200
    : result.error === "query_too_short"
      ? 400
      : result.error === "not_configured"
        ? 503
        : 502;
  return NextResponse.json(result, { status });
}
