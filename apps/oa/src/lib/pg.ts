import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * ชั้นเชื่อมต่อ PostgreSQL ที่ทำหน้าตาเลียนแบบ better-sqlite3
 *
 * ทำไมต้องเลียนแบบ: ระบบมีคำสั่ง SQL อยู่ 278 จุดที่เขียนแบบ `db.prepare(sql).get(a,b)`
 * ถ้าเปลี่ยนไปใช้หน้าตาของไดรเวอร์ pg ตรง ๆ ต้องแก้ทุกจุด ซึ่งเป็นการเปิดช่องให้พิมพ์ผิด
 * 278 ครั้งโดยไม่ได้อะไรกลับมา — เลียนแบบหน้าตาเดิมแล้วเติมแค่ `await` จึงปลอดภัยกว่ามาก
 *
 * สิ่งที่ต่างจากเดิมอย่างเดียวคือทุกคำสั่งกลายเป็น Promise — เพราะการคุยกับ Postgres
 * ต้องข้ามเครือข่าย ไม่เหมือน SQLite ที่อ่านไฟล์ในเครื่องเดียวกันแล้วได้คำตอบทันที
 */

/* ---------- ชนิดที่ต้องบอกไดรเวอร์ให้แปลงกลับเป็นตัวเลข ---------- */

// COUNT(*) ของ Postgres เป็น BIGINT ซึ่งไดรเวอร์คืนมาเป็น "สตริง" ตามค่าเริ่มต้น
// (เพราะ BIGINT ใหญ่เกิน number ของ JS) — แต่ระบบนี้นับเอกสารหลักพัน ไม่ใช่หลักล้านล้าน
// ถ้าไม่แปลง โค้ดที่เขียน `row.n + 1` จะได้ "51" แทน 6 โดยไม่มีใครเห็น error
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// NUMERIC ก็คืนเป็นสตริงเหมือนกัน — ระบบนี้ใช้ DOUBLE PRECISION กับเงิน จึงเผื่อไว้เท่านั้น
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

/* ---------- การเชื่อมต่อ ---------- */

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "schema.pg.sql");

/** กุญแจล็อกสำหรับขั้นสร้างโครง — เลขอะไรก็ได้ ขอแค่ทั้งระบบใช้ตัวเดียวกัน */
const SCHEMA_LOCK = "727274";

function poolConfig(): pg.PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "ไม่ได้ตั้ง DATABASE_URL — ระบบต่อฐานข้อมูลไม่ได้\n" +
        "ตัวอย่างในเครื่อง: postgresql://localhost:5432/approve_dev",
    );
  }

  // Supabase และผู้ให้บริการส่วนใหญ่บังคับ TLS แต่ใช้ใบรับรองของ CA ตัวเองที่ Node
  // ไม่รู้จัก — ปิดการตรวจสอบใบรับรองเฉพาะกรณีที่ระบุไว้ชัดเจนเท่านั้น
  const ssl =
    /sslmode=disable/.test(connectionString) || /localhost|127\.0\.0\.1/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: false };

  return {
    connectionString,
    ssl,
    // Next dev สร้าง connection ใหม่ทุกครั้งที่รีโหลดโมดูล และ Supabase pooler
    // จำกัดจำนวนการเชื่อมต่อต่อโปรเจกต์ — เพดานต่ำ ๆ ปลอดภัยกว่าปล่อยตามค่าเริ่มต้น
    max: Number(process.env.PGPOOL_MAX || 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };
}

// Next dev รีโหลดโมดูลบ่อย — เก็บ pool ไว้บน globalThis กัน connection รั่วจนเต็มโควตา
const g = globalThis as unknown as {
  __pgPool?: pg.Pool;
  __pgSchema?: Promise<void>;
  __pgReady?: Promise<void>;
};

