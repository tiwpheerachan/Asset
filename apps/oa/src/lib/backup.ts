import "server-only";
import { parseDbTime } from "./format";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, UPLOAD_DIR, db } from "./db";
import { dumpDatabase, DUMP_END } from "./pg-dump";
import { usingS3, storageLabel } from "./storage";

/**
 * การสำรองข้อมูลอัตโนมัติ
 *
 * ฐานข้อมูลถูกเขียนออกเป็นไฟล์ SQL (ดู pg-dump.ts) ไม่ใช่คัดลอกไฟล์ —
 * เพราะฐานข้อมูลอยู่บนเซิร์ฟเวอร์ Postgres คนละเครื่อง ไม่มีไฟล์ให้คัดลอก
 * ผลที่ได้คือไฟล์ข้อความที่กู้คืนด้วย psql ได้ และเปิดอ่านตรวจสอบด้วยตาได้
 *
 * ไฟล์แนบใช้วิธี "มิเรอร์" คือคัดลอกเฉพาะไฟล์ที่ยังไม่มีในที่สำรอง
 * เพราะไฟล์แนบไม่เคยถูกแก้หลังอัปโหลด การทำสำเนาใหม่ทั้งชุดทุกวันคือการเปลืองดิสก์เปล่าๆ
 */

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./backups");
export const RETENTION_DAYS = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30));
export const INTERVAL_HOURS = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24));
const AUTO = (process.env.BACKUP_AUTO ?? "true") !== "false";

const SNAPSHOT_RE = /^app-\d{8}-\d{6}\.sql$/;

export type Trigger = "AUTO" | "MANUAL" | "CRON";

export type BackupRow = {
  id: number;
  filename: string;
  size: number;
  files_added: number;
  ok: number;
  error: string;
  trigger: Trigger;
  duration_ms: number;
  created_at: string;
};

/** ชื่อไฟล์ตามเวลาท้องถิ่น เพื่อให้คนเปิดโฟลเดอร์ดูแล้วเข้าใจทันทีว่าของวันไหน */
function stamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * สำเนาอยู่ดิสก์เดียวกับต้นฉบับไหม
 *
 * ยังกันเคสที่เจอบ่อยที่สุดได้ (ไฟล์พัง · ลบผิด · migration พลาด) แต่ไม่กันดิสก์เสีย
 * โฮสต์ที่ให้ดิสก์ถาวรก้อนเดียวอย่าง Render เลี่ยงไม่ได้ — ทางออกคือดาวน์โหลดเก็บนอกเครื่อง
 * ห้ามย้ายกลับไปนอกดิสก์ถาวรเพื่อให้เตือนหาย เพราะที่นั่นข้อมูลหายทุกครั้งที่ deploy
 */
export function backupDirIsUnsafe(): boolean {
  const rel = path.relative(DATA_DIR, BACKUP_DIR);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/* ---------- คัดลอกไฟล์แนบแบบเพิ่มเฉพาะของใหม่ ---------- */

function mirrorUploads(): number {
  // ไฟล์อยู่บน S3 แล้ว ซึ่งมี versioning กันลบพลาดอยู่ในตัว — การคัดลอกไฟล์จากดิสก์
  // มาไว้ในโฟลเดอร์สำรองบนดิสก์ก้อนเดียวกันจึงไม่ได้เพิ่มความปลอดภัยอะไร
  // มีแต่จะกินพื้นที่ดิสก์ที่เรากำลังพยายามเลิกพึ่งพา
  if (usingS3) return 0;
  if (!fs.existsSync(UPLOAD_DIR)) return 0;
  const dest = path.join(BACKUP_DIR, "uploads");
  fs.mkdirSync(dest, { recursive: true });

  let added = 0;
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    const from = path.join(UPLOAD_DIR, name);
    const to = path.join(dest, name);
    if (!fs.statSync(from).isFile()) continue;
    // มีอยู่แล้วและขนาดตรงกัน = ไฟล์เดิม ข้ามไป
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
    fs.copyFileSync(from, to);
    added++;
  }
  return added;
}

/* ---------- ตรวจว่าสำเนาที่ได้ใช้กู้คืนได้จริง ---------- */

/**
 * สำเนาที่ขาดกลางทางคือสำเนาที่ไม่มีค่า จึงต้องอ่านกลับมาตรวจทุกครั้ง
 *
 * ตรวจสามอย่าง: ไฟล์ปิดท้ายครบ (เขียนไม่ขาด) · มี COMMIT (กู้คืนแล้วข้อมูลจะถูกยืนยัน)
 * · จำนวนคำขอไม่น้อยกว่าต้นฉบับ (ไม่ได้ดัมพ์ไปแค่บางส่วน)
 */
