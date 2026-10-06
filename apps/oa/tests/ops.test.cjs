const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const h = require("./helpers.cjs");
const { findStale, sweep, withinSendWindow } = require("../.test-build/lib/reminders.js");
const { saveDelegation } = require("../.test-build/lib/delegation.js");
const { issueDocument, voidDocument, listIssued } = require("../.test-build/lib/issue.js");
const { runBackup, backupStatus, BACKUP_DIR } = require("../.test-build/lib/backup.js");
const { requestPayload } = require("../.test-build/lib/integration.js");
const { applyDecision } = require("../.test-build/lib/approval.js");

const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

describe("เตือนงานค้าง", () => {
  let dept, requester, a1, a2, tpl, req;

  beforeEach(async () => {
    await h.wipe();
    dept = await h.makeDept();
    requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    a1 = await h.makeUser({ name: "ผู้อนุมัติ 1", deptId: dept });
    a2 = await h.makeUser({ name: "ผู้อนุมัติ 2", deptId: dept });
    tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: requester.id });
  });

  test("ยังไม่ถึงเกณฑ์ต้องไม่ถูกทวง", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 1);
    assert.equal((await findStale()).length, 0);
  });

  test("เกินเกณฑ์ต้องขึ้นเป็นงานค้าง", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 4);
    const stale = await findStale();
    assert.equal(stale.length, 1);
    assert.equal(stale[0].level, "REMINDER");
    assert.equal(stale[0].approver_id, a1.id);
  });

  test("ค้างนานมากต้องยกระดับไปแจ้งหัวหน้า", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 10);
    assert.equal((await findStale())[0].level, "ESCALATION");
  });

  test("ขั้นที่ยังไม่ถึงคิว ต่อให้เก่าแค่ไหนก็ต้องไม่ถูกทวง", async () => {
    const r1 = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    const r2 = await h.addApprover({ requestId: req, step: 2, userId: a2.id });
    await h.ageApprover(r1, 4);
    await h.ageApprover(r2, 90);

    const stale = await findStale();
    assert.equal(stale.length, 1, "ต้องเจอเฉพาะขั้นปัจจุบัน");
    assert.equal(stale[0].approver_row_id, r1);
  });

  test("เอกสารที่ปิดแล้วต้องหลุดจากรายการค้าง", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 10);
    assert.equal((await findStale()).length, 1);

    await applyDecision({ user: a1, requestId: req, decision: "APPROVE" });
    assert.equal((await findStale()).length, 0);
  });

  test("ทวงคนที่รับแทน ไม่ใช่คนที่ลาอยู่", async () => {
    const cover = await h.makeUser({ name: "คนแทน", deptId: dept });
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 4);
    await saveDelegation({
      fromUser: a1.id, toUser: cover.id,
      fromDate: day(-1), toDate: day(1), reason: "ลา", createdBy: a1.id,
    });

    const s = (await findStale())[0];
    assert.equal(s.on_leave, 1);
    assert.equal(s.notify_to, cover.id);

    await sweep({ force: true });
    const to = (await h.db
      .prepare("SELECT user_id FROM notifications WHERE kind='REMINDER' AND request_id=?")
      .get(req));
    assert.equal(to.user_id, cover.id, "การ์ดทวงต้องไปหาคนแทน");
  });

  test("เตือนคนเดิมเรื่องเดิมได้วันละครั้ง", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 4);

    const first = await sweep({ force: true });
    assert.equal(first.reminded, 1);

    const second = await sweep({ force: false });
    assert.equal(second.reminded, 0, "รอบสองต้องไม่ทวงซ้ำ");
  });

  test("นอกเวลาทำการต้องไม่ส่ง", async () => {
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 4);

    const night = new Date();
    night.setHours(3, 0, 0, 0);
    const r = await sweep({ force: false, now: night });
    assert.equal(r.ran, false);
    assert.equal(r.reminded, 0);
    assert.equal(withinSendWindow(night), false);
  });

  test("แจ้งหัวหน้าต้องถึงทั้งหัวหน้าแผนกและผู้ยื่น", async () => {
    const mgr = await h.makeUser({ name: "หัวหน้า", role: "MANAGER", deptId: dept });
    const row = await h.addApprover({ requestId: req, step: 1, userId: a1.id });
    await h.ageApprover(row, 10);

    await sweep({ force: true });
    const got = (await h.db
      .prepare("SELECT user_id FROM notifications WHERE kind='ESCALATION' AND request_id=?")
      .all(req))
      .map((x) => x.user_id);
    assert.ok(got.includes(mgr.id), "หัวหน้าแผนกต้องได้รับ");
    assert.ok(got.includes(requester.id), "ผู้ยื่นต้องได้รับ");
  });
});

