import "server-only";
import { db } from "./db";
import { parseDbTime } from "./format";
import { enqueue } from "./lark/notify";
import { notifyTargetFor } from "./delegation";

/**
 * เตือนงานค้างอัตโนมัติ
 *
 * ปัญหาของระบบอนุมัติไม่ใช่คนไม่ยอมอนุมัติ แต่คือลืม — เอกสารเข้าไปอยู่ในแชท
 * แล้วถูกกลบด้วยข้อความอื่น ไม่มีใครรู้ว่ามันค้างอยู่ตรงไหนจนกว่าคนยื่นจะมาถาม
 *
 * นับเวลาจาก request_approvers.notified_at คือ "ตอนที่งานตกถึงมือคนนี้"
 * ไม่ใช่ตอนที่ยื่นเอกสาร — คนอนุมัติขั้นสองไม่ควรโดนทวงเพราะขั้นแรกดองไว้ห้าวัน
 */

export const REMIND_AFTER_DAYS = Math.max(1, Number(process.env.REMINDER_AFTER_DAYS || 3));
export const ESCALATE_AFTER_DAYS = Math.max(
  REMIND_AFTER_DAYS + 1,
  Number(process.env.ESCALATE_AFTER_DAYS || 7),
);
const ENABLED = (process.env.REMINDER_ENABLED ?? "true") !== "false";
const SKIP_WEEKENDS = (process.env.REMINDER_SKIP_WEEKENDS ?? "true") !== "false";

/** ช่วงเวลาที่ยอมให้ส่ง เช่น "9-18" — ไม่ทวงงานตอนตีสาม */
function windowHours(): [number, number] {
  const raw = process.env.REMINDER_HOURS || "9-18";
  const [a, b] = raw.split("-").map((x) => Number(x.trim()));
  const from = Number.isFinite(a) ? Math.min(23, Math.max(0, a)) : 9;
  const to = Number.isFinite(b) ? Math.min(23, Math.max(0, b)) : 18;
  return from <= to ? [from, to] : [9, 18];
}

export function withinSendWindow(d = new Date()): boolean {
  const [from, to] = windowHours();
  if (SKIP_WEEKENDS && (d.getDay() === 0 || d.getDay() === 6)) return false;
  return d.getHours() >= from && d.getHours() < to;
}

export type StaleItem = {
  approver_row_id: number;
  request_id: number;
  doc_no: string;
  title: string;
  status: string;
  approver_id: number;
  approver_name: string;
  approver_email: string;
  department_id: number | null;
  requester_id: number;
  requester_name: string;
  step_name: string;
  notified_at: string;
  notify_to: number;
  notify_to_name: string;
  on_leave: number;
  days: number;
  level: "REMINDER" | "ESCALATION";
  last_nudge: string | null;
};

/**
 * งานที่ค้างอยู่ที่ขั้นปัจจุบันจริงๆ
 *
 * เงื่อนไข r.current_step = a.step_no สำคัญมาก — ถ้าไม่ใส่ จะไปทวงคนของขั้นถัดไป
 * ที่ยังไม่ถึงคิวเขาเลยด้วย
 */
export async function findStale(now = new Date()): Promise<StaleItem[]> {
  const rows = (await db
    .prepare(
      `SELECT a.id            AS approver_row_id,
              a.request_id    AS request_id,
              a.user_id       AS approver_id,
              a.notified_at   AS notified_at,
              COALESCE(NULLIF(a.node_name,''), a.title) AS step_name,
              r.doc_no, r.title, r.status,
              r.requester_id,
              u.name  AS approver_name,
              u.email AS approver_email,
              u.department_id,
              q.name  AS requester_name,
              a.last_nudge_at AS last_nudge,
              COALESCE(dl.to_user, a.user_id) AS notify_to,
              COALESCE(du.name, u.name)       AS notify_to_name,
              CASE WHEN dl.to_user IS NULL THEN 0 ELSE 1 END AS on_leave
         FROM request_approvers a
         JOIN requests r ON r.id = a.request_id
         JOIN users    u ON u.id = a.user_id
         JOIN users    q ON q.id = r.requester_id
         LEFT JOIN delegations dl
                ON dl.from_user = a.user_id AND dl.active = 1
               AND local_today() BETWEEN sql_date(dl.from_date) AND sql_date(dl.to_date)
         LEFT JOIN users du ON du.id = dl.to_user
        WHERE a.status = 'PENDING'
          AND a.kind   = 'APPROVE'
          AND r.status = 'PENDING'
          AND r.stage  = a.stage
          AND r.current_step = a.step_no
          AND u.active = 1
          AND a.notified_at IS NOT NULL`,
    )
    .all()) as (Omit<StaleItem, "days" | "level"> & { last_nudge: string | null })[];

  const out: StaleItem[] = [];
  for (const r of rows) {
    const since = parseDbTime(r.notified_at);
    if (!Number.isFinite(since)) continue;
    const days = Math.floor((now.getTime() - since) / 86400_000);
    if (days < REMIND_AFTER_DAYS) continue;
    out.push({
      ...r,
      days,
      level: days >= ESCALATE_AFTER_DAYS ? "ESCALATION" : "REMINDER",
    });
  }
  return out.sort((a, b) => b.days - a.days);
}

