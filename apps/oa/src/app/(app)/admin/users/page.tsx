import { requireAdmin } from "@/lib/auth";
import { listAllUsers } from "@/lib/queries";
import { updateUserAccessAction, addUserFromDirectoryAction } from "@/lib/actions";
import { rolesAreLocal } from "@/lib/sso/config";
import { PageShell, PageTitle, SectionCard, EmptyState } from "@/components/layout-bits";
import AddUserPicker from "@/components/AddUserPicker";
import { ROLES, JOB_ROLES } from "@/lib/types";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * จัดการสิทธิ์ผู้ใช้ (แอดมิน) — โหมด "แอปคุมสิทธิ์เอง"
 * ทุกคนที่ล็อกอินผ่านระบบกลางเข้าได้ + ส่งคำขอพื้นฐาน · แอดมินปรับบทบาท/ตำแหน่งงานที่นี่
 */
export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const t = await getT();
  const sp = await searchParams;
  const users = await listAllUsers();
  const canEdit = rolesAreLocal();

  const flash =
    sp.ok === "added" ? { tone: "ok", msg: t("users.flash.added") }
    : sp.ok ? { tone: "ok", msg: t("users.flash.ok") }
    : sp.err === "self" ? { tone: "err", msg: t("users.flash.self") }
    : sp.err === "central" ? { tone: "err", msg: t("users.flash.central") }
    : sp.err ? { tone: "err", msg: t("users.flash.bad") }
    : null;

  return (
    <PageShell>
      <div className="space-y-5">
        <PageTitle title={t("users.title")} subtitle={t("users.subtitle")} />

        {flash && (
          <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${
            flash.tone === "ok"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-rose-200"
          }`}>
            {flash.msg}
          </div>
        )}

        {!canEdit && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            {t("users.centralLocked")}
          </div>
        )}

        {canEdit && (
          <SectionCard title={t("users.add.title")} hint={t("users.add.hint")}>
            <AddUserPicker
              action={addUserFromDirectoryAction}
              roleOptions={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
              labels={{
                heading: t("users.add.search"),
                placeholder: t("users.add.placeholder"),
                searching: t("users.add.searching"),
                noResult: t("users.add.noResult"),
                tooShort: t("users.add.tooShort"),
                notConfigured: t("users.add.notConfigured"),
                failed: t("users.add.failed"),
                stale: t("users.add.stale"),
                role: t("users.col.role"),
                add: t("users.add.btn"),
                picked: t("users.add.picked"),
              }}
            />
          </SectionCard>
        )}

        <SectionCard title={t("users.cardTitle")} hint={t("users.cardHint", { n: String(users.length) })}>
          {users.length === 0 ? (
            <EmptyState>{t("users.empty")}</EmptyState>
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col">{t("users.col.user")}</th>
                    <th scope="col">{t("users.col.dept")}</th>
                    <th scope="col">{t("users.col.role")}</th>
                    <th scope="col">{t("users.col.jobRole")}</th>
                    <th scope="col">{t("users.col.status")}</th>
                    <th scope="col">{t("users.col.login")}</th>
                    <th scope="col" className="text-right">{t("users.col.save")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="row-hover align-middle">
                      <td className="px-3 py-2">
                        <div className="font-medium text-text">{u.name}</div>
                        <div className="text-[11px] text-muted">{u.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-text-soft">
                        {u.department || <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <form id={`f-${u.id}`} action={updateUserAccessAction} className="contents">
                          <input type="hidden" name="user_id" value={u.id} />
                          <select name="role" defaultValue={u.role} disabled={!canEdit} className="bar-field w-32">
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{t(`role.${r}`)}</option>
                            ))}
                          </select>
                        </form>
                      </td>
                      <td className="px-3 py-2">
                        <select form={`f-${u.id}`} name="job_role" defaultValue={u.job_role} disabled={!canEdit}
                                className="bar-field w-44">
                          {JOB_ROLES.map((jr) => (
                            <option key={jr} value={jr}>{t(`jobRole.${jr}`)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select form={`f-${u.id}`} name="active" defaultValue={u.active ? "1" : "0"} disabled={!canEdit}
                                className="bar-field w-28">
                          <option value="1">{t("users.active")}</option>
                          <option value="0">{t("users.inactive")}</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {u.sso_sub ? (
                          <span className="badge tone-primary">{t("users.linkedSso")}</span>
                        ) : (
                          <span className="badge bg-surface text-text-soft ring-border-strong">{t("users.linkedLocal")}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button form={`f-${u.id}`} type="submit" disabled={!canEdit}
                                className="btn-primary h-9 min-h-0 px-3 text-[13px] disabled:opacity-40">
                          {t("users.save")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <p className="text-xs text-muted">{t("users.note")}</p>
      </div>
    </PageShell>
  );
}
