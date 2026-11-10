"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Opt = { forms: { code: string; name: string }[]; depts: string[] };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function presetRange(k: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (k) {
    case "today": return { from: ymd(now), to: ymd(now) };
    case "7d": return { from: ymd(new Date(now.getTime() - 6 * 864e5)), to: ymd(now) };
    case "month": return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case "lastmonth": return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "quarter": return { from: ymd(new Date(y, Math.floor(m / 3) * 3, 1)), to: ymd(now) };
    case "year": return { from: ymd(new Date(y, 0, 1)), to: ymd(now) };
    default: return { from: "", to: "" };
  }
}
const PRESETS = [
  { k: "all", t: "ทั้งหมด" }, { k: "today", t: "วันนี้" }, { k: "7d", t: "7 วัน" },
  { k: "month", t: "เดือนนี้" }, { k: "lastmonth", t: "เดือนก่อน" }, { k: "quarter", t: "ไตรมาส" }, { k: "year", t: "ปีนี้" },
];

export default function FilterBar({ opt }: { opt: Opt }) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) || "";
  const [custom, setCustom] = useState(false);

  const push = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    router.push(`/dashboard?${p.toString()}`, { scroll: false });
  };
  const activePreset = (() => {
    const f = get("from"), t = get("to");
    if (!f && !t) return "all";
    for (const p of PRESETS) { if (p.k === "all") continue; const r = presetRange(p.k); if (r.from === f && r.to === t) return p.k; }
    return "custom";
  })();

  const sel = "h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-700 outline-none focus:border-indigo-400";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* period segmented */}
      <div className="inline-flex items-center rounded-xl bg-gray-100 p-0.5">
        {PRESETS.map((p) => (
          <button key={p.k} onClick={() => { setCustom(false); push(p.k === "all" ? { from: "", to: "" } : presetRange(p.k)); }}
            className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${activePreset === p.k ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{p.t}</button>
        ))}
        <button onClick={() => setCustom((v) => !v)}
          className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${activePreset === "custom" || custom ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>กำหนดเอง</button>
      </div>

      {(custom || activePreset === "custom") && (
        <div className="inline-flex items-center gap-1 text-[13px]">
          <input type="date" className={sel} value={get("from")} max={get("to") || undefined} onChange={(e) => push({ from: e.target.value })} />
          <span className="text-gray-400">–</span>
          <input type="date" className={sel} value={get("to")} min={get("from") || undefined} onChange={(e) => push({ to: e.target.value })} />
        </div>
      )}

      <select className={sel} value={get("form")} onChange={(e) => push({ form: e.target.value })}>
        <option value="">ทุกฟอร์ม</option>
        {opt.forms.map((f) => <option key={f.code} value={f.code}>{f.name.length > 28 ? f.name.slice(0, 28) + "…" : f.name}</option>)}
      </select>
      <select className={sel} value={get("status")} onChange={(e) => push({ status: e.target.value })}>
        <option value="">ทุกสถานะ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="pending">รออนุมัติ</option>
        <option value="rejected">ปฏิเสธ</option>
        <option value="cancelled">ถอน/ลบ</option>
      </select>
      <select className={sel} value={get("dept")} onChange={(e) => push({ dept: e.target.value })}>
        <option value="">ทุกแผนก</option>
        {opt.depts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>

      {(get("from") || get("to") || get("form") || get("status") || get("dept")) && (
        <button onClick={() => router.push("/dashboard", { scroll: false })} className="h-9 rounded-lg px-2.5 text-[12.5px] text-gray-400 hover:text-rose-600">ล้างตัวกรอง ✕</button>
      )}
    </div>
  );
}