/** เตือนซ้ำได้วันละครั้ง — ใช้ 20 ชม. เผื่อรอบตรวจไม่ตรงเวลาเป๊ะทุกวัน */
function nudgedRecently(item: StaleItem, now: Date): boolean {
  if (!item.last_nudge) return false;
  const t = parseDbTime(item.last_nudge);
  return Number.isFinite(t) && now.getTime() - t < 20 * 3600_000;
}

/** หัวหน้าแผนกของผู้อนุมัติ ถ้าไม่มีก็ส่งให้ผู้ดูแลระบบแทน */
async function escalateTargets(item: StaleItem): Promise<number[]> {
  const managers = (await db
    .prepare(
      `SELECT id FROM users
        WHERE active = 1 AND role = 'MANAGER' AND department_id = ? AND id <> ?`,
    )
    .all(item.department_id, item.approver_id)) as { id: number }[];

  const ids = managers.map((m) => m.id);
  if (ids.length === 0) {
    const admins = (await db
      .prepare("SELECT id FROM users WHERE active = 1 AND role = 'ADMIN' AND id <> ?")
      .all(item.approver_id)) as { id: number }[];
    ids.push(...admins.map((a) => a.id));
  }
  // ให้คนยื่นรู้ด้วยว่าเรื่องของตัวเองค้างอยู่ตรงไหน
  if (item.requester_id !== item.approver_id) ids.push(item.requester_id);
  return [...new Set(ids)];
}

export type SweepResult = {
  ran: boolean;
  skippedReason: string;
  stale: number;
  reminded: number;
  escalated: number;
};

/**
 * ตรวจงานค้างหนึ่งรอบแล้วเข้าคิวแจ้งเตือน
 * ไม่ยิง Lark เอง — แค่หย่อนลงตาราง notifications ให้ flush() จัดการ
 * ระบบจึงยังทำงานถูกต้องแม้ Lark ล่ม และผู้ดูแลเห็นได้ว่าอะไรค้างส่งอยู่
 */
export async function sweep({ force = false, now = new Date() } = {}): Promise<SweepResult> {
  const base = { stale: 0, reminded: 0, escalated: 0 };
  if (!ENABLED && !force) return { ran: false, skippedReason: "ปิดการเตือนไว้", ...base };

  const stale = await findStale(now);
  if (!force && !withinSendWindow(now)) {
    return { ran: false, skippedReason: "นอกเวลาทำการ", ...base, stale: stale.length };
  }

  let reminded = 0;
  let escalated = 0;

  for (const item of (await stale)) {
    if (!force && nudgedRecently(item, now)) continue;

    // ทวงไปที่คนที่รับแทน ถ้าเจ้าของงานลาอยู่
    const target = notifyTargetFor(item.approver_id);

    if (item.level === "ESCALATION") {
      for (const uid of (await escalateTargets(item))) {
        await enqueue(item.request_id, uid, "ESCALATION", {
          days: item.days,
          stepName: item.step_name,
          approverName: item.on_leave
            ? `${item.approver_name} (แทนโดย ${item.notify_to_name})`
            : item.approver_name,
        });
      }
      escalated++;
    }

    // คนที่ค้างงานได้การ์ดที่กดอนุมัติได้เลยเสมอ ทั้งรอบเตือนและรอบแจ้งหัวหน้า
    await enqueue(item.request_id, await target, "REMINDER", {
      days: item.days,
      stepName: item.step_name,
      approverRowId: item.approver_row_id,
    });
    await db.prepare("UPDATE request_approvers SET last_nudge_at=utc_now_text() WHERE id=?")
      .run(item.approver_row_id);
    reminded++;
  }

  return { ran: true, skippedReason: "", stale: stale.length, reminded, escalated };
}

/* ---------- ข้อมูลสำหรับหน้าผู้ดูแล ---------- */

export type NudgeRow = {
  id: number;
  kind: string;
  status: string;
  created_at: string;
  doc_no: string;
  user_name: string;
  payload: string;
};

