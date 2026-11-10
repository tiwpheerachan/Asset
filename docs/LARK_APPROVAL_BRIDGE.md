# สะพานเชื่อม OA เว็บ ↔ Lark Approval (สร้าง + อนุมัติ 2 ทาง)

> เอกสารสเปกสำหรับทีม/เพื่อนที่ดูแลแอป Lark + OA Export API
> สถานะ: **โครงโค้ดพร้อมแล้ว (ปิดไว้)** · รอเปิด scope + ตั้งค่า mapping จึงจะเปิดใช้ได้
> อัปเดต: 2026-11-02

---

## 1. เป้าหมาย

ให้ 2 แอปทำงาน **ควบคู่/ขนานกัน**:

1. พนักงานสร้างคำขอใน **เว็บ OA (One OA)** → ระบบสร้าง **instance ใน Lark Approval (审批)** ให้อัตโนมัติ → ไหลเข้าสายอนุมัติเดิมของ Lark
2. **อนุมัติที่ไหนก็ได้** — อนุมัติใน Lark → สถานะเด้งกลับมาอัปเดตคำขอในเว็บ · อนุมัติในเว็บ → ดันเข้า Lark (เฟสถัดไป)
3. ยังคง **อ่านเอกสารเดิมจาก Lark (read-only)** ได้เหมือนเดิม — ส่วนนี้ไม่แตะ

**ข้อห้ามเด็ดขาด:** ห้ามแก้/ลบคำขอเดิมที่พนักงานยื่นจากฝั่ง Lark · ระบบนี้ "สร้างใหม่/อนุมัติเฉพาะใบที่เว็บ OA เป็นเจ้าของ" เท่านั้น

---

## 2. สถานะปัจจุบัน (ตรวจแล้ว 2026-11-02)

| สิ่งที่ตรวจ | ผล |
|---|---|
| เว็บ OA มีระบบอนุมัติของตัวเองครบ | ✅ ใช้งานได้ (Postgres + การ์ดแจ้งเตือน Lark) |
| สร้างในเว็บ → ขึ้น Lark Approval | ❌ ยังไม่ต่อสาย (มีแต่โค้ด) |
| credential แอป Lark (`FEISHU_BASE_APP_ID/SECRET`) | ✅ ตั้งแล้ว (`cli_aa6c5e404078dcf1` = OA Base Reader, feishu.cn) |
| ขอ tenant_access_token | ✅ ได้ |
| **scope `approval`** | ❌ **ยังไม่เปิด** (error `99991672`) |
| ฟอร์มที่ซิงก์มา 11 ฟอร์ม | ทั้งหมดเป็น `upload:` (โหลดจาก Excel) — ไม่ใช่ Lark definition โดยตรง |
| เอกสารที่มี Lark instance จริง | 8,099 ใบ (มี `instance_code`, `sender`, `timeline`, `avatar`) |

---

## 3. 🔴 สิ่งที่ต้องให้เพื่อน/แอดมิน Lark ช่วย (บล็อกอยู่)

### 3.1 เปิด scope `approval` + เผยแพร่เวอร์ชัน
ลิงก์ขอสิทธิ์ (Lark ให้มาตรงๆ):
```
https://open.feishu.cn/app/cli_aa6c5e404078dcf1/auth?q=approval:approval:readonly,approval:approval,approval:instance&op_from=openapi&token_type=tenant
```
ต้องเปิดให้ครบสำหรับ 2 ทาง:

| Scope | ใช้ทำอะไร | จำเป็นเฟส |
|---|---|---|
| `approval:approval` | อ่าน definition ของฟอร์ม (ดู widget → map ช่อง) | สร้าง |
| `approval:instance` | **สร้าง** instance + อ่านสถานะ | สร้าง |
| `approval:task` | **อนุมัติ/ปฏิเสธ** task แทนผู้ใช้ | อนุมัติ 2 ทาง |

> ⚠️ หลังกดเปิด scope ต้องไป **Developer Console → Version management → สร้าง + เผยแพร่เวอร์ชันใหม่** ไม่งั้น scope ยังไม่มีผล

### 3.2 ข้อมูลที่ต้องขอจากเพื่อน
1. **approval_code ของแต่ละฟอร์ม** ที่จะให้เว็บสร้างได้ (หรือยืนยันว่าอ่านเองได้จาก `GET /approval/v4/instances/{instance_code}` → `data.approval_code` เมื่อ scope เปิดแล้ว)
2. **definition ทดสอบ (sandbox)** 1 อัน + ให้แอป `cli_aa6c5e...` มีสิทธิ์สร้าง instance บน definition นั้น — ไว้ทดสอบโดยไม่กระทบฟอร์มจริง
3. **ชนิด id ผู้ยื่น** ที่ Lark รับในตอนสร้าง instance: `open_id` / `user_id` / `employee_id` — ตอนนี้ตาราง `users.lark_user_id` เราเก็บเป็น **open_id** · ถ้า Lark ต้องการชนิดอื่น ต้องรู้วิธีแปลง
4. ว่าแอปต้องเป็น "ผู้จัดการ approval" ของ definition นั้นไหม ถึงจะสร้าง instance แทนคนอื่นได้ (บางที่ต้องตั้งใน Approval admin)

---

## 4. โครงที่ทำไว้แล้วในโค้ด (ฝั่งเรา — ปิด flag อยู่)

