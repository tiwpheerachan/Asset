const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/** ไฟล์ .tsx ทั้งหมดใน src */
function tsxFiles(dir = "src", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = tsxFiles().map((f) => ({ f, src: fs.readFileSync(f, "utf8") }));

/**
 * กติกาการเข้าถึงที่ตรวจจากตัวโค้ดได้ตรง ๆ
 *
 * ไม่ได้แทนการทดสอบกับโปรแกรมอ่านหน้าจอจริง แต่กันความถดถอยแบบที่เกิดง่ายที่สุด:
 * เพิ่มปุ่มไอคอนใหม่แล้วลืมใส่ชื่อ · เพิ่มตารางแล้วลืม scope · เอา skip link ออก
 * ของพวกนี้ไม่มีใครสังเกตเห็นตอนรีวิว เพราะหน้าตาไม่ได้เปลี่ยนอะไรเลย
 */
describe("การเข้าถึง (accessibility)", () => {
  test("หัวตารางทุกตัวต้องระบุ scope — ไม่งั้นอ่านทีละแถวแล้วไม่รู้ว่าค่าไหนของคอลัมน์ไหน", async () => {
    const bad = [];
    for (const { f, src } of FILES) {
      const opens = src.match(/<th(?![\w-])[^>]*>/g) ?? [];
      for (const tag of opens) if (!tag.includes("scope=")) bad.push(`${f} → ${tag.slice(0, 60)}`);
    }
    assert.deepEqual(bad, []);
  });

  test("ปุ่มที่มีแต่ไอคอนต้องมีชื่อให้โปรแกรมอ่านหน้าจอ", async () => {
    const bad = [];
    for (const { f, src } of FILES) {
      // ดูเฉพาะแท็ก <button ...> ที่ใส่คลาส btn-icon ไว้
      const tags = src.match(/<button[^>]*btn-icon[^>]*>/g) ?? [];
      for (const tag of tags) {
        if (!tag.includes("aria-label") && !tag.includes("aria-labelledby")) {
          bad.push(`${f} → ${tag.replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  test("ต้องมีลิงก์ข้ามไปเนื้อหาหลัก และมีปลายทางรับจริง", async () => {
    const shell = FILES.find((x) => x.f.endsWith("AppShell.tsx"));
    assert.ok(shell, "ไม่พบ AppShell.tsx");
    assert.match(shell.src, /href="#main"/);
    assert.match(shell.src, /id="main"/);
    // ไม่ใส่ tabIndex ปลายทาง โฟกัสจะไม่ย้ายตาม แค่เลื่อนจอเฉย ๆ
    assert.match(shell.src, /tabIndex=\{-1\}/);
  });

  test("ข้อความผิดพลาดต้องประกาศแบบ assertive ไม่ใช่รอจังหวะ", async () => {
    const ui = FILES.find((x) => x.f.endsWith("components/ui.tsx"));
    assert.ok(ui);
    assert.match(ui.src, /role=\{error \? "alert" : "status"\}/);
  });

  test("CSS ส่วนกลางต้องมี sr-only และเคารพการลดการเคลื่อนไหว", async () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    assert.match(css, /\.sr-only\s*\{/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });
});
