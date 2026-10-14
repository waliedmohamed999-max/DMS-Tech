import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";
import { services } from "./services";

/**
 * Packages, limited-time offers and private deals (/offers, /offers/[slug], /offers/deal/[token]).
 *
 * PRICES: `price` is null until the company sets one — the page then says "request a quote" instead of a number.
 * Never put a price here that the company has not approved.
 * OFFERS / DEALS: shown only between startsAt and endsAt / until expiresAt. Entries with `preview: true` are design
 * examples rendered in development only — they never appear on the live site.
 * Every package, offer and deal has a stable `key`; the website form sends it and the server resolves it here (see
 * offerLabel), so the CRM lead and the e-mail show exactly what the client asked for.
 */

export type Tier = { key: string; icon: IconName; name: L; tagline: L; price: number | null; period: L | null; featured?: boolean; features: L[] };
export type PackageGroup = { service: string; icon: IconName; title: L; text: L; tiers: Tier[] };
export type Offer = { slug: string; service: string; icon: IconName; badge: L; title: L; text: L; features: L[]; startsAt: string; endsAt: string; price: number | null; oldPrice: number | null; preview?: boolean };
export type Deal = { token: string; client: L; title: L; text: L; items: { label: L; price: number | null }[]; total: number | null; expiresAt: string; preview?: boolean };

const perMonth: L = { ar: "شهرياً", en: "per month" };
const team = services.find((s) => s.slug === "dedicated-tech-team");

