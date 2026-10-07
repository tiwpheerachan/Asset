import type {
  Account,
  AppUser,
  Branch,
  Category,
  Company,
  CostCenter,
  Department,
  DepPolicy,
  Localized,
  Location,
  OAIntegration,
  RunningNumberConfig,
} from '@/lib/types';

/* ------------------------------------------------------------------
 * Organisation masters
 * NOTE: Company + accounts + categories come from the real legacy export.
 * Branches / departments / cost centers / locations are DEMO values —
 * replace in Settings (or via db seed) before go-live.
 * ------------------------------------------------------------------ */

export const COMPANIES: Company[] = [
  {
    id: 'C-SHD',
    code: 'SHD',
    name: { th: 'บริษัท เอสเอชดี เทคโนโลยี จำกัด', en: 'SHD Technology Co., Ltd.', zh: 'SHD 科技有限公司' },
    taxId: '0105XXXXXXXXX',
    active: true,
  },
];

export const BRANCHES: Branch[] = [
  { id: 'B-HQ', code: 'HQ', companyId: 'C-SHD', name: { th: 'สำนักงานใหญ่', en: 'Head Office', zh: '总部' }, address: 'Bangkok', active: true },
  { id: 'B-WH', code: 'WH', companyId: 'C-SHD', name: { th: 'คลังสินค้า', en: 'Warehouse', zh: '仓库' }, address: 'Bangkok', active: true },
  { id: 'B-STU', code: 'STU', companyId: 'C-SHD', name: { th: 'Live Studio', en: 'Live Studio', zh: '直播间' }, address: 'Bangkok', active: true },
  { id: 'B-SR', code: 'SR', companyId: 'C-SHD', name: { th: 'หน้าร้าน / Showroom', en: 'Showroom', zh: '门店展厅' }, address: 'Bangkok', active: true },
];

export const DEPARTMENTS: Department[] = [
  { id: 'D-ACC', code: 'ACC', name: { th: 'บัญชีและการเงิน', en: 'Accounting & Finance', zh: '财务会计部' }, active: true },
  { id: 'D-ADM', code: 'ADM', name: { th: 'ธุรการ', en: 'Administration', zh: '行政部' }, active: true },
  { id: 'D-IT', code: 'IT', name: { th: 'ไอทีและนวัตกรรม', en: 'IT & Innovation', zh: '信息技术与创新部' }, active: true },
  { id: 'D-LIVE', code: 'LIVE', name: { th: 'ไลฟ์คอมเมิร์ซ', en: 'Live Commerce', zh: '直播电商部' }, active: true },
  { id: 'D-ECOM', code: 'ECOM', name: { th: 'อีคอมเมิร์ซ', en: 'E-commerce', zh: '电商部' }, active: true },
  { id: 'D-SALES', code: 'SALES', name: { th: 'ฝ่ายขาย', en: 'Sales', zh: '销售部' }, active: true },
  { id: 'D-MKT', code: 'MKT', name: { th: 'การตลาด', en: 'Marketing', zh: '市场部' }, active: true },
  { id: 'D-LOG', code: 'LOG', name: { th: 'คลังและโลจิสติกส์', en: 'Warehouse & Logistics', zh: '仓储物流部' }, active: true },
  { id: 'D-HR', code: 'HR', name: { th: 'ทรัพยากรบุคคล', en: 'Human Resources', zh: '人力资源部' }, active: true },
];

export const COST_CENTERS: CostCenter[] = DEPARTMENTS.map((d, i) => ({
  id: `CC-${d.code}`,
  code: `CC${String(100 + i * 10)}`,
  departmentId: d.id,
  name: d.name,
  active: true,
}));

