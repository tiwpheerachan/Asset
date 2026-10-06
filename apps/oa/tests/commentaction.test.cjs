const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const h = require("./helpers.cjs");

/**
 * ส่งความคิดเห็นพร้อมไฟล์ — ทดสอบตัว action จริง ไม่ใช่แค่ชั้นฐานข้อมูล
 *
 * จุดที่เคยพิสูจน์ไม่ได้คือ "ไฟล์จาก FormData มาถึงฝั่งเซิร์ฟเวอร์จริงไหม" เพราะยิง
 * server action ของ Next ผ่าน curl ไม่ได้ ที่นี่จึงเรียกฟังก์ชันตรง ๆ แล้วปลอม
 * next/headers (คุกกี้) กับ next/cache (revalidatePath) ซึ่งเป็นสองอย่างเดียว
 * ที่ผูกกับ request ของ Next
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

describe("ส่งความคิดเห็นพร้อมไฟล์", () => {
  let user, req, commentAction, getComments;

  before(async () => {
    await h.wipe();
    const dept = await h.makeDept();
    user = await h.makeUser({ name: "คนทดสอบ", role: "ADMIN", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: user.id });

    const sid = `sess-${process.pid}`;
    await h.db
      .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)")
      .run(sid, user.id, new Date(Date.now() + 3600e3).toISOString());

    stubNext(sid);
    ({ commentAction } = require("../.test-build/lib/actions.js"));
    ({ getComments } = require("../.test-build/lib/queries.js"));
  });

  const send = async (fields) => {
    const form = new FormData();
    form.set("request_id", String(req));
    for (const [k, v] of Object.entries(fields)) {
      if (k === "files") for (const f of v) form.append("files", f);
      else form.set(k, v);
    }
    return commentAction({}, form);
  };

  test("ไฟล์ที่แนบมาถูกเก็บและผูกกับความคิดเห็นนั้น", async () => {
    const png = new File([Buffer.from("\x89PNG\r\n\x1a\nรูปทดสอบ")], "ภาพหน้าจอ.png", {
      type: "image/png",
    });
    const res = await send({ body: "ดูรูปนี้", files: [png] });
    assert.ok(res.ok, `ควรสำเร็จ แต่ได้: ${res.error}`);

    const comments = await getComments(req);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, "ดูรูปนี้");
    assert.equal(comments[0].files.length, 1, "ไฟล์ต้องมาถึงฝั่งเซิร์ฟเวอร์");
    assert.equal(comments[0].files[0].filename, "ภาพหน้าจอ.png");
    assert.equal(comments[0].files[0].mime, "image/png");
    assert.ok(comments[0].files[0].size > 0);
  });

  test("แนบหลายไฟล์พร้อมกันได้", async () => {
    const files = ["ก.png", "ข.pdf"].map(
      (n) => new File([Buffer.from("เนื้อหา")], n, { type: "application/octet-stream" }),
    );
    const res = await send({ body: "สองไฟล์", files });
    assert.ok(res.ok);

    const c = (await getComments(req)).find((x) => x.body === "สองไฟล์");
    assert.deepEqual(c.files.map((f) => f.filename), ["ก.png", "ข.pdf"]);
  });

  test("ส่งรูปโดยไม่พิมพ์ข้อความได้", async () => {
    const png = new File([Buffer.from("รูป")], "ไม่มีคำบรรยาย.png", { type: "image/png" });
    const res = await send({ body: "", files: [png] });
    assert.ok(res.ok, `ควรสำเร็จ แต่ได้: ${res.error}`);

    const c = (await getComments(req)).find((x) => x.files.some((f) => f.filename === "ไม่มีคำบรรยาย.png"));
    assert.equal(c.body, "");
  });

  test("ไม่พิมพ์และไม่แนบ = เตือน ไม่บันทึกอะไรเลย", async () => {
    const before = (await getComments(req)).length;
    const res = await send({ body: "   " });
    assert.ok(res.error, "ต้องได้ข้อความเตือน");
    assert.equal((await getComments(req)).length, before, "ต้องไม่มีความคิดเห็นเปล่าถูกบันทึก");
  });

  test("ช่องไฟล์ว่าง (ไม่ได้เลือกอะไร) ไม่ถูกนับเป็นไฟล์", async () => {
    // เบราว์เซอร์ส่งไฟล์ขนาดศูนย์ชื่อว่างมาให้เมื่อ input file ไม่ได้เลือกอะไร
    const empty = new File([], "", { type: "application/octet-stream" });
    const res = await send({ body: "", files: [empty] });
    assert.ok(res.error, "ต้องเตือนเหมือนไม่ได้แนบอะไร");
  });

  test("ไฟล์ใหญ่เกินโควตา ต้องไม่ทิ้งความคิดเห็นค้างไว้", async () => {
    const before = (await getComments(req)).length;
    const big = new File([Buffer.alloc(11 * 1024 * 1024)], "ใหญ่เกิน.bin", {
      type: "application/octet-stream",
    });
    const res = await send({ body: "ไฟล์ใหญ่", files: [big] });
    assert.ok(res.error, "ต้องบอกว่าไฟล์ใหญ่เกิน");
    assert.equal((await getComments(req)).length, before, "ความคิดเห็นที่บันทึกไปแล้วต้องถูกลบคืน");
  });
});
