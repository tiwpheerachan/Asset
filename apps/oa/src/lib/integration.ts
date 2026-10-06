import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { getApprovers, getRequest } from "./queries";
import { parseJson, type FormValues } from "./form";
import { listIssued } from "./issue";

/**
 * ช่องต่อกับระบบภายนอก (ERP / บัญชี)
 *
 * ทำสองทางเพราะระบบปลายทางแต่ละที่ถนัดคนละแบบ:
 *   ขาออก  ยิง webhook ทันทีที่มีเหตุการณ์ — เหมาะกับระบบที่รับ push ได้
 *   ขาเข้า  เปิด REST ให้มาดึงเอง — เหมาะกับระบบเก่าที่ยิงออกไม่ได้ ต้องตั้ง job มาดูด
 *
 * ตัวข้อมูลเป็นรูปแบบกลางของระบบนี้ ไม่ได้ผูกกับ ERP ยี่ห้อใด
 * การแปลงเป็นรูปแบบเฉพาะของปลายทางเป็นหน้าที่ของฝั่งนั้น หรือทำเพิ่มเมื่อรู้ว่าใช้ตัวไหน
 */

export const webhookConfig = () => ({
  url: process.env.WEBHOOK_URL || "",
  secret: process.env.WEBHOOK_SECRET || "",
  events: (process.env.WEBHOOK_EVENTS || "request.approved,request.rejected,document.issued")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  apiKey: process.env.API_KEY || "",
});

export const webhookReady = () => Boolean(webhookConfig().url);
export const apiReady = () => Boolean(webhookConfig().apiKey);

/* ---------- รูปแบบข้อมูลกลาง ---------- */

export async function requestPayload(requestId: number): Promise<Record<string, unknown> | null> {
  const r = await getRequest(requestId);
  if (!r) return null;

  return {
    id: r.id,
    doc_no: r.doc_no,
    type: { id: r.template_id, code: r.template_code, name: r.template_name },
    title: r.title,
    amount: r.amount,
    doc_date: r.doc_date,
    status: r.status,
    requester: {
      id: r.requester_id,
      name: r.requester_name,
      department: r.requester_department,
      position: r.requester_position,
    },
    submitted_at: r.submitted_at,
    closed_at: r.closed_at,
    fields: parseJson<FormValues>(r.data, {}),
    approvals: (await getApprovers(r.id))
      .filter((a) => a.kind === "APPROVE")
      .map((a) => ({
        step: a.step_no,
        stage: a.stage,
        name: a.name,
        status: a.status,
        acted_at: a.acted_at,
        acted_by: a.acted_by_name ?? null,
        comment: a.comment,
      })),
    documents: (await listIssued(r.id)).map((d) => ({
      number: d.doc_number,
      type: d.doc_type,
      issued_at: d.issued_at,
      void: Boolean(d.void),
    })),
    // ระบบบัญชีต้องใช้ใบเสนอราคา/ใบเสร็จที่แนบมาทำเอกสารต่อ การส่งแต่ข้อความไปให้
    // แปลว่าเขาต้องกลับมาเปิดเว็บเราดูเองอยู่ดี ซึ่งทำให้การเชื่อมระบบเสียความหมาย
    //
    // url เป็นเส้นทางสัมพัทธ์ ไม่ใช่ลิงก์เต็ม เพราะโดเมนต่างกันตามที่ติดตั้ง
    // ปลายทางเอาไปต่อกับโดเมนที่ตัวเองใช้เรียกอยู่แล้ว และต้องแนบกุญแจ API ไปด้วย
    attachments: (await attachmentsOf(r.id)).map((f) => ({
      id: f.id,
      filename: f.filename,
      mime: f.mime,
      size: f.size,
      field_key: f.field_key,
      uploaded_by: f.uploader_email,
      created_at: f.created_at,
      url: `/api/v1/files/${f.id}`,
    })),
  };
}

type AttachmentRow = {
  id: number;
  filename: string;
  mime: string;
  size: number;
  field_key: string;
  uploader_email: string;
  created_at: string;
};

/**
 * ไฟล์แนบของคำขอหนึ่งใบ พร้อมอีเมลคนอัปโหลด
 *
 * ใช้อีเมลไม่ใช่ชื่อ เพราะเป็นค่าเดียวที่เทียบตัวบุคคลข้ามระบบได้จริง —
 * ชื่อคนซ้ำกันได้และสะกดไม่เหมือนกันในแต่ละระบบ
 */
