import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestPayload } from "@/lib/integration";
import { guard, isDenied, apiError, apiOk } from "@/lib/api-guard";
import { createRequest } from "@/lib/create-request";
import { getActiveFields, getTemplate, listActiveUsers } from "@/lib/queries";
import { inputName, isValueField, rangeName, isRange } from "@/lib/form";
import { flushInBackground } from "@/lib/lark/notify";

/**
 * ให้ระบบภายนอกดึงคำขอไปใช้ — สำหรับปลายทางที่รับ webhook ไม่ได้ ต้องตั้ง job มาดูดเอง
 *
 *   curl -H "X-API-Key: $API_KEY" "http://host/api/v1/requests?status=APPROVED&since=2026-08-01"
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "APPROVED";
  const since = sp.get("since") ?? "";
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 100)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));

  const where = ["r.status = @status"];
  if (since) where.push("sql_ts(r.closed_at) >= sql_ts(@since)");

  const ids = (await db
    .prepare(
      `SELECT r.id FROM requests r WHERE ${where.join(" AND ")}
        ORDER BY r.id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ status, since, limit, offset })) as { id: number }[];

  const total = (
    (await db.prepare(`SELECT COUNT(*) AS n FROM requests r WHERE ${where.join(" AND ")}`)
      .get({ status, since })) as { n: number }
  ).n;

  return NextResponse.json(
    {
      total,
      count: ids.length,
      offset,
      data: (await Promise.all(ids.map((x) => requestPayload(x.id)))).filter(Boolean),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * สร้างคำขอจากระบบภายนอก
 *
 *   curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
 *        -d '{"template":"PURCHASE","requester":"somchai@shd-technology.co.th",
 *             "submit":true,"fields":{"subject":"ซื้อโน้ตบุ๊ก","amount":45000}}' \
 *        https://host/api/v1/requests
 *
 * ค่าที่ส่งมาถูกแปลงเป็น FormData ก่อนเข้าตัวสร้างตัวเดียวกับหน้าเว็บ — กติกาทุกข้อ
 * (ช่องบังคับ ชนิดข้อมูล ยื่นล่วงหน้า วงเงินใบหลัก สายอนุมัติ) จึงบังคับใช้เหมือนกัน
 * ไม่ใช่ทางลัดที่ข้ามด่านที่คนกรอกต้องผ่าน
 *
 * เจาะจงว่า "เอกสารนี้เป็นของใคร" เสมอ เพราะสายอนุมัติคิดจากผู้จัดทำ — ระบบภายนอก
 * ไม่ใช่พนักงาน จึงยืมตัวตนใครไม่ได้ถ้าไม่ได้ระบุมา
 */
type CreateBody = {
  template?: string;
  requester?: string;
  submit?: boolean;
  urgent_reason?: string;
  fields?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const g = await guard(req, { write: true });
  if (isDenied(g)) return g.res;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return apiError(400, "อ่าน JSON ไม่ได้");
  }

  const code = String(body.template ?? "").trim();
  if (!code) return apiError(400, 'ต้องระบุ "template" เป็นรหัสฟอร์ม (ดูจาก GET /api/v1/templates)');

  const row = (await db
    .prepare("SELECT id FROM form_templates WHERE code=? AND active=1")
    .get(code)) as { id: number } | undefined;
  const template = row ? await getTemplate(row.id) : null;
  if (!template) return apiError(404, `ไม่พบฟอร์มรหัส "${code}" หรือฟอร์มถูกปิดใช้งาน`);

  const who = String(body.requester ?? "").trim().toLowerCase();
  if (!who) return apiError(400, 'ต้องระบุ "requester" เป็นอีเมลของผู้จัดทำเอกสาร');
  const requester = (await listActiveUsers()).find((u) => u.email.toLowerCase() === who);
  if (!requester) return apiError(404, `ไม่พบผู้ใช้อีเมล "${who}" หรือบัญชีถูกปิดใช้งาน`);

  const fields = await getActiveFields(template.id);
  const values = body.fields ?? {};

  // ส่งรหัสช่องที่ฟอร์มไม่มีมา = ปลายทางเข้าใจฟอร์มผิด ตอบให้รู้ตัวดีกว่าเก็บเงียบ
  const known = new Set(fields.filter(isValueField).map((f) => f.field_key));
  const unknown = Object.keys(values).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    return apiError(400, `ไม่มีช่องเหล่านี้ในฟอร์ม: ${unknown.join(", ")}`, {
      known: [...known],
    });
  }

  const form = new FormData();
  form.set("template_id", String(template.id));
  for (const f of fields) {
    if (!isValueField(f)) continue;
    const v = values[f.field_key];
    if (v === undefined) continue;

    if (f.type === "DATERANGE" && isRange(v)) {
      form.set(rangeName(f.field_key, "from"), String(v.from ?? ""));
      form.set(rangeName(f.field_key, "to"), String(v.to ?? ""));
    } else if (f.type === "MULTISELECT" && Array.isArray(v)) {
      for (const one of v) form.append(inputName(f.field_key), String(one));
    } else if (f.type === "TABLE") {
      form.set(inputName(f.field_key), JSON.stringify(Array.isArray(v) ? v : []));
    } else {
      form.set(inputName(f.field_key), String(v ?? ""));
    }
  }

  const r = (await createRequest({
    template,
    requester,
    actorId: null,
    form,
    submit: body.submit !== false,
    urgentReason: String(body.urgent_reason ?? "").trim(),
    source: g.caller.name,
  }));

  if (!r.ok) {
    // ข้อความสรุปของหน้าเว็บชี้ให้ "ดูข้อความสีแดงใต้ช่อง" ซึ่งไม่มีความหมายกับเครื่อง
    // ฝั่ง API ชี้ไปที่ fields แทน เพราะรายละเอียดรายช่องอยู่ตรงนั้น
    const count = Object.keys(r.fieldErrors ?? {}).length;
    const error = count > 1 ? `ยังกรอกไม่ครบ ${count} ช่อง — ดูรายละเอียดใน fields` : r.error;
    return apiError(422, error, r.fieldErrors ? { fields: r.fieldErrors } : {});
  }

  flushInBackground();
  return apiOk({ data: (await requestPayload(r.id)) }, 201);
}
