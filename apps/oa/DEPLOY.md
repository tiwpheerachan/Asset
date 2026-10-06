# Deploy ระบบขออนุมัติภายใน (internal-approve)

ใช้ **Render + Docker + Disk ถาวร** + **PostgreSQL แยกเครื่อง** (ดิสก์ยังต้องมีเพราะไฟล์แนบ)

> ⚠️ Disk บน Render ใช้ได้เฉพาะแพ็กเกจเสียเงิน (`plan: starter` ~$7/เดือน) — free ไม่มี disk
> ถ้าจะฟรีจริง ต้องย้ายไฟล์แนบไป object storage เพื่อเลิกใช้ดิสก์ (งาน refactor)


## ย้ายฐานข้อมูลจาก SQLite ไป PostgreSQL (ทำครั้งเดียว)

> ลำดับสำคัญ — ถ้า deploy โค้ดใหม่ก่อนตั้ง `DATABASE_URL` ระบบจะเปิดไม่ขึ้นทั้งตัว

**1. เตรียมฐานข้อมูลปลายทาง**
สร้างโปรเจกต์ใหม่ที่ Supabase · เลือก region **Singapore** ให้ตรงกับ Render
คัดลอก connection string จาก Project Settings → Database → Connection string → URI
โดยใช้ช่อง **Connection pooling (พอร์ต 6543)** ไม่ใช่ต่อตรงพอร์ต 5432

**2. ตั้งค่าใน Render ก่อน deploy**
หน้า Environment ของ service → เพิ่ม `DATABASE_URL` = connection string จากขั้นที่ 1
(ยังไม่ต้อง deploy)

**3. สร้างตารางในฐานข้อมูลใหม่**
```bash
psql "$DATABASE_URL" -f src/lib/schema.pg.sql
```

**4. ย้ายข้อมูลจากไฟล์ SQLite ของ production**
ดาวน์โหลด `app.db` ล่าสุดจากหน้า `/admin/backup` (หรือ Render shell) มาไว้ในเครื่อง แล้ว
```bash
DATABASE_URL='...' npm run migrate-to-pg -- ./app.db --dry-run   # ดูก่อน
DATABASE_URL='...' npm run migrate-to-pg -- ./app.db             # ย้ายจริง
```
สคริปต์ทำในรายการเดียว — ถ้าจำนวนแถวไม่ตรงแม้แถวเดียวจะยกเลิกทั้งหมดและไม่แก้ปลายทาง
`id` เดิมถูกรักษาไว้ทุกแถว ลิงก์เอกสารที่คนเคยส่งกันไว้จึงยังใช้ได้

**5. deploy โค้ดใหม่**
merge branch เข้า `master` → Render deploy อัตโนมัติ → เช็คที่ `/api/version`

**6. ตรวจหลัง deploy**
เปิดหน้ารายการ · เปิดเอกสารหนึ่งใบ · กดสำรองข้อมูลหนึ่งครั้ง · ลองยื่นเอกสารทดสอบ

**ถ้าต้องถอย:** ไม่ต้องกู้ข้อมูล — revert commit แล้ว deploy กลับ ไฟล์ SQLite เดิมยังอยู่
บนดิสก์ `/data` ครบถ้วน เพราะการย้ายเป็นการ "อ่าน" ไฟล์นั้น ไม่ได้แก้อะไรในนั้นเลย

**ไฟล์แนบ:** ไม่ได้อยู่ในฐานข้อมูล และไม่ต้องย้าย — ยังอยู่ที่ `/data/uploads` เหมือนเดิม


## ย้ายไฟล์แนบขึ้น Supabase Storage (ทำครั้งเดียว)

ไฟล์แนบ ไอคอนฟอร์ม และลายเซ็น เคยอยู่บนดิสก์ `/data` ของ Render ก้อนเดียว
ไม่มีสำเนาที่ไหนเลย และเป็นสาเหตุที่ระบบขยายเป็นหลายเครื่องไม่ได้
(ไฟล์ที่อัปโหลดเข้าเครื่องหนึ่ง อีกเครื่องมองไม่เห็น)

**1. สร้างถังที่ Supabase**
Storage → New bucket → ชื่อ `attachments` → **ต้องเป็น Private** ห้ามติ๊ก Public

**2. สร้างกุญแจ**
Storage → S3 Access Keys → New access key → เก็บค่าไว้ (แสดงครั้งเดียว)
และคัดลอก endpoint จาก Storage → S3 Connection

