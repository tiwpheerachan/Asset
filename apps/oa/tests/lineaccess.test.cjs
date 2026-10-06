const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { canView, getRequest, listRequests } = require("../.test-build/lib/queries.js");

/**
 * สิทธิ์ตามสายบังคับบัญชา และสิทธิ์ผู้ตรวจสอบ
 *
 * ที่มา: ระบบอนุมัติที่ให้สิทธิ์ "รายใบตอนกรอก" ทำให้หัวหน้าย้อนไปตรวจของเก่าไม่ได้เลย
 * ถ้าตอนนั้นไม่มีใครแท็กไว้ — สิทธิ์กลายเป็นผลพลอยได้จากความจำของคนกรอก
 * ที่นี่จึงตัดสินจาก "คุณเป็นใคร" แล้วมีผลย้อนหลังกับทุกใบที่เคยเกิดขึ้น
 */
describe("หัวหน้าเห็นเอกสารของลูกน้อง", () => {
  let boss, lead, staff, outsider, tpl, req;

  beforeEach(async () => {
    await h.wipe();
    boss = await h.makeUser({ name: "ผู้บริหาร" });
    lead = await h.makeUser({ name: "หัวหน้าสาย", managerId: boss.id });
    staff = await h.makeUser({ name: "พนักงาน", managerId: lead.id });
    outsider = await h.makeUser({ name: "คนนอกสาย" });
    tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: staff.id });
  });

  test("หัวหน้าโดยตรงเห็นเอกสารของลูกน้อง โดยไม่ต้องมีใครแท็กให้", async () => {
    assert.equal(await canView(await getRequest(req), lead), true);
  });

  /** "แผนกเดียวกัน" ตอบข้อนี้ไม่ได้ ถ้าองค์กรคุมด้วยสายบังคับบัญชาไม่ใช่กล่องแผนก */
  test("หัวหน้าของหัวหน้าก็เห็นด้วย ไม่ใช่แค่ชั้นเดียว", async () => {
    assert.equal(await canView(await getRequest(req), boss), true);
  });

  test("คนที่ไม่ได้อยู่ในสายไม่เห็น", async () => {
    assert.equal(await canView(await getRequest(req), outsider), false);
  });

  test("ลูกน้องไม่ได้เห็นของหัวหน้า — สิทธิ์ไหลลง ไม่ไหลขึ้น", async () => {
    const ofBoss = await h.makeRequest({ templateId: tpl, requesterId: boss.id });
    assert.equal(await canView(await getRequest(ofBoss), staff), false);
  });

  test("เอกสารของลูกน้องโผล่ในรายการของหัวหน้าด้วย ไม่ใช่แค่เปิดลิงก์ตรงได้", async () => {
    const rows = (await listRequests(lead, {})).rows.map((r) => r.id);
    assert.ok(rows.includes(req), "หัวหน้าต้องเห็นในหน้ารายการ");
  });

  test("แท็บทีมของฉันใช้ได้แม้ไม่ได้ผูกแผนกไว้", async () => {
    const rows = (await listRequests(lead, { tab: "team" })).rows.map((r) => r.id);
    assert.deepEqual(rows, [req]);
  });
});

describe("ผู้ตรวจสอบ", () => {
  let auditor, staff, tpl, req;

  beforeEach(async () => {
    await h.wipe();
    auditor = await h.makeUser({ name: "ผู้ตรวจสอบ", canAudit: 1 });
    staff = await h.makeUser({ name: "พนักงาน" });
    tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: staff.id });
  });

  /** จุดประสงค์ทั้งหมดคือย้อนไปตรวจของเก่าได้ — รวมใบที่เกิดก่อนได้รับสิทธิ์ */
  test("เห็นเอกสารได้ทุกใบ แม้ไม่ได้เกี่ยวข้องกับใบนั้นเลย", async () => {
    assert.equal(await canView(await getRequest(req), auditor), true);
    assert.ok((await listRequests(auditor, {})).rows.map((r) => r.id).includes(req));
  });

  test("คนธรรมดาที่ไม่ได้ติ๊กสิทธิ์นี้ยังไม่เห็นเหมือนเดิม", async () => {
    const plain = await h.makeUser({ name: "คนธรรมดา" });
    assert.equal(await canView(await getRequest(req), plain), false);
  });
});
