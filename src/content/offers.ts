import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";

/**
 * Packages, limited-time campaigns and private deals (/offers, /offers/[slug], /offers/deal/[token]).
 *
 * PRICES (SAR, before 15% VAT): restructured on 2026-11-05 from the owner's pricing brief, then raised ~10% the same day
 * (rounded to …99; WhatsApp, the tech team, Ready-to-advertise and the 90-day drafts unchanged) — every tier states who it
 * suits, exact quantities, limits and what is NOT included (platform subscriptions, ad spend, Meta and AI usage are
 * never included). `price: null` shows "priced to your needs"; `from: true` is a starting price for a stated base
 * scope only, never an open promise. Never change a price without the company's approval, and see
 * docs/PRICING-PROFITABILITY.md: no package has an approved cost sheet yet, so every price still needs financial
 * sign-off before it is published.
 * `draft: true` groups (new, not yet approved) render in development only.
 * CAMPAIGNS no longer renew by themselves: one shows only between its approved start and end dates, and its struck
 * price is always the current price of the packages it is made of (see `Offer`). PRIVATE DEALS run until expiresAt;
 * entries with `preview: true` are design examples rendered in development only.
 * Every package, campaign and deal has a stable `key`; the website form sends it and the server resolves it here (see
 * offerLabel / offerReference), so the CRM lead and the e-mail show exactly what the client asked for, at which price.
 */

/** How a price is paid: once, every month, or one total for a fixed term of `termMonths`. */
export type Billing = "one-time" | "monthly" | "term";
export type Tier = {
  key: string;
  icon: IconName;
  name: L;
  tagline: L;
  /** who the package suits */
  idealFor: L;
  price: number | null;
  /** true = "from" price (for the stated base scope); false = a fixed price */
  from: boolean;
  /** a "from" price that is only a first indication ("initial indication from") — set after a requirements study */
  indicative?: boolean;
  period: L | null;
  billing: Billing;
  /** term plans: the months the total price covers (the page also shows the monthly average) */
  termMonths?: number;
  delivery: L;
  featured?: boolean;
  features: L[];
  /** stated plainly so nobody is surprised later */
  excludes: L[];
  /** monthly plans: the price for 12 months paid upfront (shown as "or yearly …, save …") */
  annual?: number;
};
/** One step of a client journey shown under a group's tiers; `tier` is the package that covers it. */
export type JourneyStep = { icon: IconName; title: L; text: L; tier: string };
/** One row of a group's comparison table: a label and one value per tier, in tier order. */
export type CompareRow = { label: L; values: L[] };
/** `notice`: one sentence shown above the tiers (e.g. the store platform subscription is not included). */
/** `short`: the tab / hero tile name · `highlights`: three things the service delivers, shown beside its visual. */
/** `id`: the tab / link key (#pkg-<id>) · `service`: the service page it belongs to · `segment`: smb = everyday packages,
 * business = company solutions (quote-led) · `draft`: awaiting the company's approval, development only. */
export type PackageGroup = { id: string; segment: "smb" | "business"; service: string; icon: IconName; title: L; short: L; text: L; highlights: L[]; notice: L; tiers: Tier[]; compare?: CompareRow[]; journey?: JourneyStep[]; draft?: boolean };
/**
 * A limited-time campaign. It shows only once `approved` (who approved it and when) and only between `startsAt` and
 * `endsAt` (Riyadh dates, both days included) — nothing renews by itself. Its struck price is never typed: it is the
 * current price of the packages in `basis`, so it always matches the package pages, and a campaign priced at or above
 * them (or built on a package without a fixed price) is never shown.
 */
export type Offer = {
  slug: string;
  service: string;
  icon: IconName;
  badge: L;
  title: L;
  text: L;
  forWho: L;
  features: L[];
  deliverables: { title: L; text: L }[];
  delivery: L;
  terms: L[];
  excludes: L[];
  price: number;
  /** the packages it is made of: `months` of a monthly plan, or its yearly price */
  basis: { key: string; months?: number; annual?: boolean }[];
  startsAt: string;
  endsAt: string;
  approved: string | null;
};
export type Deal = { token: string; client: L; title: L; text: L; items: { label: L; price: number | null }[]; total: number | null; expiresAt: string; preview?: boolean };

type Pay = Pick<Tier, "period" | "billing" | "termMonths">;
const perMonth: Pay = { period: { ar: "شهرياً", en: "per month" }, billing: "monthly" };
const oneTime: Pay = { period: { ar: "دفعة واحدة", en: "one-time" }, billing: "one-time" };
const threeMonths: Pay = { period: { ar: "إجمالي 3 أشهر", en: "total for 3 months" }, billing: "term", termMonths: 3 };
const row = (ar: string, en: string, values: [string, string][]): CompareRow => ({ label: { ar, en }, values: values.map(([a, e]) => ({ ar: a, en: e })) });
const none: [string, string] = ["—", "—"];

