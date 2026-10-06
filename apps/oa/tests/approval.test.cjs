const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { applyDecision, advanceFrom } = require("../.test-build/lib/approval.js");
const { saveDelegation } = require("../.test-build/lib/delegation.js");

/**
 * เครื่องเดินเอกสาร — ส่วนที่พังแล้วเจ็บที่สุด
 * ทุกเคสที่เคยเป็นบั๊กจริงควรมีเทสต์คุมไว้ที่นี่
 */
describe("การเดินเอกสาร", () => {
  let dept, requester, a1, a2, tpl;

  beforeEach(async () => {
    await h.wipe();
    dept = await h.makeDept();
    requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    a1 = await h.makeUser({ name: "ผู้อนุมัติ 1", deptId: dept });
    a2 = await h.makeUser({ name: "ผู้อนุมัติ 2", deptId: dept });
    tpl = await h.makeTemplate();
  });

  test("อนุมัติครบทุกขั้นแล้วเอกสารต้องเป็น APPROVED", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.addApprover({ requestId: req, step: 2, userId: a2.id });

    const r1 = await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });
    assert.equal(r1.ok, true);
    assert.equal(r1.stageDone, false, "ยังมีขั้นถัดไป ยังไม่ควรจบ");
    assert.equal(((await h.db.prepare("SELECT current_step FROM requests WHERE id=?").get(req))).current_step, 2);

    const r2 = await applyDecision({ user: a2, requestId: req, decision: "APPROVE" });
    assert.equal(r2.ok, true);
    assert.equal(r2.stageDone, true);
    assert.equal(((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status, "APPROVED");
  });

  test("ขั้นถัดไปยังไม่ถึงคิว กดอนุมัติไม่ได้", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.addApprover({ requestId: req, step: 2, userId: a2.id });

    const r = await applyDecision({ user: a2, requestId: req, decision: "APPROVE" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_YOUR_TURN");
  });

  test("ปฏิเสธแล้วขั้นที่เหลือต้องถูกข้าม และเอกสารปิดทันที", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.addApprover({ requestId: req, step: 2, userId: a2.id });

    const r = await applyDecision({ user: a1, requestId: req, decision: "REJECT", comment: "ข้อมูลไม่ครบ" });
    assert.equal(r.ok, true);
    assert.equal(((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status, "REJECTED");

    const left = (await h.db
      .prepare("SELECT status FROM request_approvers WHERE request_id=? AND step_no=2")
      .get(req));
    assert.equal(left.status, "SKIPPED", "ขั้นที่ยังไม่ถึงต้องถูกข้าม ไม่ค้างเป็น PENDING");
  });

  test("ปฏิเสธต้องบังคับให้ใส่เหตุผล", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });

    const r = await applyDecision({ user: a1, requestId: req, decision: "REJECT", comment: "   " });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NEED_COMMENT");
  });

  test("ขั้นแบบ ANY — คนหนึ่งกดแล้วคนที่เหลือต้องไม่ต้องกดอีก", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id, mode: "ANY" });
    await h.addApprover({ requestId: req, step: 1, userId: a2.id, mode: "ANY" });

    await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });

    const other = (await h.db
      .prepare("SELECT status FROM request_approvers WHERE request_id=? AND user_id=?")
      .get(req, a2.id));
    assert.equal(other.status, "SKIPPED");
    assert.equal(((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status, "APPROVED");
  });

  test("ขั้นแบบ ALL — ต้องครบทุกคนถึงจะเดินต่อ", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id, mode: "ALL" });
    await h.addApprover({ requestId: req, step: 1, userId: a2.id, mode: "ALL" });

    await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });
    assert.equal(
      ((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status,
      "PENDING",
      "ยังเหลืออีกคน ยังไม่ควรจบ",
    );

    await applyDecision({ user: a2, requestId: req, decision: "APPROVE" });
    assert.equal(((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status, "APPROVED");
  });

  test("กดซ้ำครั้งที่สองต้องไม่มีผล", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });

    assert.equal((await applyDecision({ user: a1, requestId: req, decision: "APPROVE" })).ok, true);
    const again = await applyDecision({ user: a1, requestId: req, decision: "REJECT", comment: "เปลี่ยนใจ" });
    assert.equal(again.ok, false);
    assert.equal(again.reason, "NOT_PENDING");
    assert.equal(((await h.db.prepare("SELECT status FROM requests WHERE id=?").get(req))).status, "APPROVED");
  });

  test("ขั้นสำเนาถึงต้องไม่บล็อกเอกสาร", async () => {
    const cc = await h.makeUser({ name: "ผู้รับสำเนา", deptId: dept });
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.addApprover({ requestId: req, step: 2, userId: cc.id, kind: "CC" });
    await h.addApprover({ requestId: req, step: 3, userId: a2.id });

    await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });
    assert.equal(
      ((await h.db.prepare("SELECT current_step FROM requests WHERE id=?").get(req))).current_step,
      3,
      "ต้องข้ามขั้นสำเนาไปที่ขั้นอนุมัติถัดไปเลย",
    );
  });

  test("ประทับเวลาที่งานตกถึงมือ ต้องเกิดตอนขั้นนั้นถึงคิว ไม่ใช่ตอนยื่น", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    const row2 = await h.addApprover({ requestId: req, step: 2, userId: a2.id, notifiedAt: null });

    assert.equal(((await h.db.prepare("SELECT notified_at FROM request_approvers WHERE id=?").get(row2))).notified_at, null);
    await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });
    assert.notEqual(
      ((await h.db.prepare("SELECT notified_at FROM request_approvers WHERE id=?").get(row2))).notified_at,
      null,
      "พออนุมัติขั้นแรก ขั้นสองต้องถูกประทับเวลา",
    );
  });

  test("advanceFrom ต้องข้ามขั้นที่ไม่มีผู้รับผิดชอบ", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    // ขั้น 2 ไม่มีแถวเลย (เงื่อนไขไม่เข้า) — ต้องเดินไปขั้น 3
    await h.addApprover({ requestId: req, step: 3, userId: a2.id });

    const next = await advanceFrom(req, "FINAL", 2);
    assert.equal(next, 3);
  });
});

