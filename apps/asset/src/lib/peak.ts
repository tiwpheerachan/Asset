import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * ตัวเชื่อมฝั่ง Asset ไปยังระบบบัญชี PEAK (บัญชีหลัก) — ดึง "ค่าใช้จ่ายที่เป็นทรัพย์สิน"
 * คือ Expense ที่บรรทัดลงผังบัญชีสินทรัพย์ (ขึ้นต้น 12 เช่น 124xxx) เหมือนแนวทาง ONEBOOK
 * แต่ PEAK ต้องเซ็นทุก request ด้วย HMAC-SHA1 + token 2 ชั้น (Client-Token + User-Token)
 *
 * เอกสาร: GET /api/v1/Expenses/list  · header: Time-Stamp, Time-Signature, Client-Token, User-Token
 *         Time-Signature = HMAC-SHA1(Time-Stamp) โดย secret key = connectId
 *
 * env:
 *   PEAK_BASE_URL              เช่น https://api.peakengine.com (ขอ host จริงจากทีม PEAK/UAT)
 *   PEAK_CONNECT_ID            = connectId (เป็น secret key ของ HMAC ด้วย)
 *   PEAK_APP_PASSWORD          = Application Code (ใช้ขอ Client-Token)
 *   PEAK_USER_TOKEN            = User-Token (จาก consent ในแอป PEAK, อายุ 24 ชม.)
 *   PEAK_ASSET_ACCOUNT_PREFIXES  prefix บัญชีที่นับเป็นทรัพย์สิน (default "12") คั่นด้วย comma เช่น "121,122,124"
 *   PEAK_SIG_ENCODING          "base64" (ค่าเริ่มต้น) | "hex" — ปรับตามที่ UAT ตอบรับ
 */

export interface PeakCandidate {
  line_id: string;
  document_id: string;
  doc_number: string;
  doc_date: string; // YYYY-MM-DD
  status: string;
  vendor_name: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_code: string;
  account_sub_code: string;
}

