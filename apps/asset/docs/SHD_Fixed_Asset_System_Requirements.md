# SHD Fixed Asset System — Detailed Web Requirements

## 1. เป้าหมายของระบบ

ระบบนี้เป็น **Fixed Asset Management System** สำหรับเก็บและบริหารข้อมูลทรัพย์สินของบริษัท โดย Scope หลักคือ

- รับข้อมูลต้นทางจากระบบ **OA** ที่อนุมัติแล้ว
- ลงทะเบียนทรัพย์สิน (Asset Register)
- จำแนกหมวดหมู่ / หมวดหมู่ย่อยของทรัพย์สิน
- ระบุว่าทรัพย์สินคืออะไร อยู่บริษัทไหน สาขาไหน แผนกไหน Cost Center ไหน และอยู่สถานที่ใด
- ยังไม่บังคับระบุผู้ถือครองรายบุคคลใน Phase แรก
- ตั้งค่ากฎการคิดค่าเสื่อมได้โดยฝ่ายบัญชี
- คำนวณค่าเสื่อมและมูลค่าตามบัญชี (NBV)
- เก็บเอกสารประกอบ รูปทรัพย์สิน และประวัติการเปลี่ยนแปลง
- รองรับการค้นหา ตรวจสอบ รายงาน และ Audit ย้อนหลัง

ระบบนี้ **ไม่ทำ** งานต่อไปนี้ใน Phase ปัจจุบัน

- รายรับ / รายจ่าย
- Payment
- Accounts Payable แบบเต็มระบบ
- General Ledger เต็มรูปแบบ
- Bank / Cash Management
- การออกใบกำกับภาษี
- การชำระเงิน Supplier

ข้อมูลด้านการซื้อและการอนุมัติจะมาจาก **OA** แล้วส่งเข้า Fixed Asset System เท่านั้น

---

# 2. ภาพรวมการทำงานของระบบ

```text
OA APPROVED DATA
        ↓
IMPORT / SYNC TO FIXED ASSET SYSTEM
        ↓
ASSET CANDIDATE
        ↓
ตรวจข้อมูล / จำแนก Category
        ↓
CREATE ASSET REGISTER
        ↓
ระบุ Company / Branch / Department / Cost Center / Location
        ↓
กำหนด Asset Class / Category / Subcategory
        ↓
กำหนด Cost / Acquisition Date / Ready-for-use Date
        ↓
กำหนด Depreciation Policy
        ↓
ACTIVATE ASSET
        ↓
GENERATE ASSET CODE / QR
        ↓
MONTHLY DEPRECIATION
        ↓
REPORT / SEARCH / AUDIT
```

---

# 3. ผู้ใช้งานของระบบ

## 3.1 Asset Accountant — เจ้าหน้าที่บัญชีทรัพย์สิน

หน้าที่หลัก

- รับรายการจาก OA
- ตรวจความครบถ้วนของข้อมูล
- สร้าง Asset Register
- เลือก Category / Subcategory
- ระบุบัญชีสินทรัพย์และบัญชีค่าเสื่อมตาม Category
- ตั้งค่า Cost, Useful Life, Residual Value
- Run ค่าเสื่อม
- Preview ผลค่าเสื่อม
- Export รายงาน

สิทธิ์

- Create Asset
- Edit Asset ก่อน Activate
- Import OA
- Run Depreciation
- Export Report
- Upload Document
- ดู Audit History

ไม่ควรมีสิทธิ์

- ลบ Asset ที่ Activate แล้ว
- ลบ Audit Log

---

## 3.2 Accounting Manager — หัวหน้าบัญชี

หน้าที่หลัก

- ตรวจ Asset ที่รอ Activate
- ตรวจ Depreciation Policy
- อนุมัติการเปลี่ยน Useful Life / Residual Value / Category สำคัญ
- Review ค่าเสื่อม
- ตรวจ Mapping บัญชี

สิทธิ์เพิ่มจาก Asset Accountant

