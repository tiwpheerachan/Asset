/**
 * Seed ฟอร์มค่าใช้จ่าย 2 ใบเข้าระบบ OA (idempotent — รันซ้ำได้ ลบของเดิม code เดียวกันแล้วใส่ใหม่)
 *   1. DAILY_EXPENSE  ค่าใช้จ่ายประจำวัน / 日常费用申请单
 *   2. BRANCH_COST    ค่าใช้จ่ายสาขา / 门店费用申请单
 * ออกแบบตาม OA_Expense_Forms_Current_State.md
 *
 * รัน:  DATABASE_URL=postgresql://localhost:5432/approve_dev node scripts/seed-expense-forms.mjs
 */
import pg from "pg";

const DEPARTMENTS = ["HR", "KAM", "MKT", "TT", "offline", "Accounting", "Warehouse", "Service", "Admin", "IT", "General Manager's Office / 综合办公室"];
// brand & 品牌 — แบรนด์สินค้า (ตามภาพ dropdown จริง)
const BRANDS = ["composite / 综合", "70mai", "DDPai", "Dreame", "JIMMY", "Levoit", "Maimo", "Perysmith", "Wanbo", "Zepp", "Anker", "Xiaomi", "MOVA", "TOP TOY", "SHEBA", "Vinko", "Uwant", "Mibro"];
const RECIPIENT_BANKS = ["KBank", "BBL", "CIMB", "Krungsri", "KTB", "LH Bank", "SCB", "SCBT", "TMBThanachart", "UOB", "Citibank", "จ่ายผ่านเงินเดือน / 薪资发放"];
// payment bank & 付款账户 — บริษัท/แบรนด์ผู้จ่าย (ตามภาพ dropdown จริง)
const PAYMENT_ACCOUNTS = ["SHD", "RABBIT", "TOP ONE", "อื่นๆ (ส่วนตัว) / 其他（个人）", "PTC Distribution", "Hashtag", "LELA FELA", "Teranova"];
const PLATFORMS = ["Canva", "Meta ADS", "Meta VERIFIED", "Shopify", "TikTok", "Trello", "Google", "Facebook", "Shopee", "Lazada", "THNIC"];
// สกุลเงิน — เลือกได้ (THB เป็นค่าหลัก)
const CURRENCIES = ["THB / บาท", "CNY / 人民币", "USD / ดอลลาร์"];

/**
 * Charge Type — รายการเต็มตาม OA_Expense_Forms_Current_State.md (§8)
 * OA dropdown เป็น flat list (ไม่มี optgroup) จึงเติมชื่อกลุ่มนำหน้าแต่ละรายการให้หาง่าย
 */
