import { requestPayload } from "@/lib/integration";
import { guard, isDenied, apiError, apiOk } from "@/lib/api-guard";
import { resolveRequestId } from "@/lib/queries";

/**
 * ดูคำขอใบเดียว — รับได้ทั้ง id ภายในและเลขที่เอกสาร
 *
 * ระบบภายนอกรู้จักเอกสารด้วย "เลขที่" ที่คนอ่านออก (AP-PUR-202609-0007) ไม่ใช่ id
 * ในฐานข้อมูลของเรา การบังคับให้แปลงเป็น id ก่อนแปลว่าต้องเก็บ mapping ไว้อีกชั้น
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  const { id } = await params;
  const data = await requestPayload(await resolveRequestId(id));
  if (!data) return apiError(404, `ไม่พบคำขอ "${id}"`);
  return apiOk({ data });
}
