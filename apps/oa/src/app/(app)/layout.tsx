import { requireUser } from "@/lib/auth";
import { listAwaitingMe } from "@/lib/queries";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = (await listAwaitingMe(user.id)).length;

  return (
    <AppShell
      user={{
        name: user.name,
        position: user.position || user.department,
        email: user.email,
        role: user.role,
      }}
      pending={pending}
    >
      {children}
    </AppShell>
  );
}
