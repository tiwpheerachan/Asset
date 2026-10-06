const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { pickPreviewFields, previewValue } = require("../.test-build/lib/preview.js");

let n = 0;
const field = (over) => ({
  id: ++n, field_key: `k${n}`, label: `ช่อง ${n}`, type: "TEXT", field_role: "",
  required: 0, active: 1, options: [], columns: [], help: "",
  show_if_key: "", show_if_value: "", sort_order: n, ...over,
});

describe("เลือกช่องมาแสดงย่อในรายการงาน", () => {
  /**
   * หัวเรื่อง ยอดเงิน และวันที่เอกสาร มีที่แสดงของตัวเองอยู่บนบรรทัดเดียวกันแล้ว
   * ถ้ายกมาอีกจะเห็นค่าเดียวกันสองที่ในบรรทัดเดียว
   */
  test("ข้ามช่องที่ระบบแสดงไว้ที่อื่นแล้ว", async () => {
    n = 0;
    const got = pickPreviewFields([
      field({ field_role: "TITLE" }),
      field({ field_role: "AMOUNT", type: "MONEY" }),
      field({ field_role: "DATE", type: "DATE" }),
      field({ label: "สาขา" }),
    ]);
    assert.deepEqual(got.map((f) => f.label), ["สาขา"]);
  });

  test("ข้ามตารางกับไฟล์ — ย่อลงมาเป็นบรรทัดเดียวไม่ได้", async () => {
    n = 0;
    const got = pickPreviewFields([
      field({ type: "TABLE", label: "รายการสินค้า" }),
      field({ type: "FILE", label: "เอกสารแนบ" }),
      field({ type: "HEADING", label: "หัวข้อ" }),
      field({ label: "หมายเหตุ" }),
    ]);
    assert.deepEqual(got.map((f) => f.label), ["หมายเหตุ"]);
  });

  test("ข้ามช่องที่ปิดใช้", async () => {
    n = 0;
    const got = pickPreviewFields([field({ active: 0 }), field({ label: "ใช้ได้" })]);
    assert.deepEqual(got.map((f) => f.label), ["ใช้ได้"]);
  });

  /** ยกมาทั้งฟอร์มแล้วรายการจะกลายเป็นเอกสารซ้อนเอกสาร หมดประโยชน์ของการเป็นรายการ */
  test("เอามาไม่เกินที่กำหนด", async () => {
    n = 0;
    const many = Array.from({ length: 9 }, () => field({}));
    assert.equal(pickPreviewFields(many).length, 3);
    assert.equal(pickPreviewFields(many, 2).length, 2);
  });
});

describe("ย่อค่าของช่องเป็นข้อความสั้น", () => {
  const th = "th";

  test("ยังไม่ได้กรอก = คืนค่าว่าง เพื่อให้ข้ามบรรทัดนั้นไป", async () => {
    assert.equal(previewValue(field({}), null, th), "");
    assert.equal(previewValue(field({}), "   ", th), "");
    assert.equal(previewValue(field({ type: "DATE" }), "", th), "");
  });

  test("ตัวเลือกหลายข้อรวมเป็นบรรทัดเดียว", async () => {
    assert.equal(previewValue(field({ type: "MULTISELECT" }), ["ก", "ข"], th), "ก, ข");
  });

  test("ช่วงเวลาแสดงทั้งสองปลายพร้อมจำนวนวัน", async () => {
    const got = previewValue(
      field({ type: "DATERANGE" }),
      { from: "2026-01-01", to: "2026-01-10" },
      th,
    );
    assert.match(got, /–/);
    assert.match(got, /\(10\)/);
  });

  test("ช่วงเวลาที่กรอกไม่ครบ = ไม่แสดง", async () => {
    assert.equal(previewValue(field({ type: "DATERANGE" }), { from: "2026-01-01", to: "" }, th), "");
  });
});
