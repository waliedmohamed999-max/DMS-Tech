import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { OS_THEME_COOKIE, type OsTheme } from "@/lib/os/theme";
import { fontVars } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "DMS Tech · Business OS", template: "%s · DMS Business OS" },
  robots: { index: false, follow: false },
  icons: { icon: "/images/logo.png" }
};

/** Each person picks light or dark (ThemeToggle); light is the default. */
async function osTheme(): Promise<OsTheme> {
  return (await cookies()).get(OS_THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await osTheme();
  return { themeColor: theme === "dark" ? "#0d0f10" : "#ffffff", colorScheme: theme };
}

/** Root layout of the internal Business OS (separate from the public site's root layout). */
export default async function OsRootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme] = await Promise.all([getLocale(), osTheme()]);
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${fontVars} ${theme === "dark" ? "dark" : "os-light"}`} style={{ colorScheme: theme }}>
      <body className="min-h-dvh bg-os-bg text-os-text antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