export const packageGroups: PackageGroup[] = [
  {
    id: "web-development",
    segment: "smb",
    service: "web-development",
    icon: "CodeXml",
    title: { ar: "باقات المواقع الإلكترونية", en: "Website packages" },
    short: { ar: "المواقع الإلكترونية", en: "Websites" },
    text: { ar: "من صفحة هبوط لحملتك إلى موقع مؤسسي بتكاملات وصلاحيات — بعدد صفحات ولغات وجولات تعديل مكتوبة لكل باقة.", en: "From a landing page for your campaign to a corporate site with integrations and permissions — with pages, languages and revision rounds written for every package." },
    highlights: [{ ar: "تصميم بهويتك يعمل على الجوال", en: "A design in your brand that works on mobile" }, { ar: "سرعة وتهيئة لمحركات البحث من اليوم الأول", en: "Speed and SEO from day one" }, { ar: "ملكية كاملة للموقع والكود بعد السداد", en: "Full ownership of the site and code once paid" }],
    notice: { ar: "الأسعار تشمل التصميم والبرمجة والإطلاق ضمن النطاق المكتوب لكل باقة. المحتوى (النصوص والصور) يقدمه العميل، والاستضافة والنطاق باسم العميل ما لم تذكر الباقة غير ذلك. أي صفحة أو لغة أو ميزة خارج النطاق تُسعَّر قبل تنفيذها.", en: "Prices cover design, development and launch within each package's written scope. Content (text and images) comes from the client; hosting and domain are in the client's name unless the package says otherwise. Any page, language or feature outside the scope is priced before it is built." },
    tiers: [
      {
        key: "landing-page",
        icon: "MousePointerClick",
        name: { ar: "صفحة هبوط احترافية", en: "Professional landing page" },
        tagline: { ar: "صفحة واحدة تحوّل زوار إعلانك إلى طلبات", en: "One page that turns ad visitors into orders" },
        idealFor: { ar: "من يطلق حملة لمنتج أو خدمة أو عرض محدد", en: "Anyone running a campaign for one product, service or offer" },
        price: 2799,
        from: false,
        ...oneTime,
        delivery: { ar: "5 أيام عمل", en: "5 business days" },
        features: [
          { ar: "صفحة واحدة بتصميم متجاوب مع الجوال", en: "One responsive, mobile-first page" },
          { ar: "نموذج تواصل يصل لبريدك وزر واتساب", en: "A contact form to your inbox and a WhatsApp button" },
          { ar: "إعداد تتبع أساسي: تحليلات جوجل وبكسل منصة إعلانية واحدة", en: "Basic tracking: Google Analytics and one ad platform pixel" },
          { ar: "نشرها على نطاقك مع شهادة الأمان", en: "Published on your domain with SSL" },
          { ar: "جولتا تعديل كحد أقصى", en: "Up to two revision rounds" }
        ],
        excludes: [
          { ar: "الاستضافة والنطاق إن لم تكن لديك", en: "Hosting and domain if you don't have them" },
          { ar: "كتابة المحتوى والتصوير", en: "Copywriting and photography" },
          { ar: "إدارة الحملة وميزانية الإعلانات", en: "Campaign management and ad spend" }
        ]
      },
      {
        key: "web-starter",
        icon: "Monitor",
        name: { ar: "موقع الانطلاق", en: "Launch website" },
        tagline: { ar: "حضور رقمي احترافي لشركتك", en: "A professional online presence" },
        idealFor: { ar: "المكاتب والعيادات والمقاولين والشركات الصغيرة", en: "Offices, clinics, contractors and small businesses" },
        price: 3899,
        from: false,
        ...oneTime,
        delivery: { ar: "7 أيام عمل", en: "7 business days" },
        features: [
          { ar: "حتى 5 صفحات: الرئيسية، من نحن، الخدمات، أعمالنا، تواصل معنا", en: "Up to 5 pages: home, about, services, our work, contact" },
          { ar: "لغة واحدة (العربية أو الإنجليزية)", en: "One language (Arabic or English)" },
          { ar: "تصميم بمكونات قياسية نخصصها بهوية شركتك", en: "A design from standard components styled in your brand" },
          { ar: "نموذج تواصل يصل لبريدك وزر واتساب ثابت", en: "Contact form to your inbox and a fixed WhatsApp button" },
          { ar: "شهادة أمان وتهيئة أساسية لمحركات البحث", en: "SSL and basic search engine set-up" },
          { ar: "جولة تعديل واحدة على التصميم", en: "One round of design revisions" },
          { ar: "شهر لمعالجة العيوب البرمجية بعد التسليم", en: "One month of bug fixing after delivery" }
        ],
        excludes: [
          { ar: "الاستضافة والنطاق (باسمك وعلى حسابك)", en: "Hosting and domain (in your name)" },
          { ar: "لوحة تحكم لتعديل المحتوى", en: "A content management panel" },
          { ar: "تصميم مخصص بالكامل (في باقة موقع الأعمال)", en: "A fully custom design (in the Business website)" }
        ]
      },
      {
        key: "web-growth",
        icon: "Rocket",
        name: { ar: "موقع الأعمال", en: "Business website" },
        tagline: { ar: "موقع يجلب العملاء وتديره بنفسك", en: "A site that brings clients and you run yourself" },
        idealFor: { ar: "الشركات التي تعتمد على موقعها في جلب العملاء والحملات", en: "Companies that rely on their site for leads and campaigns" },
        price: 10999,
        from: false,
        ...oneTime,
        delivery: { ar: "21 يوم عمل", en: "21 business days" },
        featured: true,
        features: [
          { ar: "حتى 15 صفحة بالعربية والإنجليزية", en: "Up to 15 pages in Arabic and English" },
          { ar: "تصميم مخصص بهوية شركتك (ليس قالباً جاهزاً)", en: "A custom design in your brand (not a ready template)" },
          { ar: "لوحة تحكم لتعديل النصوص والصور والمقالات (دون إنشاء أقسام أو قوالب جديدة)", en: "A panel to edit text, images and articles (not to create new sections or templates)" },
          { ar: "مدونة، ويمكن أن تكون حتى 3 من الصفحات صفحات هبوط للحملات", en: "A blog; up to 3 of the pages can be campaign landing pages" },
          { ar: "إعداد تحليلات جوجل وبكسل الإعلانات وتهيئة تقنية لمحركات البحث", en: "Google Analytics, ad pixels and technical SEO set up" },
          { ar: "استضافة سحابية قياسية ونطاق دوت كوم للسنة الأولى", en: "Standard cloud hosting and a .com domain for the first year" },
          { ar: "جولتا تعديل", en: "Two revision rounds" },
          { ar: "3 أشهر دعم: إصلاح الأعطال وتعديلات محتوى بسيطة في أيام العمل", en: "3 months of support: bug fixes and small content edits on business days" }
        ],
        excludes: [
          { ar: "تجديد الاستضافة والنطاق بعد السنة الأولى (بسعر المزود وقتها)", en: "Hosting and domain renewal after year one (at the provider's price then)" },
          { ar: "تطوير مميزات جديدة خلال فترة الدعم", en: "New features during the support period" },
          { ar: "كتابة المحتوى والتصوير", en: "Copywriting and photography" }
        ]
      },
      {
        key: "web-pro",
        icon: "Layers",
        name: { ar: "موقع المؤسسات", en: "Enterprise website" },
        tagline: { ar: "موقع مؤسسي مخصص بتكاملات وصلاحيات", en: "A custom corporate site with integrations and permissions" },
        idealFor: { ar: "الشركات الكبيرة والجهات التي تحتاج تصميماً وتكاملات خاصة", en: "Large companies and entities that need custom design and integrations" },
        price: 21999,
        from: true,
        ...oneTime,
        delivery: { ar: "من 6 أسابيع حسب نطاق المشروع", en: "From 6 weeks, depending on scope" },
        features: [
          { ar: "ورشة متطلبات ووثيقة نطاق متفق عليها قبل البدء", en: "A requirements workshop and an agreed scope before work starts" },
          { ar: "سعر البداية للنطاق الأساسي: حتى 20 صفحة بلغتين", en: "The starting price covers the base scope: up to 20 pages in two languages" },
          { ar: "تصميم مخصص بالكامل بهوية مؤسستك", en: "A fully custom design in your corporate identity" },
          { ar: "لوحة إدارة بحتى 3 أدوار صلاحيات", en: "An admin panel with up to 3 permission roles" },
          { ar: "تكامل واحد محدد ضمن النطاق الأساسي (نظام العملاء أو الحجوزات أو الدفع)", en: "One defined integration in the base scope (CRM, bookings or payments)" },
          { ar: "ملكية كاملة للكود ودعم 6 أشهر", en: "Full code ownership and 6 months of support" }
        ],
        excludes: [
          { ar: "الصفحات والتكاملات والأدوار الإضافية (تُسعَّر بعد تحليل المتطلبات)", en: "Extra pages, integrations and roles (priced after requirements analysis)" },
          { ar: "الاستضافة والتراخيص الخارجية", en: "Hosting and third-party licences" },
          { ar: "تطبيقات الجوال (في تطوير الأنظمة والتطبيقات)", en: "Mobile apps (in systems & app development)" }
        ]
      }
    ],
    compare: [
      row("الصفحات", "Pages", [["صفحة واحدة", "One page"], ["حتى 5", "Up to 5"], ["حتى 15", "Up to 15"], ["الأساسي حتى 20 — والباقي حسب النطاق", "Base up to 20 — more by scope"]]),
      row("اللغات", "Languages", [["واحدة", "One"], ["واحدة", "One"], ["العربية والإنجليزية", "Arabic and English"], ["لغتان", "Two"]]),
      row("التصميم", "Design", [["متجاوب لصفحة واحدة", "One responsive page"], ["مكونات قياسية بهويتك", "Standard components in your brand"], ["مخصص بهويتك", "Custom, in your brand"], ["مخصص بالكامل", "Fully custom"]]),
      row("لوحة التحكم", "Content panel", [none, none, ["ضمن نطاق محدد", "Within a defined scope"], ["بحتى 3 أدوار صلاحيات", "Up to 3 permission roles"]]),
      row("جولات التعديل", "Revision rounds", [["2", "2"], ["1", "1"], ["2", "2"], ["حسب وثيقة النطاق", "Per the scope document"]]),
      row("الدعم بعد التسليم", "Support after delivery", [none, ["شهر لمعالجة العيوب", "1 month of bug fixing"], ["3 أشهر", "3 months"], ["6 أشهر", "6 months"]])
    ]
  },
  {
    id: "ecommerce",
    segment: "smb",
    service: "ecommerce",
    icon: "ShoppingCart",
    title: { ar: "باقات المتاجر الإلكترونية", en: "Online store packages" },
    short: { ar: "متاجر إلكترونية", en: "Online stores" },
    text: { ar: "متجر جاهز للبيع والإعلان على زد أو سلة أو شوبيفاي — من التأسيس حتى أول طلب، ثم نكمل معك التسويق شهرياً.", en: "A store ready to sell and advertise on Zid, Salla or Shopify — from founding to the first order, then monthly marketing with you." },
    highlights: [{ ar: "متجر على زد أو سلة أو شوبيفاي جاهز للبيع", en: "A Zid, Salla or Shopify store ready to sell" }, { ar: "وسائل الدفع والشحن المتاحة لحسابك مربوطة", en: "The payment and shipping options available to your account connected" }, { ar: "التتبع والكتالوج جاهزان للإعلان", en: "Tracking and catalogue ready for ads" }],
    notice: { ar: "مهم: اشتراكات زد وسلة وشوبيفاي والتطبيقات المدفوعة ورسوم بوابات الدفع وشركات الشحن غير مشمولة — تُدفع مباشرة وباسمك ليبقى المتجر ملكك. وميزانية الإعلانات تُدفع لمنصات الإعلان من حسابك. أي تكامل يعتمد على إتاحة واجهة برمجية لدى المنصة أو موافقة طرف ثالث نوضحه لك قبل البدء.", en: "Important: Zid, Salla and Shopify subscriptions, paid apps, payment gateway and shipping fees are not included — you pay them directly, in your name, so the store stays yours. Ad budgets are paid to the ad platforms from your account. Any integration that depends on a platform API or a third party's approval is explained to you before we start." },
    tiers: [
      {
        key: "store-launch",
        icon: "ShoppingBag",
        name: { ar: "متجر الانطلاق", en: "Launch store" },
        tagline: { ar: "متجر جاهز للبيع والإعلان بسرعة", en: "A store ready to sell and advertise, fast" },
        idealFor: { ar: "من يبيع على إنستغرام أو واتساب ويريد متجراً حقيقياً", en: "Sellers on Instagram or WhatsApp who want a real store" },
        price: 2799,
        from: false,
        ...oneTime,
        delivery: { ar: "5 أيام عمل", en: "5 business days" },
        features: [
          { ar: "إعداد المتجر على زد أو سلة بقالب المنصة وتخصيصه بشعارك وألوانك", en: "Store set up on Zid or Salla with a platform theme styled in your logo and colours" },
          { ar: "رفع حتى 30 منتجاً من صورك وبياناتك", en: "Up to 30 products from your photos and data" },
          { ar: "الصفحات الأساسية: من نحن، الاسترجاع، الشحن، الخصوصية", en: "Core pages: about, returns, shipping, privacy" },
          { ar: "إعداد وسائل الدفع والشحن المتاحة لحسابك على المنصة", en: "The payment and shipping options available to your account set up" },
          { ar: "ربط التتبع القياسي الذي تدعمه المنصة: بكسل سناب وتيك توك وميتا وتحليلات جوجل", en: "The platform's supported standard tracking: Snap, TikTok and Meta pixels and Google Analytics" },
          { ar: "دعم فني أسبوعين بعد الإطلاق", en: "Two weeks of support after launch" }
        ],
        excludes: [
          { ar: "اشتراك المنصة وتطبيقاتها ورسوم بوابات الدفع والشحن", en: "Platform subscription, its apps, payment and shipping fees" },
          { ar: "التصميم المخصص وتصوير المنتجات", en: "Custom design and product photography" },
          { ar: "إدارة الحملات وميزانية الإعلانات", en: "Campaign management and ad budget" }
        ]
      },
      {
        key: "store-growth",
        icon: "TrendingUp",
        name: { ar: "متجر النمو", en: "Growth store" },
        tagline: { ar: "متجر بهويتك وجاهز لحملة الإطلاق", en: "A store in your brand, ready for its launch campaign" },
        idealFor: { ar: "العلامات التي تريد متجراً مميزاً وتعلن على السوشيال ميديا", en: "Brands that want a distinctive store and advertise on social media" },
        price: 6599,
        from: false,
        ...oneTime,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
        featured: true,
        features: [
          { ar: "تخصيص الواجهات بهويتك ضمن الإمكانيات المتاحة في المنصة", en: "Storefront customised in your brand within what the platform allows" },
          { ar: "رفع حتى 100 منتج بالخيارات (المقاس، اللون…) والتصنيفات", en: "Up to 100 products with options (size, colour…) and categories" },
          { ar: "إعداد الدفع والشحن والدفع عند الاستلام المتاحة لحسابك", en: "Payments, shipping and cash on delivery available to your account set up" },
          { ar: "بكسل سناب وتيك توك وميتا مع تتبع الإضافة للسلة والشراء، وتحليلات جوجل", en: "Snap, TikTok and Meta pixels tracking add-to-cart and purchases, plus Google Analytics" },
          { ar: "ربط كتالوج المنتجات بالمنصات الإعلانية حيث تدعمه المنصة", en: "Product catalogue linked to ad platforms where the platform supports it" },
          { ar: "تجهيز حملة افتتاحية على منصة إعلانية واحدة (دون ميزانية الإعلان)", en: "An opening campaign prepared on one ad platform (ad budget not included)" },
          { ar: "10 تصاميم إطلاق للسوشيال ميديا", en: "10 social media launch designs" },
          { ar: "تدريب فريقك ودعم فني شهر", en: "Team training and one month of support" }
        ],
        excludes: [
          { ar: "اشتراك المنصة وتطبيقاتها ورسوم بوابات الدفع والشحن", en: "Platform subscription, its apps, payment and shipping fees" },
          { ar: "ميزانية الإعلانات (تُدفع للمنصة من حسابك)", en: "Ad budget (paid to the platform from your account)" },
          { ar: "إدارة الحملات بعد الإطلاق (في باقات التسويق الشهرية)", en: "Campaign management after launch (in the monthly marketing plans)" }
        ]
      },
      {
        key: "store-scale",
        icon: "Building2",
        name: { ar: "التجارة المتقدمة", en: "Advanced commerce" },
        tagline: { ar: "منصة وتكاملات ونطاق عمل على مقاس متجرك", en: "Platform, integrations and scope fitted to your store" },
        idealFor: { ar: "المتاجر ذات المبيعات العالية أو الفروع أو التي تبيع خارج المملكة", en: "High-volume stores, multi-branch businesses or cross-border sellers" },
        price: 19799,
        from: true,
        ...oneTime,
        delivery: { ar: "من 4 أسابيع حسب النطاق", en: "From 4 weeks, depending on scope" },
        features: [
          { ar: "تحليل متطلبات ووثيقة نطاق مكتوبة قبل البدء", en: "Requirements analysis and a written scope before we start" },
          { ar: "متجر بتصميم مخصص أو على شوبيفاي حسب احتياجك", en: "A custom-designed store or a Shopify store, as you need" },
          { ar: "بكسل المنصات وتحليلات جوجل وربط المنتجات بتسوق جوجل", en: "Platform pixels, Google Analytics and products linked to Google Shopping" },
          { ar: "دراسة تقنية لتكاملات المخزون والمحاسبة والفوترة الإلكترونية والتتبع من الخادم — تُسعَّر منفصلة", en: "A technical study of inventory, accounting, e-invoicing and server-side tracking integrations — priced separately" },
          { ar: "متعدد اللغات والعملات عند البيع خارج المملكة", en: "Multi-language and multi-currency for selling abroad" },
          { ar: "خطة تسويق إطلاق 90 يوماً وإدارة حملات الشهر الأول على منصتين", en: "A 90-day launch marketing plan and first-month campaigns on two platforms" },
          { ar: "دعم بأولوية لمدة 3 أشهر", en: "3 months of priority support" }
        ],
        excludes: [
          { ar: "اشتراك المنصة وتطبيقاتها المدفوعة", en: "Platform subscription and paid apps" },
          { ar: "تنفيذ تكاملات ERP أو المحاسبة أو الفوترة الإلكترونية دون دراسة وعرض منفصل", en: "ERP, accounting or e-invoicing integrations without a study and a separate quote" },
          { ar: "رسوم بوابات الدفع والشحن وميزانية الإعلانات", en: "Payment and shipping fees and ad budget" }
        ]
      }
    ],
    compare: [
      row("المنتجات", "Products", [["حتى 30", "Up to 30"], ["حتى 100", "Up to 100"], ["حسب النطاق", "By scope"]]),
      row("التصميم", "Design", [["قالب المنصة بهويتك", "Platform theme in your brand"], ["تخصيص ضمن إمكانيات المنصة", "Customised within the platform"], ["مخصص أو شوبيفاي", "Custom or Shopify"]]),
      row("التتبع", "Tracking", [["التتبع القياسي للمنصة", "The platform's standard tracking"], ["البكسل وأحداث السلة والشراء", "Pixels with cart and purchase events"], ["+ دراسة التتبع من الخادم", "+ server-side tracking study"]]),
      row("حملة الإطلاق", "Launch campaign", [none, ["حملة على منصة واحدة و10 تصاميم", "One platform and 10 designs"], ["خطة 90 يوماً وحملات منصتين", "90-day plan, two platforms"]]),
      row("الدعم", "Support", [["أسبوعان", "Two weeks"], ["شهر", "One month"], ["3 أشهر بأولوية", "3 months, priority"]])
    ],
    journey: [
      { icon: "Lightbulb", title: { ar: "التأسيس", en: "Founding" }, text: { ar: "نختار معك المنصة المناسبة ونجهز الشعار والألوان وصفحات السياسات.", en: "We choose the right platform with you and prepare your logo, colours and policy pages." }, tier: "store-launch" },
      { icon: "ShoppingBag", title: { ar: "بناء المتجر", en: "Building the store" }, text: { ar: "تجهيز المتجر ورفع المنتجات وربط الدفع والشحن.", en: "Store built, products uploaded, payments and shipping connected." }, tier: "store-growth" },
      { icon: "Target", title: { ar: "التجهيز للإعلان", en: "Ready to advertise" }, text: { ar: "البكسل والتحليلات وكتالوج المنتجات — كل طلب يُقاس.", en: "Pixels, analytics and the product catalogue — every order is measured." }, tier: "store-growth" },
      { icon: "Rocket", title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "تصاميم الافتتاح وأول حملة إعلانية.", en: "Opening designs and the first ad campaign." }, tier: "store-growth" },
      { icon: "MessagesSquare", title: { ar: "أول الطلبات", en: "First orders" }, text: { ar: "واتساب يرد على العملاء ويؤهلهم ويبلغك بكل طلب جديد.", en: "WhatsApp answers and qualifies clients and alerts you to every new order." }, tier: "wa-pro" },
      { icon: "TrendingUp", title: { ar: "النمو المستمر", en: "Ongoing growth" }, text: { ar: "إدارة الحملات والسوشيال ميديا شهرياً بتقارير تقيس الطلبات والتكلفة.", en: "Monthly campaign and social media management with reports on orders and cost." }, tier: "mkt-growth" }
    ]
  },
  {
    id: "digital-marketing",
    segment: "smb",
    service: "digital-marketing",
    icon: "Megaphone",
    title: { ar: "باقات إدارة الحملات الإعلانية", en: "Ad campaign management plans" },
    short: { ar: "الحملات الإعلانية", en: "Ad campaigns" },
    text: { ar: "ندير حملاتك على سناب وتيك توك وميتا وجوجل بخطة واضحة: عدد منصات وحملات ومواد إعلانية محدد، ومتابعة وتقارير تقيس النتائج الفعلية.", en: "We run your Snap, TikTok, Meta and Google campaigns with a clear plan: a set number of platforms, campaigns and creatives, with monitoring and reports on real results." },
    highlights: [
      { ar: "إعداد وإدارة الحملات على المنصات المناسبة لنشاطك", en: "Campaigns set up and run on the platforms that fit your business" },
      { ar: "مواد إعلانية واختبار أكثر من إعلان", en: "Ad creatives and testing several ads" },
      { ar: "تقارير بالتكلفة والنتائج القابلة للقياس", en: "Reports on cost and measurable results" }
    ],
    notice: { ar: "الأسعار رسوم إدارة قبل الضريبة. الميزانية الإعلانية تُدفع للمنصات من حسابك مباشرة ومنفصلة عن الباقة. أتعاب كل باقة تغطي إنفاقاً إعلانياً شهرياً حتى الحد المذكور فيها؛ إذا تجاوزه الإنفاق يُعاد تسعير الأتعاب بالاتفاق قبل الشهر التالي. لا نَعِد بعدد مبيعات أو عملاء محتملين أو عائد إعلاني أو تكلفة اكتساب محددة — نَعِد بإدارة احترافية وقياس شفاف.", en: "Prices are management fees before VAT. Ad spend is paid to the platforms from your own account, separately. Each plan's fee covers monthly ad spend up to the limit it states; above it, the fee is re-quoted by agreement before the next month. We don't promise a number of sales or leads, a return on ad spend or a set acquisition cost — we promise professional management and transparent measurement." },
    tiers: [
      {
        key: "ads-launch",
        icon: "Target",
        name: { ar: "جاهز للإعلان", en: "Ready to advertise" },
        tagline: { ar: "خدمة إعداد تجريبية: تجهيز وإدارة 14 يوماً", en: "A trial set-up: preparation and 14 days of management" },
        idealFor: { ar: "من يبدأ الإعلان لأول مرة أو يعلن دون قياس واضح", en: "Anyone advertising for the first time, or without clear measurement" },
        price: 1499,
        from: false,
        period: { ar: "لمدة 14 يوماً", en: "for 14 days" },
        billing: "one-time",
        delivery: { ar: "التجهيز خلال 3 أيام عمل، ثم 14 يوم إدارة", en: "Set up in 3 business days, then 14 days of management" },
        features: [
          { ar: "مراجعة جاهزية الموقع أو المتجر للإعلان", en: "A readiness review of your site or store" },
          { ar: "إعداد التتبع على منصة واحدة", en: "Tracking set up on one platform" },
          { ar: "إطلاق حملة واحدة على منصة واحدة", en: "One campaign launched on one platform" },
          { ar: "مادتان إعلانيتان من محتواك", en: "Two ad creatives from your content" },
          { ar: "متابعة وتحسين خلال 14 يوماً لإنفاق حتى 2,500 ريال", en: "Monitoring and optimisation for 14 days, for spend up to SAR 2,500" },
          { ar: "تقرير ختامي بالنتائج القابلة للقياس", en: "A final report on measurable results" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
          { ar: "التصوير وتصميم صفحات هبوط جديدة", en: "Photography and new landing pages" }
        ]
      },
      {
        key: "mkt-start",
        icon: "Megaphone",
        name: { ar: "البداية", en: "Starter" },
        tagline: { ar: "حملة واحدة تُدار باحتراف", en: "One campaign, professionally run" },
        idealFor: { ar: "المشاريع التي تبدأ الإعلان بانتظام", en: "Businesses starting to advertise regularly" },
        price: 2199,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        features: [
          { ar: "منصة إعلانية واحدة", en: "One ad platform" },
          { ar: "حملة نشطة واحدة", en: "One active campaign" },
          { ar: "مادتان إعلانيتان شهرياً", en: "Two ad creatives a month" },
          { ar: "إعداد التتبع والتأكد من قياس الطلبات", en: "Tracking set up and order measurement checked" },
          { ar: "متابعة وتحسين أسبوعي", en: "Weekly monitoring and optimisation" },
          { ar: "تقرير شهري بالتكلفة والنتائج", en: "A monthly report on cost and results" },
          { ar: "تغطي الأتعاب إنفاقاً حتى 5,000 ريال شهرياً", en: "The fee covers spend up to SAR 5,000 a month" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
          { ar: "التصوير وإنتاج الفيديو", en: "Photography and video production" }
        ]
      },
      {
        key: "mkt-growth",
        icon: "ChartLine",
        name: { ar: "النمو", en: "Growth" },
        tagline: { ar: "حملات متعددة على منصتين", en: "Several campaigns on two platforms" },
        idealFor: { ar: "المتاجر والشركات التي بدأت تبيع وتريد التوسع", en: "Stores and companies already selling that want to grow" },
        price: 4399,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        featured: true,
        features: [
          { ar: "منصتان إعلانيتان", en: "Two ad platforms" },
          { ar: "حتى 3 حملات نشطة", en: "Up to 3 active campaigns" },
          { ar: "8 مواد إعلانية شهرياً", en: "8 ad creatives a month" },
          { ar: "إعادة استهداف الزوار ومن ترك السلة", en: "Retargeting visitors and abandoned carts" },
          { ar: "متابعة وتحسين مرتين أسبوعياً", en: "Monitoring and optimisation twice a week" },
          { ar: "تقرير شهري مفصل بالتوصيات", en: "A detailed monthly report with recommendations" },
          { ar: "تغطي الأتعاب إنفاقاً حتى 15,000 ريال شهرياً", en: "The fee covers spend up to SAR 15,000 a month" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
          { ar: "إدارة حسابات السوشيال (في باقات السوشيال ميديا)", en: "Social account management (in the social media plans)" }
        ]
      },
      {
        key: "mkt-pro",
        icon: "Sparkles",
        name: { ar: "الأعمال", en: "Business" },
        tagline: { ar: "إدارة إعلانية شاملة على 3 منصات", en: "Full ad management on 3 platforms" },
        idealFor: { ar: "المتاجر والشركات ذات الميزانيات الإعلانية الأكبر", en: "Stores and companies with larger ad budgets" },
        price: 8299,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "3 منصات إعلانية، منها إعلانات جوجل في البحث والتسوق عند الحاجة", en: "3 ad platforms, including Google Search and Shopping when needed" },
          { ar: "حتى 6 حملات نشطة", en: "Up to 6 active campaigns" },
          { ar: "16 مادة إعلانية شهرياً", en: "16 ad creatives a month" },
          { ar: "خطة لتحسين نسبة التحويل في متجرك أو موقعك", en: "A conversion-rate improvement plan for your store or site" },
          { ar: "متابعة وتحسين 3 مرات أسبوعياً", en: "Monitoring and optimisation 3 times a week" },
          { ar: "تقرير شهري مفصل واجتماعان شهرياً", en: "A detailed monthly report and two meetings a month" },
          { ar: "تغطي الأتعاب إنفاقاً حتى 40,000 ريال شهرياً", en: "The fee covers spend up to SAR 40,000 a month" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
          { ar: "التصوير وأجور المؤثرين", en: "Photography and influencer fees" }
        ]
      }
    ],
    compare: [
      row("المنصات", "Platforms", [["1", "1"], ["1", "1"], ["2", "2"], ["3", "3"]]),
      row("الحملات النشطة", "Active campaigns", [["1", "1"], ["1", "1"], ["حتى 3", "Up to 3"], ["حتى 6", "Up to 6"]]),
      row("المواد الإعلانية", "Ad creatives", [["2 للمدة", "2 for the period"], ["2 شهرياً", "2 a month"], ["8 شهرياً", "8 a month"], ["16 شهرياً", "16 a month"]]),
      row("المتابعة والتحسين", "Optimisation", [["خلال 14 يوماً", "Over 14 days"], ["أسبوعي", "Weekly"], ["مرتين أسبوعياً", "Twice a week"], ["3 مرات أسبوعياً", "3 times a week"]]),
      row("التقرير", "Report", [["تقرير ختامي", "A final report"], ["شهري", "Monthly"], ["شهري بالتوصيات", "Monthly, with recommendations"], ["شهري واجتماعان", "Monthly and two meetings"]]),
      row("الإنفاق الذي تغطيه الأتعاب", "Ad spend the fee covers", [["حتى 2,500 للمدة", "Up to 2,500 for the period"], ["حتى 5,000 شهرياً", "Up to 5,000 a month"], ["حتى 15,000 شهرياً", "Up to 15,000 a month"], ["حتى 40,000 شهرياً", "Up to 40,000 a month"]])
    ]
  },
  {
    id: "social-media",
    segment: "smb",
    service: "digital-marketing",
    icon: "Share2",
    title: { ar: "باقات إدارة السوشيال ميديا", en: "Social media management plans" },
    short: { ar: "السوشيال ميديا", en: "Social media" },
    text: { ar: "خلّ حضور علامتك التجارية يعكس قيمتها: تخطيط محتوى وتصاميم ونشر منظم يحافظ على حضور احترافي.", en: "Let your brand's presence reflect its value: content planning, designs and organised publishing for a professional presence." },
    highlights: [
      { ar: "خطة محتوى شهرية بهويتك", en: "A monthly content plan in your brand" },
      { ar: "تصاميم ونصوص وفيديوهات قصيرة من موادك", en: "Designs, captions and short videos from your material" },
      { ar: "نشر منظم وتقارير شهرية", en: "Organised publishing and monthly reports" }
    ],
    notice: { ar: "المنشورات قطع محتوى فريدة يُعاد تهيئتها للمنصات المشمولة، ولا يتضاعف عددها لكل منصة. الفيديوهات القصيرة حتى 60 ثانية بمونتاج مواد يوفرها العميل، ولكل منشور أو فيديو جولة تعديل واحدة. التصوير الميداني والممثلون والتعليق الصوتي المدفوع غير مشمولة إلا بتسعير منفصل، ولا نَعِد بعدد متابعين أو وصول محدد.", en: "Posts are unique pieces adapted to the included platforms; their number doesn't multiply per platform. Short videos run up to 60 seconds, edited from footage the client provides, and every post or video has one revision round. On-site filming, actors and paid voice-over are not included unless priced separately, and we don't promise a set number of followers or reach." },
    tiers: [
      {
        key: "social-presence",
        icon: "Share2",
        name: { ar: "الحضور", en: "Presence" },
        tagline: { ar: "حساب نشط واحترافي", en: "One active, professional account" },
        idealFor: { ar: "المشاريع الصغيرة التي تريد حضوراً منتظماً", en: "Small businesses that want a steady presence" },
        price: 1999,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        features: [
          { ar: "8 منشورات شهرياً بالكتابة والتصميم", en: "8 posts a month, written and designed" },
          { ar: "منصة واحدة", en: "One platform" },
          { ar: "جدولة النشر وتقويم محتوى شهري", en: "Scheduled publishing and a monthly content calendar" },
          { ar: "جولة تعديل واحدة لكل منشور", en: "One revision round per post" },
          { ar: "تقرير شهري", en: "A monthly report" }
        ],
        excludes: [
          { ar: "الفيديو والتصوير", en: "Video and filming" },
          { ar: "الرد على التعليقات والرسائل", en: "Replying to comments and messages" },
          { ar: "الحملات الإعلانية (في باقات الحملات)", en: "Ad campaigns (in the campaign plans)" }
        ]
      },
      {
        key: "social-engage",
        icon: "MessagesSquare",
        name: { ar: "التفاعل", en: "Engagement" },
        tagline: { ar: "محتوى وفيديو ومتابعة على منصتين", en: "Content, video and community on two platforms" },
        idealFor: { ar: "العلامات التي تريد تفاعلاً أكبر مع جمهورها", en: "Brands that want more engagement with their audience" },
        price: 3899,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        featured: true,
        features: [
          { ar: "16 منشوراً شهرياً بالكتابة والتصميم", en: "16 posts a month, written and designed" },
          { ar: "4 فيديوهات قصيرة (حتى 60 ثانية) من مواد يوفرها العميل", en: "4 short videos (up to 60 seconds) from footage the client provides" },
          { ar: "منصتان", en: "Two platforms" },
          { ar: "متابعة التعليقات في أيام العمل خلال ساعات متفق عليها، بردود تعتمدها مسبقاً", en: "Comment monitoring on business days during agreed hours, with replies you approve in advance" },
          { ar: "خطة محتوى شهرية", en: "A monthly content plan" },
          { ar: "تقرير أداء شهري", en: "A monthly performance report" }
        ],
        excludes: [
          { ar: "التصوير الميداني والتعليق الصوتي المدفوع", en: "On-site filming and paid voice-over" },
          { ar: "الردود خارج ساعات العمل المتفق عليها", en: "Replies outside the agreed working hours" },
          { ar: "الحملات الإعلانية", en: "Ad campaigns" }
        ]
      },
      {
        key: "social-brand",
        icon: "Sparkles",
        name: { ar: "العلامة التجارية", en: "Brand" },
        tagline: { ar: "حضور متكامل حتى 3 منصات", en: "A complete presence on up to 3 platforms" },
        idealFor: { ar: "العلامات المتوسعة التي تبني صورتها باستمرار", en: "Growing brands building their image continuously" },
        price: 6599,
        from: false,
        ...perMonth,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "20 منشوراً شهرياً بالكتابة والتصميم", en: "20 posts a month, written and designed" },
          { ar: "6 فيديوهات قصيرة (حتى 60 ثانية) من مواد العميل", en: "6 short videos (up to 60 seconds) from the client's footage" },
          { ar: "حتى 3 منصات", en: "Up to 3 platforms" },
          { ar: "خطة محتوى شهرية", en: "A monthly content plan" },
          { ar: "تقارير أداء شهرية وتوصيات للتطوير", en: "Monthly performance reports and improvement recommendations" }
        ],
        excludes: [
          { ar: "التصوير الميداني والممثلون والتعليق الصوتي المدفوع", en: "On-site filming, actors and paid voice-over" },
          { ar: "إدارة التعليقات والرسائل (تُضاف عند الطلب)", en: "Comment and message management (added on request)" },
          { ar: "الحملات الإعلانية", en: "Ad campaigns" }
        ]
      }
    ],
    compare: [
      row("المنشورات شهرياً", "Posts a month", [["8", "8"], ["16", "16"], ["20", "20"]]),
      row("الفيديوهات القصيرة", "Short videos", [none, ["4 حتى 60 ثانية", "4, up to 60 s"], ["6 حتى 60 ثانية", "6, up to 60 s"]]),
      row("المنصات", "Platforms", [["1", "1"], ["2", "2"], ["حتى 3", "Up to 3"]]),
      row("التعليقات", "Comments", [none, ["أيام العمل بساعات متفق عليها", "Business days, agreed hours"], ["تُضاف عند الطلب", "Added on request"]]),
      row("التخطيط", "Planning", [["تقويم وجدولة", "Calendar and scheduling"], ["خطة محتوى شهرية", "Monthly content plan"], ["خطة محتوى شهرية", "Monthly content plan"]]),
      row("التقارير", "Reports", [["شهري", "Monthly"], ["تقرير أداء", "Performance report"], ["أداء وتوصيات", "Performance and recommendations"]])
    ]
  },
  {
    id: "integrated-marketing",
    segment: "smb",
    service: "digital-marketing",
    icon: "Rocket",
    draft: true,
    title: { ar: "باقات التسويق المتكامل – 90 يوماً لنمو أعمالك", en: "Integrated marketing – 90 days to grow your business" },
    short: { ar: "التسويق المتكامل 90 يوماً", en: "90-day marketing" },
    text: { ar: "السوشيال ميديا والحملات الإعلانية وخطة المحتوى في عقد واحد لمدة 3 أشهر — فريق واحد يخطط وينفذ ويقيس.", en: "Social media, ad campaigns and a content plan in one 3-month contract — one team that plans, delivers and measures." },
    highlights: [
      { ar: "محتوى وحملات بخطة واحدة متسقة", en: "Content and campaigns on one consistent plan" },
      { ar: "مخرجات شهرية بعدد محدد", en: "A set number of deliverables every month" },
      { ar: "تقارير شهرية ومتابعة للنتائج", en: "Monthly reports and follow-up on results" }
    ],
    notice: { ar: "مدة التعاقد 3 أشهر، والسعر المعلن إجمالي المدة وليس سعر الشهر. الميزانية الإعلانية منفصلة وتُدفع من حسابك، وتصوير الفيديو وإنشاء الموقع والهوية البصرية الكاملة وكتابة المقالات وتهيئة محركات البحث الشهرية المتقدمة غير مشمولة إلا بإضافة منفصلة. إعادة استخدام المواد على المنصات لا تعني مضاعفة عدد المخرجات، وأي إنتاج إضافي يُسعَّر بعد موافقتك.", en: "The contract runs 3 months and the price shown is the total for the term, not per month. Ad spend is separate and paid from your account; video filming, building a website, a full brand identity, article writing and advanced monthly SEO are not included unless added separately. Reusing material across platforms doesn't multiply the deliverables, and any extra production is priced after your approval." },
    tiers: [
      {
        key: "mkt90-basic",
        icon: "Megaphone",
        name: { ar: "الأساسية", en: "Essential" },
        tagline: { ar: "منصة وحملة ومحتوى منتظم", en: "One platform, one campaign, steady content" },
        idealFor: { ar: "المشاريع التي تبدأ التسويق المنظم", en: "Businesses starting organised marketing" },
        price: 10500,
        from: false,
        ...threeMonths,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "إدارة منصة تواصل اجتماعي واحدة", en: "One social media platform managed" },
          { ar: "8 منشورات مصممة شهرياً", en: "8 designed posts a month" },
          { ar: "فيديو قصير واحد شهرياً من مواد العميل", en: "One short video a month from the client's footage" },
          { ar: "إدارة حملة إعلانية واحدة", en: "One ad campaign managed" },
          { ar: "خطة محتوى شهرية", en: "A monthly content plan" },
          { ar: "تقرير شهري", en: "A monthly report" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية", en: "Ad spend" },
          { ar: "تصوير الفيديو", en: "Video filming" }
        ]
      },
      {
        key: "mkt90-growth",
        icon: "ChartLine",
        name: { ar: "النمو", en: "Growth" },
        tagline: { ar: "منصتان وحملتان وخطة تسويق شهرية", en: "Two platforms, two campaigns and a monthly marketing plan" },
        idealFor: { ar: "العلامات التي تريد نمواً ملحوظاً خلال ربع سنة", en: "Brands that want visible growth over a quarter" },
        price: 21000,
        from: false,
        ...threeMonths,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        featured: true,
        features: [
          { ar: "إدارة منصتين", en: "Two platforms managed" },
          { ar: "12 منشوراً مصمماً شهرياً", en: "12 designed posts a month" },
          { ar: "3 فيديوهات قصيرة شهرياً من مواد العميل", en: "3 short videos a month from the client's footage" },
          { ar: "إدارة حتى حملتين إعلانيتين", en: "Up to two ad campaigns managed" },
          { ar: "خطة محتوى وتسويق شهرية", en: "A monthly content and marketing plan" },
          { ar: "تقرير أداء وتوصيات", en: "A performance report and recommendations" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية", en: "Ad spend" },
          { ar: "تصوير الفيديو", en: "Video filming" }
        ]
      },
      {
        key: "mkt90-full",
        icon: "Sparkles",
        name: { ar: "الشاملة", en: "Complete" },
        tagline: { ar: "حتى 3 منصات و3 حملات واستراتيجية تسويق", en: "Up to 3 platforms, 3 campaigns and a marketing strategy" },
        idealFor: { ar: "الشركات التي تريد فريق تسويق متكاملاً دون توظيف", en: "Companies that want a complete marketing team without hiring" },
        price: 37500,
        from: false,
        ...threeMonths,
        delivery: { ar: "نبدأ خلال 10 أيام عمل", en: "We start within 10 business days" },
        features: [
          { ar: "إدارة حتى 3 منصات", en: "Up to 3 platforms managed" },
          { ar: "20 منشوراً مصمماً شهرياً", en: "20 designed posts a month" },
          { ar: "5 فيديوهات قصيرة شهرياً من مواد العميل", en: "5 short videos a month from the client's footage" },
          { ar: "إدارة حتى 3 حملات إعلانية", en: "Up to 3 ad campaigns managed" },
          { ar: "استراتيجية محتوى وتسويق", en: "A content and marketing strategy" },
          { ar: "تقارير شهرية واجتماع متابعة", en: "Monthly reports and a follow-up meeting" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية", en: "Ad spend" },
          { ar: "تصوير الفيديو وإنشاء الموقع والهوية البصرية الكاملة", en: "Video filming, building a website and a full brand identity" }
        ]
      }
    ],
    compare: [
      row("المنصات", "Platforms", [["1", "1"], ["2", "2"], ["حتى 3", "Up to 3"]]),
      row("المنشورات شهرياً", "Posts a month", [["8", "8"], ["12", "12"], ["20", "20"]]),
      row("الفيديوهات شهرياً", "Videos a month", [["1", "1"], ["3", "3"], ["5", "5"]]),
      row("الحملات الإعلانية", "Ad campaigns", [["1", "1"], ["حتى 2", "Up to 2"], ["حتى 3", "Up to 3"]]),
      row("التخطيط", "Planning", [["خطة محتوى", "Content plan"], ["خطة محتوى وتسويق", "Content and marketing plan"], ["استراتيجية محتوى وتسويق", "Content and marketing strategy"]]),
      row("التقارير", "Reports", [["شهري", "Monthly"], ["أداء وتوصيات", "Performance and recommendations"], ["شهرية واجتماع متابعة", "Monthly and a follow-up meeting"]])
    ]
  },
  {
    id: "whatsapp-automation",
    segment: "smb",
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    title: { ar: "باقات واتساب للأعمال", en: "WhatsApp for business plans" },
    short: { ar: "واتساب للأعمال", en: "WhatsApp" },
    text: { ar: "حوّل واتساب من رسائل متراكمة إلى قناة مبيعات وخدمة عملاء منظمة: رقم رسمي موثق، وفريق يعمل من صندوق واحد، وردود ومسارات آلية، وتقارير تقيس سرعة الرد والطلبات.", en: "Turn WhatsApp from a pile of messages into an organised sales and service channel: a verified official number, a team working from one inbox, automated replies and flows, and reports on response time and orders." },
    highlights: [
      { ar: "رقم رسمي موثق باسم نشاطك عبر منصة واتساب للأعمال", en: "A verified official number under your business name on the WhatsApp Business Platform" },
      { ar: "صندوق محادثات واحد لفريقك مع توزيع المحادثات", en: "One shared inbox for your team with conversation routing" },
      { ar: "مسارات آلية تعمل على مدار الساعة وتحوّل للموظف عند الحاجة", en: "Automated flows around the clock, handing over to staff when needed" }
    ],
    notice: { ar: "الأسعار اشتراك شهري قبل الضريبة (أو سنوي بخصم شهرين)، والحد الأدنى 3 أشهر، والإعداد مشمول. رسوم ميتا غير مشمولة في الباقات: الرسائل التسويقية والحملات والرسائل التي تبدأ بها أنت مع العميل تُحتسب لكل رسالة حسب أسعار ميتا، وهي متغيرة وتتحدث من ميتا من وقت لآخر، وتُدفع حسب الاستخدام الفعلي وباسمك. ردودك على رسائل العملاء خلال 24 ساعة من رسالتهم مجانية ضمن حدود ميتا. اعتماد الحساب وقوالب الرسائل يخضع لموافقة ميتا.", en: "Prices are monthly subscriptions before VAT (or yearly with two months off), minimum 3 months, set-up included. Meta's fees are not included: marketing messages, campaigns and conversations you start are charged per message at Meta's prices, which change as Meta updates them, and are paid by actual usage in your name. Your replies within 24 hours of a client's message are free within Meta's limits. Account and template approval is subject to Meta." },
    tiers: [
      {
        key: "wa-basic",
        icon: "MessageSquareMore",
        name: { ar: "الانطلاق", en: "Launch" },
        tagline: { ar: "رقم رسمي منظم وفريق يرد من مكان واحد", en: "An organised official number and a team replying from one place" },
        idealFor: { ar: "الأنشطة التي تنتقل من واتساب الجوال إلى واتساب الأعمال الرسمي", en: "Businesses moving from WhatsApp on a phone to the official business platform" },
        price: 599,
        annual: 5990,
        from: false,
        ...perMonth,
        delivery: { ar: "3 أيام عمل بعد اعتماد ميتا", en: "3 business days after Meta approval" },
        features: [
          { ar: "ربط رقمك بمنصة واتساب للأعمال وتوثيق نشاطك لدى ميتا", en: "Your number on the WhatsApp Business Platform, business verified with Meta" },
          { ar: "صندوق محادثات لمستخدم واحد", en: "An inbox for one user" },
          { ar: "قائمة ترحيب آلية بالخدمات والفروع وأوقات العمل", en: "An automated welcome menu with services, branches and hours" },
          { ar: "رد خارج أوقات العمل و20 رداً سريعاً جاهزاً", en: "Out-of-hours replies and 20 ready quick replies" },
          { ar: "تصنيف المحادثات وملاحظات داخلية", en: "Conversation labels and internal notes" },
          { ar: "تقرير شهري بعدد المحادثات وسرعة الرد", en: "A monthly report on conversations and response time" }
        ],
        excludes: [
          { ar: "رسوم رسائل ميتا (التسويقية والحملات) حسب أسعار ميتا", en: "Meta message fees (marketing and campaigns) at Meta's prices" },
          { ar: "الشات بوت والحملات (في الباقات الأعلى)", en: "Chatbot and campaigns (in the higher plans)" }
        ]
      },
      {
        key: "wa-pro",
        icon: "Bot",
        name: { ar: "الاحترافية", en: "Professional" },
        tagline: { ar: "بوت يرد ويحجز ويؤهل العملاء ويوزعهم على فريقك", en: "A bot that answers, books, qualifies and routes clients to your team" },
        idealFor: { ar: "العيادات والمتاجر والعقار والشركات الخدمية كثيرة الاستفسارات", en: "Clinics, stores, real estate and service companies with many enquiries" },
        price: 1299,
        annual: 12990,
        from: false,
        ...perMonth,
        delivery: { ar: "7 أيام عمل بعد اعتماد ميتا", en: "7 business days after Meta approval" },
        featured: true,
        features: [
          { ar: "مستخدمان مع توزيع المحادثات بينهما", en: "Two users with conversation routing" },
          { ar: "شات بوت بمسارات مصممة لنشاطك: خدمات، أسعار، حجز، طلبات", en: "A chatbot with flows designed for you: services, prices, booking, orders" },
          { ar: "تأهيل العملاء (الاسم، المدينة، الخدمة) وتحويلهم بملخص", en: "Lead qualification (name, city, service) and hand-over with a summary" },
          { ar: "10 قوالب رسائل معتمدة: تأكيد، تذكير، متابعة", en: "10 approved templates: confirmation, reminder, follow-up" },
          { ar: "إعداد وإرسال حملاتك للعملاء الموافقين (تكلفة رسائل ميتا عليك)", en: "Your campaigns set up and sent to opted-in clients (Meta message costs are yours)" },
          { ar: "ربط مع سلة أو زد أو جداول جوجل", en: "Integration with Salla, Zid or Google Sheets" },
          { ar: "تقارير أداء الفريق والحملات شهرياً", en: "Monthly team and campaign reports" }
        ],
        excludes: [
          { ar: "رسوم رسائل ميتا (التسويقية والحملات) حسب أسعار ميتا", en: "Meta message fees (marketing and campaigns) at Meta's prices" },
          { ar: "الذكاء الاصطناعي وتكامل أنظمة العملاء (في أتمتة الأعمال)", en: "AI and CRM integration (in Business automation)" }
        ]
      },
      {
        key: "wa-advanced",
        icon: "Workflow",
        name: { ar: "أتمتة الأعمال", en: "Business automation" },
        tagline: { ar: "واتساب مربوط بأنظمتك ومساعد ذكي وأتمتة كاملة", en: "WhatsApp linked to your systems, an AI assistant and full automation" },
        idealFor: { ar: "الشركات متعددة الفروع والمتاجر ذات الطلبات العالية", en: "Multi-branch companies and high-volume stores" },
        price: 2999,
        annual: 29990,
        from: true,
        ...perMonth,
        delivery: { ar: "بعد تحليل النطاق — عادة 3 إلى 4 أسابيع", en: "After scope analysis — usually 3–4 weeks" },
        features: [
          { ar: "كل مميزات الاحترافية و3 مستخدمين", en: "Everything in Professional and 3 users" },
          { ar: "مساعد ذكاء اصطناعي يجيب من ملفاتك بالعربي والإنجليزي", en: "An AI assistant answering from your files in Arabic and English" },
          { ar: "تكامل مع نظام العملاء أو نظام المبيعات (CRM / ERP)", en: "Integration with your CRM or sales system (CRM / ERP)" },
          { ar: "استرداد السلات المتروكة وإشعارات الطلب والشحن", en: "Abandoned-cart recovery and order / shipping notifications" },
          { ar: "توزيع المحادثات على الفروع تلقائياً", en: "Automatic routing across branches" },
          { ar: "مدير حساب مخصص ومراجعة شهرية للأداء", en: "A dedicated account manager and monthly performance review" }
        ],
        excludes: [
          { ar: "رسوم رسائل ميتا ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Meta message and AI usage fees, by usage" },
          { ar: "المستخدمون والتكاملات الإضافية تُسعَّر حسب الطلب", en: "Extra users and integrations priced on request" }
        ]
      }
    ]
  },
  {
    id: "ai-automation",
    segment: "business",
    service: "ai-automation",
    icon: "Bot",
    title: { ar: "باقات الذكاء الاصطناعي والأتمتة", en: "AI & automation packages" },
    short: { ar: "ذكاء اصطناعي وأتمتة", en: "AI & automation" },
    text: { ar: "اجعل الأعمال المتكررة تعمل وحدها، ومساعداً ذكياً يرد على عملائك ويخدم فريقك على مدار الساعة — بحدود استخدام مكتوبة.", en: "Let repetitive work run by itself, and an AI assistant answer your clients and serve your team around the clock — with written usage limits." },
    highlights: [
      { ar: "أتمتة العمليات بين أدواتك وأنظمتك", en: "Process automation across your tools and systems" },
      { ar: "مساعد ذكاء اصطناعي يفهم اللهجة السعودية", en: "An AI assistant that understands Saudi Arabic" },
      { ar: "بياناتك ملكك ولا تُستخدم لتدريب نماذج عامة", en: "Your data stays yours and never trains public models" }
    ],
    notice: { ar: "أسعار البداية رسوم تأسيس لمرة واحدة للنطاق المذكور. استضافة التشغيل ورسوم نماذج الذكاء الاصطناعي تُدفع حسب الاستخدام الفعلي وباسمك ونقدّرها مكتوبة قبل البدء، ولكل حل حد استهلاك شهري في العقد مع تنبيه قبل بلوغه — لا نقدّم استخداماً أو رسائل غير محدودة. الصيانة والتحسين بعد فترة الدعم اشتراك شهري اختياري يُسعَّر في عرض السعر.", en: "Starting prices are one-time set-up fees for the stated scope. Hosting and AI model fees are paid by actual usage, in your name, and estimated in writing before we start; every solution has a monthly usage limit in the contract with an alert before it is reached — we don't offer unlimited usage or messages. Maintenance and tuning after the support period is an optional monthly subscription priced in the quote." },
    tiers: [
      {
        key: "ai-auto-starter",
        icon: "Workflow",
        name: { ar: "أتمتة عمليتين قياسيتين", en: "Two standard automations" },
        tagline: { ar: "عمليتان تعملان وحدهما بدل فريقك", en: "Two processes that run themselves" },
        idealFor: { ar: "الشركات التي يكرر فريقها نفس الخطوات يدوياً كل يوم", en: "Companies whose team repeats the same manual steps every day" },
        price: 5499,
        from: true,
        ...oneTime,
        delivery: { ar: "من 10 أيام عمل", en: "From 10 business days" },
        features: [
          { ar: "رسوم التأسيس: تحليل عملياتك وأتمتة عمليتين قياسيتين حتى 10 خطوات لكل منهما", en: "Set-up fee: your processes reviewed and two standard processes automated, up to 10 steps each" },
          { ar: "ربط حتى 3 أدوات (نماذج، جداول، بريد، واتساب، نظام العملاء)", en: "Up to 3 tools connected (forms, sheets, e-mail, WhatsApp, CRM)" },
          { ar: "مصدرا بيانات كحد أقصى", en: "Up to two data sources" },
          { ar: "ذكاء اصطناعي لتصنيف الرسائل وتلخيصها ضمن حد استهلاك شهري متفق عليه", en: "AI to sort and summarise messages within an agreed monthly usage limit" },
          { ar: "تنبيهات عند أي خطأ وتوثيق لكل عملية", en: "Alerts on any failure and documentation for every process" },
          { ar: "تدريب فريقك ودعم فني لمدة شهر", en: "Team training and one month of support" }
        ],
        excludes: [
          { ar: "اشتراكات الأدوات واستضافة التشغيل ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Tool subscriptions, hosting and AI usage fees" },
          { ar: "الصيانة الشهرية بعد شهر الدعم (اختيارية وتُسعَّر في العرض)", en: "Monthly maintenance after the support month (optional, priced in the quote)" },
          { ar: "أي عملية أو تكامل إضافي", en: "Any extra process or integration" }
        ]
      },
      {
        key: "ai-site-bot",
        icon: "MessagesSquare",
        name: { ar: "مساعد ذكي للموقع", en: "Website AI assistant" },
        tagline: { ar: "يجيب زوار موقعك فوراً من ملفاتك", en: "Answers your site visitors instantly from your files" },
        idealFor: { ar: "الشركات التي يسأل زوار موقعها نفس الأسئلة كثيراً", en: "Companies whose site visitors keep asking the same questions" },
        price: 6599,
        from: true,
        ...oneTime,
        delivery: { ar: "من 10 أيام عمل", en: "From 10 business days" },
        features: [
          { ar: "مدرَّب على حتى 50 صفحة من ملفاتك وموقعك", en: "Trained on up to 50 pages of your files and site" },
          { ar: "نافذة محادثة بهويتك على موقع واحد", en: "A branded chat window on one website" },
          { ar: "عربي وإنجليزي", en: "Arabic and English" },
          { ar: "يجمع بيانات المهتمين ويرسلها لبريدك أو لنظام واحد", en: "Collects leads and sends them to your inbox or one system" },
          { ar: "حد محادثات شهري متفق عليه مع تنبيه قبل بلوغه", en: "An agreed monthly conversation limit with an alert before it is reached" },
          { ar: "مراجعة وتحسين الردود لمدة شهر", en: "A month of review and answer tuning" }
        ],
        excludes: [
          { ar: "استضافة التشغيل ورسوم استخدام الذكاء الاصطناعي", en: "Hosting and AI usage fees" },
          { ar: "واتساب والحجوزات (في المساعد المتكامل)", en: "WhatsApp and bookings (in the integrated assistant)" },
          { ar: "الصيانة الشهرية بعد شهر الدعم (اختيارية)", en: "Monthly maintenance after the support month (optional)" }
        ]
      },
      {
        key: "ai-assistant",
        icon: "Bot",
        name: { ar: "مساعد AI متكامل مع واتساب والحجوزات", en: "AI assistant with WhatsApp and bookings" },
        tagline: { ar: "موظف ذكي يرد على عملائك ويحجز لهم", en: "A smart agent that answers your clients and books for them" },
        idealFor: { ar: "العيادات والمتاجر والعقار والشركات الخدمية كثيرة الاستفسارات", en: "Clinics, stores, real estate and service companies with many enquiries" },
        price: 14299,
        from: true,
        ...oneTime,
        delivery: { ar: "من 3 أسابيع", en: "From 3 weeks" },
        featured: true,
        features: [
          { ar: "مدرَّب على خدماتك وأسعارك وسياساتك من حتى 3 مصادر بيانات", en: "Trained on your services, prices and policies from up to 3 data sources" },
          { ar: "يرد على واتساب وموقعك بالعربي (واللهجة السعودية) والإنجليزي", en: "Answers on WhatsApp and your website in Arabic (incl. Saudi dialect) and English" },
          { ar: "تكاملان: نظام حجوزات أو تقويم واحد، ونظام عملاء واحد", en: "Two integrations: one booking system or calendar, and one CRM" },
          { ar: "يحوّل المحادثة للموظف المناسب، ولوحة مراجعة لحتى 3 مستخدمين", en: "Hands chats to the right person; a review dashboard for up to 3 users" },
          { ar: "حد محادثات شهري متفق عليه مع تنبيه عند 80%", en: "An agreed monthly conversation limit with an alert at 80%" },
          { ar: "بياناتك تبقى في حساباتك ولا تُستخدم لتدريب نماذج عامة، وتُحذف عند الطلب", en: "Your data stays in your accounts, never trains public models and is deleted on request" },
          { ar: "ضبط وتحسين لمدة 3 أشهر", en: "Three months of tuning and improvement" }
        ],
        excludes: [
          { ar: "استضافة التشغيل ورسوم الذكاء الاصطناعي ورسائل ميتا حسب الاستخدام", en: "Hosting, AI usage and Meta message fees, by usage" },
          { ar: "اشتراك واتساب للأعمال (في باقات واتساب للأعمال)", en: "The WhatsApp Business subscription (in the WhatsApp packages)" },
          { ar: "التكاملات والمستخدمون الإضافيون والصيانة بعد 3 أشهر", en: "Extra integrations and users, and maintenance after 3 months" }
        ]
      },
      {
        key: "ai-custom",
        icon: "Sparkles",
        name: { ar: "حلول ذكاء اصطناعي مخصصة للشركات", en: "Custom AI solutions for companies" },
        tagline: { ar: "ذكاء اصطناعي داخل أنظمتك وبياناتك", en: "AI inside your systems and data" },
        idealFor: { ar: "الشركات والجهات التي لديها بيانات ومستندات كثيرة وأنظمة قائمة", en: "Companies and entities with lots of data, documents and existing systems" },
        price: 27499,
        from: true,
        ...oneTime,
        delivery: { ar: "من 6 أسابيع حسب النطاق", en: "From 6 weeks, depending on scope" },
        features: [
          { ar: "ورشة لتحديد حالات الاستخدام ووثيقة نطاق تحدد مصادر البيانات والتكاملات والمستخدمين", en: "A use-case workshop and a scope document naming data sources, integrations and users" },
          { ar: "مساعد معرفة داخلي يجيب فريقك من مستندات الشركة", en: "An internal knowledge assistant answering your team from company documents" },
          { ar: "قراءة الفواتير والعقود والمستندات واستخراج بياناتها", en: "Invoices, contracts and documents read and their data extracted" },
          { ar: "تكاملات مع أنظمتك بالعدد المحدد في وثيقة النطاق", en: "Integrations with your systems, as many as the scope document sets" },
          { ar: "صلاحيات وسجل تدقيق، وخيار الاستضافة في حسابك السحابي", en: "Permissions, an audit trail and the option to host in your own cloud account" },
          { ar: "حدود استهلاك شهرية مكتوبة وتقرير استخدام", en: "Written monthly usage limits and a usage report" },
          { ar: "تسليم موثق ودعم وتحسين لمدة 6 أشهر", en: "Documented hand-over and 6 months of support and tuning" }
        ],
        excludes: [
          { ar: "الخوادم ورسوم نماذج الذكاء الاصطناعي حسب الاستخدام", en: "Servers and AI model costs, by usage" },
          { ar: "تراخيص الأنظمة الخارجية", en: "Third-party system licences" },
          { ar: "أي تكامل أو مصدر بيانات خارج وثيقة النطاق", en: "Any integration or data source outside the scope document" }
        ]
      }
    ]
  },
  {
    id: "software-development",
    segment: "business",
    service: "web-development",
    icon: "Layers",
    title: { ar: "تطوير الأنظمة والتطبيقات", en: "Systems & app development" },
    short: { ar: "الأنظمة والتطبيقات", en: "Systems & apps" },
    text: { ar: "من تصميم واجهات تطبيقك إلى نظام متكامل لشركتك: نفهم المتطلبات، نوثّق النطاق، ونسلّم على مراحل مع اختبارات ودعم.", en: "From your app's interface design to a complete company system: we understand requirements, document the scope and deliver in stages with testing and support." },
    highlights: [
      { ar: "وثيقة نطاق مكتوبة قبل أي برمجة", en: "A written scope before any development" },
      { ar: "تسليم على مراحل مع نسخ تجريبية", en: "Delivery in stages with test versions" },
      { ar: "ملكية كاملة للكود وتوثيق للتسليم", en: "Full code ownership and documented hand-over" }
    ],
    notice: { ar: "أسعار البداية ليست وعداً بتنفيذ أي مشروع مهما كان حجمه: السعر النهائي يُحدَّد بعد تحليل المتطلبات حسب ساعات التصميم والتطوير والاختبار والإدارة والتكاملات والمخاطر والصيانة، والمشاريع الكبيرة تُنفَّذ بعرض سعر مخصص ووثيقة نطاق ومراحل تسليم. تطبيقات الآيفون والأندرويد الأصلية والاستضافة وتكاليف نماذج الذكاء الاصطناعي غير مشمولة.", en: "Starting prices are not a promise to build any project whatever its size: the final price is set after requirements analysis, by design, development, testing and management hours, integrations, risk and maintenance; large projects run on a custom quote, a scope document and delivery stages. Native iOS / Android apps, hosting and AI model costs are not included." },
    tiers: [
      {
        key: "ux-ui",
        icon: "PenTool",
        name: { ar: "تصميم واجهات UX/UI", en: "UX/UI design" },
        tagline: { ar: "تصميم فقط — بدون برمجة", en: "Design only — no development" },
        idealFor: { ar: "رواد الأعمال والشركات قبل بدء برمجة تطبيق أو نظام", en: "Founders and companies before building an app or system" },
        price: 5499,
        from: true,
        ...oneTime,
        delivery: { ar: "من 14 يوم عمل", en: "From 14 business days" },
        features: [
          { ar: "سعر البداية: حتى 15 شاشة ضمن تدفق استخدام واحد متفق عليه", en: "Starting price: up to 15 screens within one agreed user flow" },
          { ar: "رحلة المستخدم وتخطيط الشاشات قبل التصميم", en: "User journey and wireframes before design" },
          { ar: "نموذج تفاعلي قابل للتجربة", en: "A clickable interactive prototype" },
          { ar: "جولتان من التعديلات", en: "Two revision rounds" },
          { ar: "تسليم ملفات التصميم منظمة للمطورين", en: "Design files handed over, organised for developers" }
        ],
        excludes: [
          { ar: "برمجة التطبيق أو النظام", en: "Developing the app or system" },
          { ar: "الشعار والهوية البصرية", en: "Logo and brand identity" }
        ]
      },
      {
        key: "integration",
        icon: "Plug",
        name: { ar: "ربط الأنظمة", en: "System integration" },
        tagline: { ar: "نظامان يتبادلان البيانات وحدهما", en: "Two systems exchanging data by themselves" },
        idealFor: { ar: "الشركات التي تعيد إدخال نفس البيانات في أكثر من نظام", en: "Companies re-entering the same data in several systems" },
        price: 6599,
        from: true,
        ...oneTime,
        delivery: { ar: "من 7 أيام عمل", en: "From 7 business days" },
        features: [
          { ar: "ربط نظامين عبر واجهاتهما البرمجية الموثقة", en: "Two systems connected through their documented APIs" },
          { ar: "مزامنة تلقائية في الاتجاهين عند الحاجة", en: "Automatic two-way sync when needed" },
          { ar: "إعادة المحاولة تلقائياً عند انقطاع أي نظام", en: "Automatic retries when a system is down" },
          { ar: "سجل لكل عملية وتنبيه عند الخطأ", en: "A log of every transfer and alerts on errors" },
          { ar: "دعم لمدة شهر", en: "One month of support" }
        ],
        excludes: [
          { ar: "اشتراكات الأنظمة ورسوم واجهاتها", en: "System subscriptions and API fees" },
          { ar: "الأنظمة التي لا تتيح واجهة برمجية أو تتطلب موافقة طرف ثالث (نوضحها قبل البدء)", en: "Systems without an API or that need a third party's approval (explained before we start)" }
        ]
      },
      {
        key: "dashboard",
        icon: "ChartColumn",
        name: { ar: "لوحة تقارير الإدارة", en: "Management dashboard" },
        tagline: { ar: "أرقام شركتك في شاشة واحدة تتحدث وحدها", en: "Your company's numbers on one self-updating screen" },
        idealFor: { ar: "المديرون الذين يريدون قرارات مبنية على أرقام حقيقية", en: "Managers who want decisions based on real numbers" },
        price: 7699,
        from: true,
        ...oneTime,
        delivery: { ar: "من 10 أيام عمل", en: "From 10 business days" },
        features: [
          { ar: "حتى 12 مؤشراً في لوحة واحدة", en: "Up to 12 KPIs on one dashboard" },
          { ar: "ربط حتى مصدرين للبيانات", en: "Up to 2 data sources connected" },
          { ar: "تحديث تلقائي وصلاحيات لمن يراها", en: "Automatic refresh and access control" },
          { ar: "تقرير أسبوعي بالبريد", en: "A weekly e-mail report" },
          { ar: "دعم لمدة شهر", en: "One month of support" }
        ],
        excludes: [
          { ar: "تراخيص أدوات التقارير إن وُجدت", en: "Reporting tool licences, if any" },
          { ar: "تنظيف بيانات تاريخية كبيرة", en: "Cleaning large historical data" }
        ]
      },
      {
        key: "app-mvp",
        icon: "Rocket",
        name: { ar: "تطبيق ويب أولي (MVP)", en: "Web app MVP" },
        tagline: { ar: "نسخة أولى تعمل لاختبار فكرتك في السوق", en: "A working first version to test your idea" },
        idealFor: { ar: "الشركات الناشئة والمشاريع الجديدة", en: "Start-ups and new ventures" },
        price: 27499,
        from: true,
        ...oneTime,
        delivery: { ar: "من 8 أسابيع حسب النطاق", en: "From 8 weeks, depending on scope" },
        features: [
          { ar: "تحليل المتطلبات ووثيقة نطاق محددة", en: "Requirements analysis and a defined scope" },
          { ar: "واجهات أساسية بالعربي والإنجليزي", en: "Core screens in Arabic and English" },
          { ar: "قاعدة بيانات وحسابات مستخدمين عند الحاجة", en: "A database and user accounts when needed" },
          { ar: "اختبارات قبل التسليم", en: "Testing before hand-over" },
          { ar: "تسليم موثق ودعم لمدة 3 أشهر", en: "Documented hand-over and 3 months of support" }
        ],
        excludes: [
          { ar: "تطبيقات الآيفون والأندرويد الأصلية", en: "Native iOS and Android apps" },
          { ar: "الاستضافة والخدمات الخارجية", en: "Hosting and third-party services" }
        ]
      },
      {
        key: "enterprise-systems",
        icon: "Building2",
        name: { ar: "أنظمة الشركات والتكاملات", en: "Enterprise systems & integrations" },
        tagline: { ar: "نظام على مقاس عمليات شركتك", en: "A system built around your operations" },
        idealFor: { ar: "الشركات المتوسطة والكبيرة ذات العمليات والأنظمة المتعددة", en: "Mid-size and large companies with many processes and systems" },
        price: 38500,
        from: true,
        indicative: true,
        ...oneTime,
        delivery: { ar: "تُحدَّد بعد دراسة المتطلبات", en: "Set after the requirements study" },
        features: [
          { ar: "دراسة متطلبات ووثيقة نطاق ومراحل تسليم وعرض سعر مخصص", en: "A requirements study, a scope document, delivery stages and a custom quote" },
          { ar: "لوحات إدارة وأدوار وصلاحيات", en: "Admin dashboards, roles and permissions" },
          { ar: "تكاملات مع أنظمتك (ERP، المحاسبة، نظام العملاء) حسب الدراسة", en: "Integrations with your systems (ERP, accounting, CRM) per the study" },
          { ar: "تقارير ومؤشرات للإدارة", en: "Reports and KPIs for management" },
          { ar: "سجل تدقيق وحماية للبيانات", en: "Audit trail and data protection" },
          { ar: "تسليم على مراحل ودعم وصيانة", en: "Staged delivery, support and maintenance" }
        ],
        excludes: [
          { ar: "الخوادم والتراخيص الخارجية", en: "Servers and third-party licences" },
          { ar: "تطبيقات الجوال الأصلية (تُسعَّر منفصلة)", en: "Native mobile apps (priced separately)" }
        ]
      }
    ]
  },
  {
    id: "dedicated-tech-team",
    segment: "business",
    service: "dedicated-tech-team",
    icon: "Users",
    title: { ar: "باقات الفريق التقني المتكامل", en: "Dedicated tech team plans" },
    short: { ar: "فريق تقني", en: "Tech team" },
    text: { ar: "فريق تقني يعمل لشركتك شهرياً بدون أعباء التوظيف.", en: "A tech team working for your company every month, without the hiring burden." },
    highlights: [{ ar: "مطور ومصمم ومدير مشروع لشركتك", en: "A developer, designer and project manager for you" }, { ar: "120 ساعة مشتركة للفريق شهرياً حسب أولوياتك", en: "120 shared team hours a month on your priorities" }, { ar: "بلا أعباء توظيف أو تأمينات", en: "No hiring or payroll burden" }],
    notice: { ar: "الفريق في كل الباقات: مطور برمجيات متكامل، ومصمم واجهات وتجربة مستخدم، ومدير مشروع. الـ 120 ساعة شهرياً مشتركة للفريق كاملاً — وليست 120 ساعة لكل فرد — وتُوزَّع بين التطوير والتصميم وإدارة المشروع حسب أولويات تتفق عليها كل شهر. العمل والدعم في أيام وساعات العمل الرسمية، والساعات الإضافية تُعتمد مسبقاً. الفرق بين الباقات في مدة الالتزام والسعر الشهري وترحيل الساعات والمزايا.", en: "Every plan: a Full-Stack developer, a UI/UX designer and a project manager. The 120 hours a month are shared by the whole team — not 120 hours per person — and split between development, design and project management by priorities you agree each month. Work and support run on official business days and hours; extra hours are approved in advance. Plans differ in term, monthly price, hour rollover and extras." },
    tiers: [
      {
        key: "team-monthly",
        icon: "CalendarClock",
        name: { ar: "الشهري", en: "Monthly" },
        tagline: { ar: "مرونة كاملة شهراً بشهر", en: "Full flexibility, month to month" },
        idealFor: { ar: "مشروع قصير أو تجربة العمل معنا قبل الالتزام", en: "A short project, or trying us before committing" },
        price: 13500,
        from: false,
        ...perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        features: [
          { ar: "120 ساعة عمل مشتركة للفريق كاملاً شهرياً", en: "120 shared team hours a month" },
          { ar: "اجتماع أسبوعي ومتابعة يومية على قناة مشتركة", en: "A weekly meeting and daily updates on a shared channel" },
          { ar: "تعديل الأولويات ونطاق العمل كل شهر", en: "Adjust priorities and scope every month" },
          { ar: "تقرير إنجاز شهري بالساعات والمهام", en: "A monthly report of hours and tasks" },
          { ar: "إلغاء بإشعار قبل 30 يوماً", en: "Cancel with 30 days' notice" }
        ],
        excludes: [
          { ar: "الاستضافة وتراخيص الأدوات الخارجية", en: "Hosting and third-party tool licences" },
          { ar: "الساعات غير المستخدمة لا تُرحَّل", en: "Unused hours don't roll over" }
        ]
      },
      {
        key: "team-semiannual",
        icon: "Calendar",
        name: { ar: "النصف سنوي", en: "Six-month" },
        tagline: { ar: "خطة تطوير واضحة بسعر أفضل", en: "A clear development plan at a better rate" },
        idealFor: { ar: "الشركات التي لديها خطة تطوير لعدة أشهر", en: "Companies with a multi-month development plan" },
        price: 12400,
        from: false,
        ...perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        featured: true,
        features: [
          { ar: "120 ساعة مشتركة للفريق شهرياً — وفّر 8% عن الشهري", en: "120 shared team hours a month — 8% below monthly" },
          { ar: "خطة تطوير مكتوبة لستة أشهر", en: "A written six-month development plan" },
          { ar: "ترحيل حتى 20 ساعة غير مستخدمة للشهر التالي فقط", en: "Roll over up to 20 unused hours to the next month only" },
          { ar: "مراجعة أداء ربع سنوية مع الإدارة", en: "A quarterly performance review with management" },
          { ar: "أولوية في جدولة المهام العاجلة", en: "Priority scheduling for urgent tasks" }
        ],
        excludes: [{ ar: "الاستضافة وتراخيص الأدوات الخارجية", en: "Hosting and third-party tool licences" }]
      },
      {
        key: "team-annual",
        icon: "Award",
        name: { ar: "السنوي", en: "Annual" },
        tagline: { ar: "شريك تقني طويل المدى", en: "A long-term technology partner" },
        idealFor: { ar: "الشركات التي تريد فريقاً تقنياً ثابتاً بدل التوظيف", en: "Companies that want a steady tech team instead of hiring" },
        price: 11200,
        from: false,
        ...perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        features: [
          { ar: "120 ساعة مشتركة للفريق شهرياً — وفّر 17% عن الشهري", en: "120 shared team hours a month — 17% below monthly" },
          { ar: "نفس أعضاء الفريق طوال السنة", en: "The same team members all year" },
          { ar: "خارطة طريق تقنية سنوية", en: "An annual technology roadmap" },
          { ar: "ترحيل حتى 30 ساعة غير مستخدمة للشهر التالي فقط", en: "Roll over up to 30 unused hours to the next month only" },
          { ar: "مراجعة جودة واختبار قبل كل إصدار", en: "QA review and testing before every release" },
          { ar: "أعلى أولوية في الدعم خلال ساعات العمل", en: "Top support priority during business hours" }
        ],
        excludes: [{ ar: "الاستضافة وتراخيص الأدوات الخارجية", en: "Hosting and third-party tool licences" }]
      }
    ]
  }
];

