import 'server-only';

// ตัวเชื่อมฝั่ง Asset ไปยังระบบบัญชี ONEBOOK (ดึง "บิลที่เป็นทรัพย์สิน" ที่ลงบัญชีแล้ว)
// ONEBOOK เป็นคนละระบบ/ฐานข้อมูล จึงคุยผ่าน REST + token (X-Asset-Key)

export interface OnebookCandidate {
  line_id: string;
  document_id: string;
  doc_number: string;
  doc_date: string;
  kind: string;
  status: string;
  company_id: string;
  company_name: string;
  vendor_name: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_code: string;
  account_name: string;
}

export async function fetchAssetCandidates(): Promise<OnebookCandidate[]> {
  const base = process.env.ONEBOOK_BASE_URL;
  const key = process.env.ONEBOOK_SYNC_KEY;
  if (!base || !key) throw new Error('ONEBOOK_NOT_CONFIGURED');

  const res = await fetch(`${base.replace(/\/$/, '')}/api/integrations/asset-candidates`, {
    headers: { 'X-Asset-Key': key },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`ONEBOOK ${res.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { data?: OnebookCandidate[] };
  return Array.isArray(body.data) ? body.data : [];
}

export interface DepLine { asset_account_code: string; amount: number; description: string }

/** ส่งค่าเสื่อมราคาของงวดกลับไปลงสมุดรายวัน GL ของ ONEBOOK */
export async function postDepreciation(companyId: string, periodEnd: string, lines: DepLine[]): Promise<any> {
  const base = process.env.ONEBOOK_BASE_URL;
  const key = process.env.ONEBOOK_SYNC_KEY;
  if (!base || !key) throw new Error('ONEBOOK_NOT_CONFIGURED');

  const res = await fetch(`${base.replace(/\/$/, '')}/api/integrations/depreciation-journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Asset-Key': key },
    body: JSON.stringify({ company_id: companyId, period_end: periodEnd, lines }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`ONEBOOK ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}
