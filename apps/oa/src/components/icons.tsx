/** ไอคอนเส้นชุดเล็ก — inline SVG ทั้งหมด ไม่พึ่ง lib ภายนอก */
type P = { className?: string };

const base = "h-[18px] w-[18px] shrink-0";
const svg = (path: React.ReactNode, className?: string) => (
  <svg
    className={className ?? base}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

export const IconHome = ({ className }: P) =>
  svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>, className);

export const IconInbox = ({ className }: P) =>
  svg(<><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M4.5 5h15l1.5 8v6H3v-6z" /></>, className);

export const IconSend = ({ className }: P) =>
  svg(<><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5z" /></>, className);

export const IconCheckCircle = ({ className }: P) =>
  svg(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>, className);

/** กระดิ่ง — ช่วงเวลาที่ระบบส่งการเตือน */
export const IconBell = ({ className }: P) =>
  svg(<><path d="M18 9a6 6 0 1 0-12 0c0 4-1.5 5.5-1.5 5.5h15S18 13 18 9" /><path d="M10.5 18a1.8 1.8 0 0 0 3 0" /></>, className);

export const IconClock = ({ className }: P) =>
  svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, className);

export const IconUsers = ({ className }: P) =>
  svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.6c2 .7 3.5 2.4 3.5 4.6" />
    </>,
    className,
  );

export const IconBuilding = ({ className }: P) =>
  svg(
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V21" />
      <path d="M13 10h5.5A1.5 1.5 0 0 1 20 11.5V21" />
      <path d="M3 21h18M7 8h2M7 12h2M7 16h2M16 14h1M16 17.5h1" />
    </>,
    className,
  );

export const IconForm = ({ className }: P) =>
  svg(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>,
    className,
  );

export const IconChart = ({ className }: P) =>
  svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />, className);

export const IconSearch = ({ className }: P) =>
  svg(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>, className);

export const IconChevron = ({ className }: P) =>
  svg(<path d="m6 9 6 6 6-6" />, className);

export const IconChevronLeft = ({ className }: P) =>
  svg(<path d="m15 6-6 6 6 6" />, className);

export const IconSun = ({ className }: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
    className,
  );

export const IconMoon = ({ className }: P) =>
  svg(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />, className);

export const IconLogout = ({ className }: P) =>
  svg(<><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 8 6 12l4 4M6 12h9" /></>, className);

export const IconSettings = ({ className }: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>,
    className,
  );

export const IconPrint = ({ className }: P) =>
  svg(
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="1.5" />
      <path d="M6 17h12v4H6z" />
    </>,
    className,
  );

export const IconPlus = ({ className }: P) => svg(<path d="M12 5v14M5 12h14" />, className);

export const IconMail = ({ className }: P) =>
  svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>, className);

export const IconShield = ({ className }: P) =>
  svg(<><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>, className);

export const IconAlert = ({ className }: P) =>
  svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></>, className);

export const IconArchive = ({ className }: P) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M10 12h4" />
    </>,
    className,
  );

/* ---------- ชนิดคำถามในตัวสร้างฟอร์ม ----------
   เดิมใช้อักขระอย่าง ≡ ¶ ▤ ◉ ปนกับอิโมจิ 📎 🖼 ซึ่งขนาดกับน้ำหนักเส้นไม่เท่ากัน
   และบางตัวขึ้นกับฟอนต์ของเครื่อง — เปลี่ยนเป็น SVG ชุดเดียวกับไอคอนอื่นทั้งระบบ */

export const IconTypeText = ({ className }: P) =>
  svg(<><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></>, className);

/** หัวข้อคั่น — "Tt" แบบเดียวกับปุ่มเพิ่มหัวข้อของ Google Form */
export const IconTypeHeading = ({ className }: P) =>
  svg(<><path d="M3 6V4h10v2" /><path d="M8 4v16" /><path d="M5 20h6" /><path d="M14 11v-1.5h7V11" /><path d="M17.5 9.5V20" /><path d="M15.5 20h4" /></>, className);

export const IconTypeTextarea = ({ className }: P) =>
  svg(<><path d="M4 6h16" /><path d="M4 11h16" /><path d="M4 16h10" /></>, className);

export const IconTypeNumber = ({ className }: P) =>
  svg(<><path d="M9 4 7 20" /><path d="M17 4l-2 16" /><path d="M4 9h16" /><path d="M3 15h16" /></>, className);