/**
 * Extra questions the request form asks on an offer page, by service. Answers travel as `details` (whitelisted keys
 * below, max 200 chars each) and land in the CRM lead and the company e-mail.
 */
export const LEAD_DETAIL_LABELS = {
  businessType: "مجال النشاط",
  productType: "نوع المنتجات",
  hasStore: "حساب سلة أو زد",
  productCount: "عدد المنتجات",
  pages: "عدد الصفحات",
  language: "اللغة",
  targetDate: "الموعد المستهدف",
  adBudget: "الميزانية الإعلانية الشهرية",
  platforms: "المنصات",
  website: "رابط الموقع أو المتجر",
  accounts: "الحسابات الحالية",
  goals: "الأهداف",
  currentSystems: "الأنظمة الحالية",
  projectType: "نوع المشروع",
  timeline: "المدة المطلوبة",
  volume: "حجم الرسائل أو الطلبات"
} as const;
export type LeadDetailKey = keyof typeof LEAD_DETAIL_LABELS;
export type LeadQuestion = { key: LeadDetailKey; label: L; options?: L[]; placeholder?: L };
const opt = (ar: string, en: string): L => ({ ar, en });
const businessType: LeadQuestion = { key: "businessType", label: { ar: "مجال النشاط", en: "Business field" }, placeholder: { ar: "مثلاً: عطور، مقاولات، عيادة", en: "e.g. perfumes, contracting, clinic" } };
const goals: LeadQuestion = { key: "goals", label: { ar: "ماذا تريد أن تحقق؟", en: "What do you want to achieve?" } };
export const leadQuestions: Record<string, LeadQuestion[]> = {
  ecommerce: [
    { key: "productType", label: { ar: "نوع المنتجات", en: "Product type" }, placeholder: { ar: "مثلاً: ملابس، عطور، أغذية", en: "e.g. clothing, perfume, food" } },
    { key: "hasStore", label: { ar: "هل لديك حساب على سلة أو زد؟", en: "Do you have a Salla or Zid account?" }, options: [opt("نعم — سلة", "Yes — Salla"), opt("نعم — زد", "Yes — Zid"), opt("لا، أحتاج مساعدة في الاختيار", "No, help me choose")] },
    { key: "productCount", label: { ar: "عدد المنتجات", en: "Number of products" }, options: [opt("حتى 30", "Up to 30"), opt("30 – 100", "30 – 100"), opt("أكثر من 100", "More than 100")] }
  ],
  "web-development": [
    { ...businessType, label: { ar: "نوع الشركة", en: "Type of company" } },
    { key: "pages", label: { ar: "عدد الصفحات", en: "Number of pages" }, options: [opt("حتى 5", "Up to 5"), opt("6 – 15", "6 – 15"), opt("أكثر من 15", "More than 15")] },
    { key: "language", label: { ar: "اللغة", en: "Language" }, options: [opt("العربية", "Arabic"), opt("الإنجليزية", "English"), opt("العربية والإنجليزية", "Arabic and English")] },
    { key: "targetDate", label: { ar: "متى تريد الإطلاق؟", en: "When do you want to launch?" }, options: [opt("خلال أسبوعين", "Within two weeks"), opt("خلال شهر", "Within a month"), opt("مرن", "Flexible")] }
  ],
  "digital-marketing": [
    businessType,
    { key: "adBudget", label: { ar: "الميزانية الإعلانية الشهرية", en: "Monthly ad budget" }, options: [opt("أقل من 1,500", "Under 1,500"), opt("1,500 – 5,000", "1,500 – 5,000"), opt("5,000 – 15,000", "5,000 – 15,000"), opt("أكثر من 15,000", "Over 15,000")] },
    { key: "platforms", label: { ar: "المنصات التي تهمك", en: "Platforms you care about" }, placeholder: { ar: "سناب، تيك توك، إنستغرام، جوجل…", en: "Snap, TikTok, Instagram, Google…" } },
    { key: "website", label: { ar: "رابط موقعك أو متجرك", en: "Your site or store link" } },
    { key: "accounts", label: { ar: "حساباتك الحالية", en: "Your current accounts" }, placeholder: { ar: "مثلاً: @yourbrand", en: "e.g. @yourbrand" } },
    goals
  ],
  "whatsapp-automation": [
    businessType,
    { key: "volume", label: { ar: "عدد الرسائل يومياً تقريباً", en: "Messages per day, roughly" }, options: [opt("أقل من 50", "Under 50"), opt("50 – 200", "50 – 200"), opt("أكثر من 200", "Over 200")] },
    { key: "currentSystems", label: { ar: "الأنظمة التي تستخدمها", en: "Systems you use" }, placeholder: { ar: "مثلاً: سلة، نظام عملاء، جداول", en: "e.g. Salla, a CRM, spreadsheets" } }
  ],
  "ai-automation": [
    businessType,
    { key: "currentSystems", label: { ar: "الأنظمة والأدوات التي تستخدمها", en: "Systems and tools you use" } },
    goals
  ],
  business: [
    { key: "projectType", label: { ar: "نوع المشروع", en: "Project type" }, placeholder: { ar: "نظام إداري، تطبيق، تكامل، فريق…", en: "Management system, app, integration, team…" } },
    { key: "timeline", label: { ar: "المدة المطلوبة", en: "Timeline" }, options: [opt("أقل من شهرين", "Under two months"), opt("2 – 6 أشهر", "2 – 6 months"), opt("أكثر من 6 أشهر", "Over 6 months")] },
    { key: "currentSystems", label: { ar: "الأنظمة الحالية", en: "Current systems" } }
  ]
};
/** The questions for an offer page: by service, with the company-solution services sharing one set. */
export const questionsFor = (service: string) => leadQuestions[service] ?? (["dedicated-tech-team", "digital-transformation", "ux-ui-design"].includes(service) ? leadQuestions.business : []);

