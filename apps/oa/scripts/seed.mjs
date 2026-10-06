/**
 * สร้างโครงฐานข้อมูลและใส่ข้อมูลตัวอย่าง — ใช้ตอนตั้งเครื่องพัฒนาใหม่
 *
 *   DATABASE_URL=postgresql://localhost:5432/approve_dev npm run seed
 *
 * รันซ้ำได้ ของที่มีอยู่แล้วจะถูกข้าม (ผู้ใช้ยึดตามอีเมล แผนกยึดตามชื่อ)
 * แม่แบบฟอร์มและคำขอตัวอย่างจะใส่ให้เฉพาะตอนที่ยังไม่มีเลย
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { connect } from "./pg-lite.mjs";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const PASSWORD = process.env.SEED_PASSWORD || "password123";
const SRC = path.join(process.cwd(), "src", "lib");

// ไฟล์แนบยังเก็บบนดิสก์ ไม่ได้อยู่ในฐานข้อมูล
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

const db = connect();
await db.exec(fs.readFileSync(path.join(SRC, "schema.pg.sql"), "utf8"));

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/* ---------- แผนกและผู้ใช้ ---------- */

const DEPARTMENTS = ["ฝ่ายขาย", "ฝ่ายบัญชี", "ฝ่ายจัดซื้อ", "ฝ่ายไอที", "ผู้บริหาร"];
const addDept = db.prepare("INSERT INTO departments (name) VALUES (?) ON CONFLICT(name) DO NOTHING");
for (const d of DEPARTMENTS) await addDept.run(d);
const deptId = async (name) =>
  (await db.prepare("SELECT id FROM departments WHERE name=?").get(name)).id;

const USERS = [
  { email: "admin@company.co.th",    name: "ผู้ดูแลระบบ",    position: "IT Administrator",  department: "ฝ่ายไอที",    job_role: "NONE",            role: "ADMIN" },
  { email: "sales1@company.co.th",   name: "สมชาย ใจดี",     position: "ผู้แทนขาย",         department: "ฝ่ายขาย",     job_role: "SALES",           role: "USER" },
  { email: "sales2@company.co.th",   name: "ปรียา วงศ์ทอง",  position: "ผู้แทนขาย",         department: "ฝ่ายขาย",     job_role: "SALES",           role: "USER" },
  { email: "manager@company.co.th",  name: "วิชัย รุ่งเรือง",  position: "ผู้จัดการแผนก",     department: "ฝ่ายขาย",     job_role: "SALES_MANAGER",   role: "MANAGER" },
  { email: "finance@company.co.th",  name: "อรทัย ศรีสุข",    position: "ผู้จัดการฝ่ายบัญชี", department: "ฝ่ายบัญชี",   job_role: "FINANCE_MANAGER", role: "MANAGER" },
  { email: "acct@company.co.th",     name: "นภา แสงทอง",     position: "เจ้าหน้าที่บัญชี",   department: "ฝ่ายบัญชี",   job_role: "FINANCE",         role: "USER" },
  { email: "md@company.co.th",       name: "ธนกร พาณิชย์",   position: "กรรมการผู้จัดการ",  department: "ผู้บริหาร",   job_role: "MD",              role: "USER" },
  { email: "purchase@company.co.th", name: "กิตติ มั่นคง",    position: "หัวหน้าฝ่ายจัดซื้อ", department: "ฝ่ายจัดซื้อ", job_role: "PURCHASING",      role: "MANAGER" },
];

const insertUser = db.prepare(
  `INSERT INTO users (email, password, name, position, department_id, job_role, role)
   VALUES (@email, @password, @name, @position, @department_id, @job_role, @role)
   ON CONFLICT(email) DO NOTHING`,
);
for (const u of USERS) {
  await insertUser.run({
    ...u,
    department_id: await deptId(u.department),
    password: hashPassword(PASSWORD),
  });
}

/**
 * id ของผู้ใช้ตามอีเมล — อ่านมาเก็บไว้ครั้งเดียว
 * เดิมเรียกฐานข้อมูลใหม่ทุกครั้งที่ใช้ ซึ่งบน Postgres คือการวิ่งข้ามเครือข่ายหลายสิบรอบ
 */
const idByEmail = new Map(
  (await db.prepare("SELECT id, email FROM users").all()).map((r) => [r.email, r.id]),
);
const uid = (email) => idByEmail.get(email);

/* ---------- แม่แบบฟอร์ม ---------- */

