import type { CardAction } from "./card";

/**
 * แกะ payload ตอนมีคนกดปุ่มบนการ์ด Lark/Feishu
 *
 * ที่มา: Lark ส่ง payload ของการกดปุ่มมาได้สองรูปแบบ ขึ้นกับการตั้งค่าในคอนโซล
 *
 *   แบบเดิม (Message Card Request URL)
 *     { open_id, action: { value: {...} }, token }
 *
 *   แบบใหม่ (event `card.action.trigger` ผ่าน Event Request URL)
 *     { schema: "2.0", header: { event_type }, event: { operator: { open_id }, action: { value } } }
 *
 * เดิมโค้ดอ่านเฉพาะแบบแรก พอแอปถูกตั้งเป็นแบบใหม่ ค่าที่อ่านได้จึงเป็น undefined ทั้งหมด
 * แล้วโค้ดตอบ 200 กลับไปเฉย ๆ — ผลคือกดปุ่มแล้ว "ไม่มีอะไรเกิดขึ้น" ไม่มีแม้แต่ข้อความ
 * บอกว่าพลาด ซึ่งเป็นอาการที่หาสาเหตุยากที่สุด เพราะดูเหมือนปุ่มตายมากกว่าระบบพัง
 *
 * อ่านให้ได้ทั้งสองแบบ และตอบกลับตามแบบที่รับมา
 */
export type ParsedCardAction = {
  act: CardAction["act"];
  /** id ของแถวใน request_approvers */
  ap: number;
  req: number;
  /** ผู้รับโอน — มีเฉพาะตอนกดเลือกชื่อในการ์ดถ่ายโอน */
  to: number;
  openId: string;
  /** payload เป็นแบบใหม่ไหม — ใช้เลือกรูปแบบคำตอบให้ตรงกัน */
  v2: boolean;
};

/** ปุ่มที่ทำอะไรกับเอกสารจริง ๆ — "เปิดในระบบ" เป็นลิงก์ ไม่ได้ยิงกลับมาที่เรา */
const ACTS = new Set(["APPROVE", "REJECT", "TRANSFER", "TRANSFER_TO", "CANCEL"]);

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

/** Lark ส่ง value เป็นอ็อบเจกต์ปกติ แต่บางกรณี (ปุ่มที่ตั้ง behaviors) ส่งมาเป็นสตริง JSON */
function readValue(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return obj(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return obj(raw);
}

export function parseCardCallback(body: Record<string, unknown>): ParsedCardAction | null {
  const header = obj(body.header);
  const v2 = body.schema === "2.0" || header.event_type === "card.action.trigger";
  const scope = v2 ? obj(body.event) : body;

  const value = readValue(obj(scope.action).value);
  const act = value.act;
  if (typeof act !== "string" || !ACTS.has(act)) return null;

  const openId =
    (typeof scope.open_id === "string" ? scope.open_id : "") ||
    (obj(scope.operator).open_id as string | undefined) ||
    "";
  if (!openId) return null;

  const ap = Number(value.ap);
  const req = Number(value.req);
  if (!Number.isInteger(ap) || ap <= 0 || !Number.isInteger(req) || req <= 0) return null;

  const toRaw = Number(value.to);
  const to = Number.isInteger(toRaw) && toRaw > 0 ? toRaw : 0;
  // เลือกชื่อแล้วแต่ไม่รู้ว่าชื่อไหน = ทำอะไรต่อไม่ได้ ดีกว่าโอนมั่ว
  if (act === "TRANSFER_TO" && to === 0) return null;

  return { act: act as ParsedCardAction["act"], ap, req, to, openId, v2 };
}

/**
 * คำตอบที่ส่งกลับให้ Lark — toast เด้งให้คนกด และการ์ดใหม่แทนใบเดิมในแชท
 *
 * แบบใหม่ห่อการ์ดไว้ใน { type: "raw", data } ถ้าส่งแบบเดิมไปให้ปลายทางแบบใหม่
 * การ์ดจะไม่ถูกแทนที่ ปุ่มค้างอยู่ทั้งที่อนุมัติไปแล้ว แล้วคนก็กดซ้ำ
 */
export function cardReply(
  v2: boolean,
  toast: { type: "success" | "error"; content: string },
  card?: unknown,
): Record<string, unknown> {
  if (!card) return { toast };
  return { toast, card: v2 ? { type: "raw", data: card } : card };
}
