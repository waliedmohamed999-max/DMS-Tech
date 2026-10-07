import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site, whatsappLink } from "@/content/site";
import { chatbotNav } from "@/content/chatbot-nav";
import type { ServiceView } from "@/lib/content";
import { BrandIcon } from "@/components/ui/Brand";
import { Icon } from "@/components/ui/Icon";

export async function SocialLinks({ className = "" }: { className?: string }) {
  const items = [
    { slug: "instagram", href: site.socials.instagram, label: "Instagram" },
    { slug: "tiktok", href: site.socials.tiktok, label: "TikTok" },
    { slug: "youtube", href: site.socials.youtube, label: "YouTube" },
    { slug: "linkedin", href: site.socials.linkedin, label: "LinkedIn" },
    { slug: "x", href: site.socials.x, label: "X" }
  ];
  return (
    <div className={`flex gap-2 ${className}`}>
      {items.map((i) => (
        <a
          key={i.slug}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={i.label}
          className="grid size-9 place-items-center rounded-full border border-mist text-iron transition hover:border-ink hover:text-ink"
        >
          <BrandIcon slug={i.slug} size={15} />
        </a>
      ))}
    </div>
  );
}

/** Specify footer: hairline, brand + badge, four link columns, legal row */
export default async function Footer({ services }: { services: ServiceView[] }) {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const locale = await getLocale();

  const cols: { title: string; links: { href: string; label: string; badge?: string; external?: boolean }[] }[] = [
    { title: t("services"), links: services.slice(0, 6).map((s) => ({ href: `/services/${s.slug}`, label: s.eyebrow })) },
    {
      title: t("resources"),
      links: [
        { href: "/blog", label: nav("blog") },
        { href: "/nova-ai", label: "NOVA AI", badge: nav("newBadge") },
        { href: chatbotNav.href, label: chatbotNav.title[locale === "ar" ? "ar" : "en"], badge: chatbotNav.soon[locale === "ar" ? "ar" : "en"] },
        { href: "/clients#platforms", label: nav("platforms") },
        { href: "/quote", label: nav("quote") }
      ]
    },
    {
      title: t("company"),
      links: [
        { href: "/about", label: nav("about") },
        { href: "/clients", label: nav("clients") },
        { href: "/careers", label: nav("careers") },
        { href: "/contact", label: nav("contact") }
      ]
    },
    {
      title: t("contact"),
      links: [
        { href: whatsappLink(), label: site.phoneDisplay, external: true },
        { href: `mailto:${site.email}`, label: site.email, external: true },
        { href: site.socials.instagram, label: "Instagram", external: true },
        { href: site.socials.linkedin, label: "LinkedIn", external: true }
      ]
    }
  ];

  return (
    <footer className="bg-white">
      <div className="container-site">
        <div className="grid gap-12 border-t border-mist py-16 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="grid content-start gap-4">
            <Image src="/images/logo.png" alt="DMS Tech" width={1200} height={435} className="h-11 w-auto" />
            <p className="flex items-center gap-2 text-sm text-graphite">
              <span className="grid size-5 place-items-center rounded-full bg-iris text-white">
                <Icon name="BadgeCheck" size={12} />
              </span>
              {locale === "ar" ? "شركة سعودية مسجّلة" : "Registered Saudi company"}
            </p>
            <p className="text-sm text-iron">
              {site.crLabel[locale === "ar" ? "ar" : "en"]}:{" "}
              <span className="font-semibold tabular-nums text-ink" dir="ltr">
                {site.crNumber}
              </span>
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-iron">{t("about")}</p>
            <SocialLinks className="pt-1" />
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-4 text-sm font-semibold text-ink">{c.title}</h4>
              <ul className="grid gap-2.5 text-sm">
                {c.links.map((l) =>
                  l.external ? (
                    <li key={l.label}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-iron transition hover:text-ink" dir="auto">
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link href={l.href} className="inline-flex items-center gap-2 text-iron transition hover:text-ink">
                        {l.label}
                        {l.badge && <span className="rounded-full bg-iris px-2 py-0.5 text-[10.5px] font-semibold text-white">{l.badge}</span>}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-mist py-6 text-sm">
          <div className="flex gap-6 text-ink">
            <Link href="/contact" className="hover:text-iris">
              {nav("contact")}
            </Link>
            <Link href="/careers" className="hover:text-iris">
              {nav("careers")}
            </Link>
            <Link href="/quote" className="hover:text-iris">
              {nav("quote")}
            </Link>
          </div>
          <span className="text-graphite">
            ©{new Date().getFullYear()} DMS Tech · {t("rights")}
          </span>
        </div>
      </div>
    </footer>
  );
}
