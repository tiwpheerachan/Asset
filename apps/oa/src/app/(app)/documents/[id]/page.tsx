import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getIssued } from "@/lib/issue";
import { canView, getRequest, getFields, listActiveUsers, getAttachments } from "@/lib/queries";
import { parseJson, isValueField, type FormValues } from "@/lib/form";
import { formatDate, money } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import FieldValue from "@/components/FieldValue";
import PrintButton from "../../requests/[id]/print/PrintButton";
import { PageShell } from "@/components/layout-bits";
import { visibleFields } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function IssuedDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const { id } = await params;

  const doc = await getIssued(Number(id));
  if (!doc) notFound();

  const req = await getRequest(doc.request_id);
  if (!req || !(await canView(req, user))) notFound();

  const data = parseJson<FormValues>(req.data, {});
  // ช่องที่ไม่เข้าเงื่อนไขไม่เคยถูกกรอกและไม่ได้เป็นส่วนหนึ่งของเอกสารใบนี้ —
  // แสดงเป็นบรรทัดว่างเปล่าจะทำให้อ่านเหมือนว่ามีคนลืมกรอก
  const fields = visibleFields((await getFields(req.template_id)).filter(isValueField), data);
  const users = await listActiveUsers();
  const files = await getAttachments(req.id);

  return (
    <PageShell>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text">{t(`issue.type.${doc.doc_type}`)}</h1>
          <p className="text-sm text-muted">
            {t("issue.fromRequest")} {req.doc_no}
          </p>
        </div>
        <PrintButton />
      </div>

      {doc.void === 1 && (
        <div className="alert alert-error mb-3">
          {t("issue.voidedNotice")} — {doc.void_reason}
        </div>
      )}

      <div className="doc-sheet mx-auto max-w-[210mm] bg-white p-[15mm] text-black">
        <div className="flex items-start justify-between border-b border-black pb-3">
          <div>
            <div className="text-xl font-bold">{t(`issue.type.${doc.doc_type}`)}</div>
            <div className="text-sm">{t("issue.refRequest", { no: req.doc_no })}</div>
          </div>
          <div className="text-right text-sm">
            <div>
              <strong>{t("issue.docNumber")}:</strong> {doc.doc_number}
            </div>
            <div>
              <strong>{t("issue.issuedAt")}:</strong> {formatDate(doc.issued_at, locale)}
            </div>
            {doc.void === 1 && (
              <div className="mt-1 inline-block border border-black px-2 py-0.5 text-xs">
                {t("issue.voided")}
              </div>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="font-semibold">{t("table.subject")}</dt>
          <dd>{req.title || "—"}</dd>
          <dt className="font-semibold">{t("table.requester")}</dt>
          <dd>
            {req.requester_name}
            {req.requester_department ? ` · ${req.requester_department}` : ""}
          </dd>
          <dt className="font-semibold">{t("table.date")}</dt>
          <dd>{formatDate(req.doc_date, locale)}</dd>
          {req.amount !== null && (
            <>
              <dt className="font-semibold">{t("table.amount")}</dt>
              <dd>{money(req.amount, locale)}</dd>
            </>
          )}
        </dl>

        <div className="mt-5 space-y-3 border-t border-black pt-4">
          {fields.map((f) => (
            <div key={f.id}>
              <div className="text-sm font-semibold">{f.label}</div>
              <div className="text-sm">
                <FieldValue field={f} value={data[f.field_key]} users={users} files={files} />
              </div>
            </div>
          ))}
        </div>

        {doc.note && (
          <p className="mt-5 border-t border-black pt-3 text-sm">
            <strong>{t("issue.note")}:</strong> {doc.note}
          </p>
        )}

        <div className="mt-10 text-right text-sm">
          <div>{t("issue.issuedBy")}</div>
          <div className="mt-8">{doc.issued_by_name || "—"}</div>
          <div className="border-t border-black pt-1">{formatDate(doc.issued_at, locale)}</div>
        </div>
      </div>
    </PageShell>
  );
}
