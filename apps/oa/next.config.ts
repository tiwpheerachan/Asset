import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 เป็น native module — ห้าม bundle เข้า webpack
  serverExternalPackages: ["better-sqlite3"],

  /*
   * ที่เก็บผลบิลด์ — เปลี่ยนได้ด้วย NEXT_DIST_DIR
   *
   * ที่มา: สั่ง next build ขณะที่ next dev รันอยู่ในโฟลเดอร์เดียวกัน ผลบิลด์จะทับ .next
   * ที่ dev server ใช้อยู่ หน้าเว็บที่เปิดค้างไว้จะพังทันที — ทั้งแบบหาไฟล์ chunk ไม่เจอ
   * และแบบ "Server Action ... was not found" เพราะรหัสของ action ถูกสร้างใหม่หมด
   *
   * ตรวจว่าบิลด์ผ่านไหมระหว่างที่มีคนเปิดหน้าเว็บอยู่ จึงสั่งแบบนี้:
   *   NEXT_DIST_DIR=.next-build npm run build
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // วัดแล้ว next build ใช้แรมสูงสุด ~676MB แต่เครื่องที่ deploy มีให้ 512MB
  // จึงถูกฆ่าระหว่าง build — และยิ่งโค้ดโตขึ้นยิ่งเกินมากขึ้น
  //
  // สองตัวนี้แลกความเร็ว build กับแรมที่ใช้ ซึ่งคุ้มกว่าการ build ไม่ผ่านเลย
  //   webpackMemoryOptimizations  ปล่อยข้อมูลระหว่างทางเร็วขึ้น แทนที่จะถือไว้ทั้งก้อน
  //   workerThreads: false + cpus:1  ไม่แตก worker ขนาน — worker แต่ละตัวกินแรมของตัวเอง
  experimental: {
    // ไฟล์แนบวิ่งผ่าน server action ซึ่งค่าเริ่มต้นจำกัด body ไว้ 1MB —
    // ต่ำกว่าเพดานไฟล์แนบที่ระบบตั้งไว้ (10MB) แนบไฟล์ใหญ่กว่านั้นจึงพังก่อนถึงโค้ดเรา
    serverActions: { bodySizeLimit: "12mb" },
    webpackMemoryOptimizations: true,
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