export async function reminderStatus() {
  const stale = await findStale();
  const history = (await db
    .prepare(
      `SELECT n.id, n.kind, n.status, n.created_at, n.payload,
              r.doc_no, u.name AS user_name
         FROM notifications n
         JOIN requests r ON r.id = n.request_id
         JOIN users    u ON u.id = n.user_id
        WHERE n.kind IN ('REMINDER','ESCALATION')
        ORDER BY n.id DESC LIMIT 20`,
    )
    .all()) as NudgeRow[];

  return {
    enabled: ENABLED,
    remindAfter: REMIND_AFTER_DAYS,
    escalateAfter: ESCALATE_AFTER_DAYS,
    hours: windowHours().join(":00–") + ":00",
    skipWeekends: SKIP_WEEKENDS,
    inWindow: withinSendWindow(),
    stale,
    waiting: stale.filter((s) => s.level === "REMINDER").length,
    overdue: stale.filter((s) => s.level === "ESCALATION").length,
    history,
  };
}

/* ---------- ทวงให้ไปเคลียร์ค่าใช้จ่ายใน OA ---------- */

/**
 * ทวงเอกสารที่อนุมัติแล้วแต่ยังไม่ได้ตั้งเบิกใน OA
 *
 * แยกจากการทวงผู้อนุมัติ เพราะคนละคนและคนละปัญหา — อันนั้นคือ "งานค้างอยู่ที่คุณ"
 * อันนี้คือ "เรื่องของคุณผ่านแล้ว แต่ยังไม่จบ" ซึ่งคนมักลืมเพราะเอกสารดูจบไปแล้ว
 *
 * ทวงสองจังหวะ: ก่อนครบกำหนด 3 วัน (เตือนล่วงหน้า) และหลังเลยกำหนด (ทวงจริง)
 * เตือนคนเดิมเรื่องเดิมได้วันละครั้งเหมือนกติกาเดิม
 */
export async function sweepClearing({ force = false, now = new Date() } = {}): Promise<{
  ran: boolean;
  due: number;
  notified: number;
}> {
  if (!ENABLED && !force) return { ran: false, due: 0, notified: 0 };
  if (!force && !withinSendWindow(now)) return { ran: false, due: 0, notified: 0 };

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // ใกล้ครบ (เหลือ <= 3 วัน) หรือเลยกำหนดแล้ว และยังไม่ได้ทวงวันนี้
  const rows = (await db
    .prepare(
      `SELECT r.id, r.doc_no, r.title, r.clear_due_date, r.requester_id,
              u.name AS requester_name
         FROM requests r
         JOIN users u ON u.id = r.requester_id
        WHERE r.status = 'APPROVED'
          AND r.clear_due_date <> '' AND r.oa_ref = ''
          AND u.active = 1
          AND julian(r.clear_due_date) - julian(@today) <= 3
          AND (r.clear_nudged_on IS NULL OR r.clear_nudged_on <> @today)`,
    )
    .all({ today })) as {
    id: number;
    doc_no: string;
    title: string;
    clear_due_date: string;
    requester_id: number;
  }[];

  let notified = 0;
  const mark = db.prepare("UPDATE requests SET clear_nudged_on = ? WHERE id = ?");
  for (const r of rows) {
    // ส่งถึงคนที่รับงานแทนอยู่ ถ้าเจ้าตัวลา — กติกาเดียวกับการทวงผู้อนุมัติ
    const to = notifyTargetFor(r.requester_id);
    await enqueue(r.id, await to, "CLEAR_DUE", { due: r.clear_due_date });
    await mark.run(today, r.id);
    notified++;
  }
  return { ran: true, due: rows.length, notified };
}

/* ---------- ตัวตั้งเวลา ---------- */

export function startReminderScheduler() {
  const g = globalThis as { __reminderTimer?: NodeJS.Timeout };
  if (g.__reminderTimer || !ENABLED) return;

  const tick = async () => {
    try {
      const r = await sweep();
      const c = await sweepClearing();
      if (c.notified) console.log(`[reminder] ทวงเคลียร์ OA ${c.notified} รายการ`);
      if (r.reminded || r.escalated || c.notified) {
        if (r.reminded || r.escalated) {
          console.log(`[reminder] ค้าง ${r.stale} รายการ — เตือน ${r.reminded}, แจ้งหัวหน้า ${r.escalated}`);
        }
        const { flush } = await import("./lark/notify");
        await flush().catch(() => {
          /* error ถูกบันทึกในตาราง notifications แล้ว */
        });
      }
    } catch (e) {
      console.error("[reminder] ตรวจงานค้างผิดพลาด", e);
    }
  };

  g.__reminderTimer = setInterval(tick, 3600_000); // ตรวจทุกชั่วโมง แต่เตือนคนเดิมได้วันละครั้ง
  setTimeout(tick, 45_000).unref?.();
  g.__reminderTimer.unref?.();
}