export const packageGroups: PackageGroup[] = [
  {
    service: "web-development",
    icon: "CodeXml",
    title: { ar: "باقات المواقع والتطبيقات", en: "Website & app packages" },
    text: { ar: "من موقع تعريفي أنيق إلى نظام أو تطبيق متكامل.", en: "From an elegant company site to a complete system or app." },
    tiers: [
      {
        key: "web-starter",
        icon: "Monitor",
        name: { ar: "الأساسية", en: "Starter" },
        tagline: { ar: "حضور رقمي احترافي لشركتك", en: "A professional online presence" },
        price: null,
        period: null,
        features: [
          { ar: "موقع تعريفي حتى 5 صفحات", en: "Company website, up to 5 pages" },
          { ar: "تصميم متجاوب مع الجوال", en: "Mobile-responsive design" },
          { ar: "نموذج تواصل وزر واتساب", en: "Contact form and WhatsApp button" },
          { ar: "تهيئة أساسية لمحركات البحث", en: "Basic search engine setup" },
          { ar: "شهادة أمان SSL", en: "SSL certificate" }
        ]
      },
      {
        key: "web-growth",
        icon: "Rocket",
        name: { ar: "الاحترافية", en: "Professional" },
        tagline: { ar: "موقع يجلب العملاء ويُدار بسهولة", en: "A site that brings clients and is easy to run" },
        price: null,
        period: null,
        featured: true,
        features: [
          { ar: "حتى 15 صفحة بالعربية والإنجليزية", en: "Up to 15 pages in Arabic and English" },
          { ar: "لوحة تحكم لتعديل المحتوى", en: "Content management panel" },
          { ar: "مدونة وصفحات هبوط للحملات", en: "Blog and campaign landing pages" },
          { ar: "تحسين السرعة ومحركات البحث", en: "Speed and SEO optimisation" },
          { ar: "ربط أدوات التحليل والتتبع", en: "Analytics and tracking set up" },
          { ar: "دعم فني 3 أشهر", en: "3 months of support" }
        ]
      },
      {
        key: "web-pro",
        icon: "Layers",
        name: { ar: "المتقدمة", en: "Advanced" },
        tagline: { ar: "نظام أو تطبيق مصمم على مقاس عملك", en: "A system or app built around your business" },
        price: null,
        period: null,
        features: [
          { ar: "تطبيق ويب أو نظام إدارة مخصص", en: "Custom web app or management system" },
          { ar: "تطبيق جوال iOS و Android عند الحاجة", en: "iOS and Android app when needed" },
          { ar: "تكاملات مع أنظمتك عبر API", en: "API integrations with your systems" },
          { ar: "صلاحيات ولوحات تحكم للفرق", en: "Roles and dashboards for your teams" },
          { ar: "دعم وصيانة 6 أشهر", en: "6 months of support and maintenance" }
        ]
      }
    ]
  },
  {
    service: "ecommerce",
    icon: "ShoppingCart",
    title: { ar: "باقات المتاجر الإلكترونية", en: "Online store packages" },
    text: { ar: "متجر جاهز للبيع من اليوم الأول على زد أو سلة أو شوبيفاي.", en: "A store ready to sell from day one on Zid, Salla or Shopify." },
    tiers: [
      {
        key: "store-launch",
        icon: "ShoppingBag",
        name: { ar: "الانطلاق", en: "Launch" },
        tagline: { ar: "ابدأ البيع أونلاين بسرعة", en: "Start selling online fast" },
        price: null,
        period: null,
        features: [
          { ar: "إعداد المتجر على زد أو سلة", en: "Store set up on Zid or Salla" },
          { ar: "رفع وتنظيم المنتجات الأولى", en: "Your first products uploaded and organised" },
          { ar: "ربط الدفع الإلكتروني والشحن", en: "Online payments and shipping connected" },
          { ar: "تصميم بهوية علامتك", en: "Design in your brand identity" }
        ]
      },
      {
        key: "store-growth",
        icon: "TrendingUp",
        name: { ar: "النمو", en: "Growth" },
        tagline: { ar: "متجر يبيع أكثر ويُدار بسهولة", en: "A store that sells more and runs smoothly" },
        price: null,
        period: null,
        featured: true,
        features: [
          { ar: "تصميم مخصص لصفحات المتجر", en: "Custom store page design" },
          { ar: "تحسين صفحات المنتجات لرفع المبيعات", en: "Product pages optimised to convert" },
          { ar: "إشعارات الطلبات عبر واتساب", en: "Order notifications on WhatsApp" },
          { ar: "أدوات التتبع لحملاتك الإعلانية", en: "Tracking for your ad campaigns" },
          { ar: "تدريب فريقك على إدارة المتجر", en: "Training for your team" }
        ]
      },
      {
        key: "store-scale",
        icon: "Building2",
        name: { ar: "التوسع", en: "Scale" },
        tagline: { ar: "للعلامات الكبيرة والمبيعات العالية", en: "For larger brands and high volumes" },
        price: null,
        period: null,
        features: [
          { ar: "متجر مخصص أو على شوبيفاي", en: "Custom or Shopify store" },
          { ar: "ربط مع أنظمة المخزون والمحاسبة", en: "Inventory and accounting integration" },
          { ar: "استرداد السلات المتروكة تلقائياً", en: "Automatic abandoned-cart recovery" },
          { ar: "تقارير مبيعات ودعم بأولوية", en: "Sales reports and priority support" }
        ]
      }
    ]
  },
  {
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    title: { ar: "باقات حلول واتساب", en: "WhatsApp solution packages" },
    text: { ar: "رد أسرع ومبيعات أكثر على القناة التي يفضلها عملاؤك.", en: "Faster replies and more sales on your clients' favourite channel." },
    tiers: [
      {
        key: "wa-basic",
        icon: "MessageSquareMore",
        name: { ar: "الأساسية", en: "Basic" },
        tagline: { ar: "لا تفوّت أي رسالة", en: "Never miss a message" },
        price: null,
        period: null,
        features: [
          { ar: "ربط رقمك بواتساب للأعمال الرسمي", en: "Your number on the official WhatsApp Business Platform" },
          { ar: "رسالة ترحيب ورد آلي", en: "Welcome message and auto-reply" },
          { ar: "ردود سريعة للأسئلة المتكررة", en: "Quick replies for frequent questions" }
        ]
      },
      {
        key: "wa-pro",
        icon: "Bot",
        name: { ar: "الاحترافية", en: "Professional" },
        tagline: { ar: "بوت يؤهل العملاء ويحوّلهم لفريقك", en: "A bot that qualifies leads and hands them to your team" },
        price: null,
        period: null,
        featured: true,
        features: [
          { ar: "شات بوت بتدفقات مصممة لنشاطك", en: "Chatbot flows designed for your business" },
          { ar: "تأهيل العملاء وتحويلهم للموظف المناسب", en: "Lead qualification and hand-over to the right person" },
          { ar: "قوالب رسائل معتمدة من Meta", en: "Meta-approved message templates" },
          { ar: "صندوق محادثات مشترك لفريقك", en: "Shared inbox for your team" }
        ]
      },
      {
        key: "wa-advanced",
        icon: "Megaphone",
        name: { ar: "المتقدمة", en: "Advanced" },
        tagline: { ar: "حملات وأتمتة كاملة مرتبطة بأنظمتك", en: "Campaigns and full automation linked to your systems" },
        price: null,
        period: null,
        features: [
          { ar: "حملات تسويقية بشرائح العملاء", en: "Marketing campaigns by customer segment" },
          { ar: "ربط مع نظام العملاء والمتجر", en: "CRM and store integration" },
          { ar: "تقارير أداء المحادثات والحملات", en: "Conversation and campaign reports" },
          { ar: "دعم فني بأولوية", en: "Priority support" }
        ]
      }
    ]
  },
  ...(team?.plans
    ? [
        {
          service: "dedicated-tech-team",
          icon: "Users" as IconName,
          title: { ar: "باقات الفريق التقني المتكامل", en: "Dedicated tech team plans" },
          text: team.summary,
          tiers: team.plans.map((p, i) => ({ key: ["team-monthly", "team-semiannual", "team-annual"][i] ?? `team-${i}`, icon: p.icon, name: p.name, tagline: p.for, price: null, period: perMonth, featured: p.featured, features: p.features }))
        }
      ]
    : [])
];