- Approve Asset
- Approve Policy Change
- Edit GL Mapping
- Lock / Unlock บาง Setting

---

## 3.3 System Admin

หน้าที่

- ตั้งค่าระบบ
- จัดการผู้ใช้
- จัดการ Permission
- ตั้งค่า OA Integration
- ตั้งค่า Running Number
- ตั้งค่า Company / Branch / Department / Location Master

ข้อจำกัด

- ไม่ควรแก้รายการค่าเสื่อมโดยตรง
- ไม่ควรลบ Audit Log

---

## 3.4 Auditor / Viewer

สิทธิ์อ่านอย่างเดียว

- ดู Asset Register
- ดูเอกสารแนบ
- ดู Depreciation History
- ดู Audit Log
- Export Report

---

# 4. เมนูหลักของเว็บ

```text
1. Dashboard
2. OA Import
3. Asset Register
4. Asset Detail
5. Categories
6. Depreciation
7. Locations
8. Reports
9. Documents
10. Audit Log
11. Settings
```

---

# 5. Dashboard

Dashboard ต้องตอบให้ได้ทันทีว่า

- ตอนนี้มีทรัพย์สินกี่รายการ
- มูลค่าทรัพย์สินรวมเท่าไร
- ค่าเสื่อมสะสมเท่าไร
- NBV เท่าไร
- Asset ใหม่เดือนนี้เท่าไร
- Asset ยังไม่มีรูปกี่รายการ
- Asset ที่ยังไม่มี Category กี่รายการ
- Asset ที่ยังไม่พร้อมคิดค่าเสื่อมกี่รายการ
- Asset แยกตาม Company / Branch / Department / Category

## 5.1 KPI Cards

- Total Assets
- Total Cost
- Accumulated Depreciation
- Net Book Value
- New Assets This Month
- Assets Missing Photo
- Assets Missing Category
- Assets Pending Activation

## 5.2 Charts

- Asset Value by Category
- Asset Count by Category
- Asset Value by Company
- Asset Value by Branch
- Asset Value by Department
- Monthly Depreciation Trend

## 5.3 Alerts

เช่น

- OA Imports waiting for review
- Assets without Location
- Assets without Depreciation Policy
- Assets missing documents
- Assets nearing full depreciation

---

# 6. OA Import

## 6.1 วัตถุประสงค์

รับข้อมูลจาก OA ที่ผ่านการอนุมัติแล้วเข้ามาในระบบทรัพย์สิน โดยไม่ต้องกรอกใหม่ทั้งหมด

## 6.2 ข้อมูลที่ควรรับจาก OA

- OA Document Number
- Company
- Branch
- Department
- Cost Center
- Requester
- Approved Date
- Item Name
- Item Description
- Quantity
- Unit
- Estimated / Approved Amount
- Supplier
- Invoice Number ถ้ามี
- Invoice Date ถ้ามี
- PO Number ถ้ามี
- GR / Acceptance Number ถ้ามี
- Location ถ้ามี
- Documents
- Approval History Reference

## 6.3 OA Import Status

```text
NEW
REVIEWING
READY_TO_CREATE
CREATED
REJECTED
DUPLICATE
ERROR
```

## 6.4 ตรวจ Duplicate

ต้องตรวจจากอย่างน้อย

- OA Number
- Invoice Number
- Serial Number
- Asset Candidate Reference

## 6.5 Mapping

ระบบต้องมีหน้า OA Field Mapping เช่น

```text
OA.company_id → Asset.company_id
OA.branch_id → Asset.branch_id
OA.department → Asset.department
OA.cost_center → Asset.cost_center
OA.item_name → Asset.name
OA.amount → Asset.cost
```

---

# 7. Asset Candidate

หลัง Import จาก OA ยังไม่ควรเป็น Active Asset ทันที

สถานะเริ่มต้น

```text
CANDIDATE
```

หน้าที่ของ Asset Accountant คือ