if ((await db.prepare("SELECT COUNT(*) AS n FROM form_templates").get()).n === 0) {
  const seed = JSON.parse(fs.readFileSync(path.join(SRC, "default-forms.json"), "utf8"));

  const insCat = db.prepare(
    "INSERT INTO form_categories (name, sort_order) VALUES (?,?) ON CONFLICT(name) DO NOTHING",
  );
  for (const c of seed.categories) await insCat.run(c.name, c.sort_order);
  const catId = async (n) =>
    (await db.prepare("SELECT id FROM form_categories WHERE name=?").get(n))?.id ?? null;

  const insTpl = db.prepare(
    `INSERT INTO form_templates (code, name, category_id, icon, description, sort_order)
     VALUES (?,?,?,?,?,?)`,
  );
  const insField = db.prepare(
    `INSERT INTO form_fields
       (template_id, field_key, label, type, field_role, required, help, options, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const insCol = db.prepare(
    `INSERT INTO form_table_columns (field_id, col_key, label, type, required, options, sort_order)
     VALUES (?,?,?,?,?,?,?)`,
  );
  const insNode = db.prepare(
    `INSERT INTO flow_nodes
       (template_id, name, kind, mode, stage, sort_order, cond_field, cond_op, cond_value)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const insMember = db.prepare(
    "INSERT INTO flow_node_members (node_id, source, job_role, scope) VALUES (?,?,?,?)",
  );

  await db.transaction(async () => {
    for (const t of seed.templates) {
      const tplId = Number(
        (await insTpl.run(t.code, t.name, await catId(t.category), t.icon, t.description, t.sort_order))
          .lastInsertRowid,
      );
      for (const f of [...seed.base_fields, ...t.extra_fields]) {
        const fid = Number(
          (await insField.run(
            tplId, f.field_key, f.label, f.type ?? "TEXT", f.field_role ?? "",
            f.required ?? 0, f.help ?? "", JSON.stringify(f.options ?? []), f.sort_order ?? 0,
          )).lastInsertRowid,
        );
        for (const c of f.columns ?? []) {
          await insCol.run(fid, c.col_key, c.label, c.type ?? "TEXT", c.required ?? 0,
                           JSON.stringify(c.options ?? []), c.sort_order ?? 0);
        }
      }
      for (const n of t.flow) {
        const nid = Number(
          (await insNode.run(tplId, n.name, n.kind, n.mode, n.stage, n.sort_order,
                             n.cond_field ?? "", n.cond_op ?? "", n.cond_value ?? "")).lastInsertRowid,
        );
        for (const m of n.members) {
          await insMember.run(nid, m.source, m.job_role ?? "", m.scope ?? "ANY");
        }
      }
    }
  })();
}

const tplByCode = new Map(
  (await db.prepare("SELECT id, code FROM form_templates").all()).map((r) => [r.code, r.id]),
);
const tplId = (code) => tplByCode.get(code);

/* ---------- คำขอตัวอย่าง ---------- */

if ((await db.prepare("SELECT COUNT(*) AS n FROM requests").get()).n === 0) {
  const today = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString();
  const p = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const docPrefix = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  let seq = 0;
  const docNo = () => `${docPrefix}${String(++seq).padStart(4, "0")}`;

  const addReq = db.prepare(
    `INSERT INTO requests (doc_no, template_id, requester_id, title, amount, doc_date, data,
                           status, stage, current_step, submitted_at, prelim_at)
     VALUES (@doc_no,@template_id,@requester_id,@title,@amount,@doc_date,@data,
             @status,@stage,@current_step,@submitted_at,@prelim_at)`,
  );
  const addAppr = db.prepare(
    `INSERT INTO request_approvers
       (request_id, stage, step_no, node_name, kind, mode, user_id, job_role, title, status, comment, acted_at, read_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const addLog = db.prepare(
    "INSERT INTO audit_log (request_id, actor_id, action, detail, amount) VALUES (?,?,?,?,?)",
  );

  // 1) ส่วนลด — ผ่านเบื้องต้นแล้ว รออนุมัติจริงขั้นที่ 1
  const r1 = (await addReq.run({
    doc_no: docNo(), template_id: tplId("DISCOUNT"), requester_id: uid("sales1@company.co.th"),
    title: "ขออนุมัติส่วนลดพิเศษ 12% ให้ลูกค้า บจก. ไทยเจริญ",
    amount: 1100000, doc_date: today,
    data: JSON.stringify({
      doc_date: today, deal_no: "SD-2026-0142",
      subject: "ขออนุมัติส่วนลดพิเศษ 12% ให้ลูกค้า บจก. ไทยเจริญ",
      attention: "กรรมการผู้จัดการ", cc: "ฝ่ายบัญชี", amount: 1100000,
      body: "ลูกค้าสั่งซื้อระบบกล้องวงจรปิด 48 จุด มูลค่าก่อนส่วนลด 1,250,000 บาท\n" +
            "คู่แข่งเสนอต่ำกว่าประมาณ 9% จึงขอส่วนลดพิเศษเพื่อรักษาโอกาสปิดการขาย",
      customer: "บจก. ไทยเจริญ", discount_pct: 12, margin_after: 22,
    }),
    status: "PENDING", stage: "FINAL", current_step: 1,
    submitted_at: stamp, prelim_at: stamp,
  })).lastInsertRowid;
  await addAppr.run(r1, "PRELIM", 1, "หัวหน้าฝ่ายขาย", "APPROVE", "SEQUENTIAL", uid("manager@company.co.th"), "SALES_MANAGER", "ผู้จัดการแผนก", "APPROVED", "เห็นควรให้เจรจาต่อ", stamp, null);
  await addAppr.run(r1, "FINAL", 1, "หัวหน้าฝ่ายขาย", "APPROVE", "SEQUENTIAL", uid("manager@company.co.th"), "SALES_MANAGER", "ผู้จัดการแผนก", "PENDING", "", null, null);
  await addAppr.run(r1, "FINAL", 2, "ผู้จัดการฝ่ายบัญชี", "APPROVE", "SEQUENTIAL", uid("finance@company.co.th"), "FINANCE_MANAGER", "ผู้จัดการฝ่ายบัญชี", "PENDING", "", null, null);
  await addAppr.run(r1, "FINAL", 3, "กรรมการผู้จัดการ", "APPROVE", "SEQUENTIAL", uid("md@company.co.th"), "MD", "กรรมการผู้จัดการ", "PENDING", "", null, null);
  await addAppr.run(r1, "FINAL", 4, "แจ้งฝ่ายบัญชี", "CC", "SEQUENTIAL", uid("acct@company.co.th"), "FINANCE", "เจ้าหน้าที่บัญชี", "PENDING", "", null, null);
  await addLog.run(r1, uid("sales1@company.co.th"), "SUBMIT", "สร้างและส่งอนุมัติเบื้องต้น", 1100000);
  await addLog.run(r1, uid("manager@company.co.th"), "PRELIM_DONE", "ผ่านอนุมัติเบื้องต้น — เริ่มเจรจาได้", 1100000);
  await addLog.run(r1, uid("sales1@company.co.th"), "SUBMIT_FINAL", "ยื่นอนุมัติจริง", 1100000);

  // 2) เรียกคืนสินค้าเดโม — ขั้นขนาน "ใครก็ได้ 1 คน" กำลังรออยู่
  const r2 = (await addReq.run({
    doc_no: docNo(), template_id: tplId("DEMO_RETURN"), requester_id: uid("sales2@company.co.th"),
    title: "ขอเรียกคืนเครื่องตัวอย่าง Dreame Aqua 10 Roller จาก KOL",
    amount: null, doc_date: today,
    data: JSON.stringify({
      doc_date: today, deal_no: "",
      subject: "ขอเรียกคืนเครื่องตัวอย่าง Dreame Aqua 10 Roller จาก KOL",
      attention: "ฝ่ายจัดซื้อ", cc: "", amount: null,
      body: "เบิกเครื่องตัวอย่างให้ KOL รีวิว ครบกำหนดคืนแล้ว",
      borrower: uid("sales1@company.co.th"),
      sku: [{ sku: "Dreame Aqua10 Roller White", qty: 1, note: "เครื่องรีวิว", contact: uid("sales1@company.co.th") }],
      product_status: "เครื่องตัวอย่าง", return_by: today,
      ship_to: "คลังสินค้าสำนักงานใหญ่ ฝ่ายจัดซื้อ",
    }),
    status: "PENDING", stage: "FINAL", current_step: 2,
    submitted_at: stamp, prelim_at: null,
  })).lastInsertRowid;
  await addAppr.run(r2, "FINAL", 1, "หัวหน้าต้นสังกัด", "APPROVE", "SEQUENTIAL", uid("manager@company.co.th"), "SALES_MANAGER", "ผู้จัดการแผนก", "APPROVED", "ครบกำหนดคืนแล้ว", stamp, null);
  await addAppr.run(r2, "FINAL", 2, "ฝ่ายคลัง / จัดซื้อ", "APPROVE", "ANY", uid("purchase@company.co.th"), "PURCHASING", "หัวหน้าฝ่ายจัดซื้อ", "PENDING", "", null, null);
  await addAppr.run(r2, "FINAL", 2, "ฝ่ายคลัง / จัดซื้อ", "APPROVE", "ANY", uid("acct@company.co.th"), "FINANCE", "เจ้าหน้าที่บัญชี", "PENDING", "", null, null);
  await addAppr.run(r2, "FINAL", 3, "แจ้งบัญชีเพื่อตัดสต๊อก", "CC", "SEQUENTIAL", uid("finance@company.co.th"), "FINANCE_MANAGER", "ผู้จัดการฝ่ายบัญชี", "PENDING", "", null, null);
  await addLog.run(r2, uid("sales2@company.co.th"), "SUBMIT", "ส่งคำขอ", null);
  await addLog.run(r2, uid("manager@company.co.th"), "APPROVE", "ครบกำหนดคืนแล้ว", null);

  // 3) การตลาด — ผ่านเบื้องต้น รอผู้จัดทำยืนยันมูลค่าจริง
  const r3 = (await addReq.run({
    doc_no: docNo(), template_id: tplId("MARKETING"), requester_id: uid("sales1@company.co.th"),
    title: "ขออนุมัติค่าใช้จ่ายออกบูธงาน Thailand Tech Expo 2026",
    amount: 180000, doc_date: today,
    data: JSON.stringify({
      doc_date: today, deal_no: "",
      subject: "ขออนุมัติค่าใช้จ่ายออกบูธงาน Thailand Tech Expo 2026",
      attention: "ผู้จัดการแผนก", cc: "", amount: 180000,
      body: "ขออนุมัติเบื้องต้นเพื่อจองพื้นที่บูธ 3x6 เมตร โซน B\nอยู่ระหว่างรวบรวมใบเสนอราคาผู้รับเหมา 3 ราย",
      activity: "ออกบูธ Thailand Tech Expo 2026", period: "15–18 ตุลาคม 2569",
    }),
    status: "PRELIM_APPROVED", stage: "PRELIM", current_step: 1,
    submitted_at: stamp, prelim_at: stamp,
  })).lastInsertRowid;
  await addAppr.run(r3, "PRELIM", 1, "หัวหน้าต้นสังกัด", "APPROVE", "SEQUENTIAL", uid("manager@company.co.th"), "SALES_MANAGER", "ผู้จัดการแผนก", "APPROVED", "จองพื้นที่ได้ รอสรุปราคา", stamp, null);
  await addLog.run(r3, uid("sales1@company.co.th"), "SUBMIT", "ส่งอนุมัติเบื้องต้น", 180000);
  await addLog.run(r3, uid("manager@company.co.th"), "PRELIM_DONE", "อนุมัติเบื้องต้น — จองพื้นที่ได้", 180000);

  // 4) ใบลดหนี้ — แบบร่าง
  const r4 = (await addReq.run({
    doc_no: docNo(), template_id: tplId("CREDIT_NOTE"), requester_id: uid("sales2@company.co.th"),
    title: "ขออนุมัติออกใบลดหนี้ให้ บจก. สยามพัฒนา กรณีสินค้าชำรุด",
    amount: null, doc_date: today,
    data: JSON.stringify({
      doc_date: today, deal_no: "SD-2026-0131",
      subject: "ขออนุมัติออกใบลดหนี้ให้ บจก. สยามพัฒนา กรณีสินค้าชำรุด",
      attention: "ผู้จัดการฝ่ายบัญชี", cc: "", amount: null,
      body: "อยู่ระหว่างรอผลตรวจสอบสินค้าคืนจากฝ่ายเทคนิค",
      customer: "บจก. สยามพัฒนา", invoice_no: "INV-2026-0881", reason: "สินค้าชำรุด",
    }),
    status: "DRAFT", stage: "FINAL", current_step: 0, submitted_at: null, prelim_at: null,
  })).lastInsertRowid;
  await addLog.run(r4, uid("sales2@company.co.th"), "CREATE", "บันทึกแบบร่าง", null);
}

console.log("เสร็จสิ้น");
console.log(`ผู้ใช้ตัวอย่าง (รหัสผ่านเหมือนกันทุกคน: ${PASSWORD})`);
for (const u of USERS) {
  const badge = u.role === "ADMIN" ? " [ผู้ดูแลระบบ]" : u.role === "MANAGER" ? " [หัวหน้าทีม]" : "";
  console.log(`  ${u.email.padEnd(26)} ${u.name} — ${u.position}${badge}`);
}
console.log(`\nแม่แบบฟอร์มและสายอนุมัติเริ่มต้นเป็นค่าตัวอย่าง — แก้ที่เมนู "แม่แบบฟอร์ม" ด้วยบัญชี admin`);

await db.close();
