/** ตัวช่วยสร้างข้อมูลตั้งต้นให้แต่ละเทสต์ — คุมเองทั้งหมด ไม่พึ่งข้อมูลตัวอย่าง */
const { db } = require("../.test-build/lib/db.js");

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** ชื่อแผนกเป็น UNIQUE — ถ้ามีอยู่แล้วให้ใช้ตัวเดิม เทสต์จะได้เรียกชื่อเดียวกันซ้ำได้ */
async function makeDept(name = `แผนก-${uniq()}`) {
  const hit = (await db.prepare("SELECT id FROM departments WHERE name = ?").get(name));
  if (hit) return hit.id;
  return Number(((await db.prepare("INSERT INTO departments (name) VALUES (?)").run(name))).lastInsertRowid);
}

async function makeUser({ name, role = "USER", deptId = null, jobRole = "NONE", active = 1, managerId = null, canAudit = 0 } = {}) {
  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO users
             (email, password, name, position, department_id, manager_id, can_audit, job_role, role, active)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(`${uniq()}@t.local`, "x$nohash", name ?? `คน-${uniq()}`, "", deptId, managerId, canAudit, jobRole, role, active)
    ).lastInsertRowid,
  );
  return (await db
    .prepare("SELECT u.*, COALESCE(d.name,'') AS department FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.id=?")
    .get(id));
}

async function makeTemplate(name = `ฟอร์ม-${uniq()}`) {
  name = `${name} ${uniq()}`;
  const cat = (await db.prepare("SELECT id FROM form_categories LIMIT 1").get());
  const catId = cat
    ? cat.id
    : Number(((await db.prepare("INSERT INTO form_categories (name) VALUES ('ทดสอบ')").run())).lastInsertRowid);
  return Number(
    (
      await db
        .prepare("INSERT INTO form_templates (category_id, code, name, active) VALUES (?,?,?,1)")
        .run(catId, `T-${uniq()}`, name)
    ).lastInsertRowid,
  );
}

async function makeRequest({ templateId, requesterId, status = "PENDING", amount = null, title = "เรื่องทดสอบ", stage = "FINAL", step = 1 }) {
  return Number(
    (
      await db
        .prepare(
          `INSERT INTO requests (doc_no, template_id, requester_id, title, amount, status, stage, current_step, submitted_at)
           VALUES (?,?,?,?,?,?,?,?,utc_now_text())`,
        )
        .run(`DOC-${uniq()}`, templateId, requesterId, title, amount, status, stage, step)
    ).lastInsertRowid,
  );
}

async function addApprover({ requestId, step, userId, kind = "APPROVE", mode = "SEQUENTIAL", stage = "FINAL", name = "", notifiedAt = "now" }) {
  return Number(
    (
      await db
        .prepare(
          `INSERT INTO request_approvers (request_id, stage, step_no, node_name, kind, mode, user_id, title, status, notified_at)
           VALUES (?,?,?,?,?,?,?,?, 'PENDING', ${notifiedAt === null ? "NULL" : "utc_now_text()"})`,
        )
        .run(requestId, stage, step, name || `ขั้น ${step}`, kind, mode, userId, "")
    ).lastInsertRowid,
  );
}

/** ย้อนเวลาที่งานตกถึงมือ เพื่อทดสอบการเตือนงานค้าง */
async function ageApprover(rowId, days) {
  await db
    .prepare("UPDATE request_approvers SET notified_at=utc_now_text(?) WHERE id=?")
    .run(`-${days} days`, rowId);
}

/**
 * ล้างข้อมูลเอกสารระหว่างเทสต์
 *
 * Postgres ปิด foreign key ชั่วคราวไม่ได้ถ้าไม่ใช่ superuser (ต่างจาก SQLite ที่สั่ง
 * pragma ได้) จึงต้องลบไล่จากตารางลูกขึ้นไปหาตารางแม่ตามลำดับความผูกพัน
 * ผู้ใช้ แผนก และแม่แบบไม่ถูกล้าง — เทสต์สร้างของตัวเองแบบไม่ซ้ำกันอยู่แล้ว
 */
async function wipe() {
  // doc_counters ต้องล้างด้วย — ตัวนับเลขเอกสารตั้งใจไม่ถอยหลังแม้แถวถูกลบ
  // (เลขที่ออกไปแล้วต้องไม่ถูกใช้ซ้ำ) เทสต์ที่ล้างข้อมูลแล้วคาดว่าเริ่มนับหนึ่งใหม่
  // จึงต้องล้างตัวนับไปพร้อมกัน
  for (const t of ["webhook_deliveries", "issued_documents", "delegations", "login_attempts",
                   "notifications", "audit_log", "attachments", "request_comments",
                   "request_approvers", "requests", "doc_counters"]) {
    (await db.prepare(`DELETE FROM ${t}`).run());
  }
}

module.exports = { db, makeDept, makeUser, makeTemplate, makeRequest, addApprover, ageApprover, wipe };