- ตรวจรายการ
- ตรวจ Category
- ตรวจ Cost
- ตรวจจำนวน
- ตรวจ Serial Number
- ตรวจ Location
- ตรวจเอกสาร
- แยก 1 รายการเป็นหลาย Asset ถ้าจำเป็น

ตัวอย่าง

```text
OA ซื้อ Notebook 10 เครื่อง
↓
สร้าง Candidate 1 รายการ
↓
Split
↓
Asset 10 รายการ
```

---

# 8. Asset Register

## 8.1 ตารางรายการหลัก

Column ที่ควรมี

- Asset Code
- Asset Name
- Category
- Subcategory
- Company
- Branch
- Department
- Cost Center
- Location
- Serial Number
- Quantity
- Unit
- Cost
- Acquisition Date
- Ready-for-use Date
- Useful Life
- Residual Value
- Accumulated Depreciation
- NBV
- Status
- Photo Status
- OA Reference

## 8.2 Filter

- Company
- Branch
- Department
- Cost Center
- Location
- Category
- Subcategory
- Status
- Acquisition Date
- Ready-for-use Date
- Asset Code
- Serial Number
- OA Number
- Missing Photo
- Missing Document

## 8.3 Search

Full-text search จาก

- Asset Code
- Thai Name
- English Name
- Serial Number
- Invoice Number
- OA Number

---

# 9. Asset Detail

Asset Detail เป็นหน้าหลักของแต่ละทรัพย์สิน

## 9.1 General Information

- Asset Code
- รูปสินทรัพย์
- ชื่อภาษาไทย
- ชื่อภาษาอังกฤษ
- Description
- Category
- Subcategory
- Unit
- Quantity
- Serial Number
- Model
- Brand
- Status

ตัวอย่างจากระบบเดิม

```text
ชื่อไทย:
โน๊ตบุ๊ค ACER Swift Go 14 AI

หมวดหมู่:
อุปกรณ์และเครื่องใช้สำนักงาน

หมวดหมู่ย่อย:
คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์

หน่วย:
เครื่อง

จำนวน:
1
```

---

## 9.2 Organization Information

Phase แรกระบบต้องรู้ว่า Asset อยู่ที่ไหนในโครงสร้างองค์กร

- Company
- Branch
- Department
- Cost Center
- Location
- Building
- Floor
- Room / Area

ยังไม่บังคับ

- Employee Holder

แต่ Database ควรออกแบบเผื่อเพิ่ม Holder ในอนาคต

---

## 9.3 Purchase / Source Reference

ไม่ได้ทำ Payment แต่ควรเก็บ Reference เพื่อย้อนกลับต้นทางได้

- OA Number
- PR Number
- PO Number
- GR / Acceptance Number
- Invoice Number
- Supplier
- Purchase Date
- Acquisition Date
- Ready-for-use Date

---

## 9.4 Cost Information

- Original Cost
- Additional Cost
- Total Asset Cost
- Residual Value
- Accumulated Depreciation
- Net Book Value

สูตร

```text
NBV = Asset Cost - Accumulated Depreciation
```

---

# 10. Category / Asset Group

Category เป็นหัวใจของระบบ เพราะใช้ Default กฎทางบัญชีและค่าเสื่อม

## 10.1 Category Structure

รองรับ 2 ระดับอย่างน้อย

```text
Category
└── Subcategory
```

ตัวอย่าง

```text
อุปกรณ์และเครื่องใช้สำนักงาน
└── คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์
```

Category จากข้อมูลปัจจุบันควรนำเข้าจาก Excel จริงก่อน Go-live

ตัวอย่างกลุ่มที่พบในข้อมูลเดิม

- อุปกรณ์และเครื่องใช้สำนักงาน
- เครื่องตกแต่งสำนักงาน
- ยานพาหนะ
- สินทรัพย์ไม่มีตัวตน

## 10.2 Category Master ต้องเก็บ

- Category Code
- Category Name TH
- Category Name EN
- Parent Category
- Default Unit
- Default Useful Life
- Default Residual Value
- Default Depreciation Method
- Asset Account
- Depreciation Expense Account
- Accumulated Depreciation Account
- Active / Inactive

