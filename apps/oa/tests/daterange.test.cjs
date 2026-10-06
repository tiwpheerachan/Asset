const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { parseForm, rangeDays, rangeName } = require("../.test-build/lib/form.js");

const field = (over) => ({
  field_key: "period", label: "ช่วงสัญญา", type: "DATERANGE", field_role: "",
  required: 0, active: 1, options: [], columns: [], help: "",
  show_if_key: "", show_if_value: "", sort_order: 1, ...over,
});

const fd = (pairs) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.append(k, v);
  return f;
};

describe("นับจำนวนวันของช่วงเวลา", () => {
  /**
   * งานที่เริ่มและจบวันเดียวกันคือทำงาน 1 วัน ไม่ใช่ 0 วัน — เป็นวิธีนับแบบที่คน
   * คุยกันจริงเวลาถามว่า "งานนี้ใช้เวลากี่วัน"
   */
  test("วันเดียวกัน = 1 วัน", async () => {
    assert.equal(rangeDays({ from: "2026-09-10", to: "2026-09-10" }), 1);
  });

  test("นับรวมทั้งวันแรกและวันสุดท้าย", async () => {
    assert.equal(rangeDays({ from: "2026-09-01", to: "2026-09-30" }), 30);
  });

  test("ข้ามเดือนและข้ามปีก็ยังนับถูก", async () => {
    assert.equal(rangeDays({ from: "2026-12-30", to: "2027-01-02" }), 4);
  });

  test("กรอกไม่ครบหรือสลับหัวท้าย = นับไม่ได้ ไม่ใช่ตอบ 0", async () => {
    assert.equal(rangeDays({ from: "2026-09-10", to: "" }), null);
    assert.equal(rangeDays({ from: "", to: "2026-09-10" }), null);
    assert.equal(rangeDays({ from: "2026-09-20", to: "2026-09-10" }), null);
    assert.equal(rangeDays("2026-09-10"), null);
  });
});

describe("อ่านช่วงเวลาจากฟอร์ม", () => {
  test("เก็บสองปลายเป็นค่าเดียว", async () => {
    const r = parseForm([field()], fd({
      [rangeName("period", "from")]: "2026-01-01",
      [rangeName("period", "to")]: "2026-03-31",
    }));
    assert.equal(r.error, null);
    assert.deepEqual(r.values.period, { from: "2026-01-01", to: "2026-03-31" });
  });

  test("วันสิ้นสุดมาก่อนวันเริ่ม = ไม่ผ่าน (เอกสารที่บอกว่างานจบก่อนเริ่มไม่ควรมีอยู่)", async () => {
    const r = parseForm([field()], fd({
      [rangeName("period", "from")]: "2026-03-31",
      [rangeName("period", "to")]: "2026-01-01",
    }));
    // ข้อความผูกกับช่องนั้นโดยตรง จะได้แสดงใต้ช่องที่ผิดจริง ไม่ใช่ลอยอยู่บนหัวฟอร์ม
    assert.match(r.errors.period, /วันสิ้นสุด/);
  });

  /** กรอกข้างเดียวไม่ได้บอกอะไรเลยว่างานกินเวลาแค่ไหน จึงยังไม่นับว่ากรอกแล้ว */
  test("ช่องบังคับที่กรอกมาข้างเดียว = ยังไม่ครบ", async () => {
    const r = parseForm([field({ required: 1 })], fd({
      [rangeName("period", "from")]: "2026-01-01",
      [rangeName("period", "to")]: "",
    }));
    assert.match(r.errors.period, /จำเป็นต้องกรอก/);
  });

  test("บันทึกร่างไม่ต้องกรอกครบ", async () => {
    const r = parseForm([field({ required: 1 })], fd({}), { requireFilled: false });
    assert.equal(r.error, null);
  });
});
