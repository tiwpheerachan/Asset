"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui";

type U = { id: number; name: string; email: string; avatar_url?: string | null };

/**
 * จัดการสิทธิ์หลายคนพร้อมกัน — เลือกผู้ใช้หลายคน แล้วตั้งบทบาท/ขอบเขตข้อมูล/สถานะทีเดียว
 * (ตัวเลือก "ไม่เปลี่ยน" = คงค่าเดิมของแต่ละคน)
 */
export default function BulkUserActions({
  users, action,
}: {
  users: U[];
  action: (form: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(term)) : users;
  }, [users, q]);

  const toggle = (id: number) =>
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAllShown = () => setSel(new Set(filtered.map((u) => u.id)));
  const clear = () => setSel(new Set());

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-text">จัดการหลายคนพร้อมกัน</span>
        <span className="text-xs text-muted">{open ? "ซ่อน ▲" : `เลือก ${sel.size} คน · เปิด ▼`}</span>
      </button>

      {open && (
        <form action={action} className="space-y-3 border-t border-border px-5 py-4">
          {[...sel].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ/อีเมล…"
              className="bar-field h-9 min-w-[200px] flex-1"
            />
            <button type="button" onClick={selectAllShown} className="rounded-md px-2.5 py-1 text-xs text-primary ring-1 ring-primary/40 hover:bg-primary/5">
              เลือกทั้งหมดที่แสดง ({filtered.length})
            </button>
            <button type="button" onClick={clear} className="rounded-md px-2.5 py-1 text-xs text-text-soft ring-1 ring-border hover:bg-surface-2">
              ล้างที่เลือก
            </button>
          </div>

          <div className="max-h-56 overflow-auto rounded-lg border border-border">
            {filtered.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-surface-2">
                <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 accent-blue-600" />
                <Avatar name={u.name} size={26} src={u.avatar_url ?? undefined} />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{u.name}</span>
                <span className="hidden truncate text-[11px] text-muted sm:block">{u.email}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">บทบาท</label>
              <select name="role" defaultValue="" className="bar-field w-36">
                <option value="">— ไม่เปลี่ยน —</option>
                <option value="ADMIN">ผู้ดูแลระบบ</option>
                <option value="MANAGER">หัวหน้าทีม</option>
                <option value="USER">ผู้ใช้ทั่วไป</option>
              </select>
            </div>
            <div>
              <label className="label">ขอบเขตข้อมูล</label>
              <select name="data_scope" defaultValue="" className="bar-field w-40">
                <option value="">— ไม่เปลี่ยน —</option>
                <option value="ROLE">ตามบทบาท</option>
                <option value="COMPANY">ทั้งบริษัท</option>
                <option value="DEPT">ทั้งแผนก</option>
                <option value="SELF">เฉพาะตัวเอง</option>
              </select>
            </div>
            <div>
              <label className="label">สถานะ</label>
              <select name="active" defaultValue="" className="bar-field w-32">
                <option value="">— ไม่เปลี่ยน —</option>
                <option value="1">ใช้งาน</option>
                <option value="0">ปิดใช้งาน</option>
              </select>
            </div>
            <button type="submit" disabled={sel.size === 0} className="btn-primary h-10 px-5 disabled:opacity-40">
              ใช้กับที่เลือก ({sel.size})
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
