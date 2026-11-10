import { requireAdmin } from "@/lib/auth";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { oaForms } from "@/lib/oa-export/sync";
import { getConfig } from "@/lib/accounting/store";
import AccountingView from "./AccountingView";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  await requireAdmin();
  const [forms, cfg] = await Promise.all([oaForms().catch(() => []), getConfig().catch(() => ({ accounting: [] as string[], asset: [] as string[] }))]);
  const withKind = forms.map((f) => ({
    form_code: f.form_code, name: f.name, local_count: f.local_count,
    kind: (cfg.accounting.includes(f.form_code) ? "accounting" : cfg.asset.includes(f.form_code) ? "asset" : "none") as "accounting" | "asset" | "none",
  }));

  return (
    <PageShell>
      <PageTitle
        title="ลงบัญชี — ตรวจเอกสาร OA"
        subtitle="เทียบยอดที่พนักงานกรอก กับยอดที่ AI อ่านจากไฟล์แนบ → ตรวจแล้วโพสต์เข้า ONEBOOK · ถอน/ย้อนได้"
      />
      <SectionCard title="เอกสารเพื่อลงบัญชี">
        <AccountingView forms={withKind} />
      </SectionCard>
    </PageShell>
  );
}