function verifySnapshot(file: string, expectedRequests: number): string {
  try {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(DUMP_END)) return "ไฟล์สำเนาเขียนไม่จบ (ไม่พบบรรทัดปิดท้าย)";
    if (!text.includes("COMMIT;")) return "ไฟล์สำเนาไม่มีคำสั่ง COMMIT";

    const n = (text.match(/^INSERT INTO "requests" /gm) ?? []).length;
    if (n < expectedRequests) {
      return `จำนวนคำขอในสำเนาน้อยกว่าต้นฉบับ (${n} < ${expectedRequests})`;
    }
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/* ---------- ลบสำเนาเก่าตามอายุที่กำหนด ---------- */

/** เก็บอย่างน้อย 3 ชุดล่าสุดเสมอ ต่อให้เลยอายุแล้ว — กันกรณีระบบหยุดไปนานแล้วกลับมาลบเกลี้ยง */
function prune(): string[] {
  const cutoff = Date.now() - RETENTION_DAYS * 86400_000;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => SNAPSHOT_RE.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const removed: string[] = [];
  for (const { f, t } of files.slice(3)) {
    if (t >= cutoff) continue;
    fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
    removed.push(f);
  }

  // ไฟล์ .db จากยุค SQLite ไม่เข้าเงื่อนไข SNAPSHOT_RE จึงไม่ถูกลบ — ตั้งใจไว้เช่นนั้น
  // เพราะเป็นสำเนาชุดเดียวที่มีของก่อนย้ายฐานข้อมูล เจ้าของระบบควรเป็นคนตัดสินใจลบเอง
  return removed;
}

/* ---------- ตัวสำรองหลัก ---------- */

export type BackupResult = {
  ok: boolean;
  filename: string;
  size: number;
  filesAdded: number;
  removed: string[];
  error: string;
  durationMs: number;
};

let running = false;

export async function runBackup(trigger: Trigger = "MANUAL"): Promise<BackupResult> {
  const started = Date.now();
  const filename = `app-${stamp()}.sql`;
  const target = path.join(BACKUP_DIR, filename);
  const fail = (error: string): BackupResult => ({
    ok: false, filename, size: 0, filesAdded: 0, removed: [], error,
    durationMs: Date.now() - started,
  });

  if (running) return fail("มีการสำรองข้อมูลทำงานอยู่แล้ว");
  running = true;

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const expected = ((await db.prepare("SELECT COUNT(*) AS n FROM requests").get()) as { n: number }).n;

    await dumpDatabase(target);

    const problem = verifySnapshot(target, expected);
    if (problem) {
      fs.rmSync(target, { force: true }); // สำเนาที่เชื่อไม่ได้ อย่าเก็บไว้ให้เข้าใจผิด
      throw new Error(problem);
    }

    const size = fs.statSync(target).size;
    const filesAdded = mirrorUploads();
    const removed = prune();

    await record({ filename, size, filesAdded, ok: 1, error: "", trigger, ms: Date.now() - started });
    return { ok: true, filename, size, filesAdded, removed, error: "", durationMs: Date.now() - started };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await record({ filename, size: 0, filesAdded: 0, ok: 0, error, trigger, ms: Date.now() - started });
    return fail(error);
  } finally {
    running = false;
  }
}

