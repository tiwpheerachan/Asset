'use client';

import { BookOpen, Inbox, FilePlus2, TrendingDown, QrCode, Sparkles, LayoutGrid } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';

const SECTIONS = [
  { icon: LayoutGrid, title: 'ภาพรวม (หน้ากระบวนการ)', body: 'ดูจำนวนทรัพย์สิน ราคาทุน ค่าเสื่อมสะสม และ NBV พร้อมเส้นทางกระบวนการ การแจ้งเตือน และงานค้าง ทั้งหมดอัปเดตจากข้อมูลจริง' },
  { icon: Inbox, title: 'นำเข้าทรัพย์สิน', body: 'กด “นำเข้าจากบัญชี” เพื่อดึงบิลที่ลงบัญชีแล้วจากระบบบัญชี (ONEBOOK) หรือ “ดึงข้อมูลจาก OA” สำหรับคำขอซื้อที่อนุมัติ แล้วเข้าคิวตรวจสอบ' },
  { icon: FilePlus2, title: 'ขึ้นทะเบียนทรัพย์สิน', body: 'ในคิวนำเข้า เลือกหมวดหมู่ (อายุค่าเสื่อม/บัญชีจะเติมให้อัตโนมัติ) ตรวจรายการซ้ำ แล้วกดสร้างทรัพย์สิน แยกเป็นรายชิ้นได้ถ้ามีหลายหน่วย' },
  { icon: TrendingDown, title: 'คิดค่าเสื่อมราคา', body: 'ที่เมนูค่าเสื่อม สร้างรอบรายงวด คำนวณ ตรวจ และปิดงวด จากนั้นกด “ส่งเข้าบัญชี ONEBOOK” เพื่อลงสมุดรายวันค่าเสื่อมกลับไปที่ระบบบัญชี' },
  { icon: QrCode, title: 'ป้าย QR และสแกน', body: 'พิมพ์ป้ายทรัพย์สิน (มี QR) จากหน้ารายละเอียด สแกนแล้วเปิดหน้าข้อมูลทรัพย์สินได้ทันทีโดยไม่ต้องล็อกอิน (ไม่แสดงตัวเลขบัญชี)' },
  { icon: Sparkles, title: 'คลังความรู้ (AI)', body: 'สร้าง/อ่านบทความความรู้บัญชี-ภาษีทรัพย์สิน พร้อมแหล่งอ้างอิง เพื่อประกอบการตัดสินใจเรื่องอายุค่าเสื่อมและการตั้งทรัพย์สิน' },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="คู่มือการใช้งาน ONE Asset" sub="แนะนำการใช้งานทีละขั้น ตั้งแต่นำเข้าจนคิดค่าเสื่อม" />
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <s.icon size={19} strokeWidth={1.9} />
              </span>
              <div>
                <h3 className="text-[14px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-canvas px-4 py-3 text-[12.5px] text-ink-3">
        <BookOpen size={15} /> ต้องการความช่วยเหลือเพิ่มเติม ติดต่อทีมบัญชี/ไอทีของบริษัท
      </div>
    </div>
  );
}