/**
 * สร้างการเชื่อมต่อตอนถูกใช้จริง ไม่ใช่ตอนโหลดโมดูล
 *
 * ตอน `next build` ตัว Next จะโหลดโมดูลฝั่งเซิร์ฟเวอร์ขึ้นมาสำรวจว่าแต่ละหน้าต้องการ
 * อะไรบ้าง — ซึ่งเกิดในขั้นสร้าง Docker image ที่ยังไม่มี DATABASE_URL (ค่า env ของ
 * service มีตอนรันเท่านั้น) ถ้าสร้าง pool ตั้งแต่ตอนโหลด โมดูลจะโยน error แล้ว build
 * ล้มทั้งที่ยังไม่มีใครเรียกฐานข้อมูลสักครั้ง
 */
function pool(): pg.Pool {
  if (g.__pgPool) return g.__pgPool;
  const p = new pg.Pool(poolConfig());
  p.on("error", (e) => console.error("[pg] connection พัง", e.message));
  g.__pgPool = p;
  return p;
}

/* ---------- การเตรียมฐานข้อมูลครั้งแรก ---------- */

/**
 * สร้างตารางให้ครบก่อนใช้งานครั้งแรก
 *
 * ต่างจาก SQLite เดิมที่เปิดไฟล์แล้วเตรียมโครงได้ทันทีแบบซิงโครนัส — ที่นี่ต้องรอ
 * เครือข่าย จึงทำเป็น Promise ที่ทุกคำสั่งรอครั้งเดียวร่วมกัน (ไม่ใช่คำสั่งละครั้ง)
 */
function prepareDatabase(): Promise<void> {
  return (async () => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
    const client = await pool().connect();
    try {
      /*
       * กันสองกระบวนการสร้างโครงพร้อมกัน
       *
       * CREATE OR REPLACE FUNCTION ที่ชนกันจะได้ error "tuple concurrently updated"
       * ซึ่งทำให้แอปที่เพิ่งเปิดล้มทั้งตัว — เกิดได้จริงตอนเปลี่ยนรุ่นแล้วมี instance
       * เก่าใหม่ทับกันชั่วครู่
       *
       * ใช้ล็อกแบบผูกกับ transaction (xact) ไม่ใช่แบบผูกกับ session เพราะเมื่อต่อผ่าน
       * connection pooler ของ Supabase หนึ่ง "session" ไม่ได้อยู่กับเราตลอด — คำสั่ง
       * ปลดล็อกอาจไปลงคนละ backend กับคำสั่งที่ล็อกไว้ แล้วล็อกค้างถาวร
       * ทำให้แอปเปิดไม่ขึ้นอีกเลยและหาสาเหตุยากมาก
       *
       * ล็อกแบบ xact ปลดเองเมื่อจบ transaction เสมอ ไม่ว่าจะสำเร็จหรือพัง
       * และ transaction รับประกันว่าอยู่ backend เดียวกันทั้งก้อน
       * (DDL ของ Postgres อยู่ใน transaction ได้ ต่างจากฐานข้อมูลบางตัว)
       */
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [SCHEMA_LOCK]);
        await client.query(sql);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      }
    } finally {
      client.release();
    }
  })();
}

/**
 * งานที่ต้องทำต่อหลังสร้างตารางเสร็จ — db.ts มาลงทะเบียนการใส่ข้อมูลตั้งต้นไว้ที่นี่
 *
 * แยกเป็นสองขั้นเพราะโค้ดใส่ข้อมูลตั้งต้นก็เรียก db.prepare() เหมือนกัน ถ้าให้มันรอ
 * "เตรียมฐานข้อมูลให้เสร็จ" ทั้งก้อน มันจะรอ Promise ที่ตัวมันเองเป็นส่วนหนึ่งอยู่ = ค้างตลอด
 * ขั้นแรกรอแค่ตาราง ขั้นสองคือใส่ข้อมูล — คำสั่งที่ยิงจากข้างในขั้นสองรอแค่ขั้นแรก
 */
let afterSchema: (() => Promise<void>) | null = null;
export function onSchemaReady(fn: () => Promise<void>) {
  afterSchema = fn;
}

const booting = new AsyncLocalStorage<true>();

function schemaReady(): Promise<void> {
  return (g.__pgSchema ??= prepareDatabase());
}