/**
 * Short, stable links for ads (/offers/<alias>) → the package or campaign they open. The form still sends the real key,
 * so the CRM and the e-mail always name the real item.
 */
export const offerAliases: Record<string, string> = {
  "store-marketing": "store-growth",
  "business-website": "web-starter",
  "ads-launch": "ads-launch"
};
/** Section links (/offers/<alias>) → the packages tab they open on /offers. */
export const groupAliases: Record<string, string> = {
  marketing: "digital-marketing",
  "social-media": "social-media",
  websites: "web-development",
  stores: "ecommerce",
  whatsapp: "whatsapp-automation",
  "business-automation": "ai-automation",
  "app-development": "software-development",
  "enterprise-solutions": "software-development",
  "dedicated-team": "dedicated-tech-team"
};

/**
 * Limited-time campaigns. The self-renewing daily deals and weekly offers were stopped on 2026-11-05; a campaign is
 * added here only with the company's approval, real start / end dates and a `basis` of current fixed-price packages
 * (see `Offer`). AI packages have "from" prices only, so they can't back a campaign.
 *
 * 1–14 Dec 2026, year-end and Ramadan-season preparation: four campaigns 13–18% below the current packages. They start
 * after the raised prices of 2026-11-05 are live, so the struck price is one the site really charged; none is cheaper
 * per month than a permanent plan for the same thing (the WhatsApp one is below the yearly WhatsApp price).
 */
