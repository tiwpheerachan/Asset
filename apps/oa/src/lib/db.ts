import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mergeStagesPlan, type StageNode } from "./single-stage";
import { db, DATA_DIR, UPLOAD_DIR, onSchemaReady } from "./pg";

/**
 * จุดเข้าเดียวของฐานข้อมูล — โค้ดส่วนอื่นทั้งระบบ import `db` จากที่นี่
 *
 * ตัวเชื่อมต่อจริงอยู่ใน pg.ts ไฟล์นี้เหลือหน้าที่เดียวคือเตรียมข้อมูลตั้งต้น
 * ให้ฐานข้อมูลที่เพิ่งสร้างใหม่ใช้งานได้ทันที
 *
 * เดิมไฟล์นี้ยาว 737 บรรทัดเพราะแบกขั้นตอนย้ายรุ่นของ SQLite ไว้ทั้งหมด
 * (memo → requests, แยกตารางแผนก, ยุบสายอนุมัติสองระดับ ฯลฯ) ซึ่งไม่ต้องใช้แล้ว
 * เพราะฐานข้อมูล Postgres เริ่มจากโครงรุ่นปัจจุบันแล้วนำเข้าข้อมูลครั้งเดียว
 * ประวัติเดิมยังอยู่ใน git ถ้าต้องย้อนดู
 */
export { db, DATA_DIR, UPLOAD_DIR };

const FORMS_PATH = path.join(process.cwd(), "src", "lib", "default-forms.json");

/**
 * ทุกที่ที่อ่านข้อมูลผู้ใช้ต้องใช้ SELECT นี้ เพื่อให้ได้ชื่อแผนกมาด้วยเสมอ
 * (users เก็บแค่ department_id — ชื่อแผนกอยู่ในตาราง departments)
 */
export const USER_SELECT = `
  SELECT u.*, COALESCE(d.name, '') AS department
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
`;

/* ==================== ธงบอกว่างานครั้งเดียวทำไปแล้ว ==================== */

async function getMeta(key: string): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get<{ value: string }>(key);
  return row?.value ?? "";
}

