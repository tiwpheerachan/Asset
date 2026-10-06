import "server-only";
import { mailReady, sendMail } from "../mail";
import { db } from "../db";
import { getRequest, getUser } from "../queries";
import { larkConfig, larkReady } from "./config";
import { resolveLarkIds, sendCard, updateCard } from "./client";
import { approvalCard, ccCard, escalationCard, statusCard } from "./card";
import { isLocale, type Locale } from "../i18n/locales";
import type { User } from "../types";

export type NotifyKind =
  | "APPROVAL_REQUEST"
  | "CC"
  | "RESULT"
  | "REMINDER"
  | "ESCALATION"
  /** ทวงให้ไปตั้งเบิกใน OA — เอกสารอนุมัติผ่านแล้วแต่ยังไม่จบกระบวนการ */
  | "CLEAR_DUE"
  /** ถูกระบุชื่อไว้ในช่องของฟอร์ม (เช่น "เรียนแจ้ง" / "สำเนาเรียน") ไม่ต้องทำอะไร */
  | "MENTION"
  /** ระบบบัญชี (OneBook) แจ้งกลับว่าจ่ายแล้วหรือตีกลับ */
  | "ACCOUNTING";

/** LARK ครอบทั้ง direct card และ DM ผ่านระบบกลาง — ปลายทางเดียวกันคือแชท */
export type NotifyChannel = "LARK" | "EMAIL";

type Payload = {
  /** วันครบกำหนดเคลียร์ OA — ใช้กับ CLEAR_DUE */
  due?: string;
  /** สถานะฝั่งบัญชี — ใช้กับ ACCOUNTING */
  externalState?: string;
  externalRef?: string;
  stepName?: string;
  note?: string;
  approverRowId?: number;
  days?: number;          // เตือนงานค้าง: ค้างมากี่วันแล้ว
  approverName?: string;  // แจ้งหัวหน้า: ค้างอยู่ที่ใคร
  fieldLabel?: string;    // ถูกระบุชื่อ: อยู่ในช่องไหนของฟอร์ม
};

/**
 * ใส่คิวแจ้งเตือน — เรียกได้จากใน transaction ของ action ได้เลย
 * การเขียนลงตารางก่อนทำให้ระบบอนุมัติไม่ผูกชะตากับ Lark: ถ้า Lark ล่ม
 * เอกสารก็ยังเดินต่อได้ และเรารู้ว่าอะไรยังไม่ได้ส่ง
 */
/**
 * ช่องทางที่เปิดใช้อยู่จริงตอนนี้
 *
 * ตั้งช่องทางไหนไว้ = ส่งช่องทางนั้น · ตั้งทั้งคู่ = ส่งทั้งคู่
 * เดิมอีเมลเป็นแค่ตัวสำรองที่ทำงานเมื่อยังไม่ได้ตั้ง Lark ซึ่งแปลว่าพอตั้ง Lark
 * ปุ๊บอีเมลก็เงียบไปเลย — แต่คนอ่านแชทกับคนอ่านเมลไม่ใช่กลุ่มเดียวกัน
 * และงานที่ค้างเพราะไม่มีใครเห็นแจ้งเตือนคือปัญหาที่แพงที่สุดของระบบอนุมัติ
 */
export function activeChannels(): NotifyChannel[] {
  const out: NotifyChannel[] = [];
  if (larkReady() || centralNotifyReady()) out.push("LARK");
  if (mailReady()) out.push("EMAIL");
  return out;
}

/**
 * เข้าคิวแจ้งเตือนหนึ่งเรื่องถึงหนึ่งคน — แยกแถวตามช่องทาง
 *
 * แถวละช่องทางเพราะแต่ละทางมีชะตาของตัวเอง: Lark ล่มแต่เมลออกได้ ต้องเห็นว่า
 * ฉบับไหนไปถึงและฉบับไหนไม่ถึง และลองใหม่เฉพาะทางที่พลาดโดยไม่ส่งซ้ำทางที่สำเร็จแล้ว
 */
export async function enqueue(
  requestId: number,
  userId: number,
  kind: NotifyKind,
  payload: Payload = {},
) {
  const stmt = db.prepare(
    `INSERT INTO notifications (request_id, user_id, kind, channel, payload) VALUES (?,?,?,?,?)`,
  );
  const channels = activeChannels();
  const body = JSON.stringify(payload);
  // ยังไม่ได้ตั้งช่องทางไหนเลย — คงแถวไว้หนึ่งใบให้ flush ทำเครื่องหมาย SKIPPED
  // ผู้ดูแลจะได้เห็นว่ามีเรื่องที่ควรแจ้งแต่ไม่ได้แจ้ง ไม่ใช่เงียบหายไปเฉยๆ
  for (const ch of channels.length ? channels : (["LARK"] as NotifyChannel[])) {
    await stmt.run(requestId, userId, kind, ch, body);
  }
}

