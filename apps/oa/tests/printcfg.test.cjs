const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePrintConfig,
  serialisePrintConfig,
  sheetSize,
  PRINT_DEFAULTS,
} = require("../.test-build/lib/print.js");

/**
 * ค่าตั้งค่าการพิมพ์มาจากฟอร์มที่ผู้ดูแลกรอกเอง และเก็บเป็น JSON ดิบในฐานข้อมูล
 * ค่าที่เพี้ยนจึงเข้ามาได้เสมอ — ถ้าไม่กันไว้ กระดาษกว้าง 0 มม. หรือตัวอักษร 900px
 * จะทำให้เอกสารพิมพ์ออกมาใช้ไม่ได้โดยไม่มีอะไรฟ้อง
 */
describe("ตั้งค่าการพิมพ์", () => {
  test("ไม่มีค่าเก็บไว้ = ใช้ค่ามาตรฐานทั้งชุด", async () => {
    assert.deepEqual(parsePrintConfig("{}"), PRINT_DEFAULTS);
    assert.deepEqual(parsePrintConfig(""), PRINT_DEFAULTS);
    assert.deepEqual(parsePrintConfig(null), PRINT_DEFAULTS);
  });

  test("JSON เสียก็ยังใช้งานได้ ไม่โยน error", async () => {
    assert.deepEqual(parsePrintConfig("{ไม่ใช่ json"), PRINT_DEFAULTS);
    assert.deepEqual(parsePrintConfig("[1,2,3]"), PRINT_DEFAULTS);
  });

  test("ตั้งไว้ครึ่งเดียว อีกครึ่งได้ค่ามาตรฐาน ไม่ทิ้งทั้งก้อน", async () => {
    const cfg = parsePrintConfig('{"paper":"A5","fontSize":12}');
    assert.equal(cfg.paper, "A5");
    assert.equal(cfg.fontSize, 12);
    assert.equal(cfg.margin, PRINT_DEFAULTS.margin);
    assert.equal(cfg.signPerRow, PRINT_DEFAULTS.signPerRow);
  });

  test("ค่านอกช่วงถูกบีบกลับเข้าช่วง ไม่ใช่ถูกทิ้ง", async () => {
    assert.equal(parsePrintConfig('{"margin":999}').margin, 40);
    assert.equal(parsePrintConfig('{"margin":-5}').margin, 0);
    assert.equal(parsePrintConfig('{"fontSize":900}').fontSize, 22);
    assert.equal(parsePrintConfig('{"fontSize":1}').fontSize, 10);
  });

  test("ค่าที่ไม่ใช่ตัวเลขตกกลับไปใช้ค่ามาตรฐาน", async () => {
    assert.equal(parsePrintConfig('{"margin":"กว้างๆ"}').margin, PRINT_DEFAULTS.margin);
    assert.equal(parsePrintConfig('{"fontSize":null}').fontSize, PRINT_DEFAULTS.fontSize);
  });

  test("ขนาดกระดาษและจำนวนช่องลงนามรับเฉพาะค่าที่รองรับ", async () => {
    assert.equal(parsePrintConfig('{"paper":"A3"}').paper, "A4");
    assert.equal(parsePrintConfig('{"signPerRow":7}').signPerRow, 2);
    assert.equal(parsePrintConfig('{"signPerRow":3}').signPerRow, 3);
  });

  test("แสดงหัวกระดาษเป็นค่าเริ่มต้น ปิดได้เฉพาะเมื่อสั่ง false ชัดๆ", async () => {
    assert.equal(parsePrintConfig("{}").showCompany, true);
    assert.equal(parsePrintConfig('{"showCompany":false}').showCompany, false);
  });

  test("ข้อความปิดท้ายยาวเกินถูกตัด ไม่ให้ดันเอกสารพัง", async () => {
    const long = "ก".repeat(500);
    assert.equal(parsePrintConfig(JSON.stringify({ closing: long })).closing.length, 300);
  });

  test("แนวนอนสลับด้านกว้างกับด้านสูง", async () => {
    const portrait = sheetSize(parsePrintConfig('{"paper":"A4"}'));
    assert.deepEqual(portrait, { width: 210, height: 297 });
    const landscape = sheetSize(parsePrintConfig('{"paper":"A4","orientation":"landscape"}'));
    assert.deepEqual(landscape, { width: 297, height: 210 });
  });

  test("บันทึกแล้วอ่านกลับได้ค่าเดิม", async () => {
    const cfg = parsePrintConfig('{"paper":"LETTER","orientation":"landscape","margin":8,"fontSize":13,"showCompany":false,"closing":"ขอแสดงความนับถือ","signPerRow":4}');
    assert.deepEqual(parsePrintConfig(serialisePrintConfig(cfg)), cfg);
  });
});