async function attachmentsOf(requestId: number): Promise<AttachmentRow[]> {
  return (await db
    .prepare(
      `SELECT a.id, a.filename, a.mime, a.size, a.field_key, a.created_at,
              u.email AS uploader_email
         FROM attachments a
         JOIN users u ON u.id = a.uploaded_by
        WHERE a.request_id = ?
        ORDER BY a.id`,
    )
    .all(requestId)) as AttachmentRow[];
}

/* ---------- ขาออก ---------- */

export async function enqueueWebhook(event: string, requestId: number, extra: Record<string, unknown> = {}) {
  const cfg = webhookConfig();
  if (!cfg.url || !cfg.events.includes(event)) return;

  const data = await requestPayload(requestId);
  if (!data) return;

  await db.prepare("INSERT INTO webhook_deliveries (event, request_id, payload) VALUES (?,?,?)").run(
    event,
    requestId,
    JSON.stringify({ event, sent_at: new Date().toISOString(), request: data, ...extra }),
  );
}

export type FlushResult = { sent: number; failed: number };

export async function flushWebhooks(limit = 20): Promise<FlushResult> {
  const cfg = webhookConfig();
  if (!cfg.url) {
    await db.prepare(
      "UPDATE webhook_deliveries SET status='SKIPPED', error='ยังไม่ได้ตั้งค่า WEBHOOK_URL' WHERE status='PENDING'",
    ).run();
    return { sent: 0, failed: 0 };
  }

  const rows = (await db
    .prepare(
      "SELECT id, payload, attempts FROM webhook_deliveries WHERE status='PENDING' AND attempts < 5 ORDER BY id LIMIT ?",
    )
    .all(limit)) as { id: number; payload: string; attempts: number }[];

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // ติดเลขอ้างอิงของการส่งครั้งนี้ไปด้วย ให้ปลายทางกันของซ้ำได้แม่นยำกว่าการเดา
      // จากเนื้อข้อมูล และเวลาสองฝั่งมาเทียบ log กันจะชี้ได้ว่าพูดถึงครั้งไหน
      //
      // ประกอบตอนส่ง ไม่ใช่ตอนเข้าคิว เพราะ attempt เปลี่ยนทุกครั้งที่ลองใหม่
      const body = JSON.stringify({
        delivery_id: row.id,
        attempt: row.attempts + 1,
        ...(JSON.parse(row.payload) as Record<string, unknown>),
      });

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.secret) {
        // ลงลายมือชื่อ payload เพื่อให้ปลายทางพิสูจน์ได้ว่ามาจากระบบนี้จริง ไม่ใช่ใครก็ยิงได้
        headers["X-Signature-256"] = `sha256=${crypto
          .createHmac("sha256", cfg.secret)
          .update(body)
          .digest("hex")}`;
      }

      const res = await fetch(cfg.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        await db.prepare(
          "UPDATE webhook_deliveries SET status='SENT', http_code=?, sent_at=utc_now_text(), attempts=attempts+1, error='' WHERE id=?",
        ).run(res.status, row.id);
        sent++;
      } else {
        await db.prepare(
          "UPDATE webhook_deliveries SET status='PENDING', http_code=?, attempts=attempts+1, error=? WHERE id=?",
        ).run(res.status, `HTTP ${res.status}`, row.id);
        failed++;
      }
    } catch (e) {
      await db.prepare(
        "UPDATE webhook_deliveries SET status='PENDING', attempts=attempts+1, error=? WHERE id=?",
      ).run((e as Error).message.slice(0, 300), row.id);
      failed++;
    }
  }

  // ครบ 5 ครั้งแล้วยังไม่ผ่าน ถือว่าล้มเหลวถาวร ให้ผู้ดูแลเห็นชัดแทนที่จะวนลองไม่รู้จบ
  await db.prepare("UPDATE webhook_deliveries SET status='FAILED' WHERE status='PENDING' AND attempts >= 5").run();
  return { sent, failed };
}

export function flushWebhooksInBackground() {
  void flushWebhooks().catch(() => {
    /* ผลถูกบันทึกในตารางแล้ว */
  });
}

/* ---------- เครื่องมือสำหรับตอนตั้งค่า ---------- */

