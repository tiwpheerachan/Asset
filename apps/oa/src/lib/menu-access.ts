/**
 * สิทธิ์เห็นเมนูรายคน (per-user menu visibility)
 *
 * โมเดล: users.menu_access เก็บ JSON array ของ "menu-key" ที่ผู้ใช้คนนั้นเห็นได้
 *   - NULL / ไม่ตั้ง  → ใช้ค่าเริ่มต้นตามบทบาท (role) — พฤติกรรมเดิมทุกประการ (ปลอดภัยกับของเก่า)
 *   - เป็น array      → เห็นเฉพาะ key ที่อยู่ในนั้น (override role · ใช้ได้ทั้งเพิ่ม/ลดจากค่า role)
 *
 * ตรรกะนี้ไม่พึ่ง DB/เซิร์ฟเวอร์ ใช้ได้ทั้งฝั่ง client (หน้าตั้งค่า) และ server (กั้นหน้า/เมนู)
 */

export type MenuKey =
  | "dashboard" | "submit" | "awaiting" | "myRequests"
  | "center" | "table" | "pending"
  | "company" | "users" | "forms" | "analytics"
  | "reminders" | "api" | "oaOverview" | "oaDocuments" | "oaHistory"
  | "accounting" | "feishu" | "backup" | "sso";

export type MenuGroupKey = "mine" | "requests" | "admin" | "system";

export interface MenuDef {
  key: MenuKey;
  group: MenuGroupKey;
  href: string;
  /** ป้ายไทย/อังกฤษ/จีน สำหรับหน้าตั้งค่า (Sidebar ใช้ป้ายของตัวเองผ่าน t()) */
  label: [th: string, en: string, zh: string];
  /** เมนูกลุ่มแอดมิน — ค่าเริ่มต้นเห็นเฉพาะ ADMIN */
  adminOnly: boolean;
}

export const MENU_CATALOG: MenuDef[] = [
  // ของฉัน (ทุกคนเห็นเป็นค่าเริ่มต้น)
  { key: "dashboard",  group: "mine",     href: "/dashboard",         label: ["แดชบอร์ด", "Dashboard", "仪表盘"],               adminOnly: false },
  { key: "submit",     group: "mine",     href: "/",                  label: ["ส่งคำขอ", "Submit request", "提交申请"],          adminOnly: false },
  { key: "awaiting",   group: "mine",     href: "/requests?tab=awaiting", label: ["รออนุมัติ (ของฉัน)", "Awaiting me", "待我审批"], adminOnly: false },
  { key: "myRequests", group: "mine",     href: "/requests?tab=mine", label: ["คำขอของฉัน", "My requests", "我的申请"],          adminOnly: false },
  // คำขอ (ทุกคนเห็น · เนื้อหาในหน้ากรองตามสิทธิ์อยู่แล้ว)
  { key: "center",     group: "requests", href: "/requests",          label: ["ศูนย์การอนุมัติ", "Approval center", "审批中心"],   adminOnly: false },
  { key: "table",      group: "requests", href: "/requests/table",    label: ["ตารางรวมเอกสาร", "Documents table", "单据汇总表"],  adminOnly: false },
  { key: "pending",    group: "requests", href: "/requests/pending",  label: ["ภาพรวมรออนุมัติ", "Pending overview", "待审概览"],  adminOnly: false },
  // ดูแลระบบ
  { key: "company",    group: "admin",    href: "/admin/company",     label: ["ข้อมูลกิจการ", "Company", "企业信息"],             adminOnly: true },
  { key: "users",      group: "admin",    href: "/admin/users",       label: ["ผู้ใช้และสิทธิ์", "Users & roles", "用户与权限"],   adminOnly: true },
  { key: "forms",      group: "admin",    href: "/admin/forms",       label: ["แม่แบบฟอร์ม", "Form templates", "表单模板"],       adminOnly: true },
  { key: "analytics",  group: "admin",    href: "/admin/analytics",   label: ["วิเคราะห์ประสิทธิภาพ", "Analytics", "效能分析"],     adminOnly: true },
  // ระบบและการเชื่อมต่อ
  { key: "reminders",  group: "system",   href: "/admin/reminders",   label: ["เตือนงานค้าง", "Reminders", "逾期提醒"],            adminOnly: true },
  { key: "api",        group: "system",   href: "/admin/api",         label: ["เชื่อมต่อระบบภายนอก", "API & webhook", "外部连接"], adminOnly: true },
  { key: "oaOverview", group: "system",   href: "/admin/oa-overview", label: ["ภาพรวมเอกสาร", "Document overview", "单据总览"],   adminOnly: true },
  { key: "oaDocuments",group: "system",   href: "/admin/oa-documents",label: ["เอกสาร OA (Feishu)", "OA Documents", "OA 单据"],   adminOnly: true },
  { key: "oaHistory",  group: "system",   href: "/admin/oa-history",  label: ["ประวัติการซิงก์", "Sync history", "同步历史"],      adminOnly: true },
  { key: "accounting", group: "system",   href: "/admin/accounting",  label: ["ลงบัญชี (ตรวจ+โพสต์)", "Accounting", "入账"],      adminOnly: true },
  { key: "feishu",     group: "system",   href: "/admin/feishu",      label: ["เชื่อม Feishu Base", "Feishu Base link", "连接多维表"], adminOnly: true },
  { key: "backup",     group: "system",   href: "/admin/backup",      label: ["สำรองข้อมูล", "Backup", "数据备份"],                adminOnly: true },
  { key: "sso",        group: "system",   href: "/admin/sso",         label: ["ระบบกลาง SSO", "Central SSO", "中央登录"],          adminOnly: true },
];

