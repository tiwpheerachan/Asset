import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  getActiveFieldsByTemplate,
  getFields,
  getFlowNodes,
  getTemplate,
  listActiveUsers,
  listCategories,
  listTemplates,
} from "@/lib/queries";
import FormBuilder from "./FormBuilder";

export const dynamic = "force-dynamic";

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const template = await getTemplate(Number(id));
  if (!template) notFound();

  /*
   * ช่องของฟอร์มอื่นที่นำเข้าได้ — ดึงทีเดียวทุกใบ ไม่ใช่วนทีละใบ
   * เดิมเป็นคำสั่ง 2 ครั้งต่อฟอร์มหนึ่งใบ พอองค์กรมีฟอร์มหลักร้อยก็กลายเป็นหลายร้อย
   * คำสั่งต่อการเปิดหน้าตัวสร้างฟอร์มหนึ่งครั้ง
   */
  const others = (await listTemplates()).filter((tpl) => tpl.id !== template.id);
  const fieldsOf = await getActiveFieldsByTemplate(others.map((tpl) => tpl.id));
  const importable = others.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    fields: (fieldsOf.get(tpl.id) ?? []).map((f) => ({ id: f.id, label: f.label, type: f.type })),
  }));

  return (
    <FormBuilder
      template={template}
      categories={(await listCategories())}
      fields={(await getFields(template.id))}
      nodes={(await getFlowNodes(template.id))}
      users={(await listActiveUsers())}
      templates={(await listTemplates())}
      importable={importable}
    />
  );
}
