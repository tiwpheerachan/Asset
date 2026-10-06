import { redirect } from "next/navigation";
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-20">
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <section className="login-story hidden min-h-[540px] flex-col justify-between p-10 lg:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="flex items-center gap-3 text-sm font-medium"><img src="/brand/ga-logo.png" alt="GA" className="h-9 w-auto rounded-lg object-cover" />{t("app.short")}</div>
          <div>
            <span className="mb-6 inline-flex rounded-full border border-border px-3 py-1 text-xs text-primary-text">{t("workspace.eyebrow")}</span>
            <h2 className="text-3xl font-semibold leading-relaxed">{t("workspace.loginTitle")}</h2>
            <p className="mt-5 text-base leading-relaxed text-text-soft">{t("workspace.loginHint")}</p>
          </div>
          <div className="h-px w-12 bg-border-strong" aria-hidden />
        </section>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/ga-logo.png"
            alt="GA"
            className="mb-3 h-12 w-auto rounded-xl object-cover"
            style={{ boxShadow: "var(--sh-2)" }}
          />
          <h1 className="text-xl font-bold text-text">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
        </div>

        {sp.sso_error && (
          <div className="alert alert-error mb-3">{sp.sso_error}</div>
        )}
        {sp.sso === "unconfigured" && (
<div className="alert alert-warn mb-3">{t("sso.notConfigured")}</div>
        )}

        <div className="card space-y-5 p-7 sm:p-8">
          {sso && (
            <a href="/api/auth/sso/login" className="btn-primary w-full justify-center">
              {t("sso.signIn")}
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

          {sso && !cfg.allowLocalLogin && (
            <p className="text-center text-xs text-muted">{t("sso.centralOnly")}</p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          {sso ? t("sso.forgot") : t("login.forgot")}
        </p>
      </div>
      </div>
    </main>
  );
}
