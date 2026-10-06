"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  autosaveDraftAction,
  saveRequestAction,
  type ActionState,
} from "@/lib/actions";
import { FormMessage, SubmitButton } from "@/components/ui";
import { useT } from "@/components/I18nProvider";
import FieldInput, { type CellFile } from "@/components/FieldInput";
import FlowPreview from "@/components/FlowPreview";
import { hasPrelim, resolveFlow } from "@/lib/flow";
import { blocksSubmit, checkLeadTime, needsUrgentReason } from "@/lib/leadtime";
import { todayLocal } from "@/lib/format";
import { isValueField, parseJson, totalOf, type FormValues } from "@/lib/form";
import { visibleFields } from "@/lib/visibility";
import type {
  Field,
  FlowNodeFull,
  FormTemplate,
  RequestWithMeta,
  User,
} from "@/lib/types";

const initial: ActionState = {};

export default function RequestForm({
  template,
  avatars = {},
  fields,
  nodes,
  users,
  refs = [],
  requester,
  request,
  files = [],
}: {
  template: FormTemplate;
  avatars?: Record<number, string>;
  fields: Field[];
  nodes: FlowNodeFull[];
  users: User[];
  /** คำขอที่อนุมัติแล้วซึ่งเอามาอ้างอิงได้ */
  refs?: RequestWithMeta[];
  requester: User;
  request?: RequestWithMeta;
  /** ไฟล์ที่แนบไว้แล้ว — ใช้แสดงไฟล์ในเซลล์ของตารางตอนกลับมาแก้ร่าง */
  files?: CellFile[];
}) {
  const t = useT();
  const editing = Boolean(request);
  const [state, action] = useActionState(saveRequestAction, initial);

  const [values, setValues] = useState<FormValues>(() => {
    const saved = request ? parseJson<FormValues>(request.data, {}) : {};
    const out: FormValues = {};
    for (const f of fields) {
      if (!isValueField(f)) continue;
      if (f.field_key in saved) out[f.field_key] = saved[f.field_key];
      else if (f.type === "TABLE" || f.type === "MULTISELECT") out[f.field_key] = [];
      else if (f.type === "DATE" && f.field_role === "DATE") {
        out[f.field_key] = todayLocal();
      } else out[f.field_key] = "";
    }
    return out;
  });

  // แตะฟอร์มแล้วยังไม่ได้ส่ง = มีของค้างอยู่ ปิดแท็บหรือกดลิงก์อื่นตอนนี้แล้วหายหมด
  // ฟอร์มบางใบยาวมาก การกรอกใหม่ทั้งใบเป็นความเสียหายจริง จึงขอยืนยันก่อนออก
  // "แตะแล้ว" ไม่พอสำหรับถามก่อนออกอีกต่อไป — ของที่บันทึกร่างไปแล้วไม่ได้หายไปไหน
  // สิ่งที่ต้องเตือนคือของที่ "ยังไม่ได้บันทึก" เท่านั้น
  const dirty = useRef(false);
  const submitted = useRef(false);
  const router = useRouter();

  const set = (key: string, v: unknown) => {
    dirty.current = true;
    setValues((s) => ({ ...s, [key]: v }));
  };

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!dirty.current || submitted.current) return;
      e.preventDefault();
      // เบราว์เซอร์สมัยใหม่ใช้ข้อความมาตรฐานของตัวเอง ไม่ใช้ที่เราตั้ง
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  // เตือนตั้งแต่ตอนกรอก ไม่ใช่กดส่งแล้วค่อยเด้งกลับ — คนกรอกฟอร์มยาวเสร็จแล้วเจอว่า
  // ส่งไม่ได้เพราะวันที่ผิดตั้งแต่ช่องแรก คือประสบการณ์ที่แย่ที่สุดของฟอร์ม
  // การตรวจจริงยังอยู่ที่เซิร์ฟเวอร์เหมือนเดิม ตรงนี้แค่บอกล่วงหน้า
  const eventField = fields.find((f) => f.field_role === "EVENT_DATE");
  const lead = checkLeadTime(
    template,
    eventField ? String(values[eventField.field_key] ?? "") : "",
  );
  const askUrgent = needsUrgentReason(lead);
  const blocked = blocksSubmit(lead);

  const shown = useMemo(() => visibleFields(fields, values), [fields, values]);

  /**
   * ยอดรวมคิดใหม่ทุกครั้งที่ค่าในตารางเปลี่ยน
   *
   * ให้เห็นทันทีระหว่างกรอก ไม่ต้องรอกดบันทึกถึงจะรู้ว่ารวมได้เท่าไร — เซิร์ฟเวอร์
   * คิดซ้ำอีกรอบตอนบันทึกอยู่แล้ว ตรงนี้จึงเป็นแค่การแสดงผล ไม่ใช่ตัวตัดสิน
   */
  useEffect(() => {
    setValues((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const f of fields) {
        if (f.type !== "TOTAL") continue;
        const n = totalOf(f, fields, cur);
        if (next[f.field_key] !== n) {
          next[f.field_key] = n;
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [values, fields]);

  /**
   * กดส่งแล้วไม่ผ่าน — เลื่อนไปหาช่องแรกที่ผิดให้เลย
   *
   * ฟอร์มยาวกว่าหนึ่งจอ ข้อความสรุปอยู่บนหัวแต่ช่องที่ต้องแก้อาจอยู่ล่างสุด
   * ถ้าไม่พาไป คนกรอกจะเห็นแค่ว่า "ไม่ผ่าน" แล้วต้องไล่หาเองว่าตรงไหน
   */
  useEffect(() => {
    const first = Object.keys(state.fieldErrors ?? {})[0];
    if (!first) return;
    document
      .getElementById(`f-${first}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.fieldErrors]);

  /* ---------------- บันทึกร่างให้เองระหว่างกรอก ---------------- */
  const formRef = useRef<HTMLFormElement>(null);
  const [draftId, setDraftId] = useState(request?.id ?? 0);
  const [savedAt, setSavedAt] = useState("");
  const [saving, setSaving] = useState(false);
  // เซิร์ฟเวอร์บอกว่าเอกสารนี้แก้ไม่ได้แล้ว (เช่นถูกส่งจากอีกแท็บ) — เลิกบันทึกถาวร
  // ไม่งั้นจะยิงซ้ำทุกครั้งที่พิมพ์ แล้วเขียนทับของที่เข้าสายอนุมัติไปแล้ว
  const autosaveOff = useRef(false);

  useEffect(() => {
    if (!dirty.current || submitted.current || autosaveOff.current) return;
    const timer = setTimeout(async () => {
      const el = formRef.current;
      if (!el || submitted.current || !dirty.current) return;

      // ไฟล์ไม่ไปกับการบันทึกอัตโนมัติ — ส่งไฟล์ก้อนเดิมซ้ำทุกครั้งที่พิมพ์คือ
      // การอัปโหลดรอบละหลายเมกะไบต์ และจะได้ไฟล์ซ้ำกันเต็มเอกสาร
      const payload = new FormData();
      for (const [k, v] of new FormData(el).entries()) {
        if (typeof v === "string") payload.append(k, v);
      }
      payload.set("intent", "draft");

      setSaving(true);
      try {
        const res = await autosaveDraftAction(payload);
        if ("error" in res) {
          autosaveOff.current = true;
        } else if (res.id) {
          setDraftId(res.id);
          dirty.current = false;
          setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }
      } catch {
        // เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบ — ยังถือว่ามีของค้าง ไว้ลองใหม่รอบหน้า
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [values]);

  const prelim = hasPrelim(nodes, values);
  const preview = useMemo(
    () =>
      resolveFlow({
        nodes,
        users,
        data: values,
        requester,
        stage: prelim ? "PRELIM" : "FINAL",
      }),
    [nodes, users, values, requester, prelim],
  );

  return (
    <form
      id="request-form"
      ref={formRef}
      action={action}
      onSubmit={() => (submitted.current = true)}
      className="min-form space-y-5"
    >
      <input type="hidden" name="template_id" value={template.id} />
      {/* ร่างที่ระบบบันทึกให้เองก็มีเลขเอกสารแล้ว — กดส่งต้องไปทับใบเดิม ไม่ใช่สร้างใบใหม่ */}
      {draftId > 0 && <input type="hidden" name="request_id" value={draftId} />}

      <FormMessage state={state} />

      {/* แบ่งสองฝั่ง: ซ้ายกรอก ขวาดูว่าจะวิ่งไปหาใคร
          สายอนุมัติเป็นข้อมูลที่คนอยากเห็น "ระหว่าง" กรอก ไม่ใช่หลังกรอกเสร็จ —
          โดยเฉพาะช่องวงเงินที่เปลี่ยนแล้วสายอนุมัติเปลี่ยนตาม ถ้าอยู่ล่างสุด
          กว่าจะรู้ว่าต้องผ่าน MD ก็ต้องเลื่อนลงไปดู แล้วเลื่อนกลับขึ้นมาแก้ */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl bg-surface p-5 ring-1 ring-border sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-soft">{t("form.details")}</h2>
              {/* บอกสถานะการบันทึกตรงที่คนกำลังกรอกอยู่ — ไม่งั้นไม่มีทางรู้ว่าที่พิมพ์ไป
                  ปลอดภัยแล้วหรือยัง แล้วก็จะไม่กล้าปิดแท็บทั้งที่บันทึกให้ไปแล้ว */}
              <span className="text-xs text-muted" aria-live="polite">
                {saving
                  ? t("form.savingDraft")
                  : savedAt
                    ? t("form.savedDraft", { time: savedAt })
                    : t("form.autosaveHint")}
              </span>
            </div>
            {/* คอลัมน์เดียวเสมอ ไม่ใช่สองคอลัมน์เต็มหน้า
                ฟอร์มสองคอลัมน์บนจอกว้างทำให้สายตาต้องกระโดดซ้าย-ขวาสลับกันไปทีละช่อง
                และไม่มีทางรู้ว่าช่องถัดไปอยู่ทางไหนจนกว่าจะมองหา — เรียงลงมาแถวเดียว
                สายตาเดินทางเดียวจากบนลงล่าง ซึ่งเป็นวิธีที่คนกรอกฟอร์มจริง ๆ อยู่แล้ว */}
            {/* ช่องที่ตั้งเงื่อนไขไว้จะโผล่เมื่อค่าของช่องควบคุมตรงตามที่ตั้ง —
                ช่องที่ไม่ได้แสดงจะไม่ถูกส่งไปกับฟอร์ม ค่าที่เคยพิมพ์ไว้จึงไม่ติดไปด้วย */}
            <div className="space-y-5">
              {shown.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  users={users}
                  refs={refs}
                  value={values[f.field_key]}
                  onChange={(v) => set(f.field_key, v)}
                  error={state.fieldErrors?.[f.field_key]}
                  files={files}
                />
              ))}
            </div>
          </section>

          {(askUrgent || blocked) && lead.state !== "off" && lead.state !== "ok" && (
            <section
              className="rounded-2xl p-5 ring-1 sm:p-6"
              style={{
                background: blocked ? "var(--c-no-soft)" : "var(--c-wait-soft)",
                borderColor: "transparent",
                ["--tw-ring-color" as string]: blocked ? "var(--c-no)" : "var(--c-wait)",
              }}
            >
              <p className="text-sm font-medium" style={{ color: blocked ? "var(--c-no-text)" : "var(--c-wait-text)" }}>
                {blocked
                  ? t("form.urgentBlocked", { n: lead.daysAhead, need: lead.need })
                  : t("form.urgentNeeded", { n: lead.daysAhead, need: lead.need })}
              </p>

              {!blocked && (
                <div className="mt-3">
                  <label className="label" htmlFor="urgent_reason">{t("form.urgentReason")}</label>
                  <textarea id="urgent_reason" name="urgent_reason" rows={2} required className="input" />
                </div>
              )}
            </section>
          )}

          {/* ปุ่มอยู่ชิดซ้ายใต้ช่องกรอก — ตรงที่สายตาหยุดพอดีหลังอ่านช่องสุดท้ายจบ */}
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <SubmitButton
              name="intent"
              value="submit"
              disabled={blocked}
              className="btn-primary"
              pendingText={t("common.sending")}
              onClickConfirm={prelim ? t("form.confirmPrelim") : t("form.confirmSubmit")}
            >
              {prelim ? t("form.submitPrelim") : t("form.submit")}
            </SubmitButton>

            {/* ยกเลิก = ออกจากหน้านี้ ไม่ใช่ยกเลิกเอกสาร (เอกสารยังไม่เกิดด้วยซ้ำ)
                ลิงก์ในแอปไม่ทำให้หน้าโหลดใหม่ beforeunload จึงไม่ทำงาน ต้องถามเอง
                ไม่งั้นกรอกมาทั้งใบแล้วหายเงียบ ๆ เพราะกดผิดปุ่มเดียว */}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (dirty.current && !window.confirm(t("form.confirmLeave"))) return;
                submitted.current = true; // ตั้งใจออก อย่าเด้งถามซ้ำอีกรอบ
                router.push(editing ? `/requests/${request!.id}` : "/");
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>

        {/* เลื่อนไปพร้อมหน้า ไม่เกาะตามจอ — กล่องสายอนุมัติสูงกว่าจอเมื่อมีหลายขั้น
            การตรึงไว้จึงทำให้ส่วนล่างของมันไม่มีทางเลื่อนขึ้นมาให้เห็นได้เลย
            และภาพที่ไหลตามตลอดเวลาก็ดึงสายตาออกจากช่องที่กำลังกรอกอยู่ */}
        <div className="min-w-0">
          <FlowPreview avatars={avatars} steps={preview.steps} missing={preview.missing} prelim={prelim} />
        </div>
      </div>
    </form>
  );
}
