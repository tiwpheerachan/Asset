// นำเข้าทะเบียนทรัพย์สินจริงจาก PEAK (ดึงผ่านเว็บ) เข้า ONE Asset (fa.assets)
// อ่าน ~/Downloads/peak-asset-register.json (code,name,qty,cost,accum,nbv)
// map เข้าหมวดเดิม (account ตรง PEAK) · เก็บชื่อ+รหัส PEAK จริง · NBV เป๊ะผ่าน field legacy (ค่าเสื่อมสะสมยกมา)
// รัน: DATABASE_URL=... node scripts/_import-peak-register.mjs
import pg from 'pg';
import { readFileSync } from 'node:fs';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const SRC = process.env.PEAK_JSON || '/Users/tiw/Downloads/peak-asset-register.json';
const c = new pg.Client({ connectionString: DB });
await c.connect();

// โหลด master หมวดย่อย (code -> sub)
const subRows = (await c.query(`select data from fa.categories where data->>'parentId' is not null`)).rows.map((r) => r.data);
const subByCode = new Map(subRows.map((s) => [s.code, s]));

// map รหัส/ชื่อ PEAK -> code หมวดย่อย (ใช้บัญชี 124106/107/108/109/125101 ให้ตรง PEAK)
function pickSub(code, name) {
  const p = (code.match(/^[A-Z]+/) || [''])[0];
  const n = String(name || '');
  if (p === 'COM') return 'COM';
  if (p === 'PRT') return 'PRT';
  if (p === 'MOB') return 'MOB';
  if (p === 'OEQ' || p === 'LAN') return 'OEQ';
  if (p === 'CHR') return 'CHR';
  if (p === 'TAB') return 'TAB';
  if (p === 'CAB') return 'CAB';
  if (p === 'FUR') return 'FUO';
  if (p === 'TRK') return 'TRK';
  if (p === 'SOF') return 'SOF';
  // legacy C-codes: แยกตามชื่อ (PEAK ลงบัญชี 124106 เป็นหลัก)
  if (/ปริ้น|ปริ็น|printer|epson|brother|laser|lq310|l3250|l3310|l5290|mfc|hp107/i.test(n)) return 'PRT';
  if (/คอมพิวเตอร|notebook|nootbook|\bnb\b|\bpc\b|asus|lenovo|acer|dell|macbook|\bram\b|\bcpu\b|\bssd\b|mini|aio|cashier|qashier|แคชเชีย|intel|router|switch|hub|archer|tp-link|สำรองไฟ|\bups\b/i.test(n)) return 'COM';
  // กล้อง/เลนส์/เครื่องกรองน้ำ/อื่น ๆ -> office equipment อื่น (124106)
  return 'OEQ';
}

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const now = new Date().toISOString();
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
let inserted = 0;
const unmapped = [];
const catCount = {};

try {
  await c.query('begin');
  for (const a of data) {
    const subCode = pickSub(a.code, a.name);
    const sub = subByCode.get(subCode);
    if (!sub) { unmapped.push(a.code + '->' + subCode); continue; }
    catCount[subCode] = (catCount[subCode] || 0) + 1;
    const cost = r2(a.cost);
    const accum = r2(a.accum);
    const nbv = r2(a.nbv != null ? a.nbv : cost - accum);
    const id = 'A-PK-' + a.code;
    const asset = {
      id, code: a.code,
      nameTh: a.name, nameEn: a.name, description: '',
      categoryId: sub.parentId, subcategoryId: sub.id,
      companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ADM', costCenterId: 'CC-ADM',
      locationId: null, holderId: null, serialNumber: '', brand: '', model: '',
      unit: sub.defaultUnit || 'unit', quantity: Math.max(1, Number(a.qty) || 1),
      originalCost: cost, additionalCost: 0,
      residual: sub.defaultResidual || 1, lifeMonths: (sub.defaultLifeYears || 5) * 12,
      method: sub.method || 'SL', policyId: 'P-' + sub.parentId,
      // readyDate = วันโอนย้ายทะเบียนจาก PEAK (งวดปัจจุบัน) — ค่าเสื่อมสะสมที่ยกมาถือ ณ งวดนี้
      acquisitionDate: '2026-10-01', readyDate: '2026-10-01',
      status: 'ACTIVE', hasPhoto: false,
      source: { sourceSystem: 'PEAK', peakCode: a.code, glAccountCode: sub.assetAccount },
      legacy: {
        openingNbv: nbv, openingAccum: accum, periodDep: 0, closingNbv: nbv, closingAccum: accum,
        assetAccount: sub.assetAccount, expenseAccount: sub.expenseAccount, accumAccount: sub.accumAccount,
      },
      createdAt: now, createdBy: 'PEAK Register Import', updatedAt: now, updatedBy: 'PEAK Register Import',
    };
    await c.query(
      `insert into fa.assets (id, code, status, data, version, updated_at)
       values ($1,$2,$3,$4,1,now())
       on conflict (id) do update set code=$2, status=$3, data=$4, updated_at=now()`,
      [id, a.code, 'ACTIVE', asset],
    );
    inserted++;
  }
  await c.query('commit');
  console.log('COMMITTED inserted/updated:', inserted);
} catch (e) {
  await c.query('rollback');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
}

// สรุป + ตรวจยอด
const agg = await c.query(`select count(*) n,
  round(sum((data->>'originalCost')::numeric),2) cost,
  round(sum((data->'legacy'->>'closingAccum')::numeric),2) accum,
  round(sum((data->'legacy'->>'closingNbv')::numeric),2) nbv from fa.assets`);
console.log('by category:', JSON.stringify(catCount));
console.log('unmapped:', unmapped.length ? unmapped.join(', ') : 'none');
console.log('TOTALS in fa.assets:', JSON.stringify(agg.rows[0]));
await c.end();
