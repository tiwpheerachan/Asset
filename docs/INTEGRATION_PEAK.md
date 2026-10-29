# การเชื่อมต่อ ONE Asset ↔ PEAK (ระบบบัญชี)

> สรุป: PEAK คือ **ผู้ให้บริการบัญชีรายที่ 3** ของ ONE Asset (ถัดจากระบบ OA ภายใน และ ONEBOOK)
> **ทิศทางเดียว: ดึงเข้าเท่านั้น** — ONE Asset ดึงรายการซื้อที่เป็นทรัพย์สินจาก PEAK มาขึ้นทะเบียน
> และ **คิดค่าเสื่อมในระบบเราเอง** ส่วนบัญชี/ค่าเสื่อมของ PEAK ยังเป็นของ PEAK (ไม่ยิงอะไรกลับ)

## 1. หลักการ (ทำไมดึงจาก "บัญชีหลัก" ไม่ใช่โมดูล PEAK Asset)
- **บัญชีหลัก PEAK มี REST API** (`/api/v1/*`) ส่วนโมดูล PEAK Asset (`asset.peakaccount.com`) เป็นเว็บ server-rendered ไม่มี API สาธารณะ
- ตอน "ซื้อทรัพย์สิน" จะถูกบันทึกบัญชีเป็น **Expense ที่ลงผังบัญชีสินทรัพย์ (ขึ้นต้น `12` เช่น `124xxx`)** — นี่คือต้นทางจริงที่เกิดก่อน
- ดึงจากบัญชีหลัก = **เราตรวจจับเองว่าอะไรเป็นทรัพย์สิน** (กรองรหัสบัญชี) เหมือน ONEBOOK ทุกประการ, อัตโนมัติ, ไม่พึ่งการ import มือในโมดูล Asset

## 2. การยืนยันตัวตน (ต้องเซ็นทุก request)
| สิ่งที่ต้องมี | ได้จาก |
|---|---|
| **Connect ID** | ทีม PEAK (อีเมล) — เป็น secret key ของ HMAC ด้วย |
| **Application Code** | ทีม PEAK — ใช้ขอ Client-Token |
| **Client-Token** | `POST /api/v1/ClientToken` body `{PeakClientToken:{connectId,password}}` → `token` |
| **User-Token** | ผู้ใช้กดยินยอมเชื่อมต่อในแอป PEAK (อายุ 24 ชม. ต้อง refresh) |

**ทุก API call แนบ header:**
- `Time-Stamp` = `yyyyMMddHHmmss` (UTC)
- `Time-Signature` = `HMAC-SHA1(Time-Stamp)` โดย **secret key = Connect ID** (encoding: base64 ค่าเริ่มต้น / hex — ยืนยันตอน UAT)
- `Client-Token`, `User-Token`

## 3. ดึงรายการทรัพย์สิน
- `GET /api/v1/Expenses/list?dateStart=&dateEnd=&status=0&limit=100&page=N` (หน้าละ 100)
- Response: `peakExpenses.expenses[]` แต่ละรายการมี `code`, `issuedDate`, `contactCode`, `netAmount`, และ **`products[]`**
- แต่ละบรรทัดใน `products[]` มี **`accountCode`** → **กรองเฉพาะที่ขึ้นต้นตาม `PEAK_ASSET_ACCOUNT_PREFIXES` (default `12`)** = ทรัพย์สิน
- แปลงเป็น `OARecord` (`templateCode: 'PEAK'`) เข้าคิวหน้า **OA Import** → รีวิว → ขึ้นทะเบียน + คิดค่าเสื่อม

## 4. ไฟล์ในระบบ (ฝั่ง `apps/asset`)

**แหล่งข้อมูล 2 ทาง เลือกด้วย env `PEAK_SOURCE`:**
- **`mcp` (ค่าเริ่มต้น, ที่ใช้งานจริง)** — อ่านจาก snapshot ที่ Claude ดึงผ่าน **PEAK MCP** (read-only) · ไม่ต้องตั้ง credential · ใช้ **General Ledger ของบัญชีทรัพย์สิน 1241xx** เป็นต้นทาง (สะอาดกว่า Expense เพราะเจอเฉพาะที่ลงเป็นทรัพย์สินจริง + คำอธิบายฝังรหัสทรัพย์สิน/ผู้ขาย/เลข PA ของ PEAK มาให้)
- **`rest`** — ยิง PEAK Open API สด (HMAC + token 2 ชั้น) ตามข้อ 2 · ต้องมี credential