const SEASON = { startsAt: "2026-12-01", endsAt: "2026-12-14", approved: "طلب المالك — 2026-11-05" };
const lockPrice: L = { ar: "يُثبَّت سعر العرض للطلبات المرسلة حتى نهاية 14 ديسمبر 2026", en: "The offer price is kept for requests sent by the end of 14 December 2026" };
const halfHalf: L = { ar: "الدفع: 50% عند البدء و50% عند التسليم", en: "Payment: 50% to start, 50% on delivery" };
const sameScope: L = { ar: "النطاق والحدود نفسها المكتوبة في الباقة", en: "The same scope and limits as written in the package" };

export const offers: Offer[] = [
  {
    slug: "ramadan-store",
    service: "ecommerce",
    icon: "ShoppingCart",
    badge: { ar: "عرض الاستعداد لرمضان — المتاجر", en: "Ramadan-season prep — stores" },
    title: { ar: "جهّز متجرك قبل موسم رمضان: متجر النمو + شهر حملات", en: "Get your store ready for Ramadan: Growth store + a month of ads" },
    text: { ar: "«متجر النمو» مع أول شهر من باقة «البداية» للحملات بسعر واحد — متجر بهويتك جاهز للبيع والإعلان، وحملة تُدار في شهرها الأول.", en: "The Growth store with the first month of the Starter ads plan at one price — a store in your brand ready to sell and advertise, with a campaign run in its first month." },
    forWho: { ar: "للعلامات التي تبيع على إنستغرام أو واتساب وتريد متجراً حقيقياً قبل موسم رمضان.", en: "For brands selling on Instagram or WhatsApp that want a real store before the Ramadan season." },
    features: [
      { ar: "متجر على زد أو سلة بهويتك وحتى 100 منتج", en: "A Zid or Salla store in your brand, up to 100 products" },
      { ar: "الدفع والشحن والتتبع جاهزة للإعلان", en: "Payments, shipping and tracking ready for ads" },
      { ar: "10 تصاميم إطلاق للسوشيال ميديا", en: "10 social media launch designs" },
      { ar: "شهر إدارة حملة على منصة واحدة", en: "One month of campaign management on one platform" }
    ],
    deliverables: [
      { title: { ar: "المتجر", en: "The store" }, text: { ar: "كل ما في باقة «متجر النمو»: تخصيص الواجهات ضمن إمكانيات المنصة، وحتى 100 منتج، والدفع والشحن المتاحة لحسابك.", en: "Everything in the Growth store: storefront customised within the platform, up to 100 products, the payments and shipping available to your account." } },
      { title: { ar: "التتبع", en: "Tracking" }, text: { ar: "بكسل سناب وتيك توك وميتا وتحليلات جوجل بتتبع السلة والشراء.", en: "Snap, TikTok and Meta pixels and Google Analytics tracking cart and purchases." } },
      { title: { ar: "الحملة", en: "The campaign" }, text: { ar: "حملة نشطة واحدة على منصة واحدة، ومادتان إعلانيتان، ومتابعة أسبوعية لمدة شهر، وتقرير.", en: "One active campaign on one platform, two creatives, weekly optimisation for a month and a report." } }
    ],
    delivery: { ar: "المتجر خلال 10 أيام عمل من استلام المحتوى والصلاحيات، ثم شهر الحملة", en: "The store in 10 business days from receiving content and access, then the campaign month" },
    terms: [lockPrice, halfHalf, sameScope, { ar: "مدة التنفيذ تبدأ من استلام المحتوى والصلاحيات — أرسلها مبكراً ليكون متجرك جاهزاً قبل رمضان", en: "Delivery time starts when we receive content and access — send them early to be ready before Ramadan" }],
    excludes: [
      { ar: "اشتراك المنصة ورسوم الدفع والشحن", en: "Platform subscription, payment and shipping fees" },
      { ar: "الميزانية الإعلانية (تُدفع من حسابك)", en: "Ad spend (paid from your account)" },
      { ar: "تصوير المنتجات", en: "Product photography" }
    ],
    price: 7499,
    basis: [{ key: "store-growth" }, { key: "mkt-start" }],
    ...SEASON
  },
  {
    slug: "business-website-season",
    service: "web-development",
    icon: "Rocket",
    badge: { ar: "عرض لفترة محدودة — المواقع", en: "Limited-time offer — websites" },
    title: { ar: "موقع شركتك بالعربي والإنجليزي قبل بداية 2027", en: "Your bilingual company website before 2027" },
    text: { ar: "باقة «موقع الأعمال» كاملة بسعر العرض: حتى 15 صفحة بالعربية والإنجليزية بتصميم مخصص، ولوحة تحكم ومدونة، واستضافة ونطاق للسنة الأولى.", en: "The full Business website package at the offer price: up to 15 custom-designed pages in Arabic and English, a content panel and blog, hosting and domain for year one." },
    forWho: { ar: "للشركات التي تعتمد على موقعها في جلب العملاء وتريد إطلاقه قبل السنة الجديدة.", en: "For companies that rely on their website for leads and want it live before the new year." },
    features: [
      { ar: "حتى 15 صفحة بالعربية والإنجليزية", en: "Up to 15 pages in Arabic and English" },
      { ar: "تصميم مخصص ولوحة تحكم ومدونة", en: "Custom design, content panel and blog" },
      { ar: "استضافة ونطاق للسنة الأولى", en: "Hosting and domain for year one" },
      { ar: "3 أشهر دعم", en: "3 months of support" }
    ],
    deliverables: [
      { title: { ar: "التصميم", en: "Design" }, text: { ar: "تصميم مخصص بهوية شركتك، متجاوب مع الجوال، مع جولتي تعديل.", en: "A custom design in your brand, mobile-first, with two revision rounds." } },
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "لوحة لتعديل النصوص والصور والمقالات، ومدونة.", en: "A panel to edit text, images and articles, and a blog." } },
      { title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "التحليلات وبكسل الإعلانات والتهيئة التقنية لمحركات البحث، واستضافة ونطاق للسنة الأولى.", en: "Analytics, ad pixels and technical SEO, hosting and domain for year one." } }
    ],
    delivery: { ar: "21 يوم عمل من استلام المحتوى والصلاحيات", en: "21 business days from receiving content and access" },
    terms: [lockPrice, halfHalf, sameScope],
    excludes: [
      { ar: "كتابة المحتوى والتصوير", en: "Copywriting and photography" },
      { ar: "تجديد الاستضافة والنطاق بعد السنة الأولى", en: "Hosting and domain renewal after year one" }
    ],
    price: 9499,
    basis: [{ key: "web-growth" }],
    ...SEASON
  },
  {
    slug: "landing-campaign-season",
    service: "digital-marketing",
    icon: "MousePointerClick",
    badge: { ar: "عرض نهاية السنة — صفحة وحملة", en: "Year-end offer — page + campaign" },
    title: { ar: "صفحة هبوط + أول شهر حملات لعرضك القادم", en: "A landing page + your first month of ads for your next offer" },
    text: { ar: "«صفحة هبوط احترافية» مع أول شهر من «البداية» للحملات بسعر واحد — صفحة واحدة لعرضك وحملة تُدار وتُقاس.", en: "A professional landing page with the first month of the Starter ads plan at one price — one page for your offer and a managed, measured campaign." },
    forWho: { ar: "لمن عنده منتج أو خدمة أو عرض يريد الإعلان عنه في بداية السنة أو موسم رمضان.", en: "For anyone with a product, service or offer to advertise at the start of the year or in Ramadan." },
    features: [
      { ar: "صفحة هبوط بنموذج طلب وزر واتساب", en: "A landing page with an order form and WhatsApp button" },
      { ar: "تحليلات جوجل وبكسل منصة واحدة", en: "Google Analytics and one platform pixel" },
      { ar: "حملة على منصة واحدة ومادتان إعلانيتان", en: "A campaign on one platform and two creatives" },
      { ar: "متابعة أسبوعية وتقرير", en: "Weekly optimisation and a report" }
    ],
    deliverables: [
      { title: { ar: "الصفحة", en: "The page" }, text: { ar: "كل ما في «صفحة هبوط احترافية» مع جولتي تعديل.", en: "Everything in the professional landing page, with two revision rounds." } },
      { title: { ar: "الحملة", en: "The campaign" }, text: { ar: "شهر من باقة «البداية»: حملة نشطة واحدة لإنفاق حتى 5,000 ريال، ومتابعة أسبوعية وتقرير.", en: "A month of the Starter plan: one active campaign for spend up to SAR 5,000, weekly optimisation and a report." } }
    ],
    delivery: { ar: "الصفحة خلال 5 أيام عمل، ثم شهر الحملة", en: "The page in 5 business days, then the campaign month" },
    terms: [lockPrice, halfHalf, sameScope],
    excludes: [
      { ar: "الميزانية الإعلانية (تُدفع من حسابك)", en: "Ad spend (paid from your account)" },
      { ar: "الاستضافة والنطاق إن لم تكن لديك", en: "Hosting and domain if you don't have them" }
    ],
    price: 4299,
    basis: [{ key: "landing-page" }, { key: "mkt-start" }],
    ...SEASON
  },
  {
    slug: "whatsapp-season",
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    badge: { ar: "عرض الاستعداد لرمضان — واتساب", en: "Ramadan-season prep — WhatsApp" },
    title: { ar: "واتساب الاحترافية 3 أشهر: رد أسرع على عملاء رمضان", en: "WhatsApp Professional for 3 months: faster replies through Ramadan" },
    text: { ar: "باقة «الاحترافية» لثلاثة أشهر بسعر العرض: رقم رسمي، وبوت يرد ويؤهل العملاء ويحوّلهم لفريقك، وصندوق محادثات لمستخدمَين.", en: "The Professional plan for three months at the offer price: an official number, a bot that answers, qualifies and routes clients to your team, and an inbox for two users." },
    forWho: { ar: "للمتاجر والشركات التي تزيد رسائلها في موسم رمضان.", en: "For stores and companies whose messages peak in Ramadan." },
    features: [
      { ar: "رقم رسمي على منصة واتساب للأعمال", en: "An official number on the WhatsApp Business Platform" },
      { ar: "شات بوت بمسارات مصممة لنشاطك", en: "A chatbot with flows designed for you" },
      { ar: "مستخدمان وتوزيع المحادثات", en: "Two users and conversation routing" },
      { ar: "10 قوالب رسائل معتمدة", en: "10 approved message templates" }
    ],
    deliverables: [
      { title: { ar: "الإعداد", en: "Set-up" }, text: { ar: "ربط رقمك وتوثيق نشاطك لدى ميتا، وتصميم المسارات والقوالب.", en: "Your number connected and business verified with Meta, flows and templates designed." } },
      { title: { ar: "3 أشهر تشغيل", en: "3 months running" }, text: { ar: "كل ما في باقة «الاحترافية» لمدة 3 أشهر مع تقرير شهري.", en: "Everything in the Professional plan for 3 months, with a monthly report." } }
    ],
    delivery: { ar: "7 أيام عمل بعد اعتماد ميتا", en: "7 business days after Meta approval" },
    terms: [lockPrice, { ar: "يُدفع مقدماً عن الأشهر الثلاثة، ثم يستمر بالسعر الشهري المعلن إن رغبت", en: "Paid upfront for the three months, then continues at the published monthly price if you wish" }, { ar: "اعتماد الحساب والقوالب يخضع لموافقة ميتا", en: "Account and template approval is subject to Meta" }],
    excludes: [
      { ar: "رسوم رسائل ميتا (التسويقية والحملات) حسب أسعار ميتا", en: "Meta message fees (marketing and campaigns) at Meta's prices" },
      { ar: "الذكاء الاصطناعي وتكامل الأنظمة", en: "AI and system integration" }
    ],
    price: 3199,
    basis: [{ key: "wa-pro", months: 3 }],
    ...SEASON
  }
];

