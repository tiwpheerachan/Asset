const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");

/**
 * เลขที่เอกสารตอนบันทึกจริง
 *
 * ที่มา: nextDocNo เป็น async แต่ถูกส่งเข้า .run() โดยไม่ await เลขที่เอกสารจึงกลาย
 * เป็นข้อความ "{}" (Promise ที่ถูกแปลงเป็นข้อความ) ใบแรกบันทึกผ่านเพราะยังไม่ซ้ำ
 * ใบที่สองชนคีย์ซ้ำทันที และเป็นบั๊กที่ TypeScript จับไม่ได้เพราะ .run() รับ any
 *
 * เทสต์นี้จึงบันทึกร่างสองใบติดกัน แล้วดูเลขที่เอกสารจริงในฐานข้อมูล
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

describe("เลขที่เอกสารตอนบันทึกฉบับร่าง", () => {
  let user, tplId, autosaveDraftAction;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    user = await h.makeUser({ name: "คนกรอกฟอร์ม", role: "ADMIN", deptId: dept });
    tplId = await h.makeTemplate();
    await h.db
      .prepare("UPDATE form_templates SET code='MANPOWER', doc_prefix='MPRQ' WHERE id=?")
      .run(tplId);
    await h.db
      .prepare(
        `INSERT INTO form_fields (template_id, field_key, label, type, required, active, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(tplId, "position", "ตำแหน่ง", "TEXT", 0, 1, 1);

    const sid = `sess-doc-${process.pid}`;
    await h.db
      .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)")
      .run(sid, user.id, new Date(Date.now() + 3600e3).toISOString());

    stubNext(sid);
    ({ autosaveDraftAction } = require("../.test-build/lib/actions.js"));
  });

  const draft = async (text) => {
    const form = new FormData();
    form.set("request_id", "0");
    form.set("template_id", String(tplId));
    form.set("f_position", text);
    return autosaveDraftAction(form);
  };

  test("ร่างใบแรกได้เลขที่ตามรูปแบบ ไม่ใช่ค่าที่แปลงจาก Promise", async () => {
    const r = await draft("ใบแรก");
    assert.ok(r.id > 0, `ควรได้ id แต่ได้: ${JSON.stringify(r)}`);

    const row = await h.db.prepare("SELECT doc_no FROM requests WHERE id=?").get(r.id);
    assert.notEqual(row.doc_no, "{}", "เลขที่เอกสารกลายเป็น Promise ที่ไม่ได้ await");
    assert.match(row.doc_no, /^AP-MPRQ-\d{6}-\d{4}$/, `เลขที่ผิดรูปแบบ: ${row.doc_no}`);
  });

  test("ร่างใบที่สองต้องบันทึกได้ ไม่ชนคีย์ซ้ำ", async () => {
    const r = await draft("ใบสอง");
    assert.ok(r.id > 0, `บันทึกไม่ผ่าน: ${JSON.stringify(r)}`);

    const rows = await h.db
      .prepare("SELECT doc_no FROM requests WHERE requester_id=? ORDER BY id")
      .all(user.id);
    const nos = rows.map((x) => x.doc_no);
    assert.equal(new Set(nos).size, nos.length, `เลขซ้ำกัน: ${nos.join(", ")}`);
    assert.equal(nos.length, 2);
  });

  test("ลำดับเดินต่อเนื่องภายในฟอร์มเดียวกัน", async () => {
    await draft("ใบสาม");
    const rows = await h.db
      .prepare("SELECT doc_no FROM requests WHERE requester_id=? ORDER BY id")
      .all(user.id);
    const seq = rows.map((x) => Number(x.doc_no.slice(-4)));
    assert.deepEqual(seq, [1, 2, 3]);
  });
});
