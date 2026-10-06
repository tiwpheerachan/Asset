/**
 * เตรียมสภาพแวดล้อมก่อนโหลดโค้ดจริง
 *
 * 1) ตัด server-only ออก — แพ็กเกจนี้ตั้งใจโยน error เมื่อถูก import นอก React Server Component
 *    ซึ่งในเทสต์ที่รันบน node ล้วนๆ ไม่ได้มีปัญหาอะไร
 * 2) ชี้ DATA_DIR ไปโฟลเดอร์ชั่วคราว เทสต์จะได้ไม่แตะฐานข้อมูลจริง
 */
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ia-test-"));
process.env.DATA_DIR = dir;
process.env.BACKUP_DIR = path.join(dir, "backups");
process.env.REMINDER_ENABLED = "false";   // ไม่ให้ตัวตั้งเวลาทำงานระหว่างเทสต์
process.env.BACKUP_AUTO = "false";
process.env.WEBHOOK_URL = "";
/*
 * เทสต์ใช้ Postgres ในเครื่องแยกใบ ไม่แตะ approve_dev ที่ใช้พัฒนา
 *
 * node --test แยกกระบวนการต่อไฟล์เทสต์และรันขนานกัน — เดิมแต่ละกระบวนการได้ไฟล์
 * SQLite ของตัวเองจึงไม่กวนกัน แต่ Postgres เป็นเซิร์ฟเวอร์กลาง ถ้าใช้ที่เดียวกันหมด
 * wipe() ของไฟล์หนึ่งจะลบข้อมูลที่อีกไฟล์กำลังใช้อยู่
 *
 * แก้ด้วยการให้แต่ละกระบวนการได้ schema ของตัวเอง ส่งผ่าน search_path ใน
 * connection string — โค้ดแอปไม่ต้องรู้เรื่องนี้เลย
 */
const { execFileSync } = require("node:child_process");

const base = process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/approve_test";
const schema = `t${process.pid}_${Date.now().toString(36)}`;
execFileSync("psql", ["-q", "-d", base, "-c", `CREATE SCHEMA IF NOT EXISTS ${schema}`], {
  stdio: ["ignore", "ignore", "inherit"],
});
process.env.DATABASE_URL = `${base}?options=-c%20search_path%3D${schema}`;
process.on("exit", () => {
  try {
    execFileSync("psql", ["-q", "-d", base, "-c", `DROP SCHEMA IF EXISTS ${schema} CASCADE`], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    /* เก็บกวาดไม่ได้ก็ไม่ควรทำให้เทสต์ที่ผ่านแล้วกลายเป็นล้มเหลว */
  }
});

process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
