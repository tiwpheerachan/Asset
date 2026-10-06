import { requireAdmin } from "@/lib/auth";
import { PageTitle, PageShell } from "@/components/layout-bits";
import { getT } from "@/lib/i18n/server";
import { flowRolesMissingHolders, listCategories, listTemplates, templateReadiness } from "@/lib/queries";
import type { JobRole } from "@/lib/types";
import { IconForm } from "@/components/icons";
import TemplateManager from "./TemplateManager";
import CategoryManager from "./CategoryManager";
import CreateTemplateButton from "./CreateTemplateButton";

export const dynamic = "force-dynamic";

export default async function AdminFormsPage() {
  await requireAdmin();
  const t = await getT();
  const missing = (await flowRolesMissingHolders()) as JobRole[];
  const categories = await listCategories();
  const templates = await listTemplates();
  // จำนวนฟอร์มในแต่ละหมวด — ให้เห็นก่อนลบว่าจะมีฟอร์มหลุดออกมาเป็น "ไม่ระบุหมวด" กี่ใบ
  const counts: Record<number, number> = {};
  for (const tpl of templates) {
    if (tpl.category_id) counts[tpl.category_id] = (counts[tpl.category_id] ?? 0) + 1;
  }

  return (
    <PageShell width="full">
      <div className="space-y-5">
        <PageTitle
          icon={<IconForm className="h-5 w-5" />}
          title={t("nav.forms")}
          subtitle={t("admin.forms.subtitle")}
          actions={<CreateTemplateButton />}
        />

        {missing.length > 0 && (
          <div className="rounded-xl tone-rose px-4 py-3 text-sm ring-1">
            {t("admin.forms.missingRoles", {
              roles: missing.map((r) => t(`jobRole.${r}`)).join(", "),
            })}
          </div>
        )}

        <CategoryManager categories={categories} counts={counts} />

        <TemplateManager
          templates={templates}
          categories={categories}
          problems={Object.fromEntries(await templateReadiness())}
        />
      </div>
    </PageShell>
  );
}
