"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { IconLink } from "@/components/icons";

/**
 * คัดลอกลิงก์ของเอกสารใบนี้
 *
 * ลิงก์เอกสารถูกส่งต่อกันในแชทเป็นเรื่องปกติ ("ช่วยดูใบนี้ให้หน่อย") เดิมต้องลากเลือก
 * จากช่อง URL ของเบราว์เซอร์เอง ซึ่งบนมือถือทำยากกว่าที่คิด
 *
 * คัดลอกที่อยู่ของตัวเอกสารเสมอ ไม่ใช่ที่อยู่ที่เปิดอยู่ตอนนั้น — คนกดส่งจากแท็บ
 * "บันทึกการอนุมัติ" แล้วปลายทางเปิดมาเจอแท็บนั้นทั้งที่อยากให้ดูรายละเอียด
 */
export default function CopyLink({
  path,
  label,
  className = "btn-ghost gap-1.5",
}: {
  path: string;
  label?: string;
  /** ปรับทรงได้ตามที่ที่ไปวาง — ในแถบแท็บใช้ทรงเดียวกับแท็บ ไม่ใช่ปุ่มแคปซูล */
  className?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return; // เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด — ปล่อยให้ผู้ใช้คัดลอกจากช่อง URL เอง
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className={className} title={t("detail.copyLinkHint")}>
      <IconLink className="h-4 w-4" />
      {copied ? t("detail.copied") : (label ?? t("detail.copyLink"))}
    </button>
  );
}
