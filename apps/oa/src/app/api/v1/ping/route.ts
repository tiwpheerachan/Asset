import { guard, isDenied, apiOk } from "@/lib/api-guard";
import { webhookConfig } from "@/lib/integration";
import { RATE_PER_MIN } from "@/lib/api-keys";
import { EXTERNAL_STATES } from "@/lib/types";

/**
 * ตรวจว่ากุญแจใช้ได้ไหม โดยไม่ต้องไปดึงข้อมูลจริง
 *
 * คนที่กำลังต่อระบบต้องแยกให้ออกระหว่าง "กุญแจผิด" กับ "เรียก endpoint ผิด" กับ
 * "ยังไม่มีข้อมูลให้ดึง" — ถ้าไม่มีที่ให้เคาะประตูเฉย ๆ เขาจะต้องไปลองกับ endpoint
 * ที่มีข้อมูลจริงแล้วเดาเอาจากผลลัพธ์ว่าติดตรงไหน
 *
 * ตอบกลับด้วยสิ่งที่ต้องรู้ตอนตั้งค่า: กุญแจนี้ชื่ออะไร เขียนได้ไหม เวลาเครื่องเท่าไร
 * (ไว้เทียบกับ sent_at ในข้อความที่ส่งออก) และระบบนี้รองรับเหตุการณ์อะไรบ้าง
 *
 *   curl -H "X-API-Key: $KEY" https://host/api/v1/ping
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  return apiOk({
    ok: true,
    now: new Date().toISOString(),
    caller: { name: g.caller.name, can_write: g.caller.canWrite },
    rate_limit_per_min: RATE_PER_MIN,
    webhook: {
      // ไม่บอก URL ปลายทาง — ระบบที่เรียกเข้ามาไม่จำเป็นต้องรู้ว่าเราส่งออกไปที่ไหน
      configured: Boolean(webhookConfig().url),
      signed: Boolean(webhookConfig().secret),
      events: webhookConfig().events,
    },
    accounting_states: EXTERNAL_STATES,
    endpoints: [
      "GET  /api/v1/ping",
      "GET  /api/v1/templates",
      "GET  /api/v1/users",
      "GET  /api/v1/requests",
      "GET  /api/v1/requests/{id|doc_no}",
      "POST /api/v1/requests",
      "GET  /api/v1/files/{id}",
      "POST /api/v1/requests/{id|doc_no}/accounting",
    ],
  });
}
