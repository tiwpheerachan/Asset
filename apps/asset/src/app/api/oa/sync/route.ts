/**
 * GET /api/oa/sync — ดึงคำขอที่อนุมัติแล้วจากระบบ OA แล้ว map เป็น OARecord[]
 *
 * ทำงานฝั่ง server เพื่อถือ OA API key ไว้ปลอดภัย (ไม่หลุดไป browser)
 * client (store.tsx → syncOA) เรียก route นี้แล้ว merge เข้า localStorage (dedupe ด้วย docNo)
 *
 * env ที่ใช้:
 *   OA_BASE_URL   เช่น http://localhost:3010 (prod: https://oa.shd-technology.co.th)
 *   OA_API_KEY    ia_... (ควรเป็น write key เพื่อส่ง callback กลับได้)
 *   OA_TEMPLATE   รหัสฟอร์มที่ถือเป็น "ขอซื้อทรัพย์สิน" (default: PURCHASE)
 */
import { NextResponse } from 'next/server';
import { OAClient, OAApiError } from '@shd/shared';
import { mapOARequests } from '@/lib/oa-mapping';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const baseUrl = process.env.OA_BASE_URL || 'http://localhost:3010';
  const apiKey = process.env.OA_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้ง OA_API_KEY — ออก API key จากหน้า "เชื่อมต่อระบบภายนอก" ของ OA แล้วใส่ใน env' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? undefined;
  const template = process.env.OA_TEMPLATE || 'PURCHASE';

  const oa = new OAClient({ baseUrl, apiKey });

  try {
    // ดึงทีละหน้า จนครบ
    const all = [];
    let offset = 0;
    const limit = 200;
    for (;;) {
      const page = await oa.listRequests({ status: 'APPROVED', since, limit, offset });
      all.push(...page.data);
      offset += page.data.length;
      if (offset >= page.total || page.data.length === 0) break;
    }

    // สนใจเฉพาะฟอร์มขอซื้อทรัพย์สิน (ถ้าตั้ง OA_TEMPLATE='*' = เอาทุกฟอร์ม)
    const filtered = template === '*' ? all : all.filter((r) => r.type?.code === template);
    const records = mapOARequests(filtered);

    return NextResponse.json({
      source: baseUrl,
      pulledAt: new Date().toISOString(),
      template,
      requestCount: filtered.length,
      records,
    });
  } catch (e) {
    if (e instanceof OAApiError) {
      return NextResponse.json(
        { error: `เรียก OA API ไม่สำเร็จ (${e.status})`, detail: e.body.slice(0, 300) },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
