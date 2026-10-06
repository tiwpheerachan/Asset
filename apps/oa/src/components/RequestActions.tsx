"use client";

import { useActionState, useState } from "react";
import {
  addApproverAction,
  cancelAction,
  commentAction,
  decideAction,
  recallAction,
  sendBackAction,
  submitFinalAction,
  submitRequestAction,
  transferAction,
  uploadAction,
  type ActionState,
} from "@/lib/actions";
import { Avatar, FormMessage, SubmitButton } from "@/components/ui";
import { IconClock, IconDownload, IconPaperclip } from "@/components/icons";
import { fileSize, formatDateTime, since } from "@/lib/format";
import { useI18n, useT } from "@/components/I18nProvider";
import type { Attachment, Comment, RequestStatus, Stage, User } from "@/lib/types";

const initial: ActionState = {};

type Panel = "" | "REJECT" | "BACK" | "TRANSFER" | "ADD" | "FILE";

/**
 * แผงพิจารณาของผู้อนุมัติที่ถึงคิว
 * ปุ่มรองทั้งหมด (ส่งกลับ / ถ่ายโอน / เพิ่มผู้อนุมัติ) เปิดฟอร์มย่อยแยกกัน
 * เพื่อให้ทุกการกระทำมีที่ให้ใส่เหตุผลก่อนยืนยันเสมอ
 */
