"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * ตัวรวม "บันทึกทันที" ของทั้งหน้าตัวสร้างฟอร์ม
 *
 * หน้านี้บันทึกให้เองหลังหยุดพิมพ์ 900ms ซึ่งดีเวลาทำงานยาว ๆ แต่มีสองปัญหา:
 * ปิดแท็บภายในช่วงหน่วงนั้นงานหายจริง และคนส่วนใหญ่ไม่เชื่อระบบที่ไม่มีปุ่มบันทึก
 * ปุ่มบันทึกจึงไม่ใช่ของประดับ — มันคือ "ส่งของที่ค้างอยู่เดี๋ยวนี้"
 *
 * แต่ละส่วนลงทะเบียนวิธีบันทึกของตัวเองไว้ แล้วปุ่มเดียวสั่งได้ทั้งหน้า
 * ส่วนที่ไม่มีอะไรค้างให้คืน false จะได้ไม่ยิงคำสั่งเขียนซ้ำโดยเปล่าประโยชน์
 */
type Flush = () => boolean;

const Ctx = createContext<{
  add: (f: Flush) => () => void;
  run: () => number;
} | null>(null);

export function SaveBusProvider({ children }: { children: React.ReactNode }) {
  const bus = useRef<Set<Flush>>(null as unknown as Set<Flush>);
  bus.current ??= new Set<Flush>();

  const api = useRef({
    add: (f: Flush) => {
      bus.current.add(f);
      return () => void bus.current.delete(f);
    },
    run: () => {
      let saved = 0;
      for (const f of bus.current) if (f()) saved += 1;
      return saved;
    },
  }).current;

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** ลงทะเบียนวิธีบันทึกของส่วนนี้ — คืน true เมื่อมีของค้างแล้วส่งไปจริง */
export function useSaveNow(flush: Flush) {
  const ctx = useContext(Ctx);
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => ctx?.add(() => latest.current()), [ctx]);
}

/** สั่งบันทึกทุกส่วนที่ลงทะเบียนไว้ — คืนจำนวนส่วนที่มีของค้างจริง */
export function useSaveAll() {
  const ctx = useContext(Ctx);
  return () => ctx?.run() ?? 0;
}
