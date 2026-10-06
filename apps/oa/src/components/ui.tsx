"use client";

import TemplateGlyph from "@/components/TemplateGlyph";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { RequestStatus, Stage } from "@/lib/types";

/** โทนสีของแต่ละสถานะ — ชื่อคลาสมาจาก globals.css เพื่อให้โหมดมืดอ่านง่ายด้วย */
const STATUS_TONE: Record<RequestStatus, string> = {
  DRAFT: "tone-neutral",
  PENDING: "tone-amber",
  PRELIM_APPROVED: "tone-sky",
  APPROVED: "tone-emerald",
  REJECTED: "tone-rose",
  RETURNED: "tone-orange",
  CANCELLED: "tone-neutral",
};

export function SubmitButton({
  children,
  className = "btn-primary",
  name,
  value,
  pendingText,
  onClickConfirm,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  pendingText?: string;
  onClickConfirm?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={className}
      onClick={(e) => {
        if (onClickConfirm && !window.confirm(onClickConfirm)) e.preventDefault();
      }}
    >
      {pending ? (pendingText ?? t("common.saving")) : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.error && !state?.ok) return null;
  const error = Boolean(state.error);
  return (
    <div
      // ข้อความสำเร็จรอให้ผู้ใช้ว่างก่อนค่อยอ่าน แต่ข้อความผิดพลาดต้องแทรกทันที
      // เพราะคนที่ใช้โปรแกรมอ่านหน้าจอมักกดต่อไปแล้วโดยไม่รู้ว่าเมื่อกี้ไม่สำเร็จ
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      className={`rounded-xl px-3 py-2 text-sm ring-1 ${error ? "tone-rose" : "tone-emerald"}`}
    >
      {state.error ?? state.ok}
    </div>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const t = useT();
  return (
    <span className={`badge badge-dot ${STATUS_TONE[status]}`}>{t(`status.${status}`)}</span>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const t = useT();
  return (
    <span className={`badge ${stage === "PRELIM" ? "tone-sky" : "tone-violet"}`}>
      {t(`stage.${stage}`)}
    </span>
  );
}

export function TemplateBadge({ icon, name }: { icon: string; name: string }) {
  return (
    <span className="badge tone-neutral">
      <TemplateGlyph icon={icon} size={14} className="mr-1" />
      {name}
    </span>
  );
}

/** วงกลมตัวอักษรแทนรูปโปรไฟล์ */
export function Avatar({
  name,
  size = 28,
  src,
}: {
  name: string;
  size?: number;
  /** รูปโปรไฟล์จากระบบกลาง — ไม่มีก็ตกไปใช้วงกลมตัวอักษร */
  src?: string | null;
}) {
  const initial = name.trim().charAt(0) || "?";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        // รูปมาจากโดเมนของระบบกลาง — ไม่ส่ง referrer ออกไป และถ้าโหลดไม่ได้
        // ให้ซ่อนตัวเองแทนที่จะโชว์ไอคอนรูปแตก
        referrerPolicy="no-referrer"
        loading="lazy"
        className="inline-block shrink-0 rounded-full object-cover ring-1 ring-border"
        style={{ width: size, height: size }}
      />
    );
  }

  // โทน navy อ่อนเดียวกันทุกคน (เข้าชุด Fixed Asset) ไม่ใช่สีสุ่มตามชื่อ
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: "var(--c-primary-soft)",
        color: "var(--c-primary-text)",
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
