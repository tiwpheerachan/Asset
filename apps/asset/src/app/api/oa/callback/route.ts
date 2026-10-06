/**
 * POST /api/oa/callback — รายงานกลับไปยังระบบ OA ว่าได้ขึ้นทะเบียนทรัพย์สินแล้ว
 * body: { docNo, assetCode, assetUrl?, amount?, state? }
 *
 * เรียก OA: POST /api/v1/requests/{docNo}/accounting (ต้องใช้ write key)
 * ฝั่ง OA จะแสดงสถานะ "RECORDED" บนหน้าเอกสาร + แจ้งผู้ขอ
 */
import { NextResponse } from 'next/server';
import { OAClient, OAApiError, type OAExternalState } from '@shd/shared';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const baseUrl = process.env.OA_BASE_URL || 'http://localhost:3010';
  const apiKey = process.env.OA_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ยังไม่ได้ตั้ง OA_API_KEY' }, { status: 500 });
  }

  let body: {
    docNo?: string;
    assetCode?: string;
    assetUrl?: string;
    amount?: number;
    state?: OAExternalState;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.docNo) {
    return NextResponse.json({ error: 'ต้องระบุ docNo' }, { status: 400 });
  }

  const oa = new OAClient({ baseUrl, apiKey });
  try {
    const result = await oa.reportAccounting(body.docNo, {
      state: body.state ?? 'RECORDED',
      external_ref: body.assetCode,
      external_url: body.assetUrl,
      amount: body.amount,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OAApiError) {
      return NextResponse.json(
        { error: `OA callback ไม่สำเร็จ (${e.status})`, detail: e.body.slice(0, 300) },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
