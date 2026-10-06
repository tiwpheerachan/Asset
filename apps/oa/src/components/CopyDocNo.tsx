"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { IconDuplicate } from "@/components/icons";

/**
 * เลขที่เอกสารพร้อมปุ่มคัดลอก
 *
 * เลขนี้คือตัวอ้างอิงที่ต้องเอาไปกรอกในระบบ OA ตอนเคลียร์ค่าใช้จ่าย
 * คนใช้จริงต้องคัดลอกทุกครั้ง จึงไม่ควรให้ต้องลากเมาส์เลือกเอง
 */
export default function CopyDocNo({ docNo }: { docNo: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(docNo);
    } catch {
      return; // เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด — ปล่อยให้ผู้ใช้เลือกข้อความเอง
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={t("detail.copyDocNo")}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2 py-0.5
                 font-mono text-sm text-muted hover:border-border-strong hover:text-text"
    >
      {docNo}
      {copied ? (
        <span className="text-xs text-ok">{t("detail.copied")}</span>
      ) : (
        <IconDuplicate className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
