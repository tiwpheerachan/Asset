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
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/peak.ts` | auth (token + HMAC sign) + `fetchAssetCandidates()` ดึง Expenses กรอง 12xx |
| `src/lib/peak-mapping.ts` | `mapPeakCandidates()` → `OARecord[]` (`templateCode:'PEAK'`) |
| `src/app/api/peak/sync/route.ts` | `GET /api/peak/sync` (ถือ token ฝั่ง server) `?from=&to=` |
| `src/lib/store.tsx` | `syncPeak()` ดึง + merge คิว (dedupe `docNo`), audit `PEAK_IMPORT` |
| `src/app/(app)/oa-import/page.tsx` | ปุ่ม **"นำเข้าจาก PEAK"** |
| `src/lib/types.ts` | `SourceRef.sourceSystem: 'OA'\|'ONEBOOK'\|'PEAK'` |

ทรัพย์สินที่สร้างจะเก็บ `source.sourceSystem='PEAK'` และ `source.glAccountCode` (รหัสบัญชี PEAK เช่น 124106) ไว้อ้างอิง

## 5. ตั้งค่า (env — `apps/asset/.env.local`)
```
PEAK_BASE_URL=            # host จริง (ขอจาก PEAK/UAT)
PEAK_CONNECT_ID=
PEAK_APP_PASSWORD=        # Application Code
PEAK_USER_TOKEN=          # จาก consent (24h)
PEAK_ASSET_ACCOUNT_PREFIXES=12   # ปรับได้ เช่น 121,122,124
PEAK_SIG_ENCODING=base64         # base64 | hex
```

## 6. ข้อมูลผังบัญชี PEAK ที่ตรวจพบ (บริษัท เอสเอชดี)
- บัญชีสินทรัพย์: **`124xxx`** (เช่น `124106` อุปกรณ์สำนักงาน)
- ค่าเสื่อมสะสม: `124206` · ค่าเสื่อม(ค่าใช้จ่าย): `530706`
- วิธีค่าเสื่อมเริ่มต้น: เส้นตรง · ซาก 1 บาท · อายุ 5 ปี

## 7. สิ่งที่ยังต้องทำ/ยืนยัน
- [ ] ขอ **Connect ID + Application Code + เปิด UAT** จากทีม PEAK แล้วเสียบ env → เทสต์จริง
- [ ] ยืนยัน **encoding ของ Time-Signature** (base64/hex) กับ UAT
- [ ] ยืนยันว่าการซื้อทรัพย์สินใน PEAK ลงเป็นเอกสาร **Expense** (ถ้าซื้อผ่านโมดูล Asset เป็น `PA-xxx` อาจต้องดึงจาก Daily Journal เพิ่ม)
- [ ] (ออปชัน) ต่อ **Webhook ของ Expense** เพื่อ near-realtime แทน poll
- [ ] (lead) PEAK ประกาศรองรับ **"จัดการข้อมูลผ่าน MCP" (14 ต.ค. 2026)** — สอบถามว่ามี MCP ให้ดึงข้อมูลทรัพย์สินตรง ๆ ไหม (สะอาดกว่า)

## 8. หมายเหตุสถาปัตยกรรม
เทียบกับ ONEBOOK: ต่างแค่ (1) auth (PEAK ต้องเซ็น HMAC + token 2 ชั้น), (2) การกรอง 12xx ทำฝั่งเรา (PEAK ส่งทุกบรรทัดมา),
(3) **ไม่มี post-back ค่าเสื่อม** (PEAK ทำบัญชีเอง) นอกนั้นใช้คิว/flow ขึ้นทะเบียนชุดเดียวกัน
