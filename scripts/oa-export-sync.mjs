// โหลด OA จาก Export API เข้า Postgres ของ OA โดยตรง (อ่านอย่างเดียวจากต้นทาง)
// รัน: node oa-export-bootstrap.mjs [maxPages]   (ไม่ใส่ = ดึงทั้งหมด · ต่อ cursor ได้)
import fs from 'node:fs';
import { createRequire } from 'node:module';

const OA = '/Users/tiw/Downloads/shd-platform/apps/oa';
const pg = createRequire(`${OA}/package.json`)('pg');
const env = (k) => { for (const f of ['.env.local', '.env']) { try { const l = fs.readFileSync(`${OA}/${f}`,'utf8').split('\n').find(x=>x.startsWith(k+'=')); if (l) return l.slice(k.length+1).trim().replace(/^['"]|['"]$/g,''); } catch {} } return ''; };

const DB = env('DATABASE_URL');
const BASE = (env('OA_EXPORT_URL')||'https://34-21-223-128.sslip.io').replace(/\/+$/,'');
const KEY = env('OA_EXPORT_KEY');
const MAXPAGES = Number(process.argv[2] || 100000);
if (!DB || !KEY) { console.error('❌ ขาด DATABASE_URL / OA_EXPORT_KEY'); process.exit(1); }

const client = new pg.Client({ connectionString: DB });
await client.connect();
const started = Date.now();

// ตารางปลายทาง (idempotent — ตรงกับ schema ของ OA)
await client.query(`
  CREATE TABLE IF NOT EXISTS feishu_tables (
    table_id TEXT PRIMARY KEY, app_token TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE, last_synced_at TEXT NOT NULL DEFAULT '',
    last_cursor BIGINT NOT NULL DEFAULT 0, record_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS feishu_records (
    table_id TEXT NOT NULL REFERENCES feishu_tables(table_id) ON DELETE CASCADE,
    record_id TEXT NOT NULL, fields JSONB NOT NULL DEFAULT '{}'::jsonb, modified_time BIGINT NOT NULL DEFAULT 0,
    origin TEXT NOT NULL DEFAULT 'lark', oa_request_id INTEGER, synced_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (table_id, record_id));
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS oa_sync_log (id BIGSERIAL PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), source text NOT NULL DEFAULT 'cron', pages int NOT NULL DEFAULT 0, fetched int NOT NULL DEFAULT 0, changed int NOT NULL DEFAULT 0, total int NOT NULL DEFAULT 0, ms int NOT NULL DEFAULT 0, ok boolean NOT NULL DEFAULT true, error text);
`);

const api = async (p) => { const r = await fetch(`${BASE}${p}`, { headers:{ authorization:`Bearer ${KEY}` } }); if(!r.ok) throw new Error(`API ${r.status}`); return r.json(); };
const nowIso = () => new Date().toISOString();
const epoch = (s) => { const t = Date.parse((s||'').replace(' ','T')+'+07:00'); return Number.isFinite(t)?t:0; };

// 1) ฟอร์ม
const { forms } = await api('/api/export/v1/forms');
for (const f of forms) {
  await client.query(
    `INSERT INTO feishu_tables (table_id,app_token,name,record_count,last_synced_at) VALUES ($1,'oa-export',$2,$3,$4)
     ON CONFLICT (table_id) DO UPDATE SET name=EXCLUDED.name, record_count=EXCLUDED.record_count, last_synced_at=EXCLUDED.last_synced_at`,
    [f.form_code, f.form_name, f.oa_count, nowIso()]);
}
console.log(`✅ ฟอร์ม ${forms.length} อัน · OA ต้นทางรวม ~${forms.reduce((a,b)=>a+(b.oa_count||0),0).toLocaleString()}`);

// 2) OA ทีละหน้า ต่อ cursor
const cur = await client.query(`SELECT value FROM app_meta WHERE key='oa_export_cursor'`);
let after = cur.rows[0]?.value || '';
let pages = 0, count = 0, more = true;
console.log(after ? `▶ ต่อจาก cursor เดิม` : `▶ เริ่มจากต้น`);
while (pages < MAXPAGES) {
  const page = await api(`/api/export/v1/oa?limit=500${after?`&after=${encodeURIComponent(after)}`:''}`);
  await client.query('BEGIN');
  for (const oa of page.items) {
    await client.query(
      `INSERT INTO feishu_records (table_id,record_id,fields,modified_time,origin,synced_at)
       VALUES ($1,$2,$3::jsonb,$4,'lark',$5)
       ON CONFLICT (table_id,record_id) DO UPDATE SET fields=EXCLUDED.fields, modified_time=EXCLUDED.modified_time, synced_at=EXCLUDED.synced_at`,
      [oa.form_code, oa.oa_key, JSON.stringify(oa).replace(/\\u0000/g, ''), epoch(oa.updated_at), nowIso()]);
    count++;
  }
  after = page.next || after;
  await client.query(`INSERT INTO app_meta (key,value) VALUES ('oa_export_cursor',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,[after]);
  await client.query('COMMIT');
  pages++; more = Boolean(page.more);
  if (pages % 5 === 0 || !more) console.log(`  …หน้า ${pages} · สะสม ${count.toLocaleString()} OA`);
  if (!more) break;
}
const tot = await client.query(`SELECT COUNT(*)::int n FROM feishu_records`);
console.log(`\n🎉 ซิงก์แล้ว ${count.toLocaleString()} OA (ในรอบนี้) · ในฐานข้อมูลตอนนี้ ${tot.rows[0].n.toLocaleString()} แถว`);
console.log(more ? `ยังไม่ครบ — รันซ้ำคำสั่งเดิมเพื่อดึงต่อ (cursor บันทึกแล้ว)` : `ครบทั้งหมดแล้ว ✅`);
// บันทึกประวัติการซิงก์รอบนี้
try {
  const chg = await client.query(`SELECT COUNT(*)::int n FROM oa_change_log WHERE at >= to_timestamp($1)`, [started / 1000]);
  await client.query(
    `INSERT INTO oa_sync_log (source, pages, fetched, changed, total, ms, ok) VALUES ('cron',$1,$2,$3,$4,$5,true)`,
    [pages, count, chg.rows[0]?.n ?? 0, tot.rows[0].n, Date.now() - started]);
} catch (e) { console.error('log err', e.message); }
// บำรุง DB: รีเฟรชสถิติเมื่อมีข้อมูลใหม่ → planner ใช้ index ถูก หน้าโหลดเร็ว
if (count > 0) { try { await client.query('ANALYZE feishu_records'); console.log('🧹 ANALYZE feishu_records แล้ว'); } catch (e) { console.error('analyze err', e.message); } }
await client.end();
