"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";

/**
 * ข้อความยาวที่ย่อไว้ก่อน แล้วกดดูทั้งหมดได้
 *
 * ที่มา: หัวข้อคั่นถูกใช้เขียนคำชี้แจงยาว ๆ (เงื่อนไขวางบิล ที่อยู่ เบอร์ติดต่อ)
 * ซึ่งสำคัญตอนอ่านครั้งแรก แต่พอกรอกฟอร์มใบที่สิบก็กลายเป็นกำแพงข้อความที่ต้อง
 * เลื่อนผ่านทุกครั้งกว่าจะถึงช่องแรก — ย่อไว้ก่อนจึงเป็นค่าเริ่มต้นที่ถูกกว่า
 *
 * ข้อความสั้นไม่ต้องมีปุ่ม — ปุ่มที่กดแล้วไม่มีอะไรเปลี่ยนคือปุ่มที่หลอกคนกด
 */
export default function CollapsibleText({
  text,
  lines = 4,
  className = "",
}: {
  text: string;
  /** ย่อเหลือกี่บรรทัด */
  lines?: number;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // เทียบทั้งจำนวนบรรทัดและความยาว — ข้อความบรรทัดเดียวยาว ๆ ก็กินหลายบรรทัดบนจอ
  const long = text.split("\n").length > lines || text.length > 220;
  if (!long) return <p className={`whitespace-pre-line ${className}`}>{text}</p>;

  return (
    <div>
      <p
        className={`whitespace-pre-line ${className}`}
        style={
          open
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-1 text-xs font-medium text-primary-text hover:underline"
      >
        {open ? t("common.hideText") : t("common.showAllText")}
      </button>
    </div>
  );
}
