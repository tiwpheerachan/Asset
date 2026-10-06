import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFile } from "@/lib/storage";
import { guard, isDenied, apiError } from "@/lib/api-guard";

/**
 * ให้ระบบภายนอกดาวน์โหลดไฟล์แนบด้วยกุญแจ API
 *
 * แยกจาก /api/files/{id} ที่หน้าเว็บใช้ตั้งใจ — อันนั้นตรวจสิทธิ์ราย "คน" ว่าผู้ใช้
 * คนนี้มองเห็นเอกสารใบนี้ไหม ซึ่งไม่มีความหมายกับระบบภายนอกที่ไม่ใช่พนักงานคนใด
 * การเอากุญแจ API ไปเสียบในด่านเดิมจะกลายเป็นการเจาะรูบนกฎการมองเห็นของทั้งระบบ
 *
 *   curl -H "X-API-Key: $KEY" https://host/api/v1/files/9 -o ใบเสนอราคา.pdf
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  const { id } = await params;
  const file = (await db
    .prepare("SELECT filename, stored_name, mime FROM attachments WHERE id = ?")
    .get(Number(id))) as { filename: string; stored_name: string; mime: string } | undefined;
  if (!file) return apiError(404, `ไม่พบไฟล์แนบหมายเลข "${id}"`);

  // stored_name ถูกสร้างจาก randomBytes เสมอ แต่กัน path traversal ไว้อีกชั้น
  const buf = await getFile(path.basename(file.stored_name));
  if (!buf) return apiError(410, "ไฟล์หายจากที่เก็บแล้ว");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      // ส่งเป็นไฟล์แนบเสมอ ไม่เปิดแสดงในเบราว์เซอร์ — ปลายทางคือเครื่อง ไม่ใช่คนดู
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
