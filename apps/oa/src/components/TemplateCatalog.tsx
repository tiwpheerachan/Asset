"use client";

import { useState } from "react";
import TemplateCard from "@/components/TemplateCard";
import { useT } from "@/components/I18nProvider";

export type CatalogItem = {
  id: number;
  code: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  categoryId: number;
  href?: string;
  warning?: string;
  manageHref?: string;
};

export type CatalogGroup = { id: number; name: string; count: number };

/**
 * แคตตาล็อกฟอร์ม — แถบหมวดกับช่องค้นหาอยู่แถวเดียวกัน แล้วกริดการ์ดเต็มความกว้างข้างล่าง
 *
 * หมวดกับช่องค้นหาเป็นเครื่องมือกรองรายการเดียวกัน อยู่แถวเดียวกันจึงอ่านเป็นชุดเดียว
 * และคืนความกว้างที่คอลัมน์หมวดเคยกินไปให้การ์ดฟอร์ม ซึ่งได้การ์ดเพิ่มต่อแถว
 *
 * กรองด้วย state ฝั่งเบราว์เซอร์ ไม่ยิงกลับเซิร์ฟเวอร์ — ฟอร์มทั้งหมดมาพร้อมหน้าอยู่แล้ว
 * การสลับหมวดจึงควรทันทีเหมือนสลับแท็บ ไม่ใช่รอโหลดหน้าใหม่
 */
export default function TemplateCatalog({
  groups,
  items,
  manageLabel,
  search,
}: {
  groups: CatalogGroup[];
  items: CatalogItem[];
  manageLabel: string;
  /** ช่องค้นหา — ส่งมาจากหน้า เพราะเป็นฟอร์มฝั่งเซิร์ฟเวอร์ที่ผูกกับ ?q= ใน URL */
  search?: React.ReactNode;
}) {
  const t = useT();
  const [active, setActive] = useState<number | "all">("all");

  const shown = active === "all" ? items : items.filter((x) => x.categoryId === active);

  return (
    <div className="space-y-3">
      {/* แถวเดียว: หมวดซ้าย ช่องค้นหาขวา — บนจอแคบตกลงมาเป็นสองบรรทัด
          แถบหมวดเลื่อนแนวนอนได้ จะได้ไม่ดันช่องค้นหาจนแคบเมื่อมีหมวดเยอะ */}
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label={t("catalog.categories")}
          // สูงเท่ากับช่องค้นหาเป๊ะ ๆ (h-11) และมีกรอบชุดเดียวกัน — สองอันนี้อยู่แถวเดียวกัน
          // ถ้าสูงไม่เท่าหรือกรอบคนละแบบ จะอ่านเหมือนเป็นของคนละชุดที่บังเอิญมาอยู่ข้างกัน
          className="flex h-11 max-w-full shrink-0 items-center gap-1 overflow-x-auto
                     rounded-full bg-surface px-1.5 ring-1 ring-border-strong"
        >
          <CatBtn
            label={t("common.all")}
            count={items.length}
            on={active === "all"}
            onClick={() => setActive("all")}
          />
          {groups.map((g) => (
            <CatBtn
              key={g.id}
              label={g.name}
              count={g.count}
              on={active === g.id}
              onClick={() => setActive(g.id)}
            />
          ))}
        </nav>

        <div className="flex min-w-[220px] flex-1 items-center">{search}</div>
      </div>

      <div className="min-w-0">
        <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
          {/* auto-fill ไม่ใช่จำนวนคอลัมน์ตายตัว — จอกว้างขึ้นได้คอลัมน์เพิ่ม
              ไม่ใช่การ์ดยืดออก · การ์ดกว้างเกิน 320px คือช่องว่างเปล่า ๆ ข้างชื่อฟอร์ม
              ซึ่งทำให้กวาดตาหายากขึ้น เพราะสายตาต้องเดินทางไกลกว่าเดิมต่อหนึ่งใบ */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
            {shown.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                id={tpl.id}
                code={tpl.code}
                name={tpl.name}
                icon={tpl.icon}
                color={tpl.color}
                description={tpl.description}
                href={tpl.href}
                muted={!tpl.href}
                warning={tpl.warning}
                manageHref={tpl.manageHref}
                manageLabel={manageLabel}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatBtn({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "true" : undefined}
      className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3
                  text-sm transition
                  ${on ? "bg-primary-soft font-medium text-primary-text" : "text-text-soft hover:bg-surface-2 hover:text-text"}`}
    >
      {label}
      {/* ตัวเลขเป็นข้อมูลรอง — จางลงและไม่หนา จะได้ไม่แย่งสายตาไปจากชื่อหมวด */}
      <span className={`text-xs tabular-nums ${on ? "text-primary-text/60" : "text-muted"}`}>
        {count}
      </span>
    </button>
  );
}
