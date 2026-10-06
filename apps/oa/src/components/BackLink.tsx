"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft } from "@/components/icons";
import { useT } from "@/components/I18nProvider";

/**
 * ปุ่มย้อนกลับ
 *
 * ถอยตามประวัติของเบราว์เซอร์ ไม่ใช่เด้งไปหน้าที่กำหนดตายตัว เพราะคนเปิดเอกสาร
 * มาได้หลายทาง — ศูนย์การอนุมัติ · ตารางรวมเอกสาร · ลิงก์ในแจ้งเตือน
 * ถ้าบังคับกลับที่เดียวเสมอ คนที่มาจากตารางจะเสียทั้งตัวกรองและตำแหน่งที่เลื่อนไว้
 *
 * ดู history.length แทน document.referrer เพราะการเปลี่ยนหน้าแบบ client ของ
 * Next ไม่อัปเดต referrer — ใบที่เปิดจากลิงก์ในรายการจะดูเหมือนเปิดมาลอย ๆ
 *
 * ยังเป็นลิงก์จริงอยู่ เปิดแท็บใหม่หรือคลิกกลางได้ตามปกติ และถ้าเปิดใบนี้เป็นหน้าแรก
 * (กดจากลิงก์ในแชตหรือบุ๊กมาร์ก) ก็จะไปที่ href ตามที่เขียนไว้
 */
export default function BackLink({ href = "/requests" }: { href?: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="btn btn-ghost h-9 min-h-0 w-fit gap-1 px-2.5 text-[13px]"
    >
      <IconChevronLeft className="h-4 w-4" />
      {t("common.back")}
    </Link>
  );
}
