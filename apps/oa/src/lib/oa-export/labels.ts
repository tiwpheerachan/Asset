import type { Locale } from "@/lib/i18n/locales";

/**
 * ชั้นแปลภาษาสำหรับ "ข้อมูลที่มาจากต้นทาง OA/Feishu" (สถานะ + ชื่อช่อง + ชื่อฟอร์ม)
 * ต้นทางเป็นจีน (บางทีผสม en/th) — ที่นี่ทำให้แสดงตามภาษาที่ผู้ใช้เลือก (th/en/zh)
 * ใช้ได้ทั้งใน client component (useI18n().locale) และ server component (await getLocale())
 */

type Tri = { th: string; en: string; zh: string };
export const tri = (o: Tri, l: Locale) => o[l] || o.th;

/* ---------- สถานะอนุมัติ ---------- */
const STATUS: Record<string, Tri> = {
  approved: { th: "อนุมัติแล้ว", en: "Approved", zh: "已通过" },
  pending: { th: "รออนุมัติ", en: "Pending", zh: "审批中" },
  rejected: { th: "ปฏิเสธ", en: "Rejected", zh: "已拒绝" },
  cancelled: { th: "ถอน/ยกเลิก", en: "Cancelled", zh: "已撤回" },
  deleted: { th: "ลบแล้ว", en: "Deleted", zh: "已删除" },
};
export type StatusKey = keyof typeof STATUS;

export function statusKey(raw: string): StatusKey | "" {
  const s = raw || "";
  if (/通过|approved|pass/i.test(s)) return "approved";
  if (/审批中|pending|review|进行/i.test(s)) return "pending";
  if (/拒绝|reject/i.test(s)) return "rejected";
  if (/撤回|cancel|withdraw/i.test(s)) return "cancelled";
  if (/删除|delete/i.test(s)) return "deleted";
  return "";
}
export function oaStatus(raw: string, locale: Locale): string {
  const k = statusKey(raw);
  return k ? STATUS[k][locale] : raw || "—";
}
/** ป้ายสถานะจาก key (approved/pending/…) ไว้ทำ dropdown ตัวกรอง */
export function statusByKey(key: string, locale: Locale): string {
  return key in STATUS ? STATUS[key as StatusKey][locale] : "";
}
/** สีประจำสถานะ (คงที่ ไม่ขึ้นกับภาษา) */
export function statusColor(raw: string): string {
  switch (statusKey(raw)) {
    case "approved": return "#10b981";
    case "pending": return "#3b82f6";
    case "cancelled": return "#f59e0b";
    case "rejected": return "#f43f5e";
    case "deleted": return "#94a3b8";
    default: return "#6366f1";
  }
}

