const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { parseForm } = require("../.test-build/lib/form.js");

const field = (over) => ({
  field_key: "title", label: "หัวข้อเรื่อง", type: "TEXT", field_role: "TITLE",
  required: 1, active: 1, options: [], columns: [], help: "",
  show_if_key: "", show_if_value: "", sort_order: 1, ...over,
});

const fd = (pairs) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.append(k, v);
  return f;
};

/**
 * ปุ่ม "บันทึกแบบร่าง" มีไว้เก็บงานที่ยังกรอกไม่เสร็จ ถ้ายังบังคับให้กรอกครบก่อน
 * ถึงจะเก็บได้ ก็ไม่ต่างอะไรกับปุ่มส่ง — คนกรอกค้างจึงไม่มีทางเก็บงานไว้ได้เลย
 */
describe("บันทึกแบบร่างทั้งที่ยังกรอกไม่ครบ", () => {
  const fields = [field()];

  test("กดส่งจริง = ยังบังคับให้กรอกช่องที่จำเป็น", async () => {
    const r = parseForm(fields, fd({ "f_title": "" }));
    assert.match(String(r.error), /หัวข้อเรื่อง/);
  });

  test("บันทึกร่าง = ปล่อยให้ว่างได้", async () => {
    const r = parseForm(fields, fd({ "f_title": "" }), { requireFilled: false });
    assert.equal(r.error, null);
  });

  test("ร่างยังเก็บค่าที่กรอกมาแล้วครบถ้วน", async () => {
    const r = parseForm(fields, fd({ "f_title": "ส่วนลดลูกค้า A" }), { requireFilled: false });
    assert.equal(r.title, "ส่วนลดลูกค้า A");
  });

  test("ร่างยังไม่ยอมให้ตัวเลขเป็นตัวหนังสือ — เก็บลงคอลัมน์ตัวเลขไม่ได้จริง", async () => {
    const num = [field({ field_key: "amount", label: "จำนวนเงิน", type: "MONEY", field_role: "AMOUNT", required: 0 })];
    const r = parseForm(num, fd({ "f_amount": "ห้าพัน" }), { requireFilled: false });
    assert.match(String(r.error), /ต้องเป็นตัวเลข/);
  });
});

/**
 * ช่องที่ไม่เข้าเงื่อนไขต้องไม่ถูกบังคับกรอก — ไม่งั้นคนกรอกจะเจอ "กรุณากรอก X"
 * ที่หาช่อง X บนหน้าจอไม่เจอ เพราะมันถูกซ่อนอยู่ กดส่งยังไงก็ไม่ผ่าน
 */
describe("ช่องที่ซ่อนอยู่ไม่ถูกบังคับกรอก", () => {
  const fields = [
    field({ field_key: "kind", label: "ประเภท", type: "SELECT", field_role: "",
            options: ["ปกติ", "เกินวงเงิน"], required: 1, sort_order: 1 }),
    field({ field_key: "reason", label: "เหตุผลที่ขอเกินวงเงิน", field_role: "", required: 1,
            show_if_key: "kind", show_if_value: "เกินวงเงิน", sort_order: 2 }),
  ];

  test("เลือกค่าที่ไม่ปลุกช่องเงื่อนไข = ส่งได้ทั้งที่ช่องนั้นว่าง", async () => {
    const r = parseForm(fields, fd({ "f_kind": "ปกติ", "f_reason": "" }));
    assert.equal(r.error, null);
  });

  test("เลือกค่าที่ปลุกช่องเงื่อนไข = กลับมาบังคับกรอกตามเดิม", async () => {
    const r = parseForm(fields, fd({ "f_kind": "เกินวงเงิน", "f_reason": "" }));
    assert.match(String(r.error), /เหตุผลที่ขอเกินวงเงิน/);
  });

  test("ค่าที่ค้างอยู่ในช่องที่ซ่อนถูกล้างทิ้ง ไม่ติดไปกับเอกสาร", async () => {
    const r = parseForm(fields, fd({ "f_kind": "ปกติ", "f_reason": "พิมพ์ไว้ก่อนเปลี่ยนใจ" }));
    assert.equal(r.values.reason, "");
  });
});

/**
 * เดิมหยุดตรวจทันทีที่เจอช่องแรกที่ผิด คนกรอกจึงต้องกดส่ง–แก้–กดส่งใหม่ทีละช่อง
 * ฟอร์มที่มีช่องบังคับสิบช่องก็ต้องวนสิบรอบกว่าจะรู้ว่าต้องกรอกอะไรบ้าง
 */
describe("บอกข้อผิดพลาดทุกช่องในรอบเดียว", () => {
  const three = [
    field({ field_key: "a", label: "หัวข้อ", field_role: "", required: 1, sort_order: 1 }),
    field({ field_key: "b", label: "ผู้รับเงิน", field_role: "", required: 1, sort_order: 2 }),
    field({ field_key: "c", label: "จำนวนเงิน", type: "MONEY", field_role: "", required: 1, sort_order: 3 }),
  ];

  test("ช่องว่างสามช่อง = ได้ข้อความครบสามช่อง", async () => {
    const r = parseForm(three, fd({ "f_a": "", "f_b": "", "f_c": "" }));
    assert.deepEqual(Object.keys(r.errors).sort(), ["a", "b", "c"]);
  });

  test("ข้อความผูกกับช่อง ไม่ใช่ก้อนเดียวลอยบนหัวฟอร์ม", async () => {
    const r = parseForm(three, fd({ "f_a": "x", "f_b": "", "f_c": "1" }));
    assert.deepEqual(Object.keys(r.errors), ["b"]);
    assert.match(r.errors.b, /ผู้รับเงิน/);
  });

  test("ผิดหลายช่อง = สรุปบนหัวบอกจำนวน ไม่ใช่ข้อความของช่องเดียว", async () => {
    const r = parseForm(three, fd({}));
    assert.match(String(r.error), /3 ช่อง/);
  });

  test("ผิดช่องเดียว = สรุปบนหัวใช้ข้อความของช่องนั้นเลย", async () => {
    const r = parseForm(three, fd({ "f_a": "x", "f_b": "y", "f_c": "" }));
    assert.match(String(r.error), /จำนวนเงิน/);
  });

  test("กรอกครบ = ไม่มีข้อผิดพลาดเลย", async () => {
    const r = parseForm(three, fd({ "f_a": "x", "f_b": "y", "f_c": "10" }));
    assert.deepEqual(r.errors, {});
    assert.equal(r.error, null);
  });
});
