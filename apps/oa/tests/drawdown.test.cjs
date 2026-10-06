const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { drawdown, overBudgetBy } = require("../.test-build/lib/drawdown.js");

let id = 0;
const child = (status, amount) => ({ id: ++id, status, amount });

describe("เบิกงวดจากใบอนุมัติหลัก", () => {
  test("ยังไม่มีลูกสักใบ = เหลือเต็มวงเงิน", async () => {
    const d = drawdown(1_000_000, 5, []);
    assert.equal(d.committed, 0);
    assert.equal(d.remaining, 1_000_000);
    assert.equal(d.count, 0);
    assert.equal(d.full, false);
  });

  /**
   * ใบที่ยังรออนุมัติยังไม่ใช่เงินที่จ่ายจริง แต่กันวงเงินไว้แล้ว — ถ้าไม่นับรวม
   * สองคนยื่นพร้อมกันก็เบิกทะลุวงเงินได้ทั้งคู่โดยไม่มีอะไรกั้น
   */
  test("แยกใช้แล้วกับจองไว้ แต่หักวงเงินทั้งคู่", async () => {
    const d = drawdown(1_000_000, 5, [
      child("APPROVED", 300_000),
      child("PENDING", 200_000),
    ]);
    assert.equal(d.used, 300_000);
    assert.equal(d.reserved, 200_000);
    assert.equal(d.committed, 500_000);
    assert.equal(d.remaining, 500_000);
    assert.equal(d.count, 2);
  });

  test("ใบที่ถูกตีกลับ ยกเลิก หรือยังเป็นร่าง ไม่กินวงเงิน", async () => {
    const d = drawdown(1_000_000, 5, [
      child("REJECTED", 400_000),
      child("CANCELLED", 400_000),
      child("DRAFT", 400_000),
      child("RETURNED", 400_000),
    ]);
    assert.equal(d.committed, 0);
    assert.equal(d.count, 0);
  });

  test("อนุมัติเบื้องต้นก็กันวงเงินไว้แล้ว", async () => {
    const d = drawdown(500_000, null, [child("PRELIM_APPROVED", 120_000)]);
    assert.equal(d.reserved, 120_000);
    assert.equal(d.remaining, 380_000);
  });

  test("ครบจำนวนงวดที่ตั้งไว้", async () => {
    const two = [child("APPROVED", 1), child("PENDING", 1)];
    assert.equal(drawdown(null, 2, two).full, true);
    assert.equal(drawdown(null, 3, two).full, false);
    assert.equal(drawdown(null, null, two).full, false, "ไม่ได้ตั้งจำนวนงวด = ไม่มีคำว่าครบ");
  });

  test("ใบหลักไม่ระบุวงเงิน = ไม่มีเพดาน ตรวจอะไรไม่ได้", async () => {
    const d = drawdown(null, null, [child("APPROVED", 900_000)]);
    assert.equal(d.remaining, null);
    assert.equal(d.over, false);
    assert.equal(overBudgetBy(d, 999_999), null);
  });

  test("รู้ว่าเบิกทะลุไปแล้ว (เช่นวงเงินใบหลักถูกแก้ทีหลัง)", async () => {
    const d = drawdown(100_000, null, [child("APPROVED", 150_000)]);
    assert.equal(d.over, true);
    assert.equal(d.remaining, -50_000);
  });
});

describe("กันการยื่นเกินวงเงินใบหลัก", () => {
  const base = drawdown(1_000_000, 5, [child("APPROVED", 800_000)]);

  test("ยอดพอดีวงเงินที่เหลือ = ผ่าน", async () => {
    assert.equal(overBudgetBy(base, 200_000), null);
  });

  test("เกินไปเท่าไรบอกได้ตรง ๆ ไม่ใช่แค่บอกว่าไม่ผ่าน", async () => {
    assert.equal(overBudgetBy(base, 250_000), 50_000);
  });

  test("ใบที่ไม่มีวงเงินกรอกมา ไม่กินวงเงินใคร", async () => {
    assert.equal(overBudgetBy(base, null), null);
  });
});
