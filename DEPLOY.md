# Deploy SHD Platform บน Render (OA + Asset แยก 2 เว็บ · Postgres ก้อนเดียว)

สองเว็บแยกกันแต่ใช้ฐานข้อมูลเดียว:
- **shd-oa** = ระบบขออนุมัติ (ใช้ schema `public`)
- **shd-asset** = ระบบทรัพย์สินถาวร (ใช้ schema `fa`)
- **shd-db** = PostgreSQL ก้อนเดียว ใช้ร่วมกัน

> ⚠️ **สิ่งที่ต้องรู้ก่อน:** โค้ดที่เชื่อม 2 ระบบนี้อยู่ใน monorepo `shd-platform`
> ต้องดัน **ทั้ง monorepo** ขึ้น GitHub (ไม่ใช่แค่โฟลเดอร์ asset เดิม)

---

## ขั้นที่ 1 — ดัน monorepo ขึ้น GitHub

รันในโฟลเดอร์ `shd-platform`:

```bash
cd shd-platform
git init
git add .
git commit -m "SHD platform monorepo (OA + Asset)"
git branch -M main
git remote add origin https://github.com/tiwpheerachan/Asset.git
git push -u origin main --force   # --force เพราะ repo เดิมมีโค้ด asset รุ่นเก่าอยู่
```

(ตรวจก่อน push: `git status` ต้องไม่เห็น `node_modules`, `.next`, `.env`, `.env.local` — มี `.gitignore` กันไว้แล้ว)

---

## ขั้นที่ 2 — สร้างทุกอย่างบน Render ด้วย Blueprint

1. Render Dashboard → **New → Blueprint**
2. เลือก repo `tiwpheerachan/Asset`
3. Render อ่าน `render.yaml` แล้วจะสร้างให้ครบ: DB `shd-db` + เว็บ `shd-oa` + เว็บ `shd-asset`
4. ตอนกด Apply จะถามค่าที่ต้องกรอกเอง (`sync: false`):
   - **shd-oa › SEED_PASSWORD** = รหัสผ่านผู้ใช้ตั้งต้น (เช่น ตั้งใหม่ของคุณเอง)
   - **shd-asset › OA_API_KEY** = เว้นว่างไว้ก่อน (ยังไม่มี กลับมาใส่ในขั้นที่ 4)
   - **shd-asset › DEEPSEEK_API_KEY** = ใส่ถ้าจะใช้คลังความรู้ AI (ไม่ใส่ก็ได้)

> ถ้าชื่อเว็บ `shd-oa`/`shd-asset` ซ้ำกับคนอื่นในโลก Render จะต่อท้ายให้ URL เปลี่ยน
> ถ้า URL จริงไม่ใช่ `https://shd-oa.onrender.com` ให้แก้ค่า `OA_BASE_URL` และ `APP_BASE_URL`
> ให้ตรง URL จริง (Dashboard → service → Environment)

---

## ขั้นที่ 3 — ตั้งข้อมูลตั้งต้นของ OA

ฐานข้อมูลใหม่ยังว่าง — ตาราง OA (`public`) ถูกสร้างอัตโนมัติตอนเว็บบูต แต่ต้อง seed ผู้ใช้/ฟอร์มครั้งแรก:

- Render → service **shd-oa** → แท็บ **Shell** → รัน:
  ```bash
  npm run seed -w apps/oa
  ```
- เสร็จแล้วเข้า `https://shd-oa.onrender.com/login` ด้วยผู้ใช้ที่ seed
  (ดูอีเมลผู้ใช้จาก output ของ seed · รหัสผ่าน = ค่า `SEED_PASSWORD` ที่ตั้งไว้)

> ตาราง `fa` ของฝั่ง Asset ไม่ต้องทำอะไร — แอปสร้าง schema + ตาราง + ข้อมูลตัวอย่างให้เองตอนเปิดครั้งแรก

---

## ขั้นที่ 4 — เชื่อม Asset เข้ากับ OA

1. เข้า OA (`/login` เป็นผู้จัดการ/แอดมิน) → เมนู **เชื่อมต่อระบบภายนอก** → สร้าง **API key** ให้มี scope **read + write**
2. คัดลอกคีย์ (ขึ้นต้น `ia_...`)
3. Render → service **shd-asset** → **Environment** → ใส่ `OA_API_KEY` = คีย์นั้น → Save (เว็บจะ redeploy)
4. เข้า `https://shd-asset.onrender.com` → เมนู **นำเข้าจาก OA** → กด **ซิงก์** ควรดึงคำขอที่อนุมัติแล้วจาก OA มาได้

---

## ข้อควรระวัง (free plan)

- **เว็บ free หลับ** เมื่อไม่มีคนเข้า ~15 นาที แล้วตื่นช้า ~50 วิ ครั้งแรก · **DB free หมดอายุ ~30 วัน** → ใช้งานจริงอัปเป็น **Starter** ($7/เว็บ, $7/DB)
- **ไฟล์แนบของ OA เก็บบนดิสก์ชั่วคราว** — หายทุกครั้งที่ deploy ใหม่ ถ้าต้องเก็บถาวรให้ตั้ง S3/Supabase Storage (ตัวแปร `S3_*` ใน `apps/oa/.env.example`) หรือเพิ่ม Persistent Disk ให้ service
- **Build แรมน้อย:** ทั้งสองแอปตั้ง flag ประหยัดแรมไว้แล้ว ถ้ายัง build ไม่ผ่านเพราะ OOM ให้ขยับ service เป็น Starter เฉพาะตอน build
- **TZ=Asia/Bangkok** ตั้งไว้ใน blueprint แล้ว (สำคัญ ไม่งั้นวันที่/เลขเอกสารเพี้ยน 7 ชม.)

---

## สรุป env หลัก

| ตัวแปร | shd-oa | shd-asset | ที่มา |
|---|---|---|---|
| DATABASE_URL | ✓ | ✓ | จาก shd-db อัตโนมัติ |
| SSO_ALLOW_LOCAL_LOGIN=true | ✓ | | ให้ล็อกอินด้วยรหัสผ่าน |
| SEED_PASSWORD | ✓ | | กรอกเอง |
| API_KEY | ✓ (Render สุ่ม) | | OA public API |
| APP_BASE_URL | ✓ | | URL ของ OA |
| OA_BASE_URL | | ✓ | URL ของ OA |
| OA_API_KEY | | ✓ (กรอกเอง) | สร้างใน OA |
| OA_TEMPLATE=PURCHASE | | ✓ | |
| DEEPSEEK_* | | ✓ (ไม่บังคับ) | คลังความรู้ AI |
| TZ=Asia/Bangkok | ✓ | ✓ | |
