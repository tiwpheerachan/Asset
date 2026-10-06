"use client";

import { useState } from "react";
import {
  ROW_ID,
  cellFileName,
  cellKey,
  inputName,
  isRange,
  newRowId,
  rangeDays,
  rangeName,
  tableTotals,
  type TableRow,
} from "@/lib/form";
import {
  IconDuplicate, IconPaperclip, IconPlus, IconTrash, IconTypeTotal,
} from "@/components/icons";
import CollapsibleText from "@/components/CollapsibleText";
import { refsFor } from "@/lib/refs";
import { money } from "@/lib/format";
import { useI18n, useT } from "@/components/I18nProvider";
import type { RequestWithMeta, Field, FieldColumn, User } from "@/lib/types";

/** ไฟล์ที่แนบไว้แล้ว — เอาเท่าที่ช่องกรอกต้องใช้ ไม่ต้องลากทั้งแถวของตารางไฟล์แนบมา */
export type CellFile = { id: number; field_key: string; filename: string };

/** ช่องกรอกหนึ่งช่อง เลือกหน้าตาตามชนิดฟิลด์ที่ผู้ดูแลตั้งไว้ */
export default function FieldInput({
  field,
  users,
  refs = [],
  value,
  onChange,
  error,
  files = [],
}: {
  field: Field;
  users: User[];
  /** คำขอที่อนุมัติแล้วซึ่งเอามาอ้างอิงได้ (ใช้กับฟิลด์ชนิด REQUEST) */
  refs?: RequestWithMeta[];
  value: unknown;
  onChange: (v: unknown) => void;
  /** ข้อความผิดพลาดของช่องนี้ — แสดงใต้ช่องพร้อมขอบแดง */
  error?: string;
  /** ไฟล์ที่แนบไว้แล้วในเอกสารใบนี้ ใช้แสดงไฟล์ในเซลล์ตอนกลับมาแก้ฉบับร่าง */
  files?: CellFile[];
}) {
  const { t, locale } = useI18n();
  const name = inputName(field.field_key);
  const id = `f-${field.field_key}`;
  const str = value === null || value === undefined ? "" : String(value);

  const label = (
    <label className="label" htmlFor={id}>
      {field.label}
      {field.required ? " *" : ""}
    </label>
  );

  /**
   * ข้อความผิดพลาดอยู่ใต้ช่องของตัวเอง ไม่ใช่รวมเป็นก้อนบนหัวฟอร์ม
   * ฟอร์มยาว ๆ ที่บอกแค่ "กรอกไม่ครบ" ทำให้ต้องไล่หาเองว่าช่องไหน
   */
  const help = (
    <>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-no">
          {error}
        </p>
      )}
      {field.help && (
        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted">{field.help}</p>
      )}
    </>
  );

  // ขอบแดงทำให้กวาดตาหาช่องที่ผิดเจอโดยไม่ต้องอ่านข้อความทุกอัน
  const ring = error ? "ring-2 ring-no focus:ring-no" : "";
  const ph = field.placeholder || undefined;

  // หัวข้อคั่น — ไม่มีช่องให้กรอก ทำหน้าที่แบ่งฟอร์มยาวเป็นส่วน ๆ เท่านั้น
  // เส้นคั่นด้านบนช่วยบอกว่า "ส่วนก่อนหน้าจบแล้ว" ซึ่งอ่านเร็วกว่าเว้นวรรคเปล่า ๆ
  if (field.type === "HEADING") {
    return (
      <div className="border-t border-border pt-5 first:border-0 first:pt-0">
        <h3 className="text-sm font-semibold text-text">{field.label}</h3>
        {/* ขึ้นบรรทัดใหม่ตามที่พิมพ์ไว้จริง และย่อไว้ก่อนถ้ายาว — คำชี้แจงยาว ๆ
            ที่กางเต็มทุกครั้งคือกำแพงที่ต้องเลื่อนผ่านกว่าจะถึงช่องแรกของฟอร์ม */}
        {field.help && (
          <CollapsibleText text={field.help} className="mt-1 text-sm leading-relaxed text-muted" />
        )}
      </div>
    );
  }

  // ช่วงเวลา — สองช่องคู่กันพร้อมจำนวนวันที่นับให้ทันทีที่กรอกครบ
  // คนตั้งสัญญามักคิดเป็น "กี่เดือน" แต่กรอกเป็นวันที่ ตัวเลขวันจึงเป็นการยืนยัน
  // ว่าที่กรอกไปตรงกับที่ตั้งใจ ก่อนจะส่งเข้าสายอนุมัติ
  if (field.type === "DATERANGE") {
    const range = isRange(value) ? value : { from: "", to: "" };
    const days = rangeDays(range);
    return (
      <div>
        {label}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`${id}-from`}>{t("field.range.from")}</label>
            <input
              id={`${id}-from`}
              name={rangeName(field.field_key, "from")}
              type="date"
              className="input"
              value={range.from}
              onChange={(e) => onChange({ ...range, from: e.target.value })}
            />
          </div>
          <span aria-hidden className="text-muted">–</span>
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`${id}-to`}>{t("field.range.to")}</label>
            <input
              id={`${id}-to`}
              name={rangeName(field.field_key, "to")}
              type="date"
              min={range.from || undefined}
              className="input"
              value={range.to}
              onChange={(e) => onChange({ ...range, to: e.target.value })}
            />
          </div>
          {days !== null && (
            <span className="shrink-0 text-sm tabular-nums text-text-soft">
              {t("field.range.days", { days: String(days) })}
            </span>
          )}
        </div>
        {help}
      </div>
    );
  }

  if (field.type === "TABLE") {
    return (
      <div>
        {label}
        <TableInput
          field={field}
          users={users}
          files={files}
          rows={(value as TableRow[]) ?? []}
          onChange={onChange}
        />
        {help}
      </div>
    );
  }

  /**
   * ยอดรวมจากตาราง — อ่านได้อย่างเดียว
   *
   * ที่มา: ฟอร์มจริงมีช่อง "Total Amount" ที่ต้องเท่ากับผลบวกของตารางด้านล่างเสมอ
   * ให้คนกรอกพิมพ์เองคือเปิดช่องให้เลขสองที่ไม่ตรงกัน แล้วผู้อนุมัติต้องมาไล่บวกเอง
   * ว่าจะเชื่อตัวไหน — ค่านี้จึงคิดให้ และคิดซ้ำที่เซิร์ฟเวอร์ตอนบันทึกอีกครั้ง
   */
  if (field.type === "TOTAL") {
    const n = Number(value ?? 0);
    return (
      <div>
        {label}
        <input type="hidden" name={name} value={String(n)} />
        <div id={id}
             className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2
                        ring-1 ring-border">
          <span className="text-base font-semibold tabular-nums text-text">{money(n, locale)}</span>
          <span className="text-xs text-muted">{t("form.autoTotal")}</span>
        </div>
        {help}
      </div>
    );
  }

  if (field.type === "FILE" || field.type === "IMAGE") {
    return (
      <div>
        {label}
        <input
          id={id}
          name={name}
          type="file"
          multiple
          accept={field.type === "IMAGE" ? "image/*" : undefined}
          className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-surface-2
                     file:px-3 file:py-1.5 file:text-sm file:text-text-soft"
        />
        {help ?? <p className="mt-1 text-xs text-muted">{t("form.maxFile")}</p>}
      </div>
    );
  }

  return (
    <div>
      {label}
      {field.type === "TEXTAREA" ? (
        <textarea
          id={id} name={name} rows={8} className={`input font-doc leading-relaxed ${ring}`}
          placeholder={ph}
          value={str} onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "DROPDOWN" ? (
        <select id={id} name={name} className={`input ${ring}`} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{ph ?? t("common.select")}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "SELECT" ? (
        /*
         * เลือกได้อันเดียว = ปุ่มกลม เห็นตัวเลือกทั้งหมดพร้อมกัน
         *
         * ต่างจากดรอปดาวน์ตรงที่ไม่ต้องกดก่อนถึงจะรู้ว่ามีอะไรให้เลือก — เหมาะกับ
         * ตัวเลือกไม่กี่อันที่คนต้องชั่งน้ำหนักก่อนตัดสินใจ ส่วนรายการยาว ๆ
         * (ธนาคาร แผนก โดเมน) ใช้ดรอปดาวน์จะไม่ดันฟอร์มให้ยาวเกินจำเป็น
         */
        <div id={id}
             className={`space-y-1.5 rounded-xl border p-2 ${error ? "border-no" : "border-border"}`}>
          {field.options.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-text-soft">
              <input
                type="radio" name={name} value={o}
                checked={str === o}
                onChange={() => onChange(o)}
                className="h-4 w-4 border-border-strong"
              />
              {o}
            </label>
          ))}
          {field.options.length === 0 && (
            <p className="text-xs text-muted">{t("form.noOptions")}</p>
          )}
        </div>
      ) : field.type === "MULTISELECT" ? (
        <div className={`space-y-1.5 rounded-xl border p-2 ${error ? "border-no" : "border-border"}`}>
          {field.options.map((o) => {
            const list = (value as string[]) ?? [];
            return (
              <label key={o} className="flex items-center gap-2 text-sm text-text-soft">
                <input
                  type="checkbox" name={name} value={o}
                  checked={list.includes(o)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))
                  }
                  className="h-4 w-4 rounded border-border-strong"
                />
                {o}
              </label>
            );
          })}
          {field.options.length === 0 && (
            <p className="text-xs text-muted">{t("form.noOptions")}</p>
          )}
        </div>
      ) : field.type === "USER" ? (
        <select id={id} name={name} className={`input ${ring}`} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{ph ?? t("common.selectPerson")}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}{u.department ? ` — ${u.department}` : ""}
            </option>
          ))}
        </select>
      ) : field.type === "REQUEST" ? (
        <select id={id} name={name} className={`input ${ring}`} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{ph ?? t("form.selectRequest")}</option>
          {refsFor(field, refs).map((r) => (
            <option key={r.id} value={r.id}>
              {r.doc_no} — {r.title || t("table.noSubject")}
            </option>
          ))}
        </select>
      ) : field.type === "DATE" ? (
        <input id={id} name={name} type="date" className={`input ${ring}`}
               value={str} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id} name={name} className={`input ${ring}`}
          placeholder={ph}
          inputMode={field.type === "NUMBER" || field.type === "MONEY" ? "decimal" : undefined}
          value={str} onChange={(e) => onChange(e.target.value)}
        />
      )}
      {help}
    </div>
  );
}