describe("อนุมัติแทนช่วงลา", () => {
  let dept, requester, owner, cover, other, tpl;
  const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    await h.wipe();
    dept = await h.makeDept();
    requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    owner = await h.makeUser({ name: "เจ้าของคิว", deptId: dept });
    cover = await h.makeUser({ name: "คนรับแทน", deptId: dept });
    other = await h.makeUser({ name: "คนนอก", deptId: dept });
    tpl = await h.makeTemplate();
  });

  test("คนรับแทนกดอนุมัติได้ และบันทึกว่าใครกดจริง", async () => {
    await saveDelegation({
      fromUser: owner.id, toUser: cover.id,
      fromDate: day(-1), toDate: day(1), reason: "ลา", createdBy: owner.id,
    });
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: owner.id });

    const r = await applyDecision({ user: cover, requestId: req, decision: "APPROVE", comment: "" });
    assert.equal(r.ok, true);

    const row = ((await h.db.prepare("SELECT user_id, acted_by, status FROM request_approvers WHERE request_id=?").get(req)));
    assert.equal(row.user_id, owner.id, "เจ้าของคิวต้องไม่เปลี่ยน");
    assert.equal(row.acted_by, cover.id, "ต้องบันทึกว่าคนแทนเป็นคนกด");
    assert.equal(row.status, "APPROVED");
  });

  test("คนที่ไม่ได้รับมอบหมายกดแทนไม่ได้", async () => {
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: owner.id });

    const r = await applyDecision({ user: other, requestId: req, decision: "APPROVE" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_YOUR_TURN");
  });

  test("นอกช่วงวันที่มอบหมาย กดแทนไม่ได้", async () => {
    await saveDelegation({
      fromUser: owner.id, toUser: cover.id,
      fromDate: day(5), toDate: day(9), reason: "ลาเดือนหน้า", createdBy: owner.id,
    });
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: owner.id });

    assert.equal((await applyDecision({ user: cover, requestId: req, decision: "APPROVE" })).reason, "NOT_YOUR_TURN");
  });

  test("ใช้สิทธิ์แทนมาอนุมัติเอกสารของตัวเองไม่ได้", async () => {
    await saveDelegation({
      fromUser: owner.id, toUser: cover.id,
      fromDate: day(-1), toDate: day(1), reason: "ลา", createdBy: owner.id,
    });
    // คนรับแทนเป็นผู้ยื่นเอง
    const req = await h.makeRequest({ templateId: tpl, requesterId: cover.id });
    await h.addApprover({ requestId: req, step: 1, userId: owner.id });

    const r = await applyDecision({ user: cover, requestId: req, decision: "APPROVE" });
    assert.equal(r.ok, false, "ต้องกันไม่ให้อนุมัติเรื่องของตัวเองผ่านสิทธิ์แทน");
  });

  test("สิทธิ์ไม่ต่อทอด (ก→ข, ข→ค แล้ว ค ต้องกดแทน ก ไม่ได้)", async () => {
    await saveDelegation({ fromUser: owner.id, toUser: cover.id, fromDate: day(-1), toDate: day(1), reason: "", createdBy: owner.id });
    await saveDelegation({ fromUser: cover.id, toUser: other.id, fromDate: day(-1), toDate: day(1), reason: "", createdBy: cover.id });

    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
    await h.addApprover({ requestId: req, step: 1, userId: owner.id });

    assert.equal((await applyDecision({ user: other, requestId: req, decision: "APPROVE" })).reason, "NOT_YOUR_TURN");
  });

  test("กันตั้งมอบหมายที่ผิดกติกา", async () => {
    assert.match(
      (await saveDelegation({ fromUser: owner.id, toUser: owner.id, fromDate: day(0), toDate: day(1), reason: "", createdBy: owner.id })).error ?? "",
      /ตัวเอง/,
    );
    assert.match(
      (await saveDelegation({ fromUser: owner.id, toUser: cover.id, fromDate: day(5), toDate: day(1), reason: "", createdBy: owner.id })).error ?? "",
      /วันสิ้นสุด/,
    );

    await saveDelegation({ fromUser: owner.id, toUser: cover.id, fromDate: day(0), toDate: day(3), reason: "", createdBy: owner.id });
    assert.match(
      (await saveDelegation({ fromUser: owner.id, toUser: other.id, fromDate: day(1), toDate: day(2), reason: "", createdBy: owner.id })).error ?? "",
      /ทับกัน/,
    );
  });
});
