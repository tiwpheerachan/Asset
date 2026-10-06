"use client";

import { useActionState, useState } from "react";
import {
  deleteCategoryAction, moveCategoryDownAction, moveCategoryUpAction, saveCategoryAction,
  type ActionState,
} from "@/lib/actions";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@/components/icons";
import { useT } from "@/components/I18nProvider";
import type { FormCategory } from "@/lib/types";

const initial: ActionState = {};

/**
 * จัดการหมวดของฟอร์ม
 *
 * ที่มา: หมวดถูกใช้จัดกลุ่มบนหน้าแรกและในหน้าแม่แบบ แต่ไม่มีที่ไหนให้ "เพิ่ม" เลย —
 * มีแค่ช่องเลือกหมวดที่มีอยู่ในหน้าตั้งค่าของแต่ละฟอร์ม ใครอยากได้หมวดใหม่จึงทำไม่ได้
 * ทั้งที่ฝั่งเซิร์ฟเวอร์รองรับมาตั้งแต่ต้น
 *
 * ยุบไว้เป็นค่าเริ่มต้น เพราะเป็นงานที่ทำนาน ๆ ครั้ง ไม่ควรกินพื้นที่เหนือรายการฟอร์ม
 * ซึ่งเป็นสิ่งที่คนเปิดหน้านี้มาหาจริง ๆ
 */
export default function CategoryManager({
  categories,
  counts,
}: {
  categories: FormCategory[];
  /** จำนวนฟอร์มในแต่ละหมวด — ต้องรู้ก่อนลบว่าจะมีฟอร์มหลุดออกมากี่ใบ */
  counts: Record<number, number>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveCategoryAction, initial);

  return (
    <div className="card-flat p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="h-card flex-1">
          {t("admin.cat.title")} <span className="text-muted">({categories.length})</span>
        </span>
        <span className="text-sm text-muted">{open ? t("common.close") : t("admin.cat.manage")}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <ul className="space-y-2">
            {categories.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                {/* แต่ละปุ่มเป็นฟอร์มของตัวเอง วางเป็นพี่น้องกัน — ฟอร์มซ้อนฟอร์ม
                    เป็น HTML ที่ใช้ไม่ได้จริงและทำให้หน้าพังตอน hydrate */}
                <form action={action} className="flex min-w-52 flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} required
                         className="input h-10 min-w-0 flex-1" aria-label={t("admin.cat.name")} />
                  <button className="btn-ghost h-10 shrink-0 text-sm" disabled={pending}>
                    {t("common.save")}
                  </button>
                </form>

                <span className="w-20 shrink-0 text-xs text-muted">
                  {t("admin.cat.count", { n: String(counts[c.id] ?? 0) })}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <form action={moveCategoryUpAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-icon h-9 w-9 ring-0 disabled:opacity-30"
                            disabled={i === 0}
                            aria-label={t("admin.cat.up")} title={t("admin.cat.up")}>
                      <IconArrowUp className="h-4 w-4" />
                    </button>
                  </form>
                  <form action={moveCategoryDownAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-icon h-9 w-9 ring-0 disabled:opacity-30"
                            disabled={i === categories.length - 1}
                            aria-label={t("admin.cat.down")} title={t("admin.cat.down")}>
                      <IconArrowDown className="h-4 w-4" />
                    </button>
                  </form>
                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-icon h-9 w-9 text-muted ring-0 hover:text-no"
                            aria-label={t("common.delete")} title={t("common.delete")}>
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </li>
            ))}
            {categories.length === 0 && (
              <li className="text-sm text-muted">{t("admin.cat.empty")}</li>
            )}
          </ul>

          <p className="text-xs text-muted">{t("admin.cat.deleteHint")}</p>

          <form action={action} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input name="name" required placeholder={t("admin.cat.newName")}
                   className="input h-10 min-w-40 flex-1" aria-label={t("admin.cat.newName")} />
            <button className="btn-primary h-10 gap-1.5 text-sm" disabled={pending}>
              <IconPlus className="h-4 w-4" />
              {t("admin.cat.add")}
            </button>
          </form>

          {state.error && <p className="text-sm text-no">{state.error}</p>}
          {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
        </div>
      )}
    </div>
  );
}