/* ---------- ชื่อช่อง (จีนล้วน) ที่พบบ่อย ---------- */
const FIELD: Record<string, Tri> = {
  发起人: { th: "ผู้ยื่น", en: "Applicant", zh: "发起人" },
  发起人部门: { th: "แผนกผู้ยื่น", en: "Applicant dept.", zh: "发起人部门" },
  发起时间: { th: "วันที่ยื่น", en: "Submitted", zh: "发起时间" },
  完成时间: { th: "วันที่เสร็จ", en: "Completed", zh: "完成时间" },
  审批流程: { th: "สายอนุมัติ", en: "Approval flow", zh: "审批流程" },
  审批节点: { th: "ขั้นอนุมัติ", en: "Approval node", zh: "审批节点" },
  当前处理人: { th: "ผู้ดำเนินการปัจจุบัน", en: "Current handler", zh: "当前处理人" },
  申请状态: { th: "สถานะคำขอ", en: "Status", zh: "申请状态" },
  申请编号: { th: "เลขที่คำขอ", en: "Request no.", zh: "申请编号" },
  年份: { th: "ปี", en: "Year", zh: "年份" },
  月份: { th: "เดือน", en: "Month", zh: "月份" },
  品牌: { th: "แบรนด์", en: "Brand", zh: "品牌" },
  币种: { th: "สกุลเงิน", en: "Currency", zh: "币种" },
  金额: { th: "จำนวนเงิน", en: "Amount", zh: "金额" },
  汇总金额: { th: "ยอดรวม", en: "Total amount", zh: "汇总金额" },
  备注: { th: "หมายเหตุ", en: "Remark", zh: "备注" },
  用途: { th: "วัตถุประสงค์", en: "Purpose", zh: "用途" },
  供应商: { th: "ผู้ขาย/ซัพพลายเออร์", en: "Supplier", zh: "供应商" },
  采购订单号: { th: "เลขที่ใบสั่งซื้อ", en: "PO no.", zh: "采购订单号" },
  简要: { th: "สรุป", en: "Summary", zh: "简要" },
  主题: { th: "หัวข้อ", en: "Topic", zh: "主题" },
  付款方式: { th: "วิธีชำระ", en: "Payment method", zh: "付款方式" },
  付款账户: { th: "บัญชีจ่าย", en: "Payment account", zh: "付款账户" },
  收款人姓名: { th: "ชื่อผู้รับเงิน", en: "Payee name", zh: "收款人姓名" },
  收款账户: { th: "บัญชีรับเงิน", en: "Payee account", zh: "收款账户" },
  开户银行: { th: "ธนาคาร", en: "Bank", zh: "开户银行" },
  银行: { th: "ธนาคาร", en: "Bank", zh: "银行" },
  渠道: { th: "ช่องทาง", en: "Channel", zh: "渠道" },
  平台: { th: "แพลตฟอร์ม", en: "Platform", zh: "平台" },
  部门: { th: "แผนก", en: "Department", zh: "部门" },
  明细: { th: "รายละเอียด", en: "Details", zh: "明细" },
  发票: { th: "ใบกำกับภาษี/ใบแจ้งหนี้", en: "Invoice", zh: "发票" },
  附件: { th: "ไฟล์แนบ", en: "Attachment", zh: "附件" },
};

function segs(s: string) {
  const thai = (s.match(/[฀-๿]+/g) || []).join("").trim();
  const cjk = (s.match(/[一-鿿]+/g) || []).join("").trim();
  const latin = (s.match(/[A-Za-z][A-Za-z0-9 .%/-]*/g) || []).join(" ").replace(/\s+/g, " ").trim();
  return { thai, cjk, latin };
}

/**
 * แปลป้ายข้อความทั่วไปจาก OA (ชื่อช่อง/ชื่อฟอร์ม) ให้ตรงภาษา
 * - ถ้าอยู่ใน FIELD ที่แปลไว้ → ใช้คำแปล
 * - ไม่งั้นแยกตามสคริปต์ (ไทย/จีน/อังกฤษ) แล้วเลือกส่วนที่ตรงภาษา (ต้นทางมักผสม เช่น "topic&主题")
 */
export function oaLabel(raw: string, locale: Locale): string {
  if (!raw) return "";
  const key = raw.replace(/_+$/, "").trim();
  const { thai, cjk, latin } = segs(key);
  const curated = FIELD[key] || (cjk && FIELD[cjk]);
  if (curated) return curated[locale] || key;
  if (locale === "zh") return cjk || latin || thai || key;
  if (locale === "en") return latin || thai || cjk || key;
  return thai || latin || cjk || key; // th
}