export const ALL_MENU_KEYS: MenuKey[] = MENU_CATALOG.map((m) => m.key);
export const BASELINE_MENU_KEYS: MenuKey[] = MENU_CATALOG.filter((m) => !m.adminOnly).map((m) => m.key);
export const ADMIN_MENU_KEYS: MenuKey[] = MENU_CATALOG.filter((m) => m.adminOnly).map((m) => m.key);

export const MENU_GROUP_LABEL: Record<MenuGroupKey, [string, string, string]> = {
  mine:     ["ของฉัน", "Mine", "我的"],
  requests: ["คำขอ", "Requests", "申请"],
  admin:    ["ดูแลระบบ", "Administration", "系统管理"],
  system:   ["ระบบและการเชื่อมต่อ", "System & integrations", "系统与集成"],
};

type Roleish = { role?: string | null; menu_access?: string | null };

/** ค่าเริ่มต้นตามบทบาท — ADMIN เห็นทุกเมนู · อื่น ๆ เห็นเฉพาะกลุ่มพื้นฐาน (เท่าพฤติกรรมเดิม) */
export function roleDefaultMenuKeys(role: string | null | undefined): MenuKey[] {
  return role === "ADMIN" ? ALL_MENU_KEYS : BASELINE_MENU_KEYS;
}

/** แปลง menu_access (JSON string) → array ของ key ที่ถูกต้อง; คืน null ถ้าไม่ได้ตั้ง/พัง */
export function parseMenuAccess(raw: string | null | undefined): MenuKey[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const valid = new Set<string>(ALL_MENU_KEYS);
    return arr.filter((k): k is MenuKey => typeof k === "string" && valid.has(k));
  } catch {
    return null;
  }
}

/** เซตเมนูที่ผู้ใช้คนนี้เห็นได้จริง (override ถ้าตั้ง menu_access · ไม่งั้นตามบทบาท) */
export function effectiveMenuKeys(user: Roleish): Set<MenuKey> {
  const explicit = parseMenuAccess(user.menu_access);
  return new Set(explicit ?? roleDefaultMenuKeys(user.role));
}

/** ผู้ใช้คนนี้เข้าถึง/เห็นเมนูนี้ได้ไหม */
export function canAccessMenu(user: Roleish, key: MenuKey): boolean {
  return effectiveMenuKeys(user).has(key);
}

/** ตั้งค่า menu_access แบบ "ใช้ตามบทบาท" (ล้าง override) */
export const MENU_ACCESS_DEFAULT = null;