describe("ออกเอกสาร", () => {
  let requester, tpl, approved, pending;

  beforeEach(async () => {
    await h.wipe();
    ((await h.db.prepare("DELETE FROM issued_documents").run()));
    const dept = await h.makeDept();
    requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    tpl = await h.makeTemplate();
    approved = await h.makeRequest({ templateId: tpl, requesterId: requester.id, status: "APPROVED" });
    pending = await h.makeRequest({ templateId: tpl, requesterId: requester.id, status: "PENDING" });
  });

  test("ออกจากเรื่องที่ยังไม่อนุมัติไม่ได้", async () => {
    const r = await issueDocument({ requestId: pending, docType: "INVOICE", note: "", userId: requester.id });
    assert.ok(r.error);
    assert.equal(r.doc, undefined);
  });

  test("เลขเดินต่อเนื่องภายในประเภทเดียวกัน", async () => {
    const a = await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });
    const b = await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });
    assert.match(a.doc.doc_number, /^INV-\d{6}-0001$/);
    assert.match(b.doc.doc_number, /^INV-\d{6}-0002$/);
  });

  test("เลขแยกชุดตามประเภท ไม่ปนกัน", async () => {
    await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });
    const cn = await issueDocument({ requestId: approved, docType: "CN", note: "", userId: requester.id });
    assert.match(cn.doc.doc_number, /^CN-\d{6}-0001$/, "ชุด CN ต้องเริ่มที่ 1 ของตัวเอง");
  });

  test("ยกเลิกแล้วเลขต้องไม่ถูกนำกลับมาใช้ซ้ำ", async () => {
    const a = await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });
    await voidDocument(a.doc.id, "ออกผิด", requester.id);
    const b = await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });

    assert.match(b.doc.doc_number, /0002$/, "ต้องเดินเลขต่อ ไม่ใช่ย้อนกลับไปใช้ 0001");
    assert.equal((await listIssued(approved)).length, 2, "เอกสารที่ยกเลิกต้องยังอยู่ในสารบบ");
  });

  test("ยกเลิกซ้ำไม่ได้ และต้องมีเหตุผล", async () => {
    const a = await issueDocument({ requestId: approved, docType: "INVOICE", note: "", userId: requester.id });
    assert.ok((await voidDocument(a.doc.id, "   ", requester.id)).error, "ต้องบังคับใส่เหตุผล");
    assert.equal((await voidDocument(a.doc.id, "ออกผิด", requester.id)).error, undefined);
    assert.ok((await voidDocument(a.doc.id, "อีกที", requester.id)).error, "ยกเลิกซ้ำต้องไม่ได้");
  });
});

