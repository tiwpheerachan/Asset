const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { canView, listRequests, listAwaitingMe } = require("../.test-build/lib/queries.js");
const { getRequest } = require("../.test-build/lib/queries.js");
const { saveDelegation } = require("../.test-build/lib/delegation.js");
const {
  checkLoginAllowed, recordLoginAttempt, unlockAccount, rateLimitConfig,
} = require("../.test-build/lib/rate-limit.js");

/**
 * สิทธิ์การมองเห็น — พังแล้วคนเห็นเอกสารที่ไม่ควรเห็น ซึ่งรู้ตัวยากกว่าระบบล่ม
 */
describe("สิทธิ์การมองเห็นเอกสาร", () => {
  let deptA, deptB, admin, mgrA, userA, userA2, userB, tpl, reqOfA;

  beforeEach(async () => {
    await h.wipe();
    deptA = await h.makeDept("ฝ่าย A");
    deptB = await h.makeDept("ฝ่าย B");
    admin = await h.makeUser({ name: "ผู้ดูแล", role: "ADMIN" });
    mgrA = await h.makeUser({ name: "หัวหน้า A", role: "MANAGER", deptId: deptA });
    userA = await h.makeUser({ name: "พนักงาน A", deptId: deptA });
    userA2 = await h.makeUser({ name: "พนักงาน A2", deptId: deptA });
    userB = await h.makeUser({ name: "พนักงาน B", deptId: deptB });
    tpl = await h.makeTemplate();
    reqOfA = await h.makeRequest({ templateId: tpl, requesterId: userA.id });
  });

  test("เจ้าของเรื่องเห็นของตัวเอง", async () => {
    assert.equal(await canView(await getRequest(reqOfA), userA), true);
  });

  test("คนแผนกอื่นที่ไม่เกี่ยวข้องต้องไม่เห็น", async () => {
    assert.equal(await canView(await getRequest(reqOfA), userB), false);
  });

  test("คนแผนกเดียวกันที่ไม่ได้อยู่ในสายอนุมัติก็ต้องไม่เห็น", async () => {
    assert.equal(await canView(await getRequest(reqOfA), userA2), false);
  });

  test("หัวหน้าเห็นทุกเรื่องที่คนในแผนกตัวเองยื่น", async () => {
    assert.equal(await canView(await getRequest(reqOfA), mgrA), true);
  });

  test("หัวหน้าแผนกอื่นต้องไม่เห็น", async () => {
    const mgrB = await h.makeUser({ name: "หัวหน้า B", role: "MANAGER", deptId: deptB });
    assert.equal(await canView(await getRequest(reqOfA), mgrB), false);
  });

  test("ผู้ดูแลเห็นทุกเรื่อง", async () => {
    assert.equal(await canView(await getRequest(reqOfA), admin), true);
  });

  test("คนที่อยู่ในสายอนุมัติเห็นได้ แม้อยู่คนละแผนก", async () => {
    await h.addApprover({ requestId: reqOfA, step: 1, userId: userB.id });
    assert.equal(await canView(await getRequest(reqOfA), userB), true);
  });

  test("คนรับหน้าที่แทนต้องเปิดเอกสารได้ ไม่งั้นกดอนุมัติแทนไม่ได้จริง", async () => {
    const approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: deptB });
    const cover = await h.makeUser({ name: "คนแทน", deptId: deptB });
    await h.addApprover({ requestId: reqOfA, step: 1, userId: approver.id });

    assert.equal(await canView(await getRequest(reqOfA), cover), false, "ก่อนมอบหมายต้องยังไม่เห็น");
    const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    await saveDelegation({
      fromUser: approver.id, toUser: cover.id,
      fromDate: day(-1), toDate: day(1), reason: "", createdBy: approver.id,
    });
    assert.equal(await canView(await getRequest(reqOfA), cover), true, "หลังมอบหมายต้องเห็น");
  });

  test("รายการคำขอต้องกรองตามสิทธิ์เดียวกับ canView", async () => {
    await h.makeRequest({ templateId: tpl, requesterId: userB.id });
    assert.equal((await listRequests(admin, {})).total, 2);
    assert.equal((await listRequests(userA, {})).total, 1);
    assert.equal((await listRequests(userA2, {})).total, 0);
    assert.equal((await listRequests(mgrA, {})).total, 1);
  });

  test("แท็บรอฉันอนุมัติต้องรวมงานที่รับแทนอยู่", async () => {
    const approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: deptB });
    const cover = await h.makeUser({ name: "คนแทน", deptId: deptB });
    await h.addApprover({ requestId: reqOfA, step: 1, userId: approver.id });

    assert.equal((await listAwaitingMe(cover.id)).length, 0);
    const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    await saveDelegation({
      fromUser: approver.id, toUser: cover.id,
      fromDate: day(-1), toDate: day(1), reason: "", createdBy: approver.id,
    });
    assert.equal((await listAwaitingMe(cover.id)).length, 1);
    assert.equal((await listAwaitingMe(approver.id)).length, 1, "เจ้าของคิวยังต้องเห็นงานตัวเองอยู่");
  });

  test("ตัวกรองสถานะ ประเภท และคำค้น ต้องทำงานที่ฐานข้อมูล", async () => {
    const tpl2 = await h.makeTemplate("อีกฟอร์ม");
    await h.makeRequest({ templateId: tpl2, requesterId: userA.id, status: "APPROVED", title: "ซื้อคอมพิวเตอร์" });

    assert.equal((await listRequests(admin, { status: "APPROVED" })).total, 1);
    assert.equal((await listRequests(admin, { status: "PENDING" })).total, 1);
    assert.equal((await listRequests(admin, { templateId: tpl2 })).total, 1);
    assert.equal((await listRequests(admin, { q: "คอมพิวเตอร์" })).total, 1);
    assert.equal((await listRequests(admin, { q: "ไม่มีคำนี้แน่นอน" })).total, 0);
  });

  test("แบ่งหน้าต้องคืนจำนวนรวมที่ถูกต้อง ไม่ใช่จำนวนในหน้านั้น", async () => {
    for (let i = 0; i < 5; i++) await h.makeRequest({ templateId: tpl, requesterId: userA.id });
    const page = await listRequests(admin, { limit: 2, offset: 0 });
    assert.equal(page.rows.length, 2);
    assert.equal(page.total, 6);
  });
});

