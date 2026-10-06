/**
 * GET /api/onebook/sync — ดึงบิลที่เป็นทรัพย์สิน (ลงบัญชีแล้ว) จาก ONEBOOK แล้ว map เป็น OARecord[]
 * ทำฝั่ง server เพื่อถือ token ไว้ปลอดภัย · client (store.syncOnebook) merge เข้าคิว (dedupe docNo)
 *
 * env: ONEBOOK_BASE_URL (เช่น https://onebook-gxyz.onrender.com), ONEBOOK_SYNC_KEY (= ASSET_SYNC_KEY ฝั่ง ONEBOOK)
 */
import { NextResponse } from 'next/server';
import { fetchAssetCandidates } from '@/lib/onebook';
import { mapOnebookCandidates } from '@/lib/onebook-mapping';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await fetchAssetCandidates();
    const records = mapOnebookCandidates(rows);
    return NextResponse.json({ pulledAt: new Date().toISOString(), candidateCount: rows.length, records });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg === 'ONEBOOK_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้ง ONEBOOK_BASE_URL / ONEBOOK_SYNC_KEY ใน env' },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
