const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { refsFor } = require("../.test-build/lib/refs.js");

const field = (type, options) => ({ type, options, field_key: "master_ref" });
const req = (id, code) => ({ id, template_code: code, doc_no: `AP-${code}-${id}` });

const POOL = [
  req(9, "KAA"),
  req(8, "CREDIT_NOTE"),
  req(7, "DISCOUNT"),
  req(6, "KAA"),
];

/**
 * อ้างอิงผิดใบแล้วตามรอยกลับไม่ได้ ซึ่งเป็นเหตุผลทั้งหมดที่อ้างอิงกันตั้งแต่แรก
 * การจำกัดฟอร์มจึงไม่ใช่แค่ความสะดวก แต่กันความผิดพลาดที่มองไม่เห็นตอนกรอก
 */
describe("จำกัดฟอร์มที่ช่องอ้างอิงเลือกได้", () => {
  test("ไม่ระบุฟอร์ม = เลือกได้ทุกใบ (ฟิลด์เดิมที่ตั้งไว้ก่อนอัปเกรดต้องไม่เปลี่ยนพฤติกรรม)", async () => {
    assert.deepEqual(refsFor(field("REQUEST", []), POOL), POOL);
  });

  test("ระบุฟอร์มเดียว = เหลือเฉพาะใบของฟอร์มนั้น", async () => {
    const got = refsFor(field("REQUEST", ["KAA"]), POOL).map((r) => r.id);
    assert.deepEqual(got, [9, 6]);
  });

  test("ระบุหลายฟอร์มได้", async () => {
    const got = refsFor(field("REQUEST", ["KAA", "DISCOUNT"]), POOL).map((r) => r.id);
    assert.deepEqual(got, [9, 7, 6]);
  });

  test("ระบุฟอร์มที่ไม่มีเอกสารเลย = ไม่เหลืออะไรให้เลือก ไม่ใช่ตกกลับไปแสดงทุกใบ", async () => {
    assert.deepEqual(refsFor(field("REQUEST", ["PURCHASE"]), POOL), []);
  });

  test("เรียงลำดับเดิมไว้ — ใบใหม่ต้องยังอยู่บนสุด", async () => {
    const got = refsFor(field("REQUEST", ["KAA"]), POOL).map((r) => r.doc_no);
    assert.deepEqual(got, ["AP-KAA-9", "AP-KAA-6"]);
  });

  test("ฟิลด์ชนิดอื่นไม่ถูกกรอง แม้ options จะมีค่า (SELECT ใช้ options เก็บตัวเลือก)", async () => {
    assert.deepEqual(refsFor(field("SELECT", ["KAA"]), POOL), POOL);
  });
});
