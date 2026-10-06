"use client";

import TemplateIcon from "@/components/TemplateIcon";
import Link from "next/link";
import { useActionState } from "react";
import { deleteTemplateAction, toggleTemplateAction, type ActionState } from "@/lib/actions";
import { IconEye, IconEyeOff, IconTrash } from "@/components/icons";
import { useT } from "@/components/I18nProvider";
import type { FormCategory, TemplateWithCategory } from "@/lib/types";

const initial: ActionState = {};

export default function TemplateManager({
  templates,
  categories,
  problems,
}: {
  templates: TemplateWithCategory[];
  categories: FormCategory[];
  /** id แม่แบบ → รายการคีย์ปัญหาที่ทำให้ยังส่งคำขอไม่ได้ */
  problems: Record<number, string[]>;
}) {
  const t = useT();
  // ผลของการลบต้องบอกกลับมาที่หน้า — โดยเฉพาะกรณีลบไม่ได้เพราะมีเอกสารอยู่แล้ว
  const [del, delAction] = useActionState(deleteTemplateAction, initial);

  const grouped = categories
    .map((c) => ({ cat: c, items: templates.filter((x) => x.category_id === c.id) }))
    .concat([{ cat: { id: 0, name: t("admin.forms.uncategorised"), sort_order: 99, active: 1 }, items: templates.filter((x) => !x.category_id) }])
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {/* ข้อความผลลัพธ์อยู่บนสุดของรายการ ไม่ใช่ในการ์ดที่เพิ่งกด — การ์ดนั้นอาจหายไปแล้ว
          ถ้าลบสำเร็จ และถ้าลบไม่ได้ก็ยังอยู่ที่เดิมให้กด "ปิดใช้" ต่อได้ */}
      {del.error && <p className="rounded-md tone-rose px-3 py-2 text-sm ring-1">{del.error}</p>}
      {del.ok && <p className="rounded-md tone-emerald px-3 py-2 text-sm ring-1">{del.ok}</p>}

      {grouped.map(({ cat, items }) => (
        <section key={cat.id} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{cat.name}</h2>
          {/* คอลัมน์น้อยลง การ์ดกว้างขึ้น — ห้าคอลัมน์ทำให้ชื่อฟอร์มกับคำอธิบายตัดบรรทัด
              แทบทุกใบ การ์ดจึงสูงไม่เท่ากันและอ่านเหมือนของอัดกันอยู่ */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((tpl) => (
              <div key={tpl.id}
                   className={`card flex flex-col gap-3 p-4 ${tpl.active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <TemplateIcon code={tpl.code} icon={tpl.icon} color={tpl.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium leading-snug text-text" title={tpl.name}>
                      {tpl.name}
                    </div>
                    <div className="truncate font-mono text-[11px] uppercase text-muted">
                      {tpl.code}
                    </div>
                  </div>
                </div>

                {/* เนื้อกลางยืดเต็มที่ว่าง ท้ายการ์ดจึงอยู่ระดับเดียวกันทุกใบในแถว */}
                <div className="min-h-0 flex-1 space-y-2">
                  {tpl.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted"
                       title={tpl.description}>
                      {tpl.description}
                    </p>
                  )}
                  {problems[tpl.id] && (
                    <div className="space-y-1">
                      <span className="badge tone-amber">{t("admin.forms.notReady")}</span>
                      <p className="text-xs leading-relaxed text-muted">
                        {problems[tpl.id].map((k) => t(k)).join(" · ")}
                      </p>
                    </div>
                  )}
                </div>

                {/* ท้ายการ์ด: ทางหลักอยู่ซ้าย ของที่ทำนาน ๆ ครั้งเป็นไอคอนอยู่ขวา
                    เดิมสามอย่างเบียดกันในบรรทัดเดียวจนถังขยะไปติดกับคำว่า "ปิดใช้" */}
                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <Link href={`/admin/forms/${tpl.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-primary-text
                                   hover:underline">
                    {t("admin.forms.configure")}
                  </Link>
                  <form action={toggleTemplateAction} className="shrink-0">
                    <input type="hidden" name="id" value={tpl.id} />
                    <button className="btn-icon h-8 w-8 ring-0 hover:bg-surface-2"
                            aria-label={tpl.active ? t("common.disable") : t("common.enable")}
                            title={tpl.active ? t("common.disable") : t("common.enable")}>
                      {tpl.active ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </form>
                  {/* ลบได้เฉพาะฟอร์มที่ยังไม่มีเอกสาร — ฝั่งเซิร์ฟเวอร์เป็นคนตรวจ
                      แล้วตอบกลับเป็นภาษาคนถ้าลบไม่ได้ */}
                  <form action={delAction} className="shrink-0">
                    <input type="hidden" name="id" value={tpl.id} />
                    <button className="btn-icon h-8 w-8 text-muted ring-0 hover:bg-no/10 hover:text-no"
                            aria-label={t("common.delete")} title={t("common.delete")}
                            onClick={(e) => {
                              if (!window.confirm(t("admin.forms.confirmDelete", { name: tpl.name }))) {
                                e.preventDefault();
                              }
                            }}>
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {templates.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-strong py-12 text-center text-sm text-muted">
          {t("admin.forms.empty")}
        </div>
      )}
    </div>
  );
}
