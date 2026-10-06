import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { ssoConfig, ssoReady } from "@/lib/sso/config";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { Avatar } from "@/components/ui";
import { JOB_ROLE_LABEL } from "@/lib/types";
import PasswordForm from "./PasswordForm";
import DelegationForm from "@/components/DelegationForm";
import SignatureForm from "./SignatureForm";
import { listDelegations, today } from "@/lib/delegation";
import { listActiveUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getT();
  const cfg = ssoConfig();
  // บัญชีที่มาจากระบบกลางไม่มีรหัสผ่านในแอปนี้ จึงเปลี่ยนที่นี่ไม่ได้
  const canChangePassword = !user.sso_sub || cfg.allowLocalLogin;
  const myDelegations = (await listDelegations(user.id)).filter((d) => d.from_user === user.id);
  const people = (await listActiveUsers())
    .filter((p) => p.id !== user.id)
    .map((p) => ({ id: p.id, name: p.name, department: p.department }));

  return (
    <PageShell width="narrow">
      <div className="space-y-5">
        <PageTitle title={t("profile.title")} subtitle={t("profile.subtitle")} />

        <SectionCard title={t("sign.title")} hint={t("sign.subtitle")}>
          <SignatureForm current={user.signature ?? ""} />
        </SectionCard>

        <SectionCard title={t("deleg.title")} hint={t("deleg.hint")}>
          <DelegationForm people={people} rows={myDelegations} today={today()} forUser={user.id} />
        </SectionCard>

        <SectionCard title={t("profile.account")}>
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size={48} />
            <div className="min-w-0">
              <div className="text-base font-medium text-text">{user.name}</div>
              <div className="text-sm text-muted">{user.email}</div>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
            <Row label={t("admin.users.position")} value={user.position || "—"} />
            <Row label={t("detail.department")} value={user.department || "—"} />
            <Row label={t("admin.users.access")} value={t(`role.${user.role}`)} />
            <Row label={t("admin.users.jobRole")} value={JOB_ROLE_LABEL[user.job_role]} />
          </dl>

          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
            {user.sso_sub ? t("profile.fromCentral") : t("profile.askAdmin")}
          </p>
        </SectionCard>

        {canChangePassword && (
          <SectionCard title={t("profile.changePassword")} hint={t("profile.passwordHint")}>
            <PasswordForm />
          </SectionCard>
        )}
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
