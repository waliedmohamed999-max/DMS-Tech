import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { fontVars } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "DMS Tech · Business OS", template: "%s · DMS Business OS" },
  robots: { index: false, follow: false },
  icons: { icon: "/images/logo.png" }
};

export const viewport: Viewport = { themeColor: "#0d0f10", colorScheme: "dark" };

/** Root layout of the internal Business OS (separate from the public site's root layout). */
export default async function OsRootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${fontVars} dark`}>
      <body className="min-h-dvh bg-os-bg text-os-text antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
