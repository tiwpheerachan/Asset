"use client";

import { useActionState, useRef } from "react";
import { saveTemplateAction, type ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import { useSaveNow } from "./savebus";
import IconPicker from "@/components/IconPicker";
import {
  TEMPLATE_COLORS,
  TEMPLATE_COLOR_KEYS,
  type FormCategory,
  type FormTemplate,
} from "@/lib/types";

const initial: ActionState = {};

/** ส่วน "ตั้งค่า" — รหัส หมวด ไอคอน สี ลำดับ (ชื่อ/คำอธิบายแก้ที่หัวฟอร์มด้านบน) */
export default function SettingsSection({
  template,
  categories,
}: {
  template: FormTemplate;
  categories: FormCategory[];
}) {
  const t = useT();
  const [state, action] = useActionState(saveTemplateAction, initial);
  // ตัวย่อที่ระบบจะใช้ถ้าไม่กรอกเอง — ต้องตรงกับ docPrefixOf ใน queries.ts
  const autoPrefix = template.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "DOC";

  // ส่วนนี้มีปุ่มบันทึกของตัวเองอยู่ท้ายการ์ด แต่ปุ่มบันทึกด้านบนต้องใช้ได้เหมือนกัน
  // ไม่งั้นคนแก้ตั้งค่าแล้วกดปุ่มบนสุดจะนึกว่าเก็บแล้วทั้งที่ไม่มีอะไรเกิดขึ้น
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  useSaveNow(() => {
    if (!dirty.current) return false;
    dirty.current = false;
    formRef.current?.requestSubmit();
    return true;
  });

  return (
    <form
      ref={formRef}
      action={action}
      onInput={() => (dirty.current = true)}
      onChange={() => (dirty.current = true)}
      className="gf-card space-y-5 p-5"
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={template.id} />
      {/* ชื่อกับคำอธิบายมาจากหัวฟอร์มด้านบน ส่งค่าเดิมไปด้วยไม่ให้ถูกล้าง */}
      <input type="hidden" name="name" value={template.name} />
      <input type="hidden" name="description" value={template.description} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="t_code">{t("admin.forms.code")}</label>
          <input id="t_code" name="code" required className="input font-mono text-xs"
                 defaultValue={template.code} />
          <p className="mt-1 text-xs text-muted">{t("admin.forms.codeHint")}</p>
        </div>
        <div>
          <label className="label" htmlFor="t_prefix">{t("admin.forms.docPrefix")}</label>
          <input id="t_prefix" name="doc_prefix" className="input font-mono text-xs" maxLength={6}
                 placeholder={autoPrefix} defaultValue={template.doc_prefix} />
          <p className="mt-1 text-xs text-muted">
            {t("admin.forms.docPrefixHint", { example: `AP-${template.doc_prefix || autoPrefix}-202608-0007` })}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="t_cat">{t("admin.forms.category")}</label>
          <select id="t_cat" name="category_id" className="input"
                  defaultValue={String(template.category_id ?? 0)}>
            <option value="0">{t("common.none")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t_sort">{t("common.order")}</label>
          <input id="t_sort" name="sort_order" type="number" className="input"
                 defaultValue={template.sort_order} />
        </div>
      </div>

      <div>
        <div className="label">{t("admin.forms.icon")}</div>
        <IconPicker code={template.code} value={template.icon} color={template.color} />
      </div>

      <div className="flex justify-end border-t border-border pt-3">
        <SubmitButton className="btn-primary">{t("common.save")}</SubmitButton>
      </div>
    </form>
  );
}
