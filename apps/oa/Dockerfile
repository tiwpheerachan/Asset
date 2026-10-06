# ระบบขออนุมัติภายใน — Docker image สำหรับ deploy
#
# ฐานข้อมูลเป็น PostgreSQL ที่อยู่คนละเครื่อง (ตั้งผ่าน DATABASE_URL)
# ดิสก์ถาวรยังต้องมี เพราะไฟล์แนบและไฟล์สำรองเก็บบนดิสก์ ไม่ได้อยู่ในฐานข้อมูล
#
# ใช้ image เดียวจบ (ไม่ standalone) เพราะโค้ดอ่านไฟล์ตอนรันจาก src/ ด้วย fs
# (src/lib/schema.pg.sql, src/lib/default-forms.json) — ต้องมีไฟล์เหล่านั้นอยู่จริงที่ cwd
FROM node:20-bookworm-slim

# ไม่ต้องมี toolchain สำหรับ native module อีกแล้ว — ไดรเวอร์ pg เป็น JavaScript ล้วน
# tzdata: ใส่ให้ชัดเจน ไม่งั้น TZ=Asia/Bangkok จะเงียบๆ ตกกลับไปเป็น UTC ถ้า image ไม่มีฐานข้อมูลเขตเวลา
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ติดตั้ง dependency ก่อน (cache ชั้นนี้ไว้ตราบใดที่ lockfile ไม่เปลี่ยน)
COPY package.json package-lock.json ./
RUN npm ci

# ก๊อปซอร์สแล้ว build (NODE_ENV ยังไม่ใช่ production เพื่อให้ devDependencies ที่ build ต้องใช้ครบ)
COPY . .
RUN npm run build

# ระบุว่า image นี้สร้างจากคอมมิตไหนเมื่อไหร่ — /api/version เอาไปตอบ
# ไม่ส่งมาก็ยังรันได้ แค่ตอบว่า unknown
ARG BUILD_SHA=""
ARG BUILD_TIME=""
ENV BUILD_SHA=$BUILD_SHA
ENV BUILD_TIME=$BUILD_TIME

# ตั้งค่าตอนรัน — DATA_DIR ชี้ไปดิสก์ถาวร (mount ที่ /data) สำหรับไฟล์แนบและไฟล์สำรอง
ENV NODE_ENV=production
ENV DATA_DIR=/data

# เขตเวลา — ค่าเริ่มต้นของคอนเทนเนอร์คือ UTC ซึ่งทำให้ทุกอย่างที่อิงเวลาเพี้ยนไป 7 ชม.
# (ช่วงเวลาทวงงาน · วันที่เริ่มต้นของเอกสาร · ช่วงมอบหมายอนุมัติแทน · เดือนในเลขที่เอกสาร)
ENV TZ=Asia/Bangkok

# ที่เก็บไฟล์สำรอง — ต้องอยู่บนดิสก์ถาวร ไม่งั้นหายทุกครั้งที่ deploy ใหม่
# Render ให้ดิสก์ได้ก้อนเดียว จึงต้องอยู่ใต้ /data (แอปจะเตือนใน log ว่าอยู่ดิสก์เดียวกับต้นฉบับ
# ซึ่งถูกต้อง — ควรกดดาวน์โหลดเก็บนอกเครื่องเป็นระยะด้วย)
ENV BACKUP_DIR=/data/backups

# Render/โฮสต์จะกำหนดพอร์ตผ่าน env PORT · next start อ่าน PORT เอง
EXPOSE 3001
CMD ["npm", "run", "start"]
