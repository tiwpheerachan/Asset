"use client";

import { useActionState } from "react";
import { migrateFilesAction } from "@/lib/actions";
import { useT } from "@/components/I18nProvider";
import type { ActionState } from "@/lib/actions";

/**
 * ปุ่มย้ายไฟล์ที่ค้างบนดิสก์ขึ้นที่เก็บใหม่
 *
 * มีปุ่มนี้เพราะไฟล์จริงอยู่บนดิสก์ของเซิร์ฟเวอร์ เครื่องอื่นเข้าไม่ถึง — เดิมต้องเปิด
 * shell ของผู้ให้บริการแล้วพิมพ์คำสั่ง ซึ่งเป็นขั้นตอนที่คนไม่ได้ทำทุกวันแล้วต้องมาไล่หา
 */
export default function MoveFilesButton({ pending: left }: { pending: number }) {
  const t = useT();
  const [state, action, running] = useActionState<ActionState>(migrateFilesAction, {});

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={running}>
          {running ? t("backup.moving") : t("backup.moveFiles")}
        </button>
        {left > 0 && (
          <span className="text-sm text-wait">
            {t("backup.pendingFiles", { n: String(left) })}
          </span>
        )}
        {left === 0 && !state.ok && !state.error && (
          <span className="text-sm text-ok">{t("backup.filesMoved")}</span>
        )}
      </div>
      {state.ok && <p className="text-sm text-ok">{state.ok}</p>}
      {state.error && <p className="text-sm text-no">{state.error}</p>}
    </form>
  );
}