async function record(r: {
  filename: string; size: number; filesAdded: number;
  ok: number; error: string; trigger: Trigger; ms: number;
}) {
  try {
    await db.prepare(
      `INSERT INTO backups (filename, size, files_added, ok, error, "trigger", duration_ms)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(r.filename, r.size, r.filesAdded, r.ok, r.error.slice(0, 500), r.trigger, r.ms);
    // ประวัติเก็บพอให้ย้อนดูได้ ไม่ต้องเก็บตลอดกาล
    await db.prepare(
      "DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 200)",
    ).run();
  } catch {
    /* บันทึกประวัติไม่ได้ ไม่ควรทำให้การสำรองที่สำเร็จแล้วกลายเป็นล้มเหลว */
  }
}

/* ---------- ข้อมูลสำหรับหน้าผู้ดูแล ---------- */

export type BackupStatus = {
  dir: string;
  /** ไฟล์แนบเก็บอยู่ที่ไหน — ดิสก์ หรือ S3 */
  storage: string;
  filesOffBox: boolean;
  unsafeDir: boolean;
  auto: boolean;
  intervalHours: number;
  retentionDays: number;
  lastOk: BackupRow | null;
  lastRun: BackupRow | null;
  history: BackupRow[];
  snapshots: { name: string; size: number; at: string }[];
  totalSize: number;
  overdue: boolean;
};

export async function backupStatus(): Promise<BackupStatus> {
  const history = (await db
    .prepare("SELECT * FROM backups ORDER BY id DESC LIMIT 15")
    .all()) as BackupRow[];
  const lastOk = ((await db.prepare("SELECT * FROM backups WHERE ok=1 ORDER BY id DESC LIMIT 1").get()) ??
    null) as BackupRow | null;

  let snapshots: BackupStatus["snapshots"] = [];
  if (fs.existsSync(BACKUP_DIR)) {
    snapshots = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => SNAPSHOT_RE.test(f))
      .map((name) => {
        const st = fs.statSync(path.join(BACKUP_DIR, name));
        return { name, size: st.size, at: new Date(st.mtimeMs).toISOString() };
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  let uploadsSize = 0;
  const mirror = path.join(BACKUP_DIR, "uploads");
  if (fs.existsSync(mirror)) {
    for (const f of fs.readdirSync(mirror)) {
      try {
        uploadsSize += fs.statSync(path.join(mirror, f)).size;
      } catch {
        /* ไฟล์หายระหว่างนับ — ข้าม */
      }
    }
  }

  const lastOkAt = lastOk ? parseDbTime(lastOk.created_at) : 0;

  return {
    dir: BACKUP_DIR,
    storage: storageLabel(),
    filesOffBox: usingS3,
    unsafeDir: backupDirIsUnsafe(),
    auto: AUTO,
    intervalHours: INTERVAL_HOURS,
    retentionDays: RETENTION_DAYS,
    lastOk,
    lastRun: history[0] ?? null,
    history,
    snapshots,
    totalSize: snapshots.reduce((s, x) => s + x.size, 0) + uploadsSize,
    overdue: !lastOk || Date.now() - lastOkAt > INTERVAL_HOURS * 3600_000,
  };
}

export function snapshotPath(name: string): string | null {
  if (!SNAPSHOT_RE.test(name)) return null; // กันการไต่พาธออกนอกโฟลเดอร์
  const file = path.join(BACKUP_DIR, name);
  return fs.existsSync(file) ? file : null;
}

/* ---------- ตัวตั้งเวลาในตัวระบบ ---------- */

/**
 * ตั้งเวลาเองในแอป ไม่ต้องพึ่ง cron ของเครื่อง — เพราะระบบนี้ติดตั้งบนเครื่องภายใน
 * ที่คนดูแลอาจไม่ได้ตั้ง cron ให้ และการสำรองที่ต้องรอคนตั้งค่าเพิ่ม มักจบด้วยการไม่มีใครตั้ง
 *
 * เงื่อนไขคือ "ครั้งล่าสุดที่สำเร็จ เกินระยะที่กำหนดหรือยัง" ไม่ใช่ "ถึงเวลาตี 2 หรือยัง"
 * เพราะถ้าเครื่องปิดตอนกลางคืน แบบหลังจะไม่มีวันทำงานเลย
 */
export function startBackupScheduler() {
  const g = globalThis as { __backupTimer?: NodeJS.Timeout };
  if (g.__backupTimer || !AUTO) return;

  if (backupDirIsUnsafe()) {
    console.warn(
      `[backup] BACKUP_DIR อยู่ดิสก์เดียวกับข้อมูล (${BACKUP_DIR}) — ดิสก์เสียจะหายทั้งคู่ ควรดาวน์โหลดเก็บนอกเครื่องเป็นระยะ`,
    );
  }

  const tick = async () => {
    try {
      const st = await backupStatus();
      if (!st.overdue) return;
      const r = await runBackup("AUTO");
      console.log(
        r.ok
          ? `[backup] สำรองข้อมูลแล้ว ${r.filename} (${(r.size / 1048576).toFixed(1)} MB, ไฟล์แนบใหม่ ${r.filesAdded})`
          : `[backup] สำรองข้อมูลไม่สำเร็จ: ${r.error}`,
      );
    } catch (e) {
      console.error("[backup] ตัวตั้งเวลาผิดพลาด", e);
    }
  };

  g.__backupTimer = setInterval(tick, 3600_000);
  setTimeout(tick, 30_000).unref?.(); // เว้นให้เซิร์ฟเวอร์ตั้งตัวก่อน แล้วค่อยเช็ครอบแรก
  g.__backupTimer.unref?.();
}
