/**
 * แคตตาล็อกหน้าทั้งหมดของ One OA — ใช้เป็นดัชนีคลิกได้ในหน้า /help และป้อนผู้ช่วย AI
 * แก้ที่นี่ทุกครั้งที่เพิ่ม/ย้าย/ลบหน้า แล้วอัปเดตคู่มือ docs/USER_MANUAL_ONE_OA.md ด้วย
 */
export interface HelpPage {
  path: string;
  title: string;
  group: string;
  purpose: string;
  keywords: string[];
  admin?: boolean;
}

export const HELP_GROUPS = ['ของฉัน', 'คำขอ', 'ดูแลระบบ'] as const;

export const HELP_PAGES: HelpPage[] = [
  { path: '/', title: 'ส่งคำขอ', group: 'ของฉัน',
    purpose: 'เลือกแบบฟอร์มเพื่อยื่นคำขอใหม่ จัดกลุ่มตามหมวดและค้นหาได้',
    keywords: ['ส่งคำขอ', 'ยื่นคำขอ', 'ฟอร์ม', 'แบบฟอร์ม', 'สร้างคำขอ', 'หน้าแรก', 'เบิก', 'จัดซื้อ', 'ส่วนลด'] },
  { path: '/requests?tab=awaiting', title: 'รอฉันอนุมัติ', group: 'ของฉัน',
    purpose: 'คำขอที่ค้างอยู่ที่ขั้นอนุมัติของฉัน รออนุมัติ/ไม่อนุมัติ/ส่งกลับ',
    keywords: ['รออนุมัติ', 'รอฉันอนุมัติ', 'อนุมัติ', 'คิวอนุมัติ', 'ค้าง', 'ของฉันต้องอนุมัติ'] },
  { path: '/requests?tab=mine', title: 'คำขอของฉัน', group: 'ของฉัน',
    purpose: 'คำขอที่ฉันเป็นผู้จัดทำ ติดตามสถานะได้',
    keywords: ['คำขอของฉัน', 'ที่ฉันทำ', 'ติดตาม', 'สถานะคำขอ', 'ของฉัน'] },
  { path: '/requests', title: 'ศูนย์การอนุมัติ', group: 'คำขอ',
    purpose: 'รวมทุกคำขอที่มีสิทธิ์เห็น มีแท็บ ทั้งหมด/รอฉันอนุมัติ/ฉันเป็นผู้จัดทำ/ทีมของฉัน/รอเคลียร์ OA และตัวกรอง',
    keywords: ['ศูนย์การอนุมัติ', 'ทั้งหมด', 'ค้นหาคำขอ', 'กรอง', 'รอเคลียร์', 'ทีมของฉัน', 'ติดตาม'] },
  { path: '/requests/table', title: 'ตารางรวมเอกสาร', group: 'คำขอ',
    purpose: 'ตารางแน่นไว้กวาดตาและส่งออกข้อมูลคำขอทั้งหมด',
    keywords: ['ตาราง', 'รวมเอกสาร', 'ส่งออก', 'export', 'ภาพรวม'] },
  { path: '/admin/forms', title: 'แม่แบบฟอร์ม', group: 'ดูแลระบบ', admin: true,
    purpose: 'สร้าง/แก้แบบฟอร์ม ฟิลด์ คอลัมน์ตาราง และตั้งสายอนุมัติ',
    keywords: ['แม่แบบ', 'ฟอร์ม', 'สร้างฟอร์ม', 'แก้ฟอร์ม', 'สายอนุมัติ', 'ฟิลด์', 'flow', 'admin'] },
  { path: '/admin/analytics', title: 'วิเคราะห์ประสิทธิภาพ', group: 'ดูแลระบบ', admin: true,
    purpose: 'จำนวนคำขอ อัตราอนุมัติ และเวลาเฉลี่ยรายผู้อนุมัติ',
    keywords: ['วิเคราะห์', 'ประสิทธิภาพ', 'สถิติ', 'อัตราอนุมัติ', 'เวลา', 'analytics', 'admin'] },
  { path: '/admin/reminders', title: 'เตือนงานค้าง', group: 'ดูแลระบบ', admin: true,
    purpose: 'ตั้งค่าการเตือนงานค้างและเร่งรัดงานที่ค้างอนุมัติ',
    keywords: ['เตือน', 'งานค้าง', 'เร่งรัด', 'reminder', 'admin'] },
  { path: '/admin/api', title: 'เชื่อมต่อระบบภายนอก', group: 'ดูแลระบบ', admin: true,
    purpose: 'ตั้งค่า webhook และ API key สำหรับเชื่อมระบบบัญชี/ERP',
    keywords: ['เชื่อมต่อ', 'webhook', 'api', 'integration', 'erp', 'บัญชี', 'admin'] },
  { path: '/admin/backup', title: 'สำรองข้อมูล', group: 'ดูแลระบบ', admin: true,
    purpose: 'สำรอง/กู้คืนข้อมูลและย้ายไฟล์แนบ',
    keywords: ['สำรองข้อมูล', 'backup', 'กู้คืน', 'admin'] },
  { path: '/admin/sso', title: 'ระบบกลาง (SSO)', group: 'ดูแลระบบ', admin: true,
    purpose: 'ตั้งค่าเข้าสู่ระบบผ่านระบบกลาง (OIDC)',
    keywords: ['sso', 'ระบบกลาง', 'login', 'oidc', 'เข้าสู่ระบบ', 'admin'] },
  { path: '/profile', title: 'โปรไฟล์', group: 'ของฉัน',
    purpose: 'ตั้งลายเซ็น มอบหมายอนุมัติแทน และภาษา',
    keywords: ['โปรไฟล์', 'ลายเซ็น', 'มอบหมาย', 'อนุมัติแทน', 'delegation', 'ลา', 'ภาษา'] },
  { path: '/help', title: 'คู่มือการใช้งาน', group: 'ของฉัน',
    purpose: 'คู่มือและผู้ช่วย AI ค้นหาวิธีใช้และนำทางไปแต่ละหน้า',
    keywords: ['คู่มือ', 'help', 'ช่วยเหลือ', 'วิธีใช้', 'ผู้ช่วย'] },
];

export function pageByPath(path: string): HelpPage | undefined {
  const clean = (path || '/').split('?')[0].split('#')[0];
  const exact = HELP_PAGES.find((p) => p.path.split('?')[0] === clean);
  if (exact) return exact;
  if (clean.startsWith('/admin/forms')) return HELP_PAGES.find((p) => p.path === '/admin/forms');
  if (clean.startsWith('/requests/')) return HELP_PAGES.find((p) => p.path === '/requests');
  return undefined;
}
