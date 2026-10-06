import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * บอกว่าเครื่องที่รันอยู่เป็นโค้ดชุดไหน
 *
 * ที่มา: ตลอดวันที่ deploy ล้มสลับผ่าน เราเดากันว่า production เป็นโค้ดรุ่นไหน
 * โดยเทียบ hash ของไฟล์ JS บ้าง เทียบเวลาไฟล์บ้าง ซึ่งทั้งสองวิธีเชื่อถือไม่ได้ —
 * hash ไม่เปลี่ยนเมื่อแก้เฉพาะฝั่งเซิร์ฟเวอร์ และเวลาไฟล์บอกแค่ว่า build เมื่อไหร่
 * ไม่ได้บอกว่า build จากคอมมิตไหน
 *
 * เปิดให้เรียกได้โดยไม่ต้องล็อกอิน เพราะประโยชน์ทั้งหมดคือ "เช็คได้ทันทีว่าของขึ้นหรือยัง"
 * ถ้าต้องล็อกอินก่อนก็เช็คตอนระบบมีปัญหาไม่ได้ · คืนเฉพาะข้อมูลที่ไม่เป็นความลับ
 */
export function GET() {
  return NextResponse.json(
    {
      // BUILD_SHA มาจาก build arg ตอนสร้าง image ที่ Actions
      // RENDER_GIT_COMMIT Render ใส่ให้เองตอน build จาก repo — รองรับทั้งสองทาง
      commit: process.env.BUILD_SHA || process.env.RENDER_GIT_COMMIT || "unknown",
      builtAt: process.env.BUILD_TIME || "unknown",
      /** build มาจากทางไหน — ช่วยตอบว่าตอนนี้ Render build เองหรือดึง image ไปใช้ */
      source: process.env.BUILD_SHA ? "image" : process.env.RENDER_GIT_COMMIT ? "render" : "local",
      // เวลาของเครื่องตอนนี้ — ใช้ยืนยันว่า TZ ถูกตั้งจริง ไม่ได้ตกกลับไปเป็น UTC
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      node: process.version,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
