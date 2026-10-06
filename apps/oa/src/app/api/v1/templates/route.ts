import { guard, isDenied, apiOk } from "@/lib/api-guard";
import { listTemplates, getActiveFieldsByTemplate } from "@/lib/queries";

/**
 * รายการแม่แบบฟอร์มพร้อมนิยามของทุกช่อง
 *
 * ระบบภายนอกที่จะยิงคำขอเข้ามาต้องรู้ก่อนว่าฟอร์มนั้นมีช่องอะไรบ้าง รหัสอะไร
 * ชนิดไหน บังคับกรอกไหม และตัวเลือกมีอะไร — ไม่งั้นต้องมาถามคนทำระบบทุกครั้ง
 * ที่ผู้ดูแลแก้ฟอร์ม แล้ว integration ก็จะพังเงียบ ๆ โดยไม่มีใครรู้
 *
 *   curl -H "X-API-Key: $KEY" https://host/api/v1/templates
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (isDenied(g)) return g.res;

  // ดึงช่องของทุกแม่แบบในคำสั่งเดียว — ปลายทางที่ขอรายการฟอร์มทั้งหมดมักขอถี่
  const active = (await listTemplates()).filter((t) => t.active);
  const fieldsOf = await getActiveFieldsByTemplate(active.map((t) => t.id));

  const data = active.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    doc_prefix: t.doc_prefix,
    fields: (fieldsOf.get(t.id) ?? [])
      .filter((f) => f.type !== "HEADING")
      .map((f) => ({
        key: f.field_key,
        label: f.label,
        type: f.type,
        role: f.field_role || null,
        required: f.required === 1,
        help: f.help || undefined,
        options: f.options.length ? f.options : undefined,
        // ช่องที่โผล่เฉพาะเมื่อช่องอื่นมีค่าตามที่กำหนด — ปลายทางต้องรู้ด้วย
        show_if: f.show_if_key ? { key: f.show_if_key, value: f.show_if_value } : undefined,
        sum_of: f.sum_of || undefined,
        columns: f.columns.length
          ? f.columns.map((c) => ({
              key: c.col_key,
              label: c.label,
              type: c.type,
              required: c.required === 1,
              unit: c.unit || undefined,
              options: c.options.length ? c.options : undefined,
            }))
          : undefined,
      })),
  }));

  return apiOk({ count: data.length, data });
}
