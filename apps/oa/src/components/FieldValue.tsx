import { ROW_ID, cellKey, isRange, rangeDays, tableTotals, type TableRow } from "@/lib/form";
import { IconTypeTotal } from "@/components/icons";
import FileDownload from "@/components/FileDownload";
import { fileSize, formatDate, money } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { RequestWithMeta, Attachment, Field, User } from "@/lib/types";

/** แสดงค่าของฟิลด์หนึ่งช่องบนหน้ารายละเอียด/หน้าพิมพ์ */
export default async function FieldValue({
  field,
  value,
  users,
  refs = [],
  files,
}: {
  field: Field;
  value: unknown;
  users: User[];
  /** ใช้แสดงเลขที่+หัวเรื่องของคำขอที่ถูกอ้างถึง */
  refs?: RequestWithMeta[];
  files: Attachment[];
}) {
  const t = await getT();
  const locale = await getLocale();
  const nameOf = (id: unknown) =>
    users.find((u) => u.id === Number(id))?.name ?? (id ? String(id) : "");

  if (field.type === "TABLE") {
    const rows = (value as TableRow[]) ?? [];
    const totals = tableTotals(field, rows);
    if (field.columns.length === 0) return <Empty />;
    const num = (t: string) => t === "MONEY" || t === "NUMBER";
    return (
      <div className="overflow-x-auto rounded-md ring-1 ring-border">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col"
                    className="w-10 border-b border-r border-border px-3 py-2 text-center font-medium">#</th>
                {field.columns.map((c) => (
                  <th scope="col" key={c.col_key}
                      className={`whitespace-nowrap border-b border-r border-border px-3 py-2
                                  font-medium ${num(c.type) && !c.unit ? "text-right" : ""}`}>
                    {c.label}
                    {c.unit && <span className="ml-1 font-normal text-muted">({c.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface">
              {rows.map((row, i) => {
                const rid = String(row[ROW_ID] ?? `r${i}`);
                return (
                  <tr key={rid}>
                    <td className="border-b border-r border-border px-3 py-2 text-center text-xs
                                   tabular-nums text-muted">{i + 1}</td>
                    {field.columns.map((c) => {
                      // ไฟล์ของแถวนี้โดยเฉพาะ — ผูกกับรหัสแถว ไม่ใช่ลำดับที่ ลบแถวอื่น
                      // ทิ้งแล้วไฟล์จึงไม่เลื่อนไปติดรายการอื่น
                      const cellFiles =
                        c.type === "FILE"
                          ? files.filter(
                              (f) => f.field_key === cellKey(field.field_key, rid, c.col_key),
                            )
                          : [];
                      const v = row[c.col_key];
                      return (
                        <td key={c.col_key}
                            className={`border-b border-r border-border px-3 py-2 align-top
                                        text-text ${num(c.type) ? "text-right tabular-nums" : ""}`}>
                          {c.type === "FILE" ? (
                            cellFiles.length === 0 ? (
                              <Empty />
                            ) : (
                              <ul className="space-y-0.5">
                                {cellFiles.map((f) => (
                                  <li key={f.id} className="flex items-center gap-1">
                                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
                                       className="min-w-0 truncate text-primary-text hover:underline">
                                      {f.filename}
                                    </a>
                                    <FileDownload id={f.id} filename={f.filename} className="h-6 w-6" />
                                  </li>
                                ))}
                              </ul>
                            )
                          ) : c.type === "MULTISELECT" ? (
                            <span className="flex flex-wrap gap-1">
                              {(Array.isArray(v) ? (v as string[]) : []).map((o) => (
                                <span key={o}
                                      className="rounded bg-surface-2 px-2 py-0.5 text-xs text-text-soft">
                                  {o}
                                </span>
                              ))}
                            </span>
                          ) : c.type === "USER" ? (
                            nameOf(v)
                          ) : c.type === "MONEY" ? (
                            money(Number(v ?? 0), locale)
                          ) : c.type === "DATE" ? (
                            formatDate(String(v ?? ""), locale)
                          ) : (
                            String(v ?? "")
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={field.columns.length + 1}
                      className="border-b border-border px-3 py-4 text-center text-sm text-muted">
                    {t("form.noRows")}
                  </td>
                </tr>
              )}
            </tbody>

            {/* ผลรวมอยู่ใต้คอลัมน์ของตัวเอง — ผู้อนุมัติกวาดตาลงมาตามคอลัมน์แล้วเจอยอด
                ตรงปลายทางพอดี ไม่ต้องไปหาบรรทัดสรุปที่ลอยอยู่ใต้ตาราง */}
            {totals.length > 0 && rows.length > 0 && (
              <tfoot>
                <tr className="bg-surface-2">
                  <td className="border-r border-border px-3 py-2 text-center text-muted"
                      title={t("form.tableTotal")}>
                    <IconTypeTotal className="mx-auto h-3.5 w-3.5" />
                  </td>
                  {field.columns.map((c) => {
                    const sum = totals.find((x) => x.key === c.col_key);
                    return (
                      <td key={c.col_key}
                          className={`whitespace-nowrap border-r border-border px-3 py-2 ${
                            num(c.type) ? "text-right" : ""
                          }`}>
                        {sum && (
                          <span className="font-semibold tabular-nums text-text">
                            {money(sum.total, locale)}
                            {c.unit && (
                              <span className="ml-1 text-xs font-normal text-muted">{c.unit}</span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
      </div>
    );
  }

  if (field.type === "FILE" || field.type === "IMAGE") {
    const mine = files.filter((f) => f.field_key === field.field_key);
    if (mine.length === 0) return <Empty />;
    if (field.type === "IMAGE") {
      return (
        <div className="flex flex-wrap gap-2">
          {mine.map((f) => (
            <div key={f.id} className="relative">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
                 className="block">
                {/* ไฟล์อยู่หลัง route ที่ตรวจสิทธิ์ จึงใช้ img ธรรมดาแทน next/image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${f.id}`} alt={f.filename}
                     className="h-28 w-28 rounded-xl object-cover ring-1 ring-border" />
              </a>
              <FileDownload id={f.id} filename={f.filename}
                            className="absolute right-1 top-1 bg-surface/90 text-text-soft ring-1 ring-border backdrop-blur-sm hover:bg-surface" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul className="space-y-1 text-sm">
        {mine.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
               className="min-w-0 truncate text-primary-text hover:underline">{f.filename}</a>
            <span className="shrink-0 text-xs text-muted">{fileSize(f.size)}</span>
            <FileDownload id={f.id} filename={f.filename} />
          </li>
        ))}
      </ul>
    );
  }

  if (field.type === "DATERANGE") {
    const range = isRange(value) ? value : null;
    if (!range?.from && !range?.to) return <Empty />;
    const days = rangeDays(range);
    return (
      <span className="tabular-nums">
        {formatDate(range!.from, locale)} – {formatDate(range!.to, locale)}
        {days !== null && (
          <span className="ml-2 text-muted">({t("field.range.days", { days: String(days) })})</span>
        )}
      </span>
    );
  }

  if (value === null || value === undefined || value === "") return <Empty />;

  switch (field.type) {
    case "TOTAL":
    case "MONEY":
      return <span className="tabular-nums">{money(Number(value), locale)}</span>;
    case "NUMBER":
      return <span className="tabular-nums">{String(value)}</span>;
    case "DATE":
      return <span>{formatDate(String(value), locale)}</span>;
    case "USER":
      return <span>{nameOf(value)}</span>;

    // ลิงก์กลับไปหาเอกสารต้นทางได้ — จุดสำคัญของการอ้างอิง คือตามรอยได้จริง
    // ไม่ใช่แค่มีตัวเลขวางไว้เฉยๆ
    case "REQUEST": {
      const id = Number(value);
      if (!id) return <span className="text-muted">—</span>;
      const ref = refs.find((r) => r.id === id);
      return (
        <a href={`/requests/${id}`} className="text-primary-text hover:underline">
          {ref ? `${ref.doc_no} — ${ref.title || ""}`.trim() : `#${id}`}
        </a>
      );
    }
    case "MULTISELECT":
      return <span>{((value as string[]) ?? []).join(", ") || "-"}</span>;
    /* ข้อความหลายบรรทัดเคยอยู่ในกล่องพื้นเทา — ในหน้ารายละเอียดที่ค่าอื่นเป็นข้อความ
       เปล่า ๆ ทั้งหมด กล่องเทาทำให้ช่องเดียวเด่นขึ้นมาโดยไม่มีเหตุผล และดูเหมือน
       ช่องกรอกที่พิมพ์ได้ ทั้งที่หน้านี้อ่านอย่างเดียว */
    case "TEXTAREA":
      return (
        <div className="whitespace-pre-wrap font-doc text-[15px] leading-relaxed text-text">
          {String(value)}
        </div>
      );
    default:
      return <span>{String(value)}</span>;
  }
}

const Empty = () => <span className="text-muted">-</span>;
