const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");

/**
 * ส่งคำขอเข้าสายอนุมัติ — เส้นทางที่ไม่เคยมีเทสต์ครอบมาก่อน
 *
 * ที่มา: advanceFrom เป็น async แต่ถูกรับใส่ตัวแปรโดยไม่ await แล้วส่งลงคอลัมน์
 * current_step ที่เป็น INTEGER ทำให้ส่งคำขอไม่ได้เลยทั้งระบบ
 * ("invalid input syntax for type integer") — เป็นบั๊กที่ TypeScript จับไม่ได้
 * เพราะ .run(...) รับ any และด่าน if (step === null) ก็ไม่เคยทำงานเพราะ
 * Promise ไม่มีทางเท่ากับ null
 *
 * เทสต์นี้จึงตรวจ "ค่าที่ลงฐานข้อมูลจริง" ไม่ใช่แค่ว่า action ไม่โยน error
 */
function stubNext(sessionId) {
  const fake = (id, exports) => {
    require.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] };
  };
  fake(require.resolve("next/headers"), {
    cookies: async () => ({ get: (k) => (k === "ia_session" ? { value: sessionId } : undefined) }),
  });
  fake(require.resolve("next/cache"), { revalidatePath: () => {}, revalidateTag: () => {} });
}

describe("ส่งคำขอเข้าสายอนุมัติ", () => {
  let requester, approver1, approver2, tplId, submitRequestAction;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    requester = await h.makeUser({ name: "ผู้ยื่น", role: "ADMIN", deptId: dept });
    approver1 = await h.makeUser({ name: "ผู้อนุมัติหนึ่ง", deptId: dept });
    approver2 = await h.makeUser({ name: "ผู้อนุมัติสอง", deptId: dept });
    tplId = await h.makeTemplate();

    // สายอนุมัติสองขั้น ระบุตัวบุคคล (แบบเดียวกับที่ใช้จริงบน production)
    for (const [order, uid] of [[1, approver1.id], [2, approver2.id]]) {
      const node = await h.db
        .prepare(
          `INSERT INTO flow_nodes (template_id, name, kind, mode, stage, sort_order, active)
           VALUES (?,?,'APPROVE','SEQUENTIAL','FINAL',?,1) RETURNING id`,
        )
        .get(tplId, `ขั้น ${order}`, order);
      await h.db
        .prepare("INSERT INTO flow_node_members (node_id, source, user_id) VALUES (?,'USER',?)")
        .run(node.id, uid);
    }

    const sid = `sess-submit-${process.pid}`;
    await h.db
      .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)")
      .run(sid, requester.id, new Date(Date.now() + 3600e3).toISOString());

    stubNext(sid);
    ({ submitRequestAction } = require("../.test-build/lib/actions.js"));
  });

  const makeDraft = async () =>
    h.makeRequest({ templateId: tplId, requesterId: requester.id, status: "DRAFT", step: 0 });

  const submit = async (id) => {
    const form = new FormData();
    form.set("request_id", String(id));
    return submitRequestAction({}, form);
  };

  test("ส่งได้ และ current_step เป็นตัวเลขจริง ไม่ใช่ Promise", async () => {
    const id = await makeDraft();
    const res = await submit(id);
    assert.ok(!res.error, `ส่งไม่ผ่าน: ${res.error}`);

    const row = await h.db
      .prepare("SELECT status, stage, current_step FROM requests WHERE id=?")
      .get(id);
    assert.equal(row.status, "PENDING");
    assert.equal(typeof row.current_step, "number", `current_step ไม่ใช่ตัวเลข: ${row.current_step}`);
    assert.equal(row.current_step, 1, "ต้องชี้ไปที่ขั้นแรก");
  });

  test("สายอนุมัติถูกเขียนครบทุกขั้น", async () => {
    const id = await makeDraft();
    await submit(id);

    const rows = await h.db
      .prepare("SELECT step_no, user_id, status FROM request_approvers WHERE request_id=? ORDER BY step_no")
      .all(id);
    assert.deepEqual(rows.map((r) => r.step_no), [1, 2]);
    assert.deepEqual(rows.map((r) => r.user_id), [approver1.id, approver2.id]);
    assert.equal(rows[0].status, "PENDING");
  });

  test("ส่งซ้ำใบที่ส่งไปแล้ว ต้องถูกปฏิเสธ", async () => {
    const id = await makeDraft();
    await submit(id);
    const again = await submit(id);
    assert.ok(again.error, "ต้องเตือนว่าส่งไปแล้ว");
  });

  test("แม่แบบที่ไม่มีขั้นอนุมัติ ต้องเตือน ไม่ใช่ส่งผ่านแบบเงียบ ๆ", async () => {
    const emptyTpl = await h.makeTemplate();
    const id = await h.makeRequest({
      templateId: emptyTpl, requesterId: requester.id, status: "DRAFT", step: 0,
    });
    const res = await submit(id);
    assert.ok(res.error, "ต้องได้ข้อความเตือน");

    const row = await h.db.prepare("SELECT status FROM requests WHERE id=?").get(id);
    assert.equal(row.status, "DRAFT", "เอกสารต้องยังเป็นฉบับร่างเหมือนเดิม");
  });
});