export const LOCATIONS: Location[] = [
  { id: 'L-HQ-1', code: 'HQ-A-01', companyId: 'C-SHD', branchId: 'B-HQ', building: 'A', floor: '1', room: 'Reception', name: { th: 'สำนักงานใหญ่ ชั้น 1 — ต้อนรับ', en: 'HQ Fl.1 — Reception', zh: '总部 1楼 — 前台' }, active: true },
  { id: 'L-HQ-2', code: 'HQ-A-02', companyId: 'C-SHD', branchId: 'B-HQ', building: 'A', floor: '2', room: 'Open office', name: { th: 'สำนักงานใหญ่ ชั้น 2 — Open office', en: 'HQ Fl.2 — Open office', zh: '总部 2楼 — 开放办公区' }, active: true },
  { id: 'L-HQ-3', code: 'HQ-A-03', companyId: 'C-SHD', branchId: 'B-HQ', building: 'A', floor: '3', room: 'Accounting', name: { th: 'สำนักงานใหญ่ ชั้น 3 — บัญชี', en: 'HQ Fl.3 — Accounting', zh: '总部 3楼 — 财务室' }, active: true },
  { id: 'L-HQ-SRV', code: 'HQ-A-SRV', companyId: 'C-SHD', branchId: 'B-HQ', building: 'A', floor: '3', room: 'Server room', name: { th: 'สำนักงานใหญ่ ชั้น 3 — ห้อง Server', en: 'HQ Fl.3 — Server room', zh: '总部 3楼 — 机房' }, active: true },
  { id: 'L-WH-A', code: 'WH-A', companyId: 'C-SHD', branchId: 'B-WH', building: 'WH', floor: 'G', room: 'Zone A', name: { th: 'คลังสินค้า — โซน A', en: 'Warehouse — Zone A', zh: '仓库 — A区' }, active: true },
  { id: 'L-WH-DOCK', code: 'WH-DOCK', companyId: 'C-SHD', branchId: 'B-WH', building: 'WH', floor: 'G', room: 'Loading dock', name: { th: 'คลังสินค้า — ลานขนถ่าย', en: 'Warehouse — Loading dock', zh: '仓库 — 装卸区' }, active: true },
  { id: 'L-STU-1', code: 'STU-01', companyId: 'C-SHD', branchId: 'B-STU', building: 'S', floor: '1', room: 'Studio 1', name: { th: 'Live Studio — ห้อง 1', en: 'Live Studio — Room 1', zh: '直播间 — 1号房' }, active: true },
  { id: 'L-STU-2', code: 'STU-02', companyId: 'C-SHD', branchId: 'B-STU', building: 'S', floor: '1', room: 'Studio 2', name: { th: 'Live Studio — ห้อง 2', en: 'Live Studio — Room 2', zh: '直播间 — 2号房' }, active: true },
  { id: 'L-SR-1', code: 'SR-01', companyId: 'C-SHD', branchId: 'B-SR', building: 'SR', floor: 'G', room: 'Front counter', name: { th: 'หน้าร้าน — เคาน์เตอร์', en: 'Showroom — Front counter', zh: '门店 — 前台' }, active: true },
];

