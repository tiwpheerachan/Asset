"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  MENU_CATALOG, MENU_GROUP_LABEL, ALL_MENU_KEYS, roleDefaultMenuKeys,
  type MenuKey, type MenuGroupKey,
} from "@/lib/menu-access";

const GROUP_ORDER: MenuGroupKey[] = ["mine", "requests", "admin", "system"];

/**
 * ตารางสิทธิ์เห็นเมนูรายคน (checkbox)
 * - โหมด "ตามบทบาท": ล้าง override — เห็นเมนูตาม role (ADMIN เห็นหมด / อื่นเห็นพื้นฐาน)
 * - โหมด "กำหนดเอง": ติ๊กทีละเมนู · ปุ่มลัด "เห็นทุกแท็บ" / "ล้างทั้งหมด"
 */
export default function MenuAccessForm({
  userId, role, initialKeys, initialCustom, action,
}: {
  userId: number;
  role: string;
  initialKeys: MenuKey[];
  initialCustom: boolean;
  action: (form: FormData) => void | Promise<void>;
}) {
  const { locale } = useI18n();
  const L = (t: [string, string, string]) => (locale === "en" ? t[1] : locale === "zh" ? t[2] : t[0]);

  const [custom, setCustom] = useState(initialCustom);
  const [checked, setChecked] = useState<Set<MenuKey>>(new Set(initialKeys));
  const roleDefault = useMemo(() => new Set(roleDefaultMenuKeys(role)), [role]);

  const toggle = (k: MenuKey) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const checkAll = () => setChecked(new Set(ALL_MENU_KEYS));
  const clearAll = () => setChecked(new Set());
  const useRoleDefault = () => setChecked(new Set(roleDefault));

  const shownKeys = custom ? checked : roleDefault;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="mode" value={custom ? "custom" : "role"} />

      {/* เลือกโหมด */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCustom(false)}
          className={`rounded-lg px-3 py-1.5 text-sm ring-1 transition ${!custom ? "bg-primary text-white ring-primary" : "text-text-soft ring-border hover:bg-surface-2"}`}
        >
          {L(["ใช้ตามบทบาท", "Follow role", "按角色"])}
        </button>
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`rounded-lg px-3 py-1.5 text-sm ring-1 transition ${custom ? "bg-primary text-white ring-primary" : "text-text-soft ring-border hover:bg-surface-2"}`}
        >
          {L(["กำหนดเอง", "Custom", "自定义"])}
        </button>
        <span className="text-xs text-muted">
          {custom
            ? L(["ติ๊กเมนูที่ให้เห็น", "Tick menus to allow", "勾选可见菜单"])
            : L([`เห็นตามบทบาท (${role})`, `Visible by role (${role})`, `按角色可见 (${role})`])}
        </span>
      </div>

      {/* ปุ่มลัด (เฉพาะโหมดกำหนดเอง) */}
      {custom && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={checkAll} className="rounded-md px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/40 hover:bg-primary/5">
            ✓ {L(["เห็นทุกแท็บ (สิทธิ์สูงสุด)", "See all tabs", "查看全部"])}
          </button>
          <button type="button" onClick={useRoleDefault} className="rounded-md px-2.5 py-1 text-xs text-text-soft ring-1 ring-border hover:bg-surface-2">
            {L(["รีเซ็ตตามบทบาท", "Reset to role", "重置为角色"])}
          </button>
          <button type="button" onClick={clearAll} className="rounded-md px-2.5 py-1 text-xs text-no ring-1 ring-no/30 hover:bg-no/5">
            {L(["ล้างทั้งหมด", "Clear all", "全部清除"])}
          </button>
        </div>
      )}

      {/* ตารางเมนูแยกกลุ่ม */}
      <div className="grid gap-3 sm:grid-cols-2">
        {GROUP_ORDER.map((gk) => {
          const items = MENU_CATALOG.filter((m) => m.group === gk);
          return (
            <fieldset key={gk} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-[12px] font-semibold text-text-soft">{L(MENU_GROUP_LABEL[gk])}</legend>
              <div className="space-y-1.5">
                {items.map((m) => {
                  const on = shownKeys.has(m.key);
                  return (
                    <label
                      key={m.key}
                      className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${custom ? "cursor-pointer hover:bg-surface-2" : "opacity-70"}`}
                    >
                      <input
                        type="checkbox"
                        name="keys"
                        value={m.key}
                        checked={on}
                        disabled={!custom}
                        onChange={() => toggle(m.key)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="flex-1 text-text">{L(m.label)}</span>
                      {m.adminOnly && <span className="text-[10px] text-muted">admin</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <button type="submit" className="btn-primary h-10 px-5">
        {L(["บันทึกสิทธิ์เมนู", "Save menu access", "保存菜单权限"])}
      </button>
    </form>
  );
}
