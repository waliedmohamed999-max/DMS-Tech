import { Link } from "@/i18n/navigation";
import type { ServiceView } from "@/lib/content";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

/**
 * Services grid shown before "next level". Every card carries a small looping
 * automation scene (pure CSS keyframes — see globals.css) that shows the service at work.
 */

const L = (locale: string, ar: string, en: string) => (locale === "ar" ? ar : en);

function Bubble({ children, me, delay }: { children: React.ReactNode; me?: boolean; delay: number }) {
  return (
    <span
      className={`block w-fit max-w-[85%] rounded-2xl px-3 py-1.5 text-[11.5px] leading-snug animate-[chatLoop_6s_ease_infinite_both] ${
        me ? "ms-auto rounded-ee-sm bg-ink text-white" : "rounded-es-sm border border-mist bg-white text-ink"
      }`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </span>
  );
}

function Typing({ delay }: { delay: number }) {
  return (
    <span className="flex w-fit gap-1 rounded-2xl rounded-es-sm border border-mist bg-white px-3 py-2 animate-[typingLoop_6s_ease_infinite_both]" style={{ animationDelay: `${delay}s` }}>
      {[0, 1, 2].map((k) => (
        <i key={k} className="size-1.5 rounded-full bg-graphite animate-[dotBounce_1s_ease-in-out_infinite]" style={{ animationDelay: `${k * 0.15}s` }} />
      ))}
    </span>
  );
}

function Visual({ slug, locale }: { slug: string; locale: string }) {
  switch (slug) {
    case "ai-automation":
      return (
        <div className="grid w-full max-w-[240px] content-end gap-1.5">
          <Bubble delay={0}>{L(locale, "كم مبيعات هذا الأسبوع؟", "Sales this week?")}</Bubble>
          <div className="grid [&>*]:[grid-area:1/1]">
            <Typing delay={0.4} />
            <Bubble me delay={1.2}>
            <span className="inline-flex items-center gap-1">
              <Icon name="Sparkles" size={11} className="text-iris-light" /> {L(locale, "المبيعات:", "Sales:")}{" "}
              <b dir="ltr" className="font-semibold">SAR 84,200 <span className="text-[#4ade80]">▲12%</span></b>
            </span>
            </Bubble>
          </div>
        </div>
      );
    case "whatsapp-automation":
      return (
        <div className="grid w-full max-w-[240px] gap-1.5">
          <div className="flex items-center gap-2 border-b border-mist pb-1.5">
            <span className="grid size-6 place-items-center rounded-full bg-[#25d366] text-white">
              <BrandIcon slug="whatsapp" size={13} />
            </span>
            <span className="text-[11px] font-semibold text-ink">DMS Bot</span>
            <span className="ms-auto size-1.5 rounded-full bg-[#25d366] animate-pulse-glow" />
          </div>
          <Bubble delay={0}>{L(locale, "أبغى عرض سعر لمتجر", "I need a store quote")}</Bubble>
          <Bubble me delay={0.8}>{L(locale, "أكيد! اختر الباقة 👇", "Sure! Pick a plan 👇")}</Bubble>
          <div className="flex justify-end gap-1 animate-[chatLoop_6s_ease_infinite_both] [animation-delay:1.6s] [animation-fill-mode:both]">
            {[L(locale, "أساسية", "Basic"), L(locale, "احترافية", "Pro")].map((b) => (
              <span key={b} className="rounded-full border border-iris/30 bg-lilac px-2 py-0.5 text-[10.5px] font-medium text-iris">
                {b}
              </span>
            ))}
          </div>
        </div>
      );
    case "web-development":
      // websites + apps: a browser with a phone beside it
      return (
        <div className="relative w-full max-w-[250px] pe-12">
          <div className="relative overflow-hidden rounded-lg border border-mist bg-white">
            <div className="flex gap-1 border-b border-mist px-2 py-1.5" dir="ltr">
              {[0, 1, 2].map((k) => (
                <i key={k} className="size-1.5 rounded-full bg-line" />
              ))}
            </div>
            <div className="grid gap-1.5 p-2.5">
              <span className="h-2 w-3/4 rounded-full bg-[linear-gradient(90deg,#ebedef_25%,#f6f7f9_50%,#ebedef_75%)] bg-[length:200%_100%] animate-[shimmer_1.8s_linear_infinite]" />
              <span className="h-2 w-1/2 rounded-full bg-[linear-gradient(90deg,#ebedef_25%,#f6f7f9_50%,#ebedef_75%)] bg-[length:200%_100%] animate-[shimmer_1.8s_linear_infinite]" />
              <span className="mt-1 h-5 w-16 rounded-full bg-ink animate-[ctaPress_4s_ease_infinite]" />
            </div>
            <span className="absolute end-2 top-7 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#16a34a]">SEO 98</span>
          </div>
          <div className="absolute -top-3 end-0 h-[112px] w-[60px] overflow-hidden rounded-[14px] border-[3px] border-ink bg-white shadow-card">
            <span className="absolute start-1/2 top-1 h-1 w-5 -translate-x-1/2 rounded-full bg-ink rtl:translate-x-1/2" />
            <div className="grid gap-1 px-1 pt-3.5 animate-[listScroll_5s_ease-in-out_infinite]">
              {["#624de3", "#1d58c0", "#009639", "#f97316", "#624de3"].map((c, k) => (
                <div key={k} className="flex items-center gap-1 rounded bg-cloud p-0.5">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c }} />
                  <span className="h-1 flex-1 rounded-full bg-line" />
                </div>
              ))}
            </div>
            <span className="absolute bottom-1 end-1 grid size-4 place-items-center rounded-full bg-iris text-white animate-[pop_2.5s_ease_infinite]">
              <Icon name="Check" size={9} strokeWidth={3} />
            </span>
          </div>
        </div>
      );
    case "dedicated-tech-team":
      // the team: one tile per specialist, plus the sprint in progress
      return (
        <div className="grid w-full max-w-[250px] gap-2.5 rounded-xl border border-mist bg-white p-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-ink">{L(locale, "فريقك التقني", "Your tech team")}</span>
            <span className="flex items-center gap-1 rounded-full bg-[#e7f8ee] px-2 py-0.5 text-[10px] font-semibold text-fern">
              <i className="size-1.5 rounded-full bg-fern animate-pulse-glow" /> {L(locale, "متاح", "Online")}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                ["ClipboardList", "bg-[#efecff] text-iris", L(locale, "إدارة", "PM")],
                ["PenTool", "bg-[#fdeaf4] text-[#c0267a]", L(locale, "تصميم", "Design")],
                ["Monitor", "bg-[#e7f0fd] text-[#1d58c0]", L(locale, "واجهات", "Front")],
                ["Server", "bg-[#fff1e6] text-[#ea580c]", L(locale, "أنظمة", "Back")],
                ["SearchCheck", "bg-[#e7f8ee] text-fern", L(locale, "جودة", "QA")]
              ] as [IconName, string, string][]
            ).map(([icon, tint, label]) => (
              <span key={label} className="grid justify-items-center gap-1">
                <span className={`grid size-8 place-items-center rounded-lg ${tint}`}>
                  <Icon name={icon} size={15} />
                </span>
                <span className="text-[9.5px] font-medium text-iron">{label}</span>
              </span>
            ))}
          </div>
          <div className="grid gap-1">
            <span className="flex justify-between text-[10px] text-iron">
              <span>{L(locale, "خطة هذا الشهر", "This month's plan")}</span>
              <span className="font-semibold text-ink">72%</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-cloud">
              <span className="block h-full w-[72%] rounded-full bg-gradient-to-r from-iris to-[#8d4af7] rtl:bg-gradient-to-l" />
            </span>
          </div>
        </div>
      );
    case "ecommerce":
      return (
        <div className="grid w-full max-w-[240px] gap-2">
          <div className="flex items-center justify-between rounded-lg border border-mist bg-white px-2.5 py-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold text-ink">
              <span className="relative">
                <Icon name="ShoppingCart" size={16} />
                <span className="absolute -end-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-iris text-[8px] text-white animate-[pop_3s_ease_infinite]">3</span>
              </span>
              {L(locale, "طلب جديد #1284", "New order #1284")}
            </span>
            <span className="text-[11px] font-bold text-ink" dir="ltr">
              SAR 649
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center text-[9.5px] font-medium text-iron">
            {[L(locale, "مدفوع", "Paid"), L(locale, "قيد الشحن", "Shipping"), L(locale, "تم التسليم", "Delivered")].map((st, k) => (
              <span key={st} className="grid gap-1">
                <span className="h-1 overflow-hidden rounded-full bg-mist">
                  <span className="block h-full origin-left bg-iris animate-[stepFill_4.5s_ease_infinite] rtl:origin-right" style={{ animationDelay: `${k * 0.9}s` }} />
                </span>
                {st}
              </span>
            ))}
          </div>
        </div>
      );
    case "digital-marketing":
      return (
        <div className="grid w-full max-w-[240px] gap-1.5">
          <div className="flex items-baseline justify-between text-[11px] text-iron">
            <span>{L(locale, "الوصول", "Reach")}</span>
            <strong className="text-sm text-ink" dir="ltr">
              +248%
            </strong>
          </div>
          <div className="flex h-[70px] items-end gap-1.5" dir="ltr">
            {[30, 45, 38, 60, 52, 78, 95].map((h, k) => (
              <span
                key={k}
                className={`flex-1 origin-bottom rounded-t-[3px] animate-[barGrow_3.5s_ease_infinite] ${k === 6 ? "bg-iris" : "bg-iris/25"}`}
                style={{ height: `${Math.round(h * 0.7)}px`, animationDelay: `${k * 0.08}s` }}
              />
            ))}
          </div>
          <div className="flex gap-1.5" dir="ltr">
            {["instagram", "tiktok", "snapchat", "googleads"].map((b) => (
              <span key={b} className="grid size-5 place-items-center rounded-full bg-white shadow-card">
                <BrandIcon slug={b} size={11} colored />
              </span>
            ))}
          </div>
        </div>
      );
    case "digital-transformation":
      return (
        <svg viewBox="0 0 240 110" className="w-full max-w-[240px]" aria-hidden>
          {[
            [40, 25], [40, 85], [200, 25], [200, 85]
          ].map(([x, y], k) => (
            <g key={k}>
              <path d={`M120 55 L${x} ${y}`} stroke="#ebedef" strokeWidth="2" />
              <path d={`M120 55 L${x} ${y}`} stroke="#624de3" strokeWidth="2.5" strokeDasharray="6 90" strokeLinecap="round" className="animate-[flow_2s_linear_infinite]" style={{ animationDelay: `${k * 0.5}s` }} />
            </g>
          ))}
          {[
            [40, 25, "CRM"], [40, 85, "ERP"], [200, 25, "API"], [200, 85, "BI"]
          ].map(([x, y, t]) => (
            <g key={t as string}>
              <rect x={(x as number) - 22} y={(y as number) - 12} width="44" height="24" rx="6" fill="#fff" stroke="#ebedef" />
              <text x={x} y={(y as number) + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#1a1d1e" fontFamily="var(--font-fira), monospace">
                {t}
              </text>
            </g>
          ))}
          <rect x="100" y="35" width="40" height="40" rx="10" fill="#624de3" className="animate-pulse-glow" />
          <path d="M113 55 h14 M120 48 v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "ux-ui-design":
      return (
        <div dir="ltr" className="relative h-[110px] w-full max-w-[240px] rounded-lg border border-dashed border-line bg-white">
          <span className="absolute left-3 top-3 h-12 w-20 rounded-md border-2 border-iris bg-lilac animate-[snap_4s_ease_infinite]">
            <i className="absolute -right-1 -top-1 size-2 rounded-sm border border-iris bg-white" />
            <i className="absolute -bottom-1 -left-1 size-2 rounded-sm border border-iris bg-white" />
          </span>
          <span className="absolute right-3 top-3 grid gap-1">
            <span className="h-2 w-16 rounded-full bg-ink" />
            <span className="h-1.5 w-12 rounded-full bg-line" />
            <span className="h-1.5 w-14 rounded-full bg-line" />
          </span>
          <div className="absolute bottom-2.5 right-3 flex gap-1">
            {["#624de3", "#8d4af7", "#1d58c0", "#009639", "#1a1d1e"].map((c, k) => (
              <span key={c} className="size-4 rounded-full ring-2 ring-white animate-[pop_4s_ease_infinite]" style={{ background: c, animationDelay: `${k * 0.2}s` }} />
            ))}
          </div>
          <span className="absolute bottom-2.5 left-3 rounded bg-ink px-1.5 py-0.5 font-mono text-[9px] text-white">Auto Layout</span>
        </div>
      );
    default:
      return null;
  }
}

export default function ServiceCards({ services, locale, cta }: { services: ServiceView[]; locale: string; cta: string }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {services.map((s) => (
        <Link
          key={s.slug}
          href={`/services/${s.slug}`}
          className="group flex flex-col overflow-hidden rounded-card border border-mist bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:border-line hover:shadow-lg"
        >
          <div className="relative grid h-[170px] place-items-center overflow-hidden border-b border-mist bg-cloud px-5">
            <div
              aria-hidden
              className="absolute inset-0 opacity-60 [background-image:radial-gradient(#d9dbde_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]"
            />
            <div className="relative flex w-full justify-center">
              <Visual slug={s.slug} locale={locale} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-icon bg-lilac text-iris transition group-hover:bg-iris group-hover:text-white">
                <Icon name={s.icon as IconName} size={16} />
              </span>
              <span className="text-xs font-medium text-graphite">{s.eyebrow}</span>
            </div>
            <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.3px] text-ink">{s.title}</h3>
            <p className="text-sm leading-relaxed text-iron">{s.summary}</p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-iris">
              {cta}
              <Icon name={locale === "ar" ? "ArrowLeft" : "ArrowRight"} size={15} className="transition group-hover:translate-x-[-3px] ltr:group-hover:translate-x-[3px]" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
