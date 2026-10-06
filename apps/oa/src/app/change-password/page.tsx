import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ForcedPasswordForm from "./ForcedPasswordForm";
import { logoutAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

/**
 * อยู่นอกกลุ่ม (app) โดยตั้งใจ — ตอนถูกบังคับเปลี่ยนรหัสไม่ควรมีเมนูให้เดินไปไหน
 * และถ้าอยู่ในกลุ่มนั้น layout จะเด้งกลับมาหน้านี้ซ้ำจนวน
 */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getT();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-24">
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-text">{t("pwd.title")}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{user.email}</p>
        </div>

        {user.must_change_password === 1 && (
          <div className="alert alert-warn mb-3">{t("pwd.forced")}</div>
        )}

        <div className="card space-y-5 p-7 sm:p-8">
          <p className="text-xs text-muted">{t("pwd.rules")}</p>
          <ForcedPasswordForm />
        </div>

        {/* ทางออกเดียวจากหน้านี้คือตั้งรหัสใหม่ หรือออกจากระบบ */}
        <form action={logoutAction} className="mt-3 text-center">
          <button className="text-xs text-muted hover:text-text hover:underline">
            {t("nav.logout")}
          </button>
        </form>
      </div>
    </main>
  );
}