function ready(): Promise<void> {
  return (g.__pgReady ??= schemaReady().then(() =>
    booting.run(true, async () => {
      if (afterSchema) await afterSchema();
    }),
  ));
}

/* ---------- แปลงรูปแบบตัวแปรจาก SQLite เป็น Postgres ---------- */

const NO_ID_TABLES = new Set(["app_meta", "sessions"]);

type Converted = { text: string; names: string[]; insertInto: string };

/**
 * แปลง `?` และ `@ชื่อ` ให้เป็น `$1 $2 ...` ตามที่ Postgres ต้องการ
 *
 * ต้องเดินอ่านทีละตัวอักษร ไม่ใช่ใช้ replace ทั้งก้อน เพราะ `?` หรือ `@` ที่อยู่
 * ข้างในเครื่องหมายคำพูด (เช่นค่า default `'[]'` หรือข้อความค้นหา) ไม่ใช่ตัวแปร
 * ถ้าแทนไปด้วยจะกลายเป็น SQL ที่ความหมายเปลี่ยนโดยไม่มี error ให้เห็น
 *
 * ชื่อเดียวกันที่โผล่หลายครั้งใช้เลขเดิม — SQL หลายจุดในระบบอ้าง @uid สามสี่ครั้ง
 * ในคำสั่งเดียว และผู้เรียกส่งค่ามาเป็นอ็อบเจกต์ชุดเดียว
 */
function convert(sql: string): Converted {
  let out = "";
  let n = 0;
  const names: string[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    // ข้ามข้อความในเครื่องหมายคำพูด — เนื้อในไม่ใช่ตัวแปร
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) j += 2; // '' คือเครื่องหมายคำพูดตัวจริงในข้อความ
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j;
      continue;
    }

    // ข้ามหมายเหตุ -- ถึงท้ายบรรทัด
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }

    // ข้ามหมายเหตุ /* ... */
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }

    if (c === "?") {
      names.push("");
      out += `$${++n}`;
      continue;
    }

    if (c === "@" && /[a-zA-Z_]/.test(sql[i + 1] ?? "")) {
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const name = sql.slice(i + 1, j);
      const at = seen.get(name);
      if (at) {
        out += `$${at}`;
      } else {
        seen.set(name, ++n);
        names.push(name);
        out += `$${n}`;
      }
      i = j - 1;
      continue;
    }

    out += c;
  }

  const m = /^\s*INSERT\s+INTO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(sql);
  return { text: out, names, insertInto: m ? m[1].toLowerCase() : "" };
}

/* ---------- ตัวส่งคำสั่ง ---------- */

// ระหว่างอยู่ใน transaction ทุกคำสั่งต้องวิ่งผ่าน client ตัวเดียวกัน ไม่ใช่หยิบจาก pool
// ใหม่ทุกครั้ง — ไม่งั้นคำสั่งที่ควรอยู่ในรายการเดียวกันจะกระจายไปหลาย connection
// และ ROLLBACK ก็ย้อนได้แค่บางส่วน AsyncLocalStorage ทำให้ db.prepare() ที่เรียก
// อยู่ข้างในรู้เองว่าต้องใช้ client ไหน โดยผู้เรียกไม่ต้องส่งต่อให้
const txClient = new AsyncLocalStorage<pg.PoolClient>();

async function exec(text: string, values: unknown[]): Promise<pg.QueryResult> {
  await (booting.getStore() ? schemaReady() : ready());
  const client = txClient.getStore();
  if (client) return client.query(text, values);
  return pool().query(text, values);
}

