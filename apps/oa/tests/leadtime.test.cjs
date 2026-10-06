const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  checkLeadTime,
  daysUntil,
  needsUrgentReason,
  blocksSubmit,
} = require("../.test-build/lib/leadtime.js");

const TODAY = "2026-09-01";
const rule = (over = {}) => ({ lead_days: 7, lead_urgent_days: 3, lead_mode: "WARN", ...over });

/**
 * กติกานี้ตัดสินว่า "ส่งคำขอได้ไหม" ซึ่งขวางงานคนได้จริง
 * พลาดด้านหลวมคือกติกาไม่มีผล พลาดด้านเข้มคือคนส่งงานไม่ได้ทั้งที่ควรได้
 */
describe("นับวันล่วงหน้า", () => {
  test("นับเป็นวันปฏิทิน ไม่ใช่ชั่วโมง", async () => {
    assert.equal(daysUntil("2026-09-08", TODAY), 7);
    assert.equal(daysUntil("2026-09-01", TODAY), 0);
    assert.equal(daysUntil("2026-08-30", TODAY), -2);
  });

  test("ข้ามเดือนข้ามปีถูกต้อง", async () => {
    assert.equal(daysUntil("2026-10-01", TODAY), 30);
    assert.equal(daysUntil("2027-01-01", "2026-12-25"), 7);
  });

  test("รูปแบบวันที่เพี้ยนคืน null ไม่โยน error", async () => {
    assert.equal(daysUntil("", TODAY), null);
    assert.equal(daysUntil("พรุ่งนี้", TODAY), null);
    assert.equal(daysUntil("2026-13-45", TODAY), null);
  });
});

describe("ตรวจว่ายื่นล่วงหน้าพอไหม", () => {
  test("ฟอร์มที่ไม่ได้ตั้งกติกา = ไม่ตรวจอะไรเลย", async () => {
    assert.equal(checkLeadTime(rule({ lead_days: 0 }), "2026-09-02", TODAY).state, "off");
  });

  test("ไม่มีวันที่จัดงานให้นับ = ไม่ตรวจ", async () => {
    assert.equal(checkLeadTime(rule(), null, TODAY).state, "off");
    assert.equal(checkLeadTime(rule(), "", TODAY).state, "off");
  });

  test("ล่วงหน้าครบตามกำหนด = ผ่าน", async () => {
    assert.equal(checkLeadTime(rule(), "2026-09-08", TODAY).state, "ok");
    assert.equal(checkLeadTime(rule(), "2026-10-01", TODAY).state, "ok");
  });

  test("พอดีเส้น 7 วันต้องผ่าน ไม่ใช่ตกไปเป็นด่วน", async () => {
    const c = checkLeadTime(rule(), "2026-09-08", TODAY);
    assert.equal(c.state, "ok");
    assert.equal(c.daysAhead, 7);
  });

  test("น้อยกว่า 7 แต่ยังถึง 3 = ด่วน ต้องกรอกเหตุผล", async () => {
    const c = checkLeadTime(rule(), "2026-09-05", TODAY);
    assert.equal(c.state, "urgent");
    assert.equal(c.daysAhead, 4);
    assert.equal(needsUrgentReason(c), true);
    assert.equal(blocksSubmit(c), false);
  });

  test("พอดีเส้น 3 วันยังเป็นด่วน ไม่ใช่สาย", async () => {
    assert.equal(checkLeadTime(rule(), "2026-09-04", TODAY).state, "urgent");
  });

  test("ต่ำกว่าช่วงด่วน + โหมดเตือน = ส่งได้แต่ต้องมีเหตุผล", async () => {
    const c = checkLeadTime(rule(), "2026-09-02", TODAY);
    assert.equal(c.state, "late");
    assert.equal(needsUrgentReason(c), true);
    assert.equal(blocksSubmit(c), false);
  });

  test("ต่ำกว่าช่วงด่วน + โหมดห้าม = ส่งไม่ได้", async () => {
    const c = checkLeadTime(rule({ lead_mode: "BLOCK" }), "2026-09-02", TODAY);
    assert.equal(c.state, "late");
    assert.equal(blocksSubmit(c), true);
  });

  test("วันที่ผ่านมาแล้วก็ถือว่าสาย", async () => {
    assert.equal(checkLeadTime(rule(), "2026-08-20", TODAY).state, "late");
  });

  test("ตั้งช่วงด่วนมากกว่าช่วงปกติ = ถือว่าไม่มีช่วงด่วน ไม่ใช่พังหรือหลวม", async () => {
    const c = checkLeadTime(rule({ lead_urgent_days: 30 }), "2026-09-05", TODAY);
    assert.equal(c.state, "late");
    assert.equal(c.need, 7);
  });

  test("ไม่ตั้งช่วงด่วนเลย = ไม่ถึงกำหนดก็สายทันที", async () => {
    assert.equal(checkLeadTime(rule({ lead_urgent_days: 0 }), "2026-09-05", TODAY).state, "late");
  });
});
