/**
 * build-peak-snapshot.mjs
 * --------------------------------------------------------------------------
 * แปลง "raw General Ledger ของบัญชีทรัพย์สิน (1241xx)" ที่ดึงจาก PEAK ผ่าน MCP
 * ให้เป็น snapshot ที่ระบบ ONE Asset อ่านได้ (src/data/peak/asset-candidates.json)
 *
 * ที่มาของ raw: ผู้ช่วย AI (Claude) เรียก PEAK MCP tool `get_general_ledger`
 *   accountCode = 124101..124109, fromDate/toDate = ช่วงที่ต้องการ
 * แล้วบันทึก response ดิบ (ทั้งก้อน JSON) ลง scripts/peak-raw/<accountCode>.json
 *
 * วิธีรีเฟรชข้อมูล:
 *   1) ใน Claude Code (ที่ต่อ PEAK MCP แล้ว) ให้ดึง get_general_ledger ของบัญชี 1241xx
 *      แล้วเซฟ response ดิบลง apps/asset/scripts/peak-raw/<code>.json
 *   2) node scripts/build-peak-snapshot.mjs
 *
 * ทำไมต้อง snapshot: PEAK MCP เป็น remote HTTP + OAuth (ผูกกับ session ของ Claude Code)
 *   แอป Next.js จึงเรียก MCP ด้วย OAuth นั้นตรง ๆ ตอน runtime ไม่ได้ — ให้ Claude เป็น bridge
 *   ดึงอ่าน (read-only) มาวางเป็นไฟล์ แล้วแอปเสิร์ฟจากไฟล์ (ทำงานได้ทั้ง dev/prod ไม่ต้อง auth)
 *   * ไม่มีการเขียน/แก้ข้อมูลใด ๆ กลับไปที่ PEAK *
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, 'peak-raw');
const OUT_FILE = join(__dirname, '..', 'src', 'data', 'peak', 'asset-candidates.json');

// prefix บัญชีที่นับเป็น "ทรัพย์สินถาวร" — 1241xx (ที่ดิน/อาคาร/อุปกรณ์/ยานพาหนะ ฯลฯ)
// ไม่รวม 121-123 (เงินลงทุน/เงินกู้) และ 1242xx (ค่าเสื่อมสะสม = contra, ไม่ใช่การซื้อ)
const ASSET_PREFIXES = (process.env.PEAK_ASSET_ACCOUNT_PREFIXES || '1241')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAssetAccount = (code) => ASSET_PREFIXES.some((p) => String(code).startsWith(p));
const isoDate = (v) => {
  const s = String(v ?? '').replace(/[^0-9]/g, '');
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : String(v ?? '').slice(0, 10);
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * แยกคำอธิบายบรรทัด GL ของ PEAK:
 *   "<ชื่อบัญชี> - <รหัสทรัพย์สิน> - <ผู้ขาย> - #PA-<เลขเอกสาร>"
 * คืน { assetCode, vendor, paDoc }  (เว้นว่างถ้าหาไม่เจอ — ไม่ทำให้พัง)
 */
