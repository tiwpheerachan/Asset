import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "./pg";

/**
 * ที่เก็บไฟล์ที่ผู้ใช้อัปโหลด — ไฟล์แนบ ไอคอนฟอร์ม และลายเซ็น
 *
 * มีสองโหมด เลือกอัตโนมัติจากการตั้งค่า:
 *   ตั้ง S3_BUCKET ไว้  → เก็บบนที่เก็บอ็อบเจกต์ (Supabase Storage หรือ Amazon S3)
 *   ไม่ได้ตั้ง          → เก็บบนดิสก์เหมือนเดิมทุกอย่าง
 *
 * ใช้ชื่อค่าตั้งค่าขึ้นต้นด้วย S3_ ทั้งที่ตอนนี้เก็บบน Supabase เพราะทั้งคู่พูดภาษา
 * เดียวกัน (S3 API) — ย้ายไป Amazon S3 วันหน้าคือเปลี่ยนค่าตั้งค่า ไม่ต้องแก้โค้ด
 *
 * ที่ทำสองโหมดไม่ใช่เพื่อความยืดหยุ่นสวยงาม แต่เพื่อให้ "ถอยกลับได้ทันที" —
 * ถ้า S3 มีปัญหาระหว่างใช้งานจริง ลบค่าตั้งค่าออกแล้ว deploy ระบบก็กลับไปใช้ดิสก์
 * โดยไม่ต้อง revert โค้ด และเครื่องพัฒนาก็ไม่ต้องมีบัญชี AWS ถึงจะรันได้
 *
 * ตอนอ่าน: หา S3 ก่อน ไม่เจอค่อยดูดิสก์ — ช่วงย้ายไฟล์เก่าขึ้น S3 จึงไม่มีจังหวะที่
 * ไฟล์เปิดไม่ได้ ไม่ว่าไฟล์นั้นจะย้ายไปแล้วหรือยัง
 */

const BUCKET = process.env.S3_BUCKET ?? "";
const REGION = process.env.S3_REGION || "ap-southeast-1";
/**
 * ที่อยู่ของบริการ — ว่าง = Amazon S3 ตัวจริง
 * Supabase: https://<project-ref>.storage.supabase.co/storage/v1/s3
 */
const ENDPOINT = process.env.S3_ENDPOINT ?? "";

/**
 * กุญแจ — รับได้ทั้งชื่อ S3_* และ AWS_*
 *
 * ไลบรารีของ Amazon อ่านเฉพาะชื่อ AWS_* แต่ชื่อนั้นชวนเข้าใจผิดว่าระบบต่อไปหา AWS
 * ทั้งที่เก็บไฟล์อยู่บน Supabase — รับทั้งสองชื่อจึงไม่มีใครตั้งผิดเพราะเดาชื่อ
 * ไม่ตั้งเลยก็ได้ ถ้าวันหน้าย้ายไปรันบน AWS แล้วใช้สิทธิ์ของเครื่องแทนกุญแจ
 */
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "";
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
/** คำนำหน้าชื่อไฟล์ในถัง — แยกของระบบนี้ออกจากของอย่างอื่นถ้าใช้ถังร่วมกัน */
const PREFIX = (process.env.S3_PREFIX ?? "uploads/").replace(/^\/+/, "");

export const usingS3 = BUCKET !== "";

/** ที่เก็บไฟล์ตอนนี้อยู่ไหน — ใช้แสดงในหน้าสำรองข้อมูลให้ผู้ดูแลเห็น */
export function storageLabel(): string {
  if (!usingS3) return UPLOAD_DIR;
  const host = ENDPOINT ? new URL(ENDPOINT).hostname : "s3.amazonaws.com";
  return `${BUCKET} · ${host} (${REGION})`;
}

/* ---------- ตัวเชื่อมต่อ S3 ---------- */

type S3Client = import("@aws-sdk/client-s3").S3Client;
const g = globalThis as unknown as { __s3?: S3Client };