/**
 * The self-renewing deals and offers stopped on 2026-11-05 → the package each was built on. Their links (shared with
 * clients and used in ads) now open that package at its current price; `null` (/offers/today) opens /offers.
 */
export const retiredOffers: Record<string, string | null> = {
  "store-week": "store-launch",
  "web-week": "web-growth",
  "marketing-week": "mkt-growth",
  "ai-agent-week": "ai-assistant",
  "whatsapp-year-week": "wa-pro",
  "system-week": "app-mvp",
  "day-automation": "ai-auto-starter",
  "day-website": "web-starter",
  "day-store": "store-launch",
  "day-ai-bot": "ai-site-bot",
  "day-marketing": "mkt-start",
  "day-whatsapp": "wa-pro",
  "day-integration": "integration",
  "day-landing": "landing-page",
  "day-social": "social-engage",
  "day-dashboard": "dashboard",
  "day-ads": "ads-launch",
  "day-store-growth": "store-growth",
  today: null
};

export const deals: Deal[] = [
  {
    token: "example-k3v9q2",
    client: { ar: "شركة المثال التجارية", en: "Example Trading Co." },
    title: { ar: "عرض خاص: موقع ومتجر وواتساب", en: "Special offer: website, store and WhatsApp" },
    text: { ar: "مثال لصفقة خاصة بعميل واحد — رابطها لا يظهر في الموقع ولا في محركات البحث.", en: "An example single-client deal — its link is not listed on the site or in search engines." },
    items: [
      { label: { ar: "موقع الشركة — موقع الأعمال", en: "Company website — Business website" }, price: 10999 },
      { label: { ar: "متجر إلكتروني — متجر النمو", en: "Online store — Growth store" }, price: 6599 },
      { label: { ar: "واتساب للأعمال — الاحترافية (3 أشهر)", en: "WhatsApp — Professional (3 months)" }, price: 3897 }
    ],
    total: 21495,
    expiresAt: "2030-12-31",
    preview: true
  }
];