// ตรงกับ OA_Expense_Forms_Field_Spec.md §5 [ML-06] — 78 รายการ 7 กลุ่ม (A–G)
const CHARGE_GROUPS = {
  "A — ภาษี / 税": ["(PND1) 个人所得税", "(PND3) 个人所得税预扣预缴", "(PND53) 企业所得税", "(PP30) 应缴销售税 / 增值税", "(PP36) 增值税境外", "(PND54) 服务费预扣税", "(PND50) 净利润应纳企业所得税", "(PND51) 企业半年申报", "ภาษี ภงด / 公司税金", "ภาษีเงินได้บุคคล / 个人所得税", "(PT40) 利息所得税", "ภาษีที่ดิน / 土地税", "ภาษีอื่น / 其他税费", "หัก 1%", "หัก 2%", "หัก 3%", "หัก 5%"],
  "B — HR / Personnel": ["เงินเดือน / 工资", "การจ่ายเงินประกันสังคม / 社保", "พนักงานพาร์ทไทม์ / 临时工资", "ค่าสวัสดิการ / 福利费", "ค่าชดเชยเลิกจ้าง / 解雇补偿金", "ค่าครองชีพ / 生活补贴", "กองทุน / 学生基金", "Visa", "Work Permit", "ค่าธรรมเนียม Visa / Work Permit"],
  "C — Office / Administration": ["เครื่องใช้สำนักงาน / 办公设备", "วัสดุสิ้นเปลืองในสำนักงาน", "ค่าอินเทอร์เน็ต", "ค่าโทรศัพท์มือถือ", "ค่าทำความสะอาด / 清洁费", "ค่าบริหารจัดการ / 管理费", "ค่าปรึกษา / 咨询费", "ค่าตรวจสอบบัญชี / 审计费", "ค่าธรรมเนียมการลงทะเบียน", "ค่าธรรมเนียมอื่น / 其他费用"],
  "D — Transport / Logistics": ["ค่าน้ำมัน", "ค่าทางด่วน", "ค่าซ่อมบำรุงรถ", "ค่าใช้จ่ายในการเดินทาง / 差旅费", "Office ค่าขนส่ง / เติมน้ำมัน", "Offline ค่าจัดส่ง / 线下快递费", "KOL ค่าจัดส่ง / KOL快递费", "ค่าส่ง Service / 售后快递费"],
  "E — Marketing / Commercial": ["MKT", "ค่าประชาสัมพันธ์", "ค่ารับรองลูกค้า / 招待费", "MCN 直播合作费", "ค่า KOL", "ค่าธรรมเนียมแนะนำ", "ค่ารับรองผลิตภัณฑ์ / 产品认证费用", "ค่าคอมมิชชั่น", "ค่าคอมมิชชั่น Sale", "ค่าคอมมิชชั่น PC", "ค่าคอมมิชชั่นศูนย์การค้า", "Shop Event"],
  "F — Service / Operation": ["ค่าบริการ / 服务费用", "ค่าบริการ Software / 软件服务费", "Service / 售后维修工具", "ค่าติดตั้งอุปกรณ์ / 设备安装费", "วัสดุบรรจุภัณฑ์ / 仓库包装用品", "ค่าซ่อมบำรุง", "ค่าก่อสร้าง", "ประกันภัย", "ค่าน้ำ / 水费", "ค่าไฟ / 电费"],
  "G — Finance / Other": ["ค่าเช่า / 租金", "เงินกู้ / 贷款", "เงินยืม / 借款", "ดอกเบี้ยจ่าย / 利息", "เงินทดรองจ่าย / 备用金", "ถอนเงินล่วงหน้า / 预支现金", "เงินฝาก / 押金", "Refund", "คืนสินค้า / 退货", "Credit Note", "ค่าเบี้ยปรับ / 罚款"],
};
// ระบบจริงเป็น flat list รายการล้วน ๆ (ไม่มีหัวข้อกลุ่มนำหน้า) — ยุบทุกกลุ่มเป็นลิสต์เดียว
const CHARGE_TYPES = Object.values(CHARGE_GROUPS).flat();

// Branch Cost — รายการ "รายละเอียด / 明细" เต็มตาม OA_Current_Forms_Dropdown_Detail.md §4.2
const BRANCH_EXPENSES = [
  "ใบปลิว/กระดาษอาร์ต / 宣传册", "หัก 1%", "หัก 2%", "หัก 3%", "หัก 5%",
  "ค่าน้ำมัน / ค่าทางด่วน / 油费·高速费", "ค่าคอมมิชชั่นที่ครอบคลุม / 综合", "ค่าเบี้ยเลี้ยง / 展柜", "ค่าอุปกรณ์สิ้นเปลือง / 安装配件·物料",
  "ค่ารับรองลูกค้า / 招待费", "ค่าเช่า / 租金", "ค่าใช้จ่ายสำนักงานรายวัน", "ค่าคอมมิชชั่น PC", "Shop Event / 门店展会费用",
  "Refund / 退货退款", "ค่าประชาสัมพันธ์ / 宣传费", "Credit Note", "ค่าน้ำ / 水费", "ค่าไฟ / 电费",
  "ค่าอินเทอร์เน็ต / ค่าโทรศัพท์มือถือ", "ค่าก่อสร้าง / 装修费", "ประกันภัย / 保险", "เงินฝาก / 押金", "เงินเดือน / 工资",
  "ค่าคอมมิชชั่นของศูนย์การค้า", "ค่าธรรมเนียมการแนะนำ PC", "ค่าคอมมิชชั่น Sale / 提成", "ค่าส่ง Service / 售后快递费",
  "ค่าธรรมเนียมอื่น ๆ / 其他费用·手续费", "ค่าบริการ / 服务费", "ค่าจัดการวัสดุ / 物料费", "เงินทดรองจ่าย / 备用金",
  "ภาษีป้ายโฆษณา / 广告牌税", "ค่าที่พัก / 住宿费", "ค่าธรรมเนียมการจัดเก็บ / 仓储费", "ค่าเดินทาง / 差旅费",
  "ค่าซอฟต์แวร์และการใช้งาน", "เครื่องใช้สำนักงาน / 办公设备", "ค่าทำความสะอาด / 清洁费", "พนักงานพาร์ทไทม์ / 临时工资",
  "ค่าบริหารจัดการ / 管理费", "ภาษีที่ดิน / 土地税", "ค่าเบี้ยปรับ / 罚款", "ค่าภาษีอื่น / 其他税费", "ค่าปรึกษา / 咨询费",
  "ค่าธรรมเนียมการแนะนำ / 中介推荐费",
];
const BRANCHES = [
  "70mai Ramindra", "70mai Kanjana", "70mai Tha Phra", "70mai Chonburi", "70mai Rangsit", "70mai Ratchaphruek", "70mai Srinakarin",
  "Dreame Central Rama 2", "Dreame Central Westgate", "Dreame Seacon Srinakarin", "Dreame Central Pinklao", "Dreame The Mall Ngamwongwan",
  "Dreame Mega Bangna", "Dreame Seacon Bangkae", "Dreame Central Bangna", "Dreame Happitat", "Dreame North Ville", "Dreame East Ville",
  "Anker Central World", "Anker Central Park", "Anker Central Rama 9", "Anker Fashion Island", "Anker Central Pinklao", "Anker The Mall Bangkapi",
  "Anker The Mall Ngamwongwan", "Anker North Ville", "Anker Central Khon Kaen", "Anker Central Rama 2", "Anker Central Westgate", "Anker Future Park Rangsit",
  "Vending-BTS Siam ANKER", "Vending-Anker Mega Bangna", "DDPAI SUSCO Pinklao",
];

