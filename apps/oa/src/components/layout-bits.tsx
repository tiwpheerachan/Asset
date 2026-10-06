import Link from "next/link";

/**
 * กรอบเนื้อหามาตรฐานของหน้า — คุมความกว้างและระยะขอบ
 * หน้าไหนอยากเต็มจอ (เช่นตัวสร้างฟอร์ม) ก็ไม่ต้องใช้ตัวนี้
 */
export function PageShell({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: "wide" | "narrow" | "full";
}) {
  // ค่าเริ่มต้นเต็มความกว้าง — narrow ไว้เฉพาะหน้าที่อยากบีบให้อ่านง่าย
  const max = width === "narrow" ? "max-w-3xl" : width === "wide" ? "max-w-[1440px]" : "max-w-none";
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-7 sm:py-8 lg:px-9 ${max}`}>
      {children}
    </div>
  );
}

/** หัวข้อการ์ด/ส่วน — มีแถบสีนำหน้าแบบเดียวกันทั้งระบบ */
export function SectionTitle({
  children,
  action,
  hint,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="section-bar h-card">{children}</h2>
        {hint && <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** การ์ดหนึ่งใบพร้อมหัวข้อ */
export function SectionCard({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <SectionTitle action={action} hint={hint}>
        {title}
      </SectionTitle>
      {children}
    </section>
  );
}

/** แถบหัวหน้าเพจ — ไอคอน + ชื่อเรื่อง + ปุ่มด้านขวา */
export function PageTitle({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-relaxed text-text">{title}</h1>
          {subtitle && <div className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * ไทล์ตัวเลขสรุป
 *
 * แต่ละใบมีสีประจำตัว เพราะสามใบนี้คือ "งานคนละแบบ" ไม่ใช่ตัวเลขสามตัวของเรื่องเดียวกัน
 * สีกับไอคอนทำให้กวาดตาแล้วแยกออกทันทีว่าใบไหนคือใบไหน โดยไม่ต้องอ่านป้ายก่อน
 * แถบสีริมซ้ายใช้เนื้อสีเดียวกับไอคอนและตัวเลข จึงอ่านเป็นชิ้นเดียวไม่ใช่ของสามชิ้นปะกัน
 */
export type Accent =
  | "primary" | "emerald" | "amber" | "rose" | "sky" | "violet" | "teal" | "orange" | "pink";

export function StatTile({
  label,
  value,
  hint,
  href,
  accent = "primary",
  icon,
  /** ตัวเลขเป็นสีเข้มของสีประจำใบเมื่อมีงานค้างจริง — ศูนย์ไม่ต้องเรียกร้องความสนใจ */
  dim = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  accent?: Accent;
  icon?: React.ReactNode;
  dim?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-soft">{label}</div>
          <div className="mt-2 text-[32px] font-semibold leading-none tabular-nums text-text">
            {value}
          </div>
        </div>
        {icon && <span className="accent-chip">{icon}</span>}
      </div>
      {hint && <div className="mt-1.5 truncate text-xs text-muted">{hint}</div>}
    </>
  );
  // การ์ดขาวเรียบแบบ Asset — ไม่มีแถบสีข้าง เลขเป็นสีหมึก ไอคอนโทน navy อ่อน
  void accent;
  const cls = `card stat-tile relative overflow-hidden px-5 py-5 transition`;
  return href ? (
    <Link href={href} className={`${cls} hover:shadow-e2 hover:ring-ring`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** แถบเครื่องมือเหนือตาราง (ค้นหา / ตัวกรอง) */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-4 px-5 py-4">{children}</div>
  );
}

/** ชิปตัวกรองที่เป็นลิงก์ */
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`badge ${active ? "tone-primary" : "bg-surface text-text-soft ring-border-strong"}`}
    >
      {children}
    </Link>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-16 text-center text-sm text-muted">
      {children}
    </div>
  );
}
