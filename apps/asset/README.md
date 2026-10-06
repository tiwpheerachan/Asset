# SHD Fixed Asset System — Next.js (Phase 1 prototype)

ระบบบริหารทรัพย์สินถาวร SHD · Fixed Asset Management System · SHD 固定资产管理系统

UI 3 ภาษา (ไทย / English / 中文), light mode แบบ ERP ทางการ, ข้อมูลตั้งต้นจากไฟล์ `Fixed_Asset_report_Group_export_as_of_SHD.xlsx` (147 รายการ, ปีบัญชี 2026)

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000  → เลือก Role ที่หน้า Login
npm run build && npm start
```

Node 18.18+ (ทดสอบบน Node 22) · Next.js 15 (App Router) · React 19 · Tailwind 3 · Recharts · SheetJS · qrcode.react

## หน้าจอ (ตาม Requirement §4)

| Route | หน้า | ทำอะไรได้ |
|---|---|---|
| `/login` | Login | เลือก Role (Accountant / Manager / Admin / Auditor) — สิทธิ์ใน UI เปลี่ยนตาม RBAC |
| `/` | Dashboard | KPI 8 ใบ, ค่าเสื่อมรายเดือน 12+3 เดือน, มูลค่าตามหมวด/บริษัท/สาขา/แผนก, Alerts, กิจกรรมล่าสุด |
| `/oa-import` | OA Import | คิว OA (NEW → REVIEWING → READY_TO_CREATE → CREATED / REJECTED / DUPLICATE / ERROR), ตรวจซ้ำ 4 แบบ, เลือกหมวด, **Split 1 OA → N Assets**, Field Mapping |
| `/assets` | Asset Register | Search (code/ชื่อ TH-EN/serial/invoice/OA), Filter ครบตาม §8.2, เลือกคอลัมน์, ยอดรวม, Quick view drawer, Export Excel |
| `/assets/[id]` | Asset Detail | Tabs: Overview / Accounting / Depreciation / Location / Documents / History, Workflow Draft → Pending review → Active, QR, กระทบยอดกับ Legacy |
| `/assets/import` | Excel Import | อ่านไฟล์ Legacy export, Validation, Duplicate check, Preview, Commit + ดาวน์โหลด Template |
| `/label/[id]` | Asset label | ป้าย 70×35 mm (Company, Asset code, Name, QR) พร้อมพิมพ์ |
| `/categories` | Categories | Tree 2 ระดับ, ค่า default (หน่วย/อายุ/ซาก/วิธี), Account Mapping 3 บัญชี |
| `/depreciation` | Depreciation | Runs (DRAFT → CALCULATED → REVIEWED → LOCKED), Preview + drill-down + errors, Policies |
| `/locations` | Locations | Company → Branch → Building/Floor/Room, ทรัพย์สินต่อสถานที่, ไม่มีสถานที่ |
| `/reports` | Reports | 6 รายงานตาม §20 พร้อม Export Excel |
| `/documents` | Documents | เอกสาร/รูปทั้งหมด กรองตามประเภท/ระบบต้นทาง |
| `/audit` | Audit Log | Append-only, filter, export |
| `/settings` | Settings | Company / Branch / Department / Cost center / Running number / OA integration / Users / Permission matrix |

## โครงสร้างโปรเจกต์

```
src/
  app/(app)/…          หน้าทั้งหมดภายใต้ App shell (sidebar + topbar)
  app/login, app/label หน้าที่ไม่มี shell
  components/          ui.tsx (design system), shell, charts, badges, asset-create
  lib/
    types.ts           Domain model (ตรงกับ db/schema.sql)
    depreciation.ts    Straight-line engine: FULL_MONTH / ACTUAL_DAYS(365) / NEXT_MONTH, ปัดเศษงวดสุดท้ายให้ NBV = ซาก
    store.tsx          Client store + audit log อัตโนมัติ (persist localStorage)
    rbac.ts            Permission matrix (§25)
    i18n/              th.ts · en.ts · zh.ts  (type-checked ให้ key ครบทุกภาษา)
    excel.ts           Export / import xlsx
  data/
    seed-assets.ts     AUTO-GENERATED จาก Excel (scripts/seed_from_excel.py)
    masters.ts         บริษัท, บัญชี, หมวดหมู่, นโยบาย (+ ข้อมูลตัวอย่าง: สาขา/แผนก/CC/สถานที่)
    seed.ts            OA ตัวอย่าง, เอกสาร, audit, depreciation runs
db/schema.sql          PostgreSQL / Supabase schema (enums, FK, triggers ห้ามลบ/แก้ audit, ห้ามแก้งวดที่ล็อก)
docs/                  Requirement ต้นฉบับ
```

## ข้อควรทราบเกี่ยวกับข้อมูล

- **จริงจาก Excel:** รหัส ชื่อ หมวด/หมวดย่อย หน่วย จำนวน ราคาทุน ซาก อายุ ยอดยกมา/ยกไป และผังบัญชี 3 บัญชีต่อหมวด
- **คำนวณย้อน:** Excel ไม่มีวันที่พร้อมใช้ ระบบจึงคำนวณ `readyDate` ย้อนจากค่าเสื่อมสะสม ณ 31/12/2026 (รหัสแบบ `C68-MMDD…` ใช้วันที่จากรหัส) — ดูผลต่างได้ที่แท็บ Accounting → Legacy reconciliation
- **ข้อมูลตัวอย่าง (ต้องแทนที่ก่อน Go-live):** สาขา แผนก Cost center สถานที่ การ assign ทรัพย์สินเข้าแต่ละแผนก รายการ OA และชื่อภาษาอังกฤษของทรัพย์สิน (แปลอัตโนมัติ)
- Reset ข้อมูล demo: เมนูผู้ใช้มุมขวาบน → *Reset demo data*
- นำเข้าไฟล์ Excel เดิมซ้ำที่ `/assets/import` จะเห็นทุกแถวเป็น "ซ้ำ" (ตรวจ duplicate ทำงาน)

## ต่อยอดสู่ Production

1. รัน `db/schema.sql` บน Supabase / Postgres แล้ว seed master จริง
2. แทน action ใน `lib/store.tsx` ด้วย Server Actions / Route handlers (component ใช้ interface เดิม)
3. Auth: Supabase Auth หรือ Microsoft Entra SSO → map `users.role` → RLS ตาม `lib/rbac.ts`
4. OA: endpoint ตาม `Settings → OA integration` (API key, cron ทุก 2 ชม.) → insert `asset_import_rows`
5. ไฟล์แนบ/รูป → Supabase Storage (`asset_documents.storage_path`)
6. Phase 2 (§30): Holder (OneHR), Transfer, Disposal, Physical count ด้วย QR, GL integration — schema เผื่อ `holder_employee_id` และ method `DB`/`UOP` ไว้แล้ว