/** Design examples (`preview`) and unapproved groups (`draft`) exist in development only. */
const live = (x: { preview?: boolean; draft?: boolean }) => !(x.preview || x.draft) || process.env.NODE_ENV !== "production";
/** The package groups visitors may see (drafts only in development). */
export const visibleGroups = () => packageGroups.filter(live);
const day = (s: string) => new Date(`${s}T00:00:00+03:00`);
/** End of the given Riyadh day as an ISO instant (private deals and campaigns run through their last day). */
export const offerEndInstant = (s: string) => new Date(day(s).getTime() + 86_400_000).toISOString();

/** A visible package by key, with its group. */
export function findTier(key: string) {
  for (const g of visibleGroups()) {
    const t = g.tiers.find((x) => x.key === key);
    if (t) return { group: g, tier: t };
  }
  return null;
}
/** What a campaign's parts cost today at the published package prices; null when a part has no fixed price or is gone. */
export function basisPrice(o: Offer): number | null {
  let sum = 0;
  for (const b of o.basis) {
    const t = findTier(b.key)?.tier;
    const p = !t || t.from ? null : b.annual ? (t.annual ?? null) : t.price === null ? null : t.price * (b.months ?? 1);
    if (p === null) return null;
    sum += p;
  }
  return o.basis.length ? sum : null;
}
/** live = approved, within its dates and cheaper than its parts; scheduled / ended by date; invalid = never shown. */
export function offerStatus(o: Offer, now = new Date()): "live" | "scheduled" | "ended" | "invalid" {
  const base = basisPrice(o);
  if (!o.approved || base === null || o.price >= base || o.endsAt < o.startsAt) return "invalid";
  if (now < day(o.startsAt)) return "scheduled";
  if (now >= new Date(offerEndInstant(o.endsAt))) return "ended";
  return "live";
}
/** Campaigns running now. */
export function activeOffers(now = new Date(), list = offers) {
  return list.filter((o) => offerStatus(o, now) === "live");
}
export function findOffer(slug: string, now = new Date(), list = offers) {
  return activeOffers(now, list).find((o) => o.slug === slug) ?? null;
}
/** A private deal by its token: `expired` once past expiresAt (the page then says so instead of showing it). */
export function findDeal(token: string, now = new Date()) {
  const d = deals.find((x) => x.token === token && live(x));
  if (!d) return null;
  return { deal: d, expired: now >= new Date(offerEndInstant(d.expiresAt)) };
}

const sar = (n: number) => `${n.toLocaleString("en-US")} ر.س`;
/** What a form key stands for ("pkg:web-growth", "offer:<slug>", "deal:<token>"), in Arabic for the CRM / e-mail. */
export function offerLabel(key: string): string | null {
  const [kind, id] = key.split(":");
  if (kind === "pkg") {
    const f = findTier(id);
    if (f) return `${f.group.title.ar} — ${f.tier.name.ar}`;
  }
  if (kind === "offer") {
    const o = offers.find((x) => x.slug === id);
    if (o) return `عرض لفترة محدودة: ${o.title.ar}`;
    if (id in retiredOffers) return `عرض سابق متوقف (${id})`;
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (d) return `صفقة خاصة: ${d.title.ar} (${d.client.ar})`;
  }
  return null;
}
/**
 * The reference price of a form key at the moment of the request, resolved on the server (never from the visitor):
 * amount, how it is paid and one Arabic line for the CRM lead and the e-mail. null when the key has no price.
 */
export function offerReference(key: string): { price: number; from: boolean; billing: Billing; termMonths: number | null; text: string } | null {
  const [kind, id] = key.split(":");
  const vat = "قبل ضريبة القيمة المضافة 15%";
  if (kind === "pkg") {
    const t = findTier(id)?.tier;
    if (!t || t.price === null) return null;
    const lead = t.from ? (t.indicative ? "مؤشر أولي من " : "يبدأ من ") : "";
    const avg = t.termMonths ? ` (متوسط ${sar(Math.round(t.price / t.termMonths))} شهرياً)` : "";
    return { price: t.price, from: t.from, billing: t.billing, termMonths: t.termMonths ?? null, text: `${lead}${sar(t.price)} — ${t.period?.ar ?? ""}${avg}، ${vat}` };
  }
  if (kind === "offer") {
    const o = findOffer(id);
    const base = o ? basisPrice(o) : null;
    if (!o || base === null) return null;
    return { price: o.price, from: false, billing: "one-time", termMonths: null, text: `${sar(o.price)} بدل ${sar(base)} حتى ${o.endsAt}، ${vat}` };
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (!d || d.total === null) return null;
    return { price: d.total, from: false, billing: "one-time", termMonths: null, text: `${sar(d.total)}، ${vat}` };
  }
  return null;
}

