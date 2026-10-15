/**
 * GET /api/peak/sync — ดึงค่าใช้จ่ายที่เป็นทรัพย์สิน (บัญชี 12xx) จาก PEAK บัญชีหลัก แล้ว map เป็น OARecord[]
 * ทำฝั่ง server เพื่อถือ token/secret ไว้ปลอดภัย · client (store.syncPeak) merge เข้าคิว (dedupe docNo)
 *
 * query (ไม่บังคับ): ?from=YYYY-MM-DD&to=YYYY-MM-DD (ค่าเริ่มต้น = 90 วันล่าสุด)
 * env: PEAK_BASE_URL, PEAK_CONNECT_ID, PEAK_APP_PASSWORD, PEAK_USER_TOKEN, PEAK_ASSET_ACCOUNT_PREFIXES
 */
import { NextResponse } from 'next/server';
import { fetchAssetCandidates } from '@/lib/peak';
import { mapPeakCandidates } from '@/lib/peak-mapping';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const rows = await fetchAssetCandidates({ from, to });
    const records = mapPeakCandidates(rows);
    return NextResponse.json({ pulledAt: new Date().toISOString(), candidateCount: rows.length, records });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg === 'PEAK_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่า PEAK ใน env (PEAK_BASE_URL / PEAK_CONNECT_ID / PEAK_APP_PASSWORD / PEAK_USER_TOKEN)' },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