| ไฟล์ | หน้าที่ |
|---|---|
| `src/data/peak/asset-candidates.json` | **snapshot** ที่ดึงผ่าน MCP (candidate การซื้อทรัพย์สิน 1241xx) |
| `scripts/build-peak-snapshot.mjs` | แปลง raw GL (`scripts/peak-raw/*.json`) → snapshot + parse รหัสทรัพย์สิน/ผู้ขาย/PA |
| `src/lib/peak-mcp.ts` | `loadSnapshotCandidates()` อ่าน snapshot กรอง 1241xx + ช่วงวัน · `peakSnapshotMeta()` |
| `src/lib/peak.ts` | (โหมด rest) auth (token + HMAC) + `fetchAssetCandidates()` ดึง Expenses กรอง 1241 |
| `src/lib/peak-mapping.ts` | `mapPeakCandidates()` → `OARecord[]` (`templateCode:'PEAK'`) ใช้ร่วมทั้ง 2 โหมด |
| `src/app/api/peak/sync/route.ts` | `GET /api/peak/sync?from=&to=` เลือกแหล่งตาม `PEAK_SOURCE` |
| `src/lib/store.tsx` | `syncPeak()` ดึง + merge คิว (dedupe `docNo`), audit `PEAK_IMPORT` |
| `src/app/(app)/oa-import/page.tsx` | ปุ่ม **"นำเข้าจาก PEAK"** |
| `src/lib/types.ts` | `SourceRef.sourceSystem: 'OA'\|'ONEBOOK'\|'PEAK'` |

**วิธีรีเฟรช snapshot:** ใน Claude Code (ต่อ PEAK MCP แล้ว) เรียก `get_general_ledger` บัญชี 124101–124109 ช่วงที่ต้องการ → เซฟ response ดิบลง `apps/asset/scripts/peak-raw/<code>.json` → `node scripts/build-peak-snapshot.mjs`

ทรัพย์สินที่สร้างจะเก็บ `source.sourceSystem='PEAK'` และ `source.glAccountCode` (รหัสบัญชี PEAK เช่น 124106) ไว้อ้างอิง

## 5. ตั้งค่า (env — `apps/asset/.env.local`)
```
PEAK_SOURCE=mcp                  # mcp (ค่าเริ่มต้น, อ่าน snapshot) | rest (ยิง API สด)
# --- ใช้เฉพาะ PEAK_SOURCE=rest ---
PEAK_BASE_URL=                   # host จริง (ขอจาก PEAK/UAT)
PEAK_CONNECT_ID=
PEAK_APP_PASSWORD=               # Application Code
PEAK_USER_TOKEN=                 # จาก consent (24h)
PEAK_ASSET_ACCOUNT_PREFIXES=1241 # ทรัพย์สินถาวร 1241xx (ไม่รวม 121-123 เงินลงทุน, 1242xx ค่าเสื่อมสะสม)
PEAK_SIG_ENCODING=hex            # hex | base64
```
> โหมด `mcp` ไม่ต้องตั้ง credential ใด ๆ — snapshot ถูกคอมมิตมากับโค้ด

## 6. ข้อมูลผังบัญชี PEAK ที่ตรวจพบ (บริษัท เอสเอชดี)
- บัญชีสินทรัพย์: **`124xxx`** (เช่น `124106` อุปกรณ์สำนักงาน)
- ค่าเสื่อมสะสม: `124206` · ค่าเสื่อม(ค่าใช้จ่าย): `530706`
- วิธีค่าเสื่อมเริ่มต้น: เส้นตรง · ซาก 1 บาท · อายุ 5 ปี

## 7. สถานะ / สิ่งที่ยังต้องทำ
- [x] **ต่อ PEAK ผ่าน MCP สำเร็จ (29 ต.ค. 2026)** — ดึง GL 1241xx จริงผ่าน `get_general_ledger` (read-only) → snapshot → `/api/peak/sync?PEAK_SOURCE=mcp` → คิว OA Import · typecheck + build compile ผ่าน · เทสต์ endpoint คืน 95 รายการจริง (ปี 2026: 124106 อุปกรณ์สำนักงาน 94 + 124107 เก้าอี้ 1)
- [x] แก้ prefix เป็น **1241** (เดิม 12 กว้างเกิน รวมเงินลงทุน/เงินกู้)
- [ ] รีเฟรช snapshot เป็นระยะ (ดูวิธีท้ายข้อ 4) — หรือทำ bridge อัตโนมัติ
- [ ] (ถ้าต้องการ live จริงในแอปโดยไม่พึ่ง Claude) ทำ **MCP client ฝั่งแอป** (OAuth เอง)/หรือใช้โหมด `rest` เมื่อได้ production credential
- [ ] **ค่าเสื่อมสะสม/NBV รายชิ้น** ของทรัพย์สินเดิม — ยังดึงตรงไม่ได้ (PEAK ไม่เปิด API โมดูล Asset) · GL 1242xx ให้ยอดรวมได้ · รายชิ้นยังต้อง Excel export
- [ ] ยืนยันกับ accounting: รายการ Dr 1241xx ทุกบรรทัด = "ซื้อทรัพย์สินใหม่" (ไม่มี reclass/โอนเข้าปน)

## 8. หมายเหตุสถาปัตยกรรม
เทียบกับ ONEBOOK: ต่างแค่ (1) auth (PEAK ต้องเซ็น HMAC + token 2 ชั้น), (2) การกรอง 12xx ทำฝั่งเรา (PEAK ส่งทุกบรรทัดมา),
(3) **ไม่มี post-back ค่าเสื่อม** (PEAK ทำบัญชีเอง) นอกนั้นใช้คิว/flow ขึ้นทะเบียนชุดเดียวกัน
