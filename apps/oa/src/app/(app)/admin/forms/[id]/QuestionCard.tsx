"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import AutosaveHint from "./AutosaveHint";
import { useSaveNow } from "./savebus";
import FieldTypePicker from "./FieldTypePicker";
import { FIELD_TYPE_ICON } from "./field-type-icons";
import {
  IconArrowDown, IconArrowUp, IconCheck, IconChevron, IconDuplicate, IconGrip,
  IconPaperclip, IconPlus, IconTrash,
} from "@/components/icons";
import {
  addColumnAction,
  deleteColumnAction,
  deleteFieldAction,
  duplicateFieldAction,
  moveColumnLeftAction,
  moveColumnRightAction,
  saveColumnAction,
  saveFieldAction,
  type ActionState,
} from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import { conditionSources } from "@/lib/visibility";
import {
  COLUMN_TYPES, FIELD_ROLE_LABEL,
  type Field, type FieldColumn, type FieldType, type FormTemplate,
  type TemplateWithCategory,
} from "@/lib/types";

const initial: ActionState = {};

/**
 * เครื่องหมายหน้าตัวเลือก — ให้ตรงกับสิ่งที่ผู้ตอบจะเห็นจริง
 *
 * วงกลม = เลือกอันเดียว · สี่เหลี่ยม = เลือกได้หลายอัน · ตัวเลข = ดรอปดาวน์
 * (ดรอปดาวน์ไม่มีปุ่มให้เห็น ลำดับที่จึงเป็นสิ่งเดียวที่ผู้ตอบรับรู้)
 */
function OptionMark({ kind, index }: { kind: FieldType; index?: number }) {
  if (kind === "DROPDOWN") {
    return (
      <span aria-hidden className="w-4 shrink-0 text-center text-sm tabular-nums text-muted">
        {index !== undefined ? index + 1 : ""}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`h-4 w-4 shrink-0 border-2 border-border-strong ${
        kind === "MULTISELECT" ? "rounded-[3px]" : "rounded-full"
      }`}
    />
  );
}

