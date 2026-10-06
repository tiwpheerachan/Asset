import "server-only";
import { db, USER_SELECT } from "./db";
import type { User } from "./types";

/**
 * มอบหมายให้คนอื่นอนุมัติแทนช่วงที่ไม่อยู่
 *
 * หลักที่ยึด: **ไม่ย้ายเจ้าของงาน** แถวใน request_approvers ยังเป็นชื่อคนเดิม
 * คนแทนแค่ได้สิทธิ์กดแทนในช่วงเวลาที่กำหนด
 *
 * ทำแบบนี้เพราะถ้าย้ายเจ้าของจริง จะต้องตอบคำถามยากๆ ตามมาอีกกอง —
 * งานที่ค้างอยู่ก่อนตั้งมอบหมายต้องย้ายด้วยไหม พอหมดช่วงลาต้องย้ายกลับไหม
 * แล้วถ้าย้ายกลับตอนคนแทนกดไปแล้วครึ่งทางล่ะ ทางนี้ไม่มีคำถามพวกนั้นเลย
 *
 * ไม่รองรับการต่อทอด (A→B, B→C ไม่ทำให้ C แทน A ได้) เพราะสิทธิ์อนุมัติ
 * ไม่ควรไหลไปไกลกว่าที่คนตั้งใจมอบหมายไว้หนึ่งชั้น
 */

export type Delegation = {
  id: number;
  from_user: number;
  to_user: number;
  from_date: string;
  to_date: string;
  reason: string;
  active: number;
  created_at: string;
  from_name: string;
  to_name: string;
};

const SELECT = `
  SELECT d.*, f.name AS from_name, t.name AS to_name
    FROM delegations d
    JOIN users f ON f.id = d.from_user
    JOIN users t ON t.id = d.to_user
`;

/** ใช้วันที่ตามเครื่อง ไม่ใช่ UTC — คนตั้งวันลาคิดเป็นวันที่ของตัวเอง */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const inRange = "d.active = 1 AND sql_date(@day) BETWEEN sql_date(d.from_date) AND sql_date(d.to_date)";

/** คนที่ "ฉัน" กดแทนได้ตอนนี้ (มีคนมอบหมายมาให้ฉัน) */
export async function iActFor(userId: number, day = today()): Promise<Delegation[]> {
  return (await db.prepare(`${SELECT} WHERE d.to_user = @uid AND ${inRange}`)
    .all({ uid: userId, day })) as Delegation[];
}

/** คนที่รับงานแทน "ฉัน" ตอนนี้ */
export async function coversForMe(userId: number, day = today()): Promise<Delegation[]> {
  return (await db.prepare(`${SELECT} WHERE d.from_user = @uid AND ${inRange}`)
    .all({ uid: userId, day })) as Delegation[];
}

/** id ของคนที่ userId กดแทนได้ — ใช้ประกอบเงื่อนไข SQL ที่อื่น */
export async function actableUserIds(userId: number, day = today()): Promise<number[]> {
  return (await iActFor(userId, day)).map((d) => d.from_user);
}

/**
 * ใครควรได้รับแจ้งเตือนแทนคนนี้ — ถ้าไม่มีใครแทน ก็คือตัวเขาเอง
 * ใช้ตอนส่งการ์ดขออนุมัติและตอนทวงงานค้าง เพราะการยิงหาคนที่ลาอยู่คือการยิงทิ้ง
 */
export async function notifyTargetFor(userId: number, day = today()): Promise<number> {
  const row = (await db
    .prepare(`SELECT to_user FROM delegations d WHERE d.from_user = @uid AND ${inRange}
              ORDER BY d.id DESC LIMIT 1`)
    .get({ uid: userId, day })) as { to_user: number } | undefined;
  return row?.to_user ?? userId;
}

