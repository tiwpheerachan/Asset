/**
 * ออกรหัสชั่วคราวใหม่ให้ทุกบัญชี แล้วบังคับให้ตั้งรหัสเองเมื่อเข้าระบบครั้งแรก
 *
 * ใช้ตอนส่งมอบระบบ — บัญชีที่ติดตั้งมาพร้อมรหัสตัวอย่างเหมือนกันหมด
 * คือประตูที่เปิดทิ้งไว้ ต้องปิดก่อนเปิดใช้จริง
 *
 *   node scripts/reset-passwords.mjs                      ทุกบัญชี สุ่มรหัสให้คนละอัน
 *   node scripts/reset-passwords.mjs a@x.co               เฉพาะบัญชีที่ระบุ
 *   node scripts/reset-passwords.mjs --password=xxxxxxxx  ตั้งรหัสเดียวกันหมด (ใช้ช่วงทดลองเท่านั้น)
 *
 * รหัสสุ่มถูกเขียนลงไฟล์ ไม่พิมพ์บนจอ — จอถูกแคปหรือถูกมองข้ามไหล่ได้ง่ายกว่าไฟล์ที่ปิดสิทธิ์ไว้
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { connect } from "./pg-lite.mjs";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
// ฐานข้อมูลไม่ได้อยู่ในโฟลเดอร์นี้แล้ว แต่ไฟล์รหัสชั่วคราวยังเขียนลงที่นี่
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = connect();

const hasColumn = await db
  .prepare(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users'
        AND column_name = 'must_change_password'`,
  )
  .get();
if (!hasColumn) {
  console.error("ฐานข้อมูลยังไม่มีตารางครบ — เปิดเซิร์ฟเวอร์หนึ่งครั้งให้สร้างโครงก่อน");
  process.exit(1);
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${crypto.scryptSync(plain, salt, 64).toString("hex")}`;
}

/** ตัด 0/O/1/l/I ออก เพราะบอกต่อทางโทรศัพท์แล้วแยกไม่ออก */
function tempPassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join("");
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}

const argv = process.argv.slice(2);
const fixedArg = argv.find((a) => a.startsWith("--password="));
/**
 * โหมดรหัสเดียวกันหมด — สะดวกตอนให้คนลองใช้ แต่ไม่เหมาะกับการใช้งานจริง
 * เพราะรหัสที่ทุกคนรู้เท่ากับไม่มีรหัส และ audit log จะพิสูจน์ไม่ได้ว่าใครเป็นคนกด
 */
const fixed = fixedArg ? fixedArg.slice("--password=".length) : null;
if (fixed !== null && fixed.length < 6) {
  console.error("รหัสต้องยาวอย่างน้อย 6 ตัวอักษร");
  process.exit(1);
}
const only = argv.filter((a) => !a.startsWith("--"));
const users = await db
  .prepare(
    `SELECT id, email, name, sso_sub FROM users WHERE active = 1
      ${only.length ? `AND email IN (${only.map(() => "?").join(",")})` : ""}
      ORDER BY id`,
  )
  .all(...only);

if (!users.length) {
  console.error("ไม่พบบัญชีที่ตรงเงื่อนไข");
  process.exit(1);
}

const out = [];
// รหัสเดียวกันหมด = ตั้งใจให้ใช้ชั่วคราว ไม่ต้องติดธง "ยังใช้รหัสชั่วคราว" ให้รก
const upd = db.prepare(
  `UPDATE users SET password=?, must_change_password=${fixed ? 0 : 1} WHERE id=?`,
);
const clr = db.prepare("DELETE FROM login_attempts WHERE email=? AND ok=0");

await db.transaction(async () => {
  for (const u of users) {
    if (u.sso_sub) { out.push([u.email, u.name, "(ล็อกอินผ่านระบบกลาง — ข้าม)"]); continue; }
    const pw = fixed ?? tempPassword();
    await upd.run(hashPassword(pw), u.id);
    await clr.run(u.email);
    out.push([u.email, u.name, pw]);
  }
})();

if (fixed) {
  // ไม่เขียนไฟล์ เพราะรหัสเดียวกันหมดอยู่แล้ว คนสั่งรู้อยู่แล้วว่าคืออะไร
  const done = out.filter((r) => !r[2].startsWith("("));
  const old = path.join(DATA_DIR, "initial-passwords.txt");
  if (fs.existsSync(old)) { fs.rmSync(old); console.log("ลบไฟล์รหัสชั่วคราวเดิมทิ้งแล้ว"); }
  console.log(`ตั้งรหัสเดียวกันให้ ${done.length} บัญชีแล้ว`);
  console.log("โหมดนี้ใช้ช่วงทดลองเท่านั้น — ก่อนใช้จริงให้รันคำสั่งนี้ใหม่โดยไม่ใส่ --password");
  await db.close();
  process.exit(0);
}

const file = path.join(DATA_DIR, "initial-passwords.txt");
const body = [
  "รหัสผ่านชั่วคราว — ส่งให้เจ้าของบัญชีแล้วลบไฟล์นี้ทิ้ง",
  `ออกเมื่อ ${new Date().toISOString()}`,
  "ทุกบัญชีจะถูกบังคับให้ตั้งรหัสใหม่เมื่อเข้าระบบครั้งแรก",
  "",
  ...out.map(([e, n, p]) => `${e.padEnd(30)} ${String(n).padEnd(22)} ${p}`),
  "",
].join("\n");

fs.writeFileSync(file, body, { mode: 0o600 });
fs.chmodSync(file, 0o600);

console.log(`ออกรหัสชั่วคราวให้ ${out.filter((r) => !r[2].startsWith("(")).length} บัญชี`);
console.log(`รหัสอยู่ที่ ${file} (สิทธิ์ 600 — เจ้าของไฟล์เท่านั้นที่อ่านได้)`);
console.log("ส่งให้เจ้าของบัญชีแล้วลบไฟล์นี้ทิ้ง");

await db.close();
