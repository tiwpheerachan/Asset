# ตั้งค่าแจ้งเตือน Lark / Feishu (Production)

โค้ดฝั่งแอป **พร้อมแล้ว** ไม่ต้องแก้อะไร — ตั้งค่าครบเมื่อไหร่ระบบแจ้งเตือนเอง

## ก่อนอื่น: ตอนนี้ระบบแจ้งเตือนอยู่แล้ว

ระบบมีช่องทางแจ้งเตือน **3 ทาง** และใช้ทุกทางที่ตั้งค่าไว้พร้อมกัน
(ไม่ใช่เลือกทางเดียว — คนอ่านแชทกับคนอ่านเมลไม่ใช่กลุ่มเดียวกัน)

| ทาง | ต้องตั้งอะไร | ได้อะไร |
|---|---|---|
| **ระบบกลาง (Central Login)** | `CENTRAL_DIRECTORY_URL` + `DIRECTORY_API_KEY` | DM เข้าแชท พร้อมลิงก์เข้าเว็บ |
| **Lark โดยตรง** | `LARK_APP_ID` + `LARK_APP_SECRET` | การ์ดที่ **กดอนุมัติในแชทได้เลย** |
| **อีเมล** | `SMTP_*` | เมลพร้อมปุ่มเข้าเว็บ |

ทางระบบกลางใช้แอป Lark ของ Central Login (scope `feishu:notify:send` +
`feishu:notify:direct` อยู่ฝั่งนั้น) แอปนี้ถือแค่ API key — **ตั้งไว้แล้วและใช้งานอยู่**

เอกสารนี้พูดถึงทางที่ 2 คือสร้างแอป Lark ของ internal-approve เอง
ซึ่งได้เพิ่มมาอย่างเดียวคือ **ปุ่มอนุมัติในแชท** ถ้าไม่ซีเรียสเรื่องนี้ก็ไม่ต้องทำ

---

## ลำดับขั้น

### 1) มี URL production ก่อน

ปัจจุบัน: `https://internal-approve.onrender.com`
ต้องเป็นโฮสต์ที่มีดิสก์ถาวรเพราะไฟล์แนบเก็บบนดิสก์ (Render แบบมี Disk / Railway / Fly / VPS —
**ไม่ใช่** Netlify/Vercel)

### 2) สร้างแอปในคอนโซล Lark

`open.larksuite.com` (สากล) หรือ `open.feishu.cn` (จีน) → Create custom app

**a. เปิด Bot** — Add features → **Bot**
ข้อนี้ลืมบ่อยที่สุด ไม่เปิดแล้วส่งข้อความไม่ได้เลยแม้ scope ครบ

**b. เปิด scope** — ตามที่โค้ดเรียกจริง (`src/lib/lark/client.ts`)

| Scope | ใช้ที่ | จำเป็น |
|---|---|---|
| `im:message` (หรือ `im:message:send_as_bot`) | `POST /open-apis/im/v1/messages` ส่งการ์ด | ✅ |
| `contact:user.id:readonly` | `POST /open-apis/contact/v3/users/batch_get_id` แปลงอีเมล → open_id | ✅ |
| `contact:user.email:readonly` | ค้นด้วยอีเมลใน endpoint เดียวกัน | ✅ |
| `application:application:readonly` | ปุ่ม "ทดสอบการเชื่อมต่อ" โชว์ชื่อแอป | ไม่ต้องก็ได้ |

แก้การ์ดที่ส่งไปแล้ว (`PATCH /open-apis/im/v1/messages/{id}`) ใช้สิทธิ์เดียวกับตอนส่ง
เพราะแก้ได้เฉพาะข้อความที่บอทตัวเองส่ง — ไม่ต้องขอ scope เพิ่ม

**c. Request URL** — ตั้ง **ทั้งสองที่** ให้ชี้มาที่เดียวกัน

```
https://internal-approve.onrender.com/api/lark/callback
```

