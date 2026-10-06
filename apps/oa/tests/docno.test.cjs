const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { db } = require("../.test-build/lib/db.js");
const { docPrefixOf, nextDocNo } = require("../.test-build/lib/queries.js");

/** วันที่คงที่ เพื่อไม่ให้เทสต์เปลี่ยนผลตามเดือนที่รัน */
const AUG = new Date(2026, 7, 26);
const SEP = new Date(2026, 8, 2);

/** ใส่เลขที่เอกสารลงตารางตรงๆ — จำลองว่ามีเอกสารเลขนี้อยู่แล้ว */
async function seedDocNo(templateId, requesterId, docNo) {
  ((await db.prepare(
    `INSERT INTO requests (doc_no, template_id, requester_id, title, status, stage, current_step)
     VALUES (?,?,?,'x','DRAFT','FINAL',0)`,
  ).run(docNo, templateId, requesterId)));
}

describe("เลขที่เอกสาร (ใช้อ้างอิงตอนเคลียร์ OA)", () => {
  let tpl, user;

  // await wipe() ไม่ล้างตารางแม่แบบ และ code เป็น UNIQUE — ทุกใบที่สร้างจึงต้องใช้ code ไม่ซ้ำ
  // ตั้งให้ 4 ตัวแรกคงที่ ตัวย่อที่ระบบย่อให้จึงยังเดาได้แน่นอน
  let n = 0;
  const uniqCode = (head) => `${head}_T${n++}`;

  beforeEach(async () => {
    await h.wipe();
    user = await h.makeUser({ name: "ผู้ยื่น" });
    tpl = await h.makeTemplate();
    (await db.prepare("UPDATE form_templates SET code=?, doc_prefix='' WHERE id=?")
      .run(uniqCode("MARK"), tpl));
  });

  const template = async () => ((await db.prepare("SELECT * FROM form_templates WHERE id=?").get(tpl)));

  test("ย่อจาก code ให้เองเมื่อไม่ได้ตั้งตัวย่อ", async () => {
    assert.equal(docPrefixOf({ code: "MARKETING", doc_prefix: "" }), "MARK");
    assert.equal(docPrefixOf({ code: "CREDIT_NOTE", doc_prefix: "" }), "CRED");
    assert.equal(docPrefixOf({ code: "MEMORANDUM-1", doc_prefix: "" }), "MEMO");
  });

  test("ตัวย่อที่ตั้งเองชนะค่าที่ย่อจาก code", async () => {
    assert.equal(docPrefixOf({ code: "MARKETING", doc_prefix: "MKT" }), "MKT");
  });

  test("code ที่ไม่มีตัวอักษรอังกฤษเลยต้องไม่ทำให้เลขพัง", async () => {
    assert.equal(docPrefixOf({ code: "ฟอร์ม-๑", doc_prefix: "" }), "DOC");
  });

  test("ใบแรกของเดือนได้ลำดับ 0001", async () => {
    assert.equal(await nextDocNo(await template(), AUG), "AP-MARK-202608-0001");
  });

  test("ลำดับเดินต่อจากใบล่าสุดของฟอร์มนั้นในเดือนนั้น", async () => {
    await seedDocNo(tpl, user.id, "AP-MARK-202608-0001");
    await seedDocNo(tpl, user.id, "AP-MARK-202608-0002");
    assert.equal(await nextDocNo(await template(), AUG), "AP-MARK-202608-0003");
  });

  test("ขึ้นเดือนใหม่แล้วเริ่มนับหนึ่งใหม่", async () => {
    await seedDocNo(tpl, user.id, "AP-MARK-202608-0009");
    assert.equal(await nextDocNo(await template(), SEP), "AP-MARK-202609-0001");
  });

  test("คนละฟอร์มเดินเลขแยกกัน ไม่กินลำดับของกันและกัน", async () => {
    await seedDocNo(tpl, user.id, "AP-MARK-202608-0001");
    await seedDocNo(tpl, user.id, "AP-MARK-202608-0002");
    const other = await h.makeTemplate();
    (await db.prepare("UPDATE form_templates SET code=?, doc_prefix='' WHERE id=?")
      .run(uniqCode("PURC"), other));
    const otherTpl = ((await db.prepare("SELECT * FROM form_templates WHERE id=?").get(other)));
    assert.equal(await nextDocNo(otherTpl, AUG), "AP-PURC-202608-0001");
    assert.equal(await nextDocNo(await template(), AUG), "AP-MARK-202608-0003");
  });

  test("เอกสารเลขรูปแบบเดิมไม่ถูกนับรวม — ของเก่าอยู่ของมันไป", async () => {
    await seedDocNo(tpl, user.id, "202608260001");
    await seedDocNo(tpl, user.id, "202608260002");
    assert.equal(await nextDocNo(await template(), AUG), "AP-MARK-202608-0001");
  });

  test("ลำดับเกิน 4 หลักยังเดินต่อถูก ไม่วนกลับ", async () => {
    await seedDocNo(tpl, user.id, "AP-MARK-202608-9999");
    assert.equal(await nextDocNo(await template(), AUG), "AP-MARK-202608-10000");
  });

  test("ตัวย่อที่ตั้งเองมีผลกับเลขที่ออกจริง", async () => {
    ((await db.prepare("UPDATE form_templates SET doc_prefix='MKT' WHERE id=?").run(tpl)));
    assert.equal(await nextDocNo(await template(), AUG), "AP-MKT-202608-0001");
  });
});