**3. ตั้งค่าใน Render** (ยังไม่ต้อง deploy)
```
S3_BUCKET=attachments
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_REGION=ap-southeast-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

**4. ย้ายไฟล์เดิมขึ้นไป**
คัดลอกโฟลเดอร์ `uploads` จากดิสก์ Render มาไว้ที่ `data/uploads` ในเครื่อง แล้ว
```bash
npm run upload-to-s3 -- --dry-run   # ดูก่อน
npm run upload-to-s3                # ส่งจริง
```
สคริปต์ไม่ลบไฟล์บนดิสก์ · รันซ้ำได้ · ตรวจขนาดที่ปลายทางทุกไฟล์

**5. deploy** แล้วทดสอบ: เปิดไฟล์เก่า · แนบไฟล์ใหม่ · ตรวจว่าคนไม่มีสิทธิ์เปิดไม่ได้

**ถ้าต้องถอย:** ลบค่า `S3_BUCKET` ออกจาก Render แล้ว deploy — ระบบกลับไปอ่านจากดิสก์
ทันทีโดยไม่ต้อง revert โค้ด เพราะไฟล์เดิมยังอยู่ครบ (สคริปต์ไม่เคยลบ)

**ตอนอ่านไฟล์ระบบหาที่เก็บใหม่ก่อน ไม่เจอค่อยดูดิสก์** — ช่วงกำลังทยอยย้ายจึงไม่มี
จังหวะที่ไฟล์เปิดไม่ได้

## ไฟล์ที่เตรียมให้แล้ว
- `Dockerfile` — build + run (ไม่ต้องมี toolchain แล้ว ไดรเวอร์ pg เป็น JavaScript ล้วน)
- `.dockerignore` — กัน data/.env.local/node_modules เข้า image
- `render.yaml` — web service + disk (mount `/data`) + env ครบ (SSO/Directory/LARK)

## ขั้นตอน

### 1) ขึ้น GitHub
```bash
cd ~/Desktop/internal-approve
git add -A && git commit -m "เตรียมไฟล์ deploy (Docker + Render + disk)"
# สร้าง repo แล้ว push (เช่น gh repo create internal-approve --private --source=. --push)
```
> `.env.local` และ `data/` ถูก ignore อยู่แล้ว ไม่ขึ้น Git

### 2) สร้างบน Render
- Render → **New +** → **Blueprint** → เลือก repo → Render อ่าน `render.yaml` เอง
- จะได้ web service `internal-approve` + disk 1GB (mount `/data`)
- กรอก env ที่เป็น `sync:false`:
  - `APP_BASE_URL` — ใส่ทีหลังได้ (รอ URL) แต่ต้องใส่ก่อนใช้ SSO/Lark callback
  - `NEXT_PUBLIC_COMPANY_NAME` / `_EN`
  - `SEED_PASSWORD`
- กด Deploy → รอ build → ได้ URL เช่น `https://internal-approve-xxxx.onrender.com`

### 3) ตั้ง URL + SSO + Directory
- เซ็ต `APP_BASE_URL` = URL ที่ได้ (แล้ว redeploy)
- ที่ **Central Login** (แอป Internal Approveal) → SSO/OIDC → เพิ่ม redirect:
  `https://<URL>/api/auth/sso/callback`
- ใส่ `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` / `DIRECTORY_API_KEY` ใน Render

### 4) เปิดแจ้งเตือน Lark
ทำตาม **`LARK-SETUP.md`** — ตั้งสิทธิ์ + callback (`https://<URL>/api/lark/callback`) + ใส่
`LARK_APP_ID/SECRET/VERIFICATION_TOKEN` แล้ว sync Lark IDs ที่ `/admin/integrations`

### 5) ผู้ใช้เริ่มต้น
- ล็อกอินผ่าน **Central Login (SSO)** ได้เลย (role admin จากระบบกลาง → ADMIN)
- หรือถ้าจะใช้ local login: shell เข้า container แล้ว `npm run seed` ครั้งเดียว (ใช้ `SEED_PASSWORD`)

## หมายเหตุสำคัญ
- **Backup:** ข้อมูลอยู่บน disk `/data` — Render disk มี snapshot; ควรตั้ง backup เพิ่ม (แอปมีระบบ backup ในตัว ตั้ง `BACKUP_*`)
- **ย้ายข้อมูลจาก SQLite เดิม:** `DATABASE_URL='...' npm run migrate-to-pg -- ./data/app.db`
  (ใส่ `--dry-run` ดูก่อนได้) แล้วคัดลอกโฟลเดอร์ `data/uploads` ขึ้น disk `/data` ด้วย —
  ไฟล์แนบไม่ได้อยู่ในฐานข้อมูล · อย่า commit ไฟล์ข้อมูลขึ้น Git

---

## build ที่ GitHub Actions แล้วให้ Render ดึง image ไปใช้

