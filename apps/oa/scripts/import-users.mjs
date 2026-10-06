/**
 * นำเข้าพนักงานและแผนกจากไฟล์ CSV
 *
 *   node scripts/import-users.mjs users.csv           ดูผลก่อนว่าจะเกิดอะไร (ไม่เขียนจริง)
 *   node scripts/import-users.mjs users.csv --apply   เขียนจริง
 *
 * คอลัมน์: name,email,department,position,job_role,role
 *   department  ไม่มีจะสร้างให้อัตโนมัติ
 *   job_role    ใช้ผูกสายอนุมัติ — NONE, SALES, SALES_MANAGER, PURCHASING,
 *               MARKETING, FINANCE, FINANCE_MANAGER, MD
 *   role        สิทธิ์ในแอป — USER, MANAGER, ADMIN
 *
 * อีเมลซ้ำ = อัปเดตคนเดิม ไม่สร้างซ้ำ จึงรันไฟล์เดิมซ้ำได้อย่างปลอดภัย
 * ทุกคนที่นำเข้าใหม่จะได้รหัสชั่วคราวและถูกบังคับตั้งรหัสเองเมื่อเข้าระบบครั้งแรก
 */
import { connect } from "./pg-lite.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const JOB_ROLES = ["NONE","SALES","SALES_MANAGER","PURCHASING","MARKETING","FINANCE","FINANCE_MANAGER","MD"];
const ROLES = ["USER","MANAGER","ADMIN"];

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
if (!file) { console.error("ระบุไฟล์ CSV: node scripts/import-users.mjs users.csv [--apply]"); process.exit(1); }

/** ตัวอ่าน CSV เล็กๆ รองรับค่าที่มีคอมมาอยู่ในเครื่องหมายคำพูด */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
const rows = parseCsv(raw);
const head = rows.shift().map((h) => h.trim().toLowerCase());
const need = ["name", "email"];
for (const h of need) if (!head.includes(h)) { console.error(`CSV ต้องมีคอลัมน์ ${h}`); process.exit(1); }
const col = (r, name) => (head.includes(name) ? (r[head.indexOf(name)] ?? "").trim() : "");

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
// ฐานข้อมูลไม่ได้อยู่ในโฟลเดอร์นี้แล้ว แต่ไฟล์รหัสชั่วคราวยังเขียนลงที่นี่
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = connect();

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${crypto.scryptSync(plain, salt, 64).toString("hex")}`;
}
function tempPassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ", num = "23456789";
  const pick = (s, n) => Array.from({ length: n }, () => s[crypto.randomInt(s.length)]).join("");
  return `${pick(abc,4)}-${pick(num,4)}-${pick(abc,4)}`;
}

/*
 * อ่านผู้ใช้และแผนกที่มีอยู่มาเก็บไว้ครั้งเดียว
 * เดิมถามฐานข้อมูลทีละแถวได้เพราะไฟล์อยู่ในเครื่องเดียวกัน — พอเป็น Postgres
 * การนำเข้า 200 คนจะกลายเป็นการวิ่งข้ามเครือข่าย 400 รอบ
 */
const idByEmail = new Map(
  (await db.prepare("SELECT id, email FROM users").all()).map((r) => [r.email.toLowerCase(), r.id]),
);
const deptIdByName = new Map(
  (await db.prepare("SELECT id, name FROM departments").all()).map((r) => [r.name, r.id]),
);

const plan = [];
const errors = [];
const seen = new Set();

for (const [i, r] of rows.entries()) {
  const line = i + 2;
  const name = col(r, "name");
  const email = col(r, "email").toLowerCase();
  const dept = col(r, "department");
  const position = col(r, "position");
  const jobRole = (col(r, "job_role") || "NONE").toUpperCase();
  const role = (col(r, "role") || "USER").toUpperCase();

  if (!name)  errors.push(`บรรทัด ${line}: ไม่มีชื่อ`);
  if (!email || !email.includes("@")) errors.push(`บรรทัด ${line}: อีเมลไม่ถูกต้อง (${email || "ว่าง"})`);
  if (seen.has(email)) errors.push(`บรรทัด ${line}: อีเมลซ้ำในไฟล์ (${email})`);
  if (!JOB_ROLES.includes(jobRole)) errors.push(`บรรทัด ${line}: job_role ไม่ถูกต้อง "${jobRole}"`);
  if (!ROLES.includes(role)) errors.push(`บรรทัด ${line}: role ไม่ถูกต้อง "${role}"`);
  seen.add(email);

  const existingId = idByEmail.get(email);
  plan.push({ line, name, email, dept, position, jobRole, role, action: existingId ? "อัปเดต" : "สร้างใหม่", id: existingId });
}

if (errors.length) {
  console.error(`พบข้อผิดพลาด ${errors.length} จุด — ยังไม่เขียนอะไรทั้งสิ้น`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}

const newDepts = [...new Set(plan.map((p) => p.dept).filter(Boolean))]
  .filter((d) => !deptIdByName.has(d));

console.log(`อ่านได้ ${plan.length} คน`);
if (newDepts.length) console.log(`แผนกที่จะสร้างใหม่: ${newDepts.join(", ")}`);
for (const p of plan) console.log(`  ${p.action.padEnd(9)} ${p.email.padEnd(30)} ${p.name.padEnd(20)} ${p.dept || "—"} · ${p.jobRole} · ${p.role}`);

if (!apply) {
  console.log("\nนี่คือการดูผลล่วงหน้า ยังไม่ได้เขียนอะไร — ใส่ --apply เพื่อเขียนจริง");
  await db.close();
  process.exit(0);
}

const issued = [];
await db.transaction(async () => {
  const insDept = db.prepare("INSERT INTO departments (name) VALUES (?)");
  for (const d of newDepts) {
    const { lastInsertRowid } = await insDept.run(d);
    deptIdByName.set(d, Number(lastInsertRowid));
  }

  const upd = db.prepare(
    `UPDATE users SET name=?, position=?, department_id=?, job_role=?, role=?, active=1 WHERE id=?`,
  );
  const ins = db.prepare(
    `INSERT INTO users (email,password,name,position,department_id,job_role,role,active,must_change_password)
     VALUES (?,?,?,?,?,?,?,1,1)`,
  );

  for (const p of plan) {
    const deptId = p.dept ? (deptIdByName.get(p.dept) ?? null) : null;
    if (p.id) {
      await upd.run(p.name, p.position, deptId, p.jobRole, p.role, p.id);
    } else {
      const pw = tempPassword();
      await ins.run(p.email, hashPassword(pw), p.name, p.position, deptId, p.jobRole, p.role);
      issued.push([p.email, p.name, pw]);
    }
  }
})();

console.log(`\nเขียนแล้ว — สร้างใหม่ ${issued.length} คน, อัปเดต ${plan.length - issued.length} คน`);

if (issued.length) {
  const out = path.join(DATA_DIR, "initial-passwords.txt");
  const body = [
    `รหัสผ่านชั่วคราวของผู้ใช้ที่นำเข้าเมื่อ ${new Date().toISOString()}`,
    "ส่งให้เจ้าของบัญชีแล้วลบไฟล์นี้ทิ้ง · ทุกคนต้องตั้งรหัสใหม่เมื่อเข้าระบบครั้งแรก",
    "",
    ...issued.map(([e, n, p]) => `${e.padEnd(30)} ${n.padEnd(22)} ${p}`),
    "",
  ].join("\n");
  fs.appendFileSync(out, body, { mode: 0o600 });
  fs.chmodSync(out, 0o600);
  console.log(`รหัสชั่วคราวต่อท้ายไว้ที่ ${out}`);
}

await db.close();