/**
 * ตารางรายการที่เพิ่ม/ลบ/คัดลอกแถวได้ — ส่งค่าเป็น JSON ผ่าน input ซ่อน
 *
 * อ่านให้เหมือนกระดาษคำนวณ ไม่ใช่ฟอร์มหลายช่องที่บังเอิญเรียงเป็นตาราง:
 * ช่องกรอกโปร่งจนกว่าจะชี้หรือโฟกัส เลขแถวกับปุ่มจัดการเกาะอยู่กับที่ตอนเลื่อนแนวนอน
 * และผลรวมอยู่แถวท้ายตารางตรงใต้คอลัมน์ของตัวเอง
 */
function TableInput({
  field,
  users,
  rows,
  files,
  onChange,
}: {
  field: Field;
  users: User[];
  rows: TableRow[];
  /** ไฟล์ที่แนบไว้แล้วในเซลล์ (เฉพาะตอนแก้ฉบับร่าง) */
  files: CellFile[];
  onChange: (rows: TableRow[]) => void;
}) {
  const { t, locale } = useI18n();

  const rowId = (row: TableRow, i: number) => String(row[ROW_ID] ?? `r${i}`);

  const blankRow = (): TableRow => {
    const blank: TableRow = { [ROW_ID]: newRowId() };
    for (const c of field.columns) blank[c.col_key] = c.type === "MULTISELECT" ? [] : "";
    return blank;
  };

  const addRow = () => onChange([...rows, blankRow()]);

  /**
   * คัดลอกแถว — วางต่อท้ายแถวต้นทางทันที ไม่ใช่ท้ายตาราง
   *
   * ที่มา: รายการในตารางมักต่างกันแค่ช่องเดียว (จำนวนเงิน หรือเดือน) การพิมพ์ซ้ำ
   * ทั้งแถวเพื่อเปลี่ยนค่าช่องเดียวคืองานที่ไม่ควรมี — และคัดลอกมาวางไกลจากต้นทาง
   * ก็ต้องเลื่อนหาอีก จึงวางติดกันไว้เลย
   *
   * ไฟล์แนบไม่ติดไปด้วย เพราะแถวใหม่ได้รหัสใหม่ — ใบเสนอราคาของรายการหนึ่ง
   * ไม่ใช่ใบเดียวกับของอีกรายการ
   */
  const copyRow = (i: number) => {
    const clone: TableRow = { ...rows[i], [ROW_ID]: newRowId() };
    onChange([...rows.slice(0, i + 1), clone, ...rows.slice(i + 1)]);
  };

  const removeRow = (i: number) => onChange(rows.filter((_, x) => x !== i));

  const patch = (i: number, col: string, v: unknown) =>
    onChange(rows.map((r, x) => (x === i ? { ...r, [col]: v } : r)));

  const totals = tableTotals(field, rows);
  const totalOf = (key: string) => totals.find((x) => x.key === key);

  if (field.columns.length === 0) {
    return (
      <p className="rounded-md tone-amber px-3 py-2 text-sm ring-1">{t("form.noColumns")}</p>
    );
  }

  // +2 = ช่องเลขแถว กับช่องปุ่มจัดการ
  const span = field.columns.length + 2;

  return (
    <div className="space-y-2">
      <input type="hidden" name={inputName(field.field_key)} value={JSON.stringify(rows)} />

      {/* ตารางกว้างเกินการ์ดเป็นเรื่องปกติเมื่อมีหลายคอลัมน์ — เลขแถว ปุ่มจัดการ
          และปุ่มเพิ่มแถวจึงตรึงไว้ให้เห็นตลอด ไม่ว่าจะเลื่อนไปไกลแค่ไหน */}
      <div className="overflow-x-auto rounded-md ring-1 ring-border">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs text-muted">
                <th scope="col"
                    className="sticky left-0 z-20 w-10 border-b border-r border-border
                               bg-surface-2 px-3 py-2.5 text-center font-medium">
                  #
                </th>
                {field.columns.map((c) => (
                  <th scope="col" key={c.col_key}
                      // ชิดขวาให้ตรงกับตัวเลขในช่อง — ยกเว้นคอลัมน์ที่มีหน่วยต่อท้าย
                      // เพราะขอบขวาของเซลล์คือหลังหน่วย ไม่ใช่หลังตัวเลข
                      className={`whitespace-nowrap border-b border-r border-border px-3 py-2.5
                                  font-medium ${
                        (c.type === "MONEY" || c.type === "NUMBER") && !c.unit ? "text-right" : ""
                      }`}>
                    {c.label}
                    {c.required ? <span className="ml-0.5 text-no">*</span> : null}
                  </th>
                ))}
                <th scope="col"
                    className="sticky right-0 z-20 w-16 border-b border-border
                               bg-surface-2 px-2 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => (
                <tr key={rowId(row, i)} className="group">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-surface
                                 px-3 py-1 text-center text-xs tabular-nums text-muted
                                 group-hover:bg-surface-2">
                    {i + 1}
                  </td>
                  {field.columns.map((c) => (
                    <td key={c.col_key}
                        className="border-b border-r border-border p-0 group-hover:bg-surface-2">
                      <Cell
                        col={c}
                        field={field}
                        rowId={rowId(row, i)}
                        users={users}
                        files={files}
                        value={row[c.col_key]}
                        onChange={(v) => patch(i, c.col_key, v)}
                      />
                    </td>
                  ))}
                  {/* ปุ่มจัดการเกาะขอบขวาไว้เสมอ — ตารางกว้างกว่าจอ ถ้าเลื่อนตามไปด้วย
                      ก็ต้องเลื่อนสุดทางทุกครั้งที่จะลบสักแถว */}
                  <td className="sticky right-0 z-10 border-b border-border bg-surface
                                 px-1.5 py-1 group-hover:bg-surface-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" onClick={() => copyRow(i)}
                              title={t("form.copyRow")} aria-label={t("form.copyRow")}
                              className="btn-icon h-7 w-7 ring-0 text-muted hover:text-text">
                        <IconDuplicate className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeRow(i)}
                              title={t("common.delete")} aria-label={t("common.delete")}
                              className="btn-icon h-7 w-7 ring-0 text-muted hover:text-no">
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={span}
                      className="border-b border-border px-3 py-6 text-center text-sm text-muted">
                    {t("form.noRows")}
                  </td>
                </tr>
              )}

              {/* ปุ่มเพิ่มแถวเป็นแถวหนึ่งของตารางเอง — ต่อจากรายการสุดท้ายพอดี
                  ตรงที่สายตาหยุดหลังกรอกแถวล่างสุดเสร็จ */}
              <tr>
                <td colSpan={span} className="p-0">
                  <button type="button" onClick={addRow}
                          className="sticky left-0 flex items-center gap-1.5 px-3 py-2.5 text-sm
                                     font-medium text-primary-text hover:text-primary">
                    <IconPlus className="h-4 w-4" />
                    {t("form.addRow")}
                  </button>
                </td>
              </tr>
            </tbody>

            {/* ผลรวมอยู่ใต้คอลัมน์ของตัวเอง ไม่ใช่ข้อความลอยใต้ตาราง — ตัวเลขที่ต้อง
                เทียบกับตัวเลขในคอลัมน์ ควรอยู่ในแนวเดียวกันกับสิ่งที่มันบวกมา */}
            {totals.length > 0 && rows.length > 0 && (
              <tfoot>
                <tr className="bg-surface-2 text-sm">
                  <td className="sticky left-0 z-10 border-r border-border bg-surface-2 px-3
                                 py-2.5 text-center text-muted"
                      title={t("form.tableTotal")}>
                    <IconTypeTotal className="mx-auto h-3.5 w-3.5" />
                  </td>
                  {field.columns.map((c) => {
                    const sum = totalOf(c.col_key);
                    return (
                      <td key={c.col_key} className="whitespace-nowrap border-r border-border px-3 py-2.5">
                        {sum && (
                          <span className={`font-semibold tabular-nums text-text ${
                            c.type === "MONEY" || c.type === "NUMBER" ? "block text-right" : ""
                          }`}>
                            {money(sum.total, locale)}
                            {c.unit && <span className="ml-1 text-xs font-normal text-muted">{c.unit}</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-surface-2 px-2 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
      </div>
    </div>
  );
}

/** ช่องกรอกหนึ่งเซลล์ — เลือกหน้าตาตามชนิดคอลัมน์ กินพื้นที่เต็มเซลล์เสมอ */
function Cell({
  col,
  field,
  rowId,
  users,
  files,
  value,
  onChange,
}: {
  col: FieldColumn;
  field: Field;
  rowId: string;
  users: User[];
  files: CellFile[];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useT();

  if (col.type === "SELECT" || col.type === "DROPDOWN") {
    return (
      <select className="cell-input" value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (col.type === "USER") {
    return (
      <select className="cell-input" value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    );
  }

  // เลือกหลายค่าในเซลล์เดียว — ที่เลือกแล้วกลายเป็นชิปที่กดกากบาทเอาออกได้
  // ใช้ checkbox เรียงกันในเซลล์ไม่ได้ ตารางจะสูงจนอ่านไม่ไหวเมื่อมีหลายแถว
  if (col.type === "MULTISELECT") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    const left = col.options.filter((o) => !list.includes(o));
    return (
      <div className="flex min-w-40 flex-wrap items-center gap-1 px-3 py-1.5">
        {list.map((o) => (
          <span key={o}
                className="inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5
                           text-xs font-medium text-primary-text">
            {o}
            <button type="button" aria-label={`${t("common.delete")} ${o}`}
                    className="opacity-60 hover:opacity-100"
                    onClick={() => onChange(list.filter((x) => x !== o))}>×</button>
          </span>
        ))}
        {left.length > 0 && (
          <select
            className="h-7 flex-1 rounded-none border-0 bg-transparent text-sm text-text
                       focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            value=""
            onChange={(e) => e.target.value && onChange([...list, e.target.value])}
          >
            <option value="">{list.length ? t("form.addMore") : t("common.select")}</option>
            {left.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
    );
  }

  if (col.type === "FILE") {
    const key = cellKey(field.field_key, rowId, col.col_key);
    return (
      <FileCell
        name={cellFileName(field.field_key, rowId, col.col_key)}
        existing={files.filter((f) => f.field_key === key)}
      />
    );
  }

  const isNumber = col.type === "NUMBER" || col.type === "MONEY";
  const input = (
    <input
      className={`cell-input ${isNumber ? "text-right tabular-nums" : ""}`}
      type={col.type === "DATE" ? "date" : "text"}
      inputMode={isNumber ? "decimal" : undefined}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  // หน่วยต่อท้ายช่อง (THB-Baht, %) — บอกว่าตัวเลขที่พิมพ์เป็นหน่วยอะไร
  // โดยไม่ต้องเดาจากชื่อคอลัมน์ และไม่ให้คนพิมพ์หน่วยปนลงไปในตัวเลขเอง
  if (!col.unit) return input;
  return (
    <div className="flex items-center whitespace-nowrap">
      <div className="min-w-0 flex-1">{input}</div>
      <span className="shrink-0 pr-3 text-xs text-muted">{col.unit}</span>
    </div>
  );
}

/**
 * ช่องแนบไฟล์ในเซลล์
 *
 * ช่องเลือกไฟล์มาตรฐานของเบราว์เซอร์กินความกว้างเกือบครึ่งตารางไปกับข้อความ
 * "ไม่ได้เลือกไฟล์ใด" ที่ไม่ได้บอกอะไรเลย จึงซ่อนไว้แล้วใช้ปุ่มเล็กแทน —
 * แต่ต้องขึ้นชื่อไฟล์ที่เพิ่งเลือกให้เห็น ไม่งั้นกดแนบแล้วหน้าจอไม่เปลี่ยนอะไรเลย
 * และจะไม่มีทางรู้ว่าแนบติดไปหรือเปล่าจนกว่าจะกดบันทึก
 */
function FileCell({ name, existing }: { name: string; existing: CellFile[] }) {
  const t = useT();
  const [picked, setPicked] = useState<string[]>([]);
  const has = existing.length > 0 || picked.length > 0;

  return (
    <div className="min-w-40 space-y-1 px-3 py-2">
      {existing.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
           className="block truncate text-xs text-primary-text hover:underline">
          {f.filename}
        </a>
      ))}
      {picked.map((n) => (
        <span key={n} className="block truncate text-xs text-text-soft">{n}</span>
      ))}
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-surface-2
                        px-2.5 py-1 text-xs font-medium text-text-soft ring-1 ring-border
                        hover:bg-surface-3 hover:text-text">
        <IconPaperclip className="h-3.5 w-3.5" />
        {has ? t("form.attachMore") : t("form.attach")}
        <input
          type="file" multiple name={name} className="sr-only"
          onChange={(e) => setPicked([...(e.target.files ?? [])].map((f) => f.name))}
        />
      </label>
    </div>
  );
}
