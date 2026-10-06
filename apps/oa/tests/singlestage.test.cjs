const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { mergeStagesPlan } = require("../.test-build/lib/single-stage.js");

let id = 0;
const node = (stage, sort_order, name, over = {}) => ({
  id: ++id, name, kind: "APPROVE", stage, sort_order, active: 1, ...over,
});

describe("ยุบสองระดับให้เหลือสายเดียว", () => {
  test("ขั้นเบื้องต้นมาก่อนขั้นจริงเสมอ — ลำดับคนอนุมัติต้องไม่สลับ", async () => {
    id = 0;
    const plan = mergeStagesPlan([
      node("FINAL", 1, "ผู้จัดการ"),
      node("FINAL", 2, "กรรมการ"),
      node("PRELIM", 1, "หัวหน้าทีม"),
    ]);
    assert.deepEqual(plan.reorder, [
      { id: 3, sort_order: 1 },
      { id: 1, sort_order: 2 },
      { id: 2, sort_order: 3 },
    ]);
  });

  /**
   * ฟอร์มจริงตั้งคนเดียวกันไว้ทั้งสองระดับ ซึ่งเป็นวิธีที่คนใช้แทนการเลือกระดับให้ถูก
   * ถ้ารวมสายแล้วปล่อยไว้ จะกลายเป็นคนเดิมต้องกดอนุมัติสองครั้งติดกัน
   */
  test("ชื่อขั้นซ้ำกัน = ปิดใช้ตัวหลัง เก็บตัวแรกไว้", async () => {
    id = 0;
    const plan = mergeStagesPlan([
      node("PRELIM", 1, "หัวหน้าฝ่ายขาย"),
      node("FINAL", 1, "หัวหน้าฝ่ายขาย"),
      node("FINAL", 2, "ผู้จัดการฝ่ายบัญชี"),
    ]);
    assert.deepEqual(plan.deactivate, [2]);
    assert.equal(plan.reorder.length, 3, "ปิดใช้ ไม่ใช่ลบ — ทุกขั้นยังอยู่ครบ");
  });

  test("ขั้นสำเนาถึงที่ชื่อตรงกับขั้นอนุมัติ ไม่นับว่าซ้ำ เพราะทำคนละหน้าที่", async () => {
    id = 0;
    const plan = mergeStagesPlan([
      node("PRELIM", 1, "ฝ่ายบัญชี"),
      node("FINAL", 1, "ฝ่ายบัญชี", { kind: "CC" }),
    ]);
    assert.deepEqual(plan.deactivate, []);
  });

  test("ขั้นที่ปิดใช้อยู่แล้วไม่ทำให้ขั้นที่ยังใช้งานอยู่โดนปิดตาม", async () => {
    id = 0;
    const plan = mergeStagesPlan([
      node("PRELIM", 1, "ผู้จัดการ", { active: 0 }),
      node("FINAL", 1, "ผู้จัดการ"),
    ]);
    assert.deepEqual(plan.deactivate, []);
  });

  test("ฟอร์มที่มีระดับเดียวอยู่แล้ว ลำดับไม่เปลี่ยนความหมาย", async () => {
    id = 0;
    const plan = mergeStagesPlan([node("FINAL", 5, "ก"), node("FINAL", 9, "ข")]);
    assert.deepEqual(plan.reorder, [{ id: 1, sort_order: 1 }, { id: 2, sort_order: 2 }]);
    assert.deepEqual(plan.deactivate, []);
  });
});
