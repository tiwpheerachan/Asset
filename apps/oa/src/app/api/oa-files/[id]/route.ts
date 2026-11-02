import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { oaExportConfig } from "@/lib/oa-export/client";

export const dynamic = "force-dynamic";

/**
 * Proxy เปิดไฟล์แนบจาก OA Export API — แนบ Bearer token ฝั่งเซิร์ฟเวอร์
 * ให้เว็บ OA เปิด/ดาวน์โหลดไฟล์ (PDF/รูป/Excel) ได้โดยไม่เปิดเผย token
 * เฉพาะผู้ใช้ที่ล็อกอิน (แอดมิน)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return new NextResponse("forbidden", { status: 403 });

  const { id } = await ctx.params;
  const fileId = String(id).replace(/[^0-9]/g, "");
  if (!fileId) return new NextResponse("bad id", { status: 400 });
  const forceDownload = new URL(req.url).searchParams.get("dl") === "1";

  const { base, key } = oaExportConfig();
  const upstream = await fetch(`${base}/api/export/v1/files/${fileId}`, {
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("ไม่พบไฟล์", { status: upstream.status || 404 });
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  const cl = upstream.headers.get("content-length");
  const cd = upstream.headers.get("content-disposition") || "";
  if (ct) headers.set("content-type", ct);
  if (cl) headers.set("content-length", cl);
  // แยกชื่อไฟล์จาก header ต้นทาง แล้วบังคับ "inline" เพื่อให้พรีวิวใน iframe/img ได้
  // (ต้นทางส่ง attachment มาเสมอ ทำให้เบราว์เซอร์บังคับดาวน์โหลด → iframe ว่าง)
  const fnStar = cd.match(/filename\*=(?:utf-8''|UTF-8'')?([^;]+)/i)?.[1];
  const fnPlain = cd.match(/filename="?([^";]+)"?/i)?.[1];
  const fnPart = fnStar ? `filename*=utf-8''${fnStar}` : fnPlain ? `filename="${fnPlain}"` : "";
  headers.set("content-disposition", `${forceDownload ? "attachment" : "inline"}${fnPart ? "; " + fnPart : ""}`);
  // อนุญาตให้ฝังในหน้าเดียวกัน (พรีวิวข้างๆ)
  headers.set("content-security-policy", "frame-ancestors 'self'");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "private, max-age=300");
  return new NextResponse(upstream.body, { status: 200, headers });
}