export const offers: Offer[] = [
  {
    slug: "store-launch-example",
    service: "ecommerce",
    icon: "ShoppingCart",
    badge: { ar: "مثال للتصميم", en: "Design example" },
    title: { ar: "عرض إطلاق المتاجر", en: "Store launch offer" },
    text: { ar: "مثال لعرض محدود المدة — يظهر على جهازك فقط ولا يظهر على الموقع الحقيقي.", en: "An example limited-time offer — shown on your machine only, never on the live site." },
    features: [
      { ar: "إعداد المتجر بالكامل", en: "Full store set up" },
      { ar: "ربط الدفع والشحن", en: "Payments and shipping connected" },
      { ar: "شهر دعم إضافي مجاناً", en: "An extra month of support, free" }
    ],
    startsAt: "2026-01-01",
    endsAt: "2030-12-31",
    price: null,
    oldPrice: null,
    preview: true
  }
];

export const deals: Deal[] = [
  {
    token: "example-k3v9q2",
    client: { ar: "شركة المثال التجارية", en: "Example Trading Co." },
    title: { ar: "عرض خاص: موقع ومتجر وواتساب", en: "Special offer: website, store and WhatsApp" },
    text: { ar: "مثال لصفقة خاصة بعميل واحد — رابطها لا يظهر في الموقع ولا في محركات البحث.", en: "An example single-client deal — its link is not listed on the site or in search engines." },
    items: [
      { label: { ar: "موقع الشركة — الباقة الاحترافية", en: "Company website — Professional" }, price: null },
      { label: { ar: "متجر إلكتروني — باقة النمو", en: "Online store — Growth" }, price: null },
      { label: { ar: "حلول واتساب — الباقة الاحترافية", en: "WhatsApp — Professional" }, price: null }
    ],
    total: null,
    expiresAt: "2030-12-31",
    preview: true
  }
];

const live = (x: { preview?: boolean }) => !x.preview || process.env.NODE_ENV !== "production";
const day = (s: string) => new Date(`${s}T00:00:00+03:00`);
/** End of the given Riyadh day as an ISO instant (offers run through their last day). */
export const offerEndInstant = (s: string) => new Date(day(s).getTime() + 86_400_000).toISOString();

/** Offers running now (Riyadh dates; examples only outside production). */
export function activeOffers(now = new Date()) {
  return offers.filter((o) => live(o) && day(o.startsAt) <= now && now < new Date(day(o.endsAt).getTime() + 86_400_000));
}
export function findOffer(slug: string, now = new Date()) {
  return activeOffers(now).find((o) => o.slug === slug) ?? null;
}
/** A private deal by its token: `expired` once past expiresAt (the page then says so instead of showing it). */
export function findDeal(token: string, now = new Date()) {
  const d = deals.find((x) => x.token === token && live(x));
  if (!d) return null;
  return { deal: d, expired: now >= new Date(day(d.expiresAt).getTime() + 86_400_000) };
}

/** What a form key stands for ("pkg:web-growth", "offer:<slug>", "deal:<token>"), in Arabic for the CRM / e-mail. */
export function offerLabel(key: string): string | null {
  const [kind, id] = key.split(":");
  if (kind === "pkg") {
    for (const g of packageGroups) {
      const t = g.tiers.find((x) => x.key === id);
      if (t) return `${g.title.ar} — ${t.name.ar}`;
    }
  }
  if (kind === "offer") {
    const o = offers.find((x) => x.slug === id && live(x));
    if (o) return `عرض: ${o.title.ar}`;
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (d) return `صفقة خاصة: ${d.title.ar} (${d.client.ar})`;
  }
  return null;
}

