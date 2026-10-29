import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import CompanyForm from "./CompanyForm";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  await requireAdmin();
  const row = await db
    .prepare("SELECT value FROM app_meta WHERE key = 'company_profile'")
    .get<{ value: string }>();
  let initial: Record<string, string> = {};
  try { initial = row?.value ? JSON.parse(row.value) : {}; } catch { initial = {}; }

  return (
    <PageShell>
      <PageTitle title="ข้อมูลกิจการ" subtitle="ชื่อบริษัท ที่อยู่ โลโก้ และตราประทับ — ใช้บนหัว/ท้ายเอกสารใบคำขอและหนังสืออนุมัติ" />
      <SectionCard title="แก้ไขข้อมูลกิจการ">
        <CompanyForm initial={initial} />
      </SectionCard>
    </PageShell>
  );
}
