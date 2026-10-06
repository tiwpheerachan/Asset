/**
 * ตัวเชื่อมต่อ PostgreSQL ฉบับย่อสำหรับสคริปต์เครื่องมือ
 *
 * หน้าตาเหมือน src/lib/pg.ts เพื่อให้ SQL ในสคริปต์เขียนแบบเดิมได้ (`?` และ `@ชื่อ`)
 * ไม่ import ตัวจริงเพราะนั่นเป็น TypeScript และติด "server-only" ซึ่งใช้นอก Next ไม่ได้
 *
 * เล็กกว่าตัวจริงตรงที่ไม่ต้องรองรับหลายคำขอพร้อมกัน — สคริปต์รันทีละคำสั่งจนจบ
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const NO_ID_TABLES = new Set(["app_meta", "sessions"]);

/** `?` และ `@ชื่อ` → `$1 $2 ...` โดยไม่แตะของที่อยู่ในเครื่องหมายคำพูด */
export function toPg(sql) {
  let out = "";
  let n = 0;
  const names = [];
  const seen = new Map();

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === q) {
          if (sql[j + 1] === q) j += 2;
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
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
      if (at) out += `$${at}`;
      else {
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

/**
 * อ่านค่าจาก .env.local ถ้ามี — เติมเฉพาะตัวที่ยังไม่ได้ตั้งไว้
 *
 * ทำไมต้องมี: connection string ของฐานข้อมูลมีรหัสผ่านอยู่ข้างใน การพิมพ์ลงบรรทัด
 * คำสั่งทำให้มันไปค้างอยู่ในประวัติ shell และใน log ของเครื่องมือที่รันคำสั่งให้
 * เก็บไว้ในไฟล์ที่ .gitignore กันอยู่แล้วจึงปลอดภัยกว่า และตรงกับที่ Next ใช้อยู่
 *
 * เขียนเองไม่ใช้ dotenv เพราะต้องการแค่ KEY=VALUE ธรรมดา ไม่คุ้มกับการเพิ่ม dependency
 * (Node มี --env-file ให้ตั้งแต่ 20.6 แต่จะล้มถ้าไฟล์ไม่มี ซึ่งเป็นกรณีปกติบนเซิร์ฟเวอร์)
 */
export function loadEnvLocal(file = ".env.local") {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // ค่าที่ตั้งมาจากบรรทัดคำสั่งสำคัญกว่าไฟล์เสมอ
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
  }
}

export function connect(url) {
  loadEnvLocal();
  url ??= process.env.DATABASE_URL;
  if (!url) {
    console.error("ไม่ได้ตั้ง DATABASE_URL — ตัวอย่างในเครื่อง: postgresql://localhost:5432/approve_dev");
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    max: 1,
  });

  let tx = null; // client ที่ใช้อยู่ระหว่าง transaction

  const send = (text, values) => (tx ?? pool).query(text, values);

  const bind = (names, args) => {
    if (names.length === 0) return [];
    if (!names.some((s) => s !== "")) return args;
    const obj = args[0] ?? {};
    return names.map((k) => (obj[k] === undefined ? null : obj[k]));
  };

  const prepare = (sql) => {
    const q = toPg(sql);
    const wantsId =
      q.insertInto !== "" && !NO_ID_TABLES.has(q.insertInto) && !/\bRETURNING\b/i.test(q.text);
    const runText = wantsId ? `${q.text} RETURNING id` : q.text;
    return {
      get: async (...a) => (await send(q.text, bind(q.names, a))).rows[0],
      all: async (...a) => (await send(q.text, bind(q.names, a))).rows,
      run: async (...a) => {
        const r = await send(runText, bind(q.names, a));
        return {
          changes: r.rowCount ?? 0,
          lastInsertRowid: wantsId ? Number(r.rows[0]?.id ?? 0) : 0,
        };
      },
    };
  };

  return {
    prepare,
    exec: async (sql) => void (await send(sql, [])),
    /** ทำให้สำเร็จพร้อมกันหรือไม่สำเร็จพร้อมกัน */
    transaction: (fn) => async (...args) => {
      const client = await pool.connect();
      tx = client;
      try {
        await client.query("BEGIN");
        const out = await fn(...args);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        tx = null;
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
