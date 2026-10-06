"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { FIELD_TYPES, type FieldType } from "@/lib/types";
import { FIELD_TYPE_ICON } from "./field-type-icons";
import { IconChevron } from "@/components/icons";

/**
 * ตัวเลือกชนิดคำถาม
 *
 * ใช้ <select> ของเบราว์เซอร์ไม่ได้ เพราะ <option> รับได้แต่ข้อความล้วน —
 * เดิมจึงต้องใช้อักขระอย่าง ≡ ¶ ▤ แทนไอคอน ซึ่งขนาดกับน้ำหนักเส้นไม่เข้ากับที่อื่น
 * และบางตัวขึ้นกับฟอนต์ของเครื่อง เขียนเป็นเมนูเองเพื่อให้ใส่ไอคอนชุดเดียวกันได้
 *
 * ค่าที่ส่งกับฟอร์มยังมาจาก <input type="hidden" name="type"> ที่ผู้เรียกวางไว้เหมือนเดิม
 */
export default function FieldTypePicker({
  value,
  onChange,
}: {
  value: FieldType;
  onChange: (t: FieldType) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const Current = FIELD_TYPE_ICON[value];

  // ปิดเมนูเมื่อคลิกนอกกล่องหรือกด Escape — เมนูที่ปิดไม่ได้คือเมนูที่ขวางทาง
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("builder.field.type")}
        className="input flex w-full items-center gap-2 text-left"
      >
        <Current className="h-[18px] w-[18px] shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{t(`fieldType.${value}`)}</span>
        <IconChevron className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-e3"
        >
          {FIELD_TYPES.map((ft) => {
            const Icon = FIELD_TYPE_ICON[ft];
            const on = ft === value;
            return (
              <li key={ft}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(ft);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                    on ? "bg-primary-soft text-primary-text" : "text-text-soft hover:bg-surface-2"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${on ? "" : "text-muted"}`} />
                  <span className="min-w-0 flex-1 truncate">{t(`fieldType.${ft}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
