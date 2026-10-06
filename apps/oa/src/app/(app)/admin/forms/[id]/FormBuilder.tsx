"use client";

import TemplateIcon from "@/components/TemplateIcon";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addFieldAction,
  reorderFieldsAction,
  updateTemplateHeadAction,
  type ActionState,
} from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import { IconChevronLeft, IconTypeHeading, IconTypeTable } from "@/components/icons";
import {
  templateColor,
  type Field,
  type FlowNodeFull,
  type FormCategory,
  type FormTemplate,
  type TemplateWithCategory,
  type User,
} from "@/lib/types";
import AutosaveHint from "./AutosaveHint";
import { SaveBusProvider, useSaveAll, useSaveNow } from "./savebus";
import QuestionCard from "./QuestionCard";
import FlowSection from "./FlowSection";
import SettingsSection from "./SettingsSection";
import ImportQuestions, { type ImportSource } from "./ImportQuestions";

const initial: ActionState = {};

/**
 * ตัวสร้างฟอร์ม — หัวฟอร์ม + แท็บ (คำถาม / สายอนุมัติ / ตั้งค่า) แสดงทีละส่วน
 *
 * ห่อด้วย SaveBusProvider เพื่อให้ปุ่มบันทึกบนสุดสั่งเก็บของที่ยังค้างได้ทั้งหน้า
 */
export default function FormBuilder(props: Parameters<typeof Builder>[0]) {
  return (
    <SaveBusProvider>
      <Builder {...props} />
    </SaveBusProvider>
  );
}

