import { Avatar } from "@/components/ui";
import { fileSize, formatDateTime, waitingDays } from "@/lib/format";
import FileDownload from "@/components/FileDownload";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Attachment, ApproverStatus, RequestApprover, RequestWithMeta } from "@/lib/types";

/**
 * ไฟล์นี้แสดงเป็นรูปได้ไหม
 *
 * ยึดรายชื่อเดียวกับที่ /api/files ยอมส่งแบบ inline — ชนิดอื่น (เช่น SVG)
 * ถูกบังคับให้ดาวน์โหลด การเอามาใส่ img จึงได้แค่รูปแตก
 */
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const isImage = (f: Attachment) => IMAGE_MIME.has(f.mime);

/** คลิปหนีบกระดาษ — บอกว่าชิ้นนี้คือไฟล์แนบ ไม่ใช่ลิงก์ธรรมดา */
function PaperclipIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

type NodeState = "sent" | "done" | "current" | "future" | "rejected";

type Step = {
  key: string;
  stage: string;
  step_no: number;
  name: string;
  kind: string;
  mode: string;
  rows: RequestApprover[];
};

function groupSteps(approvers: RequestApprover[]): Step[] {
  const map = new Map<string, Step>();
  for (const a of approvers) {
    const key = `${a.stage}-${a.step_no}`;
    const hit = map.get(key);
    if (hit) hit.rows.push(a);
    else {
      map.set(key, {
        key, stage: a.stage, step_no: a.step_no,
        name: a.node_name, kind: a.kind, mode: a.mode, rows: [a],
      });
    }
  }
  return [...map.values()];
}

/** จุดบนเส้น timeline — ตามสถานะของขั้น */
function Marker({ state }: { state: NodeState }) {
  if (state === "done") {
    return (
      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ok text-white shadow-e1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "rejected") {
    return (
      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-no text-[13px] font-bold text-white shadow-e1">
        ✕
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface ring-2 ring-primary">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
    );
  }
  if (state === "sent") {
    return <span className="relative z-10 h-[22px] w-[22px] shrink-0 rounded-full bg-primary ring-4 ring-primary-soft" />;
  }
  return <span className="relative z-10 h-[22px] w-[22px] shrink-0 rounded-full bg-surface ring-2 ring-border-strong" />;
}

/**
 * ชิปชื่อคน — รูปโปรไฟล์ + ชื่อ
 *
 * ใส่รูปเพราะบันทึกการอนุมัติคือที่ที่คนมาดูว่า "ใครอนุมัติ" — ชื่อไทยหลายคน
 * คล้ายกันมากและชื่อจีนอ่านไม่ออกสำหรับคนไทย รูปจึงจำได้เร็วกว่าตัวอักษร
 * ไม่มีรูปก็ตกไปใช้วงกลมตัวอักษรสีประจำชื่อ ซึ่งยังแยกคนออกจากกันได้อยู่
 */
function NameChip({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-primary-soft py-0.5 pl-0.5 pr-2 text-[13px] font-medium text-primary-text">
      <Avatar name={name} src={avatar} size={20} />
      <span className="truncate">{name}</span>
    </span>
  );
}

type Person = { name: string; avatar?: string | null };

/** ต่อชิปหลายอันด้วยคำเชื่อม (หรือ/และ) */
function ChipList({ people, joiner }: { people: Person[]; joiner: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {people.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted">{joiner}</span>}
          <NameChip name={p.name} avatar={p.avatar} />
        </span>
      ))}
    </span>
  );
}

