import { IconDownload } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

/**
 * ปุ่มดาวน์โหลดไฟล์แนบ
 *
 * แยกหน้าที่กับลิงก์ชื่อไฟล์ตั้งใจ — กดชื่อไฟล์คือ "ขอดู" (PDF กับรูปเปิดในแท็บใหม่)
 * ส่วนปุ่มนี้คือ "ขอเก็บ" จึงต่อ ?download=1 ให้ route ตอบเป็นไฟล์แนบเสมอ
 * ไม่พึ่งแอตทริบิวต์ download อย่างเดียว เพราะเบราว์เซอร์บนมือถือหลายตัวไม่สนใจมัน
 */
export default async function FileDownload({
  id,
  filename,
  className = "",
}: {
  id: number;
  filename: string;
  className?: string;
}) {
  const t = await getT();
  return (
    <a
      href={`/api/files/${id}?download=1`}
      download={filename}
      title={t("file.download")}
      aria-label={`${t("file.download")} — ${filename}`}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-primary-text ${className}`}
    >
      <IconDownload className="h-4 w-4" />
    </a>
  );
}
