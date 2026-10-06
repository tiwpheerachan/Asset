const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");

const h = require("./helpers.cjs");

const SECRET = "secret-for-test-only-0123456789ab";

/**
 * การส่ง webhook ออกไปหาระบบภายนอก
 *
 * เทสต์กับปลายทางจริงที่เปิดขึ้นมาในเครื่อง ไม่ใช่การปลอม fetch — เพราะสิ่งที่ต้อง
 * พิสูจน์คือ "สิ่งที่วิ่งออกไปตามสาย" ถูกต้องไหม โดยเฉพาะลายมือชื่อที่ต้องคำนวณจาก
 * เนื้อข้อความดิบตัวเดียวกับที่ส่งจริง ถ้าปลอมชั้น fetch จะพลาดบั๊กประเภทนั้นทั้งหมด
 */
describe("ส่ง webhook ออกไป", () => {
  let server, received, port, lib, req;
  // ปลายทางจะตอบพังหรือไม่ คุมจากตรงนี้ ไม่ใช่จากเนื้อข้อมูล — เพราะข้อมูลที่ส่งถูกถ่ายภาพ
  // ไว้ตั้งแต่ตอนเข้าคิว การแก้ใบคำขอทีหลังจึงไม่เปลี่ยนสิ่งที่วิ่งออกไป
  let receiverFails = false;

  before(async () => {
    await h.wipe();
    received = [];
    server = http.createServer((r, res) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const raw = Buffer.concat(chunks);
        const expected =
          "sha256=" + crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
        received.push({
          signatureOk: r.headers["x-signature-256"] === expected,
          body: JSON.parse(raw.toString("utf8")),
        });
        res.writeHead(receiverFails ? 500 : 200).end("ok");
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;

    process.env.WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;
    process.env.WEBHOOK_SECRET = SECRET;
    process.env.WEBHOOK_EVENTS = "request.approved,request.submitted";

    const id = require.resolve("server-only");
    require.cache[id] = { id, filename: id, loaded: true, exports: {}, children: [], paths: [] };
    lib = require("../.test-build/lib/integration.js");

    const dept = await h.makeDept();
    const user = await h.makeUser({ name: "ผู้ยื่น", deptId: dept });
    const tpl = await h.makeTemplate();
    req = await h.makeRequest({ templateId: tpl, requesterId: user.id, status: "APPROVED" });
  });

  after(() => {
    server?.close();
    delete process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.WEBHOOK_EVENTS;
  });

  test("ข้อความทดสอบถึงปลายทาง พร้อมลายมือชื่อที่ตรวจผ่าน", async () => {
    const r = await lib.sendTestWebhook();
    assert.ok(r.ok, r.error);
    assert.equal(r.status, 200);

    const got = received.at(-1);
    assert.equal(got.signatureOk, true, "ลายมือชื่อไม่ตรงกับเนื้อข้อความ");
    assert.equal(got.body.event, "ping");
    assert.equal(got.body.test, true, "ต้องติดธงว่าเป็นการทดสอบ ปลายทางจะได้ไม่สร้างเอกสารจริง");
  });

  test("ข้อมูลที่ส่งถูกถ่ายภาพไว้ตอนเข้าคิว ไม่เปลี่ยนตามใบที่แก้ทีหลัง", async () => {
    await lib.enqueueWebhook("request.submitted", req);
    await h.db.prepare("UPDATE requests SET title='แก้หลังเข้าคิวแล้ว' WHERE id=?").run(req);
    await lib.flushWebhooks();

    const got = received.at(-1);
    assert.notEqual(got.body.request.title, "แก้หลังเข้าคิวแล้ว",
      "สิ่งที่ส่งต้องเป็นสภาพ ณ ตอนเกิดเหตุการณ์ ไม่ใช่สภาพล่าสุด");
  });

  test("เหตุการณ์จริงติด delivery_id และ attempt ไปด้วย", async () => {
    await lib.enqueueWebhook("request.approved", req);
    const r = await lib.flushWebhooks();
    assert.deepEqual(r, { sent: 1, failed: 0 });

    const got = received.at(-1);
    assert.equal(got.signatureOk, true);
    assert.equal(got.body.event, "request.approved");
    assert.equal(typeof got.body.delivery_id, "number");
    assert.equal(got.body.attempt, 1);
    assert.ok(Array.isArray(got.body.request.attachments), "ต้องมีคีย์ไฟล์แนบเสมอ");
  });

  test("เหตุการณ์ที่ไม่ได้อยู่ในรายการ ไม่ถูกเข้าคิว", async () => {
    const before = (await h.db.prepare("SELECT count(*) AS n FROM webhook_deliveries").get()).n;
    await lib.enqueueWebhook("request.cancelled", req);
    const after = (await h.db.prepare("SELECT count(*) AS n FROM webhook_deliveries").get()).n;
    assert.equal(Number(after), Number(before));
  });

  test("ปลายทางตอบไม่สำเร็จ → ลองซ้ำจนครบโควตาแล้วขึ้น FAILED", async () => {
    receiverFails = true;
    await lib.enqueueWebhook("request.approved", req);
    for (let i = 0; i < 5; i++) await lib.flushWebhooks();

    const row = await h.db
      .prepare("SELECT status, attempts FROM webhook_deliveries ORDER BY id DESC LIMIT 1")
      .get();
    assert.equal(row.status, "FAILED");
    assert.equal(row.attempts, 5, "ต้องหยุดที่ 5 ครั้ง ไม่วนไม่รู้จบ");
  });

  test("สั่งส่งซ้ำหลังปลายทางกลับมาปกติ ต้องส่งผ่าน", async () => {
    const failed = await h.db
      .prepare("SELECT id FROM webhook_deliveries WHERE status='FAILED' ORDER BY id DESC LIMIT 1")
      .get();
    receiverFails = false;

    const r = await lib.retryDelivery(failed.id);
    assert.equal(r.sent, 1);

    const row = await h.db
      .prepare("SELECT status, attempts FROM webhook_deliveries WHERE id=?")
      .get(failed.id);
    assert.equal(row.status, "SENT");
    assert.equal(row.attempts, 1, "นับใหม่ตั้งแต่ต้น");
  });
});
