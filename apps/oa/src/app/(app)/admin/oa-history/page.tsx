import { requireAdmin } from "@/lib/auth";
import { PageShell, PageTitle } from "@/components/layout-bits";
import { oaSyncHistory, oaChangeHistory, oaHistoryCounts } from "@/lib/oa-export/sync";
import { getLocale } from "@/lib/i18n/server";
import { OAUI, tri } from "@/lib/oa-export/labels";
import OaHistoryView from "./OaHistoryView";

export const dynamic = "force-dynamic";

export default async function OaHistoryPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [syncs, changes, counts] = await Promise.all([
    oaSyncHistory(50, 0).catch(() => []),
    oaChangeHistory(50, 0).catch(() => []),
    oaHistoryCounts().catch(() => ({ syncs: 0, changes: 0 })),
  ]);

  return (
    <PageShell>
      <PageTitle title={tri(OAUI.histPageTitle, locale)} subtitle={tri(OAUI.histPageSub, locale)} />
      <OaHistoryView locale={locale} initSyncs={syncs} initChanges={changes} counts={counts} />
    </PageShell>
  );
}
