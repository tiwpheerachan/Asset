"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addNodeAction,
  deleteNodeAction,
  reorderNodesAction,
  deleteNodeMemberAction,
  saveNodeAction,
  toggleNodeAction,
  type ActionState,
} from "@/lib/actions";
import { Avatar, FormMessage } from "@/components/ui";
import ApproverAvatar from "@/components/ApproverAvatar";
import DirectoryApproverPicker from "@/components/DirectoryApproverPicker";
import { useI18n, useT } from "@/components/I18nProvider";
import { money } from "@/lib/format";
import {
  COND_OP_LABEL,
  type CondOp, type Field, type FlowNodeFull, type FormTemplate, type NodeMode, type User,
} from "@/lib/types";

const initial: ActionState = {};

/**
 * ส่วน "สายอนุมัติ" ในหน้าเดียว — วางเป็นคอลัมน์เดียวแบบเดียวกับการ์ดคำถาม
 * คลิกขั้นไหนก็กางแก้ตรงนั้น ไม่มีฟอร์มข้างๆ อีกแล้ว
 */
export default function FlowSection({
  template,
  fields,
  nodes,
  users,
}: {
  template: FormTemplate;
  fields: Field[];
  nodes: FlowNodeFull[];
  users: User[];
}) {
  const { t, locale } = useI18n();
  const [openId, setOpenId] = useState<number | null>(null);
  /* สถานะการบันทึกอยู่ที่นี่ ไม่ใช่ในฟอร์ม — ปุ่มบันทึกย้ายไปอยู่บนหัวการ์ดแล้ว
     ซึ่งอยู่นอก <form> จึงอ่านสถานะจากในฟอร์มเองไม่ได้ (ผูกกันด้วย form="…" แทน) */
  const [saveState, saveAction, saving] = useActionState(saveNodeAction, initial);

  const orphan = nodes.find((n) => n.kind === "APPROVE" && n.members.length === 0);
  useEffect(() => {
    if (openId !== null || !orphan) return;
    setOpenId(orphan.id);
  }, [openId, orphan]);

  /**
   * ลำดับของสายอนุมัติมาจากการลากสลับการ์ด ไม่ใช่ช่องกรอกเลข
   *
   * ลำดับคือ "ใครได้เอกสารก่อนหลัง" ซึ่งเป็นเรื่องเชิงพื้นที่ การให้พิมพ์เลขแปลว่า
   * คนตั้งต้องแปลงภาพในหัวเป็นตัวเลข แล้วยังต้องไล่แก้เลขของขั้นอื่นไม่ให้ชนกันเอง
   *
   * เก็บลำดับไว้ในหน้าจอก่อนแล้วค่อยส่ง เพื่อให้การ์ดขยับทันทีที่ปล่อยมือ
   */
  const [order, setOrder] = useState<number[]>(() => nodes.map((n) => n.id));
  const dragging = useRef<number | null>(null);
  const reorderForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setOrder(nodes.map((n) => n.id));
  }, [nodes]);

  const sorted = order
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is FlowNodeFull => Boolean(n));

  const drop = (targetIndex: number) => {
    const from = dragging.current;
    dragging.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setOrder(next);
    requestAnimationFrame(() => reorderForm.current?.requestSubmit());
  };

  return (
    <div className="flow-editor space-y-5">
      <form ref={reorderForm} action={reorderNodesAction} className="hidden">
        <input type="hidden" name="template_id" value={template.id} />
        <input type="hidden" name="order" value={order.join(",")} />
      </form>

      {nodes.length === 0 && (
        <div className="gf-card p-6 text-center text-sm text-muted">{t("builder.node.empty")}</div>
      )}

      {/* สายเดียวเรียงต่อกัน ไม่มีการแบ่งระดับอีกแล้ว · ลากทั้งใบเพื่อสลับลำดับได้
          ยกเว้นใบที่กำลังกางแก้ค้างไว้ ซึ่งถ้าลากตอนนั้นของที่พิมพ์ไว้จะหาย */}
      {sorted.map((n, i) => (
            <div
              key={n.id}
              draggable={openId !== n.id}
              onDragStart={() => (dragging.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              className={`gf-card flow-node relative ${openId === n.id ? "flow-node-open" : ""} ${n.active ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                {/* เลขตามตำแหน่งบนหน้าจอ ไม่ใช่ค่าที่เก็บไว้ — ลากแล้วเลขขยับทันที */}
                <span className="flow-node-index">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-[15px] font-semibold text-text">
                    {n.name || t("builder.node.unnamed")}
                  </h3>
                  <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">
                    {n.members.length > 0 ? n.members.map((m) =>
                      m.source === "USER"
                        ? users.find((u) => u.id === m.user_id)?.name ?? `#${m.user_id}`
                        : t(`jobRole.${m.job_role}`)
                    ).join(", ") : t("builder.member.none")}
                  </p>
                </div>
                  <span className={`badge ${n.kind === "CC" ? "tone-sky" : "tone-neutral"}`}>
                    {t(`nodeKind.${n.kind}`)}
                  </span>
                  {n.kind === "APPROVE" && n.members.length > 1 && (
                    <span className="badge tone-neutral">{t(`nodeMode.${n.mode}`)}</span>
                  )}
                  {n.cond_op && (
                    <span className="badge tone-amber">
                      {t("builder.node.condBadge", {
                        // เดิมโชว์ field_key ดิบ ("amount") ซึ่งเป็นชื่อในฐานข้อมูล
                        // ไม่ใช่ชื่อที่คนตั้งฟอร์มตั้งไว้เอง อ่านแล้วไม่รู้ว่าช่องไหน
                        field:
                          fields.find((f) => f.field_key === n.cond_field)?.label || n.cond_field,
                        op: t(`condOp.${n.cond_op}`),
                        value:
                          Number.isFinite(Number(n.cond_value)) && n.cond_value !== ""
                            ? money(Number(n.cond_value), locale)
                            : n.cond_value,
                      })}
                    </span>
                  )}
                {/* สามปุ่มนี้ทำงานระดับเดียวกัน (แก้ / ปิด / ลบ) จึงต้องมีทรงเดียวกัน
                    เดิม "ลบ" เป็นปุ่มพื้นใสไม่มีขอบ จึงดูเล็กกว่าและอ่านเหมือนลิงก์
                    ทั้งที่มันทำเรื่องที่ย้อนกลับไม่ได้ที่สุดในสามอัน */}
                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                {openId !== n.id && (
                  <button type="button" onClick={() => setOpenId(n.id)} className="btn-soft h-9 min-h-0 px-3.5 text-[13px]">
                    {t("common.edit")}
                  </button>
                )}
                <form action={toggleNodeAction} >
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="template_id" value={template.id} />
                  <button className="btn-ghost h-9 min-h-0 px-3.5 text-[13px]">
                    {n.active ? t("common.disable") : t("common.enable")}
                  </button>
                </form>
                <form action={deleteNodeAction} >
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="template_id" value={template.id} />
                  <button className="btn-ghost h-9 min-h-0 px-3.5 text-[13px] text-no hover:bg-no/10 hover:text-no"
                          onClick={(e) => {
                            if (!window.confirm(t("builder.node.confirmDelete"))) e.preventDefault();
                          }}>
                    {t("common.delete")}
                  </button>
                </form>
                {/* ปุ่มของฟอร์มที่กางอยู่ ขึ้นมาอยู่แถวเดียวกับปุ่มจัดการ — เดิมอยู่ล่างสุด
                    ของการ์ดซึ่งต้องเลื่อนผ่านทั้งฟอร์มกว่าจะเจอ และอยู่คนละที่กับ
                    ปุ่มอื่นที่ทำงานกับขั้นตอนเดียวกัน */}
                {openId === n.id && (
                  <>
                    <button type="button" onClick={() => setOpenId(null)}
                            className="btn-ghost h-9 min-h-0 px-3.5 text-[13px]">
                      {t("common.cancel")}
                    </button>
                    <button type="submit" form={`node-form-${n.id}`} disabled={saving}
                            className="btn-primary h-9 min-h-0 px-3.5 text-[13px]">
                      {saving ? t("builder.saving") : t("common.save")}
                    </button>
                  </>
                )}
                </div>
              </div>
              {openId === n.id && (
                <div className="border-t border-border">
                  <NodeForm template={template} fields={fields} node={n} users={users}
                            action={saveAction} state={saveState} />
                </div>
              )}
            </div>
      ))}

      {/* ปุ่มเพิ่มขั้นตอนอยู่ท้ายรายการ แบบเดียวกับปุ่มเพิ่มคำถามในแท็บที่ 1
          เดิมเป็นวงกลม "+" ลอยอยู่มุมขวาเหนือรายการ ซึ่งไม่บอกว่ากดแล้วได้อะไร
          และอยู่คนละที่กับปลายทางของสิ่งที่มันสร้าง — ขั้นใหม่ไปต่อท้ายสาย ไม่ใช่ขึ้นบนสุด */}
      <form action={addNodeAction}>
        <input type="hidden" name="template_id" value={template.id} />
        <button className="btn-ghost w-full justify-center gap-1.5 border border-dashed">
          + {t("builder.node.add")}
        </button>
      </form>
    </div>
  );
}

