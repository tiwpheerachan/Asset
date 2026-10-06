import "server-only";
import crypto from "node:crypto";
import { larkConfig } from "./config";

/**
 * ถอดรหัส payload ที่ Lark เข้ารหัสมา (เปิด Encrypt Key ใน Developer Console)
 * รูปแบบ: AES-256-CBC โดยคีย์ = sha256(encryptKey) และ IV = 16 ไบต์แรกของ ciphertext
 */
export function decrypt(encryptB64: string, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const buf = Buffer.from(encryptB64, "base64");
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);

  // ตัด PKCS#7 padding เอง เพราะปิด auto padding ไว้
  const pad = out[out.length - 1];
  return out.subarray(0, out.length - pad).toString("utf8");
}

/**
 * ตรวจลายเซ็นของ request ตามสูตรของ Lark:
 *   sha256(timestamp + nonce + encryptKey + body)
 */
export function verifySignature(
  headers: Headers,
  rawBody: string,
  encryptKey: string,
): boolean {
  const timestamp = headers.get("x-lark-request-timestamp");
  const nonce = headers.get("x-lark-request-nonce");
  const signature = headers.get("x-lark-signature");
  if (!timestamp || !nonce || !signature) return false;

  const digest = crypto
    .createHash("sha256")
    .update(timestamp + nonce + encryptKey + rawBody)
    .digest("hex");

  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type VerifiedBody = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/**
 * แกะ request ที่เข้ามาให้เป็น JSON ที่เชื่อถือได้
 * ผ่านได้ทางใดทางหนึ่ง: ลายเซ็นถูกต้อง (เมื่อเปิดเข้ารหัส) หรือ verification token ตรง
 */
export function readVerified(headers: Headers, rawBody: string): VerifiedBody {
  const cfg = larkConfig();

  let text = rawBody;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "อ่าน JSON ไม่ได้" };
  }

  if (typeof parsed.encrypt === "string") {
    if (!cfg.encryptKey) return { ok: false, error: "payload เข้ารหัสมา แต่ยังไม่ได้ตั้ง LARK_ENCRYPT_KEY" };
    if (!verifySignature(headers, rawBody, cfg.encryptKey)) {
      return { ok: false, error: "ลายเซ็นไม่ถูกต้อง" };
    }
    try {
      text = decrypt(parsed.encrypt, cfg.encryptKey);
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "ถอดรหัส payload ไม่สำเร็จ" };
    }
    return { ok: true, body: parsed };
  }

  // ไม่ได้เข้ารหัส — ต้องมี verification token ที่ตรงกัน
  const token =
    (parsed.token as string | undefined) ??
    ((parsed.header as Record<string, unknown> | undefined)?.token as string | undefined);
  if (!cfg.verificationToken || token !== cfg.verificationToken) {
    return { ok: false, error: "verification token ไม่ตรง" };
  }
  return { ok: true, body: parsed };
}