function cfg() {
  const base = process.env.PEAK_BASE_URL;
  const connectId = process.env.PEAK_CONNECT_ID;
  const password = process.env.PEAK_APP_PASSWORD;
  const userToken = process.env.PEAK_USER_TOKEN;
  if (!base || !connectId || !password || !userToken) throw new Error('PEAK_NOT_CONFIGURED');
  return {
    base: base.replace(/\/$/, ''),
    connectId,
    password,
    userToken,
    // เอกสาร PEAK: Time-Signature เป็น HMAC-SHA1 hex (ตัวอย่าง 40 ตัวอักษร) → default hex
    sigEnc: (process.env.PEAK_SIG_ENCODING === 'base64' ? 'base64' : 'hex') as 'hex' | 'base64',
    prefixes: (process.env.PEAK_ASSET_ACCOUNT_PREFIXES || '12')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** เวลา yyyyMMddHHmmss (UTC) ตามที่ PEAK กำหนด */
function timestamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    d.getUTCFullYear().toString() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

function sign(ts: string, connectId: string, enc: 'hex' | 'base64'): string {
  return createHmac('sha1', connectId).update(ts).digest(enc);
}

// cache Client-Token ในหน่วยความจำ (ต่ออายุเมื่อใกล้หมด)
let clientTokenCache: { token: string; exp: number } | null = null;

async function getClientToken(c: ReturnType<typeof cfg>): Promise<string> {
  if (clientTokenCache && clientTokenCache.exp > Date.now()) return clientTokenCache.token;
  const ts = timestamp();
  const res = await fetch(`${c.base}/api/v1/ClientToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Time-Stamp': ts,
      'Time-Signature': sign(ts, c.connectId, c.sigEnc),
    },
    body: JSON.stringify({ PeakClientToken: { connectId: c.connectId, password: c.password } }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`PEAK ClientToken ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { PeakClientToken?: { token?: string } };
  const token = body.PeakClientToken?.token;
  if (!token) throw new Error('PEAK ClientToken: missing token in response');
  clientTokenCache = { token, exp: Date.now() + 50 * 60 * 1000 }; // เผื่อ ~50 นาที
  return token;
}

function authHeaders(c: ReturnType<typeof cfg>, clientToken: string): Record<string, string> {
  const ts = timestamp();
  return {
    'Content-Type': 'application/json',
    'Time-Stamp': ts,
    'Time-Signature': sign(ts, c.connectId, c.sigEnc),
    'Client-Token': clientToken,
    'User-Token': c.userToken,
  };
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

// รูปแบบ response ของ GET /api/v1/Expenses/list
interface PeakExpenseProduct {
  id?: string; productId?: string; productCode?: string;
  accountCode?: string; accountSubCode?: string; description?: string;
  quantity?: number; price?: number; vatType?: number;
}
interface PeakExpense {
  id?: string; code?: string; issuedDate?: string; contactCode?: string; contactId?: string;
  status?: string; netAmount?: number; products?: PeakExpenseProduct[];
}

/** YYYYMMDD → YYYY-MM-DD */
function isoDate(v: string): string {
  const s = str(v).replace(/[^0-9]/g, '');
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return str(v).slice(0, 10);
}

/**
 * ดึง Expense ทั้งหมดในช่วงวันที่ แล้วคัดเฉพาะบรรทัดที่ลงผังบัญชีสินทรัพย์ (prefix ที่ตั้งไว้)
 * คืนเป็น "candidate รายบรรทัด" เพื่อนำไปขึ้นทะเบียน (กรอง 12xx ฝั่งเราเอง — PEAK ส่งทุกบรรทัดมา)
 */
export async function fetchAssetCandidates(range?: { from?: string; to?: string }): Promise<PeakCandidate[]> {
  const c = cfg();
  const clientToken = await getClientToken(c);

  const today = new Date();
  const to = range?.to || today.toISOString().slice(0, 10);
  const from = range?.from || new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  const out: PeakCandidate[] = [];
  const isAsset = (code: string) => c.prefixes.some((p) => code.startsWith(p));
  const status = process.env.PEAK_EXPENSE_STATUS || '0'; // 0=ทุกสถานะ (ดู enum ในเอกสาร PEAK)

  // ตรวจว่า "เครดิตหมด / ถูกจำกัดอัตราเรียก" เพื่อหยุดอย่างนุ่มนวล (คง candidate ที่ดึงมาแล้ว)
  const isCreditOrRate = (code: number, text: string) =>
    code === 402 || code === 429 || /credit|quota|เครดิต|rate.?limit|too many/i.test(text);

  // แบ่งหน้าทีละ 100 จนครบ — ดึงเฉพาะช่วงวันที่ที่ส่งมา (incremental) เพื่อประหยัดเครดิต
  for (let page = 1; page <= 100; page++) {
    const url = `${c.base}/api/v1/Expenses/list?dateStart=${from}&dateEnd=${to}&status=${status}&limit=100&page=${page}`;
    const res = await fetch(url, { headers: authHeaders(c, clientToken), cache: 'no-store' });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      if (isCreditOrRate(res.status, detail)) {
        // เครดิตหมด/ถูกจำกัด → ถ้าดึงมาได้บางส่วนแล้วให้หยุดและคืนเท่าที่ได้, ถ้ายังไม่ได้เลยให้แจ้งชัด
        if (out.length > 0) break;
        throw new Error('PEAK_CREDIT_OR_RATE');
      }
      throw new Error(`PEAK Expenses ${res.status}: ${detail.slice(0, 300)}`);
    }
    // เอกสาร PEAK ใช้คีย์ "PeakExpenses" (P ใหญ่) — รองรับทั้งสองแบบกันพลาด
    type PeakExpensesBody = { expenses?: PeakExpense[]; totalExpenses?: number; resCode?: string; resDesc?: string };
    const body = (await res.json()) as { PeakExpenses?: PeakExpensesBody; peakExpenses?: PeakExpensesBody };
    const pe = body.PeakExpenses ?? body.peakExpenses;
    // บาง API คืน 200 แต่แจ้งปัญหาใน resCode/resDesc
    if (pe?.resDesc && isCreditOrRate(Number(pe.resCode), pe.resDesc)) {
      if (out.length > 0) break;
      throw new Error('PEAK_CREDIT_OR_RATE');
    }
    const expenses = pe?.expenses ?? [];
    if (expenses.length === 0) break;

    for (const e of expenses) {
      const docId = str(e.id);
      const products = e.products ?? [];
      products.forEach((p, idx) => {
        const code = str(p.accountCode);
        if (!code || !isAsset(code)) return;
        const qty = Math.max(1, num(p.quantity));
        const price = num(p.price);
        out.push({
          line_id: str(p.id) || `${docId}#${idx}`,
          document_id: docId,
          doc_number: str(e.code),
          doc_date: isoDate(str(e.issuedDate)),
          status: str(e.status),
          vendor_name: str(e.contactCode) || null,
          description: str(p.description),
          quantity: qty,
          unit_price: price,
          amount: Math.round(price * qty * 100) / 100,
          account_code: code,
          account_sub_code: str(p.accountSubCode),
        });
      });
    }
    const total = pe?.totalExpenses ?? expenses.length;
    if (page * 100 >= total) break;
  }
  return out;
}