export const offersCopy = {
  eyebrow: { ar: "الباقات والعروض", en: "Packages & offers" } as L,
  title: { ar: "اختر الباقة *المناسبة لنشاطك*", en: "Choose the package *that fits your business*" } as L,
  sub: { ar: "باقات واضحة لكل خدمة، وعروض لفترة محدودة — واطلب ما يناسبك في دقيقة.", en: "Clear packages for every service and limited-time offers — request what fits you in a minute." } as L,
  seePackages: { ar: "تصفح الباقات", en: "Browse packages" } as L,
  whatsapp: { ar: "اسألنا على واتساب", en: "Ask us on WhatsApp" } as L,
  offersTitle: { ar: "عروض *لفترة محدودة*", en: "Limited-time *offers*" } as L,
  packagesTitle: { ar: "الباقات", en: "Packages" } as L,
  packagesSub: { ar: "كل باقة قابلة للتعديل حسب احتياجك — والسعر النهائي يُحدد بعد فهم متطلباتك.", en: "Every package can be tailored — the final price follows your requirements." } as L,
  mostPopular: { ar: "الأكثر طلباً", en: "Most popular" } as L,
  from: { ar: "يبدأ من", en: "From" } as L,
  onRequest: { ar: "السعر حسب احتياجك", en: "Priced to your needs" } as L,
  choose: { ar: "اطلب هذه الباقة", en: "Request this package" } as L,
  getOffer: { ar: "اطلب العرض", en: "Get this offer" } as L,
  endsIn: { ar: "ينتهي خلال", en: "Ends in" } as L,
  endsOn: { ar: "ينتهي في", en: "Ends on" } as L,
  days: { ar: "يوم", en: "d" } as L,
  hours: { ar: "ساعة", en: "h" } as L,
  minutes: { ar: "دقيقة", en: "m" } as L,
  custom: { ar: "لم تجد ما يناسبك؟", en: "Didn't find what you need?" } as L,
  customText: { ar: "نصمم لك باقة على مقاس مشروعك.", en: "We'll build a package around your project." } as L,
  customCta: { ar: "اطلب باقة مخصصة", en: "Request a custom package" } as L,
  included: { ar: "ما تتضمنه", en: "What's included" } as L,
  formTitle: { ar: "اطلب الآن وسنتواصل معك", en: "Request it — we'll get back to you" } as L,
  formSub: { ar: "اترك بياناتك ويتواصل معك فريقنا خلال يوم عمل.", en: "Leave your details and our team will contact you within a business day." } as L,
  chosen: { ar: "الباقة المختارة", en: "Your choice" } as L,
  share: { ar: "شارك الرابط", en: "Share the link" } as L,
  copy: { ar: "نسخ الرابط", en: "Copy link" } as L,
  copied: { ar: "تم النسخ ✓", en: "Copied ✓" } as L,
  shareWa: { ar: "إرسال على واتساب", en: "Send on WhatsApp" } as L,
  allOffers: { ar: "كل الباقات والعروض", en: "All packages & offers" } as L,
  ended: { ar: "انتهى هذا العرض", en: "This offer has ended" } as L,
  endedText: { ar: "يسعدنا مساعدتك بعرض جديد يناسب احتياجك.", en: "We'd be happy to prepare a new offer for you." } as L,
  dealFor: { ar: "عرض خاص مقدَّم إلى", en: "A special offer for" } as L,
  dealItems: { ar: "ما يشمله العرض", en: "What's included" } as L,
  dealTotal: { ar: "الإجمالي", en: "Total" } as L,
  dealOnRequest: { ar: "يُحدد السعر بعد مناقشة التفاصيل معكم", en: "Pricing follows a short discussion with you" } as L,
  dealValid: { ar: "صالح حتى", en: "Valid until" } as L,
  vatNote: { ar: "الأسعار قبل ضريبة القيمة المضافة 15%.", en: "Prices exclude 15% VAT." } as L,
  preview: { ar: "مثال للتصميم — يظهر على جهازك فقط", en: "Design example — visible on your machine only" } as L
};