function Builder({
  template, categories, fields, nodes, users, templates, importable,
}: {
  template: FormTemplate;
  categories: FormCategory[];
  fields: Field[];
  nodes: FlowNodeFull[];
  users: User[];
  /** ฟอร์มทั้งหมด — ให้ฟิลด์ชนิดอ้างอิงเลือกได้ว่ายอมให้อ้างถึงฟอร์มไหนบ้าง */
  templates: TemplateWithCategory[];
  /** คำถามของฟอร์มอื่น ๆ ที่คัดลอกมาใช้ได้ */
  importable: ImportSource[];
}) {
  const t = useT();
  const [headState, headAction, headPending] = useActionState(updateTemplateHeadAction, initial);
  const [activeId, setActiveId] = useState<number | null>(() => fields[0]?.id ?? null);
  const [tab, setTab] = useState<"questions" | "flow" | "settings">("questions");
  const [order, setOrder] = useState<number[]>(() => fields.map((f) => f.id));
  const dragging = useRef<number | null>(null);
  const reorderForm = useRef<HTMLFormElement>(null);

  // เปิดแท็บตาม hash (#flow / #settings) ตอนโหลด
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "flow" || h === "settings") setTab(h);
  }, []);

  useEffect(() => {
    setOrder(fields.map((f) => f.id));
  }, [fields]);

  const sorted = order
    .map((id) => fields.find((f) => f.id === id))
    .filter((f): f is Field => Boolean(f));

  const submitOrder = (next: number[]) => {
    setOrder(next);
    requestAnimationFrame(() => reorderForm.current?.requestSubmit());
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    submitOrder(next);
  };

  const drop = (targetIndex: number) => {
    const from = dragging.current;
    dragging.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    submitOrder(next);
  };

  const tabs = [
    { key: "questions", n: 1, label: t("builder.tab.questions"), hint: t("builder.sec.questions") },
    { key: "flow", n: 2, label: t("nav.flowSection"), hint: t("builder.sec.flow") },
    { key: "settings", n: 3, label: t("builder.tab.settings"), hint: t("builder.sec.settings") },
  ] as const;

  return (
    <div className="gf-canvas builder-workspace min-h-screen w-full">
      <form ref={reorderForm} action={reorderFieldsAction} className="hidden">
        <input type="hidden" name="template_id" value={template.id} />
        <input type="hidden" name="order" value={order.join(",")} />
      </form>

      {/*
        ความกว้างเดียวสำหรับทุกอย่างในหน้านี้ — แถบแท็บ หัวฟอร์ม และเนื้อหาของทุกแท็บ
        เคยลองบีบเฉพาะแท็บ "คำถาม" ให้แคบกว่าเพื่อให้อ่านชื่อคำถามง่ายขึ้น แต่ผลคือ
        การ์ดหัวฟอร์มเปลี่ยนความกว้างตอนสลับแท็บ ซึ่งสะดุดตากว่าปัญหาที่ตั้งใจแก้มาก
      */}
      {/* ระยะขอบเท่ากับ PageShell ที่หน้าอื่นใช้ — เดิมแคบกว่า เนื้อหาจึงชิดขอบจอ
          และหน้านี้ดูกว้างกว่าหน้าอื่นทั้งที่ความกว้างสูงสุดเท่ากัน */}
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        <div className="flex items-center justify-between gap-4">
          <Link href="/admin/forms" className="builder-back">
            <IconChevronLeft className="h-4 w-4" />
            {t("admin.forms.backToList").replace(/^←\s*/, "")}
          </Link>
          <div className="flex items-center gap-3">
            <span role="status"><AutosaveHint pending={headPending} ok={headState.ok} error={headState.error} /></span>
            <SaveAllButton />
          </div>
        </div>

        {/* แท็บ — แยกแต่ละส่วนเป็นการ์ด เรียงแถวเดียว */}
        <div className="grid gap-3 sm:grid-cols-3">
          {tabs.map((tb) => {
            const on = tab === tb.key;
            return (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                aria-pressed={on}
                className={`builder-step ${on ? "builder-step-active" : ""}`}
              >
                <span className="builder-step-number">{tb.n}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tb.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{tb.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <FormHead template={template} state={headState} action={headAction} pending={headPending} />

        {/* ---------- เนื้อหาแท็บที่เลือก ---------- */}
        {tab === "questions" && (
          <div className="space-y-5">
            {sorted.map((field, i) => (
              <QuestionCard
                key={field.id}
                template={template}
                templates={templates}
                fields={fields}
                field={field}
                index={i}
                total={sorted.length}
                active={activeId === field.id}
                onSelect={() => setActiveId(field.id)}
                onMove={(dir) => move(i, dir)}
                onDragStart={() => (dragging.current = i)}
                onDrop={() => drop(i)}
              />
            ))}
            {sorted.length === 0 && (
              <div className="gf-card p-8 text-center text-sm text-muted">
                {t("builder.q.emptyHint")}
              </div>
            )}
            {/* เพิ่มคำถาม / เพิ่มหัวข้อคั่น / คัดลอกจากฟอร์มอื่น — สามทางที่ทำให้ฟอร์มยาวขึ้น
                อยู่ด้วยกันท้ายรายการ ตรงที่สายตาไปหยุดหลังอ่านคำถามข้อสุดท้ายจบ */}
            <div className="grid gap-2 sm:grid-cols-3">
              <form action={addFieldAction}>
                <input type="hidden" name="template_id" value={template.id} />
                <input type="hidden" name="after" value={0} />
                <button className="btn-ghost w-full justify-center border border-dashed">
                  + {t("builder.q.add")}
                </button>
              </form>
              <form action={addFieldAction}>
                <input type="hidden" name="template_id" value={template.id} />
                <input type="hidden" name="after" value={0} />
                <input type="hidden" name="type" value="HEADING" />
                <button className="btn-ghost w-full justify-center gap-2 border border-dashed">
                  <IconTypeHeading className="h-4 w-4" />
                  {t("fieldType.HEADING")}
                </button>
              </form>
              <form action={addFieldAction}>
                <input type="hidden" name="template_id" value={template.id} />
                <input type="hidden" name="after" value={0} />
                {/* ตารางเปล่า — คอลัมน์ตั้งเองทั้งหมดในการ์ดที่เพิ่งสร้าง
                    เดิมปุ่มนี้สร้าง "ตารางงวด" ที่มีสี่คอลัมน์มาให้แล้ว ซึ่งใช้ได้กับฟอร์ม
                    ที่ทยอยจ่ายเท่านั้น ฟอร์มอื่นต้องลบทิ้งทีละคอลัมน์ก่อนจะเริ่มตั้งของตัวเอง */}
                <input type="hidden" name="type" value="TABLE" />
                <button className="btn-ghost w-full justify-center gap-2 border border-dashed">
                  <IconTypeTable className="h-4 w-4" />
                  {t("fieldType.TABLE")}
                </button>
              </form>
            </div>

            <ImportQuestions template={template} sources={importable} />
          </div>
        )}

        {tab === "flow" && (
          <FlowSection template={template} fields={fields} nodes={nodes} users={users} />
        )}

        {tab === "settings" && (
          <div className="space-y-5">
            <SettingsSection template={template} categories={categories} />
          </div>
        )}
      </div>
    </div>
  );
}

/** การ์ดหัวฟอร์ม — แถบสีด้านบน + ชื่อและคำอธิบายที่แก้ได้ในที่ */
function FormHead({ template, state, action, pending }: { template: FormTemplate; state: ActionState; action: (data: FormData) => void; pending: boolean }) {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => {
      dirty.current = false;
      formRef.current?.requestSubmit();
    }, 900);
    return () => clearTimeout(id);
  }, [name, description]);

  useSaveNow(() => {
    if (!dirty.current) return false;
    dirty.current = false;
    formRef.current?.requestSubmit();
    return true;
  });

  return (
    <form id="template-heading" ref={formRef} action={action} className="gf-card overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: templateColor(template.code, template.color) }} />
      <input type="hidden" name="id" value={template.id} />
      {/* ไอคอนอยู่คู่กับชื่อ เหมือนที่เห็นในแคตตาล็อกและหน้ายื่นคำขอ
          เข้ามาแก้ฟอร์มไหนก็เห็นตัวเดียวกันตลอดเส้นทาง */}
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3.5">
        <TemplateIcon code={template.code} icon={template.icon} color={template.color} size={36} />
        <div className="min-w-0 flex-1">
        <input
          name="name"
          value={name}
          onChange={(e) => { setName(e.target.value); dirty.current = true; }}
          placeholder={t("builder.q.formName")}
          className="gf-input px-0 text-lg font-medium leading-tight"
        />
        <input
          name="description"
          value={description}
          onChange={(e) => { setDescription(e.target.value); dirty.current = true; }}
          placeholder={t("builder.q.formDescription")}
          className="gf-input px-0 text-sm"
        />
        <div className="mt-1 h-4">
          <AutosaveHint pending={pending} ok={state.ok} error={state.error} />
        </div>
        </div>
      </div>
    </form>
  );
}

/**
 * ปุ่มบันทึกของทั้งหน้า
 *
 * หน้านี้เก็บงานให้เองหลังหยุดพิมพ์อยู่แล้ว ปุ่มนี้จึงไม่ได้เพิ่มความสามารถใหม่ แต่
 * ทำสองอย่างที่ระบบอัตโนมัติทำแทนไม่ได้ — ส่งของที่ยังค้างในช่วงหน่วงทันที (ปิดแท็บ
 * ตอนนั้นพอดีคืองานหายจริง) และตอบคำถาม "เก็บแล้วหรือยัง" ให้เห็นกับตา
 */
function SaveAllButton() {
  const t = useT();
  const saveAll = useSaveAll();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="ml-auto flex items-center gap-2.5">
      <span role="status" aria-live="polite" className="text-xs text-ok">
        {done ? t("builder.saved") : ""}
      </span>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          saveAll();
          setDone(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setDone(false), 2500);
        }}
      >
        {t("common.save")}
      </button>
    </div>
  );
}
