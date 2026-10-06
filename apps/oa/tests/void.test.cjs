const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { voidApproved } = require("../.test-build/lib/void.js");

const statusOf = async (id) =>
  ((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(id))).status;

/**
 * ยกเลิกเอกสารที่อนุมัติแล้วเป็นการลบล้างสิ่งที่ผู้อนุมัติตัดสินใจไว้
 * กติกาการกันจึงสำคัญกว่าตัวการยกเลิกเอง — ถ้าหลุดไปใบเดียวคือข้อมูลที่คนอื่นถืออยู่
 * กลายเป็นเท็จโดยไม่มีอะไรบอก
 */
describe("ยกเลิกเอกสารที่อนุมัติแล้ว", () => {
  let admin, tpl;

  beforeEach(async () => {
    await h.wipe();
    admin = await h.makeUser({ name: "ผู้ดูแล", role: "ADMIN" });
    tpl = await h.makeTemplate();
  });

  const approved = async () =>
    await h.makeRequest({ templateId: tpl, requesterId: admin.id, status: "APPROVED", amount: 1000 });

  test("เอกสารที่อนุมัติแล้วยกเลิกได้ และกลายเป็นสถานะยกเลิก", async () => {
    const id = await approved();
    assert.deepEqual(await voidApproved(id, "ยื่นซ้ำ", admin), { ok: true });
    assert.equal(await statusOf(id), "CANCELLED");
  });

  test("บันทึกเหตุผลไว้ในประวัติ — ไม่งั้นยกเลิกแล้วไม่มีใครรู้ว่าทำไม", async () => {
    const id = await approved();
    await voidApproved(id, "ดีลล้มหลังอนุมัติ", admin);
    const row = (await h.db
      .prepare("SELECT action, detail FROM audit_log WHERE request_id=? ORDER BY id DESC")
      .get(id));
    assert.equal(row.action, "VOID_APPROVED");
    assert.equal(row.detail, "ดีลล้มหลังอนุมัติ");
  });

  test("ไม่กรอกเหตุผล = ยกเลิกไม่ได้ (เว้นวรรคล้วนก็ไม่นับ)", async () => {
    const id = await approved();
    assert.ok("error" in await voidApproved(id, "   ", admin));
    assert.equal(await statusOf(id), "APPROVED");
  });

  test("ใบที่ยังไม่อนุมัติใช้ทางนี้ไม่ได้ — มีปุ่มยกเลิกของเจ้าของอยู่แล้ว", async () => {
    const id = await h.makeRequest({ templateId: tpl, requesterId: admin.id, status: "PENDING" });
    assert.ok("error" in await voidApproved(id, "เหตุผล", admin));
    assert.equal(await statusOf(id), "PENDING");
  });

  test("ยกเลิกซ้ำไม่ได้", async () => {
    const id = await approved();
    await voidApproved(id, "รอบแรก", admin);
    assert.ok("error" in await voidApproved(id, "รอบสอง", admin));
  });

  test("ออกเลขที่เอกสารไปแล้วต้องยกเลิกไม่ได้ — เลขนั้นอยู่ในสมุดบัญชีแล้ว", async () => {
    const id = await approved();
    (await h.db
      .prepare(
        `INSERT INTO issued_documents (request_id, doc_type, doc_number, seq, period)
         VALUES (?, 'CN', ?, 1, '202609')`,
      )
      .run(id, `CN-${id}`));
    const res = await voidApproved(id, "เหตุผล", admin);
    assert.ok("error" in res && res.error.includes("เลขที่เอกสาร"));
    assert.equal(await statusOf(id), "APPROVED");
  });

  test("เลขที่ถูกยกเลิกไปแล้วไม่กัน", async () => {
    const id = await approved();
    (await h.db
      .prepare(
        `INSERT INTO issued_documents (request_id, doc_type, doc_number, seq, period, void)
         VALUES (?, 'CN', ?, 1, '202609', 1)`,
      )
      .run(id, `CN-void-${id}`));
    assert.deepEqual(await voidApproved(id, "เหตุผล", admin), { ok: true });
  });

  test("มีใบอื่นอ้างอิงอยู่ต้องยกเลิกไม่ได้ — ไม่งั้นใบลูกชี้ไปหาเงื่อนไขที่ถูกยกเลิกแล้ว", async () => {
    const master = await approved();
    const child = await h.makeRequest({ templateId: tpl, requesterId: admin.id, status: "APPROVED" });
    await linkChildTo(child, master);

    const res = await voidApproved(master, "เหตุผล", admin);
    assert.ok("error" in res && res.error.includes("อ้างอิงใบนี้"));
    assert.equal(await statusOf(master), "APPROVED");
  });

  test("ใบลูกที่ยกเลิกไปแล้วไม่นับ — ไม่มีผลอะไรต่อ", async () => {
    const master = await approved();
    const child = await h.makeRequest({ templateId: tpl, requesterId: admin.id, status: "CANCELLED" });
    await linkChildTo(child, master);

    assert.deepEqual(await voidApproved(master, "เหตุผล", admin), { ok: true });
  });
});

/** ผูกใบลูกให้อ้างถึงใบหลัก ผ่านฟิลด์ชนิด REQUEST เหมือนที่ฟอร์มจริงทำ */
async function linkChildTo(childId, masterId) {
  const tplId = ((await h.db.prepare("SELECT template_id FROM requests WHERE id=?").get(childId))).template_id;
  (await h.db
    .prepare(
      `INSERT INTO form_fields (template_id, field_key, label, type, active)
       VALUES (?, 'master_ref', 'อ้างอิง', 'REQUEST', 1)
       ON CONFLICT(template_id, field_key) DO NOTHING`,
    )
    .run(tplId));
  (await h.db
    .prepare("UPDATE requests SET data = ? WHERE id = ?")
    .run(JSON.stringify({ master_ref: masterId }), childId));
}
