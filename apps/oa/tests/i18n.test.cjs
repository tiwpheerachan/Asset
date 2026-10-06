const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { MESSAGES } = require("../.test-build/lib/i18n/messages.js");
const T = require("../.test-build/lib/types.js");

const LOCALES = ["th", "en", "zh"];

/**
 * คำแปลที่ตกหล่นไม่มีทางรู้ตัวตอนเขียนโค้ด
 *
 * makeT ออกแบบให้คืน "ตัวคีย์" กลับมาเมื่อหาคำแปลไม่เจอ ซึ่งดีกว่าพังทั้งหน้า
 * แต่แลกมาด้วยการที่มันพังเงียบ — ไม่มี error ไม่มี warning
 * เคยเกิดมาแล้วจริง: เพิ่มชนิดฟิลด์ REQUEST แล้วลืมเติมคำแปล
 * เมนูเลือกชนิดคำถามบน production จึงขึ้นว่า "fieldType.REQUEST" อยู่หลายวัน
 *
 * เทสต์นี้ไล่จากตัวเลือกที่มีจริงในระบบไปหาคำแปล ไม่ใช่ทางกลับ —
 * เพิ่มตัวเลือกใหม่แล้วลืมแปล เทสต์ต้องแดงทันทีตั้งแต่ยังไม่ deploy
 */
const GROUPS = [
  ["fieldType", T.FIELD_TYPES],
  ["colType", T.COLUMN_TYPES],
  ["fieldRole", Object.keys(T.FIELD_ROLE_LABEL)],
  ["jobRole", T.JOB_ROLES],
  ["role", T.ROLES],
  ["status", Object.keys(T.STATUS_LABEL)],
  ["stage", Object.keys(T.STAGE_LABEL)],
  ["admin.forms.signature", T.SIGNATURE_MODES],
];

describe("ความครบถ้วนของคำแปล", () => {
  for (const [prefix, members] of GROUPS) {
    test(`${prefix}.* มีครบทุกตัวเลือก (${members.length} ตัว)`, async () => {
      const missing = members.filter((m) => !MESSAGES[`${prefix}.${m}`]);
      assert.deepEqual(missing, [], `ขาดคำแปล: ${missing.map((m) => `${prefix}.${m}`).join(", ")}`);
    });
  }

  test("ทุกคีย์ต้องมีครบทั้ง 3 ภาษา และไม่มีค่าว่าง", async () => {
    const bad = [];
    for (const [key, entry] of Object.entries(MESSAGES)) {
      for (const loc of LOCALES) {
        if (typeof entry[loc] !== "string" || entry[loc].trim() === "") bad.push(`${key}.${loc}`);
      }
    }
    assert.deepEqual(bad, [], `คำแปลว่างหรือขาด: ${bad.slice(0, 10).join(", ")}`);
  });

  test("ไม่มีคำแปลที่เผลอปล่อยให้เป็นตัวคีย์เอง", async () => {
    const echoed = Object.entries(MESSAGES)
      .filter(([key, entry]) => LOCALES.some((loc) => entry[loc] === key))
      .map(([key]) => key);
    assert.deepEqual(echoed, []);
  });
});