export const offersCopy = {
  eyebrow: { ar: "الباقات والعروض", en: "Packages & offers" } as L,
  title: { ar: "حلول تقنية وتسويقية *تساعد أعمالك تنمو*", en: "Tech and marketing solutions *that help your business grow*" } as L,
  sub: { ar: "مواقع ومتاجر إلكترونية، تسويق رقمي، ذكاء اصطناعي وأتمتة أعمال. اختر الحل المناسب لمرحلة مشروعك بخدمات واضحة وأسعار شفافة.", en: "Websites and online stores, digital marketing, AI and business automation. Choose the solution that fits your stage, with clear services and transparent prices." } as L,
  seePackages: { ar: "تصفح الباقات", en: "Browse packages" } as L,
  whatsapp: { ar: "اسألنا على واتساب", en: "Ask us on WhatsApp" } as L,
  offersTitle: { ar: "عروض *لفترة محدودة*", en: "Limited-time *offers*" } as L,
  offersNote: { ar: "لكل عرض تاريخ بداية ونهاية معلن، والسعر قبل الخصم هو سعر الباقة الحالي — يُثبَّت السعر للطلبات المرسلة قبل انتهاء العرض.", en: "Every offer has a published start and end date, and the price before discount is the package's current price — requests sent before it ends keep the price." } as L,
  campaign: { ar: "عرض لفترة محدودة", en: "Limited-time offer" } as L,
  forWho: { ar: "لمن هذا العرض؟", en: "Who is it for?" } as L,
  deliverables: { ar: "ماذا ستستلم بالتفصيل", en: "Exactly what you get" } as L,
  delivery: { ar: "مدة التنفيذ", en: "Delivery time" } as L,
  terms: { ar: "الشروط", en: "Conditions" } as L,
  excludes: { ar: "لا يشمل العرض", en: "Not included" } as L,
  seconds: { ar: "ثانية", en: "s" } as L,
  save: { ar: "وفّر", en: "Save" } as L,
  /** {n} = the discount percentage */
  off: { ar: "خصم {n}%", en: "{n}% off" } as L,
  details: { ar: "التفاصيل والطلب", en: "Details & order" } as L,
  packagesTitle: { ar: "الباقات", en: "Packages" } as L,
  packagesSub: { ar: "أسعار واضحة قبل الضريبة، وكل باقة تذكر ما تشمله وحدودها وما لا تشمله. «يبدأ من» سعر النطاق الأساسي المكتوب فقط، والسعر النهائي بعد تحليل احتياجك.", en: "Clear prices before VAT; every package states what it includes, its limits and what it doesn't. \"From\" covers the written base scope only — the final price follows an analysis of your needs." } as L,
  mostPopular: { ar: "الباقة المقترحة", en: "Recommended" } as L,
  idealFor: { ar: "مناسبة لـ", en: "Best for" } as L,
  notIncluded: { ar: "غير مشمول", en: "Not included" } as L,
  from: { ar: "يبدأ من", en: "From" } as L,
  indicative: { ar: "مؤشر أولي من", en: "Initial indication from" } as L,
  inclVat: { ar: "شامل الضريبة", en: "incl. VAT" } as L,
  exVat: { ar: "قبل الضريبة", en: "before VAT" } as L,
  monthlyAvg: { ar: "المتوسط الشهري", en: "Monthly average" } as L,
  billing: { "one-time": { ar: "دفعة واحدة", en: "One-time" }, monthly: { ar: "اشتراك شهري", en: "Monthly subscription" }, term: { ar: "عقد 3 أشهر", en: "3-month contract" } } as Record<"one-time" | "monthly" | "term", L>,
  customQuote: { ar: "اطلب عرض سعر مخصص", en: "Request a custom quote" } as L,
  tableTitle: { ar: "مقارنة سريعة بين الباقات", en: "Quick package comparison" } as L,
  tableItem: { ar: "البند", en: "Item" } as L,
  tablePrice: { ar: "السعر قبل الضريبة", en: "Price before VAT" } as L,
  tableBilling: { ar: "نوع الدفع", en: "Billing" } as L,
  draft: { ar: "مسودة للمراجعة — تظهر على جهازك فقط حتى اعتماد الأسعار", en: "Draft for review — visible on your machine only until prices are approved" } as L,
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
  shareWa: { ar: "أرسله لشخص على واتساب", en: "Send it to someone on WhatsApp" } as L,
  orderNow: { ar: "اطلب الآن", en: "Order now" } as L,
  orderWa: { ar: "اطلب على واتساب", en: "Order on WhatsApp" } as L,
  waHello: { ar: "مرحباً DMS Tech، أريد طلب:", en: "Hello DMS Tech, I would like to order:" } as L,
  waPrice: { ar: "السعر", en: "Price" } as L,
  howTitle: { ar: "كيف *نبدأ*؟", en: "How do we *start*?" } as L,
  how: [
    { icon: "Send", title: { ar: "أرسل طلبك", en: "Send your request" }, text: { ar: "من النموذج أو على واتساب، مع اسم الباقة وسعرها المرجعي.", en: "Through the form or WhatsApp, with the package and its reference price." } },
    { icon: "PhoneCall", title: { ar: "نتواصل معك", en: "We call you" }, text: { ar: "خلال يوم عمل لنفهم نشاطك ونؤكد التفاصيل.", en: "Within a business day to understand your business and confirm details." } },
    { icon: "ClipboardList", title: { ar: "عرض وفاتورة", en: "Quote & invoice" }, text: { ar: "نرسل لك عرضاً مكتوباً بالنطاق والسعر، ثم الفاتورة الضريبية للدفعة الأولى.", en: "We send a written quote with the scope and price, then the tax invoice for the first payment." } },
    { icon: "Rocket", title: { ar: "نبدأ التنفيذ", en: "We start" }, text: { ar: "مدير مشروع يتابع معك حتى التسليم في الموعد المكتوب.", en: "A project manager stays with you until delivery on the written date." } }
  ],
  quickFacts: { ar: "باختصار", en: "At a glance" } as L,
  yearly: { ar: "أو سنوياً", en: "or yearly" } as L,
  compareTitle: { ar: "قارن *الباقات*", en: "Compare *packages*" } as L,
  compareSub: { ar: "اختر ما يناسب مرحلة نشاطك — يمكنك الترقية لاحقاً.", en: "Pick what fits your stage — you can upgrade later." } as L,
  current: { ar: "الباقة الحالية", en: "This package" } as L,
  view: { ar: "التفاصيل", en: "Details" } as L,
  allOffers: { ar: "كل الباقات والعروض", en: "All packages & offers" } as L,
  ended: { ar: "انتهى هذا العرض", en: "This offer has ended" } as L,
  endedText: { ar: "يسعدنا مساعدتك بعرض جديد يناسب احتياجك.", en: "We'd be happy to prepare a new offer for you." } as L,
  dealFor: { ar: "عرض خاص مقدَّم إلى", en: "A special offer for" } as L,
  dealItems: { ar: "ما يشمله العرض", en: "What's included" } as L,
  dealTotal: { ar: "الإجمالي", en: "Total" } as L,
  dealOnRequest: { ar: "يُحدد السعر بعد مناقشة التفاصيل معكم", en: "Pricing follows a short discussion with you" } as L,
  dealValid: { ar: "صالح حتى", en: "Valid until" } as L,
  seeOffers: { ar: "استعرض العروض", en: "Browse offers" } as L,
  consult: { ar: "اطلب استشارة", en: "Book a consultation" } as L,
  quote: { ar: "اطلب عرض سعر", en: "Request a quote" } as L,
  solutionsTitle: { ar: "حلول *الشركات*", en: "Business *solutions*" } as L,
  solutionsSub: { ar: "أتمتة بالذكاء الاصطناعي، وأنظمة مخصصة، وفريق تقني متكامل — للشركات المتوسطة والكبيرة. نبدأ بجلسة تحليل، ثم عرض سعر مكتوب بنطاق واضح.", en: "AI automation, custom systems and a complete tech team — for mid-size and large companies. We start with an analysis session, then a written quote with a clear scope." } as L,
  projectsTitle: { ar: "من *أعمالنا*", en: "From *our work*" } as L,
  projectsSub: { ar: "مشاريع حقيقية نفذناها لعملائنا.", en: "Real projects we delivered for our clients." } as L,
  allProjects: { ar: "كل أعمالنا", en: "All our work" } as L,
  termsTitle: { ar: "الشروط العامة", en: "General terms" } as L,
  generalTerms: [
    { ar: "جميع الأسعار بالريال السعودي وقبل ضريبة القيمة المضافة 15%، وتصدر لكل دفعة فاتورة ضريبية.", en: "All prices are in Saudi riyals before 15% VAT, and every payment gets a tax invoice." },
    { ar: "نطاق كل باقة مكتوب في عرض السعر، وأي عمل خارجه يُسعَّر ويُعتمد منك كتابياً قبل تنفيذه.", en: "Every package's scope is written in the quote; any work outside it is priced and approved by you in writing before it is done." },
    { ar: "عدد جولات التعديل مذكور في كل باقة، والتعديلات الإضافية تُسعَّر منفصلة.", en: "Each package states its revision rounds; extra revisions are priced separately." },
    { ar: "تبدأ مدة التنفيذ بعد استلام الدفعة الأولى والمحتوى والصلاحيات المطلوبة واعتماد النطاق، والعميل مسؤول عن توفيرها في وقتها.", en: "Delivery time starts after the first payment, the content and access we need, and scope approval; providing them on time is the client's responsibility." },
    { ar: "رسوم المنصات والاستضافة والنطاقات والإعلانات ورسائل ميتا واستخدام الذكاء الاصطناعي تُدفع باسم العميل وعلى حسابه.", en: "Platform, hosting, domain, advertising, Meta message and AI usage fees are paid by the client, in the client's name." },
    { ar: "الدعم الفني محدود بالمدة المذكورة في الباقة وفي أيام وساعات العمل، ويشمل إصلاح الأعطال لا تطوير مميزات جديدة.", en: "Support is limited to the period each package states, on business days and hours, and covers fixing faults, not building new features." },
    { ar: "يُسلَّم العمل لمراجعتك؛ وإذا لم تصلنا ملاحظات خلال 7 أيام عمل من التسليم يُعد مقبولاً.", en: "Work is delivered for your review; if we receive no comments within 7 business days of delivery, it is considered accepted." },
    { ar: "الاشتراكات الشهرية تتجدد شهرياً حتى إلغائها بإشعار قبل 30 يوماً، والعقود محددة المدة تنتهي بنهاية مدتها ما لم تُجدَّد كتابياً.", en: "Monthly subscriptions renew each month until cancelled with 30 days' notice; fixed-term contracts end with their term unless renewed in writing." },
    { ar: "تنتقل لك ملكية الأعمال المسلَّمة عند سداد المستحقات كاملة، وتبقى المكونات والقوالب والإضافات الخارجية خاضعة لتراخيص أصحابها.", en: "Ownership of the delivered work passes to you once paid in full; third-party components, themes and plug-ins stay under their owners' licences." },
    { ar: "لا نضمن عدد مبيعات أو عملاء أو متابعين أو عائداً إعلانياً أو ترتيباً محدداً في محركات البحث — نلتزم بجودة التنفيذ والقياس الشفاف.", en: "We don't guarantee a number of sales, leads or followers, a return on ad spend or a search ranking — we commit to quality work and transparent measurement." }
  ],
  heroPoints: [
    { ar: "أسعار معلنة بلا رسوم خفية", en: "Published prices, no hidden fees" },
    { ar: "الدفع على دفعات", en: "Pay in instalments" },
    { ar: "فاتورة ضريبية معتمدة", en: "A ZATCA-compliant tax invoice" },
    { ar: "ملكية كاملة لكل ما نبنيه لك", en: "You fully own everything we build" }
  ],
  pickService: { ar: "اختر خدمتك", en: "Pick your service" } as L,
  startsAt: { ar: "يبدأ من", en: "From" } as L,
  aboutService: { ar: "تعرّف على الخدمة", en: "About this service" } as L,
  whyTitle: { ar: "لماذا يختار عملاؤنا *باقاتنا*؟", en: "Why clients choose *our packages*" } as L,
  whySub: { ar: "كل باقة مكتوبة بالتفصيل قبل أن تدفع ريالاً واحداً.", en: "Every package is written in detail before you pay a single riyal." } as L,
  why: [
    { icon: "Tag", title: { ar: "سعر واضح من البداية", en: "A clear price from the start" }, text: { ar: "تعرف ما تشمله الباقة وما لا تشمله — لا مفاجآت في الفاتورة.", en: "You know what's included and what isn't — no surprises on the invoice." } },
    { icon: "ShieldCheck", title: { ar: "ملكية كاملة", en: "Full ownership" }, text: { ar: "المتجر والموقع والحسابات باسمك، ونسلمك كل شيء موثقاً.", en: "The store, site and accounts are in your name, handed over documented." } },
    { icon: "CalendarClock", title: { ar: "مدة تنفيذ مكتوبة", en: "A written delivery time" }, text: { ar: "لكل باقة مدة محددة، ومدير مشروع يتابع معك حتى التسليم.", en: "Every package has a set time and a project manager until delivery." } },
    { icon: "ClipboardList", title: { ar: "فاتورة ضريبية", en: "Tax invoice" }, text: { ar: "فواتير متوافقة مع هيئة الزكاة والضريبة والجمارك.", en: "Invoices compliant with ZATCA." } },
    { icon: "LifeBuoy", title: { ar: "دعم بعد الإطلاق", en: "Support after launch" }, text: { ar: "دعم فني مشمول في كل باقة، ونكمل معك بالتسويق والتطوير.", en: "Support is included in every package, and we keep growing with you." } },
    { icon: "MessagesSquare", title: { ar: "تواصل بالعربي", en: "We speak your language" }, text: { ar: "فريق يفهم السوق السعودي ويرد عليك على واتساب.", en: "A team that knows the Saudi market and answers you on WhatsApp." } }
  ],
  faqTitle: { ar: "أسئلة *متكررة*", en: "Frequently asked *questions*" } as L,
  faqs: [
    { q: { ar: "هل اشتراك زد أو سلة مشمول في باقات المتاجر؟", en: "Is the Zid or Salla subscription included?" }, a: { ar: "لا. اشتراك المنصة يُدفع لها مباشرة وباسمك ليبقى المتجر ملكك، ونساعدك في اختيار الباقة المناسبة لحجم مبيعاتك.", en: "No. You pay the platform directly in your name so the store stays yours; we help you pick the right plan." } },
    { q: { ar: "هل ميزانية الإعلانات ضمن باقات التسويق؟", en: "Is the ad budget part of the marketing plans?" }, a: { ar: "لا. الميزانية تُدفع لمنصات الإعلان من حسابك مباشرة، ونحن ندير الحملات ونحسنها. نوصي بـ 1,500 ريال شهرياً على الأقل للبداية.", en: "No. You pay the ad platforms directly; we run and optimise the campaigns. We recommend at least SAR 1,500 a month to start." } },
    { q: { ar: "كيف يتم الدفع؟", en: "How do I pay?" }, a: { ar: "المشاريع تُدفع على دفعات (عادة 50% عند البدء و50% عند التسليم)، والباقات الشهرية تُدفع شهرياً. نصدر فاتورة ضريبية لكل دفعة.", en: "Projects are paid in instalments (usually 50% to start, 50% on delivery); monthly plans are paid monthly. Every payment gets a tax invoice." } },
    { q: { ar: "هل الأسعار تشمل ضريبة القيمة المضافة؟", en: "Do prices include VAT?" }, a: { ar: "الأسعار المعروضة قبل ضريبة القيمة المضافة 15%.", en: "Prices shown exclude 15% VAT." } },
    { q: { ar: "ما معنى «يبدأ من»؟", en: "What does \"From\" mean?" }, a: { ar: "هو سعر النطاق الأساسي المكتوب في الباقة فقط. بعد جلسة قصيرة لفهم احتياجك نرسل عرض سعر مكتوباً بالنطاق والسعر النهائي قبل أي التزام.", en: "It is the price of the base scope written in the package only. After a short session to understand your needs we send a written quote with the final scope and price before any commitment." } },
    { q: { ar: "كيف أحصل على سعر عرض محدود؟", en: "How do I get a limited-time offer's price?" }, a: { ar: "لكل عرض تاريخ نهاية معلن على صفحته. أرسل الطلب قبل انتهائه ويُثبَّت لك السعر حتى لو بدأنا التنفيذ بعدها.", en: "Every offer shows its end date on its page. Send the request before then and the price is kept, even if work starts later." } },
    { q: { ar: "هل يمكن تعديل الباقة لتناسبني؟", en: "Can a package be tailored to me?" }, a: { ar: "نعم. اطلب عرض سعر مخصص وسنبني لك باقة حسب احتياجك وميزانيتك.", en: "Yes. Ask for a custom quote and we'll build a package around your needs and budget." } },
    { q: { ar: "ماذا يحدث بعد انتهاء الدعم الفني؟", en: "What happens after support ends?" }, a: { ar: "يمكنك الاستمرار معنا بباقة صيانة أو تسويق أو فريق تقني شهري، أو إدارة كل شيء بنفسك — كل شيء باسمك.", en: "Continue with a maintenance, marketing or monthly team plan, or run everything yourself — it's all in your name." } }
  ],
  ctaTitle: { ar: "لم تجد ما يناسبك تماماً؟", en: "Didn't find exactly what you need?" } as L,
  ctaText: { ar: "كلمنا على واتساب أو اطلب عرض سعر مخصص — نرد عليك خلال ساعات العمل.", en: "Message us on WhatsApp or request a custom quote — we reply within working hours." } as L,
  journeyTitle: { ar: "رحلتك معنا: من التأسيس إلى الطلبات… ونكمل", en: "Your journey with us: from founding to orders… and beyond" } as L,
  journeySub: { ar: "كل خطوة لها باقة تغطيها — ابدأ من حيث أنت الآن.", en: "Every step has a package that covers it — start wherever you are." } as L,
  journeyStep: { ar: "الخطوة", en: "Step" } as L,
  prev: { ar: "السابق", en: "Previous" } as L,
  next: { ar: "التالي", en: "Next" } as L,
  vatNote: { ar: "الأسعار بالريال السعودي قبل ضريبة القيمة المضافة 15%، ولا تشمل رسوم المنصات والإعلانات والاستضافة واستخدام الذكاء الاصطناعي ما لم تذكرها الباقة.", en: "Prices are in Saudi riyals before 15% VAT and exclude platform, advertising, hosting and AI usage fees unless the package states them." } as L,
  preview: { ar: "مثال للتصميم — يظهر على جهازك فقط", en: "Design example — visible on your machine only" } as L
};
