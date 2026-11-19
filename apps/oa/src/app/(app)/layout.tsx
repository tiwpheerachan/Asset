import { requireUser } from "@/lib/auth";
import { listAwaitingMe } from "@/lib/queries";
import AppShell from "@/components/AppShell";
import { effectiveMenuKeys } from "@/lib/menu-access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = (await listAwaitingMe(user.id)).length;
  const visibleKeys = [...effectiveMenuKeys(user)];

  return (
    <AppShell
      user={{
        name: user.name,
        position: user.position || user.department,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      }}
      pending={pending}
      visibleKeys={visibleKeys}
    >
      {children}
    </AppShell>
  );
}