export type TestResult = { ok: boolean; status: number; error: string };

/**
 * ยิงข้อความทดสอบไปที่ปลายทางทันที
 *
 * คนตั้ง integration ต้องรู้ให้ได้ว่า "URL ถูกไหม ความลับตรงกันไหม ปลายทางรับได้ไหม"
 * ก่อนจะมีเอกสารจริงวิ่งผ่าน — ถ้าไม่มีทางทดสอบ วิธีเดียวคือรออนุมัติเอกสารจริงแล้ว
 * ลุ้น ซึ่งถ้าพลาดก็แปลว่าเอกสารจริงใบนั้นตกหล่นไปแล้ว
 *
 * ใช้ event ชื่อ "ping" และติดธง test ไว้ ปลายทางต้องไม่เอาไปสร้างเอกสารบัญชี
 * ส่งตรงไม่ผ่านคิว และบันทึกผลด้วยสถานะสุดท้ายเลย ตัวลองซ้ำจะได้ไม่หยิบไปยิงอีก
 */
export async function sendTestWebhook(): Promise<TestResult> {
  const cfg = webhookConfig();
  if (!cfg.url) return { ok: false, status: 0, error: "ยังไม่ได้ตั้ง WEBHOOK_URL" };

  // ใช้ใบล่าสุดเป็นตัวอย่างถ้ามี ปลายทางจะได้ทดสอบตัวแปลงข้อมูลกับของจริง
  const last = (await db
    .prepare("SELECT id FROM requests ORDER BY id DESC LIMIT 1")
    .get()) as { id: number } | undefined;
  const sample = last ? await requestPayload(last.id) : null;

  const body = JSON.stringify({
    event: "ping",
    test: true,
    sent_at: new Date().toISOString(),
    request: sample,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.secret) {
    headers["X-Signature-256"] = `sha256=${crypto
      .createHmac("sha256", cfg.secret)
      .update(body)
      .digest("hex")}`;
  }

  let status = 0;
  let error = "";
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }

  await db.prepare(
    `INSERT INTO webhook_deliveries (event, request_id, payload, status, attempts, http_code, error, sent_at)
     VALUES ('ping', NULL, ?, ?, 1, ?, ?, ?)`,
  ).run(body, error ? "FAILED" : "SENT", status, error, error ? null : new Date().toISOString());

  return { ok: !error, status, error };
}

/**
 * เอาการส่งที่ล้มเหลวกลับเข้าคิวใหม่
 *
 * ของที่ลองครบ 5 ครั้งแล้วจะค้างเป็น FAILED ตลอดไปโดยตั้งใจ — ไม่วนลองไม่รู้จบ
 * แต่เมื่อปลายทางแก้ปัญหาเสร็จ ต้องมีทางสั่งส่งใหม่ ไม่ใช่ต้องยอมให้ข้อมูลใบนั้นหายไป
 */
export async function retryDelivery(id: number): Promise<FlushResult> {
  await db.prepare(
    "UPDATE webhook_deliveries SET status='PENDING', attempts=0, error='' WHERE id=? AND event<>'ping'",
  ).run(id);
  return flushWebhooks();
}

/* ---------- สถานะสำหรับหน้าผู้ดูแล ---------- */

export type DeliveryRow = {
  id: number;
  event: string;
  request_id: number | null;
  status: string;
  attempts: number;
  http_code: number;
  error: string;
  created_at: string;
  sent_at: string | null;
  doc_no: string | null;
};

export async function integrationStatus() {
  const cfg = webhookConfig();
  const recent = (await db
    .prepare(
      `SELECT w.id, w.event, w.request_id, w.status, w.attempts, w.http_code, w.error,
              w.created_at, w.sent_at, r.doc_no
         FROM webhook_deliveries w
         LEFT JOIN requests r ON r.id = w.request_id
        ORDER BY w.id DESC LIMIT 25`,
    )
    .all()) as DeliveryRow[];

  const counts = (await db
    .prepare("SELECT status, COUNT(*) AS n FROM webhook_deliveries GROUP BY status")
    .all()) as { status: string; n: number }[];

  return {
    url: cfg.url,
    hasSecret: Boolean(cfg.secret),
    events: cfg.events,
    apiEnabled: Boolean(cfg.apiKey),
    webhookReady: Boolean(cfg.url),
    recent,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>,
  };
}