/* ---------- ป้าย UI ของหน้าเอกสาร OA (ให้สลับภาษาได้ทั้งหน้า) ---------- */
export const OAUI: Record<string, Tri> = {
  // header / toolbar
  linked: { th: "เชื่อม Lark Approval แล้ว", en: "Connected to Lark Approval", zh: "已连接 Lark 审批" },
  notset: { th: "ยังไม่ได้ตั้งค่า", en: "Not configured", zh: "未配置" },
  source: { th: "ที่มา", en: "Source", zh: "来源" },
  docs: { th: "ใบ", en: "docs", zh: "单" },
  syncNow: { th: "ดึงเพิ่ม/อัปเดต", en: "Sync now", zh: "同步更新" },
  working: { th: "กำลังทำงาน…", en: "Working…", zh: "处理中…" },
  // filter bar
  form: { th: "ฟอร์ม", en: "Form", zh: "表单" },
  status: { th: "สถานะ", en: "Status", zh: "状态" },
  dept: { th: "แผนก", en: "Department", zh: "部门" },
  from: { th: "ตั้งแต่", en: "From", zh: "起始" },
  to: { th: "ถึง", en: "To", zh: "结束" },
  hasFile: { th: "มีไฟล์แนบ", en: "Has attachment", zh: "有附件" },
  allForms: { th: "ทุกฟอร์ม", en: "All forms", zh: "全部表单" },
  allStatus: { th: "ทุกสถานะ", en: "All statuses", zh: "全部状态" },
  allDept: { th: "ทุกแผนก", en: "All departments", zh: "全部部门" },
  clear: { th: "ล้างตัวกรอง", en: "Clear filters", zh: "清除筛选" },
  step: { th: "ขั้น/ผู้ดำเนินการ", en: "Step/Handler", zh: "节点/处理人" },
  // search + table
  searchPh: { th: "ค้นหา เลขที่ / ผู้ยื่น / ผู้ขาย / หัวข้อ / ยอดเงิน… (กด Enter เพื่อค้นทั้งระบบ)", en: "Search no. / applicant / seller / topic / amount… (Enter to search all)", zh: "搜索单号/发起人/卖方/主题/金额…（回车全局搜索）" },
  search: { th: "ค้นหา", en: "Search", zh: "搜索" },
  loading: { th: "กำลังโหลด…", en: "Loading…", zh: "加载中…" },
  found: { th: "พบ", en: "Found", zh: "找到" },
  byFilter: { th: "ตามตัวกรอง", en: "by filter", zh: "按筛选" },
  latestAll: { th: "ล่าสุดทั้งหมด", en: "latest (all)", zh: "全部最新" },
  colNoForm: { th: "เลขที่ / ฟอร์ม", en: "No. / Form", zh: "单号 / 表单" },
  colApplicant: { th: "ผู้ยื่น", en: "Applicant", zh: "发起人" },
  colDept: { th: "แผนก", en: "Department", zh: "部门" },
  colTopic: { th: "หัวข้อ/ผู้รับเงิน", en: "Topic/Payee", zh: "主题/收款人" },
  colSubmit: { th: "ยื่น", en: "Submitted", zh: "提交" },
  colDone: { th: "เสร็จ", en: "Done", zh: "完成" },
  colAmount: { th: "ยอดเงิน", en: "Amount", zh: "金额" },
  colFiles: { th: "ไฟล์", en: "Files", zh: "附件" },
  colStatus: { th: "สถานะ", en: "Status", zh: "状态" },
  empty: { th: "ไม่พบเอกสารตามตัวกรอง", en: "No documents match the filter", zh: "没有符合筛选的单据" },
  loadMore: { th: "โหลดเพิ่มอีก 200 ใบ", en: "Load 200 more", zh: "再加载 200 条" },
  rowHint: { th: "คลิกแถวใดก็ได้เพื่อดูรายละเอียดเต็ม (ทุกช่อง + ไฟล์ + สิ่งที่ AI อ่าน) · พรีวิวไฟล์ได้ในแผงด้านขวา", en: "Click any row for full details (all fields + files + AI-read) · preview files on the right", zh: "点击任意行查看完整详情（全部字段+附件+AI识别）· 右侧预览文件" },
  filterFromDash: { th: "กรองจากแดชบอร์ด", en: "Filtered from dashboard", zh: "来自仪表盘的筛选" },
  // drawer
  mainInfo: { th: "ข้อมูลหลัก", en: "Overview", zh: "主要信息" },
  allFields: { th: "ข้อมูลทั้งหมด", en: "All fields", zh: "全部字段" },
  fields: { th: "ช่อง", en: "fields", zh: "字段" },
  applicant: { th: "ผู้ยื่น", en: "Applicant", zh: "发起人" },
  submitted: { th: "วันที่ยื่น", en: "Submitted", zh: "提交时间" },
  completed: { th: "วันที่เสร็จ", en: "Completed", zh: "完成时间" },
  flow: { th: "สายอนุมัติ", en: "Approval flow", zh: "审批流程" },
  node: { th: "ขั้นปัจจุบัน", en: "Current step", zh: "当前节点" },
  handler: { th: "ผู้ดำเนินการ", en: "Handler", zh: "处理人" },
  amtForm: { th: "ยอด (ฟอร์ม)", en: "Amount (form)", zh: "金额(表单)" },
  amtAi: { th: "ยอด (AI อ่าน)", en: "Amount (AI)", zh: "金额(AI)" },
  fullscreen: { th: "เต็มจอ", en: "Fullscreen", zh: "全屏" },
  shrink: { th: "ย่อ", en: "Shrink", zh: "还原" },
  close: { th: "ปิด", en: "Close", zh: "关闭" },
  openTab: { th: "เปิดแท็บใหม่", en: "Open in tab", zh: "新标签打开" },
  download: { th: "ดาวน์โหลด", en: "Download", zh: "下载" },
  downloadOpen: { th: "ดาวน์โหลดเพื่อเปิด", en: "Download to open", zh: "下载后打开" },
  noFile: { th: "ไม่มีไฟล์แนบ", en: "No attachment", zh: "无附件" },
  cantPreview: { th: "ไฟล์ชนิดนี้ยังพรีวิวในหน้าไม่ได้", en: "This file type can't be previewed here", zh: "此类文件暂不支持页面预览" },
  cantOpen: { th: "เปิดไม่ได้", en: "Can't open", zh: "无法打开" },
  convWord: { th: "กำลังแปลงเอกสาร Word…", en: "Converting Word…", zh: "正在转换 Word…" },
  readSheet: { th: "กำลังอ่านตาราง…", en: "Reading spreadsheet…", zh: "正在读取表格…" },
  loadingFile: { th: "กำลังโหลดไฟล์…", en: "Loading file…", zh: "正在加载文件…" },
  aiRead: { th: "AI อ่านจากไฟล์", en: "AI extracted", zh: "AI 识别" },
  docNo: { th: "เลขที่", en: "Doc no.", zh: "单号" },
  date: { th: "วันที่", en: "Date", zh: "日期" },
  seller: { th: "ผู้ขาย", en: "Seller", zh: "卖方" },
  total: { th: "ยอดรวม", en: "Total", zh: "合计" },
  itemsInDoc: { th: "รายการในเอกสาร", en: "items in document", zh: "项明细" },
  aiUnsure: { th: "AI ไม่มั่นใจ", en: "AI unsure", zh: "AI 不确定" },
  resizeHint: { th: "ลากเพื่อปรับความกว้าง", en: "Drag to resize", zh: "拖动调整宽度" },
  // page heading
  pageTitle: { th: "เอกสาร OA (จาก Feishu)", en: "OA Documents (from Feishu)", zh: "OA 单据（来自飞书）" },
  pageSubtitle: { th: "เอกสารอนุมัติที่ดึงมาจากระบบ OA File Check — อ่านอย่างเดียว · มีไฟล์แนบและสิ่งที่ AI อ่านจากเอกสาร", en: "Approval documents synced from OA File Check — read-only · with attachments and AI-read data", zh: "从 OA 文件核查系统同步的审批单据 — 只读 · 含附件与 AI 识别内容" },
  formsSynced: { th: "ฟอร์มทั้งหมด — ซิงก์แล้ว", en: "All forms — synced", zh: "全部表单 — 已同步" },
  // ประวัติ
  history: { th: "ประวัติ", en: "History", zh: "历史" },
  hideHistory: { th: "ซ่อนประวัติ", en: "Hide history", zh: "隐藏历史" },
  syncHistory: { th: "ประวัติการซิงก์", en: "Sync history", zh: "同步历史" },
  changeHistory: { th: "ประวัติการเปลี่ยนแปลง", en: "Change history", zh: "变更历史" },
  time: { th: "เวลา", en: "Time", zh: "时间" },
  by: { th: "โดย", en: "By", zh: "来源" },
  cameIn: { th: "ตรวจ", en: "Checked", zh: "检查" },
  changedCol: { th: "เปลี่ยน", en: "Changed", zh: "变更" },
  totalCol: { th: "รวม", en: "Total", zh: "合计" },
  srcCron: { th: "อัตโนมัติ", en: "Auto", zh: "自动" },
  srcManual: { th: "กดเอง", en: "Manual", zh: "手动" },
  kindNew: { th: "เอกสารใหม่", en: "New document", zh: "新单据" },
  kindStatus: { th: "เปลี่ยนสถานะ", en: "Status change", zh: "状态变更" },
  kindNode: { th: "เปลี่ยนขั้น/ผู้ดำเนินการ", en: "Step/handler change", zh: "节点/处理人变更" },
  noHistory: { th: "ยังไม่มีประวัติ", en: "No history yet", zh: "暂无历史" },
  autoOn: { th: "ดึงอัตโนมัติทุก 30 นาที", en: "Auto-sync every 30 min", zh: "每 30 分钟自动同步" },
  // หน้าประวัติแยก
  histPageTitle: { th: "ประวัติการซิงก์ & การเปลี่ยนแปลง", en: "Sync & Change History", zh: "同步与变更历史" },
  histPageSub: { th: "บันทึกทุกรอบการดึงข้อมูล และทุกการเปลี่ยนสถานะ/อนุมัติของเอกสาร", en: "Every sync run and every status/approval change of documents", zh: "记录每次同步与每次单据状态/审批变更" },
  tabSync: { th: "การซิงก์", en: "Syncs", zh: "同步" },
  tabChange: { th: "การเปลี่ยนแปลง", en: "Changes", zh: "变更" },
  loadMore2: { th: "โหลดเพิ่ม", en: "Load more", zh: "加载更多" },
  allLoaded: { th: "โหลดครบแล้ว", en: "All loaded", zh: "已全部加载" },
  duration: { th: "ใช้เวลา", en: "Duration", zh: "耗时" },
  backToDocs: { th: "← กลับไปหน้าเอกสาร", en: "← Back to documents", zh: "← 返回单据" },
  viewFullHistory: { th: "ดูประวัติทั้งหมด", en: "View full history", zh: "查看完整历史" },
  hKind: { th: "ชนิด", en: "Type", zh: "类型" },
  hKindAll: { th: "ทุกชนิด", en: "All types", zh: "全部类型" },
  hSource: { th: "ที่มา", en: "Source", zh: "来源" },
  hSourceAll: { th: "ทั้งหมด", en: "All", zh: "全部" },
  hSearchSerial: { th: "ค้นเลขที่/ฟอร์ม…", en: "Search no./form…", zh: "搜索单号/表单…" },
  // โปรไฟล์ + timeline อนุมัติ
  approvalFlow: { th: "เส้นทางการอนุมัติ", en: "Approval timeline", zh: "审批流程" },
  waitingOn: { th: "กำลังรอ", en: "Waiting on", zh: "等待" },
  comment: { th: "หมายเหตุ", en: "Comment", zh: "备注" },
  sentAt: { th: "ยื่นเมื่อ", en: "Submitted", zh: "提交于" },
  profilePending: { th: "กำลังดึงโปรไฟล์จาก Lark…", en: "Loading profile from Lark…", zh: "正在从 Lark 加载资料…" },
};

