import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  listReferenceable,
  canView,
  getActiveFields,
  getApprovers,
  getAttachments,
  getRequest,
  listActiveUsers,
} from "@/lib/queries";
import { isValueField, parseJson, type FormValues } from "@/lib/form";
import { formatDate, formatDateTime } from "@/lib/format";
import { parsePrintConfig, sheetSize } from "@/lib/print";
import { getLocale, getT } from "@/lib/i18n/server";
import FieldValue from "@/components/FieldValue";
import PrintButton from "./PrintButton";
import { PageShell } from "@/components/layout-bits";
import { visibleFields } from "@/lib/visibility";

export const dynamic = "force-dynamic";

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "";
const COMPANY_EN = process.env.NEXT_PUBLIC_COMPANY_NAME_EN ?? "";

export default async function PrintRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const { id } = await params;
  const req = await getRequest(Number(id));
  if (!req) notFound();
  if (!(await canView(req, user))) redirect("/requests");

  const data = parseJson<FormValues>(req.data, {});
  // ช่องที่ไม่เข้าเงื่อนไขไม่เคยถูกกรอกและไม่ได้เป็นส่วนหนึ่งของเอกสารใบนี้ —
  // แสดงเป็นบรรทัดว่างเปล่าจะทำให้อ่านเหมือนว่ามีคนลืมกรอก
  const fields = visibleFields((await getActiveFields(req.template_id)), data);
  const users = await listActiveUsers();
  // ใช้แปลง id ที่เก็บไว้ในฟิลด์อ้างอิง ให้เป็นเลขที่เอกสาร + หัวเรื่อง
  const refs = await listReferenceable(user);
  const files = await getAttachments(req.id);
  const approvers = (await getApprovers(req.id)).filter((a) => a.kind === "APPROVE");

  // ลายเซ็นของ "คนที่กดจริง" — ถ้ามีคนอนุมัติแทน ต้องเป็นลายเซ็นคนแทน ไม่ใช่เจ้าของคิว
  const signerIds = [req.requester_id, ...approvers.map((a) => a.acted_by ?? a.user_id)];
  const signatures = new Map<number, string>(
    (signerIds.length
      ? ((await db
          .prepare(
            `SELECT id, signature FROM users
              WHERE signature <> '' AND id IN (${signerIds.map(() => "?").join(",")})`,
          )
          .all(...signerIds)) as { id: number; signature: string }[])
      : []
    ).map((u) => [u.id, u.signature]),
  );
  // ตั้งค่าการพิมพ์ของฟอร์มนี้ — ตั้งที่ ผู้ดูแล → ฟอร์ม → ตั้งค่า → การพิมพ์
  const print = parsePrintConfig(req.template_print_config);
  const sheet = sheetSize(print);

  // โหมดลายเซ็นของฟอร์มนี้ — ตั้งที่ ผู้ดูแล → ฟอร์ม → ตั้งค่า
  const sigMode = req.template_signature_mode ?? "OPTIONAL";

  // โหมด REQUIRED: เตือนคนพิมพ์ว่าใครยังไม่ได้อัปโหลดลายเซ็น ก่อนเอาเอกสารไปให้ลูกค้า
  const missingSignatures =
    sigMode === "REQUIRED"
      ? [
          ...(req.submitted_at && !signatures.get(req.requester_id)
            ? [req.requester_name]
            : []),
          ...approvers
            .filter((a) => a.acted_at && !signatures.get(a.acted_by ?? a.user_id))
            .map((a) => (a.acted_by && a.acted_by !== a.user_id ? a.acted_by_name ?? a.name : a.name)),
        ]
      : [];

  const dots = "(..........................................)";
  const signLabels = {
    rejected: t("print.rejected"),
    dateBlank: t("print.dateBlank"),
    dateOn: (d: string) => t("print.dateOn", { date: d }),
    note: (text: string) => t("print.note", { text }),
  };

  return (
    <PageShell>
    <>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between">
        <p className="text-sm text-muted">
          {t("print.hint")}
        </p>
        <PrintButton />
      </div>

      {missingSignatures.length > 0 && (
        <div
          className="no-print mx-auto mb-4 max-w-[210mm] rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "var(--c-wait-soft)",
            borderColor: "var(--c-wait)",
            color: "var(--c-wait-text)",
          }}
        >
          {t("print.missingSignature", { names: [...new Set(missingSignatures)].join(", ") })}
        </div>
      )}

      {/* @page ต้องเป็น CSS จริง ตั้งผ่าน inline style ของ element ไม่ได้ */}
      <style>{`@page { size: ${sheet.width}mm ${sheet.height}mm; margin: 0; }`}</style>

      <div
        className="doc-sheet shadow-lg print:shadow-none"
        style={{
          "--sheet-w": `${sheet.width}mm`,
          "--sheet-h": `${sheet.height}mm`,
          "--sheet-pad": `${print.margin}mm`,
          "--sheet-font": `${print.fontSize}px`,
          "--sign-cols": String(print.signPerRow),
        } as React.CSSProperties}
      >
        <div className="mb-4 text-center">
          {print.showCompany && COMPANY && <div className="text-lg font-bold">{COMPANY}</div>}
          {print.showCompany && COMPANY_EN && <div className="text-sm">{COMPANY_EN}</div>}
          <div className="mt-3 text-2xl font-bold">{req.template_name}</div>
          {/* เลขนี้คือตัวอ้างอิงที่ต้องกรอกใน OA — ต้องอ่านออกจากกระดาษที่ปรินต์มา */}
          <div className="mt-1 font-mono text-sm font-bold">{t("print.docNo", { no: req.doc_no })}</div>
        </div>

        <table className="doc-table mb-4">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "72%" }} />
          </colgroup>
          <tbody>
            <tr>
              <th scope="col">{t("print.date")}</th>
              <td>{formatDate(req.doc_date, locale)}</td>
            </tr>
            <tr>
              <th scope="col">{t("print.requestFrom")}</th>
              <td>
                {req.requester_name}
                {req.requester_position ? ` — ${req.requester_position}` : ""}
                {req.requester_department ? ` (${req.requester_department})` : ""}
              </td>
            </tr>
            {fields
              .filter((f) => f.type !== "TEXTAREA" && f.type !== "TABLE" && isValueField(f))
              .map((f) => (
                <tr key={f.id}>
                  <th scope="col">{f.label} :</th>
                  <td>
                    <FieldValue field={f} value={data[f.field_key]} users={users} refs={refs} files={files} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {fields
          .filter((f) => f.type === "TABLE" || f.type === "TEXTAREA")
          .map((f) => (
            <div key={f.id} className="mb-4">
              <div className="mb-1 font-semibold">{f.label}</div>
              <div className="doc-body">
                <FieldValue field={f} value={data[f.field_key]} users={users} refs={refs} files={files} />
              </div>
            </div>
          ))}

        <p className="mt-6">{print.closing || t("print.pleaseApprove")}</p>

        {sigMode === "NONE" ? (
          /* เอกสารภายใน — ไม่ต้องลงนาม ใช้บันทึกการอนุมัติจากระบบเป็นหลักฐานว่าใครอนุมัติเมื่อไหร่ */
          <div className="mt-6">
            <div className="mb-1 font-semibold">{t("print.approvalRecord")}</div>
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "26%" }}>{t("print.col.step")}</th>
                  <th scope="col" style={{ width: "30%" }}>{t("print.col.person")}</th>
                  <th scope="col" style={{ width: "16%" }}>{t("print.col.result")}</th>
                  <th scope="col" style={{ width: "28%" }}>{t("print.col.when")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("print.requester")}</td>
                  <td>
                    {req.requester_name}
                    {req.requester_position ? ` — ${req.requester_position}` : ""}
                  </td>
                  <td>{req.submitted_at ? t("print.submitted") : "—"}</td>
                  <td>{req.submitted_at ? formatDateTime(req.submitted_at, locale) : "—"}</td>
                </tr>
                {approvers.map((a) => (
                  <tr key={a.id}>
                    <td>{t("print.stepN", { stage: t(`stage.${a.stage}`), n: a.step_no })}</td>
                    <td>
                      {a.name}
                      {a.title || a.position ? ` — ${a.title || a.position}` : ""}
                      {a.acted_by && a.acted_by !== a.user_id && a.acted_by_name
                        ? ` (${t("print.actedBy", { name: a.acted_by_name })})`
                        : ""}
                    </td>
                    <td>
                      {a.status === "APPROVED"
                        ? t("print.approved")
                        : a.status === "REJECTED"
                          ? t("print.rejected")
                          : "—"}
                    </td>
                    <td>
                      {a.acted_at ? formatDateTime(a.acted_at, locale) : "—"}
                      {a.comment ? <div className="text-xs">{signLabels.note(a.comment)}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs">{t("print.electronicNote", { no: req.doc_no })}</p>
          </div>
        ) : (
          <div className="sign-grid mt-8">
            <SignBlock
              heading={t("print.regards")}
              name={req.requester_name}
              title={req.requester_position || t("print.requester")}
              stamp={req.submitted_at ? formatDateTime(req.submitted_at, locale) : null}
              signature={req.submitted_at ? signatures.get(req.requester_id) : undefined}
              dots={dots}
              labels={signLabels}
            />
            {approvers.map((a) => (
              <SignBlock
                key={a.id}
                heading={t("print.stepN", { stage: t(`stage.${a.stage}`), n: a.step_no })}
                name={a.name}
                title={a.title || a.position}
                stamp={a.acted_at ? formatDateTime(a.acted_at, locale) : null}
                signature={a.acted_at ? signatures.get(a.acted_by ?? a.user_id) : undefined}
                signedBy={a.acted_by && a.acted_by !== a.user_id ? a.acted_by_name ?? "" : ""}
                rejected={a.status === "REJECTED"}
                comment={a.comment}
                dots={dots}
                labels={signLabels}
              />
            ))}
          </div>
        )}
      </div>
    </>
    </PageShell>
  );
}

function SignBlock({
  heading, name, title, stamp, dots, rejected, comment, labels, signature, signedBy,
}: {
  heading: string; name: string; title: string; stamp: string | null; dots: string;
  rejected?: boolean; comment?: string;
  signature?: string; signedBy?: string;
  labels: { rejected: string; dateBlank: string;
            dateOn: (d: string) => string; note: (s: string) => string };
}) {
  return (
    <div>
      <div className="font-semibold">{heading}</div>
      <div className="relative flex h-[18mm] items-end justify-center">
        {/*
          เอกสารที่ผ่านแล้วไม่ต้องมีตราประทับ "ลงนามแล้ว"/"อนุมัติแล้ว" —
          ลายเซ็นกับวันเวลาใต้ช่องบอกอยู่แล้วว่าผ่านมือใครเมื่อไหร่ ตราประทับซ้อนทับ
          ลายเซ็นจริงและทำให้เอกสารดูเหมือนแบบฟอร์มระบบมากกว่าหนังสือของบริษัท

          แต่ "ไม่อนุมัติ" ยังต้องประทับไว้ เพราะถ้าเอาออก เอกสารที่ถูกปฏิเสธจะหน้าตา
          เหมือนเอกสารที่ผ่านทุกประการ ต่างกันแค่ไม่มีอะไรเลย ซึ่งอ่านผิดได้ง่ายเกินไป
        */}
        {signature && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/signature/${encodeURIComponent(signature)}`}
            alt=""
            className="absolute bottom-1 left-1/2 max-h-[16mm] max-w-[50mm] -translate-x-1/2 object-contain"
          />
        )}
        {stamp && rejected ? (
          <span className="relative mb-1 rounded border border-black px-2 py-0.5 text-xs">
            {labels.rejected}
          </span>
        ) : null}
      </div>
      <div className="text-center">{dots}</div>
      <div className="text-center">{name || " "}</div>
      {signedBy && <div className="text-center text-xs">({signedBy})</div>}
      <div className="text-center text-sm">{title || " "}</div>
      <div className="text-center text-xs">
        {stamp ? labels.dateOn(stamp) : labels.dateBlank}
      </div>
      {comment && <div className="mt-1 text-center text-xs">{labels.note(comment)}</div>}
    </div>
  );
}
