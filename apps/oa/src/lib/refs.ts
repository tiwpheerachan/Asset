import type { Field, RequestWithMeta } from "./types";

/**
 * คำขอที่เลือกอ้างอิงได้จริงในฟิลด์ชนิด REQUEST หนึ่งช่อง
 *
 * ที่มา: เดิมช่องอ้างอิงลิสต์ "เอกสารที่อนุมัติแล้ว" ทุกใบในระบบ ซึ่งใช้ได้ตอนมีเอกสาร
 * ไม่กี่ใบ แต่พอสะสมไปเป็นร้อยใบก็เลือกผิดใบได้ง่ายมาก และการอ้างอิงที่ผิดใบ
 * ตามรอยกลับไม่ได้ ซึ่งเป็นเหตุผลทั้งหมดที่เราอ้างอิงกันตั้งแต่แรก
 *
 * เก็บ "รหัสฟอร์มที่ยอมให้อ้างถึง" ไว้ในคอลัมน์ options ที่มีอยู่แล้ว จึงไม่ต้องแก้โครงฐานข้อมูล
 * ว่างไว้ = ทุกฟอร์ม เพื่อให้ฟิลด์ที่ตั้งไว้ก่อนหน้านี้ทำงานเหมือนเดิมหลังอัปเกรด
 */
export function refsFor(field: Field, refs: RequestWithMeta[]): RequestWithMeta[] {
  if (field.type !== "REQUEST" || field.options.length === 0) return refs;
  return refs.filter((r) => field.options.includes(r.template_code));
}
