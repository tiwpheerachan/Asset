const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { isFieldVisible, visibleFields, conditionSources } = require("../.test-build/lib/visibility.js");

let seq = 0;
const f = (over) => ({
  id: ++seq, field_key: `k${seq}`, label: `ช่อง ${seq}`, type: "TEXT", field_role: "",
  required: 0, active: 1, options: [], columns: [], help: "",
  show_if_key: "", show_if_value: "", sort_order: seq, ...over,
});

describe("ช่องที่แสดงตามเงื่อนไข", () => {
  const kind = f({ field_key: "kind", type: "SELECT", options: ["ปกติ", "เกินวงเงิน"], sort_order: 1 });
  const reason = f({ field_key: "reason", show_if_key: "kind", show_if_value: "เกินวงเงิน", sort_order: 2 });
  const fields = [kind, reason];

  test("ยังไม่เลือก = ช่องเงื่อนไขยังไม่โผล่", async () => {
    assert.equal(isFieldVisible(reason, fields, {}), false);
  });

  test("เลือกตรงค่าที่ตั้งไว้ = โผล่", async () => {
    assert.equal(isFieldVisible(reason, fields, { kind: "เกินวงเงิน" }), true);
  });

  test("เลือกค่าอื่น = ไม่โผล่", async () => {
    assert.equal(isFieldVisible(reason, fields, { kind: "ปกติ" }), false);
  });

  test("ช่องที่ไม่มีเงื่อนไขแสดงเสมอ", async () => {
    assert.equal(isFieldVisible(kind, fields, {}), true);
  });

  test("ตัวเลือกหลายข้อ — นับว่าตรงเมื่อมีค่านั้นอยู่ในรายการที่เลือก", async () => {
    const multi = f({ field_key: "tags", type: "MULTISELECT", options: ["A", "B"], sort_order: 1 });
    const child = f({ field_key: "detail", show_if_key: "tags", show_if_value: "B", sort_order: 2 });
    assert.equal(isFieldVisible(child, [multi, child], { tags: ["A", "B"] }), true);
    assert.equal(isFieldVisible(child, [multi, child], { tags: ["A"] }), false);
  });

  /**
   * ถ้าช่องแม่ถูกซ่อนอยู่ ช่องลูกต้องซ่อนตาม — ไม่งั้นคนกรอกจะเจอช่องที่โผล่มา
   * โดยไม่มีอะไรบนหน้าจออธิบายว่าทำไม เพราะเหตุของมันถูกซ่อนไปแล้ว
   */
  test("ช่องแม่ถูกซ่อน ลูกต้องซ่อนตาม แม้ค่าของแม่จะยังค้างอยู่", async () => {
    const a = f({ field_key: "a", type: "SELECT", options: ["x", "y"], sort_order: 1 });
    const b = f({ field_key: "b", type: "SELECT", options: ["p", "q"], show_if_key: "a", show_if_value: "x", sort_order: 2 });
    const c = f({ field_key: "c", show_if_key: "b", show_if_value: "p", sort_order: 3 });
    assert.equal(isFieldVisible(c, [a, b, c], { a: "y", b: "p" }), false);
    assert.equal(isFieldVisible(c, [a, b, c], { a: "x", b: "p" }), true);
  });

  test("ช่องควบคุมถูกลบไปแล้ว = แสดงไว้ก่อน ดีกว่าซ่อนข้อมูลที่อาจจำเป็น", async () => {
    const orphan = f({ field_key: "o", show_if_key: "หายไปแล้ว", show_if_value: "x" });
    assert.equal(isFieldVisible(orphan, [orphan], {}), true);
  });

  test("visibleFields คัดเหลือเฉพาะช่องที่ต้องแสดง", async () => {
    const got = visibleFields(fields, { kind: "ปกติ" }).map((x) => x.field_key);
    assert.deepEqual(got, ["kind"]);
  });
});

describe("ช่องที่เลือกมาเป็นเงื่อนไขได้", () => {
  const a = f({ field_key: "a", type: "SELECT", options: ["x"], sort_order: 1 });
  const b = f({ field_key: "b", type: "TEXT", sort_order: 2 });
  const c = f({ field_key: "c", type: "SELECT", options: ["y"], sort_order: 3 });
  const target = f({ field_key: "t", sort_order: 2.5 });

  test("เอาเฉพาะช่องตัวเลือกที่อยู่ก่อนหน้า — อ้างย้อนหลังอย่างเดียวจึงวนเป็นวงกลมไม่ได้", async () => {
    assert.deepEqual(conditionSources([a, b, c, target], target).map((x) => x.field_key), ["a"]);
  });

  test("ช่องตัวเลือกที่ยังไม่มีตัวเลือกให้เลือก ใช้เป็นเงื่อนไขไม่ได้", async () => {
    const empty = f({ field_key: "e", type: "SELECT", options: [], sort_order: 1 });
    assert.deepEqual(conditionSources([empty, target], target), []);
  });
});

/* ---------- ดรอปดาวน์เป็นช่องเงื่อนไขได้เหมือนช่องตัวเลือก ---------- */
describe("ช่องดรอปดาวน์ตั้งเป็นเงื่อนไขได้", () => {
  const mk = (over) => ({
    id: 1, field_key: "k", label: "ช่อง", type: "TEXT", field_role: "", required: 0,
    active: 1, options: [], columns: [], help: "", placeholder: "", sum_of: "",
    show_if_key: "", show_if_value: "", sort_order: 1, ...over,
  });

  /** ดรอปดาวน์กับปุ่มกลมต่างกันแค่หน้าตา ค่าที่เก็บเหมือนกันทุกอย่าง */
  test("ดรอปดาวน์อยู่ในรายการช่องที่ตั้งเงื่อนไขได้", async () => {
    const src = mk({ id: 1, field_key: "kind", type: "DROPDOWN", options: ["A", "B"], sort_order: 1 });
    const target = mk({ id: 2, field_key: "why", type: "TEXT", sort_order: 2 });
    const got = conditionSources([src, target], target);
    assert.deepEqual(got.map((f) => f.field_key), ["kind"]);
  });

  test("ช่องที่ผูกกับดรอปดาวน์แสดง/ซ่อนตามค่าที่เลือก", async () => {
    const src = mk({ id: 1, field_key: "kind", type: "DROPDOWN", options: ["A", "B"], sort_order: 1 });
    const dep = mk({ id: 2, field_key: "why", sort_order: 2, show_if_key: "kind", show_if_value: "B" });
    assert.equal(isFieldVisible(dep, [src, dep], { kind: "B" }), true);
    assert.equal(isFieldVisible(dep, [src, dep], { kind: "A" }), false);
  });
});
