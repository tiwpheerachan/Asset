"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { PageShell } from "@/components/layout-bits";
import { IconAlert } from "@/components/icons";

/**
 * หน้าที่พังกลางคัน
 *
 * เดิมไม่มีขอบเขตดักไว้เลย พลาดขึ้นมาทีคนใช้จะเจอหน้าเปล่าของ Next ที่ไม่มีเมนู
 * ไม่มีทางกลับ และไม่บอกว่าเกิดอะไรขึ้น — ทางเดียวคือกดปุ่มย้อนกลับของเบราว์เซอร์
 *
 * ไม่โชว์ stack trace หรือข้อความ error ดิบให้ผู้ใช้ทั่วไป เพราะอ่านไม่รู้เรื่อง
 * และบางทีมีชื่อไฟล์หรือค่าภายในติดมาด้วย · แต่ยังพิมพ์ลง console ให้คนแก้ตามได้
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[app] เรนเดอร์หน้าไม่สำเร็จ", error);
  }, [error]);

  return (
    <PageShell>
      <div className="card mx-auto max-w-lg space-y-4 text-center">
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: "var(--c-no-soft)", color: "var(--c-no-text)" }}
        >
          <IconAlert />
        </span>

        <div>
          <h1 className="h-card">{t("error.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("error.body")}</p>
        </div>

        {/* digest คือรหัสที่ Next ผูกกับ error ตัวนี้ใน log ฝั่งเซิร์ฟเวอร์ —
            ให้ผู้ใช้บอกต่อได้ว่า "เจออันนี้" โดยไม่ต้องเปิดเผยรายละเอียดภายใน */}
        {error.digest && (
          <p className="font-mono text-xs text-muted">{t("error.ref", { id: error.digest })}</p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            {t("error.retry")}
          </button>
          <Link href="/" className="btn-ghost">
            {t("error.home")}
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
