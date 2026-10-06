import 'server-only';
import { Pool } from 'pg';

/**
 * Postgres pool สำหรับฝั่ง Asset — ใช้ DB เดียวกับ OA (approve_dev) แต่คนละ schema (fa)
 * เก็บ pool ไว้บน globalThis กัน dev hot-reload สร้าง pool ซ้ำจนต่อเต็ม
 */
const g = globalThis as unknown as { __faPool?: Pool };

export function pool(): Pool {
  if (!g.__faPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('ยังไม่ได้ตั้ง DATABASE_URL — Asset ต่อ Postgres ไม่ได้ (ตัวอย่าง: postgresql://localhost:5432/approve_dev)');
    }
    // Render/Supabase บังคับ TLS ด้วยใบรับรองของ CA ตัวเองที่ Node ไม่รู้จัก —
    // ปิดการตรวจใบรับรองเฉพาะเมื่อไม่ใช่ localhost (เหมือนฝั่ง OA)
    const ssl =
      /sslmode=disable/.test(connectionString) || /localhost|127\.0\.0\.1/.test(connectionString)
        ? undefined
        : { rejectUnauthorized: false };
    g.__faPool = new Pool({ connectionString, ssl, max: Number(process.env.PGPOOL_MAX || 8) });
  }
  return g.__faPool;
}

export async function q<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}