export function DecidePanel({
  requestId,
  stage,
  users,
}: {
  requestId: number;
  stage: Stage;
  users: User[];
}) {
  const t = useT();
  const [decide, decideForm] = useActionState(decideAction, initial);
  const [back, backForm] = useActionState(sendBackAction, initial);
  const [transfer, transferForm] = useActionState(transferAction, initial);
  const [add, addForm] = useActionState(addApproverAction, initial);
  const [panel, setPanel] = useState<Panel>("");
  /** ชื่อไฟล์ที่เลือกไว้ — ช่องเลือกไฟล์ถูกซ่อน จึงต้องบอกเองว่าแนบอะไรไปกับการอนุมัติ */
  const [decideFiles, setDecideFiles] = useState<string[]>([]);

  /**
   * ปุ่มที่กางฟอร์มย่อย
   *
   * แยกน้ำหนักตามผลของการกด — "ไม่อนุมัติ" จบเอกสารทั้งใบและย้อนไม่ได้ ส่วน
   * "แนบไฟล์" ไม่เปลี่ยนอะไรเลย ถ้าทำเป็นปุ่มเทาหน้าตาเหมือนกันหมด คนกวาดสายตา
   * จะแยกไม่ออกว่าอันไหนอันตราย
   */
  const tab = (key: Panel, label: string, danger = false) => {
    const on = panel === key;
    return (
      <button
        type="button"
        onClick={() => setPanel(on ? "" : key)}
        aria-expanded={on}
        className={`btn-ghost h-9 min-h-0 px-3.5 text-[13px] transition
                    ${danger ? "text-no hover:ring-no" : ""}
                    ${on ? "ring-2 ring-primary" : ""}`}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="card space-y-3 p-4 ring-2 ring-amber-300 sm:p-5">
      {/* หัวการ์ดเหลือบรรทัดเดียว — จุดสีเตือนยังนำสายตาเหมือนเดิม แต่คำอธิบายระดับ
          การอนุมัติต่อท้ายในบรรทัดเดียวกัน ไม่ต้องกินอีกบรรทัดเต็ม
          การ์ดนี้คือสิ่งเดียวในหน้าที่ "ต้องลงมือทำ" — ยิ่งเตี้ย ปุ่มยิ่งอยู่ใกล้มือ */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wait/15 text-wait">
          <IconClock className="h-4 w-4" />
        </span>
        <h2 className="h-sect">{t("decide.title")}</h2>
      </div>

      <FormMessage state={decide} />
      <FormMessage state={back} />
      <FormMessage state={transfer} />
      <FormMessage state={add} />

      {/* อนุมัติ: ความเห็นไม่บังคับ จึงอยู่ในฟอร์มหลักเลย */}
      <form id={`approve-${requestId}`} action={decideForm}>
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="decision" value="APPROVE" />
        {/* ป้ายช่องความเห็นไม่ต้องมีบรรทัดของตัวเอง — ข้อความจาง ๆ ในช่องบอกอยู่แล้ว
            ว่าพิมพ์อะไรลงไป และมันไม่บังคับกรอก */}
        <label className="sr-only" htmlFor="approve_comment">
          {t("decide.comment")} ({t("common.optional")})
        </label>
        <textarea
          id="approve_comment"
          name="comment"
          rows={2}
          className="input py-2 text-sm"
          placeholder={t("decide.commentHint")}
        />
      </form>

      {/* จอกว้าง: ทุกทางเลือกอยู่แถวเดียวกัน เพราะเป็นทางเลือกระดับเดียวกัน
          คนที่ถึงคิวต้องเลือกหนึ่งอย่างจากทั้งหมดนี้ การแยกปุ่มอนุมัติออกไปจะอ่านเหมือน
          ว่าอีกสี่ปุ่มเป็นของเสริม

          จอแคบ: แยกปุ่มอนุมัติขึ้นมาเต็มความกว้าง เพราะหกปุ่มในแถวเดียวบนจอ 390px
          ตกเป็นสองแถวไม่เท่ากัน อ่านไม่ออกว่าอะไรคู่กับอะไร และปุ่มที่ใช้บ่อยที่สุด
          ก็เล็กเท่าปุ่มที่นาน ๆ ใช้ที — บนมือถือคนกดด้วยนิ้วโป้ง เป้าใหญ่สำคัญกว่า
          ความสมมาตร

          ปุ่มอนุมัติอยู่นอกฟอร์มแต่ยังสั่งส่งได้ด้วยแอตทริบิวต์ form ของ HTML */}
      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="submit"
          form={`approve-${requestId}`}
          className="btn-success h-11 min-h-0 w-full text-sm sm:h-9 sm:w-auto sm:px-4 sm:text-[13px]"
          onClick={(e) => {
            if (!window.confirm(t("decide.confirmApprove"))) e.preventDefault();
          }}
        >
          {t("decide.approve")}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {tab("REJECT", t("decide.reject"), true)}
          {tab("BACK", t("decide.sendBack"))}
          {tab("TRANSFER", t("decide.transfer"))}
          {tab("ADD", t("decide.addApprover"))}

          {/* แนบไฟล์ไม่ใช่การตัดสินใจ — คั่นไว้ไม่ให้อ่านเป็นทางเลือกที่หกของการอนุมัติ */}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
          {/* คนอนุมัติมักต้องแนบหลักฐานประกอบการตัดสินใจ (ใบเสนอราคาที่คุยกันใหม่ อีเมล
              ยืนยันจากลูกค้า) ตัวแนบไฟล์อยู่ล่างสุดของหน้า ต้องเลื่อนผ่านรายละเอียด
              ทั้งใบไปหา แล้วเลื่อนกลับขึ้นมากดอนุมัติ — เอามาไว้ตรงที่กำลังตัดสินใจ */}
          {tab("FILE", t("decide.attach"))}
        </div>
      </div>

      {/* ช่องไฟล์อยู่นอก <form> แต่ผูกกับฟอร์มอนุมัติด้วยแอตทริบิวต์ form ของ HTML —
          เลือกไฟล์แล้วกด "อนุมัติ" ได้เลยในจังหวะเดียว ไม่ต้องแนบก่อนแล้วค่อยอนุมัติ
          ซึ่งเป็นสองจังหวะที่คนลืมทำจังหวะที่สองบ่อย */}
      {panel === "FILE" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <label className="btn-ghost h-9 min-h-0 cursor-pointer gap-1.5 px-3.5 text-[13px]">
            <IconPaperclip className="h-4 w-4" />
            {t("detail.pickFiles")}
            <input
              type="file"
              name="files"
              multiple
              form={`approve-${requestId}`}
              className="sr-only"
              onChange={(e) => setDecideFiles([...(e.target.files ?? [])].map((f) => f.name))}
            />
          </label>
          {decideFiles.length > 0 ? (
            <span className="min-w-0 truncate text-xs text-text-soft">{decideFiles.join(", ")}</span>
          ) : (
            <span className="text-xs text-muted">{t("decide.attachHint")}</span>
          )}
        </div>
      )}

      {panel === "REJECT" && (
        <form action={decideForm} className="tone-rose space-y-2 rounded-xl p-3">
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="decision" value="REJECT" />
          <p className="text-sm">{t("decide.rejectWarn")}</p>
          <textarea name="comment" rows={2} required className="input"
                    placeholder={t("decide.rejectReason")} />
          <SubmitButton className="btn-danger" pendingText={t("common.saving")}
                        onClickConfirm={t("decide.confirmReject")}>
            {t("decide.rejectConfirmBtn")}
          </SubmitButton>
        </form>
      )}

      {panel === "BACK" && (
        <form action={backForm} className="tone-orange space-y-2 rounded-xl p-3">
          <input type="hidden" name="request_id" value={requestId} />
          <p className="text-sm">{t("decide.sendBackNote")}</p>
          <textarea name="comment" rows={2} required className="input"
                    placeholder={t("decide.sendBackReason")} />
          <SubmitButton className="btn-primary" pendingText={t("decide.sendingBack")}>
            {t("decide.sendBackBtn")}
          </SubmitButton>
        </form>
      )}

      {panel === "TRANSFER" && (
        <form action={transferForm} className="space-y-2 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
          <input type="hidden" name="request_id" value={requestId} />
          <p className="text-sm text-text-soft">{t("decide.transferNote")}</p>
          <select name="to_user" required className="input">
            <option value="">{t("decide.transferPick")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.position ? ` — ${u.position}` : ""}
              </option>
            ))}
          </select>
          <input name="comment" className="input" placeholder={t("decide.transferReason")} />
          <SubmitButton className="btn-primary" pendingText={t("decide.transferring")}>
            {t("decide.transferBtn")}
          </SubmitButton>
        </form>
      )}

      {panel === "ADD" && (
        <form action={addForm} className="space-y-2 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
          <input type="hidden" name="request_id" value={requestId} />
          <p className="text-sm text-text-soft">{t("decide.addNote")}</p>
          <select name="to_user" required className="input">
            <option value="">{t("decide.addPick")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.position ? ` — ${u.position}` : ""}
              </option>
            ))}
          </select>
          <select name="position" className="input" defaultValue="AFTER">
            <option value="AFTER">{t("decide.addAfter")}</option>
            <option value="BEFORE">{t("decide.addBefore")}</option>
          </select>
          <SubmitButton className="btn-primary" pendingText={t("decide.adding")}>
            {t("decide.addBtn")}
          </SubmitButton>
        </form>
      )}
    </section>
  );
}

