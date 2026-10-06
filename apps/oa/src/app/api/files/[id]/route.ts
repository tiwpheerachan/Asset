import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { canView, getRequest } from "@/lib/queries";

export async function GET(
  httpReq: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const file = (await db.prepare("SELECT * FROM attachments WHERE id = ?").get(Number(id))) as
    | { request_id: number; filename: string; stored_name: string; mime: string }
    | undefined;
  if (!file) return new NextResponse("Not found", { status: 404 });

  const req = await getRequest(file.request_id);
  if (!req || !(await canView(req, user))) return new NextResponse("Forbidden", { status: 403 });

  // stored_name ถูกสร้างจาก randomBytes เสมอ แต่กัน path traversal ไว้อีกชั้น
  const safe = path.basename(file.stored_name);
  const buf = await getFile(safe);
  if (!buf) return new NextResponse("File missing on disk", { status: 410 });

  // ชนิดไฟล์มาจากเบราว์เซอร์ของผู้อัปโหลด เชื่อไม่ได้ — ถ้าปล่อยให้เสิร์ฟเป็น text/html
  // หรือ image/svg+xml แบบ inline จะกลายเป็นช่องรันสคริปต์ในโดเมนของระบบเอง
  const inlineSafe = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf",
  ]);
  // ?download=1 มาจากปุ่มดาวน์โหลด — คนกดตั้งใจจะเก็บไฟล์ ไม่ใช่เปิดดู
  // บังคับเป็นไฟล์แนบตรงนี้เพราะแอตทริบิวต์ download ฝั่งเบราว์เซอร์เชื่อไม่ได้ทุกตัว
  const wantsDownload = new URL(httpReq.url).searchParams.get("download") === "1";
  const canInline = inlineSafe.has(file.mime) && !wantsDownload;
  const filename = encodeURIComponent(file.filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": canInline ? file.mime : "application/octet-stream",
      "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      // กันเบราว์เซอร์เดาชนิดไฟล์เอง และห้ามรันสคริปต์ใดๆ จาก response นี้
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