- Event Subscription → Request URL
- Message Card → Request URL ← ปุ่มบนการ์ดวิ่งมาทางนี้ ไม่ใช่ทาง Event

คัดลอก **Verification Token** และ **Encrypt Key** เก็บไว้

> ต้องตั้ง `LARK_VERIFICATION_TOKEN` หรือ `LARK_ENCRYPT_KEY` อย่างน้อยหนึ่งตัว
> ไม่งั้น `readVerified()` ปฏิเสธทุก request ที่เข้ามา — ปุ่มในการ์ดจะกดไม่ได้

**d. Availability** — ให้แอปเข้าถึงผู้ใช้ที่จะรับแจ้งเตือนได้ครบ
จำกัดไว้บางกลุ่ม คนนอกกลุ่มจะหา open_id ไม่เจอ

**e. Publish แล้วรอ admin อนุมัติ**
scope ยังไม่มีผลจนกว่าเวอร์ชันจะได้รับอนุมัติ — อีกข้อที่ลืมกันบ่อย

### 3) ใส่ Environment Variables

| ตัวแปร | เอาจากไหน |
|---|---|
| `LARK_APP_ID` | Credentials & Basic Info (เช่น `cli_aaeaf20a92b85d1f`) |
| `LARK_APP_SECRET` | หน้าเดียวกัน |
| `LARK_DOMAIN` | `https://open.larksuite.com` หรือ `https://open.feishu.cn` |
| `LARK_VERIFICATION_TOKEN` | Event Subscription |
| `LARK_ENCRYPT_KEY` | Event Subscription (ไม่เปิดเข้ารหัสก็เว้นว่าง) |
| `APP_BASE_URL` | `https://internal-approve.onrender.com` |
| `LARK_NOTIFY_LOCALE` | `th` |

ไม่ตั้ง `LARK_APP_ID`/`SECRET` ก็ยังแจ้งเตือนได้ตามปกติ — ตกไปใช้ทางระบบกลาง
และอีเมล เพียงแต่ไม่มีปุ่มกดอนุมัติในแชท

### 4) จับคู่อีเมล → open_id

**การเชื่อมต่อ** (เมนูซ้าย หมวดระบบและการเชื่อมต่อ) → **จับคู่บัญชี Lark ทั้งหมด**

ผู้อนุมัติต้องมีอีเมลในระบบตรงกับบัญชี Lark ถึงจะได้รับการ์ด
คนที่จับคู่ไม่ได้จะขึ้นสถานะ `SKIPPED` พร้อมเหตุผลในคิวแจ้งเตือน

---

## ทดสอบ

1. **การเชื่อมต่อ → ทดสอบการเชื่อมต่อ** — ควรได้การ์ดทดสอบใน Lark ทันที
2. ยื่นฟอร์มจริงที่มีผู้อนุมัติเป็นคนที่มี Lark → ผู้อนุมัติได้การ์ด
3. กดอนุมัติในแชท → สถานะบนเว็บเปลี่ยนตาม และปุ่มบนการ์ดหายไปทุกเครื่อง

**ไม่ได้การ์ด** ให้ไล่ตามนี้ — คิวแจ้งเตือนท้ายหน้าการเชื่อมต่อบอกเหตุผลไว้ทุกฉบับ

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| `SKIPPED` + ไม่พบบัญชี Lark | ยังไม่ได้จับคู่ หรืออีเมลไม่ตรงกับ Lark |
| `FAILED` + 99991672 | scope ไม่ครบ หรือยังไม่ publish |
| ได้การ์ดแต่กดปุ่มแล้วเงียบ | ยังไม่ได้ตั้ง Message Card → Request URL |
| กดปุ่มแล้วขึ้น error สิทธิ์ | ยังไม่ได้ตั้ง `LARK_VERIFICATION_TOKEN` / `LARK_ENCRYPT_KEY` |