/** ฟอร์มแก้ขั้นตอนที่กางอยู่ในการ์ด */
function NodeForm({
  template,
  fields,
  node,
  nextOrder,
  users,
  action,
  state,
}: {
  template: FormTemplate;
  fields: Field[];
  node?: FlowNodeFull;
  nextOrder?: number;
  users: User[];
  /** ปุ่มบันทึกอยู่บนหัวการ์ด จึงต้องใช้ action/state ชุดเดียวกับที่นั่น */
  action: (formData: FormData) => void;
  state: ActionState;
}) {
  const t = useT();
  const [condOp, setCondOp] = useState<CondOp>(node?.cond_op ?? "");
  // คำอธิบายเปลี่ยนตามตัวเลือกที่เลือกอยู่ — สามแบบนี้ต่างกันแค่ "ขั้นนี้จบเมื่อไหร่"
  // ซึ่งเป็นเรื่องที่ชื่อสั้น ๆ สามคำบอกไม่ได้
  const [mode, setMode] = useState<NodeMode>(node?.mode ?? "SEQUENTIAL");

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
    <form id={`node-form-${node?.id ?? "new"}`} action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={node?.id ?? 0} />
      <input type="hidden" name="template_id" value={template.id} />

      <div className="grid gap-3">
        <div>
          <label htmlFor={`node-${node?.id ?? "new"}-name`} className="label">{t("builder.node.name")}</label>
          <input id={`node-${node?.id ?? "new"}-name`} name="name" className="input" defaultValue={node?.name ?? ""}
                 placeholder={t("builder.node.namePlaceholder")} />
        </div>
        <input type="hidden" name="sort_order" value={node?.sort_order ?? nextOrder ?? 1} />

      </div>

      {/* สามช่องนี้ตอบคำถามเดียวกันว่า "ขั้นนี้ทำงานยังไง" — ชนิด · ถ้ามีหลายคน ·
          ใช้เมื่อไร · แยกเงื่อนไขไปอยู่ในกล่องเทาต่างหากทำให้อ่านเหมือนคนละเรื่อง
          และดันช่องที่เหลือให้ห่างจากกันโดยไม่จำเป็น */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`node-${node?.id ?? "new"}-kind`} className="label">{t("builder.node.kind")}</label>
          <select id={`node-${node?.id ?? "new"}-kind`} name="kind" className="input"
                  defaultValue={node?.kind ?? "APPROVE"}>
            <option value="APPROVE">{t("nodeKind.APPROVE")}</option>
            <option value="CC">{t("nodeKind.CC")}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`node-${node?.id ?? "new"}-mode`} className="label">{t("builder.node.mode")}</label>
          <select id={`node-${node?.id ?? "new"}-mode`} name="mode" className="input" value={mode}
                  onChange={(e) => setMode(e.target.value as NodeMode)}>
            <option value="SEQUENTIAL">{t("nodeMode.SEQUENTIAL")}</option>
            <option value="ANY">{t("nodeMode.ANY")}</option>
            <option value="ALL">{t("nodeMode.ALL")}</option>
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(`nodeMode.hint.${mode}`)}</p>
        </div>
        <div>
          <label htmlFor={`node-${node?.id ?? "new"}-cond`} className="label">{t("builder.node.cond")}</label>
          <select id={`node-${node?.id ?? "new"}-cond`} name="cond_op" className="input" value={condOp}
                  onChange={(e) => setCondOp(e.target.value as CondOp)}>
            {(Object.keys(COND_OP_LABEL) as CondOp[]).map((o) => (
              <option key={o} value={o}>{t(`condOp.${o}`)}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted">{t("builder.node.condHint")}</p>
        </div>
        <input type="hidden" name="stage" value={node?.stage ?? "FINAL"} />
      </div>

      {/* ช่องเทียบค่าโผล่ต่อเมื่อเลือกเงื่อนไขแล้ว — ตอน "ใช้เสมอ" มันไม่มีความหมาย
          และกินที่ของแถวหลักไปเปล่า ๆ */}
      {condOp !== "" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`node-${node?.id ?? "new"}-cf`} className="label">{t("builder.node.condField")}</label>
            <select id={`node-${node?.id ?? "new"}-cf`} name="cond_field" className="input"
                    defaultValue={node?.cond_field ?? ""}>
              <option value="">{t("builder.node.condField")}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.field_key}>{f.label || f.field_key}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`node-${node?.id ?? "new"}-cv`} className="label">{t("builder.node.condValue")}</label>
            <input id={`node-${node?.id ?? "new"}-cv`} name="cond_value" className="input"
                   defaultValue={node?.cond_value ?? ""} placeholder={t("builder.node.condValue")} />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="cond_field" value="" />
          <input type="hidden" name="cond_value" value="" />
        </>
      )}

    </form>
      {node && <MemberEditor template={template} node={node} users={users} compact={false} />}
    </div>
  );
}

