const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { mentionsIn, mentionsToNotify } = require("../.test-build/lib/mention.js");

let n = 0;
const field = (over) => ({
  id: ++n, field_key: `k${n}`, label: `ช่อง ${n}`, type: "USER", field_role: "",
  required: 0, active: 1, options: [], columns: [], help: "",
  show_if_key: "", show_if_value: "", sort_order: n, ...over,
});

describe("คนที่ถูกระบุชื่อไว้ในฟอร์ม", () => {
  test("เก็บเฉพาะช่องชนิดเลือกบุคคล", async () => {
    n = 0;
    const got = mentionsIn(
      [
        field({ field_key: "attn", label: "เรียนแจ้ง (ATTENTION)" }),
        field({ field_key: "note", label: "หมายเหตุ", type: "TEXT" }),
      ],
      { attn: 7, note: 9 },
    );
    assert.deepEqual(got, [{ userId: 7, fieldLabel: "เรียนแจ้ง (ATTENTION)" }]);
  });

  test("ติดชื่อช่องมาด้วย เพื่อบอกได้ว่าถูกระบุไว้ในฐานะอะไร", async () => {
    n = 0;
    const got = mentionsIn([field({ field_key: "cc", label: "สำเนาเรียน (CC)" })], { cc: 4 });
    assert.equal(got[0].fieldLabel, "สำเนาเรียน (CC)");
  });

  /** ปลายทางคือแจ้งเตือนหนึ่งครั้ง ไม่ใช่แจ้งตามจำนวนช่องที่มีชื่อเขาอยู่ */
  test("คนเดียวถูกระบุหลายช่อง = แจ้งครั้งเดียว", async () => {
    n = 0;
    const got = mentionsIn(
      [field({ field_key: "a" }), field({ field_key: "b" })],
      { a: 5, b: 5 },
    );
    assert.equal(got.length, 1);
  });

  test("ช่องว่างหรือค่าเพี้ยน = ไม่นับ", async () => {
    n = 0;
    const got = mentionsIn(
      [field({ field_key: "a" }), field({ field_key: "b" }), field({ field_key: "c" })],
      { a: "", b: 0, c: "ไม่ใช่ตัวเลข" },
    );
    assert.deepEqual(got, []);
  });

  test("ช่องที่ปิดใช้ไม่นับ", async () => {
    n = 0;
    assert.deepEqual(mentionsIn([field({ field_key: "a", active: 0 })], { a: 3 }), []);
  });
});

describe("ตัดคนที่ได้รับแจ้งจากทางอื่นอยู่แล้ว", () => {
  const list = [
    { userId: 1, fieldLabel: "ก" },
    { userId: 2, fieldLabel: "ข" },
    { userId: 3, fieldLabel: "ค" },
  ];

  /** ส่งซ้ำหลายใบต่อเอกสารเดียว ทำให้คนเริ่มมองข้ามการแจ้งเตือนทั้งหมด */
  test("ผู้จัดทำไม่ต้องแจ้ง — รู้อยู่แล้วว่าตัวเองกรอกอะไร", async () => {
    assert.deepEqual(mentionsToNotify(list, 1, []).map((m) => m.userId), [2, 3]);
  });

  test("คนที่อยู่ในสายอนุมัติไม่ต้องแจ้งซ้ำ — เขาได้การ์ดของตัวเองอยู่แล้ว", async () => {
    assert.deepEqual(mentionsToNotify(list, 9, [2]).map((m) => m.userId), [1, 3]);
  });

  test("ไม่มีใครให้ตัดออก = แจ้งครบทุกคน", async () => {
    assert.equal(mentionsToNotify(list, 9, []).length, 3);
  });
});

/* ---------- ระดับฐานข้อมูล: คิวแจ้งเตือนรับชนิดใหม่นี้จริงไหม ---------- */
const h = require("./helpers.cjs");
const { enqueue } = require("../.test-build/lib/lark/notify.js");
const { db } = require("../.test-build/lib/db.js");

describe("คิวแจ้งเตือนของคนที่ถูกระบุชื่อ", () => {
  test("เข้าคิวได้พร้อมชื่อช่องที่ระบุไว้", async () => {
    await h.wipe();
    const who = await h.makeUser({ name: "คนที่ถูกระบุ" });
    const tpl = await h.makeTemplate();
    const req = await h.makeRequest({ templateId: tpl, requesterId: (await h.makeUser({})).id });

    await enqueue(req, who.id, "MENTION", { fieldLabel: "เรียนแจ้ง (ATTENTION)" });

    const rows = (await db
      .prepare("SELECT kind, payload FROM notifications WHERE request_id=? AND user_id=?")
      .all(req, who.id));
    assert.ok(rows.length >= 1, "ต้องมีแถวในคิว");
    assert.equal(rows[0].kind, "MENTION");
    assert.equal(JSON.parse(rows[0].payload).fieldLabel, "เรียนแจ้ง (ATTENTION)");
  });
});