describe("กันการเดารหัสผ่าน", () => {
  const cfg = rateLimitConfig();
  const email = "victim@test.local";

  beforeEach(async () => {
    ((await h.db.prepare("DELETE FROM login_attempts").run()));
  });

  test("ผิดไม่เกินโควตายังเข้าได้", async () => {
    for (let i = 0; i < cfg.maxPerEmail - 1; i++) await recordLoginAttempt(email, "1.1.1.1", false);
    assert.equal((await checkLoginAllowed(email, "1.1.1.1")).blocked, false);
  });

  test("ผิดครบโควตาแล้วต้องถูกล็อก", async () => {
    for (let i = 0; i < cfg.maxPerEmail; i++) await recordLoginAttempt(email, "1.1.1.1", false);
    const r = await checkLoginAllowed(email, "1.1.1.1");
    assert.equal(r.blocked, true);
    assert.equal(r.reason, "EMAIL");
    assert.ok(r.retryAfterMin > 0);
  });

  test("ล็อกที่บัญชี ไม่ใช่ที่ IP — คนอื่นที่ IP เดียวกันยังเข้าได้", async () => {
    for (let i = 0; i < cfg.maxPerEmail; i++) await recordLoginAttempt(email, "1.1.1.1", false);
    assert.equal((await checkLoginAllowed("someone-else@test.local", "1.1.1.1")).blocked, false);
  });

  test("ยิงหลายบัญชีจาก IP เดียว ต้องโดนล็อกที่ IP", async () => {
    for (let i = 0; i < cfg.maxPerIp; i++) await recordLoginAttempt(`u${i}@test.local`, "9.9.9.9", false);
    const r = await checkLoginAllowed("fresh@test.local", "9.9.9.9");
    assert.equal(r.blocked, true);
    assert.equal(r.reason, "IP");
  });

  test("เข้าสำเร็จต้องล้างประวัติที่ล้มเหลวของบัญชีนั้น", async () => {
    for (let i = 0; i < cfg.maxPerEmail - 1; i++) await recordLoginAttempt(email, "1.1.1.1", false);
    await recordLoginAttempt(email, "1.1.1.1", true);
    const left = (await h.db
      .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email=? AND ok=0")
      .get(email));
    assert.equal(left.n, 0);
    assert.equal((await checkLoginAllowed(email, "1.1.1.1")).blocked, false);
  });

  test("ผู้ดูแลปลดล็อกให้ได้", async () => {
    for (let i = 0; i < cfg.maxPerEmail; i++) await recordLoginAttempt(email, "1.1.1.1", false);
    assert.equal((await checkLoginAllowed(email, "1.1.1.1")).blocked, true);
    await unlockAccount(email);
    assert.equal((await checkLoginAllowed(email, "1.1.1.1")).blocked, false);
  });
});

