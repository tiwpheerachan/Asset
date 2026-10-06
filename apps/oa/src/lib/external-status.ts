import "server-only";
import { db } from "./db";
import { getRequest, logAudit } from "./queries";
import { enqueue, flushInBackground } from "./lark/notify";
import { EXTERNAL_STATES, type ExternalState, type ExternalStatus } from "./types";

/**
 * สถานะฝั่งบัญชีที่ OneBook ยิงกลับเข้ามา
 *
 * เดิมข้อมูลไหลทางเดียว — เราบอกบัญชีว่ามีเรื่องอนุมัติแล้ว แต่คนยื่นเรื่องไม่มีทาง
 * รู้ว่าบัญชีทำถึงไหน ต้องเดินไปถามอยู่ดี ซึ่งเป็นปัญหาเดิมที่การเชื่อมระบบควรแก้
 *
 * เก็บเป็นประวัติทีละแถว ไม่ทับของเดิม เพราะเรื่องหนึ่งเดินหลายจังหวะและเวลามีปัญหา
 * ต้องตอบได้ว่าจังหวะไหนเกิดเมื่อไหร่ ใครเป็นคนแจ้ง
 */

export type RecordInput = {
  requestId: number;
  source: string;
  state: ExternalState;
  externalRef?: string;
  externalUrl?: string;
  amount?: number | null;
  occurredAt?: string;
  note?: string;
};

export type RecordResult =
  | { ok: true; status: ExternalStatus; created: boolean }
  | { ok: false; error: string };

export const isExternalState = (v: string): v is ExternalState =>
  (EXTERNAL_STATES as readonly string[]).includes(v);

export async function listExternalStatus(requestId: number): Promise<ExternalStatus[]> {
  return (await db
    .prepare("SELECT * FROM external_status WHERE request_id = ? ORDER BY id")
    .all(requestId)) as ExternalStatus[];
}

/** สถานะล่าสุดของแต่ละใบ — ใช้แสดงบนหน้ารายละเอียด */
export async function latestExternalStatus(requestId: number): Promise<ExternalStatus | null> {
  return (
    ((await db
      .prepare("SELECT * FROM external_status WHERE request_id = ? ORDER BY id DESC LIMIT 1")
      .get(requestId)) as ExternalStatus | undefined) ?? null
  );
}

export async function recordExternalStatus(input: RecordInput): Promise<RecordResult> {
  const req = await getRequest(input.requestId);
  if (!req) return { ok: false, error: "ไม่พบคำขอ" };
  if (!isExternalState(input.state)) {
    return { ok: false, error: `state ต้องเป็นหนึ่งใน ${EXTERNAL_STATES.join(", ")}` };
  }
  // ตีกลับโดยไม่บอกเหตุผล = คนยื่นเรื่องไม่รู้ว่าต้องแก้อะไร ซึ่งทำให้วนกลับมาใหม่อยู่ดี
  const note = String(input.note ?? "").trim();
  if (input.state === "REJECTED" && !note) {
    return { ok: false, error: 'state = REJECTED ต้องระบุ "note" ว่าตีกลับเพราะอะไร' };
  }

  const ref = String(input.externalRef ?? "").trim();
  const occurredAt = String(input.occurredAt ?? "").trim() || new Date().toISOString();

  // ยิงซ้ำด้วยสถานะเดิมและเลขอ้างอิงเดิมถือว่าเป็นครั้งเดิม — ระบบที่ยิง webhook
  // ตามปกติจะลองซ้ำเมื่อไม่แน่ใจว่าถึงหรือยัง ปลายทางจึงต้องรับซ้ำได้โดยไม่เกิดของซ้ำ
  const row = (await db
    .prepare(
      `INSERT INTO external_status
         (request_id, source, state, external_ref, external_url, amount, occurred_at, note)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (request_id, state, external_ref) DO NOTHING
       RETURNING *`,
    )
    .get(
      input.requestId,
      input.source.slice(0, 80),
      input.state,
      ref,
      String(input.externalUrl ?? "").trim(),
      typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : null,
      occurredAt,
      note,
    )) as ExternalStatus | undefined;

  if (!row) {
    const existing = (await db
      .prepare(
        "SELECT * FROM external_status WHERE request_id=? AND state=? AND external_ref=? LIMIT 1",
      )
      .get(input.requestId, input.state, ref)) as ExternalStatus;
    return { ok: true, status: existing, created: false };
  }

  await logAudit(
    input.requestId,
    null,
    "EXTERNAL_STATUS",
    `${input.source || "ระบบบัญชี"}: ${input.state}${ref ? ` (${ref})` : ""}${note ? ` — ${note}` : ""}`,
    null,
  );

  // สองสถานะนี้คือจุดที่คนยื่นเรื่องต้องรู้ทันที — จ่ายแล้วคือจบ ตีกลับคือต้องกลับมาทำต่อ
  if (input.state === "PAID" || input.state === "REJECTED") {
    await enqueue(input.requestId, req.requester_id, "ACCOUNTING", {
      note: note || undefined,
      externalState: input.state,
      externalRef: ref || undefined,
    });
    flushInBackground();
  }

  return { ok: true, status: row, created: true };
}
