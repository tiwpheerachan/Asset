"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { oaExportSearch, oaExportSyncNow, oaResolvePeople } from "@/lib/feishu-actions";
import { useI18n } from "@/components/I18nProvider";
import { oaStatus, oaLabel, statusByKey, OAUI, tri } from "@/lib/oa-export/labels";
import type { Locale } from "@/lib/i18n/locales";

type Person = { name?: string; user_id?: string; avatar?: string };
type Oa = {
  oa_key: string; serial: string; status: string; form_name: string; updated_at: string;
  fields: Record<string, any>;
  attachments?: { files?: Record<string, any>[] };
  approval?: {
    status?: string;
    sender?: Person;
    department?: { name?: string; id?: string };
    sent_at?: string; ended_at?: string | null;
    timeline?: { type?: string; node?: string; result?: string; time?: string; by?: Person | null; comment?: string | null; people?: Person[] }[];
  } | null;
  flags?: { cancelled?: boolean; low_confidence_files?: number; ai_errors?: number };
};
type Form = { form_code: string; name: string; source_count: number; local_count: number; last_synced_at: string };

/* ---------- helpers ---------- */
const fileUrl = (dl?: string) => {
  const id = (dl || "").match(/\/files\/(\d+)/)?.[1];
  return id ? `/api/oa-files/${id}` : "";
};
const isViewable = (mime?: string, name?: string) => /pdf|image\/|wordprocessingml|spreadsheet|ms-excel/i.test(mime || "") || /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv)$/i.test(name || "");
const first = (f: Record<string, any>, keys: string[]) => { for (const k of keys) if (f?.[k] != null && f[k] !== "") return f[k]; return ""; };
const toDate = (v: any) => String(v ?? "").replace(/[T ].*$/, "").slice(0, 10);
const AMOUNT_RE = /汇总金额|total amount|含税付款金额|充值金额|cooperation fee|付款金额|金额|ยอด|amount/i;
const CURRENCY_SKIP = /币种|currency|明细|details|备注|remark/i;
// อ่านยอดจาก "ตัวเลขก้อนแรกที่ถูกต้อง" ไม่รวมเลขทั้งหมดในสตริง (กันลิสต์ "1) 429 2) 380…" กลายเป็นเลขยักษ์)
function parseAmount(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/\d\s*\)\s*\S/.test(s)) return null; // สตริงแบบลิสต์ "1) … 2) …" ไม่ใช่ยอด
  const m = s.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) >= 1e13) return null; // เพี้ยน/ใหญ่เกินจริง → ทิ้ง
  return n;
}
function amountOf(o: Oa): { val: number | null; ai: number | null } {
  let formVal: number | null = null;
  for (const [k, v] of Object.entries(o.fields || {})) {
    if (CURRENCY_SKIP.test(k) || !AMOUNT_RE.test(k)) continue;
    const n = parseAmount(v);
    if (n != null) { formVal = n; break; }
  }
  let ai: number | null = null, sum = 0, got = false;
  for (const f of o.attachments?.files ?? []) { const t = f.ai?.final?.total; if (typeof t === "number") { sum += t; got = true; } }
  if (got) ai = sum;
  return { val: formVal ?? ai, ai };
}
const money = (n: number | null) => (typeof n === "number" ? n.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—");
const statusCls = (s: string) =>
  /通过|approved|pass/i.test(s) ? "bg-green-50 text-green-700 ring-green-200"
  : /审批中|pending|review/i.test(s) ? "bg-amber-50 text-amber-700 ring-amber-200"
  : /撤回|拒绝|删除|reject|cancel/i.test(s) ? "bg-rose-50 text-rose-700 ring-rose-200"
  : "bg-gray-100 text-gray-600 ring-gray-200";

// ช่องที่โชว์แยกไว้ในหัว popup แล้ว ไม่ต้องซ้ำในรายการ "ทุกช่อง"
const MAIN_KEYS = new Set(["申请编号", "申请状态", "发起人", "发起人部门", "发起时间", "完成时间", "审批流程", "审批节点", "当前处理人", "approval_code", "approval_name", "instance_code", "SourceID"]);
function renderVal(v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === "object" ? Object.values(x).filter(Boolean).join(" ") : String(x))).join(" · ") : "—";
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(" · ");
  return String(v);
}

