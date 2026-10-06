/**
 * POST /api/onebook/post-depreciation — ส่งค่าเสื่อมราคาของงวดกลับไปลง GL ของ ONEBOOK
 * body: { company_id, period_end: 'YYYY-MM-DD', lines: [{ asset_account_code, amount, description }] }
 * client เตรียม lines จาก store (เฉพาะทรัพย์สินที่มาจาก ONEBOOK = มี glAccountCode/glCompanyId)
 */
import { NextResponse } from 'next/server';
import { postDepreciation, type DepLine } from '@/lib/onebook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { company_id, period_end, lines } = body || {};
  if (!company_id || !period_end || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'ต้องส่ง company_id, period_end และ lines อย่างน้อย 1 รายการ' }, { status: 400 });
  }
  try {
    const result = await postDepreciation(company_id, period_end, lines as DepLine[]);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    if (msg === 'ONEBOOK_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้ง ONEBOOK_BASE_URL / ONEBOOK_SYNC_KEY' }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
