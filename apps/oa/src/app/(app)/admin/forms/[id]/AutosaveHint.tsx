"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";

/**
 * ตัวบอกสถานะการบันทึกอัตโนมัติ
 *
 * ตัวสร้างฟอร์มบันทึกให้เองหลังหยุดพิมพ์ ไม่มีปุ่มบันทึก — เดิมจึงไม่มีอะไรบอกเลย
 * ว่างานที่แก้ไปถูกเก็บแล้วหรือยัง คนใช้ต้องออกจากหน้าแล้วเข้าใหม่เพื่อพิสูจน์
 *
 * ขึ้น "กำลังบันทึก…" ระหว่างส่ง แล้วค้าง "บันทึกแล้ว" ไว้ครู่หนึ่งให้ทันเห็น
 * ข้อผิดพลาดไม่หายเอง เพราะต้องมีคนไปแก้
 */
export default function AutosaveHint({
  pending,
  ok,
  error,
}: {
  pending: boolean;
  ok?: string;
  error?: string;
}) {
  const t = useT();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    // ข้อความ ok เป็นค่าเดิมทุกครั้ง ใช้เป็นตัวจุดชนวนไม่ได้ —
    // จับจังหวะที่เพิ่งส่งเสร็จแทน (pending จริง → เท็จ)
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || error || !ok) return;

    setJustSaved(true);
    const id = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(id);
  }, [pending, ok, error]);

  // ฟอร์มนี้ไม่มีปุ่มบันทึก คนที่มองไม่เห็นจึงไม่มีทางรู้เลยว่างานถูกเก็บแล้วหรือยัง
  // ถ้าไม่ประกาศออกไป — ห่อทุกสถานะไว้ในพื้นที่ประกาศเดียวกัน
  const wrap = (cls: string, text: string) => (
    <span role="status" aria-live="polite" className={`text-xs ${cls}`}>
      {text}
    </span>
  );

  if (error) return wrap("text-no", error);
  if (pending) return wrap("text-muted", t("builder.saving"));
  if (justSaved) return wrap("text-ok", t("builder.saved"));
  return <span role="status" aria-live="polite" className="sr-only" />;
}
