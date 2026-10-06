"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import type { FlowStep } from "@/lib/flow";
import { useT } from "@/components/I18nProvider";
import type { JobRole } from "@/lib/types";

/** จุดบนเส้น — ขั้นแรกที่จะถึงเป็นจุดทึบ, ขั้นถัดไปเป็นวงว่าง, CC เป็นจุดข้อมูล */
function Marker({ kind, current }: { kind: string; current: boolean }) {
  if (kind === "CC") {
    return (
      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface text-[11px] text-info ring-2 ring-info">
        ✉
      </span>
    );
  }
  if (current) {
    return (
      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface ring-2 ring-primary">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
    );
  }
  return <span className="relative z-10 h-[22px] w-[22px] shrink-0 rounded-full bg-surface ring-2 ring-border-strong" />;
}

function MemberPhoto({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
  ) : <Avatar name={name} size={36} />;
}

/** ตัวอย่างสายอนุมัติก่อนส่ง — คำนวณด้วยฟังก์ชันเดียวกับที่ server ใช้จริง */
export default function FlowPreview({
  steps,
  avatars = {},
  missing,
  prelim,
  heading,
}: {
  steps: FlowStep[];
  avatars?: Record<number, string>;
  missing: JobRole[];
  prelim: boolean;
  heading?: string;
}) {
  const t = useT();
  const approveSteps = steps.filter((s) => s.kind === "APPROVE");
  const firstApprove = steps.findIndex((s) => s.kind === "APPROVE");

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h-sect">{heading ?? t("flow.preview.title")}</h2>
        <p className="text-sm text-muted">
          {t("flow.preview.hint")}
          {prelim && ` · ${t("flow.preview.prelimHint")}`}
        </p>
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl tone-amber px-3 py-2 text-sm ring-1">
          {t("flow.preview.missingRoles", {
            roles: missing.map((r) => t(`jobRole.${r}`)).join(", "),
          })}
        </div>
      )}

      {approveSteps.length === 0 ? (
        <div className="rounded-xl tone-amber px-3 py-2 text-sm ring-1">
          {t("flow.preview.noSteps")}
        </div>
      ) : (
        <ol className="pl-0.5">
          {steps.map((s, i) => {
            const joiner = s.mode === "ANY" ? t("timeline.or") : t("timeline.and");
            return (
              <li key={`${s.stage}-${s.step_no}-${s.kind}`} className="relative flex gap-3.5 pb-7">
                <span aria-hidden className="absolute bottom-0 left-[10px] top-6 w-0.5 rounded-full bg-border" />
                <Marker kind={s.kind} current={i === firstApprove} />
                <div className="-mt-0.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold text-text">
                      {s.name}
                      {s.kind === "APPROVE" && s.members.length > 1 && (
                        <span className="ml-1.5 text-xs font-normal text-muted">({t(`nodeMode.${s.mode}`)})</span>
                      )}
                    </span>
                    {s.kind === "APPROVE" && (
                      <span className="text-xs italic text-muted">{t("timeline.pending")}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-text-soft">
                    {s.kind === "CC" ? t("timeline.ccTo") : t("timeline.requiresFrom")}{" "}
                    <div className="w-full space-y-2 pt-2">
                      {s.members.map((member, index) => (
                        <div key={member.user_id}>
                          {index > 0 && <p className="mb-2 text-xs text-muted">{joiner}</p>}
                          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
                            <MemberPhoto name={member.name} src={avatars[member.user_id] || member.avatar} />
                            <span className="min-w-0 break-words text-sm font-medium text-text">{member.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}

          {/* ปลายทางของสาย — บอกว่าอนุมัติครบแล้วจบตรงนี้
              และทำให้เส้นลากลงมาจนสุดเสมอ แม้ฟอร์มจะมีขั้นเดียว
              ซึ่งเดิมจะไม่มีเส้นเลยจนดูเหมือนสายยังไม่สมบูรณ์ */}
          <li className="relative flex gap-3.5">
            <span
              aria-hidden
              className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center
                         rounded-full bg-ok/15 text-[12px] text-ok ring-2 ring-ok"
            >
              ✓
            </span>
            <div className="-mt-0.5 text-sm font-medium text-text-soft">
              {t("flow.preview.done")}
            </div>
          </li>
        </ol>
      )}
    </section>
  );
}
