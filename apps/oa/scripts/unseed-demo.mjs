/**
 * ลบข้อมูลตัวอย่าง (demo) — บัญชี @company.co.th และข้อมูลที่ผูกอยู่ทั้งหมด
 *
 *   cd apps/oa && node scripts/unseed-demo.mjs
 *
 * ทำงานใน transaction เดียว — ถ้าพลาดตรงไหน rollback ทั้งหมด (ไม่ทำข้อมูลพัง)
 * ไม่แตะแผนก/แม่แบบฟอร์ม (ใช้ร่วมกับผู้ใช้จริงได้) · ลบเฉพาะผู้ใช้ demo + งานของเขา
 */
import { connect } from "./pg-lite.mjs";

const db = connect();

const rows = await db.prepare("SELECT id, email FROM users WHERE email LIKE ?").all("%@company.co.th");
const ids = rows.map((r) => r.id);
if (ids.length === 0) {
  console.log("ไม่พบบัญชี demo (@company.co.th) — ไม่มีอะไรต้องลบ");
  process.exit(0);
}
const L = ids.join(",");
console.log(`จะลบ demo ${ids.length} บัญชี:`, rows.map((r) => r.email).join(", "));

const run = db.transaction(async () => {
  // 1) คำขอที่ demo เป็นผู้ยื่น → cascade: approvers/comments/attachments/notifications/issued ที่ผูก request
  await db.exec(`DELETE FROM requests WHERE requester_id IN (${L})`);
  // 2) เคลียร์ ref ของ demo ที่ค้างบนคำขอของคนจริง (ถ้ามี)
  await db.exec(`DELETE FROM request_approvers WHERE user_id IN (${L}) OR acted_by IN (${L}) OR added_by IN (${L}) OR from_user IN (${L})`);
  await db.exec(`DELETE FROM request_comments WHERE user_id IN (${L})`);
  await db.exec(`DELETE FROM attachments WHERE uploaded_by IN (${L})`);
  await db.exec(`UPDATE requests SET cleared_by=NULL WHERE cleared_by IN (${L})`);
  // 3) ตารางอื่นที่อ้าง demo
  await db.exec(`DELETE FROM flow_node_members WHERE user_id IN (${L})`);
  await db.exec(`DELETE FROM notifications WHERE user_id IN (${L})`);
  await db.exec(`DELETE FROM sessions WHERE user_id IN (${L})`);
  await db.exec(`UPDATE audit_log SET actor_id=NULL WHERE actor_id IN (${L})`);
  await db.exec(`UPDATE issued_documents SET issued_by=NULL WHERE issued_by IN (${L})`);
  await db.exec(`UPDATE delegations SET created_by=NULL WHERE created_by IN (${L})`);
  await db.exec(`DELETE FROM delegations WHERE from_user IN (${L}) OR to_user IN (${L})`);
  await db.exec(`UPDATE users SET manager_id=NULL WHERE manager_id IN (${L})`);
  // 4) ลบบัญชี demo
  await db.exec(`DELETE FROM users WHERE id IN (${L})`);
});

try {
  await run();
  console.log(`✅ ลบ demo เสร็จ (${ids.length} บัญชี + งานที่ผูกอยู่)`);
  process.exit(0);
} catch (e) {
  console.error("❌ ล้มเหลว — rollback ทั้งหมด ไม่มีอะไรถูกลบ:", e.message);
  process.exit(1);
}
