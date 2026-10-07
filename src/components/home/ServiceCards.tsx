import { Link } from "@/i18n/navigation";
import type { ServiceView } from "@/lib/content";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

/**
 * Services grid shown before "next level". Every card carries a small looping
 * automation scene (pure CSS keyframes — see globals.css) that shows the service at work.
 */

const L = (locale: string, ar: string, en: string) => (locale === "ar" ? ar : en);

function Visual({ slug, locale }: { slug: string; locale: string }) {
  switch (slug) {
    case "ai-automation":
      // an AI assistant answering a business question with live numbers
      return (
        <div className="grid w-full max-w-[250px] gap-1.5 rounded-xl border border-mist bg-white p-2.5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
              <span className="grid size-5 place-items-center rounded-md bg-[#efecff] text-iris animate-pulse-glow">
                <Icon name="Sparkles" size={12} />
              </span>
              {L(locale, "المساعد الذكي", "AI assistant")}
            </span>
            <span className="rounded-full bg-lilac px-2 py-0.5 text-[10px] font-bold text-iris">AI</span>
          </div>
          <span className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-sm bg-cloud px-2.5 py-1 text-[10.5px] text-ink">{L(locale, "كم مبيعات هذا الأسبوع؟", "How are sales this week?")}</span>
          <div className="flex items-end justify-between gap-3 rounded-lg border border-mist p-2">
            <span className="grid gap-0.5">
              <span className="text-[10px] text-iron">{L(locale, "مبيعات الأسبوع", "Weekly sales")}</span>
              <span className="text-[12.5px] font-bold text-ink" dir="ltr">
                SAR 84,200
              </span>
              <span className="text-[10.5px] font-semibold text-fern">▲ 12%</span>
            </span>
            <span className="flex h-11 w-[92px] shrink-0 items-end gap-[3px]" dir="ltr" aria-hidden>
              {[38, 52, 46, 64, 58, 80, 100].map((h, k) => (
                <span key={k} className="flex-1 origin-bottom rounded-t-[3px] bg-gradient-to-t from-iris to-[#a78bfa] animate-[barGrow_3.5s_ease_infinite]" style={{ height: `${h}%`, animationDelay: `${k * 0.12}s` }} />
              ))}
            </span>
          </div>
        </div>
      );
    case "whatsapp-automation":
      // a WhatsApp chat answered by the bot, with quick-reply buttons
      return (
        <div className="grid w-full max-w-[250px] gap-2 rounded-xl border border-mist bg-white p-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
              <span className="grid size-5 place-items-center rounded-full bg-[#25d366] text-white">
                <BrandIcon slug="whatsapp" size={11} />
              </span>
              DMS Bot
            </span>
            <span className="flex items-center gap-1 rounded-full bg-[#e7f8ee] px-2 py-0.5 text-[10px] font-semibold text-fern">
              <i className="size-1.5 rounded-full bg-fern" /> {L(locale, "يرد تلقائياً", "Auto-reply")}
            </span>
          </div>
          <div className="grid gap-1.5 rounded-lg bg-[#efeae2] p-2">
            <span className="w-fit max-w-[85%] rounded-xl rounded-es-sm bg-white px-2.5 py-1 text-[10.5px] text-ink shadow-sm">{L(locale, "أبغى عرض سعر لمتجر", "I need a quote for a store")}</span>
            <span className="ms-auto w-fit max-w-[85%] rounded-xl rounded-ee-sm bg-[#d9fdd3] px-2.5 py-1 text-[10.5px] text-ink shadow-sm animate-[softPulse_4.5s_ease_infinite] [animation-delay:.4s]">{L(locale, "أكيد! اختر الباقة 👇", "Sure! Pick a plan 👇")}</span>
            <span className="ms-auto flex gap-1">
              {[L(locale, "أساسية", "Basic"), L(locale, "احترافية", "Pro")].map((b, k) => (
                <span key={b} className="rounded-full border border-[#25d366]/40 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#128c7e] animate-[softPulse_4.5s_ease_infinite]" style={{ animationDelay: `${0.9 + k * 0.2}s` }}>
                  {b}
                </span>
              ))}
            </span>
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
              <span className="mt-1 h-5 w-16 rounded-full bg-ink animate-[softPulse_4s_ease-in-out_infinite]" />
            </div>
            <span className="absolute end-2 top-7 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#16a34a]">SEO 98</span>
          </div>
          <div className="absolute -top-3 end-0 h-[112px] w-[60px] overflow-hidden rounded-[14px] border-[3px] border-ink bg-white shadow-card">
            <span className="absolute start-1/2 top-1 h-1 w-5 -translate-x-1/2 rounded-full bg-ink rtl:translate-x-1/2" />
            <div className="grid gap-1 px-1 pt-3.5 animate-[listScroll_5s_ease-in-out_infinite]">
              {["#624de3", "#8a7bef", "#b4abf5", "#8a7bef", "#624de3"].map((c, k) => (
                <div key={k} className="flex items-center gap-1 rounded bg-cloud p-0.5">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c }} />
                  <span className="h-1 flex-1 rounded-full bg-line" />
                </div>
              ))}
            </div>
            <span className="absolute bottom-1 end-1 grid size-4 place-items-center rounded-full bg-iris text-white animate-[softPulse_2.5s_ease_infinite]">
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
                ["PencilRuler", "bg-[#efecff] text-iris", L(locale, "تصميم", "Design")],
                ["Monitor", "bg-[#efecff] text-iris", L(locale, "واجهات", "Front")],
                ["Server", "bg-[#efecff] text-iris", L(locale, "أنظمة", "Back")],
                ["SearchCheck", "bg-[#efecff] text-iris", L(locale, "جودة", "QA")]
              ] as [IconName, string, string][]
            ).map(([icon, tint, label], k) => (
              <span key={label} className="grid justify-items-center gap-1">
                <span className={`grid size-8 place-items-center rounded-lg animate-[softPulse_5s_ease_infinite] ${tint}`} style={{ animationDelay: `${k * 0.35}s` }}>
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
              <span className="block h-full w-[72%] origin-left rounded-full bg-gradient-to-r from-iris to-[#8d4af7] animate-[stepFill_5s_ease_infinite] rtl:origin-right rtl:bg-gradient-to-l" />
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
                <span className="absolute -end-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-iris text-[8px] text-white animate-[softPulse_3s_ease_infinite]">3</span>
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
      // the company's systems connected through one hub, in sync
      return (
        <div className="grid w-full max-w-[250px] gap-2.5 rounded-xl border border-mist bg-white p-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-ink">{L(locale, "ربط الأنظمة", "Connected systems")}</span>
            <span className="flex items-center gap-1 rounded-full bg-[#e7f8ee] px-2 py-0.5 text-[10px] font-semibold text-fern">
              <Icon name="Check" size={10} strokeWidth={3} /> {L(locale, "متزامن", "In sync")}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5" dir="ltr">
            {(
              [
                [
                  ["Users", "CRM", "bg-[#efecff] text-iris"],
                  ["Package", "ERP", "bg-[#efecff] text-iris"]
                ],
                [
                  ["Cable", "API", "bg-[#efecff] text-iris"],
                  ["ChartColumn", "BI", "bg-[#efecff] text-iris"]
                ]
              ] as [IconName, string, string][][]
            ).map((side, i) => (
              <div key={i} className={`grid gap-1.5 ${i === 1 ? "order-3" : ""}`}>
                {side.map(([icon, label, tint], k) => (
                  <span key={label} className="flex items-center gap-1.5 rounded-lg border border-mist px-1.5 py-1">
                    <span className={`grid size-5 place-items-center rounded-md animate-[softPulse_4s_ease_infinite] ${tint}`} style={{ animationDelay: `${(i * 2 + k) * 0.4}s` }}>
                      <Icon name={icon} size={11} />
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-ink">{label}</span>
                  </span>
                ))}
              </div>
            ))}
            <span className="order-2 grid size-11 place-items-center rounded-xl bg-iris text-white shadow-[0_0_0_4px_#efecff] animate-pulse-glow">
              <Icon name="Network" size={20} />
            </span>
          </div>
          <span className="text-center text-[10px] text-iron">{L(locale, "بيانات واحدة لكل الفرق", "One source of truth for every team")}</span>
        </div>
      );
    case "ux-ui-design":
      // a design tool: the screen being designed + its style panel
      return (
        <div className="grid w-full max-w-[250px] gap-2 rounded-xl border border-mist bg-white p-2.5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
              <span className="grid size-5 place-items-center rounded-md bg-[#efecff] text-iris">
                <Icon name="PencilRuler" size={11} />
              </span>
              {L(locale, "استوديو التصميم", "Design studio")}
            </span>
            <span className="rounded-full bg-lilac px-2 py-0.5 text-[10px] font-bold text-iris">UX / UI</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2" dir="ltr">
            {/* the screen */}
            <div className="grid content-start gap-1.5 rounded-lg bg-cloud p-2">
              <span className="h-1.5 w-2/3 rounded-full bg-ink/80" />
              <span className="h-1.5 w-1/2 rounded-full bg-line" />
              <span className="relative mt-1 grid h-6 w-[72%] place-items-center rounded-md bg-iris text-[9px] font-semibold text-white ring-2 ring-[#8d4af7] ring-offset-2 ring-offset-cloud animate-[softPulse_5s_ease_infinite]">
                {L(locale, "ابدأ الآن", "Get started")}
                {["-start-1 -top-1", "-end-1 -top-1", "-start-1 -bottom-1", "-end-1 -bottom-1"].map((pos) => (
                  <i key={pos} className={`absolute size-1.5 rounded-[2px] border border-[#8d4af7] bg-white ${pos}`} />
                ))}
              </span>
              <span className="w-fit rounded bg-[#8d4af7] px-1 font-mono text-[8.5px] text-white">120 × 32</span>
            </div>
            {/* the style panel */}
            <div className="grid w-[64px] content-start gap-1.5 rounded-lg border border-mist p-1.5">
              <span className="text-center text-[15px] font-bold leading-none text-ink">Aa</span>
              <span className="grid grid-cols-3 gap-1">
                {["#4b37c9", "#624de3", "#8a7bef", "#b4abf5", "#1a1d1e", "#6b7075"].map((c, k) => (
                  <span key={c} className="aspect-square rounded-full animate-[softPulse_5s_ease_infinite]" style={{ background: c, animationDelay: `${0.6 + k * 0.15}s` }} />
                ))}
              </span>
              <span className="mx-auto flex h-3 w-6 items-center rounded-full bg-iris p-[2px]">
                <span className="ms-auto size-2 rounded-full bg-white" />
              </span>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function ServiceCards({ services, locale, cta }: { services: ServiceView[]; locale: string; cta: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {services.map((s) => (
        <Link
          key={s.slug}
          href={`/services/${s.slug}`}
          className="group flex flex-col overflow-hidden rounded-card border border-mist bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:border-line hover:shadow-lg"
        >
          <div className="relative grid h-[118px] place-items-center overflow-hidden border-b border-mist bg-cloud px-2 sm:h-[170px] sm:px-5">
            <div
              aria-hidden
              className="absolute inset-0 opacity-60 [background-image:radial-gradient(#d9dbde_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]"
            />
            {/* two cards per row on phones: the visual is zoomed down (zoom also shrinks its layout box, unlike scale) */}
            <div className="relative flex w-full justify-center max-sm:[zoom:0.6]">
              <Visual slug={s.slug} locale={locale} />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3.5 sm:gap-2.5 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-icon sm:size-8 bg-lilac text-iris transition group-hover:bg-iris group-hover:text-white">
                <Icon name={s.icon as IconName} size={16} />
              </span>
              <span className="line-clamp-1 text-[11px] font-medium text-graphite sm:text-xs">{s.eyebrow}</span>
            </div>
            <h3 className="text-[14.5px] font-semibold leading-snug tracking-[-0.3px] text-ink sm:text-[17px]">{s.title}</h3>
            <p className="line-clamp-3 text-[12.5px] leading-relaxed text-iron sm:line-clamp-none sm:text-sm">{s.summary}</p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-iris sm:pt-2 sm:text-sm">
              {cta}
              <Icon name={locale === "ar" ? "ArrowLeft" : "ArrowRight"} size={15} className="transition group-hover:translate-x-[-3px] ltr:group-hover:translate-x-[3px]" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