/** ภาษาที่จะใช้กับผู้รับคนนี้ — ตามที่เขาเลือกไว้ในระบบ ไม่งั้นใช้ค่าจากตั้งค่า */
function localeFor(user: User): Locale {
  return isLocale(user.locale) ? user.locale : larkConfig().fallbackLocale;
}

type Pending = {
  id: number;
  request_id: number;
  user_id: number;
  kind: NotifyKind;
  channel: NotifyChannel;
  payload: string;
  attempts: number;
};

/* ---------- ทางที่ 2: ส่งผ่าน Central Login (DM ข้อความ + ลิงก์) ---------- */

/**
 * ตั้งค่า central notify — ค่าเริ่มต้นใช้ตัวเดียวกับ directory (ระบบกลาง + API key เดิม)
 * แค่ให้แอปในระบบกลางมี scope feishu:notify:send + feishu:notify:direct
 */
function centralNotify() {
  const base = (process.env.CENTRAL_NOTIFY_URL || process.env.CENTRAL_DIRECTORY_URL || "").replace(/\/+$/, "");
  const key = process.env.NOTIFY_API_KEY || process.env.DIRECTORY_API_KEY || "";
  const appBase = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  return { base, key, appBase, ready: Boolean(base && key) };
}
export function centralNotifyReady(): boolean {
  return centralNotify().ready;
}

const STATUS_LABEL_NOTIFY: Record<string, [string, string, string]> = {
  APPROVED: ["อนุมัติแล้ว", "Approved", "已批准"],
  REJECTED: ["ไม่อนุมัติ", "Rejected", "已拒绝"],
  RETURNED: ["ส่งกลับให้แก้", "Returned", "已退回"],
  CANCELLED: ["ยกเลิก", "Cancelled", "已取消"],
  PRELIM_APPROVED: ["อนุมัติเบื้องต้น", "Preliminarily approved", "已初审"],
  PENDING: ["รออนุมัติ", "Pending", "待批准"],
};

/** ข้อความ DM ต่อ 1 การแจ้งเตือน (ตามชนิด) */
function notifyText(
  kind: NotifyKind,
  // getRequest เป็น async แล้ว — ต้องคลาย Promise ก่อน ไม่งั้นชนิดนี้กลายเป็น Promise เอง
  request: NonNullable<Awaited<ReturnType<typeof getRequest>>>,
  payload: Payload,
  locale: Locale,
  link: string,
): string {
  const L = (th: string, en: string, zh: string) => (locale === "en" ? en : locale === "zh" ? zh : th);
  const head = `${request.title || ""} (${request.doc_no})`;
  switch (kind) {
    case "APPROVAL_REQUEST":
    case "REMINDER":
      return (
        `📋 ${L("มีคำขอรออนุมัติ", "Approval needed", "待你审批")}: ${head}\n` +
        `${L("ผู้ขอ", "From", "申请人")}: ${request.requester_name}\n👉 ${link}`
      );
    case "CC":
      return `📄 ${L("สำเนาถึงคุณ", "CC to you", "抄送给你")}: ${head}\n👉 ${link}`;
    case "MENTION": {
      // บอกด้วยว่าถูกระบุไว้ในช่องไหน ไม่งั้นคนรับต้องเปิดเอกสารมาไล่หาเองว่าเกี่ยวอะไรกับตน
      const where = payload.fieldLabel ? ` (${payload.fieldLabel})` : "";
      return `🔖 ${L("คุณถูกระบุชื่อในเอกสาร", "You were named in a request", "你被指名在申请单中")}${where}: ${head}\n👉 ${link}`;
    }
    case "RESULT": {
      const st = STATUS_LABEL_NOTIFY[request.status];
      const label = st ? (locale === "en" ? st[1] : locale === "zh" ? st[2] : st[0]) : request.status;
      const note = payload.note ? `\n${L("เหตุผล", "Note", "备注")}: ${payload.note}` : "";
      return `📌 ${head} — ${label}${note}\n👉 ${link}`;
    }
    case "ESCALATION":
      return `⏰ ${L("งานค้าง", "Overdue", "超时")} ${payload.days ?? 0} ${L("วัน", "days", "天")}: ${head}\n👉 ${link}`;
    case "ACCOUNTING": {
      const paid = payload.externalState === "PAID";
      const ref = payload.externalRef ? ` (${payload.externalRef})` : "";
      const why = payload.note ? `\n${L("หมายเหตุ", "Note", "备注")}: ${payload.note}` : "";
      return paid
        ? `💰 ${L("ฝ่ายบัญชีจ่ายเงินแล้ว", "Accounting has paid", "财务已付款")}${ref}: ${head}${why}\n👉 ${link}`
        : `↩️ ${L("ฝ่ายบัญชีตีกลับเอกสาร", "Accounting sent it back", "财务退回")}${ref}: ${head}${why}\n👉 ${link}`;
    }
    case "CLEAR_DUE":
      return (
        `🧾 ${L("ถึงกำหนดเคลียร์ค่าใช้จ่ายใน OA", "OA clearing due", "OA 冲销到期")}: ${head}\n` +
        `${L("ครบกำหนด", "Due", "截止")}: ${payload.due ?? "-"}\n` +
        `${L("อ้างอิงเลขนี้ตอนตั้งเบิก", "Use this number when filing", "报销时请引用此编号")}: ${request.doc_no}\n👉 ${link}`
      );
    default:
      return `${head}\n👉 ${link}`;
  }
}

