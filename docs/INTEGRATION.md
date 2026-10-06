# แผนเชื่อมต่อ OA ↔ Fixed Asset (SHD Platform)

> เอกสารนี้สรุป "สัญญาการเชื่อมต่อ" (integration contract) ระหว่าง 2 ระบบของ SHD
> ที่ยืนยันด้วยการทดสอบ API จริงบนเครื่อง dev แล้ว (2026-10-01)
>
> - **OA** = `internal-approve` — ระบบขออนุมัติภายใน (Internal Approval, แนว Lark/Feishu)
> - **Asset** = `fixed-asset-system` — ระบบบริหารทรัพย์สินถาวร (Fixed Asset)

---

## 1. ภาพรวมสถาปัตยกรรม

- **2 เว็บแยกกัน คนละ domain** แต่อยู่ใน **monorepo เดียว** และใช้ **Postgres ฐานเดียวกัน**
- OA เป็น **เจ้าของข้อมูลคำขออนุมัติ** · Asset เป็น **ผู้บริโภค** (ดึงคำขอที่อนุมัติแล้วมาสร้างทรัพย์สิน)
- เชื่อมกัน 2 ทาง: OA → Asset (คำขออนุมัติ) และ Asset → OA (รายงานกลับว่าขึ้นทะเบียนแล้ว)

```
┌─────────────────────┐        pull: GET /api/v1/requests?status=APPROVED
│   OA (Internal       │  ───────────────────────────────────────────────▶ ┌──────────────────┐
│   Approval)          │        push: webhook request.approved (HMAC-SHA256) │  Asset (Fixed    │
│   oa.shd-...         │  ◀─────────────────────────────────────────────── │  Asset)          │
│                      │        callback: POST /requests/{doc_no}/accounting │  asset.shd-...   │
└──────────┬──────────┘                                                     └────────┬─────────┘
           │                         Postgres เดียวกัน (shared)                        │
           └──────────────────────────────────┬───────────────────────────────────────┘
                                   ตาราง OA (requests, form_*)  +  ตาราง Asset (assets, dep_runs, ...)
```

---

## 2. สัญญา API (ยืนยันด้วยการทดสอบจริง)

Base URL (dev): `http://localhost:3010` · (prod): `https://oa.shd-technology.co.th`

### Authentication
- Header: **`X-API-Key: ia_<48 hex>`** (ทุก request)
- Scope มี 2 แบบ: `read` และ `write` — Asset ต้องใช้ **`write`** (ดึง + ส่ง callback กลับได้)
- เก็บเฉพาะ SHA-256 hash ของ key ใน DB · ออก key ที่เมนู "เชื่อมต่อระบบภายนอก" (แสดงครั้งเดียว)
- Rate limit: 120 req/min ต่อ key (ปรับที่ env `API_RATE_PER_MIN`)

### Endpoints ที่ Asset ใช้
| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET | `/api/v1/ping` | เช็ค key + ดูว่า webhook/states ตั้งไว้ยังไง |
| GET | `/api/v1/templates` | เรียนรู้โครงฟอร์ม + field role (refresh รายวัน) |
| GET | `/api/v1/requests?status=APPROVED&since=YYYY-MM-DD&limit=&offset=` | **ดึงคำขอที่อนุมัติแล้ว** |
| GET | `/api/v1/requests/{id\|doc_no}` | ดึงใบเดียว (ใช้ doc_no ได้) |
| GET | `/api/v1/files/{id}` | ดาวน์โหลดไฟล์แนบ (ใบเสนอราคา/ใบกำกับ) |
| POST | `/api/v1/requests/{doc_no}/accounting` | **รายงานกลับ** ว่าขึ้นทะเบียนทรัพย์สินแล้ว |

