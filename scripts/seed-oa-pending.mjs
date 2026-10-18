// ใบ OA "ค้างอนุมัติ" ตัวอย่าง — ไว้โชว์หน้า /admin/pending (ภาพรวมรออนุมัติ)
// ครบ 4 กลุ่มเอกสาร หลายผู้อนุมัติ หลายระยะเวลารอ (มีค้างนานให้เห็นสีเตือน)
// มาร์ก oa_ref='DEMO-SEED' + doc_no ขึ้นต้น 'DEMO-P-' → ลบได้ด้วย seed-demo-many.mjs --clean
//   node scripts/seed-oa-pending.mjs   (idempotent)

import pg from 'pg';
const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const MARK = 'DEMO-SEED';
const TODAY = '2026-10-17';

const shift = (days) => { const t = new Date(TODAY + 'T09:00:00Z'); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 19) + '+07:00'; };

// code→template_id (จาก DB): DISCOUNT1 MARKETING3 REIMBURSE4 DAILY_EXPENSE10 BRANCH_COST11 PURCHASE2 DEMO_RETURN6 OTHER7
const T = { DISCOUNT: 1, MARKETING: 3, REIMBURSE: 4, DAILY_EXPENSE: 10, BRANCH_COST: 11, PURCHASE: 2, DEMO_RETURN: 6, OTHER: 7 };

// แต่ละใบ: tpl, requester, title, amount, daysAgo, stage, step, chain[]
// chain: {stage, step, node, users[], status} — step < current = APPROVED, step = current = PENDING
const DOCS = [
  { tpl: T.MARKETING, req: 3, title: 'ขออนุมัติงบแคมเปญโฆษณา 11.11', amount: 180000, days: 9, status: 'PENDING', stage: 'FINAL', step: 2,
    chain: [ {stage:'PRELIM',step:1,node:'หัวหน้าต้นสังกัด',users:[4],status:'APPROVED'},
             {stage:'FINAL',step:2,node:'ผู้จัดการฝ่ายบัญชี',users:[5],status:'PENDING'} ] },
  { tpl: T.DISCOUNT, req: 2, title: 'ขอส่วนลดพิเศษลูกค้ารายใหญ่ (กลุ่มโรงแรม)', amount: null, days: 2, status: 'PENDING', stage: 'PRELIM', step: 1,
    chain: [ {stage:'PRELIM',step:1,node:'หัวหน้าฝ่ายขาย',users:[4],status:'PENDING'} ] },
  { tpl: T.REIMBURSE, req: 6, title: 'เบิกค่าเดินทางปฏิบัติงานต่างจังหวัด', amount: 8500, days: 1, status: 'PENDING', stage: 'FINAL', step: 1,
    chain: [ {stage:'FINAL',step:1,node:'ผู้จัดการฝ่ายบัญชี',users:[5],status:'PENDING'} ] },
  { tpl: T.DAILY_EXPENSE, req: 6, title: 'ค่าใช้จ่ายประจำวันสำนักงาน (สัปดาห์นี้)', amount: 3200, days: 5, status: 'PENDING', stage: 'FINAL', step: 2,
    chain: [ {stage:'PRELIM',step:1,node:'หัวหน้าต้นสังกัด',users:[4],status:'APPROVED'},
             {stage:'FINAL',step:2,node:'ผู้จัดการฝ่ายบัญชี',users:[5],status:'PENDING'} ] },
  { tpl: T.BRANCH_COST, req: 2, title: 'ค่าใช้จ่ายสาขาเชียงใหม่ เดือน ต.ค.', amount: 42000, days: 12, status: 'PENDING', stage: 'FINAL', step: 1,
    chain: [ {stage:'FINAL',step:1,node:'ผู้จัดการฝ่ายบัญชี',users:[5],status:'PENDING'} ] },
  { tpl: T.PURCHASE, req: 1, title: 'จัดซื้อเซิร์ฟเวอร์ Dell PowerEdge R760', amount: 420000, days: 3, status: 'PRELIM_APPROVED', stage: 'FINAL', step: 2,
    chain: [ {stage:'PRELIM',step:1,node:'หัวหน้าต้นสังกัด',users:[7],status:'APPROVED'},
             {stage:'FINAL',step:2,node:'ฝ่ายจัดซื้อ + ผู้จัดการบัญชี',users:[8,5],status:'PENDING'} ] },
  { tpl: T.DEMO_RETURN, req: 2, title: 'เรียกคืนสินค้าเดโมจากหน้าร้าน', amount: null, days: 4, status: 'PENDING', stage: 'FINAL', step: 1,
    chain: [ {stage:'FINAL',step:1,node:'หัวหน้าคลังสินค้า',users:[4],status:'PENDING'} ] },
  { tpl: T.OTHER, req: 1, title: 'ขออนุมัติใช้ห้องประชุมใหญ่จัดอบรม', amount: null, days: 1, status: 'PENDING', stage: 'FINAL', step: 1,
    chain: [ {stage:'FINAL',step:1,node:'กรรมการผู้จัดการ',users:[7],status:'PENDING'} ] },
];

const client = new pg.Client({ connectionString: DB });
async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    // ล้างเฉพาะชุด pending demo (doc_no ขึ้นต้น DEMO-P-)
    const prev = await client.query(`SELECT id FROM requests WHERE doc_no LIKE 'DEMO-P-%'`);
    for (const r of prev.rows) {
      await client.query('DELETE FROM request_approvers WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM audit_log WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM requests WHERE id=$1', [r.id]);
    }

    let n = 0;
    for (const d of DOCS) {
      n += 1;
      const docNo = `DEMO-P-${String(n).padStart(3, '0')}`;
      const submitted = shift(-d.days);
      const prelimAt = d.chain.some((c) => c.stage === 'PRELIM' && c.status === 'APPROVED') ? shift(-d.days + 1) : null;
      const data = { subject: d.title, amount: d.amount, items: [] };
      const ins = await client.query(
        `INSERT INTO requests (doc_no, template_id, requester_id, title, amount, doc_date, data,
            status, stage, current_step, submitted_at, prelim_at, oa_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [docNo, d.tpl, d.req, d.title, d.amount, submitted.slice(0, 10), JSON.stringify(data),
         d.status, d.stage, d.step, submitted, prelimAt, MARK]);
      const reqId = ins.rows[0].id;

      for (const c of d.chain) {
        for (const uid of c.users) {
          await client.query(
            `INSERT INTO request_approvers (request_id, stage, step_no, node_name, kind, mode, user_id, status, comment, acted_at, acted_by)
             VALUES ($1,$2,$3,$4,'APPROVE','SEQUENTIAL',$5,$6,$7,$8,$9)`,
            [reqId, c.stage, c.step, c.node, uid, c.status,
             c.status === 'APPROVED' ? 'อนุมัติ' : '',
             c.status === 'APPROVED' ? shift(-d.days + 1) : null,
             c.status === 'APPROVED' ? uid : null]);
        }
      }
      await client.query(
        `INSERT INTO audit_log (request_id, actor_id, action, detail, amount, created_at)
         VALUES ($1,$2,'SUBMIT','สร้างและส่งอนุมัติ',$3,$4)`, [reqId, d.req, d.amount, submitted]);
      console.log(`  ${docNo}  ${d.title.slice(0,30).padEnd(30)} ${d.status.padEnd(15)} รอ ${d.days} วัน`);
    }
    await client.query('COMMIT');
    console.log(`\n✓ seeded ${DOCS.length} ใบค้างอนุมัติ (ดูที่ /admin/pending)`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ failed:', e.message);
    process.exitCode = 1;
  } finally { await client.end(); }
}
main();
