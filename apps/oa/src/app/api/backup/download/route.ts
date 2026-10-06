import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { snapshotPath } from "@/lib/backup";

/** ให้ผู้ดูแลดาวน์โหลดสำเนาไปเก็บนอกเครื่อง — สำเนาที่อยู่เครื่องเดียวกับต้นฉบับยังไม่ปลอดภัยพอ */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const name = new URL(req.url).searchParams.get("name") ?? "";
  const file = snapshotPath(name);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const buf = await fs.readFile(file).catch(() => null);
  if (!buf) return new NextResponse("File missing on disk", { status: 410 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