/** ตรวจว่า actor มีสิทธิ์กดแทน owner ตอนนี้หรือไม่ */
export async function canActFor(actorId: number, ownerId: number, day = today()): Promise<boolean> {
  if (actorId === ownerId) return true;
  const row = (await db
    .prepare(`SELECT 1 AS ok FROM delegations d
               WHERE d.from_user = @owner AND d.to_user = @actor AND ${inRange} LIMIT 1`)
    .get({ owner: ownerId, actor: actorId, day })) as { ok: number } | undefined;
  return Boolean(row);
}

/* ---------- จัดการรายการ ---------- */

export async function listDelegations(userId?: number): Promise<Delegation[]> {
  const where = userId ? "WHERE d.from_user = @uid OR d.to_user = @uid" : "";
  return (await db
    .prepare(`${SELECT} ${where} ORDER BY d.active DESC, sql_date(d.to_date) DESC, d.id DESC`)
    .all(userId ? { uid: userId } : {})) as Delegation[];
}

export type SaveResult = { error?: string; id?: number };

export async function saveDelegation(input: {
  id?: number;
  fromUser: number;
  toUser: number;
  fromDate: string;
  toDate: string;
  reason: string;
  createdBy: number;
}): Promise<SaveResult> {
  const { fromUser, toUser, fromDate, toDate } = input;

  if (!fromUser || !toUser) return { error: "กรุณาเลือกผู้มอบและผู้รับแทน" };
  if (fromUser === toUser) return { error: "มอบหมายให้ตัวเองไม่ได้" };
  if (!fromDate || !toDate) return { error: "กรุณาระบุช่วงวันที่" };
  if (toDate < fromDate) return { error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" };

  const target = (await db.prepare(`${USER_SELECT} WHERE u.id = ? AND u.active = 1`).get(toUser)) as
    | User
    | undefined;
  if (!target) return { error: "ไม่พบผู้รับแทน หรือบัญชีถูกปิดใช้งาน" };

  // กันมอบหมายวน: ถ้าคนที่จะรับแทน มอบหมายกลับมาหาคนนี้ในช่วงเวลาที่ทับกัน
  // ทั้งคู่จะไม่มีใครรับงานจริง เพราะระบบไม่ต่อทอดสิทธิ์
  const loop = (await db
    .prepare(
      `SELECT 1 AS ok FROM delegations
        WHERE active = 1 AND from_user = @to AND to_user = @from
          AND sql_date(from_date) <= sql_date(@toDate) AND sql_date(to_date) >= sql_date(@fromDate)
          AND id <> @id LIMIT 1`,
    )
    .get({ to: toUser, from: fromUser, fromDate, toDate, id: input.id ?? 0 }));
  if (loop) return { error: "ผู้รับแทนได้มอบหมายกลับมาให้คนนี้ในช่วงเวลาเดียวกัน" };

  const overlap = (await db
    .prepare(
      `SELECT 1 AS ok FROM delegations
        WHERE active = 1 AND from_user = @from
          AND sql_date(from_date) <= sql_date(@toDate) AND sql_date(to_date) >= sql_date(@fromDate)
          AND id <> @id LIMIT 1`,
    )
    .get({ from: fromUser, fromDate, toDate, id: input.id ?? 0 }));
  if (overlap) return { error: "มีการมอบหมายของคนนี้ในช่วงเวลาที่ทับกันอยู่แล้ว" };

  if (input.id) {
    await db.prepare(
      `UPDATE delegations SET to_user=?, from_date=?, to_date=?, reason=? WHERE id=?`,
    ).run(toUser, fromDate, toDate, input.reason, input.id);
    return { id: input.id };
  }

  const info = (await db
    .prepare(
      `INSERT INTO delegations (from_user, to_user, from_date, to_date, reason, created_by)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(fromUser, toUser, fromDate, toDate, input.reason, input.createdBy));
  return { id: Number(info.lastInsertRowid) };
}

export async function setDelegationActive(id: number, active: boolean) {
  await db.prepare("UPDATE delegations SET active=? WHERE id=?").run(active ? 1 : 0, id);
}

export async function deleteDelegation(id: number) {
  await db.prepare("DELETE FROM delegations WHERE id=?").run(id);
}