/** หนังสือประกาศ (กล่องคำแนะนำด้านบนฟอร์ม) — ตรงกับฟอร์มจริง */
const ANNOUNCEMENT = [
  "1. มีใบแจ้งหนี้/ใบเสนอราคา ชื่อที่อยู่บริษัท ให้ถูกต้อง",
  "2. กรณีมีหัก ณ ที่จ่าย — ค่าบริการ หัก 3% · ค่าขนส่ง 1% · ค่าเช่า 5% · ค่าโฆษณา 2%",
  "3. รบกวนหักยอดภาษีหัก ณ ที่จ่าย ก่อนโอน ด้วยนะคะ (กรณีมีหัก ณ ที่จ่าย)",
  "⚠️ ถ้าใบแจ้งหนี้ไม่ใช่อิเล็กทรอนิกส์ ต้องส่งตัวจริงมาค่ะ",
  "⚠️ ใบเสร็จ/ใบกำกับต้องออกให้ตรงกับวันที่ชำระเงินด้วยนะคะ",
  "⚠️ ส่งทางจดหมาย ส่งที่ ICS ค่ะ",
  "",
  "บริษัท เอสเอชดี เทคโนโลยี จำกัด (แผนกบัญชี)",
  "อาคาร ไอซีเอส ห้องเลขที่ 701 ชั้นที่ 7 เลขที่ 168",
  "ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร 10600",
  "โทร. 083-9754419",
  "⚠️ อิเล็กทรอนิกส์ส่งไปที่อีเมล acc.rab.shd@gmail.com",
].join("\n");

/** flow การเงิน 3 ขั้น: หัวหน้าต้นสังกัด → ผู้จัดการฝ่ายบัญชี → กรรมการผู้จัดการ */
const FINANCE_FLOW = [
  { name: "หัวหน้าต้นสังกัด", kind: "APPROVE", mode: "SEQUENTIAL", stage: "FINAL", members: [{ source: "JOB_ROLE", job_role: "SALES_MANAGER", scope: "DEPT" }] },
  { name: "ผู้จัดการฝ่ายบัญชี", kind: "APPROVE", mode: "SEQUENTIAL", stage: "FINAL", members: [{ source: "JOB_ROLE", job_role: "FINANCE_MANAGER", scope: "ANY" }] },
  { name: "กรรมการผู้จัดการ", kind: "APPROVE", mode: "SEQUENTIAL", stage: "FINAL", members: [{ source: "JOB_ROLE", job_role: "MD", scope: "ANY" }] },
];

