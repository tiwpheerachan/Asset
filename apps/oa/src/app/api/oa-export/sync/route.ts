import { NextResponse } from "next/server";
import { syncOa, oaExportReady } from "@/lib/oa-export/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * ซิงก์ OA จาก Export API (incremental ต่อ cursor) — ให้ตัวตั้งเวลา (cron) เรียก
 * ป้องกันด้วย OA_SYNC_SECRET: ส่ง header `Authorization: Bearer <secret>` หรือ `?key=<secret>`
 *
 * ตัวอย่าง cron ทุก 10 นาที:
 *   curl -fsS -X POST "https://<host>/api/oa-export/sync" -H "Authorization: Bearer <secret>"
 */
async function run(req: Request) {
  const secret = (process.env.OA_SYNC_SECRET || "").trim();
  const url = new URL(req.url);
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  if (secret && given !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!oaExportReady()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 400 });
  }
  try {
    const r = await syncOa({ maxPages: 400 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }
