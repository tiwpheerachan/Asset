// สร้างข้อมูลจำลองหลากหลายแนว 20 ใบขอซื้อ (OA → ONE Asset → ค่าเสื่อม) ที่ล็อกต่อกันทั้งสาย
// ครอบหลายหมวด / หลายแผนก / หลายสาขา / วันที่ซื้อกระจาย 2565–2569 / ราคาหลากหลาย / แยกชิ้นบ้างไม่แยกบ้าง
//
// รัน :  node scripts/seed-demo-many.mjs          สร้าง (ลบ demo เก่าออกก่อนเสมอ)
// ลบ  :  node scripts/seed-demo-many.mjs --clean   ลบ demo ทั้งหมดออก (ตอนจะใช้จริง)
//
// ตัวระบุว่าเป็น demo (ใช้ตอนลบ): requests.oa_ref='DEMO-SEED' · fa.oa_records.id LIKE 'DEMO-%' · fa.assets.id LIKE 'A-DEMO-%'

import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const CLEAN = process.argv.includes('--clean');
const MARK = 'DEMO-SEED';

// แผนก → ผู้ขอ (user id) และหัวสายอนุมัติ
const DEPT_REQUESTER = { 'D-IT': 1, 'D-SALES': 2, 'D-ACC': 6, 'D-ADM': 1, 'D-HR': 1, 'D-LOG': 8, 'D-LIVE': 2, 'D-MKT': 3, 'D-ECOM': 3 };
const BRANCH_OF = { 'L-HQ-1': 'B-HQ', 'L-HQ-2': 'B-HQ', 'L-HQ-3': 'B-HQ', 'L-HQ-SRV': 'B-HQ', 'L-WH-A': 'B-WH', 'L-WH-DOCK': 'B-WH', 'L-STU-1': 'B-STU', 'L-STU-2': 'B-STU', 'L-SR-1': 'B-SR' };

// catalog — [cat, sub, subcode, policy, lifeYears, nameTh, nameEn, brand, model, unit, unitPrice, qty, vendor, dept, loc, acqDate, split, status]
const C = (cat, sub, subcode, pol, life, nameTh, nameEn, brand, model, unit, price, qty, vendor, dept, loc, acq, split, status = 'ACTIVE') =>
  ({ cat, sub, subcode, pol, life, nameTh, nameEn, brand, model, unit, price, qty, vendor, dept, loc, acq, split, status });

const CATALOG = [
  C('OFE','OFE-COM','COM','P-OFE',3,'โน้ตบุ๊ก Dell Latitude 3550','Dell Latitude 3550','Dell','Latitude 3550','เครื่อง',25700,5,'Advice IT Infinite PCL','D-IT','L-HQ-SRV','2026-04-07',true),
  C('OFE','OFE-COM','COM','P-OFE',3,'MacBook Pro 14 M4','MacBook Pro 14 M4','Apple','MBP14 M4','เครื่อง',72000,2,'iStudio by SPVi','D-MKT','L-HQ-2','2025-11-12',true),
  C('OFE','OFE-PRT','PRT','P-OFE',5,'เครื่องพิมพ์เลเซอร์ Brother','Brother Laser Printer','Brother','HL-L3270CDW','เครื่อง',8900,3,'Office Mate','D-ADM','L-HQ-1','2024-02-20',true,'PENDING_REVIEW'),
  C('OFE','OFE-MOB','MOB','P-OFE',3,'iPhone 15 (ทีมขาย)','iPhone 15','Apple','iPhone 15 128GB','เครื่อง',32900,4,'Power Buy','D-SALES','L-HQ-1','2025-09-01',true),
  C('OFE','OFE-AC','AC','P-OFE',5,'เครื่องปรับอากาศ Daikin 18000 BTU','Daikin AC 18000BTU','Daikin','FTKM18','เครื่อง',24500,2,'ไทยแอร์ เซอร์วิส','D-ADM','L-HQ-3','2023-05-15',true),
  C('OFE','OFE-APP','APP','P-OFE',5,'ตู้เย็น + ไมโครเวฟ ห้องพักพนักงาน','Pantry Appliances','Samsung','Mixed','ชุด',15900,1,'Power Buy','D-HR','L-HQ-2','2024-08-01',false,'DRAFT'),
  C('FUR','FUR-CHR','CHR','P-FUR',5,'เก้าอี้สำนักงาน Ergonomic','Ergonomic Office Chair','Ergotrix','E-300','ตัว',6900,10,'Modernform','D-ADM','L-HQ-2','2024-01-10',false),
  C('FUR','FUR-TAB','TAB','P-FUR',5,'โต๊ะทำงาน','Work Desk','Modernform','WD-120','ตัว',4500,8,'Modernform','D-ADM','L-HQ-2','2023-01-05',false),
  C('FUR','FUR-CAB','CAB','P-FUR',5,'ตู้เก็บเอกสารเหล็ก','Steel Filing Cabinet','Lucky','LK-4D','ตู้',5200,4,'Office Mate','D-ACC','L-HQ-1','2022-09-20',false),
  C('NET','NET-NET','NETW','P-NET',5,'Core Switch + Router','Cisco Switch & Router','Cisco','C9200 / RV345','ชุด',45000,2,'นิพนธ์ เน็ตเวิร์ค','D-IT','L-HQ-SRV','2024-06-11',true),
  C('NET','NET-CCTV','CCTV','P-NET',5,'กล้องวงจรปิด Hikvision','Hikvision CCTV','Hikvision','DS-2CD2143','ตัว',3800,6,'เอสบี ซีเคียวริตี้','D-LOG','L-WH-A','2025-03-18',false),
  C('NET','NET-UPS','UPS','P-NET',5,'UPS APC Smart-UPS 3kVA','APC Smart-UPS 3kVA','APC','SMT3000','เครื่อง',28000,2,'นิพนธ์ เน็ตเวิร์ค','D-IT','L-HQ-SRV','2023-11-02',true),
  C('STU','STU-CAM','CAM','P-STU',5,'กล้อง Sony A7 IV + เลนส์','Sony A7 IV + Lens','Sony','A7 IV','ชุด',98000,2,'Big Camera','D-LIVE','L-STU-1','2025-07-07',true),
  C('STU','STU-LIGHT','LGT','P-STU',5,'ชุดไฟสตูดิโอ Godox','Godox Lighting Kit','Godox','SL-200 Kit','ชุด',42000,1,'Zoom Camera','D-LIVE','L-STU-2','2024-10-15',false),
  C('STU','STU-AUDIO','AUD','P-STU',5,'ไมโครโฟน Shure + Mixer','Shure Mic + Mixer','Shure','SM7B + MG10','ชุด',36000,1,'เสียงดีโปรเซาด์','D-LIVE','L-STU-1','2025-02-01',false),
  C('TOOL','TOOL-WH','WHT','P-TOOL',5,'รถเข็น + ชั้นวางคลังสินค้า','Warehouse Trolley & Rack','Sakura','Mixed','ชุด',7800,5,'โฮมโปร โปรเจกต์','D-LOG','L-WH-A','2023-03-12',false),
  C('MAC','MAC-PROD','PROD','P-MAC',5,'เครื่องแพ็คสินค้าอัตโนมัติ','Auto Packing Machine','Hualian','DBF-900','เครื่อง',185000,1,'ไทยแพ็คกิ้ง','D-LOG','L-WH-DOCK','2022-07-01',false),
  C('VEH','VEH-PICK','PICK','P-VEH',5,'รถกระบะ Isuzu D-Max','Isuzu D-Max','Isuzu','D-Max 1.9','คัน',785000,1,'ตรีเพชรอีซูซุเซลส์','D-LOG','L-WH-DOCK','2023-08-20',false),
  C('VEH','VEH-MC','MC','P-VEH',5,'รถจักรยานยนต์ส่งของ','Delivery Motorcycle','Honda','Wave 125i','คัน',52000,3,'เอ.พี.ฮอนด้า','D-LOG','L-WH-A','2024-12-05',true),
  C('INT','INT-SOF','SOF','P-INT',3,'License Adobe CC + Microsoft 365','Adobe CC + M365 License','Adobe/Microsoft','Team Annual','สิทธิ์',120000,1,'คอมเซเว่น','D-IT','L-HQ-SRV','2025-01-15',false),
];

const client = new pg.Client({ connectionString: DB });

const pad = (n, w = 2) => String(n).padStart(w, '0');
const approverChain = (amount) => {
  const rows = [
    { stage: 'PRELIM', step_no: 1, node: 'หัวหน้าต้นสังกัด', user_id: 4, role: 'MANAGER' },
    { stage: 'FINAL', step_no: 2, node: 'ฝ่ายจัดซื้อ', user_id: 8, role: 'PURCHASING' },
  ];
  if (amount >= 50000) rows.push({ stage: 'FINAL', step_no: rows.length + 1, node: 'ผู้จัดการฝ่ายบัญชี', user_id: 5, role: 'FINANCE_MANAGER' });
  if (amount >= 300000) rows.push({ stage: 'FINAL', step_no: rows.length + 1, node: 'กรรมการผู้จัดการ', user_id: 7, role: 'MD' });
  return rows;
};