/** ผู้รับผิดชอบของขั้นหนึ่ง — ย่อเหลือรายชื่อเมื่อการ์ดยังไม่ถูกกาง */
function MemberEditor({
  template,
  node,
  users,
  compact,
}: {
  template: FormTemplate;
  node: FlowNodeFull;
  users: User[];
  compact: boolean;
}) {
  const t = useT();

  const box = useRef<HTMLDivElement>(null);
  const empty = node.members.length === 0;

  /**
   * ขั้นที่ยังไม่มีผู้รับผิดชอบ ให้เลื่อนจอมาหาช่องใส่คนเอง
   *
   * ที่มา: ช่องใส่ผู้รับผิดชอบอยู่ "ใต้" ปุ่มบันทึกของขั้นตอน คนกดบันทึกเสร็จจึงเห็น
   * ข้อความ "บันทึกขั้นตอนแล้ว" แล้วปิดไปเลย โดยไม่รู้ว่ายังมีอีกช่องรออยู่ข้างล่าง
   * ผลคือได้ขั้นตอนที่ไม่มีใครอนุมัติ ซึ่งระบบจะข้ามทิ้งตอนสร้างสายจริง —
   * พังเงียบแบบที่ไม่มีใครรู้จนกว่าจะมีคนกดยื่นแล้วเอกสารไม่ไปไหน
   */
  useEffect(() => {
    if (compact || !empty) return;
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [compact, empty]);

  if (compact) return null;

  return (
    <div ref={box} className={`flow-members relative ${empty ? "ring-1 ring-wait" : ""}`}>
      <div className="mb-4 flex min-h-11 items-center gap-2 pr-14 text-sm font-semibold text-text">{t("builder.member.title")}<span className="badge tone-neutral">{node.members.length}</span></div>
      <ul className="mb-4 space-y-2 text-sm">
        {node.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            {m.source === "USER" ? (
              <ApproverAvatar name={users.find((u) => u.id === m.user_id)?.name ?? "?"} email={users.find((u) => u.id === m.user_id)?.email} />
            ) : <Avatar name={t(`jobRole.${m.job_role}`)} size={36} />}
            <span className="min-w-0 break-words text-text">
              {m.source === "USER"
                ? users.find((u) => u.id === m.user_id)?.name ?? `#${m.user_id}`
                : t(`jobRole.${m.job_role}`)}
            </span>
            {m.source === "JOB_ROLE" && m.scope === "DEPT" && (
              <span className="badge tone-neutral">{t("builder.member.sameDept")}</span>
            )}
            <form action={deleteNodeMemberAction} className="ml-auto">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="template_id" value={template.id} />
              <button className="btn-ghost h-9 min-h-0 px-3 text-[13px] text-no hover:bg-no/10 hover:text-no">
                {t("common.delete")}
              </button>
            </form>
          </li>
        ))}
        {node.members.length === 0 && (
          <li className="text-xs text-amber-700">{t("builder.member.empty")}</li>
        )}
      </ul>

      {/* ตั้งผู้อนุมัติด้วยการพิมพ์ชื่อ Lark → เลือกจากรายชื่อระบบกลาง */}
      <DirectoryApproverPicker nodeId={node.id} templateId={template.id} compact />
    </div>
  );
}
