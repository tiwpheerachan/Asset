import { getT } from "@/lib/i18n/server";
import { PageShell, PageTitle } from "@/components/layout-bits";
import {
  IconHome,
  IconSend,
  IconInbox,
  IconCheckCircle,
  IconForm,
  IconSettings,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const t = await getT();

  const sections = [
    { icon: IconHome, title: t("help.s1.t"), body: t("help.s1.b") },
    { icon: IconSend, title: t("help.s2.t"), body: t("help.s2.b") },
    { icon: IconInbox, title: t("help.s3.t"), body: t("help.s3.b") },
    { icon: IconCheckCircle, title: t("help.s4.t"), body: t("help.s4.b") },
    { icon: IconForm, title: t("help.s5.t"), body: t("help.s5.b") },
    { icon: IconSettings, title: t("help.s6.t"), body: t("help.s6.b") },
  ];

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("help.title")} subtitle={t("help.subtitle")} />

        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((s) => (
            <div key={s.title} className="card p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                  <s.icon className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-text">{s.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] text-muted">
          {t("help.contact")}
        </div>
      </div>
    </PageShell>
  );
}
