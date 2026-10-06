const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { todayLocal } = require("../.test-build/lib/format.js");

/**
 * กันบั๊กที่เคยเกิด: ใช้ toISOString().slice(0,10) หาวันที่ "วันนี้"
 * ซึ่งคืนวันที่ตามเวลา UTC เสมอ เอกสารที่สร้างช่วงเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย
 * จึงถูกบันทึกเป็นวันที่ของเมื่อวาน
 *
 * เทสต์ตั้ง TZ ของ process ไม่ได้หลังบูตแล้ว จึงเทียบกับ Intl ที่ระบุเขตเวลาตรงๆ แทน
 */
describe("วันที่ของวันนี้ตามเขตเวลาเครื่อง", () => {
  const localDateVia = (d, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return parts; // en-CA ให้รูปแบบ YYYY-MM-DD อยู่แล้ว
  };

  test("ตรงกับวันที่ตามเขตเวลาของเครื่อง ไม่ใช่ของ UTC", async () => {
    const d = new Date();
    assert.equal(todayLocal(d), localDateVia(d, Intl.DateTimeFormat().resolvedOptions().timeZone));
  });

  test("ต้นชั่วโมงแรกของวันตามเวลาท้องถิ่นยังได้วันที่ของวันนั้น", async () => {
    // 00:30 ของวันท้องถิ่น — จุดที่สูตรแบบ UTC เคยให้วันที่ผิด
    const d = new Date();
    d.setHours(0, 30, 0, 0);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    assert.equal(todayLocal(d), expected);
  });

  test("เติมศูนย์หน้าเดือนและวันเสมอ", async () => {
    const d = new Date(2026, 0, 5, 12, 0, 0);
    assert.equal(todayLocal(d), "2026-01-05");
  });
});
