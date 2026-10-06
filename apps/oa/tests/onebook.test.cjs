const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { requestPayload } = require("../.test-build/lib/integration.js");
const {
  recordExternalStatus,
  listExternalStatus,
  latestExternalStatus,
} = require("../.test-build/lib/external-status.js");

/**
 * การเชื่อมต่อกับ OneBook (ระบบบัญชี)
 *
 * สองเรื่องที่เทสต์ตรงนี้คือสิ่งที่ทำให้การเชื่อมมีความหมายจริง:
 *   1. ไฟล์แนบต้องติดไปกับข้อมูลที่ส่ง — บัญชีต้องใช้ใบเสนอราคา/ใบเสร็จทำเอกสารต่อ
 *   2. สถานะที่บัญชียิงกลับต้องรับซ้ำได้ — ระบบที่ยิง webhook จะลองซ้ำเสมอเมื่อไม่แน่ใจ
 */
describe("ข้อมูลที่ส่งให้ OneBook", () => {
  let user, req;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    user = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: user.id, status: "APPROVED" });
  });

  test("ไฟล์แนบติดไปด้วย พร้อมอีเมลคนอัปโหลดและลิงก์ดาวน์โหลด", async () => {
    const att = await h.db
      .prepare(
        `INSERT INTO attachments (request_id, field_key, filename, stored_name, mime, size, uploaded_by)
         VALUES (?,?,?,?,?,?,?) RETURNING id`,
      )
      .get(req, "q_quote", "ใบเสนอราคา.pdf", "s-quote.pdf", "application/pdf", 12345, user.id);

    const p = await requestPayload(req);
    assert.ok(Array.isArray(p.attachments), "payload ต้องมีคีย์ attachments");
    assert.equal(p.attachments.length, 1);
    assert.deepEqual(p.attachments[0], {
      id: att.id,
      filename: "ใบเสนอราคา.pdf",
      mime: "application/pdf",
      size: 12345,
      field_key: "q_quote",
      uploaded_by: user.email,
      created_at: p.attachments[0].created_at,
      url: `/api/v1/files/${att.id}`,
    });
  });

  test("ใบที่ไม่มีไฟล์ ต้องได้อาร์เรย์ว่าง ไม่ใช่คีย์หาย", async () => {
    const tpl = await h.makeTemplate();
    const other = await h.makeRequest({ templateId: tpl, requesterId: user.id });
    const p = await requestPayload(other);
    assert.deepEqual(p.attachments, []);
  });
});

describe("สถานะที่บัญชียิงกลับ", () => {
  let user, req;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    user = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: user.id, status: "APPROVED" });
  });

  const send = (over = {}) =>
    recordExternalStatus({
      requestId: req,
      source: "OneBook",
      state: "RECORDED",
      externalRef: "OB-PV-2026-00871",
      occurredAt: "2026-09-20T08:00:00.000Z",
      ...over,
    });

  test("บันทึกสถานะแรกได้", async () => {
    const r = await send();
    assert.ok(r.ok, r.error);
    assert.equal(r.created, true);
    assert.equal(r.status.state, "RECORDED");
    assert.equal(r.status.external_ref, "OB-PV-2026-00871");
    assert.equal(r.status.source, "OneBook");
  });

  test("ยิงซ้ำด้วยสถานะและเลขอ้างอิงเดิม ต้องไม่เกิดแถวซ้ำ", async () => {
    const again = await send();
    assert.ok(again.ok);
    assert.equal(again.created, false, "ต้องบอกว่าไม่ได้สร้างใหม่");
    assert.equal((await listExternalStatus(req)).length, 1);
  });

  test("สถานะถัดไปเป็นคนละแถว เก็บเป็นประวัติ", async () => {
    await send({ state: "PAID", occurredAt: "2026-09-25T02:00:00.000Z", amount: 45000 });
    const rows = await listExternalStatus(req);
    assert.deepEqual(rows.map((r) => r.state), ["RECORDED", "PAID"]);
    assert.equal(rows[1].amount, 45000);
    assert.equal((await latestExternalStatus(req)).state, "PAID");
  });

  test("จ่ายเงินแล้วต้องแจ้งผู้ยื่นเรื่อง", async () => {
    const n = await h.db
      .prepare("SELECT kind, user_id FROM notifications WHERE request_id=? AND kind='ACCOUNTING'")
      .all(req);
    assert.equal(n.length, 1, "ต้องมีแจ้งเตือนหนึ่งรายการ");
    assert.equal(n[0].user_id, user.id, "ต้องแจ้งคนยื่นเรื่อง");
  });

  test("ตีกลับโดยไม่บอกเหตุผล ต้องถูกปฏิเสธ", async () => {
    const r = await send({ state: "REJECTED", externalRef: "OB-X-1", note: "  " });
    assert.equal(r.ok, false);
    assert.match(r.error, /note/);
  });

  test("ตีกลับพร้อมเหตุผล บันทึกได้และแจ้งผู้ยื่น", async () => {
    const r = await send({ state: "REJECTED", externalRef: "OB-X-2", note: "ใบเสร็จไม่ครบ" });
    assert.ok(r.ok, r.error);
    assert.equal(r.status.note, "ใบเสร็จไม่ครบ");

    const n = await h.db
      .prepare("SELECT count(*) AS n FROM notifications WHERE request_id=? AND kind='ACCOUNTING'")
      .get(req);
    assert.equal(Number(n.n), 2);
  });

  test("สถานะที่ไม่รู้จัก ต้องถูกปฏิเสธ", async () => {
    const r = await recordExternalStatus({
      requestId: req, source: "OneBook", state: "SOMETHING_ELSE",
    });
    assert.equal(r.ok, false);
  });

  test("คำขอที่ไม่มีอยู่ ต้องถูกปฏิเสธ", async () => {
    const r = await recordExternalStatus({ requestId: 999999, source: "OneBook", state: "PAID" });
    assert.equal(r.ok, false);
    assert.match(r.error, /ไม่พบคำขอ/);
  });

  test("ไม่ส่ง occurred_at มา ต้องใช้เวลาปัจจุบัน ไม่ใช่ค่าว่าง", async () => {
    const r = await send({ state: "RECEIVED", externalRef: "OB-R-1", occurredAt: undefined });
    assert.ok(r.ok, r.error);
    assert.ok(Number.isFinite(Date.parse(r.status.occurred_at)), r.status.occurred_at);
  });
});
