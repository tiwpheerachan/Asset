import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { deleteAttachmentAction, markCcRead } from "@/lib/actions";
import {
  drawdownFor,
  listReferencing,
  listReferenceable,
  canView,
  currentStepApprovers,
  getActiveFields,
  getApprovers,
  getAttachments,
  getAuditLog,
  getComments,
  getRequest,
  listActiveUsers,
} from "@/lib/queries";
import { parseCellKey, parseJson, isValueField, type FormValues } from "@/lib/form";
import { formatDate, formatDateTime, money, since, waitingDays } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/locales";
import type { AuditEntry } from "@/lib/types";
import CopyDocNo from "@/components/CopyDocNo";
import CopyLink from "@/components/CopyLink";
import ClearPanel from "@/components/ClearPanel";
import VoidApproved from "@/components/VoidApproved";
import { clearStatus } from "@/lib/clearing";
import { listExternalStatus } from "@/lib/external-status";
import { Avatar, StageBadge, StatusBadge } from "@/components/ui";
import CollapsibleText from "@/components/CollapsibleText";
import FieldValue from "@/components/FieldValue";
import FlowTimeline from "@/components/FlowTimeline";
import FileDownload from "@/components/FileDownload";
import BackLink from "@/components/BackLink";
import AccountingCard from "@/components/AccountingCard";
import { PageShell } from "@/components/layout-bits";
import { visibleFields } from "@/lib/visibility";
import DrawdownCard from "@/components/DrawdownCard";
import {
  CommentBox,
  DecidePanel,
  FinalRequestPanel,
  OwnerActions,
  UploadForm,
} from "@/components/RequestActions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "detail", label: "detail.tab.detail" },
  { key: "flow", label: "detail.tab.flow" },
  { key: "comments", label: "detail.tab.comments" },
] as const;

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const { id } = await params;
  const sp = await searchParams;
  const req = await getRequest(Number(id));
  if (!req) notFound();
  if (!(await canView(req, user))) redirect("/requests");

  await markCcRead(req.id, user.id);

  const tab = TABS.some((x) => x.key === sp.tab) ? sp.tab! : "detail";
  const data = parseJson<FormValues>(req.data, {});
  // ช่องที่ไม่เข้าเงื่อนไขไม่เคยถูกกรอกและไม่ได้เป็นส่วนหนึ่งของเอกสารใบนี้ —
  // แสดงเป็นบรรทัดว่างเปล่าจะทำให้อ่านเหมือนว่ามีคนลืมกรอก
  const fields = visibleFields((await getActiveFields(req.template_id)), data);
  const approvers = await getApprovers(req.id);
  const files = await getAttachments(req.id);
  const comments = await getComments(req.id);
  const log = await getAuditLog(req.id);
  const users = await listActiveUsers();
  // ใช้แปลง id ที่เก็บไว้ในฟิลด์อ้างอิง ให้เป็นเลขที่เอกสาร + หัวเรื่อง
  const accounting = await listExternalStatus(req.id);
  const refs = await listReferenceable(user);
  const referencing = await listReferencing(user, req.id);
  // ใบนี้เป็นใบหลักของใครหรือเปล่า — มีใบลูกอ้างถึงก็ถือว่าใช่ ต้องสรุปยอดเบิกให้ดู
  const draw = await (await referencing.length > 0 ? drawdownFor(req.id) : null);

  const isOwner = req.requester_id === user.id || user.role === "ADMIN";
  const myTurn =
    req.status === "PENDING" &&
    (await currentStepApprovers(req.id, req.stage, req.current_step)).some(
      (a) => a.user_id === user.id && a.status === "PENDING" && a.kind === "APPROVE",
    );
  const waited = req.status === "PENDING" ? waitingDays(req.submitted_at) : 0;
  // "ไฟล์แนบอื่น ๆ" = ไฟล์ที่ไม่ได้อยู่กับช่องไหน — ไฟล์ในเซลล์ของตารางแสดงอยู่ในตาราง
  // ของมันอยู่แล้ว ถ้านับรวมมาตรงนี้ด้วยก็จะเห็นไฟล์เดียวกันสองที่
  const inCell = (key: string) => {
    const cell = parseCellKey(key);
    return Boolean(cell && fields.some((x) => x.field_key === cell.fieldKey && x.type === "TABLE"));
  };
  // ไฟล์ของความคิดเห็นมีที่อยู่ของมันเองในแท็บความคิดเห็นแล้ว ถ้านับรวมมาด้วย
  // มันจะไปโผล่ซ้ำในบันทึกการอนุมัติ เพราะที่นั่นจับคู่ไฟล์กับคนที่อัปโหลด
  const unfiled = files.filter(
    (f) =>
      !f.comment_id &&
      !fields.some((x) => x.field_key === f.field_key) &&
      !inCell(f.field_key),
  );
  // เอกสารที่อนุมัติจบหรือยกเลิกแล้ว ไม่มีปุ่มไหนเหลือให้เจ้าของกด — อย่าโชว์การ์ดหัวข้อลอยๆ
  const hasOwnerActions = req.status !== "APPROVED" && req.status !== "CANCELLED";

  return (
    <PageShell>
    <div className="space-y-5">
      <BackLink />
      {/* หัวเอกสารสองบรรทัด: บรรทัดแรกบอกว่า "เอกสารอะไร อยู่สถานะไหน"
          บรรทัดที่สองบอกว่า "ใครส่ง เมื่อไหร่" — สองคำถามที่คนเปิดเอกสารถามเสมอ
          ปุ่มย้ายไปอยู่แถวแท็บ เพราะเป็นเครื่องมือของหน้า ไม่ใช่ข้อมูลของเอกสาร */}
      <div className="card space-y-3">
        {/* จอแคบให้ชื่อฟอร์มอยู่บรรทัดของตัวเอง
            เดิมชื่อกับป้ายอยู่แถวเดียวกันเสมอ ป้ายจองที่ไว้ก่อน (shrink-0) ชื่อจึงถูกบีบ
            จนเหลือความกว้างเกือบศูนย์ แล้ว break-words ตัดทีละตัวอักษรเป็นแนวตั้ง —
            เห็นชัดมากกับชื่อที่มีทั้งอังกฤษและจีนอย่าง Marketing-KOL费用申请单 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <h1 className="break-words text-xl font-bold text-text sm:min-w-0 sm:flex-1">
            {req.template_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* เลขที่เอกสารอยู่คู่กับสถานะ — สองอย่างนี้คือ "ใบไหน" กับ "ถึงไหนแล้ว"
                ซึ่งเป็นสิ่งที่คนถามถึงพร้อมกันเสมอเวลาตามเรื่อง */}
            <CopyDocNo docNo={req.doc_no} />
            <StatusBadge status={req.status} />
            {/* ป้ายระดับเหลือไว้เฉพาะเอกสารเก่าที่ยังค้างอยู่ระดับเบื้องต้น —
                ใบที่ยื่นหลังยุบสายเป็น FINAL ทุกใบ ป้ายจึงไม่ได้บอกอะไรใหม่ */}
            {req.status === "PENDING" && req.stage === "PRELIM" && (
              <StageBadge stage={req.stage} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <Avatar name={req.requester_name} src={req.requester_avatar} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text">{req.requester_name}</div>
            {req.requester_position && (
              <div className="truncate text-xs text-muted">{req.requester_position}</div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-muted">
            <span>{formatDate(req.doc_date, locale)}</span>
            {req.submitted_at && (
              <span>· {t("detail.submittedAgo", { ago: since(req.submitted_at, t) })}</span>
            )}
            {waited > 0 && <span>· {t("detail.waitedDays", { n: waited })}</span>}
          </div>
        </div>
      </div>

      {req.status === "RETURNED" && (
        <div className="rounded-xl tone-orange px-4 py-3 text-sm ring-1">
          {t("detail.returnedBanner")}
        </div>
      )}

      {myTurn && <DecidePanel requestId={req.id} stage={req.stage}
                              users={users.filter((u) => u.id !== user.id && u.id !== req.requester_id)} />}
      {isOwner && req.status === "PRELIM_APPROVED" && (
        <FinalRequestPanel requestId={req.id} amount={req.amount} />
      )}

      {/* จอแคบแยกแท็บกับเครื่องมือเป็นคนละแถว — เดิมอยู่แถวเดียวกัน เครื่องมือกินที่ไปครึ่ง
          แท็บที่เหลือจึงถูกตัดกลางคำ ("บันทึกการอนุมัติ" เหลือ "บัน") และแท็บสุดท้ายหายไปเลย
          โดยไม่มีอะไรบอกว่าเลื่อนดูต่อได้ */}
      <div className="flex flex-col items-stretch border-b border-border sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex gap-1 overflow-x-auto sm:min-w-0 sm:flex-1">
          {TABS.map((tabDef) => (
            <Link
              key={tabDef.key}
              href={`/requests/${req.id}?tab=${tabDef.key}`}
              className={`tab ${tab === tabDef.key ? "tab-active" : ""}`}
            >
              {t(tabDef.label)}
              {tabDef.key === "comments" && comments.length > 0 && ` (${comments.length})`}
            </Link>
          ))}
        </div>
        {/* เครื่องมือของหน้าใช้ทรงเดียวกับแท็บ — อยู่แถวเดียวกันแล้วปุ่มแคปซูลทึบ
            จะหนักกว่าแท็บจนดึงสายตาไปจากสิ่งที่คนมาหา คือเนื้อเอกสาร */}
        <div className="flex flex-wrap items-center border-t border-border sm:border-t-0 sm:shrink-0 sm:justify-end">
          <CopyLink path={`/requests/${req.id}`} className="tab flex items-center gap-1.5" />
          <Link href={`/requests/${req.id}/print`} target="_blank" className="tab">
            {t("detail.print")}
          </Link>
          {isOwner && (req.status === "DRAFT" || req.status === "RETURNED") && (
            <Link href={`/requests/${req.id}/edit`} className="tab">{t("common.edit")}</Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {tab === "detail" && (
            <section className="card space-y-5">
              {/* ป้ายไม่ใช้ตัวพิมพ์ใหญ่ล้วนอีกต่อไป — ชื่อฟิลด์จริงมีทั้งไทย อังกฤษ และจีน
                  ปนกัน การบังคับเป็นตัวใหญ่ทั้งหมดทำให้อ่านเหมือนตะโกน และภาษาที่ไม่มี
                  ตัวใหญ่-เล็กก็ไม่ได้อะไรเพิ่ม · เส้นคั่นบาง ๆ ทำให้รู้ว่าค่าไหนของหัวข้อไหน
                  โดยไม่ต้องเว้นบรรทัดห่างจนหน้ายาว */}
              <dl className="divide-y divide-border">
                {fields.map((f) =>
                  /* หัวข้อคั่นไม่ใช่ค่าที่กรอก — แสดงเป็นหัวข้อเต็มความกว้าง ไม่ใช่แถว
                     ป้าย/ค่า ที่ลงท้ายด้วยขีดกลางเพราะไม่มีค่าให้แสดง */
                  f.type === "HEADING" ? (
                    <div key={f.id} className="py-3 first:pt-0 last:pb-0">
                      <h3 className="text-sm font-semibold text-text">{f.label}</h3>
                      {f.help && (
                        <CollapsibleText text={f.help}
                                         className="mt-1 text-sm leading-relaxed text-muted" />
                      )}
                    </div>
                  ) : (
                  <div key={f.id}
                       className={`py-3 first:pt-0 last:pb-0 ${f.type === "TABLE" ? "" : "sm:flex sm:gap-4"}`}>
                    <dt className="mb-1 text-[13px] text-muted sm:mb-0 sm:w-52 sm:shrink-0 sm:pt-0.5">
                      {f.label}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm text-text">
                      <FieldValue
                        field={f}
                        value={isValueField(f) ? data[f.field_key] : null}
                        users={users}
                        refs={refs}
                        files={files}
                      />
                    </dd>
                  </div>
                  ),
                )}
              </dl>

              {unfiled.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="label">{t("detail.extraFiles")}</div>
                  <ul className="divide-y divide-border text-sm">
                    {unfiled.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 py-2">
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
                           className="min-w-0 flex-1 truncate text-primary-text hover:underline">
                          {f.filename}
                        </a>
                        <span className="shrink-0 text-xs text-muted">{f.uploader_name}</span>
                        <FileDownload id={f.id} filename={f.filename} />
                        {(f.uploaded_by === user.id || user.role === "ADMIN") && (
                          <form action={deleteAttachmentAction}>
                            <input type="hidden" name="attachment_id" value={f.id} />
                            <button className="text-xs text-no hover:underline">{t("common.delete")}</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {req.status !== "CANCELLED" && (
                <div className="border-t border-border pt-3">
                  <UploadForm requestId={req.id} />
                </div>
              )}
            </section>
          )}

          {tab === "flow" && (
            <section className="card">
              {/* ไม่ใส่หัวข้อซ้ำชื่อแท็บที่อยู่เหนือขึ้นไปสองบรรทัด */}
              <FlowTimeline request={req} approvers={approvers} files={unfiled} />
            </section>
          )}

          {tab === "comments" && (
            <section className="card">
              <CommentBox requestId={req.id} comments={comments} />
            </section>
          )}

        </div>

        <div className="space-y-5">
          {/* ทางกลับของการอ้างอิง — เปิดใบหลักแล้วเห็นว่ามีใบไหนอ้างถึงบ้าง
              ถ้าไม่มีส่วนนี้ การอ้างอิงจะเป็นแค่ลิงก์ทางเดียว ไม่ใช่การตามรอย */}
          {referencing.length > 0 && (
            <section className="card space-y-1 p-0">
              <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-4">
                <h2 className="h-sect">{t("ref.incoming")}</h2>
                <span className="text-xs text-muted">
                  {t("ref.incomingCount", { n: String(referencing.length) })}
                </span>
              </div>
              {/* รายการทำเอง ไม่ใช้การ์ดคิวรวม — การ์ดนั้นออกแบบมาสำหรับรายการงานที่ต้อง
                  รู้ว่า "ค้างอยู่ที่ใคร ขั้นไหน" ส่วนตรงนี้คนอ่านอยากรู้แค่ งวดไหน เท่าไร
                  จบหรือยัง · บรรทัด "อ้างอิงใบอนุมัติหลัก: 12" ที่มากับการ์ดนั้นยิ่งไม่มี
                  ความหมาย เพราะทุกใบในรายการนี้อ้างถึงใบนี้อยู่แล้ว */}
              <ul className="divide-y divide-border">
                {referencing.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`}
                          className="flex items-baseline gap-3 px-4 py-2.5 transition hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-text">
                          {r.title || t("table.noSubject")}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <StatusBadge status={r.status} />
                          <span>{formatDate(r.doc_date, locale)}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                        {r.amount === null ? "—" : money(r.amount, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {draw && <DrawdownCard d={draw} />}

          {/* ความคืบหน้าฝั่งบัญชี — วางเหนือเรื่องเคลียร์ OA เพราะเป็นคำถามเดียวกัน
              คือ "อนุมัติแล้วเรื่องเดินไปถึงไหน" ซึ่งเป็นสิ่งที่คนยื่นถามบ่อยที่สุด */}
          {accounting.length > 0 && <AccountingCard rows={accounting} />}

          {/* เอกสารที่อนุมัติแล้วยังไม่จบจนกว่าค่าใช้จ่ายจะถูกตั้งเบิกใน OA จริง */}
          <ClearPanel requestId={req.id} status={clearStatus(req)} />

          {isOwner && hasOwnerActions && (
            <section className="card space-y-3">
              <h2 className="h-sect">{t("detail.manage")}</h2>
              <OwnerActions requestId={req.id} status={req.status} stage={req.stage} />
            </section>
          )}

          {/* ยกเลิกสิ่งที่อนุมัติไปแล้วเป็นคนละเรื่องกับปุ่มของเจ้าของ — แยกการ์ดไว้ให้ชัด */}
          {user.role === "ADMIN" && req.status === "APPROVED" && (
            <section className="card space-y-3">
              <h2 className="h-sect">{t("void.title")}</h2>
              <VoidApproved requestId={req.id} />
            </section>
          )}

          <section className="card space-y-3">
            <h2 className="h-sect">{t("detail.history")}</h2>
            {/* เอกสารที่เดินหลายขั้นมีประวัติยาวมาก — โชว์ล่าสุดไว้ ที่เหลือพับเก็บ */}
            <ul className="space-y-3.5 text-sm">
              {log.slice(0, HISTORY_PREVIEW).map((l, i, arr) => (
                <AuditRow key={l.id} entry={l} prev={log[i - 1]}
                          last={i === arr.length - 1 && log.length <= HISTORY_PREVIEW}
                          t={t} locale={locale} />
              ))}
            </ul>
            {log.length > HISTORY_PREVIEW && (
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-primary-text hover:underline">
                  {t("detail.historyMore", { n: log.length - HISTORY_PREVIEW })}
                </summary>
                <ul className="mt-3.5 space-y-3.5 text-sm">
                  {log.slice(HISTORY_PREVIEW).map((l, i, arr) => (
                    <AuditRow key={l.id} entry={l} prev={log[HISTORY_PREVIEW + i - 1]}
                              last={i === arr.length - 1} t={t} locale={locale} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
    </PageShell>
  );
}

/** จำนวนรายการประวัติที่โชว์ก่อนพับ — พอเห็นความเคลื่อนไหวล่าสุดโดยไม่ยาวเต็มหน้า */
const HISTORY_PREVIEW = 6;

/**
 * สีจุดของไทม์ไลน์ตามความหมายของการกระทำ
 *
 * ประวัติที่ทุกบรรทัดหน้าตาเหมือนกันหมด ต้องอ่านทีละบรรทัดกว่าจะรู้ว่าใบนี้ผ่านหรือถูกตีกลับ
 * สีทำให้กวาดตาครั้งเดียวก็เห็นจังหวะสำคัญ — เขียวคือผ่าน แดงคือไม่ผ่าน ส้มคือส่งกลับให้แก้
 */
const AUDIT_ACCENT: Record<string, string> = {
  APPROVE: "bg-ok",
  PRELIM_DONE: "bg-ok",
  APPROVED_DONE: "bg-ok",
  REJECT: "bg-no",
  VOID_APPROVED: "bg-no",
  CANCEL: "bg-no",
  SEND_BACK: "bg-orange",
  RECALL: "bg-orange",
  SUBMIT: "bg-primary",
  SUBMIT_FINAL: "bg-primary",
  TRANSFER: "bg-violet",
  ADD_APPROVER: "bg-violet",
};

function AuditRow({
  entry,
  prev,
  last = false,
  t,
  locale,
}: {
  entry: AuditEntry;
  /** รายการก่อนหน้าในไทม์ไลน์ (ใหม่กว่า) — ใช้ตัดสินว่าต้องบอกยอดซ้ำไหม */
  prev?: AuditEntry;
  /** รายการสุดท้าย — เส้นไทม์ไลน์ต้องจบตรงนี้ ไม่ลากต่อลงไปในที่ว่าง */
  last?: boolean;
  t: T;
  locale: Locale;
}) {
  // ยอดเงินบอกเฉพาะตอนที่ "เปลี่ยน" — บอกทุกบรรทัดคือตัวเลขเดิมซ้ำห้ารอบ
  // ซึ่งกลบจังหวะที่ยอดเปลี่ยนจริงจนมองไม่เห็น
  const showAmount = entry.amount !== null && (!prev || prev.amount !== entry.amount);

  return (
    <li className="relative pl-5">
      {/* เส้นไทม์ไลน์ลากผ่านทุกรายการ แล้วหยุดที่รายการสุดท้าย */}
      {!last && (
        <span aria-hidden className="absolute left-[3px] top-4 h-full w-px bg-border" />
      )}
      <span aria-hidden
            className={`absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full ring-2 ring-surface
                        ${AUDIT_ACCENT[entry.action] ?? "bg-border-strong"}`} />

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-medium text-text">{t(`audit.${entry.action}`)}</span>
        {/* บอกวันที่ทุกบรรทัด ไม่ตัดให้เหลือแต่เวลาเมื่อเป็นวันเดียวกัน — ประวัติถูกอ่าน
            แบบกวาดตาหาบรรทัดที่สนใจ ไม่ได้อ่านไล่จากบนลงล่าง บรรทัดที่มีแต่เวลา
            จึงต้องเงยไปหาวันที่จากบรรทัดอื่นเอง */}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
          {formatDateTime(entry.created_at, locale)}
        </span>
      </div>

      <div className="text-xs leading-relaxed text-muted">
        {entry.actor_name ?? t("detail.bySystem")}
        {entry.detail && ` · ${entry.detail}`}
      </div>

      {showAmount && (
        <div className="text-xs tabular-nums text-text-soft">
          {t("audit.amountLine", { amount: money(entry.amount, locale) })}
        </div>
      )}
    </li>
  );
}