/** ยื่นขออนุมัติจริงหลังผ่านเบื้องต้น — ต้องยืนยันมูลค่าจริงเพราะเป็นตัวกำหนดสายอนุมัติ */
export function FinalRequestPanel({
  requestId,
  amount,
}: {
  requestId: number;
  amount: number | null;
}) {
  const t = useT();
  const [state, action] = useActionState(submitFinalAction, initial);
  return (
    <form action={action} className="card space-y-3 ring-2 ring-sky-300">
      <div>
        <h2 className="h-sect">{t("final.title")}</h2>
        <p className="text-sm text-muted">
          {t("final.hint")}
        </p>
      </div>
      <input type="hidden" name="request_id" value={requestId} />
      <FormMessage state={state} />
      <div className="max-w-xs">
        <label className="label" htmlFor="final_amount">{t("final.amount")}</label>
        <input id="final_amount" name="amount" inputMode="decimal" className="input"
               defaultValue={amount ?? ""} placeholder={t("final.amountPlaceholder")} />
      </div>
      <SubmitButton className="btn-primary" pendingText={t("final.submitting")}
                    onClickConfirm={t("final.confirm")}>
        {t("final.submit")}
      </SubmitButton>
    </form>
  );
}

export function OwnerActions({
  requestId,
  status,
  stage,
}: {
  requestId: number;
  status: RequestStatus;
  stage: Stage;
}) {
  const t = useT();
  const [submitState, submit] = useActionState(submitRequestAction, initial);
  const [recallState, recall] = useActionState(recallAction, initial);
  const [cancelState, cancel] = useActionState(cancelAction, initial);

  return (
    <div className="space-y-2">
      <FormMessage state={submitState} />
      <FormMessage state={recallState} />
      <FormMessage state={cancelState} />

      <div className="flex flex-wrap gap-2">
        {(status === "DRAFT" || status === "RETURNED") && (
          <form action={submit}>
            <input type="hidden" name="request_id" value={requestId} />
            <SubmitButton className="btn-primary" pendingText={t("common.sending")}
                          onClickConfirm={t("form.confirmSubmit")}>
              {status === "RETURNED" ? t("owner.submitAgain") : t("form.submit")}
            </SubmitButton>
          </form>
        )}

        {status === "PENDING" && (
          <form action={recall}>
            <input type="hidden" name="request_id" value={requestId} />
            <SubmitButton
              className="btn-ghost"
              pendingText={t("owner.recalling")}
              onClickConfirm={
                stage === "FINAL" ? t("owner.confirmRecallFinal") : t("owner.confirmRecall")
              }
            >
              {t("owner.recall")}
            </SubmitButton>
          </form>
        )}

        {status !== "APPROVED" && status !== "CANCELLED" && (
          <form action={cancel}>
            <input type="hidden" name="request_id" value={requestId} />
            <SubmitButton className="btn-ghost text-no" pendingText={t("owner.cancelling")}
                          onClickConfirm={t("owner.confirmCancel")}>
              {t("owner.cancel")}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

/** ชนิดที่เปิดดูในเบราว์เซอร์ได้ — ตรงกับที่ /api/files ยอมส่งแบบ inline */
const COMMENT_IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * ไฟล์ที่แนบมากับความคิดเห็น
 *
 * เขียนซ้ำกับ FileDownload แทนที่จะใช้ร่วมกัน เพราะกล่องนี้เป็น client component
 * ส่วน FileDownload เรียก getT ฝั่งเซิร์ฟเวอร์ — นำเข้ากันตรง ๆ ไม่ได้
 */
function CommentFiles({ files, label }: { files: Attachment[]; label: string }) {
  if (files.length === 0) return null;
  const images = files.filter((f) => COMMENT_IMAGE.has(f.mime));
  const others = files.filter((f) => !COMMENT_IMAGE.has(f.mime));
  const dl = (f: Attachment, className: string) => (
    <a
      href={`/api/files/${f.id}?download=1`}
      download={f.filename}
      title={label}
      aria-label={`${label} — ${f.filename}`}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-primary-text ${className}`}
    >
      <IconDownload className="h-4 w-4" />
    </a>
  );

  return (
    <div className="mt-2 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <div key={f.id} className="relative">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={f.filename}
                 className="block overflow-hidden rounded-xl ring-1 ring-border transition hover:ring-primary">
                {/* ไฟล์อยู่หลัง route ที่ตรวจสิทธิ์ จึงใช้ img ธรรมดาแทน next/image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${f.id}`} alt={f.filename}
                     className="h-24 w-32 bg-surface-2 object-cover" />
              </a>
              {dl(f, "absolute right-1 top-1 bg-surface/90 text-text-soft ring-1 ring-border backdrop-blur-sm hover:bg-surface")}
            </div>
          ))}
        </div>
      )}
      {others.map((f) => (
        <div key={f.id}
             className="flex max-w-sm items-center gap-2 rounded-xl bg-surface-2 py-1 pl-2.5 pr-1 ring-1 ring-border">
          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"
             className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 transition hover:text-primary">
            <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-primary-text" title={f.filename}>
              {f.filename}
            </span>
          </a>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">{fileSize(f.size)}</span>
          {dl(f, "")}
        </div>
      ))}
    </div>
  );
}

