import { guard, isDenied, apiOk } from "@/lib/api-guard";
import { listActiveUsers } from "@/lib/queries";

/**
 * รายชื่อผู้ใช้ที่ยังใช้งานอยู่
 *
 * ระบบภายนอกต้องระบุว่าคำขอที่ยิงเข้ามาเป็นของใคร (สายอนุมัติคิดจากคนนั้น) และ
 * ช่องชนิด "เลือกบุคคล" ก็ต้องส่งเป็น id ของคนในระบบนี้ จึงต้องมีทางให้เทียบชื่อได้
 *
 * ส่งออกเท่าที่จำเป็นต่อการเทียบตัวบุคคล ไม่รวมเบอร์โทร ลายเซ็น หรือข้อมูลบัญชี
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  const data = (await listActiveUsers()).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department || null,
    position: u.position || null,
  }));

  return apiOk({ count: data.length, data });
}
