import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";

/** เสิร์ฟรูปลายเซ็น — เฉพาะไฟล์ที่ชื่อขึ้นต้นด้วย sig- เท่านั้น กันใช้ช่องนี้อ่านไฟล์แนบอื่น */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { name } = await params;
  const safe = path.basename(name);
  if (!/^sig-\d+-[a-f0-9]+\.(png|jpg|webp)$/.test(safe)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = await getFile(safe);
  if (!buf) return new NextResponse("Not found", { status: 404 });

  const ext = path.extname(safe);
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