export const IconTypeMoney = ({ className }: P) =>
  svg(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2A2.6 2.6 0 0 0 12 7.8c-1.5 0-2.6.9-2.6 2.1 0 2.9 5.4 1.6 5.4 4.4 0 1.3-1.2 2.2-2.8 2.2a2.9 2.9 0 0 1-2.7-1.5" /><path d="M12 6v12" /></>, className);

export const IconTypeDate = ({ className }: P) =>
  svg(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>, className);

/** ช่วงเวลา — ปฏิทินที่มีสองหมุดกับเส้นเชื่อม บอกว่ามีต้นทางกับปลายทาง */
export const IconTypeDateRange = ({ className }: P) =>
  svg(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M8 15h8" /><path d="M8 13.5v3" /><path d="M16 13.5v3" /></>, className);

export const IconTypeSelect = ({ className }: P) =>
  svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></>, className);

/** ดรอปดาวน์ — กล่องที่มีลูกศรลง บอกว่ากดแล้วรายการจะกางออก */
export const IconTypeDropdown = ({ className }: P) =>
  svg(<><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="m14 11 2 2 2-2" /><path d="M7 12h4" /></>, className);

export const IconTypeMultiselect = ({ className }: P) =>
  svg(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>, className);

/** ยอดรวม — ซิกมา (Σ) สัญลักษณ์ผลรวมที่คนทำบัญชีอ่านออกทันที */
/** คลิปหนีบกระดาษ — ปุ่มแนบไฟล์ */
export const IconPaperclip = ({ className }: P) =>
  svg(<path d="M20 11.5 12.3 19a4.6 4.6 0 0 1-6.5-6.5l8-7.9a3 3 0 0 1 4.3 4.3l-8 7.9a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" />, className);

export const IconTypeTotal = ({ className }: P) =>
  svg(<><path d="M17 5H7l5 7-5 7h10" /></>, className);

export const IconTypeUser = ({ className }: P) =>
  svg(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></>, className);

export const IconTypeFile = ({ className }: P) =>
  svg(<><path d="M14 3.5V9h5.5" /><path d="M19.5 9v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2H14z" /></>, className);

export const IconTypeImage = ({ className }: P) =>
  svg(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" /></>, className);

export const IconTypeTable = ({ className }: P) =>
  svg(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 10h17" /><path d="M3.5 14.5h17" /><path d="M9.5 10v9" /></>, className);

/* ---------- ปุ่มในแถบเครื่องมือของการ์ดคำถาม ---------- */

export const IconArrowUp = ({ className }: P) =>
  svg(<><path d="M12 20V4" /><path d="m6 10 6-6 6 6" /></>, className);

export const IconArrowDown = ({ className }: P) =>
  svg(<><path d="M12 4v16" /><path d="m6 14 6 6 6-6" /></>, className);

export const IconDuplicate = ({ className }: P) =>
  svg(<><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" /></>, className);

/** ดาวน์โหลด — ลูกศรลงลงถาด */
export const IconDownload = ({ className }: P) =>
  svg(<><path d="M12 4v10" /><path d="M8 10.5 12 14.5l4-4" /><path d="M4.5 17.5v1.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-1.5" /></>, className);

/** ตา — ฟอร์มที่เปิดใช้อยู่ (กดเพื่อปิด) */
export const IconEye = ({ className }: P) =>
  svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" /><circle cx="12" cy="12" r="3" /></>, className);

/** ตาขีดฆ่า — ฟอร์มที่ปิดใช้อยู่ (กดเพื่อเปิด) */
export const IconEyeOff = ({ className }: P) =>
  svg(<><path d="M10.6 6.1A8.7 8.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.9 3.5" /><path d="M6.4 7.9A16 16 0 0 0 2.5 12S6 18 12 18a8.9 8.9 0 0 0 3.4-.65" /><path d="M10 10a2.8 2.8 0 0 0 4 4" /><path d="m3.5 3.5 17 17" /></>, className);

export const IconTrash = ({ className }: P) =>
  svg(<><path d="M4 6.5h16" /><path d="M9.5 6.5V4.5h5v2" /><path d="M6.5 6.5 7.5 20h9l1-13.5" /><path d="M10.5 10v6" /><path d="M13.5 10v6" /></>, className);

export const IconGrip = ({ className }: P) =>
  svg(
    <>
      <circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className,
  );

export const IconCheck = ({ className }: P) =>
  svg(<path d="m5 12.5 4.5 4.5L19 7" />, className);

export const IconLink = ({ className }: P) =>
  svg(
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
    </>,
    className,
  );

/** ลูกศรชี้ขวา — ใช้บอกว่าการ์ดหรือแถวนี้กดแล้วไปต่อได้ */
export const IconArrowRight = ({ className }: P) =>
  svg(<path d="M5 12h14M13 6l6 6-6 6" />, className);
