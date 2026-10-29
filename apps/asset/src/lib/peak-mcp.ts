/**
 * ตัวอ่านข้อมูล PEAK ที่ดึงผ่าน MCP (read-only) จาก snapshot ที่คอมมิตไว้ในแอป
 * — ที่มา: Claude Code (ต่อ PEAK MCP) เรียก get_general_ledger บัญชีทรัพย์สิน 1241xx
 *   แล้ว scripts/build-peak-snapshot.mjs แปลงเป็น src/data/peak/asset-candidates.json
 *
 * ทำไมใช้ snapshot ไม่ยิง MCP ตรงจากแอป: PEAK MCP เป็น remote HTTP + OAuth ที่ผูกกับ
 *   session ของ Claude Code — แอป (โดยเฉพาะตอน deploy) เรียกด้วย OAuth นั้นตรง ๆ ไม่ได้
 *   จึงให้ Claude เป็น bridge ดึงอ่านมาวางเป็นไฟล์ แล้วแอปเสิร์ฟจากไฟล์ (ไม่เขียนกลับ PEAK)
 *
 * รูปแบบ candidate เข้ากันได้กับ PeakCandidate ของ REST path (lib/peak.ts) 100%
 * จึงส่งต่อ mapPeakCandidates() → OARecord[] เข้าคิว OA Import ชุดเดียวกันได้เลย
 */
import type { PeakCandidate } from './peak';
import snapshotJson from '@/data/peak/asset-candidates.json';

export interface PeakSnapshot {
  source: string;
  note?: string;
  pulledAt: string;
  range: { from: string; to: string };
  assetPrefixes: string[];
  accountsScanned: string[];
  accountSummary: { accountCode: string; accountName: string; totalTransactions: number; endingDebit: number }[];
  candidateCount: number;
  candidates: PeakCandidate[];
}

const snapshot = snapshotJson as unknown as PeakSnapshot;

/** prefix บัญชีทรัพย์สินถาวร (1241xx) — กันเหนียวอีกชั้น เผื่อ snapshot มีบัญชีอื่นปน */
function assetPrefixes(): string[] {
  const env = process.env.PEAK_ASSET_ACCOUNT_PREFIXES;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  return snapshot.assetPrefixes?.length ? snapshot.assetPrefixes : ['1241'];
}

/** metadata ของ snapshot (ให้ route รายงานกลับ UI ได้) */
export function peakSnapshotMeta() {
  return {
    source: snapshot.source,
    pulledAt: snapshot.pulledAt,
    range: snapshot.range,
    accountsScanned: snapshot.accountsScanned,
    accountSummary: snapshot.accountSummary,
    candidateCount: snapshot.candidateCount,
  };
}

/**
 * อ่าน candidate จาก snapshot กรองเฉพาะบัญชีทรัพย์สิน (1241xx) และช่วงวันที่ที่ขอ
 * @param range from/to เป็น YYYY-MM-DD (ไม่ส่ง = ทั้งหมดใน snapshot)
 */
export function loadSnapshotCandidates(range?: { from?: string; to?: string }): PeakCandidate[] {
  const prefixes = assetPrefixes();
  const isAsset = (code: string) => prefixes.some((p) => String(code).startsWith(p));
  const from = range?.from || '';
  const to = range?.to || '';
  return (snapshot.candidates ?? []).filter((c) => {
    if (!isAsset(c.account_code)) return false;
    const d = (c.doc_date || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
