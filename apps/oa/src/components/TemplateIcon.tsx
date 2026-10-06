import { parseTemplateIcon, TEMPLATE_ICON_PATHS } from "@/lib/template-icon";
import { templateColor } from "@/lib/types";

/**
 * แผ่นไอคอนของฟอร์มหนึ่งใบ — สี่เหลี่ยมมนสีทึบ + ไอคอนเส้นสีขาว
 *
 * รูปที่อัปโหลดเองจะเต็มแผ่นโดยไม่มีสีพื้น เพราะรูปมักมีพื้นหลังของตัวเองอยู่แล้ว
 * ทับสีลงไปอีกจะกลายเป็นกรอบสีรอบรูปซึ่งดูเลอะ
 */
export default function TemplateIcon({
  code,
  icon,
  color,
  size = 44,
}: {
  code: string;
  icon: string;
  color: string;
  size?: number;
}) {
  const parsed = parseTemplateIcon(icon);
  const tone = templateColor(code, color);
  const radius = Math.round(size * 0.23);

  if (parsed.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/icon/${encodeURIComponent(parsed.file)}`}
        alt=""
        width={size}
        height={size}
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center leading-none"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: tone,
        fontSize: Math.round(size * 0.45),
      }}
    >
      {parsed.kind === "icon" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: Math.round(size * 0.52), height: Math.round(size * 0.52) }}
        >
          {TEMPLATE_ICON_PATHS[parsed.key].split(" M").map((d, i) => (
            <path key={i} d={i === 0 ? d : `M${d}`} />
          ))}
        </svg>
      ) : (
        parsed.char
      )}
    </span>
  );
}
