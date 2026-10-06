const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers.cjs");

const {
  createApiKey, listApiKeys, newApiKey, rateLimit, revokeApiKey, verifyApiKey,
} = require("../.test-build/lib/api-keys.js");
const { db } = require("../.test-build/lib/db.js");

const admin = async () => (await h.makeUser({ role: "ADMIN" })).id;

describe("กุญแจของระบบภายนอก", () => {
  /** ฐานข้อมูลหลุดแล้วต้องเอาไปเรียก API ไม่ได้ จึงเก็บได้แค่ค่าแฮช */
  test("ไม่เก็บตัวกุญแจลงฐานข้อมูล เก็บแค่แฮช", async () => {
    const { key } = await createApiKey("ระบบบัญชี", false, await admin());
    const row = ((await db.prepare("SELECT * FROM api_keys ORDER BY id DESC LIMIT 1").get()));
    assert.notEqual(row.key_hash, key);
    assert.ok(!JSON.stringify(row).includes(key.slice(11)), "ห้ามมีตัวกุญแจอยู่ในแถวเลย");
  });

  test("กุญแจที่ออกมาใช้เรียกได้จริง และบอกได้ว่าเป็นของระบบไหน", async () => {
    const { key } = await createApiKey("ERP", false, await admin());
    const caller = await verifyApiKey(key);
    assert.equal(caller.name, "ERP");
    assert.equal(caller.canWrite, false);
  });

  test("ติ๊กให้เขียนได้ = สร้างคำขอได้", async () => {
    const { key } = await createApiKey("ERP เขียนได้", true, await admin());
    assert.equal((await verifyApiKey(key)).canWrite, true);
  });

  test("กุญแจมั่ว ใช้ไม่ได้", async () => {
    assert.equal(await verifyApiKey("ia_ไม่มีจริง"), null);
    assert.equal(await verifyApiKey(""), null);
  });

  /** เพิกถอนต้องมีผลทันที ไม่ใช่รอหมดอายุ — กุญแจหลุดแล้วต้องปิดได้เดี๋ยวนั้น */
  test("เพิกถอนแล้วใช้ไม่ได้ทันที", async () => {
    const { id, key } = await createApiKey("ใบที่จะถอน", false, await admin());
    assert.ok(await verifyApiKey(key));
    await revokeApiKey(id);
    assert.equal(await verifyApiKey(key), null);
  });

  test("เพิกถอนแล้วยังอยู่ในรายการ — ประวัติการเรียกต้องตามได้", async () => {
    const { id } = await createApiKey("ใบเก่า", false, await admin());
    await revokeApiKey(id);
    assert.ok((await listApiKeys()).some((k) => k.id === id && k.active === 0));
  });

  test("นับจำนวนครั้งและเวลาที่เรียกล่าสุด", async () => {
    const { id, key } = await createApiKey("นับครั้ง", false, await admin());
    await verifyApiKey(key);
    await verifyApiKey(key);
    const row = (await listApiKeys()).find((k) => k.id === id);
    assert.equal(row.calls, 2);
    assert.ok(row.last_used_at);
  });

  test("กุญแจสองใบไม่ซ้ำกัน", async () => {
    assert.notEqual(newApiKey(), newApiKey());
  });
});

/**
 * ระบบปลายทางที่ตั้ง job ผิดยิงวนเป็นพันครั้งได้โดยไม่ตั้งใจ
 * SQLite ตัวเดียวรับงานของคนทั้งบริษัทอยู่ จะช้าไปด้วยกันหมด
 */
describe("จำกัดจำนวนครั้งต่อนาที", () => {
  test("เกินโควตาแล้วถูกปฏิเสธ", async () => {
    const t0 = 1_000_000;
    let ok = 0;
    for (let i = 0; i < 500; i++) if (rateLimit(9001, t0)) ok++;
    assert.ok(ok > 0 && ok < 500, `ควรผ่านบางส่วนแล้วตัน แต่ผ่าน ${ok}`);
  });

  test("ขึ้นนาทีใหม่แล้วเริ่มนับใหม่", async () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 500; i++) rateLimit(9002, t0);
    assert.equal(rateLimit(9002, t0 + 61_000), true);
  });

  test("กุญแจคนละใบไม่กินโควตากัน", async () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 500; i++) rateLimit(9003, t0);
    assert.equal(rateLimit(9004, t0), true);
  });
});
