// ตั้งสายอนุมัติฟอร์ม "ค่าใช้จ่ายสาขา" (BRANCH_COST · template 11) ตามตัวอย่างระบบเดิม
//  - สร้าง/จับคู่ผู้อนุมัติจากไดเรกทอรี Lark (ยึดอีเมล → แถวใน users) เป็น source=USER
//  - ล้างสาย flow เดิมของ template 11 แล้วสร้างใหม่ (idempotent)
// โครงสร้าง: APPROVE Kae → APPROVE KB → AR/AP (ใครก็ได้ 1 คน) → CC → AC → APPROVE Yaling → CC → APPROVE Earth → CC สิ้นสุด
//   node: kind APPROVE|CC · mode ALL|ANY|SEQUENTIAL · stage FINAL
//   รัน: node scripts/setup-branchcost-flow.mjs

import pg from 'pg';
const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const TEMPLATE_ID = 11; // BRANCH_COST

// คน (คีย์ → ชื่อแสดง, อีเมลจากไดเรกทอรีกลาง)
const P = {
  kae:   ['Kae - Kulrawee',  'kea.kulrawee@shd-technology.co.th'],
  kb:    ['KB陈金彪',         'kb@shd-company.com'],
  tina:  ['Tina - Arusnee',  'tina.arusnee@rabbitthailand.co.th'],
  earn:  ['Earn - Puntaree', 'earn.puntaree@shd-technology.co.th'],
  earth: ['Earth - Kobsit',  'earth.kobsit@rabbitthailand.co.th'],
  carol: ['李晶',            'carol@shd-company.com'],
  yaling:['Yaling',          'yaling@shd-company.com'],
  chaya: ['蔡桂蓉',          'chaya@shd-company.com'],
  ella:  ['吴艳芳',          'ella@shd-company.com'],
  vincent:['陈金智',         'vincent@shd-company.com'],
  lucas: ['陈金亮',          'lucas@shd-company.com'],
  richard:['李玉祥',         'richard@shd-company.com'],
  dark:  ['陈少伟',          'dark@shd-company.com'],
  lu:    ['卢随娣',          'lu@shd-company.com'],
};

// สายอนุมัติ (เรียงตาม sort_order) — members เป็นคีย์ของ P
const NODES = [
  { name: 'ผู้อนุมัติต้นทาง',        kind: 'APPROVE', mode: 'ALL', members: ['kae'] },
  { name: 'ผู้อนุมัติลำดับถัดไป',     kind: 'APPROVE', mode: 'ALL', members: ['kb'] },
  { name: 'AR/AP (ใครก็ได้ 1 คน)',   kind: 'APPROVE', mode: 'ANY', members: ['tina', 'earn', 'earth'] },
  { name: 'สำเนาถึง — AR/AP',        kind: 'CC',      mode: 'ALL', members: ['earn', 'tina', 'earth'] },
  { name: 'AC — ตรวจบัญชี',          kind: 'APPROVE', mode: 'ALL', members: ['carol'] },
  { name: 'ตรวจทาน',                 kind: 'APPROVE', mode: 'ALL', members: ['yaling'] },
  { name: 'สำเนาถึง — ทีมบัญชี',      kind: 'CC',      mode: 'ALL', members: ['chaya', 'ella'] },
  { name: 'อนุมัติขั้นสุดท้าย',       kind: 'APPROVE', mode: 'ALL', members: ['earth'] },
  { name: 'สำเนาถึง (สิ้นสุด)',       kind: 'CC',      mode: 'ALL',
    members: ['vincent', 'kb', 'lucas', 'richard', 'dark', 'chaya', 'yaling', 'lu', 'carol', 'ella'] },
];

const client = new pg.Client({ connectionString: DB });

async function upsertUser(name, email) {
  const r = await client.query(
    `INSERT INTO users (email, password, name, role, active, must_change_password)
     VALUES ($1, 'sso$' || replace(gen_random_uuid()::text,'-',''), $2, 'USER', 1, 0)
     ON CONFLICT (email) DO UPDATE SET active=1, name=EXCLUDED.name
     RETURNING id`,
    [email.toLowerCase(), name],
  );
  return r.rows[0].id;
}

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    // 1) จับคู่/สร้างผู้ใช้ทั้งหมด
    const uid = {};
    for (const [key, [name, email]] of Object.entries(P)) uid[key] = await upsertUser(name, email);

    // 2) ล้าง flow เดิมของ template นี้ (members ก่อน แล้ว nodes)
    await client.query(
      `DELETE FROM flow_node_members WHERE node_id IN (SELECT id FROM flow_nodes WHERE template_id=$1)`,
      [TEMPLATE_ID]);
    await client.query(`DELETE FROM flow_nodes WHERE template_id=$1`, [TEMPLATE_ID]);

    // 3) สร้าง node + member ใหม่ (stage FINAL, เรียงตาม sort_order)
    let order = 0;
    for (const n of NODES) {
      order += 1;
      const node = await client.query(
        `INSERT INTO flow_nodes (template_id, name, kind, mode, stage, sort_order, cond_field, cond_op, cond_value, active)
         VALUES ($1,$2,$3,$4,'FINAL',$5,'','','',1) RETURNING id`,
        [TEMPLATE_ID, n.name, n.kind, n.mode, order]);
      const nodeId = node.rows[0].id;
      for (const key of n.members) {
        await client.query(
          `INSERT INTO flow_node_members (node_id, source, job_role, user_id, scope)
           VALUES ($1,'USER','',$2,'ANY')`,
          [nodeId, uid[key]]);
      }
      console.log(`  #${order} ${n.kind.padEnd(7)} ${n.mode.padEnd(4)} ${n.name}  (${n.members.length} คน)`);
    }

    await client.query('COMMIT');
    console.log(`\n✓ ตั้งสายอนุมัติ BRANCH_COST เสร็จ — ${NODES.length} ขั้น, ผู้เกี่ยวข้อง ${Object.keys(P).length} คน`);
    console.log('  ดู/ปรับได้ที่  /admin/forms  → ค่าใช้จ่ายสาขา');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ failed:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();