### รูปร่าง request object (payload จริงจากการทดสอบ)
```json
{
  "id": 5,
  "doc_no": "AP-PURC-202610-0001",
  "type": { "id": 2, "code": "PURCHASE", "name": "จัดซื้อ" },
  "title": "Notebook Lenovo V15 G6 (3 เครื่อง) ทีม Sales",
  "amount": 65910,
  "doc_date": "2026-10-01",
  "status": "APPROVED",
  "requester": { "id": 8, "name": "กิตติ มั่นคง", "department": "ฝ่ายจัดซื้อ", "position": "หัวหน้าฝ่ายจัดซื้อ" },
  "submitted_at": "2026-10-01T08:00:00Z",
  "closed_at": "2026-10-01T09:30:00Z",
  "fields": {
    "doc_date": "2026-10-01",
    "subject": "Notebook Lenovo V15 G6 (3 เครื่อง) ทีม Sales",
    "amount": 65910,
    "body": "โน้ตบุ๊คสำหรับพนักงานใหม่ทีมขาย",
    "vendor": "Advice IT Infinite PCL",
    "items": [
      { "_id": "r0", "name": "Notebook Lenovo V15 G6", "qty": 3, "unit_price": 21970, "note": "ประกัน 3 ปี" }
    ]
  },
  "approvals": [ /* { step, stage, name, status, acted_at, acted_by, comment } */ ],
  "documents": [ /* เลขเอกสารที่ออก เช่น CN/Invoice */ ],
  "attachments": [ /* { id, filename, mime, size, field_key, url: "/api/v1/files/{id}" } */ ]
}
```

---

## 3. Mapping: ฟอร์ม `PURCHASE` (OA) → Asset

ฟอร์ม `PURCHASE` คือฟอร์มขอซื้อ (ตัวที่ Asset สนใจ) โครงจริงจาก `/api/v1/templates`:

| OA (ฟอร์ม PURCHASE) | role | → | Asset field | หมายเหตุ |
|---|---|---|---|---|
| `doc_no` | — | → | `source.oaNo` + external key หลัก | ใช้ dedupe |
| `title` / `fields.subject` | TITLE | → | `nameTh` | ชื่อทรัพย์สิน |
| `amount` | AMOUNT | → | `originalCost` (ยอดรวม) | ⚠️ อาจ `null` ถ้าฟอร์มไม่ตั้ง role (ดูข้อ 4) |
| `doc_date` / `closed_at` | DATE | → | `acquisitionDate` / วันที่ลงบัญชี | |
| `fields.vendor` | — | → | `source.supplier` | ผู้ขาย |
| `fields.items[]` (TABLE) | — | → | **รายการทรัพย์สินแต่ละชิ้น** | `name`, `qty`, `unit_price`, `note` → split เป็น N assets |
| `requester.email` | — | → | ผู้ขอ / ผู้ถือครอง (lookup) | email = คีย์ข้ามระบบ |
| `attachments[]` | — | → | `AssetDocument` (OA_APPROVAL/INVOICE) | ดาวน์โหลดผ่าน `/files/{id}` |

**การ split:** `items[]` 1 แถว qty=3 → สร้าง 3 asset (หรือ 1 asset qty=3) ตามที่ผู้ใช้เลือกในหน้า OA Import (logic `createFromOA` ฝั่ง Asset มีอยู่แล้ว)

---

## 4. ⚠️ กับดัก 3 ข้อ (ต้องจัดการ)

1. **field ที่ Asset เดิมคาดหวังไม่มีใน OA** — ฟอร์ม PURCHASE ไม่มี `po_no`, `invoice_no`, `gr_no`, `cost_center`, `serial` เป็น field ตายตัว
   → PO/invoice/GR/serial กรอกเพิ่มฝั่ง Asset ตอน review · cost-center มาจาก Central Directory ไม่ใช่ OA
   → **map ด้วย `role` ก่อน** แล้วค่อย fallback เป็น field key (`vendor`, `items`) · field key ของฟอร์ม admin สร้างเองเป็นค่าสุ่ม ต้องอ่านจาก `/templates`

2. **`amount` อาจเป็น null** — ถ้าฟอร์มไม่ได้ตั้ง role `AMOUNT`/`DATE`
   → **ต้องให้ทีม OA ตั้ง role ให้ฟอร์ม PURCHASE** (config เว็บ ไม่ต้องแก้โค้ด) ก่อน go-live
   → Asset ต้องมี fallback: ถ้า `amount` null ให้คำนวณจาก `Σ(items.qty × unit_price)`

3. **org model ต้อง align** — company/branch/department/cost-center ของ 2 ระบบต้องชุดเดียวกัน
   → ดึงจาก Central Directory (keyed by email) · ระยะแรกใช้ `requester.department` จาก payload ไปก่อนได้