---

# 11. Account Mapping

ตัวอย่างจากข้อมูลปัจจุบัน

```text
Asset Account:
124106 - อุปกรณ์สำนักงาน

Depreciation Expense Account:
530706 - ค่าเสื่อมราคา - อุปกรณ์สำนักงาน

Accumulated Depreciation Account:
ต้อง Mapping ตาม Category จริงจากข้อมูลบัญชี
```

ระบบไม่จำเป็นต้อง Post GL ใน Phase นี้ แต่ต้องเก็บ Mapping เพื่อ

- ใช้อ้างอิง
- Export รายงาน
- ส่งข้อมูลไป Accounting System ภายหลัง

---

# 12. Depreciation Policy

ฝ่ายบัญชีต้องสามารถตั้ง Policy เองได้

## 12.1 Policy Fields

- Policy Name
- Category
- Method
- Useful Life
- Residual Value
- Start Rule
- Proration Rule
- Rounding Rule
- Effective Date
- Active / Inactive

## 12.2 Depreciation Method

Phase แรกอย่างน้อยต้องมี

- Straight Line / เส้นตรง

โครง Database ควรรองรับอนาคต

- Declining Balance
- Units of Production

## 12.3 Useful Life

กำหนดได้ทั้ง

- Default ตาม Category
- Override ราย Asset

ตัวอย่าง

```text
Computer
Useful Life = 5 Years
Residual Value = 1 Baht
Method = Straight Line
```

## 12.4 Start Date

ใช้ Ready-for-use Date เป็นหลัก

## 12.5 Proration

ระบบควรรองรับตั้งค่าได้ เช่น

- Full Month
- Actual Day / 365
- Start Next Month

เพื่อให้ฝ่ายบัญชีเลือก Policy เอง

---

# 13. Depreciation Calculation

## 13.1 Formula — Straight Line

```text
Depreciable Amount
= Cost - Residual Value

Annual Depreciation
= Depreciable Amount / Useful Life (Years)
```

ตัวอย่าง

```text
Cost = 100,000
Residual = 1
Life = 5 Years

Depreciable Amount = 99,999
Annual Depreciation = 19,999.80
```

## 13.2 Monthly Schedule

ระบบต้อง Generate Schedule ตั้งแต่

- Ready-for-use Date
ถึง
- วันที่ครบอายุ

Field ต่อเดือน

- Period
- Opening NBV
- Depreciation
- Accumulated Depreciation
- Closing NBV
- Status

## 13.3 Depreciation Run

```text
DRAFT
↓
CALCULATED
↓
REVIEWED
↓
LOCKED
```

ใน Phase ปัจจุบันไม่จำเป็นต้อง Post GL

---

# 14. Depreciation Preview

ก่อน Lock เดือน ต้องมีหน้าตรวจสอบ

แสดง

- จำนวน Asset ที่คำนวณ
- Depreciation เดือนนี้
- Accumulated Depreciation
- NBV
- Asset Error
- Missing Policy
- Invalid Ready Date

สามารถ Drill-down ถึง Asset รายตัวได้

---

# 15. Asset Status

ควรมีสถานะอย่างน้อย

```text
CANDIDATE
DRAFT
PENDING_REVIEW
ACTIVE
INACTIVE
UNDER_REPAIR
TEMPORARILY_UNUSED
DISPOSED
ARCHIVED
```

Phase แรกเน้น

- Candidate
- Draft
- Active
- Inactive
- Archived

---

# 16. Location Management

เพราะ Scope ปัจจุบันต้องรู้ว่า “ของอยู่ที่ไหน”

โครงสร้าง Location ควรรองรับ

```text
Company
└── Branch
    └── Building
        └── Floor
            └── Area / Room
```

Location Master Fields

- Location Code
- Location Name
- Company
- Branch
- Address
- Building
- Floor
- Room
- Active

---