export function parseGlDescription(desc) {
  const text = String(desc ?? '').trim();
  const paMatch = text.match(/#?\b(PA-\d{6,})\b/); // #PA-20260100003
  const paDoc = paMatch ? paMatch[1] : '';
  // รหัสทรัพย์สิน: ตัวอักษร 2-5 ตัว ขีด ตัวเลข 3-6 หลัก (OEQ-00014, COM-00009, CHR-00002)
  const assetMatch = text.match(/\b([A-Z]{2,5}-\d{3,6})\b/);
  const assetCode = assetMatch ? assetMatch[1] : '';

  // ผู้ขาย: ส่วนที่อยู่ระหว่าง "<รหัสทรัพย์สิน> - " กับ " - #PA"
  let vendor = '';
  const parts = text.split(/\s-\s/);
  if (parts.length >= 4) {
    // [0]=ชื่อบัญชี [1]=รหัสทรัพย์สิน [2..n-1]=ผู้ขาย [last]=#PA
    const last = parts.length - 1;
    vendor = parts.slice(2, last).join(' - ').trim();
  } else if (assetCode) {
    // fallback: ตัดหัว(ถึงรหัสทรัพย์สิน) และท้าย(#PA) ออก
    vendor = text
      .replace(new RegExp(`^.*?${assetCode}\\s*-\\s*`), '')
      .replace(/\s*-\s*#?PA-\d+.*$/, '')
      .trim();
  }
  return { assetCode, vendor, paDoc };
}

function run() {
  let rawFiles = [];
  try {
    rawFiles = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    console.error(`ไม่พบโฟลเดอร์ raw: ${RAW_DIR}`);
    process.exit(1);
  }

  const candidates = [];
  const accountsScanned = [];
  const accountSummary = [];
  let rangeFrom = '';
  let rangeTo = '';

  for (const file of rawFiles) {
    const body = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
    const gl = body.PeakGeneralLedger ?? body.peakGeneralLedger ?? body;
    if (gl.fromDate && (!rangeFrom || gl.fromDate < rangeFrom)) rangeFrom = gl.fromDate;
    if (gl.toDate && (!rangeTo || gl.toDate > rangeTo)) rangeTo = gl.toDate;

    for (const ledger of gl.generalLedgers ?? []) {
      const accountCode = String(ledger.account?.accountCode ?? '');
      const accountName = String(ledger.account?.accountName ?? '');
      if (!accountCode) continue;
      if (!accountsScanned.includes(accountCode)) accountsScanned.push(accountCode);
      accountSummary.push({
        accountCode,
        accountName,
        totalTransactions: ledger.totalTransactions ?? 0,
        endingDebit: round2(ledger.summary?.endingBalance?.debit ?? 0),
      });
      if (!isAssetAccount(accountCode)) continue; // ปลอดภัย: เก็บเฉพาะ 1241xx

      const txns = ledger.transactions ?? [];
      for (const t of txns) {
        const debit = Number(t.debit) || 0;
        if (debit <= 0) continue; // เอาเฉพาะ "ซื้อเข้า" (Dr) ไม่เอารายการ Cr (โอน/ตัดจำหน่าย)
        const journalNumber = String(t.journalNumber ?? '');
        const { assetCode, vendor, paDoc } = parseGlDescription(t.description);
        const docNumber = paDoc || journalNumber;
        // line_id ไม่ซ้ำแม้ 1 journal มีหลายทรัพย์สิน
        const lineId = assetCode ? `${journalNumber}:${assetCode}` : `${journalNumber}:${candidates.length}`;
        candidates.push({
          line_id: lineId,
          document_id: docNumber,
          doc_number: docNumber,
          doc_date: isoDate(t.date),
          status: 'POSTED',
          vendor_name: vendor || null,
          description: String(t.description ?? ''),
          asset_code: assetCode,
          quantity: 1,
          unit_price: round2(debit),
          amount: round2(debit),
          account_code: accountCode,
          account_sub_code: '',
          account_name: accountName,
          journal_number: journalNumber,
        });
      }
    }
  }

  // เรียงตามวันที่
  candidates.sort((a, b) => a.doc_date.localeCompare(b.doc_date));

  const snapshot = {
    source: 'peak-mcp',
    note: 'ดึงอ่าน (read-only) จาก PEAK ผ่าน MCP get_general_ledger บัญชีทรัพย์สิน 1241xx — ไม่มีการเขียนกลับ',
    pulledAt: new Date().toISOString(),
    range: { from: isoDate(rangeFrom), to: isoDate(rangeTo) },
    assetPrefixes: ASSET_PREFIXES,
    accountsScanned,
    accountSummary,
    candidateCount: candidates.length,
    candidates,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.log(`✔ เขียน snapshot: ${OUT_FILE}`);
  console.log(`  บัญชีที่สแกน: ${accountsScanned.join(', ')}`);
  console.log(`  candidate (ซื้อทรัพย์สิน): ${candidates.length} รายการ · ช่วง ${snapshot.range.from} ถึง ${snapshot.range.to}`);
}

run();
