"use client";

import { useActionState, useState } from "react";
import { importFieldsAction, type ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import { FIELD_TYPE_ICON } from "./field-type-icons";
import type { FieldType, FormTemplate } from "@/lib/types";

const initial: ActionState = {};

export type ImportSource = {
  id: number;
  name: string;
  fields: { id: number; label: string; type: FieldType }[];
};

/**
 * คัดลอกคำถามจากฟอร์มอื่น
 *
 * ฟอร์มขออนุมัติในองค์กรเดียวกันซ้ำกันเป็นครึ่งใบ การพิมพ์ใหม่ทุกครั้งไม่ได้แค่ช้า
 * แต่ทำให้ชื่อช่องเดียวกันเพี้ยนกันทีละนิดจนรายงานรวมข้ามฟอร์มไม่ได้
 *
 * ปิดไว้เป็นค่าเริ่มต้น เพราะเป็นงานที่ทำครั้งเดียวตอนตั้งฟอร์ม ไม่ใช่ของที่ต้องเห็น
 * ทุกครั้งที่เข้ามาแก้คำถาม
 */
export default function ImportQuestions({
  template,
  sources,
}: {
  template: FormTemplate;
  sources: ImportSource[];
}) {
  const t = useT();
  const [state, action] = useActionState(importFieldsAction, initial);
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? 0);
  const [picked, setPicked] = useState<number[]>([]);

  if (sources.length === 0) return null;
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const allOn = source.fields.length > 0 && picked.length === source.fields.length;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="btn-ghost w-full justify-center border border-dashed">
        {t("builder.import.open")}
      </button>
    );
  }

  return (
    <form action={action} className="gf-card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{t("builder.import.title")}</h3>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-8">
          {t("common.cancel")}
        </button>
      </div>

      <FormMessage state={state} />
      <input type="hidden" name="template_id" value={template.id} />

      <div>
        <label className="label" htmlFor="import-source">{t("builder.import.source")}</label>
        <select
          id="import-source"
          name="source_id"
          value={sourceId}
          onChange={(e) => { setSourceId(Number(e.target.value)); setPicked([]); }}
          className="input"
        >
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">{t("builder.import.pick")}</span>
          {source.fields.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked(allOn ? [] : source.fields.map((f) => f.id))}
              className="text-xs text-primary-text hover:underline"
            >
              {t("builder.import.all")}
            </button>
          )}
        </div>

        {source.fields.length === 0 ? (
          <p className="text-sm text-muted">{t("builder.import.empty")}</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-surface-2 p-2">
            {source.fields.map((f) => {
              const Icon = FIELD_TYPE_ICON[f.type];
              const on = picked.includes(f.id);
              return (
                <label key={f.id}
                       className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface">
                  <input
                    type="checkbox"
                    name="ids"
                    value={f.id}
                    checked={on}
                    onChange={() =>
                      setPicked(on ? picked.filter((x) => x !== f.id) : [...picked, f.id])
                    }
                    className="h-4 w-4"
                  />
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {f.label || <span className="text-muted">{t("builder.q.untitled")}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{t(`fieldType.${f.type}`)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary" disabled={picked.length === 0}>
          {t("builder.import.submit")} ({picked.length})
        </SubmitButton>
        <p className="text-xs text-muted">{t("builder.import.hint")}</p>
      </div>
    </form>
  );
}
