import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "./pg";
import { usingS3, putFile, hasFile } from "./storage";

/**
 * ย้ายไฟล์ที่ค้างอยู่บนดิสก์ขึ้นที่เก็บใหม่
 *
 * ทำไมต้องรันจากในระบบ ไม่ใช่จากเครื่องผู้ดูแล: ไฟล์จริงอยู่บนดิสก์ของเซิร์ฟเวอร์
 * เครื่องอื่นเข้าไม่ถึง — เดิมต้องเปิด shell ของผู้ให้บริการแล้วพิมพ์คำสั่ง
 * ซึ่งเป็นขั้นตอนที่คนไม่ได้ทำทุกวันแล้วต้องมาไล่หาว่าอยู่ตรงไหน
 *
 * ปลอดภัยที่จะกดซ้ำ: ไฟล์ที่ส่งไปแล้วถูกข้าม และไม่ลบไฟล์บนดิสก์เลย
 * ของเดิมยังอยู่ครบเป็นตาข่ายนิรภัยจนกว่าเจ้าของระบบจะตัดสินใจลบเอง
 */

const MIME: Record<string, string> = {
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
const mimeOf = (name: string) => MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";

export type MigrateResult = {
  ok: boolean;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  bytes: number;
  error?: string;
  /** ไฟล์ที่ส่งไม่สำเร็จ พร้อมเหตุผล — บอกให้รู้ว่าใบไหนต้องตามต่อ */
  failures: { name: string; reason: string }[];
};

/** ดูว่ายังมีไฟล์ค้างบนดิสก์ที่ยังไม่ได้ย้ายกี่ไฟล์ — ใช้ตัดสินใจว่าจะโชว์ปุ่มไหม */
export async function pendingFileCount(): Promise<number> {
  if (!usingS3) return 0;
  const names = await listLocal();
  let n = 0;
  for (const name of names) if (!(await hasFile(name))) n++;
  return n;
}

async function listLocal(): Promise<string[]> {
  try {
    const entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function migrateLocalFiles(): Promise<MigrateResult> {
  const base: MigrateResult = {
    ok: false, total: 0, sent: 0, skipped: 0, failed: 0, bytes: 0, failures: [],
  };

  if (!usingS3) {
    return { ...base, error: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ใหม่ — ไม่มีที่ให้ย้ายไป" };
  }

  const names = await listLocal();
  base.total = names.length;
  if (names.length === 0) return { ...base, ok: true };

  for (const name of names) {
    const local = path.join(UPLOAD_DIR, name);
    try {
      const stat = await fs.stat(local);

      if (await hasFile(name)) {
        base.skipped++;
        continue;
      }

      await putFile(name, await fs.readFile(local), mimeOf(name));

      // ตรวจว่าปลายทางรับไว้จริง ไม่ใช่แค่คำสั่งไม่ error
      if (!(await hasFile(name))) throw new Error("ส่งแล้วแต่หาที่ปลายทางไม่เจอ");

      base.sent++;
      base.bytes += stat.size;
    } catch (e) {
      base.failed++;
      base.failures.push({ name, reason: (e as Error).message });
    }
  }

  base.ok = base.failed === 0;
  return base;
}
