#!/usr/bin/env node
/**
 * ประกาศ resource/capability ของแอปนี้ให้ Central Login รู้จัก
 *
 *   npm run sync-central          ดูว่าจะส่งอะไรบ้าง (ไม่ยิงจริง)
 *   npm run sync-central -- --go  ยิงจริง
 *
 * ยิงซ้ำได้ไม่พัง · ใช้ prune:false เสมอ (เพิ่ม/อัปเดตอย่างเดียว ไม่ลบอะไร)
 * เพราะ prune:true จะลบ override ที่แอดมินตั้งไว้ในระบบกลางไปด้วย
 *
 * ⚠️ resource ใหม่เปิดให้เห็นทันทีตามระดับพื้นฐานของแต่ละบทบาท ไม่ต้องรออนุมัติ —
 *    ตัวที่ทำเครื่องหมาย sensitive ไว้ ต้องเข้าไปตั้ง override ที่ระบบกลางทันทีหลังรัน
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// อ่าน .env.local เองแบบง่ายๆ — สคริปต์นี้รันนอก Next จึงไม่มีตัวโหลดให้
for (const file of [".env.local", ".env"]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const schema = JSON.parse(
  fs.readFileSync(path.join(root, "src/lib/central/schema.json"), "utf8"),
);
const resources = schema.resources;
const capabilities = schema.capabilities;

const base = (process.env.CENTRAL_DIRECTORY_URL || process.env.SSO_ISSUER || "").replace(/\/+$/, "");
const key = (process.env.CENTRAL_API_KEY || process.env.DIRECTORY_API_KEY || "").trim();
const go = process.argv.includes("--go");

if (!base || !key) {
  console.error("ยังไม่ได้ตั้ง CENTRAL_DIRECTORY_URL (หรือ SSO_ISSUER) และ CENTRAL_API_KEY");
  process.exit(1);
}

console.log(`ระบบกลาง : ${base}`);
console.log(`resource  : ${resources.length} รายการ`);
for (const r of resources) {
  console.log(`   ${r.sensitive ? "🔒" : "  "} ${r.key.padEnd(14)} ${r.name}`);
}
console.log(`capability: ${capabilities.length} รายการ`);
for (const c of capabilities) console.log(`      ${c.key.padEnd(18)} ${c.name}`);

if (!go) {
  console.log("\n(ยังไม่ได้ยิงจริง — ใส่ --go เพื่อส่งขึ้นระบบกลาง)");
  process.exit(0);
}

const res = await fetch(`${base}/api/v1/apps/schema/sync`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ resources, capabilities, prune: false }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`\nไม่สำเร็จ (HTTP ${res.status}): ${text}`);
  process.exit(1);
}

console.log(`\nส่งขึ้นระบบกลางแล้ว (HTTP ${res.status}) ${text}`);
const sensitive = resources.filter((r) => r.sensitive).map((r) => r.key);
if (sensitive.length) {
  console.log(
    `\n⚠️  ${sensitive.join(", ")} เป็นข้อมูลอ่อนไหว แต่ระบบกลางเปิดให้ทุกบทบาทตามระดับพื้นฐานทันที\n` +
      `   เข้าไปตั้ง override ที่หน้าสิทธิ์ของแอปเดี๋ยวนี้ ก่อนจะมีคนเปิดดู`,
  );
}