export function CommentBox({
  requestId,
  comments,
}: {
  requestId: number;
  comments: Comment[];
}) {
  const { t, locale } = useI18n();
  const [state, action] = useActionState(commentAction, initial);
  const [picked, setPicked] = useState<{ name: string; size: number }[]>([]);

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted">{t("detail.noComments")}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author_name} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-text">{c.author_name}</span>
                  <span className="text-xs text-muted">
                    {since(c.created_at, t)} · {formatDateTime(c.created_at, locale)}
                  </span>
                </div>
                {c.body && <p className="whitespace-pre-wrap text-text-soft">{c.body}</p>}
                <CommentFiles files={c.files ?? []} label={t("file.download")} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-2 border-t border-border pt-3">
        <input type="hidden" name="request_id" value={requestId} />
        <FormMessage state={state} />
        <textarea name="body" rows={2} className="input" placeholder={t("detail.commentPlaceholder")} />

        {/* ไฟล์ที่เลือกไว้อยู่ใต้กล่องข้อความ ไม่ใช่แทรกระหว่างปุ่ม — ตรงนี้คือ "สิ่งที่กำลัง
            จะถูกส่ง" เหมือนกับข้อความที่พิมพ์ไว้ ส่วนแถวล่างเป็นปุ่มสั่งการล้วน ๆ
            ชื่อไฟล์ยาว ๆ จึงไม่ไปบีบปุ่มส่งให้แคบลงด้วย */}
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((f) => (
              <span key={f.name}
                    className="flex max-w-full items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs ring-1 ring-border">
                <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="min-w-0 truncate text-text-soft" title={f.name}>{f.name}</span>
                <span className="shrink-0 tabular-nums text-muted">{fileSize(f.size)}</span>
              </span>
            ))}
          </div>
        )}

        {/* ปุ่มแนบอยู่ในฟอร์มเดียวกับข้อความ — ไฟล์กับคำอธิบายของมันควรไปพร้อมกัน
            ถ้าแยกเป็นสองฟอร์ม คนจะกดส่งข้อความแล้วลืมกดอัปโหลด */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-ghost h-9 min-h-0 cursor-pointer gap-1.5 px-3 text-[13px]">
            <IconPaperclip className="h-4 w-4" />
            {t("detail.pickFiles")}
            <input type="file" name="files" multiple className="sr-only"
                   onChange={(e) =>
                     setPicked([...(e.target.files ?? [])].map((f) => ({ name: f.name, size: f.size })))
                   } />
          </label>
          <SubmitButton className="btn-ghost text-sm" pendingText={t("common.sending")}>
            {t("detail.sendComment")}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function UploadForm({ requestId }: { requestId: number }) {
  const t = useT();
  const [state, action] = useActionState(uploadAction, initial);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="field_key" value="" />
      <FormMessage state={state} />
      {/* ช่องเลือกไฟล์มาตรฐานของเบราว์เซอร์กินที่ไปกับคำว่า "ไม่ได้เลือกไฟล์ใด"
          ที่ไม่ได้บอกอะไร — ซ่อนไว้แล้วใช้ปุ่มแทน พร้อมโชว์ชื่อไฟล์ที่เลือก */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost h-10 min-h-0 cursor-pointer gap-1.5 px-4 text-[13px]">
          <IconPaperclip className="h-4 w-4" />
          {t("detail.pickFiles")}
          <input type="file" name="files" multiple className="sr-only"
                 onChange={(e) => setPicked([...(e.target.files ?? [])].map((f) => f.name))} />
        </label>
        {picked.length > 0 && (
          <span className="min-w-0 truncate text-xs text-text-soft">{picked.join(", ")}</span>
        )}
        <SubmitButton className="btn-primary h-10 min-h-0 px-4 text-[13px]"
                      pendingText={t("detail.uploading")}>
          {t("detail.uploadMore")}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">{t("form.maxFile")}</p>
    </form>
  );
}
