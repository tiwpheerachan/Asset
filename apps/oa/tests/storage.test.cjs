const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { putFile, getFile, deleteFile, hasFile, usingS3, storageLabel } =
  require("../.test-build/lib/storage.js");
const { UPLOAD_DIR } = require("../.test-build/lib/pg.js");

/**
 * เทสต์ชุดนี้รันในโหมดดิสก์ (ไม่ได้ตั้ง S3_BUCKET) — ซึ่งเป็นโหมดที่ต้องทำงานได้เสมอ
 * เพราะเป็นทางถอยเมื่อ S3 มีปัญหา และเป็นโหมดที่เครื่องพัฒนาใช้
 */
describe("ที่เก็บไฟล์ที่ผู้ใช้อัปโหลด", () => {
  test("ไม่ได้ตั้งค่า S3 = ใช้ดิสก์", () => {
    assert.equal(usingS3, false);
    assert.equal(storageLabel(), UPLOAD_DIR);
  });

  test("เขียนแล้วอ่านกลับได้เนื้อเดิม", async () => {
    const name = `t-${process.hrtime.bigint()}.txt`;
    const body = Buffer.from("เนื้อไฟล์ทดสอบ ภาษาไทย", "utf8");
    await putFile(name, body, "text/plain");
    assert.deepEqual(await getFile(name), body);
    await deleteFile(name);
  });

  test("ไฟล์ที่ไม่มี คืน null ไม่ใช่โยน error", async () => {
    assert.equal(await getFile("ไม่มีไฟล์นี้จริง.pdf"), null);
  });

  test("ลบแล้วอ่านไม่เจอ", async () => {
    const name = `t-${process.hrtime.bigint()}.bin`;
    await putFile(name, Buffer.from([1, 2, 3]), "application/octet-stream");
    assert.equal(await hasFile(name), true);
    await deleteFile(name);
    assert.equal(await hasFile(name), false);
    assert.equal(await getFile(name), null);
  });

  test("ลบไฟล์ที่ไม่มีอยู่ ต้องไม่พัง", async () => {
    await deleteFile("ไม่เคยมี.txt");
  });

  /**
   * ชื่อไฟล์มาจากฐานข้อมูล แต่ถ้าวันหนึ่งมีทางให้ผู้ใช้กำหนดชื่อได้
   * การไต่พาธต้องไม่พาออกนอกที่เก็บไปอ่านไฟล์อื่นของเครื่อง
   */
  test("ชื่อที่ไต่พาธออกนอกที่เก็บ ต้องถูกตัดให้เหลือชื่อไฟล์", async () => {
    const secret = path.join(UPLOAD_DIR, "..", "ไม่ควรอ่านได้.txt");
    fs.writeFileSync(secret, "ความลับ");
    try {
      assert.equal(await getFile("../ไม่ควรอ่านได้.txt"), null);
      assert.equal(await getFile("/etc/passwd"), null);
      assert.equal(fs.existsSync(secret), true, "ไฟล์นอกที่เก็บต้องไม่ถูกแตะ");
    } finally {
      fs.rmSync(secret, { force: true });
    }
  });

  test("เขียนด้วยชื่อที่มีพาธนำหน้า ต้องลงในที่เก็บเท่านั้น", async () => {
    const name = `t-${process.hrtime.bigint()}.txt`;
    await putFile(`../../${name}`, Buffer.from("x"), "text/plain");
    assert.equal(fs.existsSync(path.join(UPLOAD_DIR, name)), true);
    await deleteFile(name);
  });
});