---

## 5. Data flow (เฟสแรก)

1. OA: คำขอ PURCHASE อนุมัติครบ → `status=APPROVED` + ยิง webhook `request.approved` (+ Asset poll เป็น backstop)
2. Asset: รับ/ดึง → map → เข้าคิว OA Import สถานะ `NEW` (dedupe ด้วย `doc_no`)
3. Asset: เจ้าหน้าที่ review → เลือกหมวด/split → `createFromOA` → สร้างทรัพย์สิน (DRAFT)
4. Asset: ยิง callback `POST /requests/{doc_no}/accounting` → `{ state: "RECORDED", external_ref: "<รหัสทรัพย์สิน>", external_url: "<ลิงก์หน้า asset>" }`
5. OA: แสดงสถานะ "ขึ้นทะเบียนทรัพย์สินแล้ว" ในหน้าเอกสาร + แจ้งผู้ขอ

---

## 6. จุดที่ต้องแก้ฝั่ง Asset (โค้ดเรา)

- `src/lib/store.tsx → syncOA()` — เปลี่ยนจากปลอม record เป็นเรียก OA API จริง + map + dedupe
- `src/data/masters.ts → OA_INTEGRATION` — แก้ endpoint เป็น `/api/v1/requests?status=APPROVED`, auth `X-API-Key`, รื้อ `mapping` ตามข้อ 3
- `src/lib/types.ts → OARecord` — เพิ่ม `docNo` (external key), `templateCode`, เก็บ `fields` ดิบ, `attachments[]`
- เพิ่มฟังก์ชัน callback `reportAssetRegistered(docNo, assetCode, url)` → POST accounting

---

## 7. Checklist สถานะ

- [x] อ่าน + เข้าใจทั้งสองระบบ
- [x] รัน OA app (dev) + ทดสอบ API จริง (ping/templates/users/requests POST+pull)
- [x] ยืนยัน payload จริงของฟอร์ม PURCHASE
- [x] วางโครง monorepo (apps/oa + apps/asset + packages/shared)
- [x] `packages/shared`: types ร่วม + OA API client (ห่อ `/api/v1`)
- [x] แก้ `syncOA()` ให้เรียก API จริง (ผ่าน server route `/api/oa/sync`)
- [x] ปรับ `OARecord` + mapping layer (`src/lib/oa-mapping.ts`)
- [x] callback `POST .../accounting` (ผ่าน `/api/oa/callback` + hook ใน `createFromOA`)
- [x] **ทดสอบ end-to-end จริง 2 ทาง** — OA→Asset (pull) + Asset→OA (RECORDED) ผ่านแล้ว
- [ ] ตั้ง role AMOUNT/DATE ให้ฟอร์ม PURCHASE บน OA prod (ทีม OA — config เว็บ)
- [x] ย้าย Asset store จาก localStorage → Postgres (shared DB) — schema `fa` ใน `approve_dev` (ข้างๆ `public` ของ OA), โหลด/บันทึกผ่าน `/api/fa/state`, session อยู่ที่ browser · ทดสอบ persist ข้าม reload ผ่านแล้ว
- [ ] Central SSO/Directory ร่วมกัน (keyed by email)
- [x] ปรับ UI ของ OA ให้เป็นสไตล์ Asset (navy SHD + IBM Plex + rounded-md ผ่าน CSS variables — โลโก้ SHD, nav/badge/ปุ่ม navy ทุกหน้า)
- [ ] เพิ่ม webhook receiver ฝั่ง Asset (real-time push แทน/เสริม pull)

---

## 8. ภาคผนวก — ค่าทดสอบ dev

- OA dev: `http://localhost:3010` · DB `postgresql://localhost:5432/approve_dev`
- Asset dev: `http://localhost:3001` (localStorage)
- บัญชีทดสอบ OA: `admin@company.co.th` / `password123` (เปลี่ยนก่อน prod ด้วย `npm run reset-passwords`)
- Write API key ทดสอบ: ออกไว้ในตาราง `api_keys` ชื่อ "Fixed-Asset System (dev test)" (ค่า key เก็บแยก ไม่ commit)
