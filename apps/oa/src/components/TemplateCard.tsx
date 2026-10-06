import Link from "next/link";
import TemplateIcon from "@/components/TemplateIcon";
import { IconArrowRight } from "@/components/icons";
import { templateColor } from "@/lib/types";

/**
 * การ์ดฟอร์มหนึ่งใบบนหน้าแรก
 *
 * การ์ดที่ยังตั้งค่าไม่ครบจะกดไม่ได้ และบอกตรงๆ ว่าติดตรงไหน
 * แทนที่จะปล่อยให้กดเข้าไปแล้วค่อยเจอว่าส่งไม่ได้
 */
export default function TemplateCard({
  id,
  code,
  name,
  icon,
  color,
  description,
  warning,
  href,
  muted = false,
  manageHref,
  manageLabel,
}: {
  id: number;
  code: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  warning?: string;
  href?: string;
  muted?: boolean;
  manageHref?: string;
  manageLabel?: string;
}) {
  // การ์ดบรรทัดเดียว: ไอคอน + ชื่อ · คำอธิบายกับรหัสไปอยู่ใน title แทน
  // เพราะแคตตาล็อกคือที่ที่คน "กวาดตาหา" ไม่ใช่ที่ที่คนอ่าน — การ์ดเตี้ยลง
  // แปลว่าเห็นฟอร์มได้มากขึ้นต่อหนึ่งหน้าจอ ซึ่งช่วยการหาโดยตรง
  const body = (
    <>
      <div className="flex items-center gap-3">
        <TemplateIcon code={code} icon={icon} color={color} size={32} />
        <div className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-text">
          {name}
        </div>
        {/* ลูกศรโผล่ตอนชี้ — บอกว่ากดแล้วไปต่อ ไม่ใช่แค่กล่องข้อมูล
            ซ่อนไว้ตอนปกติเพื่อไม่ให้กริดรกด้วยลูกศรเรียงกันเป็นแถบ */}
        {href && (
          <IconArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
        )}
      </div>

      {warning && (
        <div className="mt-2 rounded-xl bg-wait/10 px-2 py-1 text-xs leading-relaxed text-wait">
          {warning}
        </div>
      )}
    </>
  );

  const base = "tpl-card block h-full rounded-xl bg-surface p-3 ring-1 ring-border transition";
  // สีประจำฟอร์มส่งต่อเป็นตัวแปร ให้ทั้งไอคอนและการ์ดใช้เนื้อสีเดียวกัน
  const tint = { ["--a" as string]: templateColor(code, color) } as React.CSSProperties;

  const hint = [description, code].filter(Boolean).join(" · ");

  if (href) {
    return (
      <Link href={href} title={hint} style={tint} className={`group ${base} hover:shadow-e2`}>
        {body}
      </Link>
    );
  }

  return (
    <div style={tint} className={`${base} ${muted ? "bg-surface-2" : ""}`}>
      {body}
      {manageHref && manageLabel && (
        <Link
          href={manageHref}
          className="mt-2 inline-block text-xs font-medium text-primary-text hover:underline"
        >
          {manageLabel} →
        </Link>
      )}
    </div>
  );
}
