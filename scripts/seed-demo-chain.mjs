// Seed demo chain ที่ "ล็อกต่อกัน" จาก OA → ONE Asset → ค่าเสื่อม
// OA (ใบขอซื้ออนุมัติ) → fa.oa_records (คิวนำเข้า CREATED) → fa.assets (ขึ้นทะเบียน ACTIVE)
// + back-link external_status (ขากลับที่ Asset แจ้ง OA ว่า "ขึ้นทะเบียนแล้ว")
//
// ล็อกกันด้วย: OA doc_no  ==  oa_records.docNo/oaNo  ==  asset.source.oaNo
//             oa_records.id == asset.oaId ; oa_records.createdAssetIds == [asset ids]
//
// รันซ้ำได้ (idempotent) — ลบของเดิมที่ชื่อเดียวกันออกก่อนเสมอ
// ใช้งาน:  node scripts/seed-demo-chain.mjs   (ต้องตั้ง DATABASE_URL หรือใช้ default localhost)

import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const DOC_NO = 'AP-PURC-202604-0003';   // join key หลักของทั้งสาย (ซื้อช่วงต้นปีงบ)
const PO_NO = 'PO-202604-0003';
const INV_NO = 'INV-DELL-260407';
const OAREC_ID = `${DOC_NO}#1`;
// doc_no เดิมจากเดโมรอบก่อน — ล้างทิ้งด้วยถ้ามี
const STALE_DOC_NOS = ['AP-PURC-202610-0002'];
const STALE_OAREC_IDS = ['AP-PURC-202610-0002#1'];
const QTY = 5;
const UNIT_PRICE = 25700;
const AMOUNT = QTY * UNIT_PRICE;         // 128,500
const ACQ = '2026-04-07';
const READY = '2026-04-07';              // พร้อมใช้ เม.ย. → ค่าเสื่อมเดินมาแล้วหลายเดือน
const NOW = '2026-04-07T15:00:00+07:00';

const assetIds = Array.from({ length: QTY }, (_, i) => `A-DEMO-COM-${i + 1}`);
const assetCodes = assetIds.map((_, i) => `SHD-COM-26-${String(90001 + i)}`);

const client = new pg.Client({ connectionString: DB });

function assetData(i) {
  return {
    id: assetIds[i],
    code: assetCodes[i],
    nameTh: 'โน้ตบุ๊ก Dell Latitude 3550',
    nameEn: 'Dell Latitude 3550',
    description: 'โน้ตบุ๊กสำหรับทีม IT (จากใบขอซื้อ ' + DOC_NO + ')',
    categoryId: 'OFE',
    subcategoryId: 'OFE-COM',
    companyId: 'C-SHD',
    branchId: 'B-HQ',
    departmentId: 'D-IT',
    costCenterId: 'CC-IT',
    locationId: 'L-HQ-SRV',
    holderId: null,
    serialNumber: `DL3550-DEMO-${String(i + 1).padStart(2, '0')}`,
    brand: 'Dell',
    model: 'Latitude 3550',
    unit: 'unit',
    quantity: 1,
    originalCost: UNIT_PRICE,
    additionalCost: 0,
    residual: 1,
    lifeMonths: 36,              // OFE-COM = 3 ปี
    method: 'SL',
    policyId: 'P-OFE',
    acquisitionDate: ACQ,
    readyDate: READY,
    status: 'ACTIVE',
    hasPhoto: false,
    source: {
      sourceSystem: 'OA',
      oaNo: DOC_NO,
      poNo: PO_NO,
      invoiceNo: INV_NO,
      supplier: 'Advice IT Infinite PCL',
      purchaseDate: ACQ,
    },
    oaId: OAREC_ID,
    createdAt: NOW,
    createdBy: 'OA Import (demo)',
    updatedAt: NOW,
    updatedBy: 'OA Import (demo)',
  };
}