ปลอดภัยโดยดีไซน์: ทุกอย่าง **no-op** จนกว่าจะเปิด `LARK_APPROVAL_BRIDGE=on` + มี mapping `active=true`

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/lark/approval.ts` | ตัวเรียก Lark Approval API: `createApprovalInstance`, `approveTask`, `rejectTask`, `getApprovalInstance`, `getApprovalDefinition`, `linkApproval`, `handleApprovalEvent` (มีอยู่แล้ว) |
| `src/lib/lark/approval-bridge.ts` | **ใหม่** — ชั้นกลาง guarded: `approvalBridgeEnabled()`, `mappingFor()`, `pushNewRequestToLark()`, `applyLarkStatusToRequest()` |
| ตาราง `oa_approval_bridge` | **ใหม่** — ผูก template → approval_code + field_map + id_type + active |
| ตาราง `feishu_approvals` | ผูก instance_code ↔ oa_request_id (มีอยู่แล้ว) |

**จุดต่อ (wiring) ที่เสียบไว้แล้ว (ยัง no-op):**
- `src/lib/actions.ts` → `submitRequestAction` (หลัง submit สำเร็จ) เรียก `pushNewRequestToLark(...)`
- `src/app/api/lark/callback/route.ts` → หลัง `handleApprovalEvent` เรียก `applyLarkStatusToRequest(...)` (Lark → เว็บ)

**ยังไม่ได้ต่อ (เฟสถัดไป หลังทดสอบ scope):**
- เว็บ → Lark เวลาอนุมัติในเว็บ (`decideAction`) → `approveTask`/`rejectTask` (ต้องมี `task_id` + open_id ผู้อนุมัติ จากการอ่าน instance)
- ครอบคลุมทุกเส้นทางที่ submit (ตอนนี้ต่อที่ `submitRequestAction` ก่อน · path `createRequest(submit:true)` และ `submitFinalAction` จะต่อเพิ่มตอนทดสอบได้)

---

## 5. รูปแบบ field mapping (ตาราง `oa_approval_bridge`)

```jsonc
{
  "template_id": 12,                      // แม่แบบฟอร์มในเว็บ OA
  "approval_code": "DD7DEE11-...",        // Lark approval definition
  "id_type": "open_id",                   // ชนิด id ผู้ยื่นที่ Lark รับ
  "field_map": {                          // ช่องในเว็บ → widget ของ Lark
    "amount":   { "widget_id": "widget17..", "type": "number" },
    "topic":    { "widget_id": "widget12..", "type": "input"  },
    "use":      { "widget_id": "widget20..", "type": "textarea" }
  },
  "active": false                         // เปิดเมื่อพร้อมเท่านั้น
}
```
`widget_id` + `type` ดูได้จาก `getApprovalDefinition(approval_code)` → ฟิลด์ `form` (เป็น JSON ของ widget ทั้งหมด) — จะทำ UI ตั้งค่า/สคริปต์ช่วย map ให้ภายหลัง

---

## 6. แผนทดสอบ (ไม่กระทบระบบจริง)

1. เปิด scope + เผยแพร่เวอร์ชัน → รัน `scripts` เช็ก `GET /approval/v4/instances/{code}` ต้องได้ `code:0`
2. อ่าน definition ทดสอบ → ได้ widget ids → ใส่ `field_map` ของ template ทดสอบ (`active=true` เฉพาะตัวนี้)
3. ตั้ง `LARK_APPROVAL_BRIDGE=on` **บน dev เท่านั้น**
4. สร้าง+ส่งคำขอจากแม่แบบทดสอบ โดยตั้ง **ตัวเองเป็นผู้อนุมัติคนเดียว** → ดูว่า instance โผล่ใน Lark Approval ไหม
5. อนุมัติใน Lark → ดูสถานะเด้งกลับมาที่คำขอในเว็บ (ผ่าน callback)
6. ครบวงจรแล้วค่อยเปิดฟอร์มจริงทีละฟอร์ม (`active=true` ทีละตัว) บน production

**ย้ำ:** อย่าตั้ง `active=true` ให้ฟอร์มจริง และอย่าเปิด flag บน production จนกว่าจะผ่านการทดสอบ sandbox ครบ

---

## 7. ความปลอดภัย

- API key / app secret อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น (`FEISHU_BASE_*`, `CENTRAL_API_KEY`) — ห้าม bundle ไปเบราว์เซอร์
- โมดูล `approval-bridge.ts` และ `people.ts` มี `import "server-only"` กันพลาด
- ทุกฟังก์ชันสะพานห่อ try/catch — ล้มเหลวไม่ทำให้คำขอในเว็บพัง
- สร้าง instance เฉพาะใบที่เว็บเป็นเจ้าของ · ไม่แตะ instance เดิมของ Lark

---

## 8. สรุปสิ่งที่รอจากเพื่อน (checklist)

- [ ] เปิด scope `approval:approval`, `approval:instance`, `approval:task` + เผยแพร่เวอร์ชัน
- [ ] ให้ definition ทดสอบ (sandbox) + สิทธิ์ให้แอปสร้าง instance
- [ ] ยืนยันชนิด id ผู้ยื่น (open_id / user_id / employee_id)
- [ ] (ถ้ามี) list approval_code ของฟอร์มจริงที่จะเปิดใช้
