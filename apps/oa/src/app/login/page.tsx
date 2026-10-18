import { redirect } from "next/navigation";
import { FileCheck2, GitBranch, KeyRound, ShieldCheck, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ssoConfig, ssoReady } from "@/lib/sso/config";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso_error?: string; sso?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const t = await getT();
  const sp = await searchParams;
  const cfg = ssoConfig();
  const sso = ssoReady(cfg);

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" style={{ background: "var(--c-surface)" }}>
      {/* ───────── ฝั่งซ้าย: ฟอร์ม ───────── */}
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: "#1f4a85", boxShadow: "var(--sh-2)" }}>OA</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-text">{t("app.name")}</p>
              <p className="text-xs text-muted">Internal Approval System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-text">{t("app.name")}</h1>
              <p className="text-sm text-muted">{t("login.subtitle")}</p>
            </div>

            {sp.sso_error && <div className="alert alert-error mb-4">{sp.sso_error}</div>}
            {sp.sso === "unconfigured" && <div className="alert alert-warn mb-4">{t("sso.notConfigured")}</div>}

            <div className="space-y-5">
              {sso && (
                <a href="/api/auth/sso/login" className="btn-primary w-full justify-center">
                  <ShieldCheck size={17} /> {t("sso.signIn")}
                </a>
              )}

              {sso && cfg.allowLocalLogin && (
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-border" />
                  {t("sso.or")}
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}

              {(!sso || cfg.allowLocalLogin) && <LoginForm />}

              {sso && !cfg.allowLocalLogin && <p className="text-center text-xs text-muted">{t("sso.centralOnly")}</p>}
            </div>

            <p className="mt-5 text-center text-xs text-muted">{sso ? t("sso.forgot") : t("login.forgot")}</p>
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> {t("workspace.eyebrow")}
        </p>
      </div>

      {/* ───────── ฝั่งขวา: ภาพ hero ไล่สี (เฉพาะจอใหญ่) ───────── */}
      <div
        className="relative hidden overflow-hidden lg:block"
        style={{ background: "radial-gradient(130% 130% at 15% 15%, #3f6fe0 0%, #1e3a8a 45%, #0b1a44 100%)" }}
      >
        <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(129,165,255,0.22)" }} />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(96,165,250,0.15)" }} />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-white/10 text-xl font-bold text-white ring-1 ring-white/15 backdrop-blur">OA</div>

          <div className="max-w-md">
            <span className="mb-5 inline-flex rounded-full border border-white/25 px-3 py-1 text-xs text-white/80">{t("workspace.eyebrow")}</span>
            <h2 className="text-3xl font-semibold leading-snug tracking-tight">{t("workspace.loginTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{t("workspace.loginHint")}</p>

            <div className="mt-8 grid gap-2.5 text-sm text-white/85">
              <span className="flex items-center gap-2.5"><FileCheck2 className="h-4 w-4 shrink-0 text-sky-200" strokeWidth={1.8} /> ส่งคำขอและอนุมัติเอกสารครบในที่เดียว</span>
              <span className="flex items-center gap-2.5"><GitBranch className="h-4 w-4 shrink-0 text-sky-200" strokeWidth={1.8} /> เส้นทางอนุมัติหลายขั้นที่ปรับเองได้</span>
              <span className="flex items-center gap-2.5"><Users className="h-4 w-4 shrink-0 text-sky-200" strokeWidth={1.8} /> ติดตามสถานะและผู้รออนุมัติแบบเรียลไทม์</span>
              <span className="flex items-center gap-2.5"><KeyRound className="h-4 w-4 shrink-0 text-sky-200" strokeWidth={1.8} /> ล็อกอินปลอดภัยผ่านระบบกลาง (SSO)</span>
            </div>
          </div>

          <p className="text-xs tracking-wide text-white/50">© {new Date().getFullYear()} SHD Technology · {t("app.name")}</p>
        </div>
      </div>
    </main>
  );
}
