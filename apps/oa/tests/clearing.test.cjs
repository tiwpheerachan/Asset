const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { clearDueDate, clearStatus } = require("../.test-build/lib/clearing.js");

const TODAY = "2026-09-20";

/**
 * กำหนดเคลียร์ผิดวันเดียวก็ทำให้คนโดนทวงทั้งที่ยังไม่ถึงกำหนด
 * หรือแย่กว่านั้นคือไม่โดนทวงเลยทั้งที่เลยมาแล้ว
 */
describe("คำนวณวันครบกำหนดเคลียร์ OA", () => {
  test("ฟอร์มที่ไม่ได้เปิดติดตาม = ไม่มีกำหนด", async () => {
    assert.equal(clearDueDate(0, "2026-09-01"), "");
  });

  test("ไม่มีวันงาน = นับจากวันอนุมัติ", async () => {
    assert.equal(clearDueDate(15, "2026-09-01"), "2026-09-16");
  });

  test("มีวันงานในอนาคต = นับจากวันงาน ไม่ใช่วันอนุมัติ", async () => {
    // อนุมัติล่วงหน้าสองเดือน ถ้านับจากวันอนุมัติ กำหนดจะครบก่อนงานเกิดขึ้นด้วยซ้ำ
    assert.equal(clearDueDate(15, "2026-09-01", "2026-11-01"), "2026-11-16");
  });

  test("วันงานผ่านมาแล้ว = นับจากวันอนุมัติแทน", async () => {
    assert.equal(clearDueDate(15, "2026-09-01", "2026-08-01"), "2026-09-16");
  });

  test("ข้ามเดือนข้ามปีถูกต้อง", async () => {
    assert.equal(clearDueDate(30, "2026-12-20"), "2027-01-19");
    assert.equal(clearDueDate(7, "2026-02-25"), "2026-03-04");
  });

  test("วันที่เพี้ยนไม่ทำให้พัง", async () => {
    assert.equal(clearDueDate(15, "ไม่ใช่วันที่"), "");
    assert.equal(clearDueDate(15, "2026-09-01", "พรุ่งนี้"), "2026-09-16");
  });
});

describe("สถานะการเคลียร์", () => {
  test("ไม่มีกำหนด = ไม่ติดตาม", async () => {
    assert.equal(clearStatus({ clear_due_date: "", oa_ref: "" }, TODAY).state, "off");
  });

  test("กรอกเลข OA แล้ว = จบ แม้จะเลยกำหนดมาแล้ว", async () => {
    const s = clearStatus({ clear_due_date: "2026-09-01", oa_ref: "OA-123" }, TODAY);
    assert.equal(s.state, "done");
    assert.equal(s.oaRef, "OA-123");
  });

  test("ยังไม่ถึงกำหนด = รอเคลียร์ พร้อมบอกเหลือกี่วัน", async () => {
    const s = clearStatus({ clear_due_date: "2026-09-25", oa_ref: "" }, TODAY);
    assert.equal(s.state, "pending");
    assert.equal(s.daysLeft, 5);
  });

  test("วันครบกำหนดพอดี ยังไม่ถือว่าเลย", async () => {
    const s = clearStatus({ clear_due_date: TODAY, oa_ref: "" }, TODAY);
    assert.equal(s.state, "pending");
    assert.equal(s.daysLeft, 0);
  });

  test("เลยกำหนดแล้ว = บอกว่าเลยมากี่วัน", async () => {
    const s = clearStatus({ clear_due_date: "2026-09-10", oa_ref: "" }, TODAY);
    assert.equal(s.state, "overdue");
    assert.equal(s.daysLate, 10);
  });
});
