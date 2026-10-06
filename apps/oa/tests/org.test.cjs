const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { subordinateIds, hasSubordinates, canBeManager } = require("../.test-build/lib/org.js");

// ผังตัวอย่าง: 1 คุม 2 กับ 3 · 2 คุม 4 · 5 ไม่มีหัวหน้าและไม่มีลูกน้อง
const ORG = [
  { id: 1, manager_id: null },
  { id: 2, manager_id: 1 },
  { id: 3, manager_id: 1 },
  { id: 4, manager_id: 2 },
  { id: 5, manager_id: null },
];

describe("ไล่สายบังคับบัญชา", () => {
  test("เห็นลูกน้องทางตรง", async () => {
    assert.deepEqual(subordinateIds(ORG, 2).sort(), [4]);
  });

  /**
   * "แผนกเดียวกัน" ตอบข้อนี้ไม่ได้ — หัวหน้าของหัวหน้าต้องเห็นของทั้งสายที่อยู่ใต้ตน
   * ไม่ใช่แค่ชั้นที่รายงานตรงกับตัวเอง
   */
  test("เห็นลูกน้องทางอ้อมด้วย ไม่ใช่แค่ชั้นเดียว", async () => {
    assert.deepEqual(subordinateIds(ORG, 1).sort(), [2, 3, 4]);
  });

  test("คนที่ไม่มีลูกน้อง = ไม่ได้สิทธิ์อะไรเพิ่ม", async () => {
    assert.deepEqual(subordinateIds(ORG, 5), []);
    assert.equal(hasSubordinates(ORG, 5), false);
    assert.equal(hasSubordinates(ORG, 1), true);
  });

  test("ตัวเองไม่นับเป็นลูกน้องตัวเอง", async () => {
    assert.equal(subordinateIds(ORG, 1).includes(1), false);
  });

  /**
   * ข้อมูลที่กรอกด้วยมือวนเป็นวงกลมได้เสมอ ถ้าไม่กันไว้จะไล่ไม่จบและหน้าค้างทั้งระบบ
   */
  test("ผังที่วนเป็นวงกลมต้องไล่จบ ไม่ค้าง", async () => {
    const loop = [
      { id: 1, manager_id: 2 },
      { id: 2, manager_id: 1 },
    ];
    assert.deepEqual(subordinateIds(loop, 1), [2]);
    assert.deepEqual(subordinateIds(loop, 2), [1]);
  });
});

describe("กันวงกลมตั้งแต่ตอนบันทึก", () => {
  test("ตั้งตัวเองเป็นหัวหน้าตัวเองไม่ได้", async () => {
    assert.equal(canBeManager(ORG, 1, 1), false);
  });

  test("ตั้งลูกน้องทางตรงเป็นหัวหน้าไม่ได้", async () => {
    assert.equal(canBeManager(ORG, 1, 2), false);
  });

  test("ตั้งลูกน้องทางอ้อมเป็นหัวหน้าก็ไม่ได้ — วงกลมข้ามชั้นก็ยังเป็นวงกลม", async () => {
    assert.equal(canBeManager(ORG, 1, 4), false);
  });

  test("ตั้งคนที่ไม่ได้อยู่ใต้ตนเป็นหัวหน้าได้ตามปกติ", async () => {
    assert.equal(canBeManager(ORG, 4, 5), true);
    assert.equal(canBeManager(ORG, 3, 2), true);
  });
});
