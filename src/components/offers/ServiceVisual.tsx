import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

/**
 * A small animated scene per service for the packages & offers page — it shows what the service actually does
 * (a store receiving an order, campaigns across ad platforms, a WhatsApp bot booking, a team sprint…). No hooks, so it
 * renders from server and client components. Illustrative sample data only.
 */
type Lc = "ar" | "en";
const pick = (l: Lc, ar: string, en: string) => (l === "ar" ? ar : en);

const Chip = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink shadow-card ${className}`}>{children}</span>
);
const Float = ({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) => (
  <div className={`sv-float absolute ${className}`} style={{ animationDelay: `${delay}s` }}>
    {children}
  </div>
);
const Brand = ({ slug, className = "" }: { slug: string; className?: string }) => (
  <span className={`grid size-9 place-items-center rounded-xl bg-white shadow-card ${className}`}>
    <BrandIcon slug={slug} size={18} colored />
  </span>
);

function Web({ l }: { l: Lc }) {
  return (
    <>
      <div className="absolute inset-x-[8%] top-[10%] bottom-[8%] overflow-hidden rounded-xl border border-mist bg-white shadow-lg">
        <div className="flex items-center gap-1.5 border-b border-mist px-3 py-2" dir="ltr">
          {[0, 1, 2].map((d) => (
            <span key={d} className="size-2 rounded-full bg-line" />
          ))}
          <span className="ms-2 flex-1 truncate rounded-full bg-cloud px-2 py-0.5 text-[10px] text-graphite">yourcompany.sa</span>
        </div>
        <div className="grid gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="h-2.5 w-14 rounded-full bg-iris" />
            <span className="flex gap-1.5">
              {[0, 1, 2, 3].map((d) => (
                <span key={d} className="h-1.5 w-6 rounded-full bg-line" />
              ))}
            </span>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-iris to-iris-soft p-3 text-white">
            <b className="block text-[12px]">{pick(l, "حلول تنمّي أعمالك", "Solutions that grow your business")}</b>
            <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-iris">{pick(l, "اطلب عرض سعر", "Get a quote")}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {["Monitor", "ShieldCheck", "Rocket"].map((i) => (
              <span key={i} className="grid justify-items-center gap-1 rounded-md bg-cloud p-1.5">
                <Icon name={i as IconName} size={13} className="text-iris" />
                <span className="h-1 w-8 rounded-full bg-line" />
              </span>
            ))}
          </div>
        </div>
      </div>
      <Float className="end-[2%] top-[4%]">
        <Chip>
          <Icon name="Zap" size={12} className="text-fern" /> {pick(l, "السرعة 98", "Speed 98")}
        </Chip>
      </Float>
      <Float className="start-[2%] bottom-[14%]" delay={1.2}>
        <Chip>
          <Icon name="Search" size={12} className="text-iris" /> {pick(l, "الأول في Google", "#1 on Google")}
        </Chip>
      </Float>
      <Float className="end-[4%] bottom-[4%]" delay={0.6}>
        <Brand slug="googleanalytics" />
      </Float>
    </>
  );
}

function Store({ l }: { l: Lc }) {
  return (
    <>
      <div className="absolute start-1/2 top-[6%] bottom-[2%] w-[44%] -translate-x-1/2 overflow-hidden rounded-[22px] border-4 border-ink bg-white shadow-lg rtl:translate-x-1/2">
        <div className="grid gap-1.5 p-2.5">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-ink/80" />
          <div className="grid h-[72px] place-items-center rounded-lg bg-gradient-to-br from-[#fde68a] to-[#fca5a5]">
            <Icon name="ShoppingBag" size={28} className="text-ink/70" />
          </div>
          <b className="text-[11px]">{pick(l, "عطر العود الفاخر", "Premium oud perfume")}</b>
          <span className="flex items-center justify-between text-[11px]">
            <b className="text-iris">349 {pick(l, "ر.س", "SAR")}</b>
            <span className="text-[9px] text-graphite line-through">449</span>
          </span>
          <span className="rounded-md bg-ink py-1 text-center text-[10px] font-bold text-white">{pick(l, "أضف للسلة", "Add to cart")}</span>
        </div>
      </div>
      <Float className="end-[2%] top-[10%] sv-pop">
        <span className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] shadow-lg">
          <span className="grid size-7 place-items-center rounded-lg bg-mint text-fern">
            <Icon name="Check" size={14} />
          </span>
          <span className="grid leading-tight">
            <b>{pick(l, "طلب جديد #1024", "New order #1024")}</b>
            <span className="text-[10px] text-graphite">349 {pick(l, "ر.س · مدى", "SAR · mada")}</span>
          </span>
        </span>
      </Float>
      <Float className="start-[3%] top-[30%]" delay={0.8}>
        <span className="grid gap-1">
          <Chip>mada</Chip>
          <Chip>
            <BrandIcon slug="applepay" size={22} />
          </Chip>
          <Chip>{pick(l, "تابي · تمارا", "Tabby · Tamara")}</Chip>
        </span>
      </Float>
      <Float className="end-[2%] bottom-[8%]" delay={1.4}>
        <Chip>
          <Icon name="Package" size={12} className="text-iris" /> {pick(l, "تم الشحن", "Shipped")}
        </Chip>
      </Float>
    </>
  );
}

function Marketing({ l }: { l: Lc }) {
  const bars = [30, 42, 38, 55, 64, 78, 92];
  return (
    <>
      <div className="absolute inset-x-[10%] top-[14%] bottom-[10%] grid content-start gap-2 rounded-xl border border-mist bg-white p-3 shadow-lg">
        <div className="flex items-center justify-between text-[11px]">
          <b>{pick(l, "حملة الافتتاح", "Opening campaign")}</b>
          <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold text-fern">{pick(l, "نشطة", "Live")}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            [pick(l, "الطلبات", "Orders"), "+128"],
            [pick(l, "العائد", "ROAS"), "4.2x"],
            [pick(l, "تكلفة الطلب", "Cost/order"), pick(l, "18 ر.س", "SAR 18")]
          ].map(([k, v]) => (
            <span key={k} className="rounded-md bg-cloud px-1 py-1.5">
              <b className="block text-[12px] text-iris">{v}</b>
              <span className="text-[9px] text-graphite">{k}</span>
            </span>
          ))}
        </div>
        <div className="flex h-16 items-end gap-1.5" dir="ltr">
          {bars.map((h, i) => (
            <span key={i} className="sv-bar flex-1 rounded-t bg-gradient-to-t from-iris to-iris-soft" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      </div>
      <Float className="start-[2%] top-[4%]">
        <Brand slug="snapchat" />
      </Float>
      <Float className="end-[2%] top-[2%]" delay={0.5}>
        <Brand slug="tiktok" />
      </Float>
      <Float className="start-[0%] bottom-[6%]" delay={1}>
        <Brand slug="meta" />
      </Float>
      <Float className="end-[0%] bottom-[2%]" delay={1.5}>
        <Brand slug="instagram" />
      </Float>
    </>
  );
}

function WhatsApp({ l }: { l: Lc }) {
  return (
    <div className="absolute inset-x-[10%] top-[6%] bottom-[4%] overflow-hidden rounded-xl border border-mist bg-[#efeae2] shadow-lg">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
        <span className="grid size-7 place-items-center rounded-full bg-white/20">
          <Icon name="Bot" size={14} />
        </span>
        <span className="grid leading-tight">
          <b className="text-[11px]">{pick(l, "عيادة الابتسامة", "Smile Clinic")}</b>
          <span className="text-[9px] text-white/75">{pick(l, "يرد فوراً · 24 ساعة", "Replies instantly · 24/7")}</span>
        </span>
        <BrandIcon slug="whatsapp" size={16} className="ms-auto" />
      </div>
      <div className="grid gap-1.5 p-2.5 text-[11px]">
        <span className="sv-msg max-w-[78%] justify-self-start rounded-lg bg-white px-2.5 py-1.5 shadow-sm">{pick(l, "عندكم موعد بكرة؟", "Any slot tomorrow?")}</span>
        <span className="sv-msg max-w-[82%] justify-self-end rounded-lg bg-[#d9fdd3] px-2.5 py-1.5 shadow-sm" style={{ animationDelay: "0.6s" }}>
          {pick(l, "أكيد! اختر الوقت المناسب 👇", "Sure! Pick a time 👇")}
        </span>
        <span className="sv-msg flex justify-end gap-1" style={{ animationDelay: "1.1s" }}>
          {["4:00", "5:30", "7:00"].map((t) => (
            <span key={t} className="rounded-full border border-[#25d366] bg-white px-2 py-0.5 text-[10px] font-bold text-[#075e54]" dir="ltr">
              {t}
            </span>
          ))}
        </span>
        <span className="sv-msg max-w-[82%] justify-self-end rounded-lg bg-[#d9fdd3] px-2.5 py-1.5 shadow-sm" style={{ animationDelay: "1.6s" }}>
          ✓ {pick(l, "تم الحجز 5:30 — نذكّرك قبلها بساعة", "Booked 5:30 — we'll remind you an hour before")}
        </span>
      </div>
    </div>
  );
}

function Team({ l }: { l: Lc }) {
  const members: [IconName, string, string][] = [
    ["CodeXml", "Full-Stack", pick(l, "يبني الميزة الجديدة", "Building the new feature")],
    ["PenTool", "UI/UX", pick(l, "يصمم الشاشات", "Designing screens")],
    ["ClipboardList", pick(l, "مدير المشروع", "Project manager"), pick(l, "يتابع الأولويات", "Tracking priorities")]
  ];
  return (
    <div className="absolute inset-x-[8%] top-[8%] bottom-[6%] grid content-start gap-2 rounded-xl border border-mist bg-white p-3 shadow-lg">
      <div className="flex items-center justify-between text-[11px]">
        <b>{pick(l, "فريقك هذا الشهر", "Your team this month")}</b>
        <span className="rounded-full bg-lilac px-2 py-0.5 text-[10px] font-bold text-iris">{pick(l, "120 ساعة", "120 h")}</span>
      </div>
      {members.map(([icon, role, task], i) => (
        <div key={role} className="sv-msg flex items-center gap-2 rounded-lg bg-cloud px-2 py-1.5" style={{ animationDelay: `${i * 0.4}s` }}>
          <span className="grid size-7 place-items-center rounded-full bg-iris text-white">
            <Icon name={icon} size={13} />
          </span>
          <span className="grid leading-tight">
            <b className="text-[11px]">{role}</b>
            <span className="text-[10px] text-graphite">{task}</span>
          </span>
          <span className="ms-auto size-2 rounded-full bg-fern" />
        </div>
      ))}
      <div className="grid gap-1">
        <span className="flex justify-between text-[10px] text-graphite">
          <span>{pick(l, "إنجاز السبرنت", "Sprint progress")}</span>
          <b className="text-ink">72%</b>
        </span>
        <span className="h-2 overflow-hidden rounded-full bg-mist">
          <span className="sv-grow block h-full w-[72%] rounded-full bg-gradient-to-r from-iris to-iris-soft rtl:bg-gradient-to-l" />
        </span>
      </div>
    </div>
  );
}

function Automation({ l }: { l: Lc }) {
  const steps: [IconName, string][] = [
    ["ClipboardList", pick(l, "طلب جديد", "New request")],
    ["Sparkles", pick(l, "الذكاء الاصطناعي يصنّفه", "AI sorts it")],
    ["Users", pick(l, "يُسجَّل في نظام العملاء", "Saved to CRM")],
    ["Send", pick(l, "رد تلقائي على واتساب", "Auto-reply on WhatsApp")]
  ];
  return (
    <div className="absolute inset-x-[12%] top-[6%] bottom-[6%] grid content-center gap-1">
      {steps.map(([icon, label], i) => (
        <div key={label} className="grid justify-items-center gap-1">
          <span className="sv-msg flex w-full items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 text-[11px] font-semibold shadow-card" style={{ animationDelay: `${i * 0.45}s` }}>
            <span className="grid size-7 place-items-center rounded-lg bg-iris text-white">
              <Icon name={icon} size={13} />
            </span>
            {label}
            <Icon name="Check" size={13} className="ms-auto text-fern" />
          </span>
          {i < steps.length - 1 && <span className="h-2.5 w-0.5 rounded bg-iris/40" />}
        </div>
      ))}
    </div>
  );
}

function Design({ l }: { l: Lc }) {
  return (
    <>
      <div className="absolute inset-x-[10%] top-[10%] bottom-[10%] grid grid-cols-[1fr_1.1fr] gap-3 rounded-xl border border-mist bg-white p-3 shadow-lg">
        <div className="grid content-center justify-items-center gap-2 rounded-lg bg-cloud">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-iris to-[#f59e0b] text-xl font-black text-white shadow">D</span>
          <span className="text-[10px] font-bold">{pick(l, "شعارك", "Your logo")}</span>
        </div>
        <div className="grid content-center gap-2">
          <span className="flex gap-1.5">
            {["#624de3", "#a855f7", "#f59e0b", "#111827"].map((c) => (
              <span key={c} className="size-6 rounded-md shadow-sm" style={{ background: c }} />
            ))}
          </span>
          <b className="text-[18px] leading-none">Aa</b>
          <span className="text-[10px] text-graphite">{pick(l, "الألوان والخطوط", "Colours & fonts")}</span>
          <span className="grid grid-cols-2 gap-1">
            {[0, 1].map((d) => (
              <span key={d} className="h-8 rounded-md bg-gradient-to-br from-lilac to-white ring-1 ring-mist" />
            ))}
          </span>
        </div>
      </div>
      <Float className="end-[2%] top-[2%]">
        <Chip>
          <Icon name="Palette" size={12} className="text-iris" /> {pick(l, "هوية متكاملة", "Full identity")}
        </Chip>
      </Float>
      <Float className="start-[2%] bottom-[2%]" delay={1}>
        <Chip>
          <Icon name="Smartphone" size={12} className="text-iris" /> {pick(l, "واجهات التطبيق", "App screens")}
        </Chip>
      </Float>
    </>
  );
}

const scenes: Record<string, (p: { l: Lc }) => ReactNode> = {
  "web-development": Web,
  ecommerce: Store,
  "digital-marketing": Marketing,
  "whatsapp-automation": WhatsApp,
  "dedicated-tech-team": Team,
  "ai-automation": Automation,
  "ux-ui-design": Design
};

export function ServiceVisual({ service, locale, className = "" }: { service: string; locale: string; className?: string }) {
  const Scene = scenes[service] ?? Web;
  const l: Lc = locale === "ar" ? "ar" : "en";
  return (
    <div aria-hidden className={`sv relative overflow-hidden rounded-2xl bg-gradient-to-br from-lilac via-white to-cloud ${className}`} dir={l === "ar" ? "rtl" : "ltr"}>
      <span className="absolute -end-10 -top-10 size-40 rounded-full bg-iris/10 blur-2xl" />
      <Scene l={l} />
    </div>
  );
}
