"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addApproverFromDirectoryAction, type ActionState } from "@/lib/actions";
import { FormMessage } from "@/components/ui";
import { useT } from "@/components/I18nProvider";

/**
 * ช่องพิมพ์ชื่อ Lark แล้วเลือกผู้อนุมัติ — ดึงรายชื่อจากระบบกลาง (Central Login)
 *
 * พิมพ์ → เรียก /api/directory/search (คีย์อยู่ฝั่งเซิร์ฟเวอร์) → เลือกคน → ผูกเข้าขั้นทันที
 * เพิ่มได้หลายคนต่อขั้น (เลือกทีละคน) เพราะรายชื่อของขั้นแสดงอยู่เหนือช่องนี้
 */

interface Person {
  union_id: string;
  name: string;
  en_name: string | null;
  email: string | null;
  job_title: string | null;
  departments: string[];
  avatar_url: string | null;
}

const initial: ActionState = {};
const initials = (n: string) => (n || "?").trim().slice(0, 1).toUpperCase();

export default function DirectoryApproverPicker({
  nodeId,
  templateId,
  compact = false,
}: {
  nodeId: number;
  templateId: number;
  compact?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(!compact);
  const [state, action] = useActionState(addApproverFromDirectoryAction, initial);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState({ email: "", name: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // ค้นหาแบบหน่วงเวลา — กันยิงถี่จนโดนจำกัดอัตรา และตรงกับที่ API กำหนด (ขั้นต่ำ 2 ตัว)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setOpen(false);
      setErr(null);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/directory/search?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (!j.ok) {
          const map: Record<string, string> = {
            not_configured: t("builder.dir.notConfigured"),
            central_unreachable: t("builder.dir.unreachable"),
            forbidden: t("builder.dir.forbidden"),
            query_too_short: "",
          };
          setErr(map[j.error] ?? t("builder.dir.error"));
          setItems([]);
        } else {
          setErr(null);
          setItems(j.items ?? []);
        }
      } catch {
        setErr(t("builder.dir.unreachable"));
        setItems([]);
      } finally {
        setLoading(false);
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q, t]);

  // เพิ่มสำเร็จ → เคลียร์ช่อง พร้อมพิมพ์คนถัดไป
  useEffect(() => {
    if (state.ok) {
      setQ("");
      setItems([]);
      setOpen(false);
    }
  }, [state.ok]);

  // คลิกนอกกล่อง → ปิดรายการ
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  function choose(p: Person) {
    if (!p.email) return; // ไม่มีอีเมล = แจ้งเตือน Lark ไม่ได้ จึงตั้งเป็นผู้อนุมัติไม่ได้
    setPick({ email: p.email, name: p.name });
    setOpen(false);
    // ให้ค่า hidden อัปเดตก่อนแล้วค่อยส่งฟอร์ม
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  return (
    <div className={compact && !expanded ? "" : "space-y-2 border-t border-border pt-2"} ref={boxRef}>
      <FormMessage state={state} />

      {/* ฟอร์มซ่อน — ค่าเติมจากคนที่คลิกเลือก แล้ว requestSubmit */}
      <form action={action} ref={formRef} className="hidden">
        <input type="hidden" name="node_id" value={nodeId} />
        <input type="hidden" name="template_id" value={templateId} />
        <input type="hidden" name="email" value={pick.email} />
        <input type="hidden" name="name" value={pick.name} />
      </form>

      {/* ปุ่มมีข้อความกำกับ — เดิมเป็นวงกลม "+" เปล่า ๆ ซึ่งไม่บอกว่ากดแล้วได้อะไร
          และหน้าตาไปซ้ำกับปุ่มเพิ่มขั้นตอน ทั้งที่ทำคนละเรื่อง */}
      {compact && (
        <button
          type="button"
          className="btn-ghost absolute right-3 top-2.5 h-9 min-h-0 px-3.5 text-[13px]"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t("common.cancel") : t("decide.addApprover")}
        </button>
      )}
      {expanded && <div className="relative">
        <input
          autoFocus={compact}
          aria-label={t("builder.dir.placeholder")}
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={t("builder.dir.placeholder")}
          autoComplete="off"
        />

        {open && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
            {loading && <li className="px-3 py-2 text-sm text-muted">{t("builder.dir.loading")}</li>}
            {!loading && err && <li className="px-3 py-2 text-sm text-amber-700">{err}</li>}
            {!loading && !err && items.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">{t("builder.dir.none")}</li>
            )}
            {!loading &&
              !err &&
              items.map((p) => {
                const sub = [p.job_title, p.departments.join(" · "), p.email].filter(Boolean).join(" — ");
                return (
                  <li key={p.union_id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                    >
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                          {initials(p.name)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-text">
                          {p.name}
                          {p.en_name ? ` (${p.en_name})` : ""}
                        </span>
                        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>}

      {expanded && <p className="text-xs text-muted">{t("builder.dir.hint")}</p>}
    </div>
  );
}
