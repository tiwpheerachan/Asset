import { parseTemplateIcon, TEMPLATE_ICON_PATHS } from "@/lib/template-icon";

/**
 * ไอคอนฟอร์มแบบเปล่า ๆ สำหรับวางแทรกข้างข้อความ (ป้ายชนิดเอกสาร แถวในตาราง หัวข้อ)
 *
 * ต่างจาก TemplateIcon ตรงที่ไม่มีแผ่นสีพื้น และใช้สีตามข้อความรอบตัว —
 * ตรงที่แคบ ๆ ข้างตัวหนังสือ แผ่นสีทึบจะเด่นเกินจนแย่งสายตาไปจากชื่อเรื่อง
 * ซึ่งเป็นสิ่งที่คนกำลังอ่านจริง ๆ
 */
export default function TemplateGlyph({
  icon,
  size = 16,
  className = "",
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  const parsed = parseTemplateIcon(icon);

  if (parsed.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/icon/${encodeURIComponent(parsed.file)}`}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 rounded object-cover align-[-0.15em] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (parsed.kind === "emoji") {
    return (
      <span aria-hidden className={className} style={{ fontSize: size }}>
        {parsed.char}
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      style={{ width: size, height: size }}
    >
      {TEMPLATE_ICON_PATHS[parsed.key].split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}
