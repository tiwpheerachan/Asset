import { requireAdmin } from "@/lib/auth";
import { backupStatus } from "@/lib/backup";
import { getLocale, getT } from "@/lib/i18n/server";
import { PageShell, PageTitle, SectionCard, EmptyState } from "@/components/layout-bits";
import { fileSize, formatDateTime } from "@/lib/format";
import { IconAlert, IconDownload } from "@/components/icons";
import RunBackupButton from "./RunBackupButton";
import MoveFilesButton from "./MoveFilesButton";
import { pendingFileCount } from "@/lib/migrate-files";

export const dynamic = "force-dynamic";

/**
 * หน้าสำรองข้อมูล — ตอบสามคำถามเท่านั้น
 *
 * ที่มา: หน้าเดิมถูกเอาออกเพราะเป็นหน้าตั้งค่ายาว ๆ ที่ไม่มีใครเปิด ผลข้างเคียงคือ
 * ตัวสำรองยังทำงานอยู่เบื้องหลังแต่ไม่มีใครรู้ว่ามันสำเร็จหรือพังมาแล้วกี่สัปดาห์ —
 * การสำรองที่ไม่มีใครตรวจ เท่ากับไม่รู้ว่ามีของให้กู้จริงไหม จนถึงวันที่ต้องใช้
 *
 * รอบนี้เหลือเท่าที่จำเป็น: มีของให้กู้ไหม · เอาออกมาเก็บนอกเครื่องยังไง ·
 * กดสำรองเดี๋ยวนี้ก่อนทำอะไรเสี่ยง ๆ · ส่วนค่าตั้งกับวิธีกู้คืนพับเก็บไว้ข้างล่าง
 */
export default async function BackupPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const st = await backupStatus();
  // ไฟล์แนบเก็บคนละที่กับฐานข้อมูล — ผู้ดูแลต้องเห็นว่าย้ายครบหรือยัง
  const pendingFiles = await pendingFileCount();

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("backup.title")} subtitle={t("backup.subtitle")} />

        {/* สถานะล่าสุดเป็นบรรทัดเดียว ไม่ใช่การ์ดสามใบ — คำถามคือ "มีของให้กู้ไหม"
            ไม่ใช่ตัวเลขสามตัวที่ต้องอ่านมาประกอบกันเอง */}
        <div
          className={`card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${
            st.overdue ? "accent-amber" : "accent-emerald"
          } accent-rail relative overflow-hidden pl-6`}
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{t("backup.lastSuccess")}</div>
            <div className="text-lg font-semibold" style={{ color: "var(--a-text)" }}>
              {st.lastOk ? formatDateTime(st.lastOk.created_at, locale) : t("backup.never")}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {t("backup.copies")}: {st.snapshots.length} · {t("backup.totalSize")}:{" "}
              {fileSize(st.totalSize)} · {t("backup.keepDays")}: {st.retentionDays}
            </div>
          </div>
          <RunBackupButton />
        </div>

        {/* ที่เก็บไฟล์แนบ — แยกการ์ดต่างหากเพราะเป็นคนละเรื่องกับสำเนาฐานข้อมูล
            ฐานข้อมูลมีสำเนาอัตโนมัติแล้ว แต่ไฟล์แนบอยู่คนละที่และต้องย้ายเอง */}
        {st.filesOffBox && (
          <div className="card space-y-3 p-4">
            <div>
              <div className="text-xs text-muted">{t("backup.storage")}</div>
              <div className="break-all text-sm font-medium">{st.storage}</div>
            </div>
            <MoveFilesButton pending={pendingFiles} />
          </div>
        )}

        {st.unsafeDir && (
          <div className="flex items-start gap-2 rounded-xl tone-amber px-4 py-3 text-sm ring-1">
            <IconAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <span>{t("backup.unsafeDir")}</span>
          </div>
        )}

        <SectionCard title={t("backup.files")} hint={t("backup.filesHint")}>
          {st.snapshots.length === 0 ? (
            <EmptyState>{t("backup.none")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {st.snapshots.map((s) => (
                <li key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-text">{s.name}</div>
                    <div className="text-xs text-muted">
                      {formatDateTime(s.at, locale)} · {fileSize(s.size)}
                    </div>
                  </div>
                  {/* ดาวน์โหลดคือสิ่งเดียวที่ทำให้สำเนามีค่าจริง — ตราบใดที่ไฟล์ยังอยู่
                      ดิสก์เดียวกับต้นฉบับ มันกันได้แค่ไฟล์พังกับลบผิด ไม่ใช่ดิสก์เสีย */}
                  <a className="btn-ghost h-9 min-h-0 shrink-0 gap-1.5 px-3.5 text-[13px]"
                     href={`/api/backup/download?name=${encodeURIComponent(s.name)}`}>
                    <IconDownload className="h-4 w-4" />
                    {t("backup.download")}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <details className="card group">
          <summary className="h-card cursor-pointer list-none">
            {t("backup.history")}
            <span className="ml-2 text-xs font-normal text-muted">({st.history.length})</span>
          </summary>
          <ul className="mt-3 divide-y divide-border text-sm">
            {st.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className={`badge ${h.ok ? "tone-emerald" : "tone-rose"}`}>
                  {h.ok ? t("backup.ok") : t("backup.failed")}
                </span>
                <span className="text-muted">{formatDateTime(h.created_at, locale)}</span>
                <span className="badge tone-neutral">{t(`backup.trigger.${h.trigger}`)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {h.ok
                    ? `${h.filename} · ${fileSize(h.size)} · ${(h.duration_ms / 1000).toFixed(1)}s`
                    : h.error}
                </span>
              </li>
            ))}
            {st.history.length === 0 && (
              <li className="py-2 text-sm text-muted">{t("backup.noHistory")}</li>
            )}
          </ul>
        </details>

        <details className="card group">
          <summary className="h-card cursor-pointer list-none">{t("backup.restore")}</summary>
          <p className="mt-2 text-xs text-muted">{t("backup.restoreHint")}</p>
          <ol className="ml-4 mt-3 list-decimal space-y-1.5 text-sm text-muted">
            <li>{t("backup.restore1")}</li>
            <li>{t("backup.restore2")}</li>
            <li>{t("backup.restore3")}</li>
            <li>{t("backup.restore4")}</li>
          </ol>
          <ul className="mt-4 divide-y divide-border border-t border-border pt-3 text-sm">
            <Row name="BACKUP_DIR" value={st.dir} />
            <Row name="BACKUP_AUTO" value={st.auto ? t("backup.on") : t("backup.off")} />
            <Row name="BACKUP_INTERVAL_HOURS" value={String(st.intervalHours)} />
            <Row name="BACKUP_RETENTION_DAYS" value={String(st.retentionDays)} />
          </ul>
        </details>
      </div>
    </PageShell>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{name}</code>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{value}</span>
    </li>
  );
}
