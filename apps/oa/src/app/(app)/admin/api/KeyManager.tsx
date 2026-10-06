"use client";

import { useActionState } from "react";
import { createKeyAction, deleteKeyAction, revokeKeyAction } from "./actions";
import { IconDuplicate, IconTrash } from "@/components/icons";
import { useT } from "@/components/I18nProvider";
import type { ApiKeyRow } from "@/lib/api-keys";
import type { ActionState } from "@/lib/actions";

const initial: ActionState & { key?: string } = {};

export default function KeyManager({ keys }: { keys: ApiKeyRow[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(createKeyAction, initial);

  return (
    <div className="space-y-4">
      {/* กุญแจที่เพิ่งสร้างโชว์ที่นี่ครั้งเดียว — ปิดหน้าหรือรีเฟรชแล้วดูไม่ได้อีก */}
      {state.key && (
        <div className="rounded-md tone-amber p-3 ring-1">
          <p className="text-sm font-medium">{t("api.copyNow")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-1.5 font-mono text-xs">
              {state.key}
            </code>
            <button
              type="button"
              className="btn-icon h-8 w-8"
              aria-label={t("common.copy")}
              title={t("common.copy")}
              onClick={() => navigator.clipboard?.writeText(state.key ?? "")}
            >
              <IconDuplicate className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="key-name">{t("api.keyName")}</label>
          <input id="key-name" name="name" required className="input"
                 placeholder={t("api.keyNameHint")} />
        </div>
        <label className="flex h-11 items-center gap-2 rounded-md px-2 text-sm text-text-soft">
          <input type="checkbox" name="can_write" value="1"
                 className="h-4 w-4 rounded border-border-strong" />
          {t("api.canWrite")}
        </label>
        <button className="btn-primary h-11" disabled={pending}>{t("api.createKey")}</button>
      </form>

      {state.error && <p className="text-sm text-no">{state.error}</p>}

      <div className="overflow-x-auto rounded-md ring-1 ring-border">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th scope="col" className="border-b border-r border-border px-3 py-2 font-medium">{t("api.keyName")}</th>
              <th scope="col" className="border-b border-r border-border px-3 py-2 font-medium">{t("api.prefix")}</th>
              <th scope="col" className="border-b border-r border-border px-3 py-2 font-medium">{t("api.scope")}</th>
              <th scope="col" className="border-b border-r border-border px-3 py-2 font-medium">{t("api.lastUsed")}</th>
              <th scope="col" className="border-b border-r border-border px-3 py-2 text-right font-medium">{t("api.calls")}</th>
              <th scope="col" className="w-24 border-b border-border px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={k.active ? "" : "opacity-50"}>
                <td className="border-b border-r border-border px-3 py-2 text-text">
                  {k.name}
                  {!k.active && <span className="ml-2 badge">{t("api.revoked")}</span>}
                </td>
                <td className="border-b border-r border-border px-3 py-2 font-mono text-xs text-muted">
                  {k.prefix}…
                </td>
                <td className="border-b border-r border-border px-3 py-2 text-text-soft">
                  {k.can_write ? t("api.scopeWrite") : t("api.scopeRead")}
                </td>
                <td className="border-b border-r border-border px-3 py-2 text-text-soft">
                  {k.last_used_at ?? "—"}
                </td>
                <td className="border-b border-r border-border px-3 py-2 text-right tabular-nums text-text-soft">
                  {k.calls}
                </td>
                <td className="border-b border-border px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    {/* เพิกถอนไว้ก่อน ไม่ลบทิ้ง — ยังต้องตามได้ว่าใบนี้เคยถูกเรียกไปกี่ครั้ง */}
                    {k.active === 1 ? (
                      <form action={revokeKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="text-xs text-no hover:underline">{t("api.revoke")}</button>
                      </form>
                    ) : (
                      <form action={deleteKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="btn-icon h-7 w-7 text-muted ring-0 hover:text-no"
                                aria-label={t("common.delete")} title={t("common.delete")}>
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">
                  {t("api.noKeys")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