/** ยิง DM ผ่าน /api/notify/lark ของระบบกลาง (to_type=email) */
async function sendViaCentral(email: string, text: string): Promise<void> {
  const { base, key } = centralNotify();
  const res = await fetch(`${base}/api/notify/lark`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ to_type: "email", to: email, text }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || `notify_${res.status}`);
}

/**
 * ยิงคิวที่ค้างอยู่ออกไป — เรียกแบบ fire-and-forget หลัง action ทำงานเสร็จ
 *
 * มี 2 ทาง (direct Lark มาก่อนถ้าตั้งค่าไว้):
 *   - direct Lark (LARK_APP_ID/SECRET) → การ์ดกดอนุมัติในแชท
 *   - Central Login (/api/notify/lark) → DM ข้อความ + ลิงก์เข้าอนุมัติบนเว็บ
 *
 * ทุก error ถูกเก็บลงแถวนั้นๆ ไม่โยนออกมาให้ action พัง
 */
export async function flush(limit = 30): Promise<{ sent: number; failed: number }> {
  // แถวช่องทาง LARK ส่งด้วย direct card ก่อน ถ้าไม่ได้ตั้งค่อยตกไปที่ DM ผ่านระบบกลาง
  const direct = larkReady();
  const central = !direct && centralNotifyReady();
  const mail = mailReady();

  if (!direct && !central && !mail) {
    await db.prepare(
      `UPDATE notifications SET status='SKIPPED', error='ยังไม่ได้ตั้งค่าช่องทางแจ้งเตือน'
        WHERE status='PENDING'`,
    ).run();
    return { sent: 0, failed: 0 };
  }

  let rows = (await db
    .prepare(
      `SELECT id, request_id, user_id, kind, channel, payload, attempts FROM notifications
        WHERE status='PENDING' AND attempts < 3 ORDER BY id LIMIT ?`,
    )
    .all(limit)) as Pending[];
  if (rows.length === 0) return { sent: 0, failed: 0 };
  let failedUpFront = 0;

  const markSent = db.prepare(
    "UPDATE notifications SET status='SENT', message_id=?, sent_at=utc_now_text(), attempts=attempts+1 WHERE id=?",
  );
  const markFailed = db.prepare(
    "UPDATE notifications SET status=?, error=?, attempts=attempts+1 WHERE id=?",
  );

  // ค้นทุกคนพร้อมกัน — รอทีละคนจะกลายเป็นรอฐานข้อมูลเท่าจำนวนคนที่ต้องแจ้ง
  const users = (
    await Promise.all([...new Set(rows.map((r) => r.user_id))].map((id) => getUser(id)))
  ).filter((u): u is User => Boolean(u));

  // direct: จับคู่ open_id ให้ครบก่อน จะได้ยิง batch เดียว
  //
  // ค้นไม่สำเร็จให้พับเฉพาะแถวที่จะไปทางแชท แล้วปล่อยแถวอีเมลเดินต่อ —
  // ไม่งั้นไดเรกทอรีของ Lark ล่มทีเดียวเมลก็เงียบตามไปด้วย ทั้งที่ส่งได้อยู่
  let ids = new Map<number, string>();
  if (direct) {
    try {
      ids = await resolveLarkIds(users);
    } catch (e) {
      const chat = rows.filter((r) => r.channel !== "EMAIL");
      for (const r of chat) (await markFailed.run("PENDING", (e as Error).message, r.id));
      rows = rows.filter((r) => r.channel === "EMAIL");
      failedUpFront = chat.length;
    }
  }

  const appBase = centralNotify().appBase;
  let sent = 0;
  let failed = failedUpFront;

  for (const row of rows) {
    const user = users.find((u) => u.id === row.user_id);
    const request = await getRequest(row.request_id);

    if (!user || !request) {
      await markFailed.run("FAILED", "ไม่พบผู้ใช้หรือคำขอ", row.id);
      failed++;
      continue;
    }

    const payload = JSON.parse(row.payload) as Payload;
    const locale = localeFor((await user));

    if (row.channel === "EMAIL") {
      if (!mail) {
        await markFailed.run("SKIPPED", "ยังไม่ได้ตั้งค่า SMTP", row.id);
        continue;
      }
      if (!user.email) {
        await markFailed.run("SKIPPED", "ไม่มีอีเมล", row.id);
        continue;
      }
      const link = `${appBase}/requests/${request.id}`;
      const text = notifyText(row.kind, request, payload, locale, link);
      // หัวเรื่องต้องอ่านออกจากรายการเมลโดยไม่ต้องเปิด — เอาบรรทัดแรกซึ่งบอกว่าเรื่องอะไร
      const subject = text.split("\n")[0].slice(0, 120);
      try {
        await sendMail(user.email, subject, text, link);
        await markSent.run("", row.id);
        sent++;
      } catch (e) {
        await markFailed.run("PENDING", (e as Error).message, row.id);
        failed++;
      }
    } else if (direct) {
      const openId = ids.get(user.id);
      if (!openId) {
        await markFailed.run("SKIPPED", `ไม่พบบัญชี Lark ของ ${user.email}`, row.id);
        continue;
      }
      const card =
        row.kind === "APPROVAL_REQUEST" || row.kind === "REMINDER"
          ? approvalCard({
              request: await request,
              approverRowId: payload.approverRowId ?? 0,
              stepName: payload.stepName ?? "",
              locale,
              waitingDays: row.kind === "REMINDER" ? (payload.days ?? 0) : 0,
            })
          : row.kind === "ESCALATION"
            ? escalationCard({
                request: await request,
                locale,
                days: payload.days ?? 0,
                approverName: payload.approverName ?? "",
                stepName: payload.stepName ?? "",
              })
            : row.kind === "CC"
              ? ccCard({ request: await request, locale })
              : row.kind === "MENTION"
                ? ccCard({ request: await request, locale, mentionIn: payload.fieldLabel })
              : statusCard({ request: await request, locale, note: payload.note });
      try {
        const messageId = await sendCard(openId, card);
        await markSent.run(messageId, row.id);
        sent++;
      } catch (e) {
        await markFailed.run("PENDING", (e as Error).message, row.id);
        failed++;
      }
    } else if (central) {
      // DM ข้อความ + ลิงก์ ผ่านระบบกลาง
      if (!user.email) {
        await markFailed.run("SKIPPED", "ไม่มีอีเมล", row.id);
        continue;
      }
      const link = `${appBase}/requests/${request.id}`;
      try {
        await sendViaCentral(user.email, notifyText(row.kind, request, payload, locale, link));
        await markSent.run("", row.id);
        sent++;
      } catch (e) {
        await markFailed.run("PENDING", (e as Error).message, row.id);
        failed++;
      }
    } else {
      // แถวขอไปทางแชท แต่ตอนนี้ไม่ได้ตั้งทั้ง Lark และระบบกลางไว้แล้ว
      await markFailed.run("SKIPPED", "ยังไม่ได้ตั้งค่าช่องทางแชท", row.id);
    }
  }

  return { sent, failed };
}

