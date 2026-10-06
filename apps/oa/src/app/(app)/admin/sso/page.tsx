import { requireAdmin } from "@/lib/auth";
import { db, USER_SELECT } from "@/lib/db";
import { redirectUri, rolesAreLocal, ssoConfig, ssoReady } from "@/lib/sso/config";
import { getT } from "@/lib/i18n/server";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { formatDateTime } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import type { Role, User } from "@/lib/types";
import { centralAuthzConfig, fetchEffective } from "@/lib/central/authz";
import { roleFromPerms } from "@/lib/central/role";
import { CENTRAL_CAPABILITY_DEFS, CENTRAL_RESOURCES } from "@/lib/central/schema";

export const dynamic = "force-dynamic";

export default async function SsoPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const cfg = ssoConfig();
  const ready = ssoReady(cfg);

  const users = (await db
    .prepare(`${USER_SELECT} WHERE u.active = 1 ORDER BY u.sso_sub = '' , u.name`)
    .all()) as User[];
  const linked = users.filter((u) => u.sso_sub);

  // ถามระบบกลางว่าแต่ละคน "จะได้" บทบาทอะไร — ดูก่อนเปิดสวิตช์ว่าใครเปลี่ยนบ้าง
  // จำกัดจำนวนไว้ เพราะหน้านี้ยิงทีละคน หน้าจะช้าถ้าองค์กรโตขึ้นมาก
  const central = centralAuthzConfig();
  const CHECK_LIMIT = 50;
  const toCheck = central.ready ? users.filter((u) => u.email).slice(0, CHECK_LIMIT) : [];
  const centralRows = await Promise.all(
    toCheck.map(async (u) => {
      const r = await fetchEffective(u.email);
      if (r.state === "ok" || r.state === "stale") {
        return {
          user: u,
          ok: true as const,
          roles: r.perms.roles,
          level: r.perms.base_level,
          hasAccess: r.perms.hasAccess,
          willBe: roleFromPerms(r.perms) as Role,
        };
      }
      return { user: u, ok: false as const, state: r.state };
    }),
  );
  const changing = centralRows.filter((r) => r.ok && (r.willBe !== r.user.role || !r.hasAccess));

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("sso.title")} subtitle={t("sso.subtitle")} />

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard
            title={t("integrations.status")}
            action={
              <span className={`badge ${ready ? "tone-emerald" : "tone-amber"}`}>
                {ready ? t("integrations.ready") : t("integrations.notReady")}
              </span>
            }
          >
            <ul className="divide-y divide-border text-sm">
              <Row name="SSO_ISSUER" value={cfg.issuer || "—"} />
              <Row name="SSO_CLIENT_ID" value={cfg.clientId || "—"} />
              <Row name="SSO_CLIENT_SECRET" value={cfg.clientSecret ? "••••••" : "—"} />
              <Row name="SSO_SCOPES" value={cfg.scopes} />
              <Row
                name="SSO_CENTRAL_ROLES"
                value={cfg.centralRoles ? t("sso.rolesLocked") : t("common.notSet")}
              />
              <Row
                name="SSO_ALLOW_LOCAL_LOGIN"
                value={cfg.allowLocalLogin ? "true" : "false"}
              />
            </ul>

            <div className="mt-4">
              <div className="label">{t("sso.redirectUri")}</div>
              <code className="block overflow-x-auto rounded-xl bg-surface-2 px-3 py-2 text-xs">
                {redirectUri(cfg)}
              </code>
              <p className="mt-1 text-xs text-muted">{t("sso.redirectHint")}</p>
            </div>
          </SectionCard>

          <SectionCard title={t("sso.roleMapping")} hint={t("sso.roleMappingHint")}>
            <ul className="divide-y divide-border text-sm">
              {Object.entries(cfg.roleMap).map(([from, to]) => (
                <li key={from} className="flex items-center gap-2 py-1.5">
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{from}</code>
                  <span className="text-muted">→</span>
                  <span className="badge tone-primary">{t(`role.${to}`)}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-muted">{t("sso.default")}</span>
                <span className="text-muted">→</span>
                <span className="badge tone-neutral">{t(`role.${cfg.defaultRole}`)}</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted">{t("sso.jobRoleNote")}</p>
          </SectionCard>
        </div>

        <SectionCard
          title={t("central.title")}
          hint={t("central.hint")}
          action={
            <span className={`badge ${central.enforce ? "tone-emerald" : "tone-amber"}`}>
              {central.enforce ? t("central.on") : t("central.off")}
            </span>
          }
        >
          <ul className="divide-y divide-border text-sm">
            <Row name="CENTRAL_API_KEY" value={central.key ? "••••••" : t("common.notSet")} />
            <Row name="CENTRAL_AUTHZ" value={central.enforce ? "true" : "false"} />
            <Row
              name={t("central.declared")}
              value={t("central.declaredValue", {
                r: CENTRAL_RESOURCES.length,
                c: CENTRAL_CAPABILITY_DEFS.length,
              })}
            />
          </ul>

          {!central.ready ? (
            <p className="mt-3 text-sm text-muted">{t("central.notReady")}</p>
          ) : (
            <>
              {!central.enforce && changing.length > 0 && (
                <div className="mt-3 rounded-xl tone-amber px-3 py-2 text-sm ring-1">
                  {t("central.willChange", { n: changing.length })}
                </div>
              )}
              <div className="table-wrap mt-3">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th scope="col" className="px-4 py-2">{t("admin.users.name")}</th>
                      <th scope="col" className="px-4 py-2">{t("central.appRole")}</th>
                      <th scope="col" className="px-4 py-2">{t("central.centralSays")}</th>
                      <th scope="col" className="px-4 py-2">{t("central.willBe")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {centralRows.map((row) => (
                      <tr key={row.user.id}>
                        <td className="px-4 py-2">
                          <div className="text-text">{row.user.name}</div>
                          <div className="text-xs text-muted">{row.user.email}</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="badge tone-neutral">{t(`role.${row.user.role}`)}</span>
                        </td>
                        <td className="px-4 py-2">
                          {row.ok ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {row.roles.map((r) => (
                                <span key={r} className="badge tone-sky">{r}</span>
                              ))}
                              <span className="text-xs text-muted">{row.level}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">{t("central.noAnswer")}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {!row.ok ? (
                            <span className="text-xs text-muted">—</span>
                          ) : !row.hasAccess ? (
                            <span className="badge tone-rose">{t("central.denied")}</span>
                          ) : (
                            <span
                              className={`badge ${row.willBe === row.user.role ? "tone-neutral" : "tone-amber"}`}
                            >
                              {t(`role.${row.willBe}`)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {toCheck.length === CHECK_LIMIT && (
                <p className="mt-2 text-xs text-muted">{t("central.limited", { n: CHECK_LIMIT })}</p>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard
          title={t("sso.linkedUsers")}
          action={
            <span className="text-sm text-muted">
              {linked.length} / {users.length}
            </span>
          }
        >
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-4 py-2">{t("admin.users.name")}</th>
                  <th scope="col" className="px-4 py-2">{t("admin.users.access")}</th>
                  <th scope="col" className="px-4 py-2">{t("sso.lastRoles")}</th>
                  <th scope="col" className="px-4 py-2">{t("detail.submittedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const snap = u.sso_roles ? JSON.parse(u.sso_roles) : null;
                  const roles: string[] = snap?.roles ?? [];
                  const groups: string[] = snap?.groups ?? [];
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-2">
                        <div className="text-text">{u.name}</div>
                        <div className="text-xs text-muted">{u.email}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="badge tone-primary">{t(`role.${u.role}`)}</span>
                      </td>
                      <td className="px-4 py-2">
                        {u.sso_sub ? (
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) => (
                              <span key={r} className="badge tone-neutral">{r}</span>
                            ))}
                            {groups.map((g) => (
                              <span key={g} className="badge tone-sky">{g}</span>
                            ))}
                            {roles.length === 0 && groups.length === 0 && (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </div>
                        ) : (
                          <span className="badge tone-neutral">{t("sso.localOnly")}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                        {u.sso_synced_at ? formatDateTime(u.sso_synced_at, locale) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{name}</code>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{value}</span>
    </li>
  );
}
