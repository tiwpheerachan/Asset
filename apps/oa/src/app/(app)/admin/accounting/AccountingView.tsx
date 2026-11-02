"use client";

import { useState, useTransition } from "react";
import { acctQueue, acctSetKind, acctCheck, acctPost, acctReverse, acctSkip, acctDetail } from "@/lib/accounting-actions";

type Kind = "accounting" | "asset" | "none";
type Form = { form_code: string; name: string; local_count: number; kind: Kind };
type Row = {
  oa_key: string; serial: string; status_oa: string; applicant: string; date: string;
  ai_total: number | null; form_amount: number | null; files: number; cancelled: boolean;
  acct_status: string; amount: number | null; note: string; onebook_ref: string; posted_at: string;
};

const money = (n: number | null) => (typeof n === "number" ? n.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—");
const acctBadge: Record<string, string> = {
  new: "bg-gray-100 text-gray-600", checked: "bg-sky-50 text-sky-700",
  posted: "bg-green-50 text-green-700", reversed: "bg-rose-50 text-rose-700", skipped: "bg-gray-100 text-gray-400",
};
const acctLabel: Record<string, string> = { new: "ยังไม่ตรวจ", checked: "ตรวจแล้ว", posted: "ลงบัญชีแล้ว", reversed: "ถอนแล้ว", skipped: "ข้าม" };

export default function AccountingView({ forms }: { forms: Form[] }) {
  const [sel, setSel] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sum, setSum] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("all");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [cfg, setCfg] = useState<Record<string, Kind>>(Object.fromEntries(forms.map((f) => [f.form_code, f.kind])));

  const viewDetail = (oaKey: string) => start(async () => { setDetail(await acctDetail(oaKey)); });

  const reload = async () => { if (sel) { const r = await acctQueue(sel, filter); setRows(r.rows as Row[]); setSum(r.summary); } };
  const postRow = (r: Row) => start(async () => {
    setMsg("");
    const res: any = await acctPost(r.oa_key, sel, r.ai_total ?? r.form_amount);
    if (res?.ok === false) setMsg(`โพสต์ ${r.serial} ไม่สำเร็จ: ${res.error}`);
    else setMsg(`โพสต์ ${r.serial} เข้า ONEBOOK แล้ว${res?.onebook_ref ? " (คิวนำเข้า)" : ""}`);
    await reload();
  });

  const load = (code: string, status = filter) =>
    start(async () => {
      const r = await acctQueue(code, status);
      setRows(r.rows as Row[]); setSum(r.summary);
    });
  const openForm = (code: string) => { setSel(code); setFilter("all"); load(code, "all"); };
  const refilter = (s: string) => { setFilter(s); if (sel) load(sel, s); };
  const act = (fn: () => Promise<any>) => start(async () => { await fn(); if (sel) { const r = await acctQueue(sel, filter); setRows(r.rows as Row[]); setSum(r.summary); } });

  const mismatch = (r: Row) =>
    typeof r.ai_total === "number" && typeof r.form_amount === "number" && Math.abs(r.ai_total - r.form_amount) > Math.max(1, r.ai_total * 0.01);

  const acctForms = forms.filter((f) => cfg[f.form_code] === "accounting");

  return (
    <div className="space-y-5">
      {/* ตั้งค่าประเภทฟอร์ม */}
      <details className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">ตั้งค่า: ฟอร์มไหนเข้าบัญชี / เป็นสินทรัพย์</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {forms.map((f) => (
            <div key={f.form_code} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-gray-100">
              <span className="min-w-0 flex-1 truncate text-gray-700">{f.name}<span className="ml-1 text-[11px] text-gray-400">{f.local_count.toLocaleString()}</span></span>
              <select className="input h-8 w-28 text-xs" value={cfg[f.form_code]} disabled={pending}
                onChange={(e) => { const k = e.target.value as Kind; setCfg((c) => ({ ...c, [f.form_code]: k })); start(async () => { await acctSetKind(f.form_code, k); }); }}>
                <option value="none">ไม่เข้า</option>
                <option value="accounting">เข้าบัญชี</option>
                <option value="asset">สินทรัพย์</option>
              </select>
            </div>
          ))}
        </div>
      </details>

      {/* เลือกฟอร์มบัญชี */}
      <div className="flex flex-wrap gap-2">
        {acctForms.length === 0 && <p className="text-sm text-gray-400">ยังไม่ได้เลือกฟอร์มเข้าบัญชี — ตั้งค่าด้านบนก่อน</p>}
        {acctForms.map((f) => (
          <button key={f.form_code} onClick={() => openForm(f.form_code)}
            className={`rounded-lg border px-3 py-2 text-sm ${sel === f.form_code ? "border-indigo-400 bg-indigo-50/60" : "border-gray-200 hover:border-gray-300"}`}>
            {f.name}
          </button>
        ))}
      </div>

      {sel && (
        <div className="space-y-3">
          {/* ตัวกรองสถานะ + สรุป */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            {["all", "new", "checked", "posted", "reversed", "skipped"].map((s) => (
              <button key={s} onClick={() => refilter(s)}
                className={`rounded-full px-2.5 py-1 ${filter === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                {s === "all" ? "ทั้งหมด" : acctLabel[s]}{s !== "all" && sum[s] ? ` ${sum[s]}` : ""}
              </button>
            ))}
          </div>

          {msg && <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 ring-1 ring-gray-100">{msg}</div>}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">ผู้ยื่น</th><th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2 text-right">ยอดฟอร์ม</th><th className="px-3 py-2 text-right">ยอด AI อ่าน</th>
                  <th className="px-3 py-2">สถานะ</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.oa_key} className={r.cancelled ? "opacity-50" : ""}>
                    <td className="px-3 py-2 font-mono text-xs"><button className="text-indigo-600 hover:underline" onClick={() => viewDetail(r.oa_key)}>{r.serial}</button>{r.cancelled && <span className="ml-1 text-[10px] text-rose-500">ยกเลิก</span>}</td>
                    <td className="px-3 py-2 text-gray-700">{r.applicant || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.date}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{money(r.form_amount)}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${mismatch(r) ? "font-bold text-rose-600" : "text-gray-700"}`}>
                      {money(r.ai_total)}{mismatch(r) && <span title="ยอดไม่ตรง" className="ml-1">⚠</span>}
                    </td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${acctBadge[r.acct_status] ?? acctBadge.new}`}>{acctLabel[r.acct_status] ?? r.acct_status}</span></td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5 text-xs">
                        {r.acct_status === "posted" ? (
                          <button className="text-rose-600 hover:underline" disabled={pending} onClick={() => act(() => acctReverse(r.oa_key, sel))}>ถอน</button>
                        ) : (
                          <>
                            {r.acct_status !== "checked" && <button className="text-sky-600 hover:underline" disabled={pending} onClick={() => act(() => acctCheck(r.oa_key, sel, r.ai_total ?? r.form_amount, ""))}>ตรวจ✓</button>}
                            <button className="text-green-700 hover:underline" disabled={pending || r.cancelled} onClick={() => postRow(r)}>โพสต์</button>
                            {r.acct_status === "new" && <button className="text-gray-400 hover:underline" disabled={pending} onClick={() => act(() => acctSkip(r.oa_key, sel))}>ข้าม</button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pending && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">กำลังโหลด…</td></tr>}
                {!pending && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">ไม่มีรายการ</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">⚠ = ยอดฟอร์มกับยอดที่ AI อ่านไม่ตรง (ควรตรวจ) · กดเลขที่เพื่อดูสิ่งที่ AI สแกนอ่าน · "โพสต์" = ส่งเข้าคิวนำเข้า ONEBOOK (ย้อนได้ด้วย "ถอน")</p>

          {detail && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold text-gray-800">สแกนเอกสาร · {detail.serial} <span className="text-xs font-normal text-gray-500">{detail.form_name}</span></div>
                <button className="text-xs text-gray-400 hover:text-gray-700" onClick={() => setDetail(null)}>ปิด ✕</button>
              </div>
              {(!detail.files || detail.files.length === 0) && <p className="text-sm text-gray-500">ไม่มีไฟล์แนบ</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {detail.files?.map((f: any, i: number) => (
                  <div key={i} className="rounded-lg bg-white p-3 text-sm ring-1 ring-gray-100">
                    <div className="mb-1.5 truncate font-medium text-gray-700">📎 {f.name} <span className="text-[10px] text-gray-400">AI: {f.aiStatus ?? "—"}</span></div>
                    {f.ai ? (
                      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
                        {[["ประเภท", f.ai.doc_type], ["เลขที่เอกสาร", f.ai.doc_no], ["วันที่", f.ai.doc_date], ["ผู้ขาย", f.ai.seller], ["ยอดก่อนภาษี", f.ai.subtotal], ["ภาษี", f.ai.tax], ["ยอดรวม", f.ai.total]]
                          .filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                            <div key={k as string} className="contents"><dt className="text-gray-400">{k}</dt><dd className="font-medium text-gray-700">{typeof v === "number" ? v.toLocaleString() : String(v)}</dd></div>
                          ))}
                        {Array.isArray(f.ai.items) && f.ai.items.length > 0 && <div className="contents"><dt className="text-gray-400">รายการ</dt><dd className="text-gray-700">{f.ai.items.length} บรรทัด</dd></div>}
                        {Array.isArray(f.ai.low_confidence) && f.ai.low_confidence.length > 0 && <div className="contents"><dt className="text-amber-600">AI ไม่มั่นใจ</dt><dd className="text-amber-700">{f.ai.low_confidence.join(", ")}</dd></div>}
                        {f.ai.notes && <div className="contents"><dt className="text-gray-400">หมายเหตุ</dt><dd className="text-gray-600">{f.ai.notes}</dd></div>}
                      </dl>
                    ) : <p className="text-xs text-gray-400">AI ยังไม่ได้อ่านไฟล์นี้</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
