import type { Asset, AssetDocument, AuditLog, DepRun, OARecord } from '@/lib/types';
import { LEGACY_ASSETS } from './seed-assets';
import { CATEGORIES } from './masters';

const BRANDS = [
  'Asus', 'Acer', 'Lenovo', 'Dell', 'HP', 'Apple', 'MacBook', 'iPhone', 'MSI', 'Epson', 'Brother', 'Canon', 'Sony', 'TP-Link',
  'D-Link', 'Hikvision', 'Coway', 'Logitech', 'Gigabyte', 'Lexar', 'ADATA', 'Apacer', 'Zotac', 'Inno3D', 'Seagate', 'WD', 'Montech',
  'Modena', 'Matall', 'Qashier', 'ThinkCentre',
];
const BRAND_ALIAS: Record<string, string> = { MacBook: 'Apple', iPhone: 'Apple', ThinkCentre: 'Lenovo', Asux: 'Asus' };

function detectBrand(name: string): string {
  const low = name.toLowerCase();
  for (const b of [...BRANDS, 'Asux']) {
    if (low.includes(b.toLowerCase())) return BRAND_ALIAS[b] ?? b;
  }
  return '';
}

function detectModel(name: string, brand: string): string {
  if (!brand) return '';
  const m = name.match(/[A-Z0-9]{2,}[A-Z0-9\-\/#.]*[0-9][A-Z0-9\-\/#.]*/);
  return m ? m[0] : '';
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** DEMO org assignment — deterministic so the dashboard is stable. */
function assignOrg(code: string, name: string, sub: string) {
  const n = name.toLowerCase();
  const h = hash(code);
  const pick = <T,>(arr: T[]) => arr[h % arr.length];
  if (/กล้อง|lens|เลนส์|tripod|zv-e10|sony|แบตเตอร์/.test(n) && !/วงจรปิด|cctv|ip camera/.test(n))
    return { branchId: 'B-STU', departmentId: 'D-LIVE', locationId: pick(['L-STU-1', 'L-STU-2']) };
  if (/แคชเชีย|qashier|เคาน์เตอร์/.test(n)) return { branchId: 'B-SR', departmentId: 'D-SALES', locationId: 'L-SR-1' };
  if (sub === 'VEH-TRK' || /รถเข็น|ชั้นวางของ4ชั้น/.test(n)) return { branchId: 'B-WH', departmentId: 'D-LOG', locationId: pick(['L-WH-A', 'L-WH-DOCK']) };
  if (/วงจรปิด|cctv|router|เร้าเตอร์|เร้่าเตอร์|switch|nvr|สำรองไฟ|range extender|camera|ฮาร์ดดิสก์/.test(n))
    return { branchId: 'B-HQ', departmentId: 'D-IT', locationId: 'L-HQ-SRV' };
  if (sub === 'OFE-MOB') return { branchId: 'B-HQ', departmentId: 'D-SALES', locationId: 'L-HQ-2' };
  if (sub === 'INT-SOF') return { branchId: 'B-HQ', departmentId: 'D-IT', locationId: null };
  if (sub.startsWith('FUR')) return { branchId: 'B-HQ', departmentId: 'D-ADM', locationId: pick(['L-HQ-1', 'L-HQ-2', 'L-HQ-3']) };
  if (/กรองน้ำ|ดับเพลิง|ปรับอากาศ/.test(n)) return { branchId: 'B-HQ', departmentId: 'D-ADM', locationId: pick(['L-HQ-1', 'L-HQ-2']) };
  const dept = pick(['D-ACC', 'D-IT', 'D-ECOM', 'D-MKT', 'D-HR', 'D-LIVE', 'D-IT', 'D-ECOM']);
  const loc = dept === 'D-ACC' ? 'L-HQ-3' : dept === 'D-LIVE' ? 'L-STU-1' : 'L-HQ-2';
  return { branchId: dept === 'D-LIVE' ? 'B-STU' : 'B-HQ', departmentId: dept, locationId: loc };
}

const parentOf = (sub: string) => CATEGORIES.find((c) => c.id === sub)?.parentId ?? sub;
const policyOf = (catId: string) => `P-${catId}`;

export function buildSeedAssets(): Asset[] {
  const assets: Asset[] = LEGACY_ASSETS.map((r) => {
    const org = assignOrg(r.code, r.nameTh, r.subcategoryId);
    const brand = detectBrand(r.nameTh);
    const h = hash(r.code);
    const categoryId = parentOf(r.subcategoryId);
    return {
      id: `A-${r.legacyNo}`,
      code: r.code,
      nameTh: r.nameTh,
      nameEn: r.nameEn,
      description: '',
      categoryId,
      subcategoryId: r.subcategoryId,
      companyId: 'C-SHD',
      branchId: org.branchId,
      departmentId: org.departmentId,
      costCenterId: `CC-${org.departmentId.replace('D-', '')}`,
      // ~5% demo assets without location to exercise "missing location"
      locationId: h % 19 === 0 ? null : org.locationId,
      holderId: null,
      serialNumber: '',
      brand,
      model: detectModel(r.nameTh, brand),
      unit: r.unit,
      quantity: r.quantity,
      originalCost: r.cost,
      additionalCost: 0,
      residual: r.residual,
      lifeMonths: r.lifeYears * 12,
      method: 'SL',
      policyId: policyOf(categoryId),
      acquisitionDate: r.acquisitionDate,
      readyDate: r.readyDate,
      status: 'ACTIVE',
      hasPhoto: h % 5 !== 0 && h % 7 !== 0,
      source: {},
      legacy: r.legacy,
      createdAt: '2026-09-11T15:44:24+07:00',
      createdBy: 'Excel Import',
      updatedAt: '2026-09-11T15:44:24+07:00',
      updatedBy: 'Excel Import',
    };
  });

  // Assets created from OA (not legacy)
  assets.push(
    {
      id: 'A-OA-1',
      code: 'SHD26092400001',
      nameTh: 'MacBook Pro 14 M4 Pro 24GB/1TB',
      nameEn: 'MacBook Pro 14 M4 Pro 24GB/1TB',
      description: 'เครื่องสำหรับทีม Innovation (ตัดต่อวิดีโอ / Data)',
      categoryId: 'OFE',
      subcategoryId: 'OFE-COM',
      companyId: 'C-SHD',
      branchId: 'B-HQ',
      departmentId: 'D-IT',
      costCenterId: 'CC-IT',
      locationId: 'L-HQ-2',
      holderId: null,
      serialNumber: 'C02FX1Q2MD6T',
      brand: 'Apple',
      model: 'MX2H3TH/A',
      unit: 'unit',
      quantity: 1,
      originalCost: 74663.55,
      additionalCost: 0,
      residual: 1,
      lifeMonths: 60,
      method: 'SL',
      policyId: 'P-OFE',
      acquisitionDate: '2026-09-24',
      readyDate: '2026-09-24',
      status: 'PENDING_REVIEW',
      hasPhoto: true,
      source: { oaNo: 'OA-2609-0024', poNo: 'PO-2609-0118', grNo: 'GR-2609-0091', invoiceNo: 'IV2609-55821', supplier: 'Copperwired Public Co., Ltd.', purchaseDate: '2026-09-22' },
      oaId: 'OA-9',
      createdAt: '2026-09-25T10:12:00+07:00',
      createdBy: 'Puntaree N.',
      updatedAt: '2026-09-25T10:20:00+07:00',
      updatedBy: 'Puntaree N.',
    },
    {
      id: 'A-OA-2',
      code: 'SHD26092900002',
      nameTh: 'จอมอนิเตอร์ Dell P2725H 27 นิ้ว',
      nameEn: 'Dell P2725H 27" monitor',
      description: '',
      categoryId: 'OFE',
      subcategoryId: 'OFE-COM',
      companyId: 'C-SHD',
      branchId: 'B-HQ',
      departmentId: 'D-ACC',
      costCenterId: 'CC-ACC',
      locationId: 'L-HQ-3',
      holderId: null,
      serialNumber: '',
      brand: 'Dell',
      model: 'P2725H',
      unit: 'unit',
      quantity: 4,
      originalCost: 27925.23,
      additionalCost: 0,
      residual: 1,
      lifeMonths: 60,
      method: 'SL',
      policyId: 'P-OFE',
      acquisitionDate: '2026-09-29',
      readyDate: null,
      status: 'DRAFT',
      hasPhoto: false,
      source: { oaNo: 'OA-2609-0009', poNo: 'PO-2609-0102', supplier: 'Advice IT Infinite PCL' },
      oaId: 'OA-5',
      createdAt: '2026-09-29T14:02:00+07:00',
      createdBy: 'Puntaree N.',
      updatedAt: '2026-09-29T14:02:00+07:00',
      updatedBy: 'Puntaree N.',
    },
  );
  return assets;
}

export const SEED_OA: OARecord[] = [
  {
    id: 'OA-1', oaNo: 'OA-2609-0031', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ECOM', costCenterId: 'CC-ECOM',
    requester: 'E-commerce Team Lead', approvedDate: '2026-09-29', itemName: 'โน๊ตบุ๊ค Lenovo V15 G6 (15.6) Business Black',
    itemDescription: 'โน๊ตบุ๊คสำหรับพนักงานใหม่ทีม E-commerce / Admin ร้านค้า', quantity: 10, unit: 'unit', amount: 219532.71,
    supplier: 'Advice IT Infinite PCL', invoiceNo: 'AV-IV-26-09-8812', invoiceDate: '2026-09-30', poNo: 'PO-2609-0131', grNo: 'GR-2609-0104',
    locationId: 'L-HQ-2', serialNumbers: ['PF5A1001', 'PF5A1002', 'PF5A1003', 'PF5A1004', 'PF5A1005', 'PF5A1006', 'PF5A1007', 'PF5A1008', 'PF5A1009', 'PF5A1010'],
    documents: ['OA-2609-0031.pdf', 'PO-2609-0131.pdf', 'AV-IV-26-09-8812.pdf'], approvalRef: 'APR-77120', status: 'NEW',
    suggestedSubcategoryId: 'OFE-COM', createdAssetIds: [], importedAt: '2026-09-30T16:00:00+07:00',
  },
  {
    id: 'OA-2', oaNo: 'OA-2609-0027', companyId: 'C-SHD', branchId: 'B-STU', departmentId: 'D-LIVE', costCenterId: 'CC-LIVE',
    requester: 'Live Commerce Supervisor', approvedDate: '2026-09-26', itemName: 'กล้อง Sony ZV-E10 II พร้อมเลนส์ 16-50mm',
    itemDescription: 'กล้องสำหรับห้อง Live Studio 2', quantity: 2, unit: 'set', amount: 63551.4, supplier: 'Sony Thai Co., Ltd. (Authorised dealer)',
    invoiceNo: 'INV-SN-260927-14', invoiceDate: '2026-09-27', poNo: 'PO-2609-0122', grNo: 'GR-2609-0097', locationId: 'L-STU-2',
    documents: ['OA-2609-0027.pdf', 'INV-SN-260927-14.pdf'], approvalRef: 'APR-77098', status: 'READY_TO_CREATE',
    suggestedSubcategoryId: 'OFE-OTH', createdAssetIds: [], importedAt: '2026-09-28T08:00:00+07:00',
  },
  {
    id: 'OA-3', oaNo: 'OA-2609-0019', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ACC', costCenterId: 'CC-ACC',
    requester: 'Accounting Manager', approvedDate: '2026-09-22', itemName: 'เครื่องปริ้น EPSON L3210', itemDescription: 'เครื่องพิมพ์สำหรับฝ่ายบัญชี',
    quantity: 2, unit: 'unit', amount: 7457.94, supplier: 'JIB Computer Group', invoiceNo: 'JIB-2609-77812', poNo: 'PO-2609-0110',
    documents: ['OA-2609-0019.pdf'], approvalRef: 'APR-77011', status: 'REVIEWING', suggestedSubcategoryId: 'OFE-PRT',
    createdAssetIds: [], importedAt: '2026-09-23T08:00:00+07:00',
  },
  {
    id: 'OA-4', oaNo: 'OA-2609-0035', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-HR', costCenterId: 'CC-HR',
    requester: 'HR Manager', approvedDate: '2026-09-30', itemName: 'เก้าอี้สำนักงาน Ergonomic', itemDescription: 'เก้าอี้ห้องประชุมชั้น 2',
    quantity: 6, unit: 'piece', amount: 29400, supplier: 'Modernform Group PCL', poNo: 'PO-2609-0140',
    documents: ['OA-2609-0035.pdf'], approvalRef: 'APR-77140', status: 'NEW', suggestedSubcategoryId: 'FUR-CHR',
    createdAssetIds: [], importedAt: '2026-09-30T16:00:00+07:00',
  },
  {
    id: 'OA-5', oaNo: 'OA-2609-0009', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ACC', costCenterId: 'CC-ACC',
    requester: 'Accounting Manager', approvedDate: '2026-09-12', itemName: 'จอมอนิเตอร์ Dell P2725H 27 นิ้ว', itemDescription: 'จอเสริมสำหรับฝ่ายบัญชี',
    quantity: 4, unit: 'unit', amount: 27925.23, supplier: 'Advice IT Infinite PCL', poNo: 'PO-2609-0102',
    documents: ['OA-2609-0009.pdf'], approvalRef: 'APR-76902', status: 'CREATED', suggestedSubcategoryId: 'OFE-COM',
    createdAssetIds: ['A-OA-2'], importedAt: '2026-09-13T08:00:00+07:00',
  },
  {
    id: 'OA-6', oaNo: 'OA-2609-0010', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-ACC', costCenterId: 'CC-ACC',
    requester: 'Accounting Manager', approvedDate: '2026-09-12', itemName: 'จอมอนิเตอร์ Dell P2725H 27 นิ้ว', itemDescription: 'ส่งซ้ำจาก OA',
    quantity: 4, unit: 'unit', amount: 27925.23, supplier: 'Advice IT Infinite PCL', poNo: 'PO-2609-0102',
    documents: [], approvalRef: 'APR-76903', status: 'DUPLICATE', duplicateOf: 'OA-2609-0009', suggestedSubcategoryId: 'OFE-COM',
    createdAssetIds: [], importedAt: '2026-09-13T08:00:00+07:00',
  },
  {
    id: 'OA-7', oaNo: 'OA-2608-0044', companyId: 'C-SHD', branchId: 'B-WH', departmentId: '', costCenterId: '',
    requester: 'Warehouse Supervisor', approvedDate: '2026-08-28', itemName: 'เครื่องปรับอากาศ Daikin 24,000 BTU', itemDescription: 'ห้องควบคุมคลังสินค้า',
    quantity: 1, unit: 'unit', amount: 38317.76, supplier: 'Daikin Dealer', documents: ['OA-2608-0044.pdf'], approvalRef: 'APR-76655',
    status: 'ERROR', error: 'MISSING_COST_CENTER', suggestedSubcategoryId: 'OFE-OTH', createdAssetIds: [], importedAt: '2026-08-29T08:00:00+07:00',
  },
  {
    id: 'OA-8', oaNo: 'OA-2608-0040', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-MKT', costCenterId: 'CC-MKT',
    requester: 'Marketing Lead', approvedDate: '2026-08-25', itemName: 'Canva Teams subscription (1 ปี)', itemDescription: 'ค่าบริการรายปี',
    quantity: 1, unit: 'license', amount: 4990, supplier: 'Canva', documents: ['OA-2608-0040.pdf'], approvalRef: 'APR-76610',
    status: 'REJECTED', rejectReason: 'ค่าบริการรายปี — บันทึกเป็นค่าใช้จ่าย ไม่ใช่สินทรัพย์', createdAssetIds: [], importedAt: '2026-08-26T08:00:00+07:00',
  },
  {
    id: 'OA-9', oaNo: 'OA-2609-0024', companyId: 'C-SHD', branchId: 'B-HQ', departmentId: 'D-IT', costCenterId: 'CC-IT',
    requester: 'Tech Lead — Innovation', approvedDate: '2026-09-20', itemName: 'MacBook Pro 14 M4 Pro 24GB/1TB', itemDescription: 'เครื่องสำหรับทีม Innovation',
    quantity: 1, unit: 'unit', amount: 74663.55, supplier: 'Copperwired Public Co., Ltd.', invoiceNo: 'IV2609-55821', invoiceDate: '2026-09-22',
    poNo: 'PO-2609-0118', grNo: 'GR-2609-0091', locationId: 'L-HQ-2', serialNumbers: ['C02FX1Q2MD6T'],
    documents: ['OA-2609-0024.pdf', 'IV2609-55821.pdf'], approvalRef: 'APR-77002', status: 'CREATED', suggestedSubcategoryId: 'OFE-COM',
    createdAssetIds: ['A-OA-1'], importedAt: '2026-09-21T08:00:00+07:00',
  },
];

export function buildSeedDocuments(assets: Asset[]): AssetDocument[] {
  const docs: AssetDocument[] = [];
  let i = 1;
  for (const a of assets) {
    const h = hash(a.code);
    if (a.legacy && h % 3 !== 0) {
      docs.push({ id: `DOC-${i++}`, assetId: a.id, type: 'INVOICE', fileName: `INV_${a.code}.pdf`, uploadedBy: 'Excel Import', uploadedAt: '2026-09-11T15:50:00+07:00', sourceSystem: 'LEGACY', sourceDocNo: `INV-${a.code}`, sizeKb: 180 + (h % 400) });
    }
    if (a.legacy && h % 4 === 1) {
      docs.push({ id: `DOC-${i++}`, assetId: a.id, type: 'WARRANTY', fileName: `Warranty_${a.code}.pdf`, uploadedBy: 'Excel Import', uploadedAt: '2026-09-11T15:50:00+07:00', sourceSystem: 'LEGACY', sourceDocNo: '', sizeKb: 90 + (h % 200) });
    }
    if (a.hasPhoto) {
      docs.push({ id: `DOC-${i++}`, assetId: a.id, type: 'PHOTO', fileName: `${a.code}_main.jpg`, uploadedBy: 'Puntaree N.', uploadedAt: '2026-09-15T10:00:00+07:00', sourceSystem: 'FA', sourceDocNo: '', sizeKb: 640 + (h % 900) });
    }
  }
  docs.push(
    { id: `DOC-${i++}`, assetId: 'A-OA-1', oaId: 'OA-9', type: 'OA_APPROVAL', fileName: 'OA-2609-0024.pdf', uploadedBy: 'OA Sync', uploadedAt: '2026-09-21T08:00:00+07:00', sourceSystem: 'OA', sourceDocNo: 'OA-2609-0024', sizeKb: 212 },
    { id: `DOC-${i++}`, assetId: 'A-OA-1', oaId: 'OA-9', type: 'PO', fileName: 'PO-2609-0118.pdf', uploadedBy: 'OA Sync', uploadedAt: '2026-09-21T08:00:00+07:00', sourceSystem: 'OA', sourceDocNo: 'PO-2609-0118', sizeKb: 156 },
    { id: `DOC-${i++}`, assetId: 'A-OA-1', oaId: 'OA-9', type: 'TAX_INVOICE', fileName: 'IV2609-55821.pdf', uploadedBy: 'OA Sync', uploadedAt: '2026-09-22T08:00:00+07:00', sourceSystem: 'OA', sourceDocNo: 'IV2609-55821', sizeKb: 301 },
    { id: `DOC-${i++}`, assetId: 'A-OA-1', type: 'ACCEPTANCE', fileName: 'GR-2609-0091.pdf', uploadedBy: 'Puntaree N.', uploadedAt: '2026-09-25T10:15:00+07:00', sourceSystem: 'FA', sourceDocNo: 'GR-2609-0091', sizeKb: 98 },
    { id: `DOC-${i++}`, assetId: 'A-OA-2', oaId: 'OA-5', type: 'OA_APPROVAL', fileName: 'OA-2609-0009.pdf', uploadedBy: 'OA Sync', uploadedAt: '2026-09-13T08:00:00+07:00', sourceSystem: 'OA', sourceDocNo: 'OA-2609-0009', sizeKb: 188 },
  );
  return docs;
}

export const SEED_AUDIT: AuditLog[] = [
  { id: 'AU-1', at: '2026-09-11T15:44:24+07:00', user: 'Puntaree N.', role: 'ACCOUNTANT', action: 'EXCEL_IMPORT', entity: 'asset_import_batches', newValue: '147 rows', reason: 'Initial legacy migration (Group export as of SHD)', source: 'EXCEL_IMPORT' },
  { id: 'AU-2', at: '2026-09-12T09:10:00+07:00', user: 'Accounting Manager', role: 'MANAGER', action: 'UPDATE', assetCode: 'COM-00005', entity: 'assets', field: 'lifeMonths', oldValue: '36', newValue: '60', reason: 'Policy adjustment — align with category default', source: 'UI' },
  { id: 'AU-3', at: '2026-09-13T08:00:00+07:00', user: 'OA Sync', role: 'SYSTEM', action: 'OA_IMPORT', entity: 'oa_records', newValue: 'OA-2609-0009, OA-2609-0010', source: 'OA_SYNC' },
  { id: 'AU-4', at: '2026-09-13T08:00:05+07:00', user: 'OA Sync', role: 'SYSTEM', action: 'DUPLICATE_DETECTED', entity: 'oa_records', field: 'poNo', newValue: 'OA-2609-0010 → OA-2609-0009', source: 'OA_SYNC' },
  { id: 'AU-5', at: '2026-09-15T10:00:00+07:00', user: 'Puntaree N.', role: 'ACCOUNTANT', action: 'UPLOAD_DOCUMENT', entity: 'asset_photos', newValue: 'Bulk photo upload', source: 'UI' },
  { id: 'AU-6', at: '2026-09-25T10:12:00+07:00', user: 'Puntaree N.', role: 'ACCOUNTANT', action: 'CREATE', assetCode: 'SHD26092400001', entity: 'assets', newValue: 'from OA-2609-0024', source: 'UI' },
  { id: 'AU-7', at: '2026-09-25T10:20:00+07:00', user: 'Puntaree N.', role: 'ACCOUNTANT', action: 'STATUS_CHANGE', assetCode: 'SHD26092400001', entity: 'assets', field: 'status', oldValue: 'DRAFT', newValue: 'PENDING_REVIEW', source: 'UI' },
  { id: 'AU-8', at: '2026-08-31T18:00:00+07:00', user: 'Accounting Manager', role: 'MANAGER', action: 'DEP_RUN_LOCKED', entity: 'asset_depreciation_runs', newValue: '2026-08', source: 'UI' },
  { id: 'AU-9', at: '2026-09-26T11:00:00+07:00', user: 'Accounting Manager', role: 'MANAGER', action: 'OA_REJECTED', entity: 'oa_records', newValue: 'OA-2608-0040', reason: 'ค่าบริการรายปี — บันทึกเป็นค่าใช้จ่าย', source: 'UI' },
  { id: 'AU-10', at: '2026-09-29T14:02:00+07:00', user: 'Puntaree N.', role: 'ACCOUNTANT', action: 'CREATE', assetCode: 'SHD26092900002', entity: 'assets', newValue: 'from OA-2609-0009', source: 'UI' },
];

export const SEED_RUNS: DepRun[] = [
  { id: 'R-2026-07', period: '2026-07', status: 'LOCKED', assetCount: 0, amount: 0, createdBy: 'Puntaree N.', createdAt: '2026-07-31T17:00:00+07:00', calculatedAt: '2026-07-31T17:01:00+07:00', reviewedBy: 'Accounting Manager', reviewedAt: '2026-07-31T17:30:00+07:00', lockedBy: 'Accounting Manager', lockedAt: '2026-07-31T18:00:00+07:00' },
  { id: 'R-2026-08', period: '2026-08', status: 'LOCKED', assetCount: 0, amount: 0, createdBy: 'Puntaree N.', createdAt: '2026-08-31T17:00:00+07:00', calculatedAt: '2026-08-31T17:01:00+07:00', reviewedBy: 'Accounting Manager', reviewedAt: '2026-08-31T17:40:00+07:00', lockedBy: 'Accounting Manager', lockedAt: '2026-08-31T18:00:00+07:00' },
  { id: 'R-2026-09', period: '2026-09', status: 'CALCULATED', assetCount: 0, amount: 0, createdBy: 'Puntaree N.', createdAt: '2026-09-30T17:00:00+07:00', calculatedAt: '2026-09-30T17:02:00+07:00' },
];
