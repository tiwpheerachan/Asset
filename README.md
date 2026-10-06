# SHD Platform (monorepo)

สองระบบของ SHD อยู่ใน repo เดียว **แยกเป็นคนละเว็บ** เชื่อมกันผ่าน API และใช้ **Postgres ฐานเดียวกัน**

```
shd-platform/
├── apps/
│   ├── oa/        ระบบขออนุมัติภายใน (Internal Approval)   → oa.shd-technology.co.th   (:3010 dev)
│   └── asset/     ระบบบริหารทรัพย์สินถาวร (Fixed Asset)    → asset.shd-technology.co.th (:3001 dev)
├── packages/
│   └── shared/    @shd/shared — OA API types + client ใช้ร่วมกัน
└── docs/
    └── INTEGRATION.md   แผนเชื่อมต่อ OA ↔ Asset (contract + mapping + checklist)
```

## เริ่มใช้งาน (dev)

```bash
# 1. ติดตั้ง (npm workspaces)
npm install

# 2. ฐานข้อมูล (ใช้ร่วมกัน) — ต้องมี Postgres local
createdb approve_dev
npm run seed:oa

# 3. รันแต่ละเว็บ (คนละ terminal)
npm run dev:oa      # http://localhost:3010   (admin@company.co.th / password123)
npm run dev:asset   # http://localhost:3001
```

## การเชื่อมต่อ

ดู `docs/INTEGRATION.md` — OA เปิด REST API `/api/v1/*` (auth `X-API-Key`) + webhook `request.approved`
ฝั่ง Asset ดึงคำขอที่ `status=APPROVED` มาสร้างทรัพย์สิน แล้วรายงานกลับผ่าน `POST /accounting`

## หมายเหตุ

- ต้นฉบับเดิมของทั้งสองแอปยังอยู่ที่ `~/Downloads/fixed-asset-system` และ `~/Downloads/internal-approve-master` (backup)
- `.env` ไม่ถูก commit — ใช้ค่า dev ในเครื่อง แล้วแทนที่ด้วย env จริงก่อน deploy