# 17. รูปสินทรัพย์

ทุก Asset ควรมี

- Main Photo
- Additional Photos

ระบบควรมี Filter

```text
Missing Photo
```

เพื่อให้ฝ่ายที่เกี่ยวข้องตามเก็บรูปได้ง่าย

---

# 18. Documents

รองรับเอกสารต่อ Asset เช่น

- OA Approval
- PO
- GR
- Invoice
- Tax Invoice
- Warranty
- Contract
- Acceptance Document
- Asset Photo
- Other Supporting Document

Metadata

- Document Type
- File Name
- Upload By
- Upload Date
- Source System
- Source Document Number

---

# 19. QR / Barcode

Asset หลัง Activate ควร Generate QR Code ได้

QR เปิดหน้า Asset แบบ Read-only หรือหน้า Asset Detail ตาม Permission

ข้อมูลบน Label

```text
Company
Asset Code
Asset Name
QR Code
```

ใช้สำหรับ

- ค้น Asset
- ตรวจ Location
- ตรวจนับในอนาคต

---

# 20. Reports

## 20.1 Asset Register Report

- Asset Code
- Name
- Category
- Company
- Branch
- Department
- Cost Center
- Location
- Cost
- Accum Dep
- NBV

## 20.2 Category Summary

สรุป

- Count
- Cost
- Accum Dep
- NBV

ตาม Category

## 20.3 Depreciation Schedule

ราย Asset / รายเดือน

## 20.4 Location Report

ดูทรัพย์สินตามสถานที่

## 20.5 Missing Data Report

- Missing Photo
- Missing Category
- Missing Location
- Missing Account Mapping
- Missing Depreciation Policy

## 20.6 OA Import Report

- Import Date
- OA Number
- Status
- Asset Created
- Error

---

# 21. Audit Log

ทุกการเปลี่ยนข้อมูลสำคัญต้องเก็บ

- User
- Date/Time
- Action
- Asset Code
- Field
- Old Value
- New Value
- Reason
- Source

ตัวอย่าง

```text
Asset: FA00001
Field: Useful Life
Old: 3 Years
New: 5 Years
Changed By: Accounting Manager
Reason: Policy adjustment
```

Audit Log ห้ามแก้และห้ามลบจาก UI

---

# 22. Data Retention

Policy ปัจจุบันควรออกแบบให้

- เก็บ Asset History อย่างน้อย 10 ปี
- เก็บ Attachment
- เก็บ Depreciation History
- เก็บ Audit Log
- ห้าม Hard Delete Transaction สำคัญ

ใช้แนวทาง

```text
ACTIVE
↓
INACTIVE / DISPOSED
↓
ARCHIVED
```

ไม่ใช้ Delete

---

# 23. Import ข้อมูลเก่า

ระบบต้องรองรับ Excel Import สำหรับ Asset เดิม

Template อย่างน้อย

- Asset Code
- Name
- Category
- Subcategory
- Company
- Branch
- Department
- Cost Center
- Location
- Serial Number
- Cost
- Acquisition Date
- Ready Date
- Useful Life
- Residual Value
- Accumulated Depreciation
- NBV

ก่อน Import ต้องมี

- Validation
- Duplicate Check
- Preview
- Error Report

---

# 24. Settings

## 24.1 Company Master

- Company Code
- Name
- Tax ID
- Active

## 24.2 Branch Master

- Branch Code
- Name
- Company
- Address

## 24.3 Department Master

## 24.4 Cost Center Master

## 24.5 Location Master

## 24.6 Category Master

## 24.7 Account Mapping

## 24.8 Depreciation Policy

## 24.9 Running Number

ตัวอย่าง

```text
com26092300001
```

กำหนดได้จาก

- Company Prefix
- Year
- Month
- Sequence

## 24.10 OA Integration

- API Endpoint
- Auth
- Field Mapping
- Sync Mode
- Import Log

---

# 25. Permission

Role-based Access Control (RBAC)

ตัวอย่าง

