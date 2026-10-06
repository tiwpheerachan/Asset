const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { parseDbTime } = require("../.test-build/lib/format.js");
const { findStale } = require("../.test-build/lib/reminders.js");

/**
 * อ่านเวลาที่เก็บเป็นข้อความในฐานข้อมูล
 *
 * ที่มา: ในระบบมีเวลาสองรูปแบบปนกัน — คอลัมน์ที่ Postgres ใส่เองเป็น
 * "2026-09-10 07:56:40" ส่วนคอลัมน์ที่โค้ด JS เขียนเป็น "2026-09-10T07:56:40.120Z"
 * โค้ดเดิมเติม "Z" ต่อท้ายทุกกรณี รูปแบบที่สองจึงกลายเป็น "...120ZZ" แปลงไม่ได้
 * แล้วถูกข้ามเงียบ ๆ ผลคือระบบเตือนงานค้างไม่เคยทวงใครเลยแม้แต่ครั้งเดียว
 * (ของจริงบน production: ใบค้าง 10 วัน แต่หน้าจอบอกว่าไม่มีงานค้างเกินกำหนด)
 */
describe("แปลงเวลาจากฐานข้อมูล", () => {
  test("รูปแบบที่ Postgres ใส่เอง (ไม่มีเขตเวลา) ถือเป็น UTC", () => {
    assert.equal(
      new Date(parseDbTime("2026-09-10 07:56:40")).toISOString(),
      "2026-09-10T07:56:40.000Z",
    );
  });

  test("รูปแบบ ISO ที่มี Z อยู่แล้ว ต้องไม่เติมซ้ำจนพัง", () => {
    const ms = parseDbTime("2026-09-10T07:56:40.120Z");
    assert.ok(Number.isFinite(ms), "อ่านค่าไม่ออก — นี่คือบั๊กเดิม");
    assert.equal(new Date(ms).toISOString(), "2026-09-10T07:56:40.120Z");
  });

  test("รูปแบบที่มีเขตเวลาแบบ +07:00 ก็อ่านได้", () => {
    assert.equal(
      new Date(parseDbTime("2026-09-10T14:56:40+07:00")).toISOString(),
      "2026-09-10T07:56:40.000Z",
    );
  });

  test("ค่าว่างหรืออ่านไม่ออก คืน NaN ไม่ใช่เดาเป็นเวลาปัจจุบัน", () => {
    for (const v of [null, undefined, "", "ไม่ใช่เวลา"]) {
      assert.ok(Number.isNaN(parseDbTime(v)), `ควรเป็น NaN: ${v}`);
    }
  });
});

describe("หางานค้างที่ต้องทวง", () => {
  let approver, req;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    const requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: requester.id, status: "PENDING", step: 1 });
  });

  const addPending = async (notifiedAt) => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: approver.id });
    await h.db.prepare("UPDATE request_approvers SET notified_at=? WHERE id=?").run(notifiedAt, row);
    return row;
  };

  const clear = () => h.db.prepare("DELETE FROM request_approvers WHERE request_id=?").run(req);

  test("เวลาแบบ ISO (ที่ระบบเขียนจริง) ต้องถูกนับว่าค้าง", async () => {
    await clear();
    const eightDaysAgo = new Date(Date.now() - 8 * 86400_000).toISOString();
    await addPending(eightDaysAgo);

    const stale = await findStale();
    assert.equal(stale.length, 1, "งานค้าง 8 วันต้องถูกพบ — เดิมถูกข้ามเพราะอ่านเวลาไม่ออก");
    assert.equal(stale[0].days, 8);
    assert.equal(stale[0].level, "ESCALATION", "เกิน 7 วันต้องแจ้งหัวหน้า");
  });

  test("เวลาแบบมีช่องว่าง (Postgres ใส่เอง) ก็ต้องถูกนับเหมือนกัน", async () => {
    await clear();
    const d = new Date(Date.now() - 4 * 86400_000).toISOString().replace("T", " ").slice(0, 19);
    await addPending(d);

    const stale = await findStale();
    assert.equal(stale.length, 1);
    assert.equal(stale[0].days, 4);
    assert.equal(stale[0].level, "REMINDER", "4 วันยังไม่ถึงขั้นแจ้งหัวหน้า");
  });

  test("ยังไม่ถึงเกณฑ์ ต้องไม่ทวง", async () => {
    await clear();
    await addPending(new Date(Date.now() - 3600_000).toISOString());
    assert.deepEqual(await findStale(), []);
  });
});