/**
 * สร้าง client ตอนใช้จริง ไม่ใช่ตอนโหลดโมดูล
 *
 * เหตุผลเดียวกับ pg.ts — `next build` โหลดโมดูลฝั่งเซิร์ฟเวอร์ขึ้นมาสำรวจตอนสร้าง
 * Docker image ซึ่งยังไม่มีค่า env ถ้าสร้างตั้งแต่ตอนโหลดจะพังทั้งที่ยังไม่มีใครเรียกใช้
 */
async function client(): Promise<S3Client> {
  if (g.__s3) return g.__s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  g.__s3 = new S3Client({
    region: REGION,
    ...(ACCESS_KEY && SECRET_KEY
      ? { credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } }
      : {}),
    ...(ENDPOINT
      ? {
          endpoint: ENDPOINT,
          // บริการที่เข้ากันได้กับ S3 (รวม Supabase) ใช้ที่อยู่แบบ .../ชื่อถัง/ชื่อไฟล์
          // ส่วน Amazon S3 ตัวจริงใช้แบบ ชื่อถัง.s3... ซึ่งเป็นค่าเริ่มต้นของ SDK
          forcePathStyle: true,
        }
      : {}),
  });
  return g.__s3;
}

const keyOf = (name: string) => `${PREFIX}${name}`;

/** ชื่อไฟล์ต้องไม่พาออกนอกที่เก็บ — กันการไต่พาธทั้งฝั่งดิสก์และฝั่ง S3 */
function safeName(name: string): string {
  return path.basename(name);
}

/* ---------- อ่าน เขียน ลบ ---------- */

export async function putFile(name: string, body: Buffer, contentType: string): Promise<void> {
  const safe = safeName(name);

  if (!usingS3) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, safe), body);
    return;
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await (await client()).send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: keyOf(safe),
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

/**
 * อ่านไฟล์ · คืน null ถ้าไม่มี
 *
 * ผู้เรียกทุกที่ถือว่า "ไม่มีไฟล์" เป็นเรื่องปกติที่ต้องรับมือ (ตอบ 404)
 * ไม่ใช่ข้อผิดพลาดที่ต้องโยนออกไป — ไฟล์ที่ถูกลบจากดิสก์แต่แถวยังอยู่ในฐานข้อมูล
 * เกิดขึ้นได้จริงกับระบบที่ใช้มานาน
 */
export async function getFile(name: string): Promise<Buffer | null> {
  const safe = safeName(name);

  if (usingS3) {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const res = await (await client()).send(
        new GetObjectCommand({ Bucket: BUCKET, Key: keyOf(safe) }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (bytes) return Buffer.from(bytes);
    } catch {
      /* ไม่เจอบน S3 — ลองดิสก์ต่อ เผื่อเป็นไฟล์เก่าที่ยังไม่ได้ย้าย */
    }
  }

  return fs.readFile(path.join(UPLOAD_DIR, safe)).catch(() => null);
}

/** ลบทั้งสองที่เสมอ — ไฟล์เก่าที่ย้ายแล้วอาจยังมีสำเนาค้างบนดิสก์ */
export async function deleteFile(name: string): Promise<void> {
  const safe = safeName(name);

  if (usingS3) {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await client()).send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: keyOf(safe) }),
      );
    } catch (e) {
      console.error("[storage] ลบไฟล์บน S3 ไม่สำเร็จ", (e as Error).message);
    }
  }

  await fs.rm(path.join(UPLOAD_DIR, safe), { force: true }).catch(() => {});
}

/** มีไฟล์นี้อยู่ไหม — ใช้ตอนย้ายไฟล์เก่า เพื่อข้ามของที่ส่งขึ้นไปแล้ว */
export async function hasFile(name: string): Promise<boolean> {
  const safe = safeName(name);
  if (!usingS3) {
    return fs.stat(path.join(UPLOAD_DIR, safe)).then(() => true).catch(() => false);
  }
  try {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    await (await client()).send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyOf(safe) }));
    return true;
  } catch {
    return false;
  }
}
