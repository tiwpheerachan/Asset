import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";

/**
 * ให้ cron ของเครื่อง (หรือ Task Scheduler) สั่งสำรองข้อมูลได้
 * ตัวระบบมีตัวตั้งเวลาในตัวอยู่แล้ว ทางนี้ไว้สำหรับที่ที่อยากคุมเวลาเองจากภายนอก
 *
 *   curl -fsS -X POST -H "X-Backup-Token: $BACKUP_TOKEN" http://localhost:3001/api/backup/run
 */
export async function POST(req: Request) {
  const expected = process.env.BACKUP_TOKEN ?? "";
  if (!expected) return NextResponse.json({ error: "ยังไม่ได้ตั้ง BACKUP_TOKEN" }, { status: 503 });

  const got = req.headers.get("x-backup-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // เทียบแบบเวลาคงที่ กันการเดาโทเคนทีละไบต์จากเวลาที่ตอบกลับ
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "โทเคนไม่ถูกต้อง" }, { status: 401 });
  }

  const r = await runBackup("CRON");
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
