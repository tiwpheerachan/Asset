// Mirror เอกสาร OA ที่ "อนุมัติแล้ว" (已通过) จาก Postgres ของ OA → ตาราง oa_documents ใน ONEBOOK
// อ่านอย่างเดียวจาก OA · เขียนเฉพาะตารางของเรา (oa_documents) ใน ONEBOOK · ไม่แตะ journal/PEAK
// รัน: node oa-to-onebook.mjs            (ทั้งหมด idempotent, upsert ด้วย oa_key)
import fs from 'node:fs';
import { createRequire } from 'node:module';

const OA = '/Users/tiw/Downloads/shd-platform/apps/oa';
const pg = createRequire(`${OA}/package.json`)('pg');
const env = (k) => { for (const f of ['.env.local', '.env']) { try { const l = fs.readFileSync(`${OA}/${f}`, 'utf8').split('\n').find(x => x.startsWith(k + '=')); if (l) return l.slice(k.length + 1).trim().replace(/^['"]|['"]$/g, ''); } catch {} } return ''; };

const DB = env('DATABASE_URL');
const OB_URL = (env('ONEBOOK_SUPABASE_URL') || '').replace(/\/+$/, '');
const OB_KEY = env('ONEBOOK_SERVICE_KEY');
if (!DB || !OB_URL || !OB_KEY) { console.error('❌ ขาด DATABASE_URL / ONEBOOK_SUPABASE_URL / ONEBOOK_SERVICE_KEY'); process.exit(1); }

const AMOUNT_RE = /amount|总额|金额|ยอด|รวม|total|合计/i;
const d10 = (v) => { const s = String(v ?? ''); const m = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) && n !== 0 ? n : null; };
const first = (f, keys) => { for (const k of keys) { const v = f?.[k]; if (v != null && v !== '') return String(v); } return null; };

function mapRow(table_id, record_id, oa) {
  const f = oa.fields ?? {};
  const files = oa.attachments?.files ?? [];
  let aiSum = 0, aiFound = false, aiDocNo = null, aiSeller = null;
  for (const file of files) {
    const fin = file?.ai?.final;
    if (!fin) continue;
    if (typeof fin.total === 'number') { aiSum += fin.total; aiFound = true; }
    if (!aiDocNo && fin.doc_no) aiDocNo = String(fin.doc_no);
    if (!aiSeller && fin.seller) aiSeller = String(fin.seller);
  }
  let amountForm = null;
  for (const [k, v] of Object.entries(f)) { if (AMOUNT_RE.test(k)) { const n = num(v); if (n) { amountForm = n; break; } } }
  const cancelled = oa.flags?.cancelled === true || oa.flags?.cancelled === 'true';
  return {
    oa_key: record_id,
    serial: oa.serial ?? null,
    form_code: table_id,
    form_name: oa.form_name ?? null,
    status: oa.status ?? null,
    cancelled,
    applicant: first(f, ['发起人', 'ผู้ยื่น']),
    department: first(f, ['发起人部门', 'department&部门', 'Application sector&申请部门']),
    submit_date: d10(first(f, ['发起时间'])),
    finish_date: d10(first(f, ['完成时间'])),
    amount_form: amountForm,
    amount_ai: aiFound ? aiSum : null,
    files_count: files.length,
    ai_doc_no: aiDocNo,
    ai_seller: aiSeller,
  };
}

async function upsert(rows) {
  const res = await fetch(`${OB_URL}/rest/v1/oa_documents?on_conflict=oa_key`, {
    method: 'POST',
    headers: { apikey: OB_KEY, authorization: `Bearer ${OB_KEY}`, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`ONEBOOK ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const client = new pg.Client({ connectionString: DB });
await client.connect();
const started = Date.now();
const CHUNK = 1000;
let offset = 0, total = 0, pushed = 0;
const buf = [];
for (;;) {
  const { rows } = await client.query(
    `SELECT table_id, record_id, fields FROM feishu_records
      WHERE fields->>'status' = '已通过'
      ORDER BY modified_time DESC, record_id
      LIMIT $1 OFFSET $2`, [CHUNK, offset]);
  if (rows.length === 0) break;
  for (const r of rows) { try { buf.push(mapRow(r.table_id, r.record_id, r.fields)); } catch {} }
  total += rows.length; offset += rows.length;
  while (buf.length >= 500) { const b = buf.splice(0, 500); await upsert(b); pushed += b.length; process.stdout.write(`\rupserted ${pushed}`); }
  if (rows.length < CHUNK) break;
}
if (buf.length) { await upsert(buf); pushed += buf.length; }
await client.end();
console.log(`\n✅ OA→ONEBOOK: approved ${total} · upserted ${pushed} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
