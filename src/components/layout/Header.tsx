"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { projectsCopy } from "@/content/projects-copy";
import { chatbotNav } from "@/content/chatbot";

export type NavService = { slug: string; icon: IconName; title: string; summary: string };

type MenuKey = "about" | "services" | "clients";

export default function Header({ services }: { services: NavService[] }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const [stuck, setStuck] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close menus on navigation (reset during render, per React's "adjusting state" pattern)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(null);
    setMobile(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);

  const enter = (k: MenuKey) => {
    clearTimeout(closeTimer.current);
    setOpen(k);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };

  const lang = locale === "ar" ? "ar" : "en";
  const aboutLinks: MenuItem[] = [
    { href: "/about", icon: "Building2", title: t("aboutCompany"), desc: t("aboutCompanyDesc") },
    { href: "/about#values", icon: "Award", title: t("whyUs"), desc: t("whyUsDesc") },
    { href: "/about#process", icon: "Route", title: t("process"), desc: t("processDesc") },
    { href: "/nova-ai", icon: "Sparkles", title: t("nova"), desc: t("novaDesc") },
    { href: chatbotNav.href, icon: "MessagesSquare", title: chatbotNav.title[lang], desc: chatbotNav.desc[lang], badge: chatbotNav.soon[lang] }
  ];
  const clientLinks: MenuItem[] = [
    { href: "/clients#projects", icon: "Briefcase", title: projectsCopy.navTitle[lang], desc: projectsCopy.navDesc[lang] },
    { href: "/clients#industries", icon: "Layers", title: t("industries"), desc: t("industriesDesc") },
    { href: "/clients#platforms", icon: "Plug", title: t("platforms"), desc: t("platformsDesc") }
  ];

  // Specify: the bar melts into the dark hero at the top and turns white once scrolled
  const dark = !stuck && !mobile;
  const hov = dark ? "hover:bg-white/10" : "hover:bg-cloud";
  const onCls = dark ? "bg-white/10" : "bg-cloud";

  const trigger = (k: MenuKey, label: string) => (
    <button
      type="button"
      aria-expanded={open === k}
      onClick={() => setOpen(open === k ? null : k)}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-3 py-2 text-[15px] font-medium transition ${hov} ${open === k ? onCls : ""}`}
    >
      {label}
      <Icon name="ChevronDown" size={16} className={`transition ${open === k ? "rotate-180" : ""}`} />
    </button>
  );

  const plain = (href: string, label: string) => (
    <Link href={href} className={`whitespace-nowrap rounded-pill px-3 py-2 text-[15px] font-medium transition ${hov}`}>
      {label}
    </Link>
  );

  return (
    <header className={`sticky top-0 z-50 border-b transition-colors md:backdrop-blur duration-300 ${dark ? "border-transparent bg-obsidian text-white" : "border-mist bg-white/95 text-ink shadow-card"}`}>
      <div className="container-site flex h-[72px] items-center gap-6">
        <Link href="/" aria-label="DMS Tech" className="shrink-0">
          <Image src="/images/logo-dark.png" alt="DMS Tech" width={1200} height={437} priority className={`h-10 w-auto xl:h-12 ${dark ? "" : "hidden"}`} />
          <Image src="/images/logo.png" alt="" width={1200} height={435} priority className={`h-10 w-auto xl:h-12 ${dark ? "hidden" : ""}`} />
        </Link>

        {/* Desktop nav */}
        <nav className="ms-auto hidden items-center xl:flex" aria-label="Main">
          {plain("/", t("home"))}

          <div className="relative" onMouseEnter={() => enter("about")} onMouseLeave={leave}>
            {trigger("about", t("about"))}
            <Dropdown show={open === "about"} className="w-[320px]">
              {aboutLinks.map((l) => (
                <MenuLink key={l.href} {...l} />
              ))}
            </Dropdown>
          </div>

          <div className="relative" onMouseEnter={() => enter("services")} onMouseLeave={leave}>
            {trigger("services", t("services"))}
            <div
              className={`absolute start-1/2 top-full w-[680px] pt-2 transition duration-200 ltr:-translate-x-1/2 rtl:translate-x-1/2 ${open === "services" ? "visible opacity-100" : "invisible opacity-0"}`}
            >
              <div className="grid grid-cols-[1.1fr_1fr] gap-6 rounded-card border border-white/10 bg-obsidian p-4 text-white shadow-sm2">
                <div>
                  <p className="mb-3 px-1 text-[15px] font-semibold">{t("forWhom")}</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Link href="/services/ecommerce" className="relative h-[124px] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0b2a6b,#1d58c0)] p-3.5 transition hover:brightness-110">
                      <span className="text-[15px] font-semibold">{t("forStores")}</span>
                      <span className="absolute -bottom-3 end-2 grid size-16 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#8fb4ff,#2f6be0)] shadow-[0_10px_20px_-6px_rgba(0,0,0,.6)]">
                        <Icon name="ShoppingCart" size={26} />
                      </span>
                    </Link>
                    <Link href="/services/digital-transformation" className="relative h-[124px] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0c3b22,#15803d)] p-3.5 transition hover:brightness-110">
                      <span className="text-[15px] font-semibold">{t("forCompanies")}</span>
                      <span className="absolute -bottom-3 end-2 grid size-16 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#86efac,#16a34a)] shadow-[0_10px_20px_-6px_rgba(0,0,0,.6)]">
                        <Icon name="Building2" size={26} />
                      </span>
                    </Link>
                  </div>
                </div>
                <div>
                  <p className="mb-2 px-1 text-[15px] font-semibold">{t("servicesColumn")}</p>
                  <ul className="grid gap-0.5">
                    {services.map((sv) => (
                      <li key={sv.slug}>
                        <Link href={`/services/${sv.slug}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-[#e6e7e8] transition hover:bg-white/5 hover:text-white">
                          <Icon name={sv.icon} size={15} className="text-graphite" />
                          {sv.title}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/nova-ai" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-[#e6e7e8] transition hover:bg-white/5 hover:text-white">
                        <Icon name="Sparkles" size={15} className="text-graphite" />
                        NOVA AI
                        <span className="rounded-full bg-iris px-2 py-0.5 text-[11px] font-semibold text-white">{t("newBadge")}</span>
                      </Link>
                    </li>
                    <li>
                      <Link href={chatbotNav.href} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-[#e6e7e8] transition hover:bg-white/5 hover:text-white">
                        <Icon name="MessagesSquare" size={15} className="text-graphite" />
                        {chatbotNav.title[lang]}
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">{chatbotNav.soon[lang]}</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="relative" onMouseEnter={() => enter("clients")} onMouseLeave={leave}>
            {trigger("clients", t("clients"))}
            <Dropdown show={open === "clients"} className="w-[320px]">
              {clientLinks.map((l) => (
                <MenuLink key={l.href} {...l} />
              ))}
            </Dropdown>
          </div>

          {plain("/careers", t("careers"))}
          {plain("/contact", t("contact"))}
          {plain("/blog", t("blog"))}
        </nav>

        <div className="ms-auto flex items-center gap-2 xl:ms-2">
          <LocaleSwitch dark={dark} className="hidden sm:inline-flex" />
          <Link
            href="/quote"
            className={`hidden whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition sm:inline-flex ${dark ? "border-white/25 hover:bg-white/10" : "border-line bg-white shadow-card hover:border-graphite"}`}
          >
            {t("quote")}
          </Link>
          <button
            type="button"
            className={`grid size-11 place-items-center rounded-xl border xl:hidden ${dark ? "border-white/20" : "border-mist"}`}
            aria-label={mobile ? t("close") : t("menu")}
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Icon name={mobile ? "X" : "Menu"} />
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <div
        className={`absolute inset-x-0 top-full z-40 h-[calc(100dvh-72px)] overflow-y-auto border-t border-mist bg-white px-4 pb-10 pt-4 text-ink transition duration-300 xl:hidden ${mobile ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible -translate-y-2 opacity-0"}`}
      >
        <MobileItem href="/" label={t("home")} />
        <MobileGroup label={t("about")} items={aboutLinks} />
        <MobileGroup
          label={t("services")}
          items={[
            ...services.map((s) => ({ href: `/services/${s.slug}`, icon: s.icon, title: s.title, desc: s.summary })),
            { href: "/services", icon: "Layers" as IconName, title: t("allServices"), desc: "" }
          ]}
        />
        <MobileGroup label={t("clients")} items={clientLinks} />
        <MobileItem href="/careers" label={t("careers")} />
        <MobileItem href="/contact" label={t("contact")} />
        <MobileItem href="/blog" label={t("blog")} />
        <div className="mt-6 grid gap-3">
          <Link href="/quote" className="btn btn-primary w-full">
            {t("quote")}
          </Link>
          <LocaleSwitch full className="flex" />
        </div>
      </div>
    </header>
  );
}

function Dropdown({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`absolute start-0 top-full pt-2 transition duration-200 ${show ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0"}`}
    >
      <div className={`grid gap-1 rounded-card border border-white/10 bg-obsidian p-2.5 text-white shadow-sm2 ${className ?? ""}`}>{children}</div>
    </div>
  );
}

type MenuItem = { href: string; icon: IconName; title: string; desc: string; badge?: string };

function MenuLink({ href, icon, title, desc, badge, light }: MenuItem & { light?: boolean }) {
  return (
    <Link href={href} className={`group flex items-start gap-3 rounded-xl p-2.5 transition ${light ? "hover:bg-cloud" : "hover:bg-white/5"}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-icon ${light ? "bg-cloud text-iris" : "bg-white/5 text-graphite group-hover:text-white"}`}>
        <Icon name={icon} size={16} />
      </span>
      <span>
        <span className={`flex items-center gap-2 text-sm font-semibold leading-snug ${light ? "text-ink" : "text-white"}`}>
          {title}
          {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${light ? "bg-lilac text-iris" : "bg-white/15 text-white"}`}>{badge}</span>}
        </span>
        {desc && <span className={`mt-0.5 block text-[12.5px] leading-normal ${light ? "text-iron" : "text-graphite"}`}>{desc}</span>}
      </span>
    </Link>
  );
}

function MobileItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block rounded-xl px-3 py-3.5 text-base font-medium hover:bg-cloud">
      {label}
    </Link>
  );
}

function MobileGroup({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-base font-medium hover:bg-cloud"
      >
        {label}
        <Icon name="ChevronDown" size={18} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-1 pb-2">
          {items.map((i) => (
            <MenuLink key={i.href + i.title} {...i} light />
          ))}
        </div>
      )}
    </div>
  );
}

const LOCALES = [
  { code: "ar", label: "عربي", name: "العربية" },
  { code: "en", label: "EN", name: "English" }
] as const;

/** Language toggle: both languages visible, the current one highlighted (segmented control). */
function LocaleSwitch({ dark, full, className }: { dark?: boolean; full?: boolean; className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <div
      role="group"
      aria-label="اللغة / Language"
      className={`items-center gap-0.5 rounded-full p-1 text-[13px] font-semibold ring-1 transition-colors ${dark ? "bg-white/10 ring-white/15" : "bg-cloud ring-mist"} ${full ? "w-full" : ""} ${className ?? ""}`}
    >
      {LOCALES.map((l) => {
        const item = `${full ? "flex-1 text-center" : ""} rounded-full px-3.5 py-1.5 leading-none transition`;
        return l.code === locale ? (
          <span key={l.code} aria-current="true" lang={l.code} className={`${item} shadow-sm ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
            {l.label}
          </span>
        ) : (
          <Link key={l.code} href={pathname} locale={l.code} lang={l.code} hrefLang={l.code} aria-label={l.name} className={`${item} ${dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-iron hover:bg-white hover:text-ink"}`}>
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