### ทำไมต้องย้าย

`next build` ใช้แรมสูงสุด **~676MB** (วัดด้วย `/usr/bin/time -l`) ส่วนเครื่องที่ Render
ใช้ build มีให้น้อยกว่านั้น — deploy จึงล้มถี่ขึ้นเรื่อยๆ ตามขนาดโค้ดที่โตขึ้น

เครื่องของ GitHub Actions มีแรม 7GB build ผ่านสบาย แล้วส่ง image สำเร็จรูปให้ Render
ดึงไปรัน · Render ไม่ต้อง build เอง ปัญหาแรมหมดไปถาวรโดยไม่ต้องอัปแพ็กเกจ

### สถานะตอนนี้

workflow `.github/workflows/build-image.yml` **สร้าง image เก็บไว้ที่ GHCR อย่างเดียว
ยังไม่ได้สั่ง Render ให้ใช้** — ของที่รันอยู่ไม่กระทบ สลับเมื่อพร้อมได้ตามขั้นตอนล่าง

### ขั้นตอนสลับ (ทำที่หน้าเว็บ ผมทำแทนไม่ได้)

**1. ดูว่า image สร้างสำเร็จหรือยัง**

หน้า Actions ของ repo → workflow "build image" ต้องเขียว
image จะอยู่ที่ `ghcr.io/dataanalystshd/internal-approve:latest`

**2. ให้ Render ดึง image จาก GHCR ได้**

repo นี้เป็น private → package ก็ private ตาม Render จึงต้องมีบัตรผ่าน

- สร้าง GitHub Personal Access Token (classic) ติ๊ก scope **`read:packages`** อย่างเดียว
- Render → **Settings → Registry Credentials → Add Credential**
  - Registry: `ghcr.io` · Username: ชื่อ GitHub ของตัวเอง · Password: token ที่เพิ่งสร้าง

> ⚠️ **อย่าเปลี่ยน package เป็น public แทน** — image มีโค้ดที่ build แล้วของระบบอยู่ข้างใน
> ใครก็ดึงไปดูได้ ปลอดภัยกว่าคือใช้ token

**3. เปลี่ยน Render ให้ใช้ image แทนการ build เอง**

Render → Settings → เปลี่ยนจาก build จาก repo เป็น **Deploy an existing image**
ใส่ `ghcr.io/dataanalystshd/internal-approve:latest`

**ตัวแปรและดิสก์เดิมไม่หาย** — `DATA_DIR=/data`, disk, `TZ`, `BACKUP_DIR`,
`SSO_*`, `CENTRAL_*` ยังอยู่เหมือนเดิม เปลี่ยนแค่ที่มาของ image

**4. ให้ deploy อัตโนมัติเมื่อมี image ใหม่**

- Render → Settings → **Deploy Hook** คัดลอก URL มา
- GitHub → repo → Settings → Secrets and variables → Actions → New secret
  ชื่อ **`RENDER_DEPLOY_HOOK`** ค่า = URL นั้น

workflow จะเรียก hook ให้เองหลังส่ง image เสร็จ · ถ้ายังไม่ตั้ง secret จะข้ามไปเงียบๆ
ไม่ทำให้ workflow แดง

### ย้อนกลับ

Render → Settings → เปลี่ยนกลับเป็น build จาก repo · `Dockerfile` ยังอยู่ครบ
ไม่ได้ลบอะไรทิ้ง

### ย้อนไปรุ่นก่อนหน้า

ทุก build ติดแท็ก `sha-<commit>` ไว้ด้วย เปลี่ยน image ใน Render เป็นแท็กนั้นได้เลย
ไม่ต้อง revert โค้ด

---

## เช็คว่า production เป็นโค้ดชุดไหน

```
curl -s https://internal-approve.onrender.com/api/version
```

```json
{
  "commit": "23ec373...",        ← คอมมิตที่ build มา
  "builtAt": "2026-08-30T15:26:38Z",
  "timezone": "Asia/Bangkok",    ← ยืนยันว่า TZ ไม่ได้ตกกลับไปเป็น UTC
  "node": "v20.11.0"
}
```

เทียบ `commit` กับ `git rev-parse HEAD` ในเครื่อง ตรงกัน = ของขึ้นครบแล้ว

เปิดได้โดยไม่ต้องล็อกอิน เพราะประโยชน์ทั้งหมดคือเช็คได้ทันทีตอนระบบมีปัญหา —
ถ้าต้องล็อกอินก่อนก็เช็คตอนที่ต้องการที่สุดไม่ได้ · คืนเฉพาะข้อมูลที่ไม่เป็นความลับ