/** เรียกท้าย action — ไม่ await ผลลัพธ์ และไม่ปล่อย error ออกมา */
export function flushInBackground() {
  void flush().catch(() => {
    /* error ถูกบันทึกในตาราง notifications แล้ว */
  });
}

/**
 * ปิดการ์ดที่ส่งไปแล้วของคำขอหนึ่งใบ ให้ปุ่มหายจากทุกเครื่อง
 * ใช้ตอนมีคนตัดสินไปแล้ว (โดยเฉพาะขั้นแบบ "ใครก็ได้ 1 คน")
 */
export async function closeCards(
  requestId: number,
  outcomeNote: string,
  exceptNotificationId?: number,
) {
  if (!larkReady()) return;

  const rows = (await db
    .prepare(
      `SELECT n.id, n.user_id, n.message_id FROM notifications n
        WHERE n.request_id = ? AND n.kind IN ('APPROVAL_REQUEST','REMINDER')
          AND n.status = 'SENT' AND n.message_id <> ''`,
    )
    .all(requestId)) as { id: number; user_id: number; message_id: string }[];

  const request = await getRequest(requestId);
  if (!request) return;

  for (const row of rows) {
    if (exceptNotificationId && row.id === exceptNotificationId) continue;
    const user = await getUser(row.user_id);
    if (!user) continue;
    try {
      await updateCard(
        row.message_id,
        statusCard({ request, locale: localeFor(user), note: outcomeNote }),
      );
    } catch {
      // อัปเดตการ์ดเก่าไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย — ข้ามไป
    }
  }
}