/* ------------------------------------------------------------------ Accounts (from legacy export) */
// id = รหัสถาวร (ตั้งครั้งเดียวจาก code ตอน seed) · code = เลขผังบัญชีที่เปลี่ยนได้ภายหลัง
const RAW_ACCOUNTS: Omit<Account, 'id'>[] = [
  // ---- สินทรัพย์ (ASSET) ----
  { code: '124101', kind: 'ASSET', name: { th: 'อาคารและสิ่งปลูกสร้าง', en: 'Buildings & structures', zh: '建筑物' } },
  { code: '124102', kind: 'ASSET', name: { th: 'ส่วนปรับปรุงและตกแต่ง', en: 'Leasehold improvements', zh: '装修及改良' } },
  { code: '124103', kind: 'ASSET', name: { th: 'เครื่องจักร', en: 'Machinery', zh: '机器设备' } },
  { code: '124106', kind: 'ASSET', name: { th: 'อุปกรณ์สำนักงาน', en: 'Office equipment', zh: '办公设备' } },
  { code: '124107', kind: 'ASSET', name: { th: 'เครื่องตกแต่งสำนักงาน', en: 'Office furniture & fixtures', zh: '办公家具及装饰' } },
  { code: '124108', kind: 'ASSET', name: { th: 'ยานพาหนะ', en: 'Vehicles', zh: '运输工具' } },
  { code: '124109', kind: 'ASSET', name: { th: 'เครื่องมือเครื่องใช้', en: 'Tools & equipment', zh: '工具器具' } },
  { code: '124110', kind: 'ASSET', name: { th: 'อุปกรณ์เครือข่ายและความปลอดภัย', en: 'Network & security equipment', zh: '网络及安防设备' } },
  { code: '124111', kind: 'ASSET', name: { th: 'อุปกรณ์สตูดิโอและถ่ายทำ', en: 'Studio & production equipment', zh: '直播及拍摄设备' } },
  { code: '125101', kind: 'ASSET', name: { th: 'ซอฟต์แวร์', en: 'Software', zh: '软件' } },
  { code: '125102', kind: 'ASSET', name: { th: 'สิทธิการเช่า', en: 'Leasehold rights', zh: '租赁权' } },
  { code: '125103', kind: 'ASSET', name: { th: 'ลิขสิทธิ์และสิทธิบัตร', en: 'Copyright & patents', zh: '版权及专利' } },
  // ---- ค่าเสื่อม/ตัดจำหน่าย (EXPENSE) ----
  { code: '530701', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - อาคาร', en: 'Depreciation — Buildings', zh: '折旧 — 建筑物' } },
  { code: '530702', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - ส่วนปรับปรุงตกแต่ง', en: 'Depreciation — Leasehold improvements', zh: '折旧 — 装修改良' } },
  { code: '530703', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - เครื่องจักร', en: 'Depreciation — Machinery', zh: '折旧 — 机器设备' } },
  { code: '530706', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - อุปกรณ์สำนักงาน', en: 'Depreciation — Office equipment', zh: '折旧费用 — 办公设备' } },
  { code: '530707', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - เครื่องตกแต่งสำนักงาน', en: 'Depreciation — Office furniture', zh: '折旧费用 — 办公家具' } },
  { code: '530708', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - ยานพาหนะ', en: 'Depreciation — Vehicles', zh: '折旧费用 — 运输工具' } },
  { code: '530709', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - เครื่องมือเครื่องใช้', en: 'Depreciation — Tools & equipment', zh: '折旧费用 — 工具器具' } },
  { code: '530710', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - อุปกรณ์เครือข่าย/ความปลอดภัย', en: 'Depreciation — Network & security', zh: '折旧 — 网络安防' } },
  { code: '530711', kind: 'EXPENSE', name: { th: 'ค่าเสื่อมราคา - อุปกรณ์สตูดิโอ', en: 'Depreciation — Studio equipment', zh: '折旧 — 直播设备' } },
  { code: '530801', kind: 'EXPENSE', name: { th: 'ค่าตัดจำหน่าย - ซอฟต์แวร์', en: 'Amortisation — Software', zh: '摊销费用 — 软件' } },
  { code: '530802', kind: 'EXPENSE', name: { th: 'ค่าตัดจำหน่าย - สิทธิการเช่า', en: 'Amortisation — Leasehold rights', zh: '摊销 — 租赁权' } },
  { code: '530803', kind: 'EXPENSE', name: { th: 'ค่าตัดจำหน่าย - ลิขสิทธิ์/สิทธิบัตร', en: 'Amortisation — Copyright & patents', zh: '摊销 — 版权专利' } },
  // ---- ค่าเสื่อม/ตัดจำหน่ายสะสม (ACCUM) ----
  { code: '124201', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - อาคาร', en: 'Accum. depreciation — Buildings', zh: '累计折旧 — 建筑物' } },
  { code: '124202', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - ส่วนปรับปรุงตกแต่ง', en: 'Accum. depreciation — Leasehold improvements', zh: '累计折旧 — 装修改良' } },
  { code: '124203', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - เครื่องจักร', en: 'Accum. depreciation — Machinery', zh: '累计折旧 — 机器设备' } },
  { code: '124206', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - อุปกรณ์สำนักงาน', en: 'Accum. depreciation — Office equipment', zh: '累计折旧 — 办公设备' } },
  { code: '124207', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - เครื่องตกแต่งสำนักงาน', en: 'Accum. depreciation — Office furniture', zh: '累计折旧 — 办公家具' } },
  { code: '124208', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - ยานพาหนะ', en: 'Accum. depreciation — Vehicles', zh: '累计折旧 — 运输工具' } },
  { code: '124209', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - เครื่องมือเครื่องใช้', en: 'Accum. depreciation — Tools & equipment', zh: '累计折旧 — 工具器具' } },
  { code: '124210', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - อุปกรณ์เครือข่าย/ความปลอดภัย', en: 'Accum. depreciation — Network & security', zh: '累计折旧 — 网络安防' } },
  { code: '124211', kind: 'ACCUM', name: { th: 'ค่าเสื่อมราคาสะสม - อุปกรณ์สตูดิโอ', en: 'Accum. depreciation — Studio equipment', zh: '累计折旧 — 直播设备' } },
  { code: '125201', kind: 'ACCUM', name: { th: 'ค่าตัดจำหน่ายสะสม - ซอฟต์แวร์', en: 'Accum. amortisation — Software', zh: '累计摊销 — 软件' } },
  { code: '125202', kind: 'ACCUM', name: { th: 'ค่าตัดจำหน่ายสะสม - สิทธิการเช่า', en: 'Accum. amortisation — Leasehold rights', zh: '累计摊销 — 租赁权' } },
  { code: '125203', kind: 'ACCUM', name: { th: 'ค่าตัดจำหน่ายสะสม - ลิขสิทธิ์/สิทธิบัตร', en: 'Accum. amortisation — Copyright & patents', zh: '累计摊销 — 版权专利' } },
];

export const ACCOUNTS: Account[] = RAW_ACCOUNTS.map((a) => ({ id: `ACC-${a.code}`, ...a }));
/** code → immutable id (ใช้ตอน seed หมวดหมู่ให้ชี้บัญชีด้วย id) */
const ACC_ID = new Map(ACCOUNTS.map((a) => [a.code, a.id]));
const accId = (code: string) => ACC_ID.get(code) ?? code;

/* ------------------------------------------------------------------ Categories (from legacy export) */
const cat = (
  id: string,
  code: string,
  parentId: string | null,
  name: Category['name'],
  unit: string,
  acc: [string, string, string],
  lifeYears = 5, // ค่าเริ่มต้นต่อหมวด (บัญชีแก้ได้) — อิงอายุขั้นต่ำตามกฎหมายภาษีไทย
): Category => ({
  id,
  code,
  parentId,
  name,
  defaultUnit: unit,
  defaultLifeYears: lifeYears,
  defaultResidual: 1,
  method: 'SL',
  // เก็บเป็น id ถาวรของบัญชี (ไม่ใช่ code) — lookups แปลงเป็น "code — ชื่อ" ให้ตอนแสดง
  assetAccount: accId(acc[0]),
  expenseAccount: accId(acc[1]),
  accumAccount: accId(acc[2]),
  active: true,
});

type Trio = [string, string, string];
const BLD: Trio = ['124101', '530701', '124201'];
const LHD: Trio = ['124102', '530702', '124202'];
const MAC: Trio = ['124103', '530703', '124203'];
const OFE: Trio = ['124106', '530706', '124206'];
const FUR: Trio = ['124107', '530707', '124207'];
const VEH: Trio = ['124108', '530708', '124208'];
const TOOL: Trio = ['124109', '530709', '124209'];
const NET: Trio = ['124110', '530710', '124210'];
const STU: Trio = ['124111', '530711', '124211'];
const SOF: Trio = ['125101', '530801', '125201'];
const LEASE: Trio = ['125102', '530802', '125202'];
const COPY: Trio = ['125103', '530803', '125203'];

/**
 * หมวดหมู่ทรัพย์สิน (2 ระดับ: หมวดหลัก → หมวดย่อย)
 * defaultLifeYears = อายุเริ่มต้นต่อหมวด อิงอายุขั้นต่ำตามกฎหมายภาษี (พ.ร.ฎ.145) — บัญชีปรับได้
 * id เดิม (OFE-COM, FUR-*, VEH-TRK, INT-SOF ฯลฯ) คงไว้เพื่อให้ข้อมูลทรัพย์สินเดิมอ้างอิงได้
 */
export const CATEGORIES: Category[] = [
  // 1) อาคารและสิ่งปลูกสร้าง
  cat('BLD', 'BLD', null, { th: 'อาคารและสิ่งปลูกสร้าง', en: 'Buildings & Structures', zh: '建筑物' }, 'unit', BLD, 20),
  cat('BLD-PERM', 'PERM', 'BLD', { th: 'อาคารถาวร', en: 'Permanent Building', zh: '永久建筑' }, 'unit', BLD, 20),
  cat('BLD-TEMP', 'TEMP', 'BLD', { th: 'สิ่งปลูกสร้างชั่วคราว', en: 'Temporary Structure', zh: '临时建筑' }, 'unit', BLD, 5),
  // 2) ส่วนปรับปรุงและตกแต่ง (leasehold improvement)
  cat('LHD', 'LHD', null, { th: 'ส่วนปรับปรุงและตกแต่ง', en: 'Leasehold Improvements & Renovation', zh: '装修及改良' }, 'unit', LHD, 5),
  cat('LHD-STORE', 'STORE', 'LHD', { th: 'ตกแต่งร้าน / สาขา', en: 'Store / Branch Fit-out', zh: '门店装修' }, 'unit', LHD, 5),
  cat('LHD-OFFICE', 'OFFC', 'LHD', { th: 'ปรับปรุง/ตกแต่งสำนักงาน', en: 'Office Renovation', zh: '办公室装修' }, 'unit', LHD, 5),
  // 3) อุปกรณ์และเครื่องใช้สำนักงาน
  cat('OFE', 'OFE', null, { th: 'อุปกรณ์ และเครื่องใช้สำนักงาน', en: 'Office Equipment', zh: '办公设备及用品' }, 'unit', OFE, 5),
  cat('OFE-COM', 'COM', 'OFE', { th: 'คอมพิวเตอร์ และอุปกรณ์คอมพิวเตอร์', en: 'Computers & Peripherals', zh: '电脑及配件' }, 'unit', OFE, 3),
  cat('OFE-PRT', 'PRT', 'OFE', { th: 'เครื่องพิมพ์ และอุปกรณ์การพิมพ์', en: 'Printers & Printing Equipment', zh: '打印机及打印设备' }, 'unit', OFE, 5),
  cat('OFE-MOB', 'MOB', 'OFE', { th: 'โทรศัพท์มือถือ และอุปกรณ์สื่อสาร', en: 'Mobile Phones & Comm. Devices', zh: '手机及通讯设备' }, 'unit', OFE, 3),
  cat('OFE-AC', 'AC', 'OFE', { th: 'เครื่องปรับอากาศ', en: 'Air Conditioners', zh: '空调' }, 'unit', OFE, 5),
  cat('OFE-APP', 'APP', 'OFE', { th: 'เครื่องใช้ไฟฟ้าสำนักงาน', en: 'Office Appliances', zh: '办公电器' }, 'unit', OFE, 5),
  cat('OFE-OTH', 'OEQ', 'OFE', { th: 'อุปกรณ์ และเครื่องใช้สำนักงานอื่น', en: 'Other Office Equipment', zh: '其他办公设备' }, 'unit', OFE, 5),
  // 4) เครื่องตกแต่งและเฟอร์นิเจอร์
  cat('FUR', 'FUR', null, { th: 'เครื่องตกแต่งและเฟอร์นิเจอร์', en: 'Furniture & Fixtures', zh: '办公家具及装饰' }, 'piece', FUR, 5),
  cat('FUR-CAB', 'CAB', 'FUR', { th: 'ตู้ พื้นที่เก็บของ', en: 'Cabinets & Storage', zh: '柜子及储物' }, 'piece', FUR, 5),
  cat('FUR-CHR', 'CHR', 'FUR', { th: 'เก้าอี้ ที่นั่ง', en: 'Chairs & Seating', zh: '椅子及座椅' }, 'piece', FUR, 5),
  cat('FUR-TAB', 'TAB', 'FUR', { th: 'โต๊ะ', en: 'Desks & Tables', zh: '桌子' }, 'piece', FUR, 5),
  cat('FUR-OTH', 'FUO', 'FUR', { th: 'เครื่องตกแต่งและเฟอร์นิเจอร์อื่น', en: 'Other Furniture & Fixtures', zh: '其他家具装饰' }, 'piece', FUR, 5),
  // 5) อุปกรณ์เครือข่ายและความปลอดภัย
  cat('NET', 'NET', null, { th: 'อุปกรณ์เครือข่ายและความปลอดภัย', en: 'Network & Security Equipment', zh: '网络及安防设备' }, 'unit', NET, 5),
  cat('NET-NET', 'NETW', 'NET', { th: 'อุปกรณ์เครือข่าย (Router/Switch/NVR)', en: 'Network Devices', zh: '网络设备' }, 'unit', NET, 5),
  cat('NET-CCTV', 'CCTV', 'NET', { th: 'กล้องวงจรปิด', en: 'CCTV / Surveillance', zh: '监控摄像' }, 'unit', NET, 5),
  cat('NET-UPS', 'UPS', 'NET', { th: 'ระบบสำรองไฟ (UPS)', en: 'UPS / Power Backup', zh: '不间断电源' }, 'unit', NET, 5),
  // 6) อุปกรณ์สตูดิโอและถ่ายทำ
  cat('STU', 'STU', null, { th: 'อุปกรณ์สตูดิโอและถ่ายทำ', en: 'Studio & Production Equipment', zh: '直播及拍摄设备' }, 'unit', STU, 5),
  cat('STU-CAM', 'CAM', 'STU', { th: 'กล้องและเลนส์', en: 'Cameras & Lenses', zh: '相机及镜头' }, 'unit', STU, 5),
  cat('STU-LIGHT', 'LGT', 'STU', { th: 'ไฟและอุปกรณ์สตูดิโอ', en: 'Lighting & Studio Gear', zh: '灯光及直播设备' }, 'unit', STU, 5),
  cat('STU-AUDIO', 'AUD', 'STU', { th: 'อุปกรณ์เสียง', en: 'Audio Equipment', zh: '音频设备' }, 'unit', STU, 5),
  // 7) เครื่องมือและอุปกรณ์
  cat('TOOL', 'TOOL', null, { th: 'เครื่องมือและอุปกรณ์', en: 'Tools & Equipment', zh: '工具器具' }, 'unit', TOOL, 5),
  cat('TOOL-REP', 'REP', 'TOOL', { th: 'เครื่องมือช่าง / ซ่อมบำรุง', en: 'Repair & Service Tools', zh: '维修工具' }, 'unit', TOOL, 5),
  cat('TOOL-WH', 'WHT', 'TOOL', { th: 'อุปกรณ์คลังสินค้า (รถเข็น/ชั้นวาง)', en: 'Warehouse Equipment', zh: '仓库设备' }, 'unit', TOOL, 5),
  // 8) เครื่องจักร
  cat('MAC', 'MAC', null, { th: 'เครื่องจักร', en: 'Machinery', zh: '机器设备' }, 'unit', MAC, 5),
  cat('MAC-PROD', 'PROD', 'MAC', { th: 'เครื่องจักรผลิต / บรรจุ', en: 'Production / Packing Machinery', zh: '生产包装机器' }, 'unit', MAC, 5),
  // 9) ยานพาหนะ
  cat('VEH', 'VEH', null, { th: 'ยานพาหนะ', en: 'Vehicles', zh: '运输工具' }, 'vehicle', VEH, 5),
  cat('VEH-CAR', 'CAR', 'VEH', { th: 'รถยนต์นั่ง / รถเก๋ง (≤10 ที่นั่ง — ฐานไม่เกิน 1 ลบ.)', en: 'Passenger Car (≤10 seats, cap 1M)', zh: '乘用车' }, 'vehicle', VEH, 5),
  cat('VEH-PICK', 'PICK', 'VEH', { th: 'รถกระบะ / รถตู้', en: 'Pickup / Van', zh: '皮卡·面包车' }, 'vehicle', VEH, 5),
  cat('VEH-TRK', 'TRK', 'VEH', { th: 'รถบรรทุก', en: 'Trucks', zh: '货车' }, 'vehicle', VEH, 5),
  cat('VEH-MC', 'MC', 'VEH', { th: 'รถจักรยานยนต์', en: 'Motorcycle', zh: '摩托车' }, 'vehicle', VEH, 5),
  // 10) สินทรัพย์ไม่มีตัวตน
  cat('INT', 'INT', null, { th: 'สินทรัพย์ไม่มีตัวตน', en: 'Intangible Assets', zh: '无形资产' }, 'license', SOF, 10),
  cat('INT-SOF', 'SOF', 'INT', { th: 'ซอฟต์แวร์ / โปรแกรมคอมพิวเตอร์', en: 'Software', zh: '软件' }, 'license', SOF, 3),
  cat('INT-LEASE', 'LEAS', 'INT', { th: 'สิทธิการเช่า', en: 'Leasehold Rights', zh: '租赁权' }, 'contract', LEASE, 5),
  cat('INT-COPY', 'COPY', 'INT', { th: 'ลิขสิทธิ์ / สิทธิบัตร', en: 'Copyright / Patents', zh: '版权·专利' }, 'license', COPY, 10),
];

const pol = (id: string, categoryId: string, name: Localized, lifeYears: number): DepPolicy => ({
  id, name, categoryId, method: 'SL', lifeYears, residual: 1,
  startRule: 'READY_DATE', proration: 'FULL_MONTH', rounding: 2, effectiveDate: '2020-01-01', active: true,
});

// นโยบายต่อหมวดหลัก (บัญชีแก้อายุได้) — createFromOA ใช้อายุจากหมวดย่อยก่อน แล้วค่อย fallback มานโยบายนี้
export const POLICIES: DepPolicy[] = [
  pol('P-BLD', 'BLD', { th: 'อาคาร — เส้นตรง 20 ปี', en: 'Buildings — SL 20 years', zh: '建筑物 — 直线法 20 年' }, 20),
  pol('P-LHD', 'LHD', { th: 'ส่วนปรับปรุงตกแต่ง — เส้นตรง 5 ปี', en: 'Leasehold improvement — SL 5 years', zh: '装修改良 — 直线法 5 年' }, 5),
  pol('P-OFE', 'OFE', { th: 'อุปกรณ์สำนักงาน — เส้นตรง 5 ปี', en: 'Office equipment — SL 5 years', zh: '办公设备 — 直线法 5 年' }, 5),
  pol('P-FUR', 'FUR', { th: 'เครื่องตกแต่ง — เส้นตรง 5 ปี', en: 'Furniture — SL 5 years', zh: '家具 — 直线法 5 年' }, 5),
  pol('P-NET', 'NET', { th: 'อุปกรณ์เครือข่าย/ความปลอดภัย — เส้นตรง 5 ปี', en: 'Network & security — SL 5 years', zh: '网络安防 — 直线法 5 年' }, 5),
  pol('P-STU', 'STU', { th: 'อุปกรณ์สตูดิโอ — เส้นตรง 5 ปี', en: 'Studio equipment — SL 5 years', zh: '直播设备 — 直线法 5 年' }, 5),
  pol('P-TOOL', 'TOOL', { th: 'เครื่องมือ/อุปกรณ์ — เส้นตรง 5 ปี', en: 'Tools — SL 5 years', zh: '工具 — 直线法 5 年' }, 5),
  pol('P-MAC', 'MAC', { th: 'เครื่องจักร — เส้นตรง 5 ปี', en: 'Machinery — SL 5 years', zh: '机器 — 直线法 5 年' }, 5),
  pol('P-VEH', 'VEH', { th: 'ยานพาหนะ — เส้นตรง 5 ปี', en: 'Vehicles — SL 5 years', zh: '运输工具 — 直线法 5 年' }, 5),
  pol('P-INT', 'INT', { th: 'สินทรัพย์ไม่มีตัวตน — ตัดจำหน่าย 10 ปี', en: 'Intangible — amortise 10 years', zh: '无形资产 — 摊销 10 年' }, 10),
];

export const USERS: AppUser[] = [
  { id: 'U1', name: 'Puntaree N.', email: 'puntaree@shd-technology.co.th', role: 'ACCOUNTANT', active: true },
  { id: 'U2', name: 'Accounting Manager', email: 'acc.manager@shd-technology.co.th', role: 'MANAGER', active: true },
  { id: 'U3', name: 'System Admin', email: 'admin@shd-technology.co.th', role: 'ADMIN', active: true },
  { id: 'U4', name: 'Internal Auditor', email: 'audit@shd-technology.co.th', role: 'AUDITOR', active: true },
];

export const RUNNING_NUMBERS: RunningNumberConfig[] = [
  { companyId: 'C-SHD', prefix: 'SHD', includeYear: true, includeMonth: true, includeDay: true, seqDigits: 5, nextSeq: 3 },
];

export const OA_INTEGRATION: OAIntegration = {
  endpoint: 'https://oa.shd-technology.co.th/api/v1/approved-requests',
  authType: 'API_KEY',
  syncMode: 'SCHEDULED',
  schedule: '0 */2 * * *',
  lastSyncAt: '2026-09-30T16:00:00+07:00',
  mapping: [
    { oa: 'document_no', fa: 'source.oaNo' },
    { oa: 'company_id', fa: 'companyId' },
    { oa: 'branch_id', fa: 'branchId' },
    { oa: 'department', fa: 'departmentId' },
    { oa: 'cost_center', fa: 'costCenterId' },
    { oa: 'item_name', fa: 'nameTh' },
    { oa: 'item_description', fa: 'description' },
    { oa: 'quantity', fa: 'quantity' },
    { oa: 'unit', fa: 'unit' },
    { oa: 'approved_amount', fa: 'originalCost' },
    { oa: 'supplier_name', fa: 'source.supplier' },
    { oa: 'invoice_no', fa: 'source.invoiceNo' },
    { oa: 'po_no', fa: 'source.poNo' },
    { oa: 'gr_no', fa: 'source.grNo' },
    { oa: 'location_code', fa: 'locationId' },
  ],
};

export const UNITS: Record<string, { th: string; en: string; zh: string }> = {
  unit: { th: 'เครื่อง', en: 'unit', zh: '台' },
  piece: { th: 'ตัว', en: 'pc', zh: '件' },
  vehicle: { th: 'คัน', en: 'vehicle', zh: '辆' },
  license: { th: 'สิทธิ', en: 'license', zh: '许可' },
  set: { th: 'ชุด', en: 'set', zh: '套' },
  contract: { th: 'สัญญา', en: 'contract', zh: '合同' },
};

/* ------------------------------------------------------------------ System settings */
export interface AssetSettings {
  /** เกณฑ์ราคาขั้นต่ำที่ถือเป็นทรัพย์สิน (capitalization threshold) — ต่ำกว่านี้ลงเป็นค่าใช้จ่าย */
  capitalizationThreshold: number;
  currency: string;
}
export const SETTINGS: AssetSettings = {
  capitalizationThreshold: 3000,
  currency: 'THB',
};

/* ------------------------------------------------------------------
 * Knowledge: อ้างอิงกฎหมายค่าเสื่อมราคา (พ.ร.ฎ.145 + ป.รัษฎากร ม.65 ทวิ)
 * ใช้แสดงให้บัญชีอ่านประกอบตอนแก้อายุค่าเสื่อม — ข้อมูลอ้างอิง ไม่ใช่การบังคับ
 * ปรับปรุงเมื่อกฎหมายเปลี่ยน (แก้ที่เดียว ทุกหน้าที่อ้างอิงจะอัปเดตตาม)
 * ------------------------------------------------------------------ */
export interface LegalDepRule {
  key: string;
  asset: Localized;
  minYears: number | null; // อายุขั้นต่ำตามภาษี (null = ตามอายุสัญญา/อื่น)
  maxRatePct: number | null; // อัตราหักสูงสุดต่อปี (%)
  note: Localized;
}
export const LEGAL_DEPRECIATION_SOURCE =
  'พระราชกฤษฎีกาฯ (ฉบับที่ 145) ออกตามประมวลรัษฎากร มาตรา 65 ทวิ (2)';
export const LEGAL_DEPRECIATION_UPDATED = '2026-10-02';
export const LEGAL_DEPRECIATION: LegalDepRule[] = [
  { key: 'computer', asset: { th: 'คอมพิวเตอร์ อุปกรณ์คอมพิวเตอร์ และโปรแกรมคอมพิวเตอร์', en: 'Computers, peripherals & software', zh: '电脑及软件' }, minYears: 3, maxRatePct: 33.33, note: { th: 'หักได้ภายในไม่น้อยกว่า 3 รอบบัญชี · SME: หักวันแรก 40% ที่เหลือเฉลี่ย 3 ปี', en: 'Min 3 periods; SME: 40% initial + 3 yrs', zh: '不少于3个会计期;中小企业首日40%' } },
  { key: 'general', asset: { th: 'ทรัพย์สินทั่วไป (เฟอร์นิเจอร์ เครื่องใช้ เครื่องจักร อุปกรณ์)', en: 'General assets (furniture, equipment, machinery)', zh: '一般资产' }, minYears: 5, maxRatePct: 20, note: { th: 'อัตราปกติ 20%/ปี (อายุ 5 ปี)', en: 'Standard 20%/yr (5-year life)', zh: '常规 20%/年' } },
  { key: 'vehicle', asset: { th: 'ยานพาหนะ (รถยนต์นั่ง/โดยสาร ≤10 ที่นั่ง)', en: 'Vehicles (passenger car ≤10 seats)', zh: '乘用车' }, minYears: 5, maxRatePct: 20, note: { th: 'รถเก๋ง: คิดฐานค่าเสื่อมได้ไม่เกิน 1,000,000 บาท', en: 'Passenger car: depreciable base capped at 1,000,000 THB', zh: '乘用车折旧基数上限100万泰铢' } },
  { key: 'building', asset: { th: 'อาคารถาวร', en: 'Permanent building', zh: '永久建筑' }, minYears: 20, maxRatePct: 5, note: { th: 'อาคารถาวร 5%/ปี', en: '5%/yr', zh: '5%/年' } },
  { key: 'temp_building', asset: { th: 'อาคารชั่วคราว', en: 'Temporary building', zh: '临时建筑' }, minYears: null, maxRatePct: 100, note: { th: 'หักได้ 100%', en: 'Up to 100%', zh: '可100%' } },
  { key: 'leasehold', asset: { th: 'ส่วนปรับปรุง/สิทธิการเช่า', en: 'Leasehold improvement / rights', zh: '租赁改良·租赁权' }, minYears: null, maxRatePct: null, note: { th: 'ตัดตามอายุสัญญาเช่า', en: 'Amortise over lease term', zh: '按租期摊销' } },
  { key: 'intangible', asset: { th: 'สินทรัพย์ไม่มีตัวตน (ลิขสิทธิ์/สิทธิที่มีอายุจำกัด)', en: 'Intangibles (copyright/limited-life rights)', zh: '无形资产' }, minYears: 10, maxRatePct: 10, note: { th: 'มีอายุ: ตามอายุ · ไม่จำกัดอายุ: 10 ปี (10%/ปี)', en: 'Per life, or 10 yrs if indefinite', zh: '按年限,无限期则10年' } },
];