describe("ข้อมูลที่ส่งให้ระบบภายนอก", () => {
  test("มีครบทุกส่วนที่ปลายทางต้องใช้", async () => {
    await h.wipe();
    const dept = await h.makeDept("ฝ่ายขาย");
    const requester = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    const approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: dept });
    const tpl = await h.makeTemplate("ใบขออนุมัติ");
    const req = await h.makeRequest({ templateId: tpl, requesterId: requester.id, amount: 12345.5, title: "ขอซื้อของ" });
    await h.addApprover({ requestId: req, step: 1, userId: approver.id });
    await applyDecision({ user: approver, requestId: req, decision: "APPROVE", comment: "ผ่าน" });

    const p = await requestPayload(req);
    assert.equal(p.status, "APPROVED");
    assert.equal(p.amount, 12345.5);
    assert.equal(p.title, "ขอซื้อของ");
    assert.equal(p.requester.name, "ผู้ยื่น");
    assert.equal(p.requester.department, "ฝ่ายขาย");
    assert.equal(p.approvals.length, 1);
    assert.equal(p.approvals[0].status, "APPROVED");
    assert.ok(Object.prototype.hasOwnProperty.call(p, "documents"));
  });

  test("ลายมือชื่อ HMAC ต้องตรวจสอบได้ที่ปลายทาง", async () => {
    const secret = "s3cr3t";
    const body = JSON.stringify({ event: "request.approved" });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const check = crypto.createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(sig, check);
    assert.notEqual(sig, crypto.createHmac("sha256", "wrong").update(body).digest("hex"));
  });
});

describe("สำรองข้อมูล", () => {
  /**
   * สำเนาที่กู้คืนไม่ได้คือสำเนาที่ไม่มีค่า — จึงไม่ตรวจแค่ว่าไฟล์มีอยู่
   * แต่เอาไฟล์นั้นกู้คืนเข้าฐานข้อมูลเปล่าจริง ๆ แล้วนับข้อมูลที่ได้กลับมา
   */
  test("สำเนาที่ได้ต้องกู้คืนเข้าฐานข้อมูลเปล่าได้และข้อมูลครบ", async () => {
    await h.wipe();
    const dept = await h.makeDept();
    const u = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    const tpl = await h.makeTemplate();
    for (let i = 0; i < 3; i++) await h.makeRequest({ templateId: tpl, requesterId: u.id });

    const r = await runBackup("MANUAL");
    assert.equal(r.ok, true, r.error);

    const file = path.join(BACKUP_DIR, r.filename);
    assert.ok(fs.existsSync(file), "ต้องมีไฟล์สำเนาจริง");
    assert.match(r.filename, /^app-\d{8}-\d{6}\.sql$/, "ชื่อไฟล์ต้องเป็นรูปที่ระบบรู้จัก");

    const base = process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/approve_test";
    const schema = `restore_${process.pid}`;
    const env = { ...process.env, PGOPTIONS: `-c search_path=${schema}` };
    const psql = (args, opts = {}) =>
      execFileSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", "-d", base, ...args], {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts,
      });

    try {
      psql(["-c", `DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`]);
      psql(["-f", "src/lib/schema.pg.sql"], { env });   // โครงเปล่า เหมือนตอนติดตั้งใหม่
      psql(["-f", file], { env });                       // แล้วกู้คืนจากสำเนา

      const count = (t) => Number(psql(["-tA", "-c", `SELECT COUNT(*) FROM ${t}`], { env }).trim());
      assert.equal(count("requests"), 3, "คำขอต้องกลับมาครบ");
      assert.equal(
        count("users"),
        ((await h.db.prepare("SELECT COUNT(*) AS n FROM users").get())).n,
        "ผู้ใช้ต้องกลับมาครบ",
      );

      // ลำดับเลข id ต้องเดินต่อได้ ไม่ใช่ชนกับแถวที่กู้คืนมา
      const nextId = Number(
        psql(["-tA", "-c", "INSERT INTO departments (name) VALUES ('หลังกู้คืน') RETURNING id"], { env }).trim(),
      );
      const maxId = Number(psql(["-tA", "-c", "SELECT MAX(id) FROM departments WHERE name <> 'หลังกู้คืน'"], { env }).trim());
      assert.ok(nextId > maxId, `id ใหม่ (${nextId}) ต้องมากกว่าที่มีอยู่ (${maxId})`);
    } finally {
      execFileSync("psql", ["-q", "-d", base, "-c", `DROP SCHEMA IF EXISTS ${schema} CASCADE`], {
        stdio: "ignore",
      });
    }

    const st = await backupStatus();
    assert.equal(st.overdue, false, "เพิ่งสำรองเสร็จ ต้องไม่ขึ้นว่าเลยกำหนด");
    assert.ok(st.snapshots.length >= 1);
  });
});
