import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";

/**
 * เสิร์ฟรูปไอคอนของฟอร์มที่ผู้ดูแลอัปโหลดไว้
 *
 * รับเฉพาะชื่อไฟล์ที่ขึ้นต้นด้วย ico- เท่านั้น — โฟลเดอร์อัปโหลดเดียวกันนี้เก็บ
 * ไฟล์แนบของเอกสารด้วย ถ้าไม่จำกัดรูปแบบชื่อ ช่องนี้จะกลายเป็นทางลัดอ่านไฟล์แนบ
 * ของคนอื่นโดยไม่ผ่านการตรวจสิทธิ์ของเอกสาร
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { name } = await params;
  const safe = path.basename(name);
  if (!/^ico-\d+-[a-f0-9]+\.(png|jpg|webp|svg)$/.test(safe)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = await getFile(safe);
  if (!buf) return new NextResponse("Not found", { status: 404 });

  const ext = path.extname(safe);
  const mime =
    ext === ".png" ? "image/png"
      : ext === ".webp" ? "image/webp"
        : ext === ".svg" ? "image/svg+xml"
          : "image/jpeg";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      // ไอคอนฟอร์มเปลี่ยนไม่บ่อย แคชได้นานกว่าลายเซ็น
      "Cache-Control": "private, max-age=3600",
      // SVG รันสคริปต์ได้ถ้าเปิดตรง ๆ — สองหัวนี้ปิดทางนั้นทั้งคู่
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
