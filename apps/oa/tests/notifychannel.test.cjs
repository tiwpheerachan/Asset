const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");

const ENV = ["SMTP_HOST", "SMTP_FROM", "LARK_APP_ID", "LARK_APP_SECRET"];
const saved = {};

/** โหลด notify ใหม่ทุกครั้ง เพราะ config อ่าน env ตอน import */
function loadNotify() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(".test-build/lib/")) delete require.cache[k];
  }
  return require("../.test-build/lib/lark/notify.js");
}

const channelsOf = async (requestId) =>
  (await h.db
    .prepare("SELECT channel FROM notifications WHERE request_id=? ORDER BY channel")
    .all(requestId))
    .map((r) => r.channel);

/**
 * แจ้งเตือนที่ไม่ถึงมือคนเท่ากับไม่มีระบบอนุมัติ
 * เดิมอีเมลเป็นแค่ตัวสำรองที่เงียบไปทันทีที่ตั้ง Lark — ซึ่งแปลว่าคนที่ไม่ได้เปิดแชท
 * จะไม่รู้เรื่องเลย ทั้งที่ระบบ "ส่งแล้ว"
 */
describe("ช่องทางแจ้งเตือน", () => {
  beforeEach(async () => {
    await h.wipe();
    for (const k of ENV) saved[k] = process.env[k];
  });

  afterEach(async () => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const seed = async () => {
    const u = await h.makeUser({ name: "ผู้รับ" });
    const tpl = await h.makeTemplate();
    return { u, req: await h.makeRequest({ templateId: tpl, requesterId: u.id }) };
  };

  test("ตั้งทั้งอีเมลและแชท = เข้าคิวทั้งสองช่องทาง", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    process.env.LARK_APP_ID = "cli_x";
    process.env.LARK_APP_SECRET = "secret";

    const { u, req } = await seed();
    await loadNotify().enqueue(req, u.id, "APPROVAL_REQUEST", {});
    assert.deepEqual(await channelsOf(req), ["EMAIL", "LARK"]);
  });

  test("ตั้งแค่อีเมล = เข้าคิวเฉพาะอีเมล", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;

    const { u, req } = await seed();
    await loadNotify().enqueue(req, u.id, "APPROVAL_REQUEST", {});
    assert.deepEqual(await channelsOf(req), ["EMAIL"]);
  });

  test("ตั้งแค่แชท = เข้าคิวเฉพาะแชท", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    process.env.LARK_APP_ID = "cli_x";
    process.env.LARK_APP_SECRET = "secret";

    const { u, req } = await seed();
    await loadNotify().enqueue(req, u.id, "APPROVAL_REQUEST", {});
    assert.deepEqual(await channelsOf(req), ["LARK"]);
  });

  test("ไม่ได้ตั้งอะไรเลย = ยังต้องมีแถวค้างไว้ ไม่ใช่เงียบหาย", async () => {
    for (const k of ENV) delete process.env[k];

    const { u, req } = await seed();
    const n = loadNotify();
    assert.deepEqual(n.activeChannels(), []);
    n.enqueue(req, u.id, "APPROVAL_REQUEST", {});
    assert.equal((await channelsOf(req)).length, 1);
  });
});
