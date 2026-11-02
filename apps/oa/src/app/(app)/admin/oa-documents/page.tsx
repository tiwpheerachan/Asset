import { requireAdmin } from "@/lib/auth";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { oaForms, oaTotal, oaExportReady, oaDepts } from "@/lib/oa-export/sync";
import { getLocale } from "@/lib/i18n/server";
import { OAUI, tri } from "@/lib/oa-export/labels";
import OaDocsView from "./OaDocsView";

export const dynamic = "force-dynamic";

type SP = { status?: string; dept?: string; form?: string; node?: string; files?: string; from?: string; to?: string };

export default async function OaDocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const locale = await getLocale();
  const [forms, total, depts] = await Promise.all([oaForms().catch(() => []), oaTotal().catch(() => 0), oaDepts().catch(() => [])]);
  const ready = oaExportReady();

  return (
    <PageShell>
      <PageTitle
        title={tri(OAUI.pageTitle, locale)}
        subtitle={tri(OAUI.pageSubtitle, locale)}
      />
      <SectionCard title={`${tri(OAUI.formsSynced, locale)} ${total.toLocaleString()} ${tri(OAUI.docs, locale)}`}>
        <OaDocsView ready={ready} total={total} forms={forms} depts={depts} initial={sp} />
      </SectionCard>
    </PageShell>
  );
}
