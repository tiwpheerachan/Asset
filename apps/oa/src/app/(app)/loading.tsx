import { PageShell } from "@/components/layout-bits";

/**
 * โครงหน้าระหว่างรอข้อมูล
 *
 * ทุกหน้าในแอปเป็น force-dynamic คือเรนเดอร์ที่เซิร์ฟเวอร์ทุกครั้ง — เดิมกดเมนูแล้ว
 * หน้าเดิมค้างอยู่เฉยๆ จนกว่าเซิร์ฟเวอร์จะตอบ ไม่มีอะไรบอกว่าคลิกติดแล้ว
 * คนจึงกดซ้ำ ซึ่งยิ่งช้าลงไปอีก โดยเฉพาะตอนเครื่องบน Render เพิ่งตื่น
 *
 * ใช้แถบเทาให้ตรงกับโครงหน้าจริงคร่าวๆ ไม่ใช่วงกลมหมุน — คนอ่านออกว่ากำลังจะได้อะไร
 * และเมื่อของจริงมาถึง สายตาไม่ต้องกระโดดหาตำแหน่งใหม่
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="animate-pulse space-y-5" aria-hidden>
        <div className="card space-y-3">
          <div className="h-4 w-40 rounded bg-surface-3" />
          <div className="h-6 w-2/3 rounded bg-surface-3" />
          <div className="h-3 w-1/3 rounded bg-surface-2" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card space-y-3 lg:col-span-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-3 w-40 shrink-0 rounded bg-surface-2" />
                <div className="h-3 flex-1 rounded bg-surface-3" />
              </div>
            ))}
          </div>
          <div className="card space-y-3">
            <div className="h-4 w-24 rounded bg-surface-3" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-full rounded bg-surface-2" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">กำลังโหลด</span>
    </PageShell>
  );
}
