// เสริม "ประวัติตั้งแต่เริ่มขอ" ให้ใบ OA demo (oa_ref='DEMO-SEED') ให้สมจริง
//  - timeline เวลาจริง: สร้างร่าง → ส่ง → อนุมัติทีละขั้น (ห่างกันเป็นวัน) → ปิดงาน → ขึ้นทะเบียนทรัพย์สิน
//  - ความเห็น (request_comments) ของผู้ขอและผู้อนุมัติ
//  - ไฟล์แนบ (attachments) ใบเสนอราคา/สเปก — วางไฟล์ placeholder จริงใน UPLOAD_DIR
//  - audit_log ครบตาม action จริงของระบบ (CREATE/SUBMIT/PRELIM_DONE/APPROVE/APPROVED_DONE/EXTERNAL_STATUS)
//
// รันหลัง seed-demo-many.mjs เสมอ · idempotent (ล้าง comment/attachment/audit ของใบ demo ก่อนสร้างใหม่)
//   node scripts/seed-oa-history.mjs

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const MARK = 'DEMO-SEED';
const UPLOAD_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'apps/oa/data'), 'uploads');

const shift = (dateStr, days) => {
  const t = new Date(dateStr + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};
const ts = (dateStr, days, hhmm) => `${shift(dateStr, days)}T${hhmm}:00+07:00`;

// ไฟล์แนบ placeholder (ใช้ร่วมกันทุกใบ) — ไฟล์จริงเพื่อให้เปิด/ดาวน์โหลดได้
const STORED = 'demo-quotation.txt';
const STORED_BODY = 'เอกสารตัวอย่าง (DEMO) — ใบเสนอราคา/สเปกสินค้า\nสร้างโดยสคริปต์ seed-oa-history.mjs เพื่อใช้ทดสอบระบบเท่านั้น\n';

const requesterComment = (s) => `ขออนุมัติจัดซื้อ ${s.item} จำนวน ${s.qty} ${s.unit} จากผู้ขาย ${s.vendor} แนบใบเสนอราคาเรียบร้อยแล้วครับ`;
const financeComment = 'ตรวจสอบงบประมาณและผังบัญชีสินทรัพย์แล้ว อยู่ในกรอบ อนุมัติให้ดำเนินการจัดซื้อได้';
const purchComment = 'ยืนยันราคากับผู้ขายแล้ว ออก PO และนัดส่งของได้เลย';

const client = new pg.Client({ connectionString: DB });

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    // ไฟล์ placeholder
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const storedPath = path.join(UPLOAD_DIR, STORED);
    if (!fs.existsSync(storedPath)) fs.writeFileSync(storedPath, STORED_BODY, 'utf8');
    const fsize = fs.statSync(storedPath).size;

    const reqs = await client.query(
      `SELECT id, doc_no, requester_id, amount, doc_date, data FROM requests WHERE oa_ref=$1 ORDER BY id`, [MARK]);
    if (reqs.rows.length === 0) { throw new Error('ไม่พบใบ demo (รัน seed-demo-many.mjs ก่อน)'); }

    let nComments = 0, nFiles = 0;
    for (const r of reqs.rows) {
      const acq = r.doc_date;                       // วันได้มา/พร้อมใช้
      const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      const items = data.items || [];
      const s = { item: items[0]?.name || data.subject, qty: items[0]?.qty || 1, unit: data.unit || 'หน่วย', vendor: data.vendor || '-' };

      // 1) ล้างของเดิมของใบนี้
      await client.query('DELETE FROM request_comments WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM attachments WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM audit_log WHERE request_id=$1', [r.id]);

      // 2) timeline ของใบ: ขอก่อนได้ของ ~12 วัน แล้วไล่อนุมัติ
      const submitted = ts(acq, -12, '09:10');
      const prelimAt = ts(acq, -10, '11:30');
      await client.query(
        `UPDATE requests SET submitted_at=$2, prelim_at=$3, closed_at=$4 WHERE id=$1`,
        [r.id, submitted, prelimAt, ts(acq, -6, '16:20')]);

      // 3) สายอนุมัติ — ประทับเวลาจริงไล่เป็นวัน
      const aps = (await client.query(
        `SELECT id, step_no, stage, user_id, node_name FROM request_approvers WHERE request_id=$1 ORDER BY step_no`, [r.id])).rows;
      const actAt = (i) => ts(acq, -10 + i * 2, '14:00');   // ขั้นแรก -10, ถัดไปห่าง 2 วัน
      for (let i = 0; i < aps.length; i++) {
        await client.query(`UPDATE request_approvers SET acted_at=$2, read_at=$2 WHERE id=$1`, [aps[i].id, actAt(i)]);
      }

      // 4) audit_log ครบตาม action จริง
      const audit = [];
      audit.push([r.requester_id, 'CREATE', 'บันทึกฉบับร่าง', ts(acq, -13, '17:00')]);
      audit.push([r.requester_id, 'SUBMIT', 'สร้างและส่งอนุมัติ', submitted]);
      for (let i = 0; i < aps.length; i++) {
        const a = aps[i];
        audit.push([a.user_id, 'APPROVE', `${a.node_name} อนุมัติ`, actAt(i)]);
        if (a.stage === 'PRELIM') audit.push([a.user_id, 'PRELIM_DONE', 'ผ่านอนุมัติเบื้องต้น', actAt(i)]);
      }
      audit.push([aps[aps.length - 1]?.user_id ?? r.requester_id, 'APPROVED_DONE', 'อนุมัติครบทุกขั้น', ts(acq, -6, '16:20')]);
      audit.push([null, 'EXTERNAL_STATUS', 'ขึ้นทะเบียนทรัพย์สินใน ONE Asset', ts(acq, 0, '15:00')]);
      for (const [actor, action, detail, at] of audit) {
        await client.query(
          `INSERT INTO audit_log (request_id, actor_id, action, detail, amount, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.id, actor, action, detail, r.amount, at]);
      }

      // 5) ความเห็น
      const comments = [
        [r.requester_id, requesterComment(s), ts(acq, -12, '09:12')],
        [aps.find((a) => a.stage === 'FINAL' && a.node_name.includes('จัดซื้อ'))?.user_id ?? 8, purchComment, ts(acq, -8, '14:05')],
      ];
      if (r.amount >= 50000) comments.push([5, financeComment, ts(acq, -6, '16:18')]);
      for (const [uid, body, at] of comments) {
        await client.query(
          `INSERT INTO request_comments (request_id, user_id, body, created_at) VALUES ($1,$2,$3,$4)`,
          [r.id, uid, body, at]);
        nComments++;
      }

      // 6) ไฟล์แนบ — ใบเสนอราคา
      await client.query(
        `INSERT INTO attachments (request_id, field_key, comment_id, filename, stored_name, mime, size, uploaded_by, created_at)
         VALUES ($1,'files',NULL,$2,$3,'text/plain',$4,$5,$6)`,
        [r.id, `ใบเสนอราคา-${s.vendor}.txt`, STORED, fsize, r.requester_id, ts(acq, -12, '09:11')]);
      nFiles++;
    }

    await client.query('COMMIT');
    console.log(`✓ enriched ${reqs.rows.length} OA requests`);
    console.log(`  timeline: ร่าง→ส่ง→อนุมัติไล่เป็นวัน→ปิด→ขึ้นทะเบียน`);
    console.log(`  comments: ${nComments} · attachments: ${nFiles} (ไฟล์จริงที่ ${path.join(UPLOAD_DIR, STORED)})`);
    console.log(`  audit_log: CREATE/SUBMIT/APPROVE/PRELIM_DONE/APPROVED_DONE/EXTERNAL_STATUS`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ failed, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
