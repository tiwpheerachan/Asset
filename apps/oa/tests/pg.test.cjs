const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");

const { db, convert } = require("../.test-build/lib/pg.js");

describe("แปลงรูปแบบตัวแปรจาก SQLite เป็น Postgres", () => {
  test("? เรียงเป็น $1 $2 ตามลำดับ", async () => {
    const q = convert("SELECT * FROM users WHERE id = ? AND active = ?");
    assert.equal(q.text, "SELECT * FROM users WHERE id = $1 AND active = $2");
  });

  test("@ชื่อ เดียวกันที่ใช้ซ้ำ ใช้เลขเดิม", async () => {
    const q = convert("WHERE a = @uid OR b = @uid OR c = @dept");
    assert.equal(q.text, "WHERE a = $1 OR b = $1 OR c = $2");
    assert.deepEqual(q.names, ["uid", "dept"]);
  });

  /** ถ้าแทนของในเครื่องหมายคำพูดด้วย SQL จะเปลี่ยนความหมายโดยไม่มี error ให้เห็น */
  test("? ที่อยู่ในข้อความ ไม่ใช่ตัวแปร", async () => {
    const q = convert("SELECT * FROM t WHERE note = 'ทำไม?' AND id = ?");
    assert.equal(q.text, "SELECT * FROM t WHERE note = 'ทำไม?' AND id = $1");
    assert.equal(q.names.length, 1);
  });

  test("@ ที่อยู่ในข้อความ ไม่ใช่ตัวแปร", async () => {
    const q = convert("WHERE email = 'a@b.co' AND id = @uid");
    assert.equal(q.text, "WHERE email = 'a@b.co' AND id = $1");
    assert.deepEqual(q.names, ["uid"]);
  });

  test("ชื่อคอลัมน์ในอัญประกาศคู่ไม่ถูกแตะ", async () => {
    const q = convert(`INSERT INTO backups ("trigger") VALUES (?)`);
    assert.equal(q.text, `INSERT INTO backups ("trigger") VALUES ($1)`);
    assert.equal(q.insertInto, "backups");
  });

  test("หมายเหตุ -- ไม่ถูกแตะ", async () => {
    const q = convert("SELECT 1 -- ใครนะ? @who\nWHERE id = ?");
    assert.match(q.text, /-- ใครนะ\? @who/);
    assert.match(q.text, /WHERE id = \$1/);
  });

  test("จับชื่อตารางที่ INSERT เพื่อรู้ว่าขอ id คืนได้ไหม", async () => {
    assert.equal(convert("INSERT INTO app_meta (key) VALUES (?)").insertInto, "app_meta");
    assert.equal(convert("  insert into  users (email) values (?)").insertInto, "users");
    assert.equal(convert("SELECT 1").insertInto, "");
  });
});

describe("คุยกับ Postgres จริง", () => {
  test("สร้างตารางให้เองตอนเรียกครั้งแรก", async () => {
    const r = (await db.prepare("SELECT COUNT(*) AS n FROM users").get());
    assert.equal(typeof r.n, "number", "COUNT ต้องเป็นตัวเลข ไม่ใช่สตริง");
  });

  test("INSERT คืน id กลับมาเหมือน lastInsertRowid", async () => {
    const r = await db
      .prepare("INSERT INTO departments (name) VALUES (?)")
      .run("แผนกทดสอบ-" + process.hrtime.bigint());
    assert.equal(r.changes, 1);
    assert.ok(r.lastInsertRowid > 0, "ต้องได้ id ของแถวใหม่");
  });

  test("ตารางที่ไม่มีคอลัมน์ id ก็ INSERT ได้ ไม่พังเพราะไปขอ RETURNING id", async () => {
    const r = await db
      .prepare("INSERT INTO app_meta (key, value) VALUES (?,?) ON CONFLICT (key) DO NOTHING")
      .run("test_flag", "1");
    assert.equal(r.lastInsertRowid, 0);
  });

  test("named parameter ที่ใช้ซ้ำ ส่งค่าชุดเดียวก็พอ", async () => {
    const name = "แผนกซ้ำ-" + process.hrtime.bigint();
    (await db.prepare("INSERT INTO departments (name) VALUES (@n)").run({ n: name }));
    const row = await db
      .prepare("SELECT name FROM departments WHERE name = @n OR name = @n")
      .get({ n: name });
    assert.equal(row.name, name);
  });

  /** ถ้า transaction ไม่ได้ใช้ connection เดียวกัน ROLLBACK จะย้อนได้แค่บางส่วน */
  test("transaction ล้มเหลว = ไม่มีอะไรถูกบันทึกเลย", async () => {
    const a = "แผนกก่อนพัง-" + process.hrtime.bigint();
    await assert.rejects(
      db.transaction(async () => {
        (await db.prepare("INSERT INTO departments (name) VALUES (?)").run(a));
        throw new Error("จำลองว่าพังกลางทาง");
      })(),
    );
    const row = (await db.prepare("SELECT id FROM departments WHERE name = ?").get(a));
    assert.equal(row, undefined, "แถวที่ใส่ก่อนพังต้องถูกย้อนคืน");
  });

  test("transaction สำเร็จ = บันทึกครบทุกคำสั่ง", async () => {
    const a = "แผนกสำเร็จ-" + process.hrtime.bigint();
    await db.transaction(async () => {
      (await db.prepare("INSERT INTO departments (name) VALUES (?)").run(a));
    })();
    const row = (await db.prepare("SELECT name FROM departments WHERE name = ?").get(a));
    assert.equal(row.name, a);
  });

  /**
   * ที่มา: แอปสองตัวบูตพร้อมกัน (เกิดทุกครั้งที่เปลี่ยนรุ่นบน Render) ต่างก็เห็นว่า
   * "ยังไม่ได้ใส่ข้อมูลตั้งต้น" แล้วใส่แม่แบบชุดเดียวกันซ้ำ จนชนกับ UNIQUE ของ code
   * แล้วแอปล้มตอนบูต — ให้ฐานข้อมูลเป็นคนตัดสินว่าใครได้สิทธิ์ใส่
   */
  test("จองสิทธิ์ใส่ข้อมูลตั้งต้น — พร้อมกันกี่ตัวก็ได้แค่ตัวเดียว", async () => {
    const key = "claim_probe_" + process.hrtime.bigint();
    const claim = () =>
      db
        .prepare(
          `INSERT INTO app_meta (key, value) VALUES (?, '1')
           ON CONFLICT (key) DO NOTHING RETURNING key`,
        )
        .get(key);

    const winners = (await Promise.all([claim(), claim(), claim(), claim()])).filter(Boolean);
    assert.equal(winners.length, 1, "ต้องมีผู้ได้สิทธิ์เพียงรายเดียว");

    await db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
  });

  after(async () => {
    (await db.prepare("DELETE FROM departments WHERE name LIKE ?").run("แผนก%-%"));
    (await db.prepare("DELETE FROM app_meta WHERE key = ?").run("test_flag"));
    await db.close();
  });
});
