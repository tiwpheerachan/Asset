import { requireAdmin } from "@/lib/auth";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { bitableReady } from "@/lib/lark/bitable";
import { baseAppToken, enabledTables, syncReady } from "@/lib/lark/base-sync";
import FeishuBasePanel from "./FeishuBasePanel";

export const dynamic = "force-dynamic";

export default async function FeishuBaseSettingsPage() {
  await requireAdmin();
  const tables = await enabledTables().catch(() => []);
  const ready = syncReady() && bitableReady();

  return (
    <PageShell>
      <PageTitle
        title="เชื่อม Feishu Base"
        subtitle="ดึงเอกสาร/คำขอจาก Feishu Base เข้าสู่ OA — อ่านอย่างเดียว ไม่แก้ ไม่ลบข้อมูลต้นทาง"
      />
      <SectionCard title="สถานะการเชื่อมต่อ">
        <FeishuBasePanel ready={ready} appToken={baseAppToken()} initialTables={tables} />
      </SectionCard>
    </PageShell>
  );
}
