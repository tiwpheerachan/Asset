import { createBlankTemplateAction } from "@/lib/actions";
import { getT } from "@/lib/i18n/server";
import { IconPlus } from "@/components/icons";

/**
 * ปุ่ม "สร้างแม่แบบ" มุมขวาบน — กดแล้วเข้าหน้าตัวสร้างฟอร์มเลย
 *
 * เดิมเปิดหน้าต่างซ้อนให้กรอกชื่อ รหัส ไอคอน หมวด คำอธิบาย ก่อนถึงจะเริ่มได้
 * ทั้งห้าช่องนั้นแก้ได้ในหน้าตัวสร้างฟอร์มอยู่แล้ว และตอนกดปุ่มนี้คนยังไม่รู้ด้วยซ้ำว่า
 * ฟอร์มจะออกมาหน้าตายังไง การบังคับตั้งชื่อก่อนลงมือจึงเป็นด่านที่ไม่ได้ช่วยอะไร
 */
export default async function CreateTemplateButton() {
  const t = await getT();
  return (
    <form action={createBlankTemplateAction}>
      <button className="btn-primary gap-1.5">
        <IconPlus className="h-4 w-4" />
        {t("admin.forms.create")}
      </button>
    </form>
  );
}