/** จัดค่าที่ผู้เรียกส่งมาให้เรียงตรงกับ $1 $2 ... */
function bind(names: string[], args: unknown[]): unknown[] {
  // คำสั่งที่ไม่มีตัวแปรเลย ต้องไม่ส่งค่าไปด้วย ไม่ว่าผู้เรียกจะส่งมาหรือไม่
  //
  // เกิดจริงกับคำสั่งที่ประกอบเงื่อนไขตามสิทธิ์ของผู้ใช้: ผู้ดูแลเห็นทุกใบจึงไม่มี
  // เงื่อนไขเหลือเลย แต่จุดเรียกยังส่งชุดพารามิเตอร์เดิมมาเสมอ — SQLite ไม่ว่าอะไร
  // แต่ Postgres ปฏิเสธทั้งคำสั่ง ทำให้หน้ารายการของผู้ดูแลพังทั้งหน้า
  if (names.length === 0) return [];

  const named = names.some((s) => s !== "");
  if (!named) return args;

  const obj = (args[0] ?? {}) as Record<string, unknown>;
  return names.map((name) => {
    const v = obj[name];
    // undefined ทำให้ไดรเวอร์ pg โยน error ที่อ่านไม่รู้เรื่อง — แปลงเป็น null ให้ตรง
    // กับพฤติกรรมเดิมของ better-sqlite3 ที่ถือว่าไม่ได้ส่งค่ามา = NULL
    return v === undefined ? null : v;
  });
}

export type RunResult = { changes: number; lastInsertRowid: number };

export type Statement = {
  get<T = Record<string, unknown>>(...args: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...args: unknown[]): Promise<T[]>;
  run(...args: unknown[]): Promise<RunResult>;
};

function prepare(sql: string): Statement {
  const q = convert(sql);

  // Postgres ไม่มี lastInsertRowid — ต้องขอ id กลับมาตอน INSERT ด้วย RETURNING
  // ตารางที่ไม่มีคอลัมน์ id (app_meta, sessions) ขอไม่ได้ จึงต้องแยกออก
  const wantsId =
    q.insertInto !== "" && !NO_ID_TABLES.has(q.insertInto) && !/\bRETURNING\b/i.test(q.text);
  const runText = wantsId ? `${q.text} RETURNING id` : q.text;

  return {
    async get<T>(...args: unknown[]) {
      const r = await exec(q.text, bind(q.names, args));
      return r.rows[0] as T | undefined;
    },
    async all<T>(...args: unknown[]) {
      const r = await exec(q.text, bind(q.names, args));
      return r.rows as T[];
    },
    async run(...args: unknown[]) {
      const r = await exec(runText, bind(q.names, args));
      return {
        changes: r.rowCount ?? 0,
        // ON CONFLICT DO NOTHING ที่ไม่ได้ใส่อะไรเลยจะไม่มีแถวคืนมา — คืน 0
        lastInsertRowid: wantsId ? Number(r.rows[0]?.id ?? 0) : 0,
      };
    },
  };
}

/* ---------- หน้าตาที่โค้ดส่วนอื่นเรียกใช้ ---------- */

export const db = {
  prepare,

  /** คำสั่งหลายบรรทัดที่ไม่มีตัวแปร (DDL) — ไม่แปลงรูปแบบตัวแปรให้ */
  async exec(sql: string): Promise<void> {
    await (booting.getStore() ? schemaReady() : ready());
    const client = txClient.getStore();
    if (client) await client.query(sql);
    else await pool().query(sql);
  },

  /**
   * ห่อคำสั่งหลายอย่างให้สำเร็จพร้อมกันหรือไม่สำเร็จพร้อมกัน
   *
   * คืนฟังก์ชันออกไปเหมือน better-sqlite3 เพื่อให้จุดเรียกเดิมยังเขียนแบบ
   * `await db.transaction(fn)(args)` ได้ — ต่างกันแค่ต้องเติม await
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>) {
    return async (...args: A): Promise<R> => {
      await (booting.getStore() ? schemaReady() : ready());
      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        const result = await txClient.run(client, () => fn(...args));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };
  },

  /** ปิดการเชื่อมต่อ — ใช้ตอนจบเทสต์ ไม่ใช้ตอนรันจริง */
  async close(): Promise<void> {
    if (g.__pgPool) await g.__pgPool.end();
    delete g.__pgPool;
    delete g.__pgSchema;
    delete g.__pgReady;
  },
};

/** ให้สคริปต์ย้ายข้อมูลและเทสต์เรียกใช้ได้โดยไม่ต้องผ่าน db.prepare */
export { ready, convert };
