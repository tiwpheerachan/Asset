/**
 * GET /api/peak/sync — ดึง "การซื้อทรัพย์สิน" (บัญชี 1241xx) จาก PEAK แล้ว map เป็น OARecord[]
 * client (store.syncPeak) merge เข้าคิว OA Import (dedupe docNo) → รีวิว → ขึ้นทะเบียน + คิดค่าเสื่อม
 *
 * แหล่งข้อมูล (เลือกด้วย env PEAK_SOURCE):
 *   • "mcp" (ค่าเริ่มต้น) — อ่านจาก snapshot ที่ Claude ดึงผ่าน PEAK MCP (read-only) วางไว้ในแอป
 *                           ใช้งานได้ทั้ง dev/prod โดยไม่ต้องตั้ง credential ใด ๆ
 *   • "rest"              — ยิง PEAK Open API สด (ต้องตั้ง PEAK_BASE_URL/CONNECT_ID/APP_PASSWORD/USER_TOKEN)
 *
 * query (ไม่บังคับ): ?from=YYYY-MM-DD&to=YYYY-MM-DD (REST: ค่าเริ่มต้น 90 วันล่าสุด · MCP: ทั้ง snapshot)
 */
import { NextResponse } from 'next/server';
import { mapPeakCandidates } from '@/lib/peak-mapping';
import { loadSnapshotCandidates, peakSnapshotMeta } from '@/lib/peak-mcp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const source = (process.env.PEAK_SOURCE || 'mcp').toLowerCase();
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    if (source === 'rest') {
      // ยิง PEAK Open API สด (HMAC + token 2 ชั้น) — import แบบ dynamic กันโหลด server-only ตอนใช้ MCP
      const { fetchAssetCandidates } = await import('@/lib/peak');
      const rows = await fetchAssetCandidates({ from, to });
      const records = mapPeakCandidates(rows);
      return NextResponse.json({ source: 'rest', pulledAt: new Date().toISOString(), candidateCount: rows.length, records });
    }

    // ค่าเริ่มต้น: อ่านจาก snapshot ของ PEAK MCP
    const rows = loadSnapshotCandidates({ from, to });
    const records = mapPeakCandidates(rows);
    const meta = peakSnapshotMeta();
    return NextResponse.json({
      source: 'mcp',
      pulledAt: meta.pulledAt,
      snapshotRange: meta.range,
      accountSummary: meta.accountSummary,
      candidateCount: rows.length,
      records,
    });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg === 'PEAK_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'โหมด REST: ยังไม่ได้ตั้งค่า PEAK ใน env (PEAK_BASE_URL / PEAK_CONNECT_ID / PEAK_APP_PASSWORD / PEAK_USER_TOKEN) — หรือใช้ PEAK_SOURCE=mcp (ค่าเริ่มต้น)' },
        { status: 500 },
      );
    }
    if (msg === 'PEAK_CREDIT_OR_RATE') {
      return NextResponse.json(
        { error: 'เครดิต PEAK API หมดหรือถูกจำกัดอัตราการเรียก — หยุดการดึงชั่วคราว (เติมเครดิต/รอสักครู่แล้วลองใหม่)' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
