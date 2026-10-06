const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  ROW_ID,
  cellFileName,
  cellKey,
  parseCellKey,
  parseForm,
  tableTotals,
  totalOf,
} = require("../.test-build/lib/form.js");

const col = (over) => ({
  col_key: "amount", label: "จำนวนเงิน", type: "MONEY",
  required: 0, options: [], unit: "", sort_order: 1, ...over,
});

const field = (over) => ({
  field_key: "items", label: "รายการ", type: "TABLE", field_role: "",
  required: 0, active: 1, options: [], columns: [], help: "", placeholder: "",
  sum_of: "", show_if_key: "", show_if_value: "", sort_order: 1, ...over,
});

const fd = (pairs) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(pairs)) f.append(k, v);
  return f;
};

const rowsOf = (r) => r.values.items;

/* ---------------- รหัสประจำแถว ---------------- */

/**
 * ไฟล์แนบในเซลล์ผูกกับรหัสแถว ไม่ใช่ลำดับที่ — ถ้าผูกกับลำดับ ลบแถวที่ 1 ทิ้ง
 * ใบเสนอราคาของแถวที่ 2 จะกลายเป็นของแถวที่ 1 ทันทีโดยไม่มีใครรู้
 */
describe("รหัสประจำแถวของตาราง", () => {
  const fields = [field({ columns: [col({ col_key: "name", type: "TEXT" })] })];

  test("รหัสที่หน้าเว็บสร้างไว้ถูกเก็บต่อ ไม่ถูกทิ้งตอนอ่านค่า", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ [ROW_ID]: "rabc12", name: "ค่าเดินทาง" }]),
    }));
    assert.equal(rowsOf(r)[0][ROW_ID], "rabc12");
  });

  test("แถวเก่าที่ยังไม่มีรหัส ได้รหัสตามลำดับที่ไปก่อน", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ name: "ก" }, { name: "ข" }]),
    }));
    assert.deepEqual(rowsOf(r).map((x) => x[ROW_ID]), ["r0", "r1"]);
  });
});

describe("คีย์ของไฟล์ในเซลล์", () => {
  test("ประกอบแล้วแยกกลับได้ครบสามส่วน", async () => {
    const key = cellKey("items", "rabc12", "invoice");
    assert.deepEqual(parseCellKey(key), {
      fieldKey: "items", rowId: "rabc12", colKey: "invoice",
    });
  });

  test("ชื่อ input นำหน้าด้วย tf~ ให้ฝั่งเซิร์ฟเวอร์กวาดเก็บได้", async () => {
    assert.equal(cellFileName("items", "r1", "invoice"), "tf~items~r1~invoice");
  });

  /** field_key ของไฟล์แนบธรรมดาต้องไม่ถูกเข้าใจผิดว่าเป็นไฟล์ในเซลล์ */
  test("คีย์ธรรมดาไม่ใช่ไฟล์ในเซลล์", async () => {
    assert.equal(parseCellKey("attachments"), null);
    assert.equal(parseCellKey("items~r1"), null);
    assert.equal(parseCellKey("items~~invoice"), null);
  });
});

/* ---------------- ชนิดคอลัมน์ใหม่ ---------------- */

describe("คอลัมน์เลือกได้หลายค่า", () => {
  const fields = [field({
    columns: [col({ col_key: "tax", label: "อัตราภาษี", type: "MULTISELECT", options: ["3%", "5%"] })],
  })];

  test("เก็บเป็นรายการ ไม่ใช่ข้อความก้อนเดียว", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ tax: ["3%", "5%"] }]),
    }));
    assert.deepEqual(rowsOf(r)[0].tax, ["3%", "5%"]);
  });

  test("ค่าว่างในรายการถูกตัดทิ้ง", async () => {
    const r = parseForm(fields, fd({ f_items: JSON.stringify([{ tax: ["3%", "", " "] }]) }));
    assert.deepEqual(rowsOf(r)[0].tax, ["3%"]);
  });
});

/**
 * ไฟล์อยู่คนละตาราง ไม่ได้อยู่ใน data — ถ้าบังคับให้เซลล์มีค่าเหมือนคอลัมน์อื่น
 * ฟอร์มจะส่งไม่ผ่านตลอดกาลทั้งที่แนบไฟล์ไปเรียบร้อยแล้ว
 */
