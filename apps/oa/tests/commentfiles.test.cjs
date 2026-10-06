const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { getComments, getAttachments } = require("../.test-build/lib/queries.js");

/**
 * ไฟล์ที่แนบมากับความคิดเห็น
 *
 * สิ่งที่ต้องไม่พังคือ "ไฟล์ของความคิดเห็นต้องไม่ไปโผล่ที่อื่น" — บันทึกการอนุมัติ
 * จับคู่ไฟล์กับคนที่อัปโหลด ถ้าไฟล์ความคิดเห็นหลุดเข้าไปในกองนั้น มันจะไปเกาะกับ
 * ขั้นอนุมัติของคนคนเดียวกันทันที ทั้งที่เขาไม่ได้แนบตอนอนุมัติ
 */
describe("ไฟล์แนบในความคิดเห็น", () => {
  let user, other, req;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    user = await h.makeUser({ name: "คนเขียนความคิดเห็น", deptId: dept });
    other = await h.makeUser({ name: "อีกคน", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: user.id });
  });

  const addComment = async (userId, body) =>
    (await h.db
      .prepare("INSERT INTO request_comments (request_id, user_id, body) VALUES (?,?,?) RETURNING id")
      .get(req, userId, body)).id;

  const attach = async ({ commentId = null, filename, uploadedBy, mime = "image/png" }) =>
    (await h.db
      .prepare(
        `INSERT INTO attachments (request_id, field_key, comment_id, filename, stored_name, mime, size, uploaded_by)
         VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .get(req, "", commentId, filename, `s-${filename}`, mime, 100, uploadedBy)).id;

  test("ไฟล์ไปอยู่กับความคิดเห็นที่มันถูกแนบมาด้วย", async () => {
    const c1 = await addComment(user.id, "ดูรูปนี้");
    const c2 = await addComment(other.id, "ไม่มีไฟล์");
    await attach({ commentId: c1, filename: "ภาพหน้าจอ.png", uploadedBy: user.id });

    const got = await getComments(req);
    assert.equal(got.length, 2);
    assert.equal(got[0].id, c1);
    assert.deepEqual(got[0].files.map((f) => f.filename), ["ภาพหน้าจอ.png"]);
    assert.deepEqual(got[1].files, [], "ความคิดเห็นที่ไม่มีไฟล์ต้องได้อาร์เรย์ว่าง ไม่ใช่ undefined");
    assert.equal(got[0].files[0].uploader_name, "คนเขียนความคิดเห็น");
  });

  test("หลายไฟล์ในความคิดเห็นเดียว เรียงตามลำดับที่แนบ", async () => {
    const c = await addComment(user.id, "แนบสามไฟล์");
    for (const n of ["ก.png", "ข.pdf", "ค.png"])
      await attach({ commentId: c, filename: n, uploadedBy: user.id });

    const got = await getComments(req);
    const mine = got.find((x) => x.id === c);
    assert.deepEqual(mine.files.map((f) => f.filename), ["ก.png", "ข.pdf", "ค.png"]);
  });

  test("ไฟล์ของคำขอ (ไม่ได้ผูกความคิดเห็น) ต้องไม่ถูกดึงมาใส่ความคิดเห็น", async () => {
    const c = await addComment(user.id, "ความคิดเห็นเปล่า");
    await attach({ commentId: null, filename: "ไฟล์ของคำขอ.pdf", uploadedBy: user.id, mime: "application/pdf" });

    const got = await getComments(req);
    const mine = got.find((x) => x.id === c);
    assert.deepEqual(mine.files, []);

    // แต่ต้องยังอยู่ในกองไฟล์ของคำขอตามเดิม
    const all = await getAttachments(req);
    assert.ok(all.some((f) => f.filename === "ไฟล์ของคำขอ.pdf"));
  });

  test("getAttachments บอกได้ว่าไฟล์ไหนเป็นของความคิดเห็น — ใช้กรองออกจากบันทึกการอนุมัติ", async () => {
    const all = await getAttachments(req);
    const ofComments = all.filter((f) => f.comment_id);
    const ofRequest = all.filter((f) => !f.comment_id);
    assert.ok(ofComments.length >= 4, "ต้องแยกไฟล์ของความคิดเห็นออกมาได้");
    assert.deepEqual(ofRequest.map((f) => f.filename), ["ไฟล์ของคำขอ.pdf"]);
  });

  test("ลบความคิดเห็นแล้วไฟล์ของมันหายตาม ไม่ค้างเป็นแถวกำพร้า", async () => {
    const c = await addComment(user.id, "เดี๋ยวจะถูกลบ");
    await attach({ commentId: c, filename: "จะหายไป.png", uploadedBy: user.id });
    await h.db.prepare("DELETE FROM request_comments WHERE id = ?").run(c);

    const all = await getAttachments(req);
    assert.ok(!all.some((f) => f.filename === "จะหายไป.png"));
  });
});