export default function QuestionCard({
  template,
  templates,
  fields,
  field,
  index,
  total,
  active,
  onSelect,
  onMove,
  onDragStart,
  onDrop,
}: {
  template: FormTemplate;
  templates: TemplateWithCategory[];
  /** ทุกช่องของฟอร์มนี้ — ใช้หาว่าช่องไหนตั้งเป็นเงื่อนไขให้ช่องนี้ได้บ้าง */
  fields: Field[];
  field: Field;
  index: number;
  total: number;
  active: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveFieldAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FieldType>(field.type);
  const TypeIcon = FIELD_TYPE_ICON[type];
  const [required, setRequired] = useState(field.required === 1);
  const [options, setOptions] = useState<string[]>(
    field.type === "REQUEST" || !field.options.length ? [""] : field.options,
  );
  /**
   * รหัสประจำบรรทัดตัวเลือก — ใช้เป็น key แทนลำดับที่
   *
   * ใช้ลำดับที่เป็น key แล้วลบบรรทัดกลาง ๆ React จะถือว่าบรรทัดหลังจากนั้น "เปลี่ยนค่า"
   * แทนที่จะเป็น "บรรทัดนั้นหายไป" ช่องที่กำลังพิมพ์อยู่จึงกระโดดและเคอร์เซอร์หลุด
   */
  const nextOptId = useRef(options.length);
  const [optionIds, setOptionIds] = useState<number[]>(() => options.map((_, i) => i));
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);
  /** บรรทัดที่เพิ่งเพิ่ม — ต้องโฟกัสหลัง React วาดเสร็จ ไม่ใช่ตอนกดปุ่ม */
  const [focusOpt, setFocusOpt] = useState<number | null>(null);
  // ฟิลด์ชนิดอ้างอิงใช้คอลัมน์ options เก็บ "รหัสฟอร์มที่ยอมให้อ้างถึง" คนละความหมายกับ
  // ตัวเลือกของ SELECT จึงแยก state กัน ไม่งั้นสลับชนิดไปมาแล้วค่าปนกัน
  const [refCodes, setRefCodes] = useState<string[]>(
    field.type === "REQUEST" ? field.options : [],
  );
  const [help, setHelp] = useState(field.help);
  const [placeholder, setPlaceholder] = useState(field.placeholder);
  const [fieldKey, setFieldKey] = useState(field.field_key);
  const [role, setRole] = useState(field.field_role);
  const [showMore, setShowMore] = useState(false);
  const [showIfKey, setShowIfKey] = useState(field.show_if_key);
  const [showIfValue, setShowIfValue] = useState(field.show_if_value);
  const [sumOf, setSumOf] = useState(field.sum_of);
  const dirty = useRef(false);

  /**
   * บันทึกอัตโนมัติหลังหยุดพิมพ์ — ไม่มีปุ่ม Save เหมือน Google Forms
   *
   * การบันทึกหนึ่งครั้งทำให้ทั้งหน้าถูกสร้างใหม่จากเซิร์ฟเวอร์ (revalidate) ซึ่งจำเป็น
   * เพราะช่องอื่นในหน้าอ้างชื่อคำถามนี้อยู่ แต่ถ้ายิงถี่เกินไป การพิมพ์รายการตัวเลือก
   * ยาว ๆ จะสะดุดทุกครั้งที่หยุดคิด — หน่วงให้ยาวขึ้นแล้วไปบังคับบันทึกตอนสลับการ์ดแทน
   */
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => {
      dirty.current = false;
      formRef.current?.requestSubmit();
    }, 1400);
    return () => clearTimeout(id);
  }, [label, type, required, options, refCodes, help, placeholder, fieldKey, role, showIfKey, showIfValue, sumOf]);

  // กดไปการ์ดอื่น = เลิกแก้ใบนี้แล้ว ส่งของที่ค้างอยู่ทันทีโดยไม่ต้องรอครบเวลาหน่วง
  useEffect(() => {
    if (active || !dirty.current) return;
    dirty.current = false;
    formRef.current?.requestSubmit();
  }, [active]);

  // ปุ่มบันทึกด้านบนสั่งส่งของที่ยังค้างอยู่ในช่วงหน่วง 900ms ได้ทันที
  useSaveNow(() => {
    if (!dirty.current) return false;
    dirty.current = false;
    formRef.current?.requestSubmit();
    return true;
  });

  const touch = () => {
    dirty.current = true;
  };

  const addOption = (at: number) => {
    setOptions([...options.slice(0, at), "", ...options.slice(at)]);
    setOptionIds([...optionIds.slice(0, at), nextOptId.current++, ...optionIds.slice(at)]);
    setFocusOpt(at);
    touch();
  };

  /**
   * วางข้อความหลายบรรทัด = ได้หลายตัวเลือกทีเดียว
   *
   * ที่มา: คนตั้งฟอร์มมีรายการอยู่แล้วในไฟล์หรือในตาราง (รายชื่อโดเมน รายชื่อธนาคาร
   * รหัสสาขา) การบังคับให้พิมพ์ทีละบรรทัดทั้งที่มีข้อมูลอยู่ในมือแล้วคืองานที่ไม่ควรมี
   * — ช่องกรอกบรรทัดเดียวรับมาแล้วยุบทุกบรรทัดต่อกันเป็นก้อนเดียว ซึ่งใช้ไม่ได้เลย
   *
   * บรรทัดที่มาจากตาราง (มีแท็บคั่น) เก็บเฉพาะช่องแรก เพราะตัวเลือกหนึ่งอันคือค่าเดียว
   * ไม่ใช่ทั้งแถว · ตัวเลือกซ้ำถูกตัดทิ้ง เพราะค่าที่ซ้ำกันในรายการเลือกไม่มีความหมาย
   */
  const pasteOptions = (i: number, text: string): boolean => {
    if (!/[\r\n]/.test(text)) return false;

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.split("\t")[0].trim())
      .filter(Boolean);
    if (lines.length === 0) return false;

    const head = options.slice(0, i);
    const cur = options[i];
    const tail = options.slice(i + 1);
    const keepCur = cur.trim() !== "";

    const merged: string[] = [];
    const ids: number[] = [];
    const seen = new Set<string>();
    const push = (v: string, id: number) => {
      const k = v.trim();
      if (k !== "" && seen.has(k)) return;
      if (k !== "") seen.add(k);
      merged.push(v);
      ids.push(id);
    };

    head.forEach((v, x) => push(v, optionIds[x]));
    if (keepCur) push(cur, optionIds[i]);
    for (const line of lines) push(line, nextOptId.current++);
    const inserted = merged.length - 1;
    tail.forEach((v, x) => push(v, optionIds[i + 1 + x]));

    setOptions(merged);
    setOptionIds(ids);
    setFocusOpt(Math.max(0, inserted));
    touch();
    return true;
  };

  const removeOption = (i: number) => {
    setOptions(options.filter((_, x) => x !== i));
    setOptionIds(optionIds.filter((_, x) => x !== i));
    setFocusOpt(Math.max(0, i - 1));
    touch();
  };

  // โฟกัสช่องที่เพิ่งเพิ่ม/ช่องก่อนหน้าที่เพิ่งลบ หลัง React วาดรายการใหม่เสร็จแล้ว
  useEffect(() => {
    if (focusOpt === null) return;
    optionRefs.current[focusOpt]?.focus();
    setFocusOpt(null);
  }, [focusOpt]);

  const hasOptions = type === "SELECT" || type === "DROPDOWN" || type === "MULTISELECT";
  const isRef = type === "REQUEST";
  const isHeading = type === "HEADING";
  const isTotal = type === "TOTAL";

  // ยอดรวมบวกได้เฉพาะคอลัมน์ตัวเลขของตารางในฟอร์มเดียวกัน
  const sumSources = fields
    .filter((f) => f.type === "TABLE" && f.active)
    .flatMap((f) =>
      f.columns
        .filter((c) => c.type === "NUMBER" || c.type === "MONEY")
        .map((c) => ({ value: `${f.field_key}.${c.col_key}`, label: `${f.label} → ${c.label}` })),
    );

  // เลือกได้เฉพาะช่องตัวเลือกที่อยู่ก่อนหน้า — ดูเหตุผลใน src/lib/visibility.ts
  const sources = conditionSources(fields, field);
  const source = sources.find((f) => f.field_key === showIfKey);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      className={`gf-card relative ${active ? "gf-card-active" : "hover:ring-border-strong"}`}
    >
      {/* จุดจับลากกลางด้านบน */}
      <div className="flex cursor-grab justify-center py-1 text-muted" aria-hidden>
        <IconGrip className="h-4 w-4 rotate-90" />
      </div>

      <form ref={formRef} action={action} className="px-5 pb-1">
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="template_id" value={template.id} />
        <input type="hidden" name="sort_order" value={field.sort_order} />
        <input
          type="hidden"
          name="options"
          value={hasOptions ? options.join("\n") : isRef ? refCodes.join("\n") : ""}
        />
        <input type="hidden" name="field_key" value={fieldKey} />
        <input type="hidden" name="field_role" value={role} />
        <input type="hidden" name="help" value={help} />
        <input type="hidden" name="placeholder" value={placeholder} />
        {required && !isHeading && <input type="hidden" name="required" value="1" />}
        <input type="hidden" name="sum_of" value={isTotal ? sumOf : ""} />
        <input type="hidden" name="show_if_key" value={source ? showIfKey : ""} />
        <input type="hidden" name="show_if_value" value={source ? showIfValue : ""} />

        {active ? (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <input
                name="label"
                value={label}
                onChange={(e) => { setLabel(e.target.value); touch(); }}
                placeholder={t("builder.q.untitled")}
                className="gf-input-filled min-w-0 flex-1 text-base"
              />
              <FieldTypePicker
                value={type}
                onChange={(ft) => { setType(ft); touch(); }}
              />
              <input type="hidden" name="type" value={type} />
            </div>

            {hasOptions ? (
              /*
               * รายการตัวเลือก — พิมพ์รวดเดียวจบเหมือน Google Form
               *
               * ที่มา: เดิมกด "เพิ่มตัวเลือก" แล้วได้ช่องที่เติมคำว่า "ตัวเลือก 5" ไว้ให้
               * และเคอร์เซอร์ไม่ไปที่ช่องนั้น — ต้องเอื้อมไปคลิก ลากคลุมลบข้อความทิ้ง
               * แล้วค่อยพิมพ์ ทุกตัวเลือก · สี่ขั้นตอนต่อหนึ่งบรรทัดคือที่มาของความติดขัด
               *
               * ตอนนี้: ช่องใหม่ว่างเปล่าและเคอร์เซอร์ไปรออยู่แล้ว · Enter = ขึ้นบรรทัดใหม่
               * · Backspace ในช่องว่าง = ลบบรรทัดนั้นแล้วถอยไปบรรทัดก่อน
               */
              <div className="mt-4 space-y-2">
                {options.map((o, i) => (
                  <div key={optionIds[i] ?? i} className="flex items-center gap-3">
                    <OptionMark kind={type} index={i} />
                    <input
                      ref={(el) => { optionRefs.current[i] = el; }}
                      value={o}
                      placeholder={`${t("builder.q.option")} ${i + 1}`}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                        touch();
                      }}
                      onPaste={(e) => {
                        if (pasteOptions(i, e.clipboardData.getData("text"))) e.preventDefault();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOption(i + 1);
                        } else if (e.key === "Backspace" && o === "" && options.length > 1) {
                          e.preventDefault();
                          removeOption(i);
                        }
                      }}
                      className="gf-input flex-1 py-1 text-sm"
                    />
                    {options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="btn-icon h-7 w-7 ring-0"
                        aria-label={t("common.delete")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <OptionMark kind={type} index={options.length} />
                  <button
                    type="button"
                    onClick={() => addOption(options.length)}
                    className="py-1 text-sm text-muted hover:text-text"
                  >
                    {t("builder.q.addOption")}
                  </button>
                </div>
              </div>
            ) : isRef ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-text-soft">{t("builder.q.refForms")}</p>
                <div className="flex flex-wrap gap-2">
                  {templates
                    .filter((tpl) => tpl.id !== template.id)
                    .map((tpl) => {
                      const on = refCodes.includes(tpl.code);
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setRefCodes(
                              on
                                ? refCodes.filter((c) => c !== tpl.code)
                                : [...refCodes, tpl.code],
                            );
                            touch();
                          }}
                          className={`badge ${on ? "tone-primary" : ""} gap-1.5`}
                        >
                          {on && <IconCheck className="h-3.5 w-3.5" />}
                          {tpl.name}
                        </button>
                      );
                    })}
                </div>
                <p className="text-xs text-muted">{t("builder.q.refFormsHint")}</p>
              </div>
            ) : isTotal ? (
              // ช่องยอดรวมไม่มีอะไรให้คนกรอกพิมพ์ — สิ่งเดียวที่ต้องตั้งคือ "บวกจากไหน"
              <div className="mt-4 space-y-1">
                <label className="label" htmlFor={`q${field.id}-sum`}>
                  {t("builder.field.sumOf")}
                </label>
                {sumSources.length === 0 ? (
                  <p className="text-xs text-muted">{t("builder.field.sumOfEmpty")}</p>
                ) : (
                  <>
                    <select id={`q${field.id}-sum`} className="input"
                            value={sumOf} onChange={(e) => { setSumOf(e.target.value); touch(); }}>
                      <option value="">{t("builder.field.sumOfNone")}</option>
                      {sumSources.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted">{t("builder.field.sumOfHint")}</p>
                  </>
                )}
              </div>
            ) : isHeading ? (
              // หัวข้อคั่นไม่มีช่องให้กรอก คำอธิบายจึงเป็นเนื้อหาหลักของมัน
              // ต้องอยู่ตรงนี้เลย ไม่ใช่ซ่อนไว้ในเมนู ⋮ เหมือนคำอธิบายของช่องอื่น
              /* ช่องหลายบรรทัด — หัวข้อคั่นถูกใช้เขียนคำชี้แจงยาว ๆ (เงื่อนไขการวางบิล
                 ที่อยู่บริษัท เบอร์ติดต่อ) ช่องบรรทัดเดียวรับขึ้นบรรทัดใหม่ไม่ได้
                 ทุกอย่างจึงไหลติดกันเป็นพรืดจนอ่านไม่ออก */
              <textarea
                value={help}
                onChange={(e) => { setHelp(e.target.value); touch(); }}
                placeholder={t("builder.q.headingHelp")}
                rows={Math.min(14, Math.max(3, help.split("\n").length + 1))}
                className="gf-input mt-2 resize-y text-sm leading-relaxed"
              />
            ) : type === "TABLE" ? null : (
              <p className="mt-3 border-b border-dashed border-border px-3 pb-2 text-sm text-muted">
                {t("builder.q.previewHint", { type: t(`fieldType.${type}`) })}
              </p>
            )}

            {showMore && (
              <div className="mt-4 grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`q${field.id}-help`}>{t("builder.field.help")}</label>
                  <input id={`q${field.id}-help`}
                         value={help} onChange={(e) => { setHelp(e.target.value); touch(); }}
                         className="input" />
                </div>
                <div>
                  {/* ต่างจากคำอธิบายใต้ช่อง — อันนี้อยู่ในช่องว่างและหายไปทันทีที่เริ่มพิมพ์
                      ใช้บอก "รูปแบบ" ที่ต้องการ เช่น SD-2026-0142 ไม่ใช่คำอธิบายยาว ๆ */}
                  <label className="label" htmlFor={`q${field.id}-ph`}>{t("builder.field.placeholder")}</label>
                  <input id={`q${field.id}-ph`}
                         value={placeholder}
                         onChange={(e) => { setPlaceholder(e.target.value); touch(); }}
                         className="input" />
                </div>
                <div>
                  <label className="label" htmlFor={`q${field.id}-key`}>{t("builder.field.key")}</label>
                  <input id={`q${field.id}-key`}
                         value={fieldKey}
                         onChange={(e) => { setFieldKey(e.target.value); touch(); }}
                         className="input font-mono text-xs" />
                </div>
                <div className="sm:col-span-2 border-t border-border pt-3">
                  <div className="label">{t("builder.cond.title")}</div>
                  {sources.length === 0 ? (
                    <p className="text-xs text-muted">{t("builder.cond.none")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <select
                        aria-label={t("builder.cond.pickField")}
                        value={source ? showIfKey : ""}
                        onChange={(e) => { setShowIfKey(e.target.value); setShowIfValue(""); touch(); }}
                        className="input min-w-0 flex-1"
                      >
                        <option value="">{t("builder.cond.always")}</option>
                        {sources.map((f) => (
                          <option key={f.id} value={f.field_key}>{f.label || f.field_key}</option>
                        ))}
                      </select>
                      {source && (
                        <select
                          aria-label={t("builder.cond.pickValue")}
                          value={showIfValue}
                          onChange={(e) => { setShowIfValue(e.target.value); touch(); }}
                          className="input min-w-0 flex-1"
                        >
                          <option value="">{t("builder.cond.pickValue")}</option>
                          {source.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`q${field.id}-role`}>{t("builder.field.role")}</label>
                  <select id={`q${field.id}-role`}
                          aria-describedby={`q${field.id}-roleHint`}
                          value={role} onChange={(e) => { setRole(e.target.value as typeof role); touch(); }}
                          className="input">
                    {(Object.keys(FIELD_ROLE_LABEL) as (keyof typeof FIELD_ROLE_LABEL)[]).map((r) => (
                      <option key={r} value={r}>{t(`fieldRole.${r}`)}</option>
                    ))}
                  </select>
                  <p id={`q${field.id}-roleHint`} className="mt-1 text-xs text-muted">
                    {t("builder.field.roleHint")}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          // การ์ดที่พับอยู่เหลือบรรทัดเดียว — ชนิดคำถามเป็นไอคอนนำหน้าแทนที่จะเป็น
          // ข้อความอีกบรรทัด · หน้านี้มีคำถามเป็นสิบใบ ทุกบรรทัดที่ตัดออกได้
          // คือคำถามที่เห็นเพิ่มอีกใบต่อหนึ่งจอ
          <div className="flex items-center gap-2.5 pb-2.5">
            <TypeIcon className="h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1 truncate text-[15px] text-text">
              {label || <span className="text-muted">{t("builder.q.untitled")}</span>}
              {required && <span className="ml-1 text-no">*</span>}
            </div>
            {source && (
              <span className="badge shrink-0" title={`${source.label} = ${showIfValue}`}>
                {t("builder.cond.badge")}
              </span>
            )}
            {role && <span className="badge tone-primary shrink-0">{t(`fieldRole.${role}`)}</span>}
            <span className="shrink-0 text-xs text-muted">{t(`fieldType.${type}`)}</span>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="label" value={label} />
          </div>
        )}
      </form>

      {active && (
        <>
          {field.type === "TABLE" && <ColumnEditor template={template} field={field} />}

          <div className="mt-2 flex items-center gap-1 border-t border-border px-4 py-2">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
                    className="btn-icon h-8 w-8 ring-0 disabled:opacity-30"
                    aria-label={t("builder.q.moveUp")}><IconArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
                    className="btn-icon h-8 w-8 ring-0 disabled:opacity-30"
                    aria-label={t("builder.q.moveDown")}><IconArrowDown className="h-4 w-4" /></button>

            <form action={duplicateFieldAction}>
              <input type="hidden" name="id" value={field.id} />
              <button className="btn-icon h-8 w-8 ring-0" title={t("builder.field.duplicate")}
                      aria-label={t("builder.field.duplicate")}><IconDuplicate className="h-4 w-4" /></button>
            </form>

            <form action={deleteFieldAction}>
              <input type="hidden" name="id" value={field.id} />
              <button
                className="btn-icon h-8 w-8 ring-0"
                title={t("common.delete")}
                aria-label={t("common.delete")}
                onClick={(e) => {
                  if (!window.confirm(t("builder.field.confirmDelete", { label: field.label }))) {
                    e.preventDefault();
                  }
                }}
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </form>

            {!isHeading && (
            <>
            <span className="mx-2 h-5 w-px bg-border" />
            
            <button
              type="button"
              onClick={() => { setRequired(!required); touch(); }}
              className="flex items-center gap-2 text-sm text-text-soft"
            >
              {t("common.required")}
              <span className={`gf-switch ${required ? "gf-switch-on" : ""}`}>
                <span className="gf-switch-knob" />
              </span>
            </button>
            </>
            )}

            <button type="button" onClick={() => setShowMore(!showMore)}
                    className="btn-icon ml-auto h-8 w-8 ring-0"
                    aria-label={t("builder.field.advanced")} title={t("builder.field.advanced")}>
              ⋮
            </button>
          </div>

          <div className="px-4 pb-2">
            <AutosaveHint pending={pending} ok={state.ok} error={state.error} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * คอลัมน์ของคำถามชนิดตาราง — แก้บน "ตารางจริง" ไม่ใช่ฟอร์มรายการยาว ๆ
 *
 * ที่มา: เดิมเป็นรายการชื่อคอลัมน์กับฟอร์มเพิ่มคอลัมน์ที่ต้องกรอกชื่อ รหัส ชนิด หน่วย
 * ลำดับ ให้ครบก่อนถึงจะกดเพิ่มได้ — คนตั้งฟอร์มจึงไม่เคยเห็นเลยว่าตารางที่ตั้งอยู่
 * ออกมาหน้าตายังไงจนกว่าจะเปิดฟอร์มจริงไปดู ทั้งที่ "หน้าตา" คือสิ่งเดียวที่เขากำลังตัดสินใจ
 *
 * ตอนนี้เห็นหัวตารางกับแถวตัวอย่างตรงนั้นเลย กด + ที่ท้ายหัวตารางเพื่อเพิ่มคอลัมน์
 * แล้วกดที่หัวคอลัมน์ไหนก็ได้เพื่อตั้งค่าคอลัมน์นั้น
 */
function ColumnEditor({ template, field }: { template: FormTemplate; field: Field }) {
  const t = useT();
  const [editing, setEditing] = useState<number | null>(null);
  const added = useRef(false);
  const count = field.columns.length;

  // เพิ่มคอลัมน์แล้วเปิดตัวที่เพิ่งเพิ่มให้ตั้งชื่อต่อทันที — คอลัมน์เปล่าที่ไม่มีชื่อ
  // ไม่มีประโยชน์กับใคร การต้องกดอีกทีเพื่อจะตั้งชื่อคือขั้นที่ไม่ต้องมี
  useEffect(() => {
    if (!added.current || count === 0) return;
    added.current = false;
    setEditing(field.columns[count - 1].id);
  }, [count, field.columns]);

  const open = field.columns.find((c) => c.id === editing);

  return (
    <div className="mx-5 mt-3 space-y-3 rounded-md bg-surface-2 p-3">
      <div className="text-sm font-medium text-text-soft">
        {t("builder.col.title", { n: count })}
      </div>

      <div className="overflow-x-auto rounded-md bg-surface ring-1 ring-border">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              {/* เลขแถวกับปุ่มเพิ่มคอลัมน์ตรึงไว้ — ตารางที่มีหลายคอลัมน์ต้องเลื่อนแนวนอน
                  ถ้าปุ่ม + เลื่อนหายไปด้วย ก็ต้องเลื่อนสุดทางทุกครั้งที่จะเพิ่มอีกคอลัมน์ */}
              <th scope="col" className="sticky left-0 z-20 w-10 border-b border-r border-border
                                         bg-surface-2 px-3 py-2 text-center font-medium">#</th>
              {field.columns.map((c) => (
                <th key={c.id} scope="col" className="border-b border-r border-border p-0">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === c.id ? null : c.id)}
                    className={`flex w-full items-center gap-1.5 whitespace-nowrap px-3 py-2
                                text-left hover:bg-surface-3 ${
                                  editing === c.id ? "bg-primary-soft" : ""
                                }`}
                  >
                    <span className="font-medium text-text">
                      {c.label || <span className="text-muted">{t("builder.col.untitled")}</span>}
                    </span>
                    {c.required === 1 && <span className="text-no">*</span>}
                    <span className="text-[11px] text-muted">{t(`colType.${c.type}`)}</span>
                    {c.unit && <span className="text-[11px] text-muted">· {c.unit}</span>}
                    <IconChevron className="h-3.5 w-3.5 text-muted" />
                  </button>
                </th>
              ))}
              {/* ปุ่มเพิ่มคอลัมน์อยู่ท้ายหัวตาราง ตรงที่คอลัมน์ถัดไปจะไปโผล่จริง ๆ */}
              <th scope="col" className="sticky right-0 z-20 w-12 border-b border-border
                                         bg-surface-2 p-0">
                <form action={addColumnAction} onSubmit={() => (added.current = true)}>
                  <input type="hidden" name="field_id" value={field.id} />
                  <input type="hidden" name="template_id" value={template.id} />
                  <button className="flex h-full w-full items-center justify-center px-3 py-2
                                     text-primary-text hover:bg-surface-3"
                          title={t("builder.col.add")} aria-label={t("builder.col.add")}>
                    <IconPlus className="h-4 w-4" />
                  </button>
                </form>
              </th>
            </tr>
          </thead>

          {/* แถวตัวอย่างหนึ่งแถว — บอกว่าคนกรอกจะเจอช่องแบบไหนในแต่ละคอลัมน์ */}
          <tbody>
            <tr>
              <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5
                             text-center text-xs text-muted">1</td>
              {field.columns.map((c) => (
                <td key={c.id} className="border-r border-border px-3 py-2">
                  <PreviewCell col={c} />
                </td>
              ))}
              <td className="sticky right-0 z-10 bg-surface" />
            </tr>
            {count === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-xs text-muted">
                  {t("builder.col.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <ColumnForm
          key={open.id}
          template={template}
          field={field}
          col={open}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * ค่าตัวอย่างในแถวสาธิต — เป็นข้อความจาง ๆ ไม่ใช่ช่องกรอกจำลอง
 *
 * ที่มา: วาดเป็นกล่องช่องกรอกแล้วได้ตารางที่มีกรอบซ้อนกันสองชั้น (กรอบเซลล์กับกรอบช่อง)
 * ซึ่งอ่านยากกว่าเดิม และชวนให้เข้าใจผิดว่าพิมพ์ลงไปได้ ทั้งที่แถวนี้มีไว้ดูอย่างเดียว
 * บอกเป็นตัวอย่างของค่าที่จะอยู่ในคอลัมน์นั้นตรง ๆ อ่านง่ายกว่าและไม่หลอกตา
 */
function PreviewCell({ col }: { col: FieldColumn }) {
  const t = useT();

  const sample =
    col.type === "SELECT" || col.type === "MULTISELECT"
      ? col.options[0] || t("common.select")
      : col.type === "USER"
        ? t("common.selectPerson")
        : col.type === "FILE"
          ? t("form.attach")
          : col.type === "DATE"
            ? t("builder.col.sampleDate")
            : col.type === "MONEY" || col.type === "NUMBER"
              ? `0.00${col.unit ? ` ${col.unit}` : ""}`
              : t("builder.col.sampleText");

  return (
    <span className={`block truncate text-xs text-muted ${
      col.type === "MONEY" || col.type === "NUMBER" ? "text-right" : ""
    }`}>
      {sample}
    </span>
  );
}

/** ตั้งค่าคอลัมน์เดียว — เปิดใต้ตารางเมื่อกดที่หัวคอลัมน์นั้น */
function ColumnForm({
  template,
  field,
  col,
  onClose,
}: {
  template: FormTemplate;
  field: Field;
  col: FieldColumn;
  onClose: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveColumnAction, initial);
  const [type, setType] = useState(col.type);
  const hasOptions = type === "SELECT" || type === "MULTISELECT";
  const isNumber = type === "NUMBER" || type === "MONEY";

  return (
    <form action={action} className="space-y-3 rounded-md bg-surface p-3 ring-1 ring-border">
      <input type="hidden" name="id" value={col.id} />
      <input type="hidden" name="field_id" value={field.id} />
      <input type="hidden" name="template_id" value={template.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`c${col.id}-label`}>{t("builder.col.name")}</label>
          <input id={`c${col.id}-label`} name="label" defaultValue={col.label} required autoFocus
                 className="input" placeholder={t("builder.col.untitled")} />
        </div>
        <div>
          <label className="label" htmlFor={`c${col.id}-type`}>{t("builder.col.type")}</label>
          <select id={`c${col.id}-type`} name="type" value={type} className="input"
                  onChange={(e) => setType(e.target.value as FieldColumn["type"])}>
            {COLUMN_TYPES.map((ct) => (
              <option key={ct} value={ct}>{t(`colType.${ct}`)}</option>
            ))}
          </select>
        </div>

        {/* หน่วยมีความหมายเฉพาะกับตัวเลข — คอลัมน์วันที่หรือไฟล์ไม่มีหน่วยให้ต่อท้าย */}
        {isNumber && (
          <div>
            <label className="label" htmlFor={`c${col.id}-unit`}>{t("builder.col.unitLabel")}</label>
            <input id={`c${col.id}-unit`} name="unit" defaultValue={col.unit}
                   className="input" placeholder={t("builder.col.unit")} />
          </div>
        )}
        {!isNumber && <input type="hidden" name="unit" value="" />}

        {hasOptions && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`c${col.id}-opt`}>{t("builder.col.options")}</label>
            <textarea id={`c${col.id}-opt`} name="options" rows={3} className="input"
                      defaultValue={col.options.join("\n")} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-text-soft">
          <input type="checkbox" name="required" defaultChecked={col.required === 1}
                 className="h-4 w-4 rounded border-border-strong" />
          {t("common.required")}
        </label>

        <span className="font-mono text-[11px] text-muted" title={t("builder.col.keyFixed")}>
          {col.col_key}
        </span>

        {/* ย้าย/ลบ ใช้ฟอร์มเดียวกับปุ่มบันทึก — ฟอร์มซ้อนฟอร์มเป็น HTML ที่ใช้ไม่ได้จริง
            และทำให้หน้าพังตอน hydrate · formNoValidate เพราะสองปุ่มนี้ไม่ได้จะบันทึกชื่อ
            จึงไม่ควรติดกฎ "ต้องกรอกชื่อคอลัมน์" ของช่องข้างบน */}
        <div className="ml-auto flex items-center gap-1">
          <button formAction={moveColumnLeftAction} formNoValidate
                  className="btn-icon h-8 w-8 ring-0"
                  aria-label={t("builder.col.moveLeft")} title={t("builder.col.moveLeft")}>
            <IconArrowUp className="h-4 w-4 -rotate-90" />
          </button>
          <button formAction={moveColumnRightAction} formNoValidate
                  className="btn-icon h-8 w-8 ring-0"
                  aria-label={t("builder.col.moveRight")} title={t("builder.col.moveRight")}>
            <IconArrowDown className="h-4 w-4 -rotate-90" />
          </button>
          <button formAction={deleteColumnAction} formNoValidate
                  className="btn-icon h-8 w-8 text-muted ring-0 hover:text-no"
                  aria-label={t("common.delete")} title={t("common.delete")}>
            <IconTrash className="h-4 w-4" />
          </button>

          <button type="button" onClick={onClose} className="btn-ghost text-sm">
            {t("common.close")}
          </button>
          <button className="btn-primary text-sm" disabled={pending}>
            {t("common.save")}
          </button>
        </div>
      </div>

      {state.error && <p className="text-xs text-no">{state.error}</p>}
    </form>
  );
}