describe("ความพร้อมของแม่แบบฟอร์ม", () => {
  const { templateReadiness } = require("../.test-build/lib/queries.js");

  test("ขั้นอนุมัติที่ไม่มีผู้รับผิดชอบ ต้องถูกจับได้ก่อนผู้ใช้กรอกฟอร์ม", async () => {
    await h.wipe();
    const dept = await h.makeDept();
    const approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: dept });
    const tpl = await h.makeTemplate();
    ((await h.db.prepare(
      `INSERT INTO form_fields (template_id,field_key,label,type,field_role,required,sort_order)
       VALUES (?,?,?,?,?,1,1)`,
    ).run(tpl, "subject", "เรื่อง", "TEXT", "TITLE")));

    // ยังไม่มีขั้นอนุมัติเลย
    assert.deepEqual((await templateReadiness()).get(tpl), ["admin.forms.needSteps"]);

    // มีขั้นแล้ว แต่ยังไม่ได้ระบุว่าใครอนุมัติ — เคยหลุดรอดจนไปพังตอนกดส่ง
    const node = Number(
      ((await h.db.prepare(
        `INSERT INTO flow_nodes (template_id,name,kind,mode,stage,sort_order)
         VALUES (?,?,'APPROVE','SEQUENTIAL','FINAL',1)`,
      ).run(tpl, "ผู้จัดการ"))).lastInsertRowid,
    );
    assert.deepEqual((await templateReadiness()).get(tpl), ["admin.forms.needApprovers"]);

    // ระบุคนแล้วจึงพร้อมใช้
    ((await h.db.prepare(
      "INSERT INTO flow_node_members (node_id,source,job_role,user_id,scope) VALUES (?,'USER','',?,'ANY')",
    ).run(node, approver.id)));
    assert.equal((await templateReadiness()).has(tpl), false);
  });

  /**
   * เกิดขึ้นจริงกับฟอร์ม KAA บน production: มีขั้นอนุมัติ 2 ขั้นแต่เป็นระดับ
   * "อนุมัติเบื้องต้น" ทั้งคู่ เอกสารจึงผ่านเบื้องต้นแล้วค้างตรงนั้นตลอดไป
   * ไปไม่ถึง "อนุมัติแล้ว" และเอาไปอ้างอิงในใบลดหนี้ไม่ได้ด้วย
   * หน้าแม่แบบฟอร์มบอกว่าพร้อมใช้ ไม่มีอะไรฟ้องจนมีคนกดยื่นขออนุมัติจริงแล้วเจอ error
   */
  test("ฟอร์มที่มีแต่ขั้นอนุมัติเบื้องต้น ต้องถูกจับได้ ไม่ใช่รอให้ไปพังตอนยื่น", async () => {
    await h.wipe();
    const dept = await h.makeDept();
    const approver = await h.makeUser({ name: "ผู้อนุมัติ", deptId: dept });
    const tpl = await h.makeTemplate();
    ((await h.db.prepare(
      `INSERT INTO form_fields (template_id,field_key,label,type,field_role,required,sort_order)
       VALUES (?,?,?,?,?,1,1)`,
    ).run(tpl, "subject", "เรื่อง", "TEXT", "TITLE")));

    const addNode = async (stage) => {
      const node = Number(
        ((await h.db.prepare(
          `INSERT INTO flow_nodes (template_id,name,kind,mode,stage,sort_order)
           VALUES (?,?,'APPROVE','SEQUENTIAL',?,1)`,
        ).run(tpl, `ขั้น ${stage}`, stage))).lastInsertRowid,
      );
      ((await h.db.prepare(
        "INSERT INTO flow_node_members (node_id,source,job_role,user_id,scope) VALUES (?,'USER','',?,'ANY')",
      ).run(node, approver.id)));
    };

    await addNode("PRELIM");
    assert.deepEqual((await templateReadiness()).get(tpl), ["admin.forms.needFinalStep"]);

    // เติมขั้นอนุมัติจริงแล้วจึงพร้อมใช้
    await addNode("FINAL");
    assert.equal((await templateReadiness()).has(tpl), false);
  });

  test("ฟอร์มที่ไม่มีฟิลด์เลย ต้องถูกจับได้", async () => {
    await h.wipe();
    const tpl = await h.makeTemplate();
    assert.deepEqual((await templateReadiness()).get(tpl), ["admin.forms.needFields", "admin.forms.needSteps"]);
  });

  /**
   * ฟอร์มอย่าง "Vat税金" ที่ทุกใบเป็นเรื่องเดียวกัน ไม่จำเป็นต้องมีช่องหัวเรื่อง
   * เอกสารอ้างถึงกันด้วยเลขที่ ชื่อฟอร์ม ผู้จัดทำ และวันที่ได้อยู่แล้ว
   */
  test("ไม่มีฟิลด์หัวเรื่องไม่ใช่ปัญหา — ฟอร์มยังใช้งานได้", async () => {
    await h.wipe();
    const tpl = await h.makeTemplate();
    ((await h.db.prepare(
      `INSERT INTO form_fields (template_id,field_key,label,type,field_role,required,sort_order)
       VALUES (?,?,?,?,'',1,1)`,
    ).run(tpl, "note", "หมายเหตุ", "TEXT")));
    assert.deepEqual((await templateReadiness()).get(tpl), ["admin.forms.needSteps"]);
  });
});
