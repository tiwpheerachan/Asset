"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { oaHistoryQuery } from "@/lib/feishu-actions";
import { oaStatus, OAUI, tri } from "@/lib/oa-export/labels";
import type { Locale } from "@/lib/i18n/locales";

type Sync = { id: number; at: string; source: string; pages: number; fetched: number; changed: number; total: number; ms: number; ok: boolean };
type Change = { id: number; at: string; oa_key: string; serial: string; form_name: string; kind: string; old_val: string | null; new_val: string | null };

const fmtTime = (s: string) => { const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : s; };
const fmtMs = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

type Filters = { from: string; to: string; source: string; changeKind: string; q: string };
const EMPTY: Filters = { from: "", to: "", source: "", changeKind: "", q: "" };

export default function OaHistoryView({ locale, initSyncs, initChanges, counts }: { locale: Locale; initSyncs: Sync[]; initChanges: Change[]; counts: { syncs: number; changes: number } }) {
  const L = (k: keyof typeof OAUI) => tri(OAUI[k], locale);
  const [tab, setTab] = useState<"sync" | "change">("sync");
  const [syncs, setSyncs] = useState<Sync[]>(initSyncs);
  const [changes, setChanges] = useState<Change[]>(initChanges);
  const [syncTotal, setSyncTotal] = useState(counts.syncs);
  const [changeTotal, setChangeTotal] = useState(counts.changes);
  const [f, setF] = useState<Filters>(EMPTY);
  const [pending, start] = useTransition();

  const rows = tab === "sync" ? syncs : changes;
  const total = tab === "sync" ? syncTotal : changeTotal;
  const more = rows.length < total;
  const activeCount = [f.from, f.to, tab === "sync" ? f.source : f.changeKind, tab === "change" ? f.q : ""].filter(Boolean).length;

  const run = (nf: Filters, t: "sync" | "change", append: boolean) => {
    const cur = t === "sync" ? syncs : changes;
    start(async () => {
      const r: any = await oaHistoryQuery(t, { offset: append ? cur.length : 0, limit: 50, from: nf.from || undefined, to: nf.to || undefined, source: nf.source || undefined, changeKind: nf.changeKind || undefined, q: nf.q || undefined });
      if (t === "sync") { setSyncs((p) => (append ? [...p, ...r.rows] : r.rows)); setSyncTotal(r.total); }
      else { setChanges((p) => (append ? [...p, ...r.rows] : r.rows)); setChangeTotal(r.total); }
    });
  };
  const apply = (patch: Partial<Filters>) => { const nf = { ...f, ...patch }; setF(nf); run(nf, tab, false); };
  const clear = () => { setF(EMPTY); run(EMPTY, tab, false); };
  const switchTab = (t: "sync" | "change") => { setTab(t); run(f, t, false); };

  const TabBtn = ({ id, label, n }: { id: "sync" | "change"; label: string; n: number }) => (
    <button onClick={() => switchTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}>
      {label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === id ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{n.toLocaleString()}</span>
    </button>
  );

  const kindMeta = (k: string) => k === "new" ? { t: tri(OAUI.kindNew, locale), c: "bg-sky-50 text-sky-700 ring-sky-200" }
    : k === "status" ? { t: tri(OAUI.kindStatus, locale), c: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : { t: tri(OAUI.kindNode, locale), c: "bg-gray-100 text-gray-600 ring-gray-200" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/oa-documents" className="rounded-lg px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-indigo-600">{L("backToDocs")}</Link>
        <div className="flex-1" />
        <div className="inline-flex gap-1 rounded-xl bg-gray-50 p-1 ring-1 ring-gray-200">
          <TabBtn id="sync" label={L("tabSync")} n={syncTotal} />
          <TabBtn id="change" label={L("tabChange")} n={changeTotal} />
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <label className="flex flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{L("from")}</span>
          <input type="date" className="input h-9" value={f.from} onChange={(e) => apply({ from: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{L("to")}</span>
          <input type="date" className="input h-9" value={f.to} onChange={(e) => apply({ to: e.target.value })} /></label>
        {tab === "sync" ? (
          <label className="flex flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{L("hSource")}</span>
            <select className="input h-9" value={f.source} onChange={(e) => apply({ source: e.target.value })}>
              <option value="">{L("hSourceAll")}</option><option value="cron">{L("srcCron")}</option><option value="manual">{L("srcManual")}</option>
            </select></label>
        ) : (
          <>
            <label className="flex flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{L("hKind")}</span>
              <select className="input h-9" value={f.changeKind} onChange={(e) => apply({ changeKind: e.target.value })}>
                <option value="">{L("hKindAll")}</option><option value="new">{L("kindNew")}</option><option value="status">{L("kindStatus")}</option><option value="node">{L("kindNode")}</option>
              </select></label>
            <label className="flex flex-1 flex-col gap-1"><span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{L("search")}</span>
              <input className="input h-9 min-w-[12rem]" placeholder={L("hSearchSerial")} value={f.q}
                onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") run(f, tab, false); }} /></label>
          </>
        )}
        <div className="flex-1" />
        {activeCount > 0 && <button onClick={clear} className="h-9 rounded-lg px-3 text-sm text-gray-500 hover:bg-white hover:text-indigo-600">{L("clear")} ({activeCount}) ✕</button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]">
        {tab === "sync" ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <tr><th className="px-4 py-2.5">{L("time")}</th><th className="px-4 py-2.5">{L("by")}</th><th className="px-4 py-2.5 text-right">{L("cameIn")}</th><th className="px-4 py-2.5 text-right">{L("changedCol")}</th><th className="px-4 py-2.5 text-right">{L("totalCol")}</th><th className="px-4 py-2.5 text-right">{L("duration")}</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {syncs.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-gray-500">{fmtTime(s.at)}</td>
                    <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] ${s.source === "cron" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>{s.source === "cron" ? L("srcCron") : L("srcManual")}</span></td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-700">{Number(s.fetched).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{Number(s.changed) > 0 ? <span className="font-semibold text-amber-600">{s.changed}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-400">{Number(s.total).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-400">{fmtMs(Number(s.ms))}</td>
                  </tr>
                ))}
                {syncs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">{L("noHistory")}</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {changes.length === 0 && <div className="py-10 text-center text-sm text-gray-400">{L("noHistory")}</div>}
            {changes.map((c) => { const m = kindMeta(c.kind); return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50/60">
                <span className="w-32 shrink-0 text-xs text-gray-400">{fmtTime(c.at)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${m.c}`}>{m.t}</span>
                <span className="font-mono text-indigo-600">{c.serial || c.oa_key}</span>
                <span className="truncate text-xs text-gray-400">{c.form_name}</span>
                {c.kind !== "new" && <span className="ml-auto text-gray-500">{oaStatus(c.old_val || "", locale)} <span className="text-gray-300">→</span> <span className="font-medium text-gray-800">{oaStatus(c.new_val || "", locale)}</span></span>}
              </div>
            ); })}
          </div>
        )}
      </div>

      <div className="text-center">
        {more ? (
          <button onClick={() => run(f, tab, true)} disabled={pending} className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm text-gray-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">
            {pending ? L("loading") : `${L("loadMore2")} (${(total - rows.length).toLocaleString()})`}
          </button>
        ) : (
          <span className="text-xs text-gray-400">{L("allLoaded")} · {total.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
