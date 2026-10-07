import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { fontVars } from "../fonts";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { site } from "@/content/site";
import { getServices } from "@/lib/content";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { WhatsAppFloat } from "@/components/layout/Chrome";
import { PauseOffscreenMotion } from "@/components/layout/PauseOffscreenMotion";
import { Splash } from "@/components/layout/Splash";
import "../globals.css";


export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// only the configured locales exist: any other first segment (e.g. the browser's automatic /favicon.ico) is a static
// 404 instead of a dynamic render that fails (500) while loading translations for a non-existent locale
export const dynamicParams = false;

export const viewport: Viewport = { themeColor: "#151718" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // unknown first segment (e.g. the browser's automatic /favicon.ico) → 404, not a 500 from the translation loader
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "metadata" });
  const path = locale === routing.defaultLocale ? "/" : `/${locale}`;

  return {
    metadataBase: new URL(site.url),
    title: { default: t("title"), template: `%s | ${t("siteName")}` },
    description: t("description"),
    alternates: { canonical: path, languages: { ar: "/", en: "/en" } },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: path,
      siteName: t("siteName"),
      locale: locale === "ar" ? "ar_SA" : "en_US",
      type: "website",
      images: [{ url: "/images/photos/about-team.jpg" }]
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
    icons: { icon: "/images/logo.png" }
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale as Locale);

  const services = await getServices(locale as Locale);
  const navServices = services.map(({ slug, icon, title, summary }) => ({ slug, icon, title, summary }));

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={fontVars}>
      <body>
        <Splash locale={locale} />
        <NextIntlClientProvider>
          <Header services={navServices} />
          <main>{children}</main>
          <Footer services={services} />
          <WhatsAppFloat />
          <PauseOffscreenMotion />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
