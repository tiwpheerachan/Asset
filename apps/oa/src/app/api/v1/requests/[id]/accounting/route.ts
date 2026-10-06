import { resolveRequestId } from "@/lib/queries";
import { guard, isDenied, apiError, apiOk } from "@/lib/api-guard";
import { recordExternalStatus } from "@/lib/external-status";
import { EXTERNAL_STATES } from "@/lib/types";
import type { ExternalState } from "@/lib/types";

/**
 * ระบบบัญชีแจ้งกลับว่าทำถึงไหนแล้ว
 *
 *   curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
 *        -d '{"state":"PAID","external_ref":"OB-PV-2026-00871","occurred_at":"2026-09-20T08:00:00Z"}' \
 *        https://host/api/v1/requests/AP-MPRQ-202609-0001/accounting
 *
 * รับเลขที่เอกสารหรือ id ก็ได้ เหมือน GET ของใบเดียว — ระบบภายนอกรู้จักเอกสารด้วย
 * เลขที่ที่คนอ่านออก การบังคับให้แปลงเป็น id ก่อนแปลว่าต้องเก็บตารางแปลงไว้อีกชั้น
 *
 * ยิงซ้ำด้วยสถานะเดิมและเลขอ้างอิงเดิมได้ ไม่เกิดของซ้ำ (ตอบ created:false)
 */
type Body = {
  state?: string;
  external_ref?: string;
  external_url?: string;
  amount?: number;
  occurred_at?: string;
  note?: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { write: true });
  if (isDenied(g)) return g.res;

  const { id } = await params;
  const numeric = await resolveRequestId(id);
  if (!numeric) return apiError(404, `ไม่พบคำขอ "${id}"`);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiError(400, "อ่าน JSON ไม่ได้");
  }

  const state = String(body.state ?? "").trim().toUpperCase();
  if (!(EXTERNAL_STATES as readonly string[]).includes(state)) {
    return apiError(400, `ต้องระบุ "state" เป็นหนึ่งใน ${EXTERNAL_STATES.join(", ")}`, {
      states: EXTERNAL_STATES,
    });
  }

  const r = await recordExternalStatus({
    requestId: numeric,
    source: g.caller.name,
    state: state as ExternalState,
    externalRef: body.external_ref,
    externalUrl: body.external_url,
    amount: typeof body.amount === "number" ? body.amount : null,
    occurredAt: body.occurred_at,
    note: body.note,
  });

  if (!r.ok) return apiError(422, r.error);
  return apiOk({ created: r.created, data: r.status }, r.created ? 201 : 200);
}