| Function | Asset Accountant | Accounting Manager | Admin | Auditor |
|---|---:|---:|---:|---:|
| View Asset | ✓ | ✓ | ✓ | ✓ |
| Create Asset | ✓ | ✓ | - | - |
| Edit Draft | ✓ | ✓ | - | - |
| Approve Asset | - | ✓ | - | - |
| Run Depreciation | ✓ | ✓ | - | - |
| Edit Category | - | ✓ | ✓ | - |
| Edit GL Mapping | - | ✓ | - | - |
| View Audit | ✓ | ✓ | ✓ | ✓ |
| Delete Audit | - | - | - | - |

---

# 26. Database Modules ที่แนะนำ

```text
assets
asset_categories
asset_subcategories
asset_locations
asset_documents
asset_photos
asset_source_references
asset_depreciation_policies
asset_depreciation_schedules
asset_depreciation_runs
asset_audit_logs
asset_import_batches
asset_import_rows
companies
branches
departments
cost_centers
account_mappings
users
roles
permissions
```

---

# 27. Asset Table — Field หลัก

```text
id
asset_code
name_th
name_en
description
category_id
subcategory_id
company_id
branch_id
department_id
cost_center_id
location_id
serial_number
brand
model
unit
quantity
original_cost
additional_cost
total_cost
residual_value
useful_life_months
depreciation_method
acquisition_date
ready_for_use_date
accumulated_depreciation
net_book_value
status
oa_reference
po_reference
gr_reference
invoice_reference
supplier_name
created_at
created_by
updated_at
updated_by
```

---

# 28. UI / Design Direction

ระบบใช้ **Light Mode** เป็นหลัก

Style

- Clean
- Minimal
- Professional ERP
- White / light gray background
- Card แบบเรียบ
- Table อ่านง่าย
- Sidebar ชัดเจน
- Search / Filter ใช้ง่าย
- Responsive

หน้าหลักควรมี

```text
Left Sidebar
Top Search
Page Header
Filter Bar
Data Table
Right Drawer / Detail Panel
```

Asset Detail ใช้ Tab

```text
Overview
Accounting
Depreciation
Location
Documents
History
```

---

# 29. Scope Phase 1

ควรทำก่อน

1. Login / Permission
2. Dashboard
3. Company / Branch / Department / Cost Center
4. Category / Subcategory
5. Account Mapping
6. OA Import
7. Asset Candidate
8. Asset Register
9. Asset Detail
10. Location
11. Document / Photo
12. Depreciation Policy
13. Depreciation Calculation
14. Depreciation Schedule
15. Reports
16. Audit Log
17. Excel Import / Export
18. QR Code

---

# 30. Phase 2 ที่ค่อยเพิ่ม

- Holder / Employee Assignment
- Integration กับ OneHR
- Asset Transfer
- Repair / Maintenance
- Physical Count
- Mobile QR Scan
- Disposal Workflow
- Approval Workflow ขั้นสูง
- GL Integration
- TFRS 16
- Intangible Amortization Rules เพิ่มเติม

---

# 31. สรุปแนวคิดระบบแบบสั้น

ระบบนี้ควรตอบคำถามให้ได้ 7 เรื่องหลัก

```text
1. ของชิ้นนี้คืออะไร?
2. รหัส Asset คืออะไร?
3. อยู่บริษัท / สาขา / แผนก / Location ไหน?
4. อยู่ Category อะไร?
5. ราคาทุนเท่าไร?
6. คิดค่าเสื่อมอย่างไร และ NBV เหลือเท่าไร?
7. ข้อมูลนี้มาจาก OA / เอกสารไหน และเคยถูกแก้อะไรบ้าง?
```

ถ้าระบบตอบ 7 ข้อนี้ได้ครบ จะเป็น Fixed Asset System ที่เหมาะกับ Scope ปัจจุบันของ SHD โดยไม่ทำให้ระบบหนักเกินไปด้วยโมดูลการเงินที่ไม่ได้อยู่ในขอบเขต