type Initial = { status?: string; dept?: string; form?: string; node?: string; files?: string; from?: string; to?: string };
const STATUS_KEYS = ["", "pending", "approved", "rejected", "cancelled"] as const;
const toISO = (s?: string) => (!s ? "" : /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);
type F = { form: string; status: string; dept: string; from: string; to: string; files: string; q: string };

/* ไอคอน SVG (เส้นเรียบ ปรับสีตาม currentColor) */
const svg = "none";
const IconHistory = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill={svg} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 2" /></svg>
);
const IconRefresh = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill={svg} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
const IconSparkle = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.6L19 9l-5.3 1.4L12 16l-1.7-5.6L5 9l5.3-1.4z" /></svg>
);
const IconClip = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill={svg} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 10-9.5 9.5a4 4 0 0 1-5.66-5.66L15 5a2.5 2.5 0 0 1 3.54 3.54L9.4 17.6a1 1 0 0 1-1.42-1.42l8.13-8.13" /></svg>
);

/* avatar ตัวย่อ + สีประจำตัว (deterministic จาก user_id/ชื่อ) จนกว่าจะต่อรูปจริงจาก Lark */
const AV_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6"];
function initials(name?: string): string {
  const n = (name || "").replace(/\(.*?\)/g, "").trim();
  if (!n) return "?";
  if (/[一-鿿]/.test(n)) return n.slice(-2); // จีน: 2 ตัวท้าย
  const parts = n.split(/[\s.\-–]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || n[0].toUpperCase();
}
function avColor(seed?: string): string {
  const s = seed || "?"; let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function Avatar({ name, seed, size = 32, src }: { name?: string; seed?: string; size?: number; src?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt={name || ""} onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover ring-1 ring-black/5" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: avColor(seed || name), fontSize: size * 0.4 }}>{initials(name)}</span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>{children}</label>;
}

export default function OaDocsView({ ready, total, forms, depts = [], initial = {} }: { ready: boolean; total: number; forms: Form[]; depts?: string[]; initial?: Initial }) {
  const { locale } = useI18n();
  const statusLabel = (k: string) => (k === "" ? tri(OAUI.allStatus, locale) : statusByKey(k, locale));
  const L = (k: keyof typeof OAUI) => tri(OAUI[k], locale);
  const [f, setF] = useState<F>({ form: initial.form ?? "", status: initial.status ?? "", dept: initial.dept ?? "", from: toISO(initial.from), to: toISO(initial.to), files: initial.files ?? "", q: "" });
  const [node, setNode] = useState(initial.node ?? "");
  const [rows, setRows] = useState<Oa[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<Oa | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [listProfiles, setListProfiles] = useState<Record<string, { avatar_url: string | null }>>({});

  const search = (nf: F, nd: string, append = false) => {
    start(async () => {
      const res = (await oaExportSearch({ ...nf, node: nd || undefined, limit: 200, offset: append ? rows.length : 0 })) as Oa[];
      setRows((prev) => (append ? [...prev, ...res] : res));
      setHasMore(res.length === 200);
      setLoaded(true);
    });
  };

  // โหลดครั้งแรก — ตามตัวกรองจาก URL หรือ 200 ใบล่าสุดทั้งหมด (หน้าไม่ว่าง)
  useEffect(() => { search(f, node); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // จับคู่โปรไฟล์ของผู้ยื่นในตาราง (เฉพาะที่ยังไม่มี avatar ในข้อมูล) — ใช้ cache directory ที่ warm ไว้ ขึ้นทันที
  useEffect(() => {
    const ppl = rows.map((o) => o.approval?.sender).filter((s): s is Person => !!s?.user_id && !s.avatar).map((s) => ({ user_id: s.user_id, name: s.name }));
    if (ppl.length === 0) return;
    let cancel = false;
    oaResolvePeople(ppl).then((r) => { if (!cancel) setListProfiles((p) => ({ ...p, ...(r as any) })); }).catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const apply = (patch: Partial<F>) => { const nf = { ...f, ...patch }; setF(nf); search(nf, node); };
  const toggleForm = (code: string) => apply({ form: f.form === code ? "" : code });
  const clearAll = () => { const nf: F = { form: "", status: "", dept: "", from: "", to: "", files: "", q: "" }; setF(nf); setNode(""); search(nf, ""); };
  const sync = () => { setMsg(""); start(async () => { const r: any = await oaExportSyncNow({ maxPages: 200 }); setMsg(r.ok ? `+${r.count.toLocaleString()} ${L("docs")}${r.done ? " ✓" : ""}` : r.error); }); };

  const activeCount = [f.form, f.status, f.dept, f.from, f.to, f.files, node].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* สถานะ + ซิงก์ */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ready ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`} />
          {ready ? `${L("linked")} · ${total.toLocaleString()} ${L("docs")}` : L("notset")}
        </span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">{L("source")}: Feishu (審批)</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{L("autoOn")}</span>
        <button className="btn btn-ghost group inline-flex h-9 items-center gap-1.5 text-sm" disabled={pending || !ready} onClick={sync}><IconRefresh className={`transition-transform ${pending ? "oa-spin" : "group-hover:rotate-180"}`} />{pending ? L("working") : L("syncNow")}</button>
        <Link href="/admin/oa-history" className="btn btn-ghost group inline-flex h-9 items-center gap-1.5 text-sm"><IconHistory className="text-gray-500 transition-transform group-hover:-rotate-12" />{L("history")}</Link>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      {/* แถบกรอง */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <Field label={L("form")}>
          <select className="input h-9 min-w-[13rem]" value={f.form} onChange={(e) => apply({ form: e.target.value })}>
            <option value="">{L("allForms")}</option>
            {forms.map((x) => <option key={x.form_code} value={x.form_code}>{x.name}</option>)}
          </select>
        </Field>
        <Field label={L("status")}>
          <select className="input h-9" value={f.status} onChange={(e) => apply({ status: e.target.value })}>
            {STATUS_KEYS.map((v) => <option key={v} value={v}>{statusLabel(v)}</option>)}
          </select>
        </Field>
        <Field label={L("dept")}>
          <select className="input h-9 max-w-[13rem]" value={f.dept} onChange={(e) => apply({ dept: e.target.value })}>
            <option value="">{L("allDept")}</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label={L("from")}><input type="date" className="input h-9" value={f.from} onChange={(e) => apply({ from: e.target.value })} /></Field>
        <Field label={L("to")}><input type="date" className="input h-9" value={f.to} onChange={(e) => apply({ to: e.target.value })} /></Field>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-gray-600"><input type="checkbox" checked={f.files === "1"} onChange={(e) => apply({ files: e.target.checked ? "1" : "" })} />{L("hasFile")}</label>
        <div className="flex-1" />
        {activeCount > 0 && <button onClick={clearAll} className="h-9 rounded-lg px-3 text-sm text-gray-500 hover:bg-white hover:text-indigo-600">{L("clear")} ({activeCount}) ✕</button>}
      </div>

      {/* chip ฟอร์มกดเร็ว + chip node */}
      <div className="flex flex-wrap items-center gap-2">
        {node && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 ring-1 ring-inset ring-indigo-200">{L("step")}: {node}<button onClick={() => { setNode(""); search(f, ""); }} className="ml-0.5 text-indigo-400 hover:text-indigo-700">✕</button></span>}
        {forms.map((x) => (
          <button key={x.form_code} onClick={() => toggleForm(x.form_code)}
            className={`rounded-lg border px-2.5 py-1 text-left text-xs transition ${f.form === x.form_code ? "border-indigo-400 bg-indigo-50/60 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            <span className="block max-w-[13rem] truncate font-medium">{x.name}</span>
            <span className="text-[10px] text-gray-400">{x.local_count.toLocaleString()} {L("docs")}</span>
          </button>
        ))}
      </div>

      {/* ค้นหาข้อความ (ค้นทั้งระบบ — กด Enter) */}
      <div className="flex gap-2">
        <input className="input flex-1" placeholder={L("searchPh")}
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") search(f, node); }} />
        <button className="btn h-9 px-4 text-sm" onClick={() => search(f, node)} disabled={pending}>{L("search")}</button>
      </div>

      {/* ตาราง */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500">{pending ? L("loading") : <>{L("found")} {rows.length.toLocaleString()} {L("docs")}{hasMore ? "+" : ""} · {activeCount || f.q ? L("byFilter") : L("latestAll")}</>}</div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">{L("colNoForm")}</th><th className="px-3 py-2">{L("colApplicant")}</th><th className="px-3 py-2">{L("colDept")}</th>
                <th className="px-3 py-2">{L("colTopic")}</th><th className="px-3 py-2">{L("colSubmit")}</th><th className="px-3 py-2">{L("colDone")}</th>
                <th className="px-3 py-2 text-right">{L("colAmount")}</th><th className="px-3 py-2">{L("colFiles")}</th><th className="px-3 py-2">{L("colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((o) => {
                const amt = amountOf(o);
                return (
                  <tr key={o.oa_key} className={`cursor-pointer hover:bg-indigo-50/40 ${o.flags?.cancelled ? "opacity-55" : ""}`} onClick={() => setDetail(o)}>
                    <td className="px-3 py-2"><div className="font-mono text-xs text-indigo-600">{o.serial}</div><div className="max-w-[13rem] truncate text-[10px] text-gray-400">{o.form_name}</div></td>
                    <td className="px-3 py-2 text-gray-700">
                      {(() => { const sv = o.approval?.sender; const sName = sv?.name || first(o.fields, ["发起人"]) || "—"; const src = sv?.avatar || (sv?.user_id ? listProfiles[sv.user_id]?.avatar_url : undefined); return (
                        <div className="flex items-center gap-2"><Avatar name={sName} seed={sv?.user_id || sName} size={24} src={src} /><span className="truncate">{sName}</span></div>
                      ); })()}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{first(o.fields, ["发起人部门", "department&部门", "Application sector&申请部门"]) || "—"}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-gray-600">{first(o.fields, ["topic&主题", "ชื่อผู้รับเงิน收款人姓名", "use&用途", "channel渠道", "platform&平台"]) || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{toDate(first(o.fields, ["发起时间"]))}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{toDate(first(o.fields, ["完成时间"]))}</td>
                    <td className="max-w-[9rem] truncate px-3 py-2 text-right font-mono text-xs tabular-nums text-gray-800" title={amt.val != null ? money(amt.val) : ""}>{money(amt.val)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{o.attachments?.files?.length ?? 0}{(o.flags?.low_confidence_files ?? 0) > 0 && <span className="ml-0.5 text-amber-600" title={L("aiUnsure")}>⚠</span>}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${statusCls(o.status)}`}>{oaStatus(o.status, locale)}</span></td>
                  </tr>
                );
              })}
              {pending && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">{L("loading")}</td></tr>}
              {!pending && loaded && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">{L("empty")}</td></tr>}
            </tbody>
          </table>
        </div>
        {hasMore && <div className="text-center"><button onClick={() => search(f, node, true)} disabled={pending} className="btn btn-ghost h-9 text-sm">{pending ? L("loading") : L("loadMore")}</button></div>}
        <p className="text-[11px] text-gray-400">{L("rowHint")}</p>
      </div>

      {/* ─────────── POPUP รายละเอียดเต็ม ─────────── */}
      {detail && <DocModal o={detail} locale={locale} onClose={() => setDetail(null)} />}
    </div>
  );
}

const fmtSize = (b?: number) => (!b ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const extOf = (name?: string) => (name?.match(/\.(\w+)$/)?.[1] || "").toUpperCase();
const extCls = (e: string) => (/PDF/.test(e) ? "bg-rose-50 text-rose-600 ring-rose-200" : /PNG|JPG|JPEG|GIF|WEBP/.test(e) ? "bg-emerald-50 text-emerald-600 ring-emerald-200" : /XLS|CSV/.test(e) ? "bg-green-50 text-green-700 ring-green-200" : /DOC/.test(e) ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-gray-100 text-gray-500 ring-gray-200");

function DocModal({ o, locale, onClose }: { o: Oa; locale: Locale; onClose: () => void }) {
  const L = (k: keyof typeof OAUI) => tri(OAUI[k], locale);
  const amt = amountOf(o);
  const f = o.fields || {};
  const files = o.attachments?.files ?? [];
  const [active, setActive] = useState(() => files.find((x) => isViewable(x.mime, x.name)) ?? files[0] ?? null);
  const [loading, setLoading] = useState(true);
  const [office, setOffice] = useState<{ loading: boolean; html?: string; rows?: any[][]; err?: string }>({ loading: false });
  const [width, setWidth] = useState(1040);
  const [maxed, setMaxed] = useState(false);

  const activeUrl = active ? fileUrl(active.download) : "";
  const name = active?.name || "", mime = active?.mime || "";
  const isImg = !!active && (/image\//i.test(mime) || /\.(png|jpe?g|gif|webp)$/i.test(name));
  const isPdf = !!active && (/pdf/i.test(mime) || /\.pdf$/i.test(name));
  const isDocx = !!active && (/wordprocessingml/i.test(mime) || /\.docx$/i.test(name));
  const isSheet = !!active && (/spreadsheet|ms-excel/i.test(mime) || /\.(xlsx|xls|csv)$/i.test(name));
  const canInline = isImg || isPdf || isDocx || isSheet;
  const pdfSrc = activeUrl ? `${activeUrl}#toolbar=1&navpanes=0&view=FitH` : "";
  const ext = active ? extOf(name) || (isImg ? "IMG" : "FILE") : "";

  // โหลด/แปลงไฟล์ Office (Word→HTML ด้วย mammoth, Excel/CSV→ตาราง ด้วย xlsx) ฝั่งเบราว์เซอร์
  useEffect(() => {
    setLoading(true);
    if (!active || !(isDocx || isSheet)) { setOffice({ loading: false }); return; }
    let cancel = false;
    setOffice({ loading: true });
    (async () => {
      try {
        const res = await fetch(fileUrl(active.download));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancel) return;
        if (isDocx) {
          // @ts-ignore — mammoth browser build ไม่มี type declaration
          const m: any = await import("mammoth/mammoth.browser");
          const r = await m.convertToHtml({ arrayBuffer: buf });
          if (!cancel) setOffice({ loading: false, html: r.value || "<p>(เอกสารไม่มีเนื้อหา)</p>" });
        } else {
          const XLSX: any = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][]).slice(0, 1000);
          if (!cancel) setOffice({ loading: false, rows });
        }
      } catch (e) { if (!cancel) setOffice({ loading: false, err: (e as Error).message }); }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ลากขอบซ้ายเพื่อปรับความกว้าง drawer
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setWidth(Math.max(480, Math.min(window.innerWidth - 48, window.innerWidth - ev.clientX)));
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const head: [string, any][] = [
    [L("applicant"), first(f, ["发起人"])],
    [L("dept"), first(f, ["发起人部门", "department&部门", "Application sector&申请部门"])],
    [L("submitted"), toDate(first(f, ["发起时间"]))],
    [L("completed"), toDate(first(f, ["完成时间"]))],
    [L("flow"), first(f, ["审批流程", "approval_name"])],
    [L("node"), first(f, ["审批节点"])],
    [L("handler"), first(f, ["当前处理人"])],
    [L("amtForm"), amt.val != null ? money(amt.val) : null],
    [L("amtAi"), amt.ai != null ? money(amt.ai) : null],
  ];
  const rest = Object.entries(f).filter(([k, v]) => !MAIN_KEYS.has(k) && v != null && v !== "" && !/^明细$|^Details明细$/.test(k));
  const aiF = active?.ai?.final;
  const appr = o.approval;
  const senderName = appr?.sender?.name || first(f, ["发起人"]) || "—";
  const deptName = appr?.department?.name || first(f, ["发起人部门", "department&部门", "Application sector&申请部门"]) || "";
  const timeline = appr?.timeline ?? [];

  // จับคู่โปรไฟล์ (รูป/ตำแหน่ง) จาก Lark directory — cache-first ฝั่งเซิร์ฟเวอร์
  const [profiles, setProfiles] = useState<Record<string, { name: string; avatar_url: string | null; title: string | null; dept: string | null }>>({});
  useEffect(() => {
    const ppl: { user_id?: string; name?: string }[] = [];
    const need = (p?: Person) => p?.user_id && !p.avatar; // มี avatar จากข้อมูลแล้วไม่ต้อง resolve
    if (need(appr?.sender)) ppl.push({ user_id: appr!.sender!.user_id, name: appr!.sender!.name });
    for (const t of timeline) {
      if (need(t.by ?? undefined)) ppl.push({ user_id: t.by!.user_id, name: t.by!.name });
      for (const p of t.people ?? []) if (need(p)) ppl.push({ user_id: p.user_id, name: p.name });
    }
    if (ppl.length === 0) { setProfiles({}); return; }
    let cancel = false;
    oaResolvePeople(ppl).then((r) => { if (!cancel) setProfiles(r as any); }).catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.oa_key]);
  const prof = (uid?: string) => (uid ? profiles[uid] : undefined);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-[1px]" />
      <aside style={{ width: maxed ? "100vw" : width, maxWidth: "100vw" }} className="relative flex h-full flex-col bg-gray-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* ลากปรับความกว้าง */}
        {!maxed && <div onMouseDown={startDrag} className="group absolute left-0 top-0 z-30 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-indigo-400/30" title={L("resizeHint")}><div className="h-10 w-1 rounded-full bg-gray-300 group-hover:bg-indigo-500" /></div>}

        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xl font-bold text-gray-900">{o.serial}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusCls(o.status)}`}>{oaStatus(o.status, locale)}</span>
            </div>
            <div className="mt-0.5 truncate text-[13px] text-gray-500">{o.form_name} · <span className="text-sky-600">{L("source")}: Lark Approval</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => setMaxed((m) => !m)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">{maxed ? `⤡ ${L("shrink")}` : `⤢ ${L("fullscreen")}`}</button>
            <button className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100" onClick={onClose}>{L("close")} ✕</button>
          </div>
        </div>

        {/* body — 2 คอลัมน์ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* ซ้าย: รายละเอียด */}
          <div className="min-h-0 w-full shrink-0 space-y-4 overflow-y-auto border-gray-200 bg-white p-5 lg:h-full lg:w-[360px] lg:border-r">
            {/* โปรไฟล์ผู้ยื่น */}
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gradient-to-br from-indigo-50/50 to-white p-3">
              <Avatar name={senderName} seed={appr?.sender?.user_id || senderName} size={44} src={appr?.sender?.avatar || prof(appr?.sender?.user_id)?.avatar_url} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">{senderName}</div>
                <div className="truncate text-xs text-gray-500">{prof(appr?.sender?.user_id)?.title ? `${prof(appr?.sender?.user_id)!.title} · ` : ""}{deptName || "—"}</div>
                {appr?.sent_at && <div className="truncate text-[11px] text-gray-400">{L("sentAt")} {appr.sent_at}</div>}
              </div>
            </div>

            {/* timeline การอนุมัติ */}
            {timeline.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{L("approvalFlow")}</div>
                <ol className="rounded-xl border border-gray-100 p-3">
                  {timeline.map((t, i) => {
                    const who = t.by?.name || t.people?.[0]?.name || "";
                    const pend = t.type === "PENDING";
                    return (
                      <li key={i} className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <Avatar name={who || "·"} seed={t.by?.user_id || who} size={26} src={t.by?.avatar || t.people?.[0]?.avatar || prof(t.by?.user_id || t.people?.[0]?.user_id)?.avatar_url} />
                          {i < timeline.length - 1 && <div className="my-0.5 w-px flex-1 bg-gray-200" />}
                        </div>
                        <div className="min-w-0 flex-1 pb-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-sm font-medium ${pend ? "text-blue-600" : "text-gray-800"}`}>{who || "—"}</span>
                            {t.result && <span className={`rounded px-1.5 py-0.5 text-[10px] ${pend ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>{pend ? L("waitingOn") : t.result}</span>}
                          </div>
                          <div className="text-[11px] text-gray-400">{t.node ? `${t.node} · ` : ""}{t.time || ""}</div>
                          {t.comment && <div className="mt-1 border-l-2 border-amber-300 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-700">{L("comment")}: {t.comment}</div>}
                          {!pend && t.people && t.people.length > 0 && <div className="mt-0.5 text-[11px] text-gray-400">→ {t.people.map((p) => p.name).filter(Boolean).join(", ")}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{L("mainInfo")}</div>
              <dl className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
                {head.filter(([, v]) => v != null && v !== "" && v !== "—").map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2 text-sm">
                    <dt className="w-24 shrink-0 text-gray-400">{k}</dt>
                    <dd className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] font-medium text-gray-800">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{L("allFields")} ({rest.length} {L("fields")})</div>
              <dl className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
                {rest.map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-2 text-sm">
                    <dt className="w-24 shrink-0 truncate text-gray-400" title={k}>{oaLabel(k, locale)}</dt>
                    <dd className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-gray-700">{renderVal(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* ขวา: พรีวิวไฟล์ */}
          <div className="flex min-h-0 flex-1 flex-col bg-gray-100">
            {files.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-gray-400"><IconClip className="text-gray-300" />{L("noFile")}</div>
            ) : (
              <>
                {/* แท็บไฟล์ (ถ้ามีหลายไฟล์) */}
                {files.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2">
                    {files.map((file, i) => (
                      <button key={i} onClick={() => setActive(file)} title={file.name}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs transition ${active === file ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        <span className="max-w-[12rem] truncate">{file.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* แถบหัวไฟล์ */}
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${extCls(ext)}`}>{ext}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800" title={active?.name}>{active?.name}</span>
                  {active?.size ? <span className="text-xs text-gray-400">{fmtSize(active.size)}</span> : null}
                  {activeUrl && <a href={activeUrl} target="_blank" rel="noopener" className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">{L("openTab")}</a>}
                  {activeUrl && <a href={`${activeUrl}?dl=1`} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700">{L("download")}</a>}
                </div>

                {/* พื้นที่พรีวิว */}
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {isImg || isPdf ? (
                    <div className="relative mx-auto h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      {loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">{L("loadingFile")}</div>}
                      {isImg ? (
                        <img src={activeUrl} alt={name} onLoad={() => setLoading(false)} className="mx-auto max-h-full w-auto object-contain" />
                      ) : (
                        <iframe key={activeUrl} src={pdfSrc} title={name} onLoad={() => setLoading(false)} className="h-full w-full" />
                      )}
                    </div>
                  ) : isDocx ? (
                    <div className="h-full w-full overflow-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                      {office.loading ? <div className="pt-10 text-center text-sm text-gray-400">{L("convWord")}</div>
                       : office.err ? <div className="pt-10 text-center text-sm text-gray-400">{L("cantOpen")}: {office.err} · <a href={`${activeUrl}?dl=1`} className="text-indigo-600 hover:underline">{L("download")}</a></div>
                       : <div className="mx-auto max-w-3xl text-sm leading-relaxed text-gray-800 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border [&_table]:border-gray-200 [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: office.html || "" }} />}
                    </div>
                  ) : isSheet ? (
                    <div className="h-full w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                      {office.loading ? <div className="pt-10 text-center text-sm text-gray-400">{L("readSheet")}</div>
                       : office.err ? <div className="pt-10 text-center text-sm text-gray-400">{L("cantOpen")}: {office.err} · <a href={`${activeUrl}?dl=1`} className="text-indigo-600 hover:underline">{L("download")}</a></div>
                       : <table className="w-full border-collapse text-xs">
                           <tbody>
                             {(office.rows || []).map((r, ri) => (
                               <tr key={ri} className={ri === 0 ? "sticky top-0 bg-gray-50 font-medium" : "odd:bg-gray-50/40"}>
                                 <td className="border border-gray-100 px-1.5 py-1 text-center text-[10px] text-gray-300">{ri + 1}</td>
                                 {(r || []).map((c, ci) => <td key={ci} className="whitespace-nowrap border border-gray-100 px-2 py-1 text-gray-700">{c == null ? "" : String(c)}</td>)}
                               </tr>
                             ))}
                           </tbody>
                         </table>}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-400">
                      <span>{L("cantPreview")}</span>
                      {activeUrl && <a href={`${activeUrl}?dl=1`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">{L("downloadOpen")}</a>}
                    </div>
                  )}
                </div>

                {/* AI อ่านจากไฟล์ */}
                {aiF && (
                  <div className="border-t border-gray-200 bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-indigo-700"><IconSparkle className="animate-pulse text-indigo-500" /> {L("aiRead")} {active?.ai?.model && <span className="font-normal text-gray-400">· {active.ai.model}</span>}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      {[[L("docNo"), aiF.doc_no], [L("date"), aiF.doc_date], [L("seller"), aiF.seller], [L("total"), typeof aiF.total === "number" ? aiF.total.toLocaleString() : aiF.total]]
                        .filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                          <div key={k as string} className="min-w-0"><div className="text-gray-400">{k}</div><div className="truncate font-medium text-gray-700" title={String(v)}>{String(v)}</div></div>
                        ))}
                    </div>
                    {Array.isArray(aiF.items) && aiF.items.length > 0 && <div className="mt-1.5 text-xs text-gray-400">{aiF.items.length} {L("itemsInDoc")}</div>}
                    {Array.isArray(aiF.low_confidence) && aiF.low_confidence.length > 0 && <div className="mt-1 text-xs text-amber-600">⚠ {L("aiUnsure")}: {aiF.low_confidence.join(", ")}</div>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