/* ---------- ป้าย UI ของแดชบอร์ด ---------- */
export const DASH: Record<string, Tri> = {
  eyebrow: { th: "Approval Intelligence", en: "Approval Intelligence", zh: "审批智能" },
  title: { th: "ภาพรวมการอนุมัติ", en: "Approval Overview", zh: "审批总览" },
  greeting: { th: "สวัสดีครับ คุณ{name} · ติดตามคำขอ มูลค่า ระยะเวลา และงานที่ต้องทำ", en: "Hi {name} · track requests, value, time and work to do", zh: "你好，{name} · 跟踪申请、金额、时长与待办" },
  syncOk: { th: "Sync ปกติ", en: "Sync OK", zh: "同步正常" },
  newRequest: { th: "+ สร้างคำขอใหม่", en: "+ New request", zh: "+ 新建申请" },
  // KPI
  kpiTotal: { th: "เอกสารทั้งหมด", en: "Total documents", zh: "单据总数" },
  kpiFormsMonth: { th: "{forms} ฟอร์ม · เดือนนี้ {month}", en: "{forms} forms · this month {month}", zh: "{forms} 个表单 · 本月 {month}" },
  kpiValue: { th: "มูลค่าคำขอรวม", en: "Total request value", zh: "申请总金额" },
  kpiValueSub: { th: "ตามที่กรอก (THB เป็นหลัก)", en: "as entered (THB base)", zh: "按填写（以泰铢为主）" },
  kpiRate: { th: "อัตราอนุมัติ", en: "Approval rate", zh: "通过率" },
  kpiApproved: { th: "{n} อนุมัติ", en: "{n} approved", zh: "{n} 已通过" },
  kpiPending: { th: "รออนุมัติ", en: "Pending", zh: "待审批" },
  kpiInProgress: { th: "{n}% กำลังดำเนินการ", en: "{n}% in progress", zh: "{n}% 进行中" },
  kpiCycle: { th: "เวลาอนุมัติเฉลี่ย", en: "Avg. approval time", zh: "平均审批时长" },
  days: { th: "วัน", en: "days", zh: "天" },
  d: { th: "ว.", en: "d", zh: "天" },
  submitToDone: { th: "ยื่น → เสร็จ", en: "submit → done", zh: "提交 → 完成" },
  // Need attention
  needAttention: { th: "ต้องดำเนินการ", en: "Need Attention", zh: "需处理" },
  naPending: { th: "รออนุมัติ", en: "Pending", zh: "待审批" },
  naPendingSub: { th: "มูลค่า {v} กำลังค้าง", en: "{v} outstanding", zh: "{v} 待处理" },
  naReject: { th: "ถอน/ปฏิเสธ", en: "Withdrawn/Rejected", zh: "撤回/拒绝" },
  naRejectSub: { th: "{n}% ของทั้งหมด", en: "{n}% of all", zh: "占全部 {n}%" },
  naNotPosted: { th: "อนุมัติแล้วยังไม่ลงบัญชี", en: "Approved, not posted", zh: "已通过未入账" },
  naNotPostedSub: { th: "รอฝ่ายบัญชี", en: "awaiting accounting", zh: "等待会计" },
  naFiles: { th: "มีไฟล์แนบ", en: "With attachments", zh: "有附件" },
  naFilesSub: { th: "พร้อมตรวจเอกสาร", en: "ready to review", zh: "可审阅文件" },
  // aging
  age01: { th: "วันนี้ (0–1 วัน)", en: "Today (0–1 d)", zh: "今天（0–1 天）" },
  age13: { th: "1 – 3 วัน", en: "1 – 3 days", zh: "1 – 3 天" },
  age47: { th: "4 – 7 วัน", en: "4 – 7 days", zh: "4 – 7 天" },
  age7: { th: "มากกว่า 7 วัน", en: "Over 7 days", zh: "超过 7 天" },
  // sections
  secStatus: { th: "สถานะการอนุมัติ", en: "Approval status", zh: "审批状态" },
  secTrend: { th: "แนวโน้มคำขอ", en: "Request trend", zh: "申请趋势" },
  secSla: { th: "ประสิทธิภาพตามประเภทคำขอ", en: "Performance by type", zh: "按类型绩效" },
  secAging: { th: "อายุงานที่รออนุมัติ", en: "Pending aging", zh: "待审批时效" },
  secByForm: { th: "ตามประเภทฟอร์ม", en: "By form type", zh: "按表单类型" },
  secSpending: { th: "มูลค่าตามประเภทคำขอ", en: "Value by type", zh: "按类型金额" },
  secBottleneck: { th: "คอขวดการอนุมัติ", en: "Approval bottleneck", zh: "审批瓶颈" },
  secDept: { th: "ภาพรวมตามแผนก", en: "By department", zh: "按部门" },
  secRecent: { th: "เอกสารล่าสุด", en: "Recent documents", zh: "最新单据" },
  // table headers / hints
  colType: { th: "ประเภทคำขอ", en: "Request type", zh: "申请类型" },
  colPending: { th: "รออนุมัติ", en: "Pending", zh: "待审批" },
  slaHint: { th: "Avg/P90 = เวลาตั้งแต่ยื่นจนเสร็จ · P90 เผยงานที่ใช้เวลานานผิดปกติ (ค่าเฉลี่ยเดียวซ่อนได้)", en: "Avg/P90 = time from submit to done · P90 reveals unusually slow cases (a single average hides them)", zh: "Avg/P90 = 从提交到完成的时长 · P90 揭示异常耗时的案例（单一平均会掩盖）" },
  viewPending: { th: "ดูค้าง →", en: "View pending →", zh: "查看待办 →" },
  noPending: { th: "ไม่มีเอกสารรออนุมัติ 🎉", en: "No pending documents 🎉", zh: "没有待审批单据 🎉" },
  over7: { th: "⚠ ค้างเกิน 7 วัน {n} ใบ — ควรเร่งดำเนินการ", en: "⚠ {n} over 7 days — should expedite", zh: "⚠ {n} 单超过 7 天 — 应加快处理" },
  noValue: { th: "ยังไม่มีข้อมูลมูลค่า", en: "No value data yet", zh: "暂无金额数据" },
  bottleneckRight: { th: "เอกสารรออนุมัติ แยกตามผู้ดำเนินการ/ขั้น", en: "Pending documents by handler/step", zh: "按处理人/节点的待审批单据" },
  noBottleneck: { th: "ไม่มีเอกสารค้างรออนุมัติ 🎉", en: "No stuck documents 🎉", zh: "没有积压单据 🎉" },
  colStepHandler: { th: "ขั้น / ผู้ดำเนินการ", en: "Step / Handler", zh: "节点 / 处理人" },
  colAvgWait: { th: "รอเฉลี่ย", en: "Avg wait", zh: "平均等待" },
  colStuckValue: { th: "มูลค่าที่ค้าง", en: "Stuck value", zh: "积压金额" },
  bottleneckHint: { th: "รอเฉลี่ย = วันนับจากยื่นถึงวันนี้ (ยังไม่ปิด) · แดง = เกิน 7 วัน · ช่วยชี้ว่างานกองที่ใคร/ขั้นไหน", en: "Avg wait = days from submit to today (still open) · red = over 7 days · shows where work piles up", zh: "平均等待 = 从提交到今天（仍未关闭）· 红色 = 超过 7 天 · 显示积压在谁/哪一步" },
  colDeptName: { th: "แผนก", en: "Department", zh: "部门" },
  colCount: { th: "จำนวน", en: "Count", zh: "数量" },
  colApproved: { th: "อนุมัติ", en: "Approved", zh: "已通过" },
  colRejWd: { th: "ปฏิเสธ/ถอน", en: "Rej./Wd.", zh: "拒绝/撤回" },
  colAvgTime: { th: "เวลาเฉลี่ย", en: "Avg time", zh: "平均时长" },
  viewAll: { th: "ดูทั้งหมด →", en: "View all →", zh: "查看全部 →" },
  colNo: { th: "เลขที่", en: "No.", zh: "单号" },
  colForm: { th: "ฟอร์ม", en: "Form", zh: "表单" },
  colApplicant: { th: "ผู้ยื่น", en: "Applicant", zh: "发起人" },
  colDept: { th: "แผนก", en: "Department", zh: "部门" },
  colDate: { th: "วันที่", en: "Date", zh: "日期" },
  colStatus: { th: "สถานะ", en: "Status", zh: "状态" },
  emptyRange: { th: "ไม่มีข้อมูลในช่วง/ตัวกรองนี้", en: "No data for this range/filter", zh: "此范围/筛选无数据" },
};
