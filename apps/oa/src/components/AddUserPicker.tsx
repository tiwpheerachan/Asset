"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ค้นหาคนจากไดเรกทอรี Lark กลาง แล้วเพิ่มเป็นผู้ใช้ในแอป (ตั้งบทบาทได้เลย)
 * API key อยู่ฝั่งเซิร์ฟเวอร์ (/api/directory/search) เบราว์เซอร์ไม่เคยเห็น
 */
type Person = { union_id: string; name: string; email: string | null; job_title: string | null; departments: string[] };
type Labels = {
  heading: string; placeholder: string; searching: string; noResult: string;
  tooShort: string; notConfigured: string; failed: string; stale: string;
  role: string; add: string; picked: string;
};

export default function AddUserPicker({
  action, roleOptions, labels,
}: {
  action: (form: FormData) => void | Promise<void>;
  roleOptions: { value: string; label: string }[];
  labels: Labels;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [picked, setPicked] = useState<{ email: string; name: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // ปิด dropdown เมื่อคลิกนอกกล่อง
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ค้นหาแบบ debounce
  useEffect(() => {
    const term = q.trim();
    if (picked && term === picked.name) return; // เพิ่งเลือก ไม่ต้องค้นซ้ำ
    if (term.length < 2) { setItems([]); setNote(null); setOpen(false); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setLoading(true); setNote(null);
      try {
        const res = await fetch(`/api/directory/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!data.ok) {
          setItems([]); setOpen(true);
          setNote(data.error === "query_too_short" ? labels.tooShort
            : data.error === "not_configured" ? labels.notConfigured : labels.failed);
          return;
        }
        setItems(data.items ?? []);
        setStale(Boolean(data.stale));
        setOpen(true);
        if ((data.items ?? []).length === 0) setNote(labels.noResult);
      } catch (e) {
        if ((e as Error).name !== "AbortError") { setNote(labels.failed); setOpen(true); }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, picked, labels]);

  const choose = (p: Person) => {
    if (!p.email) return;
    setPicked({ email: p.email, name: p.name });
    setQ(p.name);
    setOpen(false);
  };

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div ref={boxRef} className="relative min-w-[240px] flex-1">
        <label className="label">{labels.heading}</label>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={labels.placeholder}
          className="bar-field w-full"
          autoComplete="off"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-e2">
            {loading && <div className="px-3 py-2 text-xs text-muted">{labels.searching}</div>}
            {!loading && note && <div className="px-3 py-2 text-xs text-muted">{note}</div>}
            {!loading && stale && items.length > 0 && (
              <div className="px-3 py-1 text-[11px] text-amber-700">{labels.stale}</div>
            )}
            {items.map((p) => (
              <button
                key={p.union_id}
                type="button"
                onClick={() => choose(p)}
                disabled={!p.email}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <span className="text-sm font-medium text-text">{p.name}</span>
                <span className="text-[11px] text-muted">
                  {p.email || "— ไม่มีอีเมล —"}
                  {p.job_title ? ` · ${p.job_title}` : ""}
                  {p.departments?.[0] ? ` · ${p.departments[0]}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && <input type="hidden" name="email" value={picked.email} />}
      {picked && <input type="hidden" name="name" value={picked.name} />}

      <div>
        <label className="label">{labels.role}</label>
        <select name="role" defaultValue="USER" className="bar-field w-36">
          {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <button type="submit" disabled={!picked} className="btn-primary h-11 px-4 disabled:opacity-40">
        {labels.add}
      </button>
      {picked && (
        <span className="text-xs text-muted">{labels.picked}: <b className="text-text">{picked.name}</b></span>
      )}
    </form>
  );
}