async function clean() {
  // ลบลูกก่อน (FK by request_id) แล้วค่อยลบ requests ที่เป็น demo
  const reqs = await client.query(
    `SELECT id FROM requests WHERE oa_ref=$1 OR doc_no IN ('AP-PURC-202604-0003','AP-PURC-202610-0002')`, [MARK]);
  for (const r of reqs.rows) {
    for (const t of ['request_approvers', 'audit_log', 'issued_documents', 'external_status'])
      await client.query(`DELETE FROM ${t} WHERE request_id=$1`, [r.id]);
    await client.query('DELETE FROM requests WHERE id=$1', [r.id]);
  }
  const oa = await client.query(`DELETE FROM fa.oa_records WHERE id LIKE 'DEMO-%' OR id IN ('AP-PURC-202604-0003#1','AP-PURC-202610-0002#1')`);
  const as = await client.query(`DELETE FROM fa.assets WHERE id LIKE 'A-DEMO-%'`);
  return { reqs: reqs.rows.length, oa: oa.rowCount, assets: as.rowCount };
}

async function main() {
  await client.connect();
  await client.query('BEGIN');
  try {
    const cl = await clean();
    if (CLEAN) {
      await client.query('COMMIT');
      console.log(`✓ cleaned demo — requests ${cl.reqs}, oa_records ${cl.oa}, assets ${cl.assets}`);
      return;
    }

    let seq = 0;          // running number สำหรับ id/โค้ดทรัพย์สินให้ไม่ชนกัน
    let docSeq = 9000;    // running number สำหรับเลขที่เอกสาร OA (9xxx = ช่วง demo ไม่ชนของจริง)
    let totalAssets = 0;

    for (const s of CATALOG) {
      docSeq += 1;
      const yyyymm = s.acq.slice(0, 4) + s.acq.slice(5, 7);
      const docNo = `AP-PURC-${yyyymm}-${docSeq}`;
      const poNo = `PO-${yyyymm}-${docSeq}`;
      const invNo = `INV-${s.subcode}-${s.acq.slice(2, 4)}${s.acq.slice(5, 7)}${s.acq.slice(8, 10)}`;
      const oaRecId = `DEMO-${docNo}#1`;
      const amount = s.price * s.qty;
      const lifeMonths = s.life * 12;
      const requester = DEPT_REQUESTER[s.dept] || 1;
      const branch = BRANCH_OF[s.loc] || 'B-HQ';
      const cc = `CC-${s.dept.replace('D-', '')}`;
      const now = `${s.acq}T15:00:00+07:00`;
      const yy = s.acq.slice(2, 4);

      // ทรัพย์สินที่จะเกิด (แยกชิ้น = qty ชิ้น, ไม่แยก = 1 ชิ้นถือ qty)
      const nUnits = s.split ? s.qty : 1;
      const assetIds = [];
      const assetCodes = [];
      for (let i = 0; i < nUnits; i++) {
        seq += 1;
        assetIds.push(`A-DEMO-${pad(seq, 3)}`);
        assetCodes.push(`SHD-${s.subcode}-${yy}-${90000 + seq}`);
      }
      const canDep = s.status === 'ACTIVE';   // คิดค่าเสื่อมเมื่อ ACTIVE + มี readyDate

      // 1) OA request (APPROVED) ----------------------------------------
      const data = {
        doc_date: s.acq, deal_no: '', subject: `${s.nameTh} (${s.qty} ${s.unit}) ${s.dept.replace('D-', '')}`,
        attention: '', cc: '', amount, body: `จัดซื้อ ${s.nameTh} สำหรับแผนก`, vendor: s.vendor,
        items: [{ _id: 'i1', name: s.nameEn, qty: s.qty, unit_price: s.price, note: '' }],
      };
      const ins = await client.query(
        `INSERT INTO requests (doc_no, template_id, requester_id, title, amount, doc_date, data,
            status, stage, current_step, submitted_at, prelim_at, closed_at, oa_ref)
         VALUES ($1,2,$2,$3,$4,$5,$6,'APPROVED','FINAL',0,$7,$7,$7,$8) RETURNING id`,
        [docNo, requester, data.subject, amount, s.acq, JSON.stringify(data), now, MARK]);
      const reqId = ins.rows[0].id;

      // 2) approvers (APPROVED ทุกขั้น) ---------------------------------
      for (const a of approverChain(amount))
        await client.query(
          `INSERT INTO request_approvers (request_id, stage, step_no, node_name, kind, mode, user_id, job_role, status, comment, acted_at, acted_by)
           VALUES ($1,$2,$3,$4,'APPROVE','SEQUENTIAL',$5,$6,'APPROVED','อนุมัติ',$7,$5)`,
          [reqId, a.stage, a.step_no, a.node, a.user_id, a.role, now]);

      // 3) audit + back-link -------------------------------------------
      await client.query(
        `INSERT INTO audit_log (request_id, actor_id, action, detail, amount, created_at)
         VALUES ($1,$2,'SUBMIT','สร้างและส่งอนุมัติ',$3,$4),($1,5,'APPROVE','อนุมัติครบ',$3,$4)`,
        [reqId, requester, amount, now]);
      if (canDep)
        await client.query(
          `INSERT INTO external_status (request_id, source, state, external_ref, external_url, amount, occurred_at, note)
           VALUES ($1,'ONE Asset','RECORDED',$2,$3,$4,$5,$6)`,
          [reqId, assetCodes[0] + (nUnits > 1 ? ` +${nUnits - 1}` : ''),
           `http://localhost:3020/assets/${assetIds[0]}`, amount, now,
           `ขึ้นทะเบียนทรัพย์สิน ${nUnits} รายการ`]);

      // 4) fa.oa_records (CREATED) --------------------------------------
      const oaRec = {
        id: oaRecId, oaNo: docNo, docNo, templateCode: 'PURCHASE', companyId: 'C-SHD',
        branchId: branch, departmentId: s.dept, costCenterId: cc, requester: 'ผู้ขอซื้อ',
        approvedDate: s.acq, itemName: s.nameEn, itemDescription: s.nameTh, quantity: s.qty,
        unit: s.unit, amount, supplier: s.vendor, invoiceNo: invNo, invoiceDate: s.acq, poNo,
        locationId: s.loc, documents: [`${docNo}.pdf`], approvalRef: `APR-${docSeq}`,
        status: 'CREATED', suggestedSubcategoryId: s.sub, createdAssetIds: assetIds, importedAt: now,
      };
      await client.query(`INSERT INTO fa.oa_records (id, doc_no, status, data) VALUES ($1,$2,'CREATED',$3::jsonb)`,
        [oaRecId, docNo, JSON.stringify(oaRec)]);

      // 5) fa.assets ----------------------------------------------------
      for (let i = 0; i < nUnits; i++) {
        const a = {
          id: assetIds[i], code: assetCodes[i], nameTh: s.nameTh, nameEn: s.nameEn,
          description: `${s.nameTh} (จากใบขอซื้อ ${docNo})`,
          categoryId: s.cat, subcategoryId: s.sub, companyId: 'C-SHD', branchId: branch,
          departmentId: s.dept, costCenterId: cc, locationId: s.loc, holderId: null,
          serialNumber: s.split ? `${s.subcode}-${pad(seq - nUnits + i + 1, 4)}` : '',
          brand: s.brand, model: s.model, unit: s.unit, quantity: s.split ? 1 : s.qty,
          originalCost: s.price * (s.split ? 1 : s.qty), additionalCost: 0, residual: 1,
          lifeMonths, method: 'SL', policyId: s.pol, acquisitionDate: s.acq,
          readyDate: canDep ? s.acq : null, status: s.status, hasPhoto: false,
          source: { sourceSystem: 'OA', oaNo: docNo, poNo, invoiceNo: invNo, supplier: s.vendor, purchaseDate: s.acq },
          oaId: oaRecId, createdAt: now, createdBy: 'OA Import (demo)', updatedAt: now, updatedBy: 'OA Import (demo)',
        };
        await client.query(`INSERT INTO fa.assets (id, code, status, data) VALUES ($1,$2,$3,$4::jsonb)`,
          [a.id, a.code, a.status, JSON.stringify(a)]);
      }
      totalAssets += nUnits;
      console.log(`  ${docNo}  ${s.nameTh.slice(0, 28).padEnd(28)}  ${s.status.padEnd(14)} ฿${amount.toLocaleString().padStart(9)}  ×${nUnits}`);
    }

    await client.query('COMMIT');
    console.log(`\n✓ seeded ${CATALOG.length} OA purchases → ${totalAssets} assets (locked chain OA→asset→depreciation)`);
    console.log(`  ลบออกเมื่อจะใช้จริง:  node scripts/seed-demo-many.mjs --clean`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ failed, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
