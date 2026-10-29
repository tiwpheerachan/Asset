// upsert ทรัพย์สินใหม่จาก PEAK GL (ไฟล์ gl-latest.json ที่ Claude ดึงมา) เข้า fa.assets
// เพิ่มเฉพาะ asset_code ที่ยังไม่มีในระบบ · ของใหม่ accum=0 → NBV=cost · ไม่ลบ/ไม่แก้ของเดิม
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/approve_dev';
const SRC = '/Users/tiw/Downloads/shd-platform/scripts/peak-raw/gl-latest.json';
if (!existsSync(SRC)) { console.log('no gl-latest.json — skip'); process.exit(0); }

const lines = JSON.parse(readFileSync(SRC, 'utf8')).filter((x) => x && x.asset_code && Number(x.debit) > 0);
const c = new pg.Client({ connectionString: DB });
await c.connect();

const subRows = (await c.query(`select data from fa.categories where data->>'parentId' is not null`)).rows.map((r) => r.data);
const subByCode = new Map(subRows.map((s) => [s.code, s]));
const existing = new Set((await c.query(`select code from fa.assets`)).rows.map((r) => r.code));

function pickSub(code, name) {
  const p = (code.match(/^[A-Z]+/) || [''])[0];
  const n = String(name || '');
  if (p === 'COM') return 'COM'; if (p === 'PRT') return 'PRT'; if (p === 'MOB') return 'MOB';
  if (p === 'OEQ' || p === 'LAN') return 'OEQ'; if (p === 'CHR') return 'CHR'; if (p === 'TAB') return 'TAB';
  if (p === 'CAB') return 'CAB'; if (p === 'FUR') return 'FUO'; if (p === 'TRK') return 'TRK'; if (p === 'SOF') return 'SOF';
  if (/ปริ้น|ปริ็น|printer|epson|brother|laser|lq310|l3250|l3310|l5290|mfc|hp107/i.test(n)) return 'PRT';
  if (/คอมพิวเตอร|notebook|nootbook|\bnb\b|\bpc\b|asus|lenovo|acer|dell|macbook|\bram\b|\bcpu\b|\bssd\b|mini|aio|intel|router|switch|hub|archer|tp-link|สำรองไฟ|\bups\b/i.test(n)) return 'COM';
  return 'OEQ';
}
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const iso = (v) => { const s = String(v).replace(/[^0-9]/g, ''); return s.length >= 8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : '2026-10-01'; };

// รวมยอดตาม asset_code (หลายบรรทัด = ยอดรวมของชิ้นนั้น) + วันแรกสุด + ชื่อจาก description
const byCode = new Map();
for (const l of lines) {
  const code = l.asset_code;
  const cur = byCode.get(code) || { code, cost: 0, date: '99999999', desc: l.description || '', vendor: l.vendor || '' };
  cur.cost = r2(cur.cost + Number(l.debit));
  if (String(l.date) < cur.date) cur.date = String(l.date);
  byCode.set(code, cur);
}

const now = new Date().toISOString();
let added = 0; const skipped = [];
try {
  await c.query('begin');
  for (const a of byCode.values()) {
    if (existing.has(a.code)) { skipped.push(a.code); continue; }
    const subCode = pickSub(a.code, a.desc);
    const sub = subByCode.get(subCode); if (!sub) continue;
    const cost = r2(a.cost);
    const buy = iso(a.date);
    const id = 'A-PK-' + a.code;
    const nameTh = (a.desc.split(' - ')[0] || sub.name.th) + (a.code ? ` (${a.code})` : '');
    const asset = {
      id, code: a.code, nameTh, nameEn: nameTh, description: '',
      categoryId: sub.parentId, subcategoryId: sub.id,
      companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ADM', costCenterId: 'CC-ADM',
      locationId: null, holderId: null, serialNumber: '', brand: '', model: '',
      unit: sub.defaultUnit || 'unit', quantity: 1, originalCost: cost, additionalCost: 0,
      residual: sub.defaultResidual || 1, lifeMonths: (sub.defaultLifeYears || 5) * 12,
      method: sub.method || 'SL', policyId: 'P-' + sub.parentId,
      acquisitionDate: buy, readyDate: buy, status: 'ACTIVE', hasPhoto: false,
      source: { sourceSystem: 'PEAK', peakCode: a.code, glAccountCode: sub.assetAccount, vendor: a.vendor },
      legacy: { openingNbv: cost, openingAccum: 0, periodDep: 0, closingNbv: cost, closingAccum: 0,
                assetAccount: sub.assetAccount, expenseAccount: sub.expenseAccount, accumAccount: sub.accumAccount },
      createdAt: now, createdBy: 'PEAK Auto-Refresh', updatedAt: now, updatedBy: 'PEAK Auto-Refresh',
    };
    await c.query(`insert into fa.assets (id,code,status,data,version,updated_at) values ($1,$2,'ACTIVE',$3,1,now()) on conflict (id) do nothing`, [id, a.code, asset]);
    added++;
  }
  await c.query('commit');
} catch (e) { await c.query('rollback'); console.error('UPSERT ROLLBACK:', e.message); process.exit(1); }
console.log(`PEAK auto-refresh: +${added} new assets · ${skipped.length} already existed · scanned ${byCode.size} codes`);
await c.end();