describe("คอลัมน์ไฟล์แนบ", () => {
  const fields = [field({
    required: 1,
    columns: [col({ col_key: "invoice", label: "ใบเสนอราคา", type: "FILE", required: 1 })],
  })];

  test("ไม่เก็บค่าลงในเอกสาร", async () => {
    const r = parseForm(fields, fd({ f_items: JSON.stringify([{ invoice: "อะไรก็ตาม" }]) }));
    assert.equal(rowsOf(r)[0].invoice, "");
  });

  test("คอลัมน์ไฟล์ที่บังคับ ไม่ทำให้ส่งฟอร์มไม่ผ่าน", async () => {
    const r = parseForm(fields, fd({ f_items: JSON.stringify([{ invoice: "" }]) }));
    assert.equal(r.error, null);
  });
});

/* ---------------- ยอดรวมจากตาราง ---------------- */

describe("ยอดรวมที่คำนวณให้เอง", () => {
  const table = field({
    columns: [col({ col_key: "amount", type: "MONEY" })],
  });
  const total = field({
    field_key: "grand", label: "ยอดรวม", type: "TOTAL", sum_of: "items.amount", columns: [],
  });
  const fields = [table, total];

  test("บวกคอลัมน์ที่ชี้ไว้ทุกแถว", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ amount: "1000" }, { amount: "234.5" }]),
    }));
    assert.equal(r.values.grand, 1234.5);
  });

  /** บวกทศนิยมแบบ floating point ได้หางอย่าง 1234.5600000000002 ซึ่งแสดงเป็นเงินไม่ได้ */
  test("ปัดเหลือทศนิยมสองตำแหน่ง", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ amount: "0.1" }, { amount: "0.2" }]),
    }));
    assert.equal(r.values.grand, 0.3);
  });

  /**
   * ยอดนี้ผูกเป็นช่องวงเงินได้ ซึ่งเป็นตัวตัดสินว่าต้องผ่านใครบ้าง —
   * ถ้าเชื่อค่าที่ส่งมากับฟอร์ม ก็แก้ให้ต่ำกว่าเพดานเพื่อข้ามขั้นอนุมัติได้ทันที
   */
  test("ไม่เชื่อค่าที่ส่งมากับฟอร์ม คิดใหม่ที่เซิร์ฟเวอร์เสมอ", async () => {
    const r = parseForm(fields, fd({
      f_items: JSON.stringify([{ amount: "900000" }]),
      f_grand: "1",
    }));
    assert.equal(r.values.grand, 900000);
  });

  test("ชี้ไปยังคอลัมน์ที่ไม่มีอยู่ = 0 ไม่ใช่พัง", async () => {
    const orphan = field({ field_key: "g2", type: "TOTAL", sum_of: "nope.amount" });
    assert.equal(totalOf(orphan, [table, orphan], { items: [{ amount: 5 }] }), 0);
  });

  test("ยังไม่ได้เลือกว่าบวกจากไหน = 0", async () => {
    const blank = field({ field_key: "g3", type: "TOTAL", sum_of: "" });
    assert.equal(totalOf(blank, [table, blank], { items: [{ amount: 5 }] }), 0);
  });

  test("ยอดรวมเป็นช่องวงเงินของเอกสารได้", async () => {
    const amountRole = { ...total, field_role: "AMOUNT" };
    const r = parseForm([table, amountRole], fd({
      f_items: JSON.stringify([{ amount: "500" }, { amount: "500" }]),
    }));
    assert.equal(r.amount, 1000);
  });
});

describe("ผลรวมท้ายตาราง", () => {
  test("ติดหน่วยของคอลัมน์มาด้วย เพื่อบอกว่าเลขนี้เป็นหน่วยอะไร", async () => {
    const f = field({ columns: [col({ unit: "THB-Baht" })] });
    const [t] = tableTotals(f, [{ amount: 100 }, { amount: 50 }]);
    assert.equal(t.total, 150);
    assert.equal(t.unit, "THB-Baht");
  });
});