const oaRecordData = {
  id: OAREC_ID,
  oaNo: DOC_NO,
  docNo: DOC_NO,
  templateCode: 'PURCHASE',
  companyId: 'C-SHD',
  branchId: 'B-HQ',
  departmentId: 'D-IT',
  costCenterId: 'CC-IT',
  requester: 'ผู้ดูแลระบบ',
  approvedDate: '2026-04-07',
  itemName: 'Notebook Dell Latitude 3550',
  itemDescription: 'โน้ตบุ๊กสำหรับทีม IT',
  quantity: QTY,
  unit: 'unit',
  amount: AMOUNT,
  supplier: 'Advice IT Infinite PCL',
  invoiceNo: INV_NO,
  invoiceDate: '2026-04-07',
  poNo: PO_NO,
  locationId: 'L-HQ-SRV',
  documents: [`${DOC_NO}.pdf`, `${INV_NO}.pdf`],
  approvalRef: 'APR-PURC-0002',
  status: 'CREATED',
  suggestedSubcategoryId: 'OFE-COM',
  createdAssetIds: assetIds,
  importedAt: NOW,
};

const requestData = {
  doc_date: '2026-04-02',
  deal_no: '',
  subject: 'โน้ตบุ๊ก Dell Latitude 3550 (5 เครื่อง) ทีม IT',
  attention: '',
  cc: '',
  amount: AMOUNT,
  body: 'จัดซื้อโน้ตบุ๊กทดแทนเครื่องเก่าและสำหรับพนักงานใหม่ ทีม IT',
  vendor: 'Advice IT Infinite PCL',
  items: [
    { _id: 'd1', name: 'Notebook Dell Latitude 3550', qty: QTY, unit_price: UNIT_PRICE, note: 'ประกัน On-site 3 ปี' },
  ],
};