/** บันทึกการอนุมัติ — เส้น timeline แนวตั้ง ไล่ทีละขั้นว่าใครทำอะไรเมื่อไหร่ */
export default async function FlowTimeline({
  request,
  approvers,
  files = [],
}: {
  request: RequestWithMeta;
  approvers: RequestApprover[];
  /** ไฟล์ที่ไม่ได้ผูกกับช่องใดช่องหนึ่งของฟอร์ม — คือไฟล์ที่คนแนบเพิ่มระหว่างพิจารณา */
  files?: Attachment[];
}) {
  const t = await getT();
  const locale = await getLocale();
  const steps = groupSteps(approvers);
  if (steps.length === 0) {
    return <p className="text-sm text-muted">{t("detail.noFlow")}</p>;
  }

  /*
   * จับคู่ไฟล์แนบกับขั้นที่คนนั้นพิจารณา
   *
   * ที่มา: ผู้อนุมัติแนบรูปหรือเอกสารประกอบการตัดสินใจได้ แต่ไฟล์ไปกองรวมอยู่ท้ายแท็บ
   * รายละเอียด คนอ่านจึงไม่รู้ว่าไฟล์ไหนมาจากใครและมาพร้อมการตัดสินใจครั้งไหน
   *
   * จับคู่ด้วย "คนที่กดจริง" (acted_by) ไม่ใช่เจ้าของคิว เพราะกรณีอนุมัติแทนช่วงลา
   * คนแนบไฟล์คือคนที่กด ไม่ใช่คนที่ลาอยู่
   *
   * ไฟล์หนึ่งใบผูกกับขั้นเดียวเท่านั้น — คนเดียวอาจอยู่ในสายอนุมัติหลายขั้น
   * ถ้าไม่กันไว้ ไฟล์เดียวจะโผล่ซ้ำทุกขั้นของเขา
   */
  const filesByRow = new Map<number, Attachment[]>();
  const taken = new Set<number>();
  for (const step of steps) {
    for (const a of step.rows) {
      const who = a.acted_by ?? a.user_id;
      const mine = files.filter((f) => f.uploaded_by === who && !taken.has(f.id));
      if (mine.length === 0) continue;
      for (const f of mine) taken.add(f.id);
      filesByRow.set(a.id, mine);
    }
  }

  // สร้างรายการรวม: ส่งคำขอ + แต่ละขั้น พร้อมสถานะจุด
  type Item = {
    key: string;
    state: NodeState;
    title: string;
    right?: React.ReactNode;
    sub?: React.ReactNode;
    details?: React.ReactNode;
  };

  const items: Item[] = [];

  // ขั้นแรก: ผู้จัดทำส่งคำขอ
  items.push({
    key: "submit",
    state: "sent",
    title: t("timeline.submitStep"),
    right: request.submitted_at ? (
      <span className="text-xs text-muted">{formatDateTime(request.submitted_at, locale)}</span>
    ) : undefined,
    sub: (
      <span className="text-sm text-text-soft">
        {t("timeline.submitted")} · <NameChip name={request.requester_name} avatar={request.requester_avatar} />
      </span>
    ),
  });

  for (const s of steps) {
    const active =
      request.status === "PENDING" && s.stage === request.stage && s.step_no === request.current_step;
    const rejected = s.rows.some((r) => r.status === "REJECTED");
    const anyPending = s.rows.some((r) => r.status === "PENDING");
    const state: NodeState = rejected ? "rejected" : !anyPending ? "done" : active ? "current" : "future";

    const isCC = s.kind === "CC";
    const title = isCC ? t("timeline.ccStep") : s.name || t("timeline.approveStep");

    // ข้อความขวา (เวลา / สถานะ)
    const lastActed = s.rows
      .map((r) => r.acted_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    let right: React.ReactNode;
    if (rejected) {
      right = <span className="text-xs font-medium text-no-text">{t("approver.REJECTED")}</span>;
    } else if (state === "done" && lastActed) {
      right = <span className="text-xs text-muted">{formatDateTime(lastActed, locale)}</span>;
    } else if (active) {
      const waited = waitingDays(request.submitted_at);
      right = (
        <span className="text-xs font-medium text-wait-text">
          {t("timeline.pending")}
          {waited > 0 && ` · ${t("timeline.waitingFor", { n: waited })}`}
        </span>
      );
    } else if (state === "future") {
      right = <span className="text-xs italic text-muted">{t("timeline.pending")}</span>;
    }

    // แถวคน (ชิป) + คำนำหน้าตามสถานะ
    const joiner = s.mode === "ANY" ? t("timeline.or") : t("timeline.and");
    let sub: React.ReactNode;
    if (rejected) {
      const who = s.rows.filter((r) => r.status === "REJECTED").map((r) => ({ name: r.acted_by_name || r.name, avatar: r.acted_by_avatar || r.avatar_url }));
      sub = (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-text-soft">
          {t("timeline.rejectedBy")} <ChipList people={who} joiner={joiner} />
        </span>
      );
    } else if (state === "done") {
      const who = s.rows.filter((r) => r.status !== "SKIPPED").map((r) => ({ name: r.acted_by_name || r.name, avatar: r.acted_by_avatar || r.avatar_url }));
      sub = (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-text-soft">
          {isCC ? t("timeline.ccTo") : t("timeline.approvedBy")} <ChipList people={who} joiner={joiner} />
        </span>
      );
    } else {
      const who = s.rows.filter((r) => r.status === "PENDING").map((r) => ({ name: r.name, avatar: r.avatar_url }));
      sub = (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-text-soft">
          {isCC ? t("timeline.ccTo") : t("timeline.requiresFrom")} <ChipList people={who} joiner={joiner} />
        </span>
      );
    }

    // รายละเอียดย่อย: ความคิดเห็น + หมายเหตุพิเศษ + ไฟล์ที่แนบมาพร้อมการตัดสินใจ
    //
    // ด่านนี้ต้องครอบคลุมทุกอย่างที่บรรทัดข้างในมีสิทธิ์แสดง ไม่งั้นบล็อกถูกทิ้งทั้งก้อน
    // เคยตกไฟล์แนบไป ทำให้ขั้นที่ "อนุมัติเฉยๆ พร้อมแนบไฟล์" ไม่โชว์ไฟล์เลย
    const hasDetail = (r: (typeof s.rows)[number]) =>
      Boolean(r.comment || r.from_user_name || r.added_by || (r.acted_by && r.acted_by !== r.user_id)) ||
      (filesByRow.get(r.id)?.length ?? 0) > 0;
    const details = s.rows.some(hasDetail) ? (
      <div className="mt-1.5 space-y-1.5">
        {s.rows.map((a) => {
          const note =
            (a.from_user_name && t("timeline.transferredFrom", { name: a.from_user_name })) ||
            (a.added_by && t("timeline.addedMidway")) ||
            "";
          const actedFor =
            a.acted_by && a.acted_by !== a.user_id && a.acted_by_name
              ? `${t("deleg.actedFor")} — ${a.acted_by_name}`
              : "";
          const myFiles = filesByRow.get(a.id) ?? [];
          if (!a.comment && !note && !actedFor && myFiles.length === 0) return null;
          // ขั้นที่มีคนเดียว ชื่อโผล่อยู่บนป้ายบรรทัดเหนือขึ้นไปแล้ว — ซ้ำอีกรอบเป็นเสียงรบกวน
          const showName = s.rows.length > 1;
          return (
            <div key={a.id} className="text-xs text-muted">
              {(note || actedFor) && (
                <span>
                  {showName && a.name}
                  {note && `${showName ? " · " : ""}${note}`}
                  {actedFor && ` · ${actedFor}`}
                </span>
              )}
              {/* ความเห็นเป็นคำพูดของคน ไม่ใช่ค่าในช่องกรอก — กล่องเทาขอบครบทำให้อ่าน
                  เหมือนช่องที่ถูกปิดใช้งาน ทั้งที่เป็นเนื้อหาสำคัญที่สุดของขั้นนั้น */}
              {a.comment && (
                <p className="mt-1.5 whitespace-pre-line border-l-2 border-border pl-3 text-[13px] leading-relaxed text-text">
                  {a.comment}
                </p>
              )}
              {myFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {/* รูปให้เห็นรูปเลย — ผู้อนุมัติแนบภาพหน้าจอหรือใบเสร็จมาประกอบ
                      การให้กดเปิดทีละไฟล์เพื่อดูว่าคืออะไร ทำให้คนไม่เปิดดูเลย */}
                  {myFiles.some(isImage) && (
                    <div className="flex flex-wrap gap-2">
                      {myFiles.filter(isImage).map((f) => (
                        <div key={f.id} className="relative">
                          <a
                            href={`/api/files/${f.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title={f.filename}
                            className="block overflow-hidden rounded-xl ring-1 ring-border transition hover:ring-primary"
                          >
                            {/* ไฟล์อยู่หลัง route ที่ตรวจสิทธิ์ จึงใช้ img ธรรมดาแทน next/image */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/files/${f.id}`}
                              alt={f.filename}
                              className="h-24 w-32 bg-surface-2 object-cover"
                            />
                          </a>
                          {/* ทับมุมภาพแทนที่จะวางข้างล่าง เพราะภาพเรียงกันหลายใบ
                              ปุ่มที่อยู่นอกกรอบจะดูไม่ออกว่าเป็นของภาพไหน */}
                          <FileDownload
                            id={f.id}
                            filename={f.filename}
                            className="absolute right-1 top-1 bg-surface/90 text-text-soft ring-1 ring-border backdrop-blur-sm hover:bg-surface"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {myFiles.filter((f) => !isImage(f)).map((f) => (
                    <div
                      key={f.id}
                      className="flex max-w-sm items-center gap-2 rounded-xl bg-surface-2 py-1 pl-2.5 pr-1 ring-1 ring-border"
                    >
                      {/* ชื่อไฟล์เปิดดู ปุ่มขวาสุดเก็บลงเครื่อง — สองเจตนาคนละอย่าง
                          จึงเป็นสองลิงก์ ไม่ใช่ลิงก์เดียวซ้อนกัน (HTML ซ้อน <a> ไม่ได้ด้วย) */}
                      <a
                        href={`/api/files/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 transition hover:text-primary"
                      >
                        <PaperclipIcon />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-primary-text" title={f.filename}>
                          {f.filename}
                        </span>
                      </a>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">{fileSize(f.size)}</span>
                      <FileDownload id={f.id} filename={f.filename} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : undefined;

    items.push({ key: s.key, state, title, right, sub, details });
  }

  return (
    <ol className="pl-0.5">
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        return (
          <li key={it.key} className="relative flex gap-3.5 pb-6 last:pb-1">
            {!isLast && (
              <span aria-hidden className="absolute bottom-0 left-[10px] top-6 w-0.5 rounded-full bg-border" />
            )}
            <Marker state={it.state} />
            <div className="-mt-0.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-semibold text-text">{it.title}</span>
                {it.right}
              </div>
              {it.sub && <div className="mt-1">{it.sub}</div>}
              {it.details}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