async function setMeta(key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO app_meta (key, value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

/* ==================== ข้อมูลตั้งต้น ==================== */

type SeedField = {
  field_key: string; label: string; type?: string; field_role?: string;
  required?: number; help?: string; options?: string[]; sort_order?: number;
  columns?: { col_key: string; label: string; type?: string; required?: number; options?: string[]; sort_order?: number }[];
};

/**
 * ใส่แม่แบบตั้งต้นครั้งแรกครั้งเดียวเท่านั้น
 *
 * เดิมเช็คแค่ว่าตารางว่างหรือไม่ ซึ่งแปลว่าถ้าผู้ดูแลตั้งใจลบแม่แบบทิ้งให้หมด
 * ของจะกลับมาเองตอนเปิดเซิร์ฟเวอร์ครั้งถัดไป — ตารางว่างจึงต้องแยกให้ออก
 * ระหว่าง "ยังไม่เคยติดตั้ง" กับ "ติดตั้งแล้วแต่เจ้าของระบบลบทิ้งเอง"
 */
async function seedForms(): Promise<void> {
  if ((await getMeta("forms_seeded")) === "1") return;

  const seed = JSON.parse(fs.readFileSync(FORMS_PATH, "utf8")) as {
    categories: { name: string; sort_order: number }[];
    base_fields: SeedField[];
    templates: {
      code: string; name: string; category: string; icon: string; description: string;
      sort_order: number; extra_fields: SeedField[];
      flow: {
        name: string; kind: string; mode: string; stage: string; sort_order: number;
        cond_field?: string; cond_op?: string; cond_value?: string;
        members: { source: string; job_role?: string; scope?: string }[];
      }[];
    }[];
  };

  await db.transaction(async () => {
    /*
     * จองสิทธิ์ใส่ข้อมูลด้วยการปักธงก่อนลงมือ
     *
     * การเช็ค "ปักธงหรือยัง" แล้วค่อยใส่ข้อมูล มีช่องว่างระหว่างสองขั้น — ถ้าแอปสอง
     * ตัวบูตพร้อมกัน (ซึ่งเกิดทุกครั้งที่เปลี่ยนรุ่นบน Render) ทั้งคู่จะเห็นว่ายังไม่มีธง
     * แล้วใส่แม่แบบชุดเดียวกันซ้ำ จนชนกับ UNIQUE ของ code แล้วแอปล้มตอนบูต
     *
     * ให้ฐานข้อมูลเป็นคนตัดสินแทน: คีย์ของ app_meta เป็น UNIQUE ผู้ที่ INSERT ติด
     * เท่านั้นที่ได้แถวคืนมา อีกฝ่ายได้ค่าว่างแล้วถอยออกไป
     * ทั้งหมดอยู่ใน transaction เดียวกับการใส่ข้อมูล — ถ้าใส่ไม่สำเร็จ ธงถูกย้อนคืนด้วย
     * ครั้งหน้าจึงยังใส่ใหม่ได้ ไม่ค้างอยู่ในสภาพ "ปักธงแล้วแต่ไม่มีข้อมูล"
     */
    const claimed = await db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES ('forms_seeded', '1')
         ON CONFLICT (key) DO NOTHING RETURNING key`,
      )
      .get<{ key: string }>();
    if (!claimed) return;

    // ระบบที่ติดตั้งไว้ก่อนมีธงนี้ — ธงถูกปักไปแล้วข้างบน ไม่ต้องใส่ซ้ำ
    const have = await db.prepare("SELECT COUNT(*) AS n FROM form_templates").get<{ n: number }>();
    if ((have?.n ?? 0) > 0) return;

    const insCat = db.prepare(
      "INSERT INTO form_categories (name, sort_order) VALUES (?,?) ON CONFLICT (name) DO NOTHING",
    );
    for (const c of seed.categories) await insCat.run(c.name, c.sort_order);
    const catId = db.prepare("SELECT id FROM form_categories WHERE name = ?");

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
      `INSERT INTO flow_node_members (node_id, source, job_role, scope) VALUES (?,?,?,?)`,
    );

    for (const t of seed.templates) {
      const cat = (await catId.get<{ id: number }>(t.category))?.id ?? null;
      const tplId = Number(
        (await insTpl.run(t.code, t.name, cat, t.icon, t.description, t.sort_order)).lastInsertRowid,
      );

      for (const f of [...seed.base_fields, ...t.extra_fields]) {
        const fieldId = Number(
          (
            await insField.run(
              tplId, f.field_key, f.label, f.type ?? "TEXT", f.field_role ?? "",
              f.required ?? 0, f.help ?? "", JSON.stringify(f.options ?? []), f.sort_order ?? 0,
            )
          ).lastInsertRowid,
        );
        for (const c of f.columns ?? []) {
          await insCol.run(
            fieldId, c.col_key, c.label, c.type ?? "TEXT", c.required ?? 0,
            JSON.stringify(c.options ?? []), c.sort_order ?? 0,
          );
        }
      }

      for (const node of t.flow) {
        const nodeId = Number(
          (
            await insNode.run(
              tplId, node.name, node.kind, node.mode, node.stage, node.sort_order,
              node.cond_field ?? "", node.cond_op ?? "", node.cond_value ?? "",
            )
          ).lastInsertRowid,
        );
        for (const m of node.members) {
          await insMember.run(nodeId, m.source, m.job_role ?? "", m.scope ?? "ANY");
        }
      }
    }
  })();
}

/**
 * ยุบสายอนุมัติสองระดับให้เหลือสายเดียว — ทำครั้งเดียวต่อฐานข้อมูล
 *
 * ไม่แตะเอกสารเก่าเลย ทั้งสถานะ "อนุมัติเบื้องต้นแล้ว" และประวัติการอนุมัติยังอยู่ครบ
 * เปลี่ยนเฉพาะ "แม่แบบ" ซึ่งเป็นตัวกำหนดว่าใบที่ยื่นต่อจากนี้จะวิ่งยังไง
 *
 * ยังต้องเก็บไว้เพราะ default-forms.json ยังเป็นสายสองระดับ — ฐานข้อมูลที่สร้างใหม่
 * จากศูนย์ต้องได้สายเดียวเหมือนของที่ใช้งานจริงอยู่
 */
async function mergeStages(): Promise<void> {
  if ((await getMeta("stages_merged")) === "1") return;

  const rows = await db
    .prepare("SELECT id, template_id, name, kind, stage, sort_order, active FROM flow_nodes")
    .all<StageNode & { template_id: number }>();

  const byTemplate = new Map<number, (StageNode & { template_id: number })[]>();
  for (const r of rows) {
    const list = byTemplate.get(r.template_id) ?? [];
    list.push(r);
    byTemplate.set(r.template_id, list);
  }

  const setOrder = db.prepare("UPDATE flow_nodes SET stage='FINAL', sort_order=? WHERE id=?");
  const off = db.prepare("UPDATE flow_nodes SET active=0 WHERE id=?");

  await db.transaction(async () => {
    for (const list of byTemplate.values()) {
      const plan = mergeStagesPlan(list);
      for (const r of plan.reorder) await setOrder.run(r.sort_order, r.id);
      for (const id of plan.deactivate) await off.run(id);
    }
    await setMeta("stages_merged", "1");
  })();
}

/**
 * ช่องตัวเลือกเดิมทั้งหมด → ดรอปดาวน์ (ครั้งเดียว)
 *
 * "ตัวเลือก (เลือกได้ 1)" แสดงเป็นปุ่มกลมที่เห็นตัวเลือกทั้งหมดพร้อมกัน แต่ฟอร์มใน
 * default-forms.json ออกแบบตอนที่ SELECT ยังเป็นดรอปดาวน์ — ถ้าไม่ย้าย ช่องเลือก
 * ธนาคาร 7 ตัวเลือกจะยืดยาวขึ้นทันทีโดยไม่มีใครสั่ง
 */
async function migrateSelectToDropdown(): Promise<void> {
  if ((await getMeta("select_to_dropdown")) === "1") return;
  await db.prepare("UPDATE form_fields SET type='DROPDOWN' WHERE type='SELECT'").run();
  await setMeta("select_to_dropdown", "1");
}

// ลงทะเบียนไว้ให้ pg.ts เรียกหลังสร้างตารางเสร็จ ก่อนคำสั่งแรกของแอปจะได้ทำงาน
onSchemaReady(async () => {
  await seedForms();
  await mergeStages();
  await migrateSelectToDropdown();
});

/**
 * เริ่มตัวตั้งเวลาสำรองข้อมูลจากที่นี่ ไม่ใช่ instrumentation.ts
 * เพราะไฟล์ instrumentation ถูกคอมไพล์นอก server bundle
 * โมดูลนี้โหลดแน่นอนตั้งแต่คำขอแรก และถูกกันไม่ให้เริ่มซ้ำอยู่แล้ว
 */
setTimeout(() => {
  import("./backup")
    .then((m) => m.startBackupScheduler())
    .catch((e) => console.error("[backup] เริ่มตัวตั้งเวลาไม่สำเร็จ", e));
  import("./integration")
    .then((m) => {
      const g = globalThis as { __hookTimer?: NodeJS.Timeout };
      if (g.__hookTimer) return;
      // ลองส่งซ้ำเป็นระยะ เผื่อ ERP ล่มตอนเกิดเหตุการณ์แล้วกลับมาทีหลัง
      g.__hookTimer = setInterval(() => m.flushWebhooksInBackground(), 300_000);
      g.__hookTimer.unref?.();
    })
    .catch(() => {});
  import("./reminders")
    .then((m) => m.startReminderScheduler())
    .catch((e) => console.error("[reminder] เริ่มตัวตั้งเวลาไม่สำเร็จ", e));
}, 5_000).unref?.();
