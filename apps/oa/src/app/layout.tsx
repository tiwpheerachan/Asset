import type { Metadata } from "next";
import I18nProvider from "@/components/I18nProvider";
import { getLocaleBundle } from "@/lib/i18n/server";
import { LOCALE_HTML_LANG } from "@/lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: "One OA",
  description: "One OA — ระบบยื่นและอนุมัติคำขอภายในองค์กร",
};

/**
 * ตั้งคลาสธีมก่อน React จะ hydrate เพื่อไม่ให้หน้าจอกะพริบขาวตอนโหลดในโหมดมืด
 * (ต้องเป็น inline script — จะรอ useEffect ไม่ได้)
 */
const themeScript = `
try {
  var t = localStorage.getItem('ia-theme');
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getLocaleBundle();

  return (
    <html lang={LOCALE_HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
