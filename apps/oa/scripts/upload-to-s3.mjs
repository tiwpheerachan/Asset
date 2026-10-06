#!/usr/bin/env node
/**
 * ย้ายไฟล์ที่อัปโหลดไว้เดิมจากดิสก์ขึ้น S3 — ทำครั้งเดียวตอนย้ายที่เก็บไฟล์
 *
 *   npm run upload-to-s3 -- --dry-run    ดูก่อนว่าจะย้ายอะไรบ้าง ไม่ส่งอะไรขึ้น
 *   npm run upload-to-s3                 ย้ายจริง
 *
 * อ่านค่าตั้งค่าจาก .env.local ให้เอง (S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, ...)
 *
 * สิ่งที่สคริปต์นี้รับประกัน:
 *   · ไม่ลบไฟล์บนดิสก์ — ของเดิมยังอยู่ครบจนกว่าเจ้าของระบบจะตัดสินใจลบเอง
 *   · ข้ามไฟล์ที่ส่งขึ้นไปแล้ว รันซ้ำได้ไม่เสียหาย
 *   · ตรวจขนาดไฟล์ที่ปลายทางหลังส่ง ไม่ตรงถือว่าไฟล์นั้นล้มเหลว
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadEnvLocal } from "./pg-lite.mjs";

loadEnvLocal();

const BUCKET = process.env.S3_BUCKET ?? "";
const REGION = process.env.S3_REGION || "ap-southeast-1";
const ENDPOINT = process.env.S3_ENDPOINT ?? "";
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "";
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
const PREFIX = (process.env.S3_PREFIX ?? "uploads/").replace(/^\/+/, "");
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const dryRun = process.argv.includes("--dry-run");

if (!BUCKET) {
  console.error("ไม่ได้ตั้ง S3_BUCKET — ไม่รู้ว่าจะส่งไปถังไหน");
  process.exit(1);
}
if (!fs.existsSync(UPLOAD_DIR)) {
  console.error(`ไม่พบโฟลเดอร์ ${UPLOAD_DIR}`);
  process.exit(1);
}
// ตรวจกุญแจตั้งแต่ต้น ไม่ปล่อยให้ไปล้มทีละไฟล์ตอนส่งจริง
if (ENDPOINT && !(ACCESS_KEY && SECRET_KEY)) {
  console.error("ไม่พบกุญแจ — ต้องตั้งค่าสองตัวนี้:");
  console.error("  AWS_ACCESS_KEY_ID      (หรือ S3_ACCESS_KEY_ID)");
  console.error("  AWS_SECRET_ACCESS_KEY  (หรือ S3_SECRET_ACCESS_KEY)");
  console.error(`\nตอนนี้ตั้งไว้: ACCESS_KEY ${ACCESS_KEY ? "มี" : "ไม่มี"} · SECRET ${SECRET_KEY ? "มี" : "ไม่มี"}`);
  process.exit(1);
}

const { S3Client, PutObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: REGION,
  ...(ACCESS_KEY && SECRET_KEY
    ? { credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } }
    : {}),
  ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
});

/** เดาชนิดไฟล์จากนามสกุล — S3 เก็บค่านี้ไว้ตอบตอนเบราว์เซอร์มาขอ */
const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv", ".txt": "text/plain", ".zip": "application/zip",
};
const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";

const files = fs
  .readdirSync(UPLOAD_DIR)
  .filter((f) => fs.statSync(path.join(UPLOAD_DIR, f)).isFile())
  .sort();

const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const total = files.reduce((s, f) => s + fs.statSync(path.join(UPLOAD_DIR, f)).size, 0);

console.log(`\nต้นทาง:  ${UPLOAD_DIR}`);
console.log(`ปลายทาง: ${ENDPOINT || "Amazon S3"} · ถัง ${BUCKET}/${PREFIX} (${REGION})`);
console.log(`พบ ${files.length} ไฟล์ · รวม ${human(total)}\n`);

if (files.length === 0) process.exit(0);

let sent = 0, skipped = 0, failed = 0;

for (const name of files) {
  const local = path.join(UPLOAD_DIR, name);
  const size = fs.statSync(local).size;
  const Key = `${PREFIX}${name}`;

  // มีอยู่แล้วและขนาดตรงกัน = ส่งไปแล้ว ข้ามไป (รันซ้ำได้)
  let exists = null;
  try {
    exists = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
  } catch (e) {
    // "ไม่พบไฟล์" เป็นเรื่องปกติ แต่ error อื่น (กุญแจผิด ต่อไม่ติด ถังไม่มี)
    // ต้องหยุดทันที ไม่ใช่ทำเป็นว่าไฟล์ยังไม่มีแล้วเดินต่อ — ไม่งั้น --dry-run
    // จะรายงานว่าทุกอย่างพร้อมทั้งที่จริงต่อไม่ได้เลยสักไฟล์
    const notFound = e.name === "NotFound" || e.name === "NoSuchKey" ||
                     e.$metadata?.httpStatusCode === 404;
    if (!notFound) {
      console.error(`\nต่อที่เก็บไฟล์ไม่ได้: ${e.name} — ${e.message}`);
      console.error("หยุดก่อน ยังไม่ได้ส่งอะไรขึ้นไป");
      process.exit(1);
    }
  }
  if (exists && Number(exists.ContentLength) === size) {
    console.log(`  ข้าม   ${name.padEnd(46)} ${human(size)} (มีอยู่แล้ว)`);
    skipped++;
    continue;
  }

  if (dryRun) {
    console.log(`  จะส่ง  ${name.padEnd(46)} ${human(size)}`);
    sent++;
    continue;
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key, Body: fs.readFileSync(local), ContentType: mimeOf(name),
    }));
    // ตรวจว่าปลายทางได้ครบจริง ไม่ใช่แค่คำสั่งไม่ error
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
    if (Number(head.ContentLength) !== size) {
      throw new Error(`ขนาดไม่ตรง (${head.ContentLength} ≠ ${size})`);
    }
    console.log(`  ส่งแล้ว ${name.padEnd(46)} ${human(size)}`);
    sent++;
  } catch (e) {
    console.log(`  ✗ ล้ม   ${name.padEnd(46)} ${e.message}`);
    failed++;
  }
}

console.log(
  `\n${dryRun ? "โหมด --dry-run: ไม่ได้ส่งอะไรขึ้นจริง · " : ""}` +
  `ส่ง ${sent} · ข้าม ${skipped} · ล้มเหลว ${failed}`,
);
if (!dryRun && failed === 0 && sent + skipped === files.length) {
  console.log("\n✓ ครบทุกไฟล์ · ไฟล์บนดิสก์ไม่ถูกลบ เก็บไว้เป็นตาข่ายนิรภัยจนกว่าจะมั่นใจ");
}
process.exit(failed > 0 ? 1 : 0);