// สายอนุมัติ (อนุมัติครบทุกขั้น) — amount 128,500 ≥ 50,000 จึงผ่านผู้จัดการบัญชีด้วย
const approvers = [
  { stage: 'PRELIM', step_no: 1, node: 'หัวหน้าต้นสังกัด', user_id: 7, role: 'MD', at: '2026-04-02T11:00:00+07:00' },
  { stage: 'FINAL', step_no: 2, node: 'ฝ่ายจัดซื้อ', user_id: 8, role: 'PURCHASING', at: '2026-04-03T15:20:00+07:00' },
  { stage: 'FINAL', step_no: 3, node: 'ผู้จัดการฝ่ายบัญชี', user_id: 5, role: 'FINANCE_MANAGER', at: '2026-04-07T14:30:00+07:00' },
];

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    // 1) ล้างของเดิม (idempotent) — รวม doc_no ของเดโมรอบก่อนด้วย -----------
    const docNos = [DOC_NO, ...STALE_DOC_NOS];
    const prev = await client.query('SELECT id FROM requests WHERE doc_no = ANY($1::text[])', [docNos]);
    for (const r of prev.rows) {
      await client.query('DELETE FROM request_approvers WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM audit_log WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM issued_documents WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM external_status WHERE request_id=$1', [r.id]);
      await client.query('DELETE FROM requests WHERE id=$1', [r.id]);
    }
    await client.query('DELETE FROM fa.oa_records WHERE id = ANY($1::text[])', [[OAREC_ID, ...STALE_OAREC_IDS]]);
    await client.query(`DELETE FROM fa.assets WHERE id = ANY($1::text[])`, [assetIds]);

    // 2) OA request (APPROVED) ------------------------------------------
    const ins = await client.query(
      `INSERT INTO requests
         (doc_no, template_id, requester_id, title, amount, doc_date, data,
          status, stage, current_step, submitted_at, prelim_at, closed_at, oa_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED','FINAL',0,$8,$9,$10,$11)
       RETURNING id`,
      [DOC_NO, 2, 1, requestData.subject, AMOUNT, requestData.doc_date,
       JSON.stringify(requestData),
       '2026-04-02T09:10:00+07:00', '2026-04-03T11:00:00+07:00',
       '2026-04-07T14:30:00+07:00', assetCodes[0]],
    );
    const reqId = ins.rows[0].id;

    // 3) สายอนุมัติ (ทุกขั้น APPROVED) -----------------------------------
    for (const a of approvers) {
      await client.query(
        `INSERT INTO request_approvers
           (request_id, stage, step_no, node_name, kind, mode, user_id, job_role, status, comment, acted_at, acted_by)
         VALUES ($1,$2,$3,$4,'APPROVE','SEQUENTIAL',$5,$6,'APPROVED',$7,$8,$5)`,
        [reqId, a.stage, a.step_no, a.node, a.user_id, a.role, 'อนุมัติ', a.at],
      );
    }

    // 4) ประวัติการอนุมัติ ----------------------------------------------
    await client.query(
      `INSERT INTO audit_log (request_id, actor_id, action, detail, amount, created_at)
       VALUES ($1,1,'SUBMIT','สร้างและส่งอนุมัติ',$2,'2026-04-02T09:10:00+07:00'),
              ($1,5,'APPROVE','อนุมัติขั้นสุดท้าย (ผู้จัดการบัญชี)',$2,'2026-04-07T14:30:00+07:00'),
              ($1,NULL,'EXTERNAL','ขึ้นทะเบียนทรัพย์สินใน ONE Asset 5 รายการ',$2,'2026-04-07T15:00:00+07:00')`,
      [reqId, AMOUNT],
    );

    // 5) back-link: Asset แจ้ง OA ว่าขึ้นทะเบียนแล้ว ----------------------
    await client.query(
      `INSERT INTO external_status (request_id, source, state, external_ref, external_url, amount, occurred_at, note)
       VALUES ($1,'ONE Asset','RECORDED',$2,$3,$4,'2026-04-07T15:00:00+07:00',$5)`,
      [reqId, `${assetCodes[0]} +${QTY - 1}`,
       `http://localhost:3020/assets/${assetIds[0]}`, AMOUNT,
       `ขึ้นทะเบียนทรัพย์สิน ${QTY} รายการ (${assetCodes[0]}–${assetCodes[QTY - 1]})`],
    );

    // 6) Asset: OARecord (คิวนำเข้า CREATED) -----------------------------
    await client.query(
      `INSERT INTO fa.oa_records (id, doc_no, status, data) VALUES ($1,$2,$3,$4::jsonb)`,
      [OAREC_ID, DOC_NO, 'CREATED', JSON.stringify(oaRecordData)],
    );

    // 7) Asset: ขึ้นทะเบียน 5 เครื่อง (ACTIVE + readyDate) ----------------
    for (let i = 0; i < QTY; i++) {
      const d = assetData(i);
      await client.query(
        `INSERT INTO fa.assets (id, code, status, data) VALUES ($1,$2,$3,$4::jsonb)`,
        [d.id, d.code, d.status, JSON.stringify(d)],
      );
    }

    // 8) ขยับ counter OA ไม่ให้ชนกับใบจริงในอนาคต ------------------------
    await client.query(
      `INSERT INTO doc_counters (scope, period, seq) VALUES ('AP-PURC','202604',3)
       ON CONFLICT (scope, period) DO UPDATE SET seq = GREATEST(doc_counters.seq, 3)`,
    );

    await client.query('COMMIT');
    console.log('✓ seeded demo chain');
    console.log('  OA request :', DOC_NO, '(id', reqId + ', APPROVED, ฿' + AMOUNT.toLocaleString() + ')');
    console.log('  OA record  :', OAREC_ID, '(fa.oa_records, CREATED)');
    console.log('  Assets     :', assetCodes.join(', '), '(ACTIVE, ค่าเสื่อม SL 36 เดือน)');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ failed, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
