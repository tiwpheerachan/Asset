const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers.cjs");
const { nextDocNo, nextSeq } = require("../.test-build/lib/queries.js");

/**
 * เดินเลขเอกสารเมื่อหลายคนกดพร้อมกัน
 *
 * ที่มา: เดิมเดินเลขด้วย "อ่านเลขสูงสุดแล้วบวกหนึ่ง" สองคนที่กดพร้อมกันจะอ่านค่า
 * เดียวกันแล้วได้เลขซ้ำ ชนข้อจำกัด UNIQUE ของ requests.doc_no
 * การใส่ไว้ใน transaction ไม่ได้ช่วย เพราะระดับการแยกกันเริ่มต้นของ Postgres
 * (READ COMMITTED) ยอมให้สองธุรกรรมอ่านค่าเดิมได้พร้อมกัน
 */
describe("เดินเลขเอกสารพร้อมกันหลายคน", () => {
  const tpl = { code: "MANPOWER", doc_prefix: "MPRQ" };
  const day = new Date("2026-09-20T03:00:00Z");

  before(async () => {
    await h.wipe();
    await h.db.prepare("DELETE FROM doc_counters").run();
  });

  test("ยิงพร้อมกัน 25 ครั้ง ต้องไม่มีเลขซ้ำเลย", async () => {
    const nos = await Promise.all(
      Array.from({ length: 25 }, () => nextDocNo(tpl, day)),
    );
    assert.equal(new Set(nos).size, 25, `มีเลขซ้ำ: ${nos.join(", ")}`);
    for (const n of nos) assert.match(n, /^AP-MPRQ-202609-\d{4}$/);
  });

  test("ลำดับเดินต่อเนื่องไม่ขาดช่วง", async () => {
    await h.db.prepare("DELETE FROM doc_counters").run();
    const nos = await Promise.all(Array.from({ length: 10 }, () => nextDocNo(tpl, day)));
    const seq = nos.map((n) => Number(n.slice(-4))).sort((a, b) => a - b);
    assert.deepEqual(seq, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("ชุดเลขคนละฟอร์มเดินแยกกัน", async () => {
    await h.db.prepare("DELETE FROM doc_counters").run();
    const a = await nextDocNo({ code: "AAA", doc_prefix: "AAAA" }, day);
    const b = await nextDocNo({ code: "BBB", doc_prefix: "BBBB" }, day);
    assert.ok(a.endsWith("0001") && b.endsWith("0001"), `${a} · ${b}`);
  });

  test("คนละเดือนเริ่มนับหนึ่งใหม่", async () => {
    await h.db.prepare("DELETE FROM doc_counters").run();
    const sep = await nextDocNo(tpl, new Date("2026-09-20T03:00:00Z"));
    const oct = await nextDocNo(tpl, new Date("2026-10-01T03:00:00Z"));
    assert.ok(sep.startsWith("AP-MPRQ-202609-"), sep);
    assert.ok(oct.startsWith("AP-MPRQ-202610-") && oct.endsWith("0001"), oct);
  });

  test("ตัวนับไล่ตามเอกสารที่เกิดนอกทางนี้ (เช่นข้อมูลนำเข้าหรือแก้ด้วยมือ)", async () => {
    await h.db.prepare("DELETE FROM doc_counters").run();
    const first = await nextDocNo(tpl, day);
    assert.ok(first.endsWith("0001"), first);

    // จำลองแถวที่ถูกใส่เลขเองโดยไม่ผ่านตัวนับ
    const dept = await h.makeDept();
    const u = await h.makeUser({ deptId: dept });
    const t = await h.makeTemplate();
    const rid = await h.makeRequest({ templateId: t, requesterId: u.id, status: "DRAFT" });
    await h.db.prepare("UPDATE requests SET doc_no='AP-MPRQ-202609-0050' WHERE id=?").run(rid);

    const next = await nextDocNo(tpl, day);
    assert.equal(next, "AP-MPRQ-202609-0051", "ต้องข้ามไปต่อจากเลขที่ใช้ไปแล้ว");
  });

  test("nextSeq ไม่ถอยหลังแม้ floor ต่ำกว่าค่าปัจจุบัน", async () => {
    await h.db.prepare("DELETE FROM doc_counters").run();
    assert.equal(await nextSeq("TEST", "202609", 10), 10);
    assert.equal(await nextSeq("TEST", "202609", 1), 11);
    assert.equal(await nextSeq("TEST", "202609", 1), 12);
  });
});