const FORMS = [
  {
    code: "DAILY_EXPENSE",
    name: "ค่าใช้จ่ายประจำวัน / 日常费用",
    icon: "ic:money",
    doc_prefix: "DEX",
    description: "คำขอค่าใช้จ่ายทั่วไป (แผนก/แบรนด์/แพลตฟอร์ม/การตลาด/ออนไลน์) พร้อมรายการค่าใช้จ่ายหลายบรรทัด",
    // ลำดับตรงกับฟอร์มจริง: ประกาศ → header → Total → ตารางรายละเอียด
    fields: [
      { key: "notice", label: "หนังสือประกาศ / 公告", type: "HEADING", help: ANNOUNCEMENT },
      { key: "topic", label: "topic & 主题", type: "TEXT", role: "TITLE", required: 1, placeholder: "what cost & 什么费用" },
      { key: "payment_bank", label: "payment bank & 付款账户", type: "DROPDOWN", required: 1, options: PAYMENT_ACCOUNTS },
      { key: "payment_date", label: "Latest payment date & 付款日期", type: "DATE", role: "DATE", required: 1 },
      { key: "department", label: "department & 部门", type: "DROPDOWN", required: 1, options: DEPARTMENTS },
      { key: "brand", label: "brand & 品牌", type: "DROPDOWN", required: 1, options: BRANDS },
      { key: "payee_name", label: "ชื่อผู้รับเงิน / 收款人姓名", type: "TEXT", required: 1 },
      { key: "recipient_bank", label: "ธนาคาร / 银行", type: "DROPDOWN", required: 1, options: RECIPIENT_BANKS },
      { key: "bank_account", label: "หมายเลขบัญชีธนาคาร / 银行账号", type: "TEXT", required: 1 },
      { key: "total", label: "Total Amount / 汇总金额", type: "TOTAL", role: "AMOUNT", sum_of: "items.amount" },
      {
        key: "items", label: "Details / 明细", type: "TABLE", required: 1,
        columns: [
          { col: "platform", label: "แพลตฟอร์ม / 平台", type: "DROPDOWN", options: PLATFORMS },
          { col: "charge_type", label: "Charge Type & 费用类型", type: "DROPDOWN", required: 1, options: CHARGE_TYPES },
          { col: "amount", label: "金额", type: "MONEY", required: 1 },
          { col: "currency", label: "สกุลเงิน / 币种", type: "DROPDOWN", required: 1, options: CURRENCIES },
          { col: "invoice", label: "invoice & Quotation / 发票·报价单", type: "FILE", required: 1 },
          { col: "order_no", label: "เลขที่คำสั่งซื้อ / 平台订单号", type: "TEXT" },
          { col: "order_brand", label: "Brand / 订单品牌", type: "DROPDOWN", options: BRANDS },
          { col: "remark", label: "Attachment description & 备注", type: "TEXT" },
          { col: "contact", label: "ผู้ใช้ / 联系人", type: "USER" },
        ],
      },
    ],
    flow: FINANCE_FLOW,
  },
  {
    code: "BRANCH_COST",
    name: "ค่าใช้จ่ายสาขา / 门店费用",
    icon: "ic:doc",
    doc_prefix: "BRC",
    description: "คำขอค่าใช้จ่ายของสาขา/หน้าร้าน (เช่า ค่าน้ำไฟ ตกแต่ง บริการ) พร้อมอ้างอิง CN-JST Order",
    // ลำดับตรงกับฟอร์มจริง: ประกาศ → topic/สาขา/วันที่ → ตาราง → Total → ผู้รับเงิน/ธนาคาร → payment bank → หมายเหตุ
    fields: [
      { key: "notice", label: "หนังสือประกาศ / 公告", type: "HEADING", help: ANNOUNCEMENT },
      { key: "topic", label: "topic & 主题", type: "TEXT", role: "TITLE", required: 1, placeholder: "which brand which cost & 哪个品牌哪个费用" },
      { key: "branch", label: "สาขา / 门店", type: "DROPDOWN", required: 1, options: BRANCHES },
      { key: "payment_date", label: "Latest payment date & 付款日期", type: "DATE", role: "DATE", required: 1 },
      {
        key: "items", label: "Charge Type & 费用类型", type: "TABLE", required: 1,
        columns: [
          { col: "expense_detail", label: "รายละเอียด / 明细", type: "DROPDOWN", required: 1, options: BRANCH_EXPENSES },
          { col: "amount", label: "Payment amount & 金额", type: "MONEY", required: 1 },
          { col: "currency", label: "สกุลเงิน / 币种", type: "DROPDOWN", required: 1, options: CURRENCIES },
          { col: "invoice", label: "invoice / 发票", type: "FILE", required: 1 },
          { col: "cn_jst_order", label: "CN-JST Order", type: "TEXT" },
        ],
      },
      { key: "total", label: "เงินทั้งหมด / 总金额", type: "TOTAL", role: "AMOUNT", sum_of: "items.amount" },
      { key: "payee_name", label: "ชื่อผู้รับเงิน / 收款人姓名", type: "TEXT", required: 1 },
      { key: "recipient_bank", label: "ธนาคาร / 银行", type: "DROPDOWN", required: 1, options: RECIPIENT_BANKS },
      { key: "bank_account", label: "หมายเลขบัญชีธนาคาร / 银行账号", type: "TEXT", required: 1 },
      { key: "payment_bank", label: "payment bank & 付款账户", type: "DROPDOWN", required: 1, options: PAYMENT_ACCOUNTS },
      { key: "attachment_desc", label: "Attachment description & 备注", type: "TEXTAREA" },
    ],
    flow: FINANCE_FLOW,
  },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ไม่ได้ตั้ง DATABASE_URL — ตัวอย่าง: postgresql://localhost:5432/approve_dev");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });

async function catId(name) {
  const r = await client.query("SELECT id FROM form_categories WHERE name = $1", [name]);
  if (r.rowCount) return r.rows[0].id;
  const ins = await client.query(
    "INSERT INTO form_categories (name, sort_order) VALUES ($1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM form_categories)) RETURNING id",
    [name],
  );
  return ins.rows[0].id;
}

/** ลบเฉพาะ fields/columns/flow ของ template (ปลอดภัยแม้มี request อ้าง template อยู่) */
async function clearChildren(tplId) {
  await client.query("DELETE FROM form_table_columns WHERE field_id IN (SELECT id FROM form_fields WHERE template_id=$1)", [tplId]);
  await client.query("DELETE FROM form_fields WHERE template_id=$1", [tplId]);
  await client.query("DELETE FROM flow_node_members WHERE node_id IN (SELECT id FROM flow_nodes WHERE template_id=$1)", [tplId]);
  await client.query("DELETE FROM flow_nodes WHERE template_id=$1", [tplId]);
}

async function insertForm(form, categoryId, sortOrder) {
  // มีอยู่แล้ว → update row เดิม (คง id ให้ request ไม่พัง) · ไม่มี → insert ใหม่
  const existing = await client.query("SELECT id FROM form_templates WHERE code=$1", [form.code]);
  let tplId;
  if (existing.rowCount) {
    tplId = existing.rows[0].id;
    await client.query(
      `UPDATE form_templates SET name=$2, category_id=$3, icon=$4, description=$5, doc_prefix=$6, updated_at=now() WHERE id=$1`,
      [tplId, form.name, categoryId, form.icon, form.description, form.doc_prefix],
    );
    await clearChildren(tplId);
    console.log("  (อัปเดตฟอร์มเดิม code=" + form.code + " id=" + tplId + ")");
  } else {
    const tpl = await client.query(
      `INSERT INTO form_templates (code, name, category_id, icon, description, sort_order, doc_prefix)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [form.code, form.name, categoryId, form.icon, form.description, sortOrder, form.doc_prefix],
    );
    tplId = tpl.rows[0].id;
  }
  let fo = 0;
  for (const f of form.fields) {
    const field = await client.query(
      `INSERT INTO form_fields (template_id, field_key, label, type, field_role, required, options, sort_order, sum_of, help, placeholder)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [tplId, f.key, f.label, f.type, f.role ?? "", f.required ?? 0, JSON.stringify(f.options ?? []), fo++, f.sum_of ?? "", f.help ?? "", f.placeholder ?? ""],
    );
    const fieldId = field.rows[0].id;
    let co = 0;
    for (const c of f.columns ?? []) {
      await client.query(
        `INSERT INTO form_table_columns (field_id, col_key, label, type, required, options, sort_order, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [fieldId, c.col, c.label, c.type ?? "TEXT", c.required ?? 0, JSON.stringify(c.options ?? []), co++, c.unit ?? ""],
      );
    }
  }
  let no = 0;
  for (const n of form.flow) {
    const node = await client.query(
      `INSERT INTO flow_nodes (template_id, name, kind, mode, stage, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [tplId, n.name, n.kind, n.mode, n.stage, no++],
    );
    for (const m of n.members) {
      await client.query(
        `INSERT INTO flow_node_members (node_id, source, job_role, scope) VALUES ($1,$2,$3,$4)`,
        [node.rows[0].id, m.source, m.job_role, m.scope],
      );
    }
  }
  console.log(`✓ เพิ่มฟอร์ม ${form.code} — ${form.name} (${form.fields.length} ฟิลด์, ${form.flow.length} ขั้นอนุมัติ)`);
}

async function main() {
  await client.connect();
  const cat = await catId("การเงิน");
  const base = (await client.query("SELECT COALESCE(MAX(sort_order),0) AS m FROM form_templates")).rows[0].m;
  let i = 1;
  for (const form of FORMS) await insertForm(form, cat, Number(base) + i++);
  await client.end();
  console.log("เสร็จสิ้น — เพิ่ม 2 ฟอร์มค่าใช้จ่ายเข้าระบบ OA แล้ว");
}
main().catch((e) => { console.error(e); process.exit(1); });
