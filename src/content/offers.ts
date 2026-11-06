import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";

/**
 * Packages, limited-time offers and private deals (/offers, /offers/[slug], /offers/deal/[token]).
 *
 * Terms used on the page, and kept apart in the code:
 * - PACKAGE (`Tier`): a service with a written scope and a published price — fixed, or "from" for a stated base scope.
 * - OFFER (`Offer`): a special price on one or more packages for real dates. It holds no scope text of its own: its
 *   contents, exclusions and struck price all come from the packages in `basis`, so it can never contradict them.
 * - CUSTOM QUOTE: anything whose price depends on requirements (business solutions, "from" prices).
 *
 * PRICES (SAR, before 15% VAT) — approved by the owner on 2026-11-05 (brief, then +~10%). Platform subscriptions, ad
 * spend, Meta and AI usage are never included. Never change a price without the company's approval; no package has an
 * approved cost sheet yet (docs/PRICING-PROFITABILITY.md). `draft: true` groups render in development only.
 * Every package, offer and deal has a stable `key`; the website form sends it and the server resolves it here (see
 * offerLabel / offerReference), so the CRM lead and the e-mail show exactly what the client asked for, at which price.
 * Naming: tiers inside a section climb Essential → Professional → Advanced (الأساسية → الاحترافية → المتقدمة) unless the
 * tiers are different products (websites, AI, systems).
 *
 * EDITING: the sections, packages, offers and page texts are edited in the dashboard (/app/website/offers) and published
 * from there (src/server/website/catalog.ts). This file is the built-in starting catalog: the site uses it until the first
 * publish, and whenever the database can't be read. Every helper below takes the catalog it works on (default: this file).
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
  /** what kind of service it is: a project or system the client owns, a subscription, or a fixed term */
  model: L;
  /** plain explanation of what we do and what the client ends up with */
  about: L;
  /** what we need from the client to start */
  youProvide: L[];
  /** what happens after delivery: support, renewals, running costs */
  after: L;
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
  /** revision rounds, where the package has them */
  revisions?: L;
  featured?: boolean;
  features: L[];
  /** stated plainly so nobody is surprised later */
  excludes: L[];
  /** monthly plans: the price for 12 months paid upfront (shown as "or yearly …, save …") */
  annual?: number;
};
/** One step of a client journey shown under a group's tiers; `tier` is the package that covers it. */
export type JourneyStep = { icon: IconName; title: L; text: L; tier: string };
/** `notice`: the section's key conditions, shown above the tiers · `short`: the tab / hero tile name ·
 * `highlights`: three things the service delivers, shown beside its visual · `id`: the tab / link key (#pkg-<id>) ·
 * `service`: the service page it belongs to · `segment`: smb = packages, business = company solutions (quote-led) ·
 * `draft`: awaiting the company's approval, development only. */
export type PackageGroup = { id: string; segment: "smb" | "business"; service: string; icon: IconName; title: L; short: L; text: L; highlights: L[]; notice: L; tiers: Tier[]; journey?: JourneyStep[]; draft?: boolean };
/**
 * A limited-time offer on current packages. It shows only once `approved` (who approved it and when) and only between
 * `startsAt` and `endsAt` (Riyadh dates, both days included) — nothing renews by itself. What it includes, excludes and
 * its struck price come from the packages in `basis` (`months` of a monthly plan); a bundle lists each one. An offer
 * priced at or above its packages, or built on a "from" price or a draft, is never shown.
 */
export type Offer = {
  slug: string;
  service: string;
  icon: IconName;
  /** the campaign it belongs to (shown on the banner with its dates) */
  campaign: L;
  name: L;
  /** one sentence: what the client gets */
  pitch: L;
  forWho: L;
  price: number;
  basis: { key: string; months?: number }[];
  /** conditions of the offer itself (payment, how long the price holds) — the packages' own scope still applies */
  terms: L[];
  startsAt: string;
  endsAt: string;
  approved: string | null;
};
export type Deal = { token: string; client: L; title: L; text: L; items: { label: L; price: number | null }[]; total: number | null; expiresAt: string; preview?: boolean };

type Pay = Pick<Tier, "period" | "billing" | "termMonths">;
const perMonth: Pay = { period: { ar: "شهرياً", en: "per month" }, billing: "monthly" };
const oneTime: Pay = { period: { ar: "دفعة واحدة", en: "one-time" }, billing: "one-time" };
const threeMonths: Pay = { period: { ar: "إجمالي 3 أشهر", en: "total for 3 months" }, billing: "term", termMonths: 3 };
const t = (ar: string, en: string): L => ({ ar, en });
const byScope = t("حسب وثيقة النطاق", "Per the scope document");
// what kind of service each package is (shown on every card)
const PROJECT = t("مشروع يُنفَّذ لك وتملكه بالكامل بعد السداد — دفعة واحدة، دون اشتراك", "A project built for you that you fully own once paid — one payment, no subscription");
const STORE = t("متجر باسمك تملك حسابه ومنتجاته وبياناته — دفعة واحدة، واشتراك المنصة يُدفع لها", "A store in your name — you own the account, products and data; one payment, platform subscription paid to the platform");
const SYSTEM = t("نظام خاص بشركتك نبنيه لك وتملكه — دفعة واحدة، وليس اشتراكاً في منصة", "A system built for your company that you own — one payment, not a platform subscription");
const DESIGN = t("تصميم تملك ملفاته بالكامل بعد السداد — دفعة واحدة", "A design whose files you fully own once paid — one payment");
const MONTHLY = t("خدمة شهرية يديرها فريقنا، تتجدد حتى تلغيها بإشعار قبل 30 يوماً", "A monthly service run by our team, renewing until you cancel with 30 days' notice");
const TERM = t("عقد واحد لمدة 3 أشهر بسعر إجمالي، ينتهي بانتهاء مدته", "One 3-month contract at a total price, ending with its term");
const TRIAL = t("خدمة لمرة واحدة لمدة 14 يوماً، دون أي التزام بعدها", "A one-off 14-day service with no commitment afterwards");
const WA = t("اشتراك شهري في الإعداد والتشغيل، والرقم وحساب ميتا باسمك ويبقيان لك", "A monthly set-up and running subscription; the number and Meta account are in your name and stay yours");
const TEAM_M = t("فريق مخصص لشركتك بعقد شهري، يتجدد حتى تلغيه بإشعار قبل 30 يوماً", "A dedicated team on a monthly contract, renewing until you cancel with 30 days' notice");
const TEAM_6 = t("فريق مخصص لشركتك بعقد 6 أشهر يُدفع شهرياً", "A dedicated team on a 6-month contract, paid monthly");
const TEAM_12 = t("فريق مخصص لشركتك بعقد 12 شهراً يُدفع شهرياً", "A dedicated team on a 12-month contract, paid monthly");

export const packageGroups: PackageGroup[] = [
  {
    id: "web-development",
    segment: "smb",
    service: "web-development",
    icon: "CodeXml",
    title: t("باقات المواقع الإلكترونية", "Website packages"),
    short: t("المواقع الإلكترونية", "Websites"),
    text: t("من صفحة هبوط لحملة إعلانية إلى موقع مؤسسي متكامل، ولكل باقة عدد صفحات ولغات وجولات تعديل محدد.", "From a landing page for an ad campaign to a full corporate website, each package has a set number of pages, languages and revision rounds."),
    highlights: [t("تصميم متجاوب مع الجوال بهوية علامتك", "A mobile-ready design in your brand"), t("إعداد التحليلات والتهيئة لمحركات البحث", "Analytics and search engine set-up"), t("ملكية الموقع والكود لك بعد السداد", "You own the site and its code once paid")],
    notice: t("تشمل الأسعار التصميم والبرمجة والإطلاق ضمن النطاق المكتوب. يوفّر العميل المحتوى (النصوص والصور)، وتكون الاستضافة والنطاق باسمه ما لم تنص الباقة على غير ذلك. أي صفحة أو لغة أو ميزة إضافية تُسعَّر قبل تنفيذها.", "Prices cover design, development and launch within the written scope. The client provides the content (text and images); hosting and domain are in the client's name unless the package says otherwise. Any extra page, language or feature is priced before it is built."),
    tiers: [
      {
        key: "landing-page",
        icon: "MousePointerClick",
        name: t("صفحة هبوط", "Landing page"),
        tagline: t("صفحة واحدة مخصصة لحملة إعلانية أو منتج محدد", "One page dedicated to an ad campaign or a single product"),
        idealFor: t("الشركات والمتاجر التي تطلق حملة لمنتج أو خدمة أو عرض", "Companies and stores launching a campaign for a product, service or offer"),
        model: PROJECT,
        about: t("نصمم صفحة واحدة تركّز على منتج أو عرض واحد: المزايا والسعر وطريقة الطلب، ونربطها بنموذج طلب وواتساب وأداة تتبع، لتعرف كم زائراً جاء من الإعلان وكم طلباً وصلك.", "We design one page focused on a single product or offer — benefits, price and how to order — connected to an order form, WhatsApp and tracking, so you know how many visitors came from the ad and how many orders you got."),
        youProvide: [t("نص العرض وصور المنتج أو الخدمة", "The offer text and product or service photos"), t("نطاق واستضافة باسمك، أو نساعدك في شرائهما", "A domain and hosting in your name, or we help you buy them"), t("حساب المنصة الإعلانية لربط البكسل", "Your ad platform account to connect the pixel")],
        after: t("تستلم الصفحة منشورة وجاهزة للإعلان. أي تعديل بعد جولتي التعديل يُسعَّر حسب حجمه.", "You receive the page live and ready for ads. Changes after the two revision rounds are priced by size."),
        price: 2799,
        from: false,
        ...oneTime,
        delivery: t("5 أيام عمل", "5 business days"),
        revisions: t("جولتا تعديل", "Two rounds"),
        features: [
          t("صفحة واحدة متجاوبة مع الجوال", "One mobile-ready page"),
          t("نموذج طلب يصل إلى بريدك وزر واتساب", "An order form to your inbox and a WhatsApp button"),
          t("إعداد تحليلات جوجل وبكسل منصة إعلانية واحدة", "Google Analytics and one ad platform pixel set up"),
          t("النشر على نطاقك مع شهادة الأمان (SSL)", "Published on your domain with SSL")
        ],
        excludes: [t("الاستضافة والنطاق", "Hosting and domain"), t("كتابة المحتوى والتصوير", "Copywriting and photography"), t("إدارة الحملة والميزانية الإعلانية", "Campaign management and ad spend")]
      },
      {
        key: "web-starter",
        icon: "Monitor",
        name: t("الموقع التعريفي", "Company website"),
        tagline: t("حضور احترافي لشركتك في 5 صفحات", "A professional presence for your company in 5 pages"),
        idealFor: t("المكاتب والعيادات والمقاولون والشركات الصغيرة", "Offices, clinics, contractors and small businesses"),
        model: PROJECT,
        about: t("موقع تعريفي من 5 صفحات يعرّف بشركتك وخدماتك وأعمالك، مبني من مكونات تصميم جاهزة نخصصها بألوانك وشعارك، ومتجاوب مع الجوال.", "A 5-page company website presenting your business, services and work, built from ready design components styled in your colours and logo, and mobile-ready."),
        youProvide: [t("النصوص والصور والشعار", "Text, images and logo"), t("نطاق واستضافة باسمك", "A domain and hosting in your name"), t("بيانات التواصل وروابط الحسابات", "Contact details and social links")],
        after: t("شهر لإصلاح أي عطل برمجي. الباقة لا تتضمن لوحة تحكم، فتعديل المحتوى بعد التسليم يتم عن طريقنا ويُسعَّر حسب حجمه.", "One month of bug fixing. There is no content panel, so content changes after delivery are done by us and priced by size."),
        price: 3899,
        from: false,
        ...oneTime,
        delivery: t("7 أيام عمل", "7 business days"),
        revisions: t("جولة تعديل واحدة", "One round"),
        features: [
          t("حتى 5 صفحات: الرئيسية، من نحن، الخدمات، الأعمال، تواصل معنا", "Up to 5 pages: home, about, services, work, contact"),
          t("لغة واحدة: العربية أو الإنجليزية", "One language: Arabic or English"),
          t("تصميم من مكونات جاهزة مخصصة بهوية شركتك", "A design from ready components styled in your brand"),
          t("نموذج تواصل وزر واتساب", "A contact form and a WhatsApp button"),
          t("شهادة أمان وتهيئة أساسية لمحركات البحث", "SSL and basic search engine set-up"),
          t("شهر لإصلاح الأعطال البرمجية بعد التسليم", "One month of bug fixing after delivery")
        ],
        excludes: [t("الاستضافة والنطاق", "Hosting and domain"), t("لوحة تحكم لتعديل المحتوى", "A content management panel"), t("التصميم المخصص بالكامل (في موقع الأعمال)", "A fully custom design (in the Business website)")]
      },
      {
        key: "web-growth",
        icon: "Rocket",
        name: t("موقع الأعمال", "Business website"),
        tagline: t("موقع ثنائي اللغة بتصميم مخصص تديره بنفسك", "A bilingual, custom-designed site you manage yourself"),
        idealFor: t("الشركات التي تعتمد على موقعها في استقبال العملاء والحملات", "Companies that rely on their site for enquiries and campaigns"),
        model: PROJECT,
        about: t("موقع بالعربية والإنجليزية بتصميم مخصص لهويتك، مع لوحة تحكم تعدّل منها النصوص والصور وتنشر المقالات بنفسك، ومجهّز للحملات الإعلانية والتحليلات.", "A bilingual site with a custom design in your brand and a content panel where you edit text and images and publish articles yourself, set up for ad campaigns and analytics."),
        youProvide: [t("النصوص والصور باللغتين، أو نُسعّر الكتابة والترجمة منفصلة", "Text and images in both languages, or we price writing and translation separately"), t("الشعار ودليل الهوية إن وُجد", "Your logo and brand guide, if any"), t("قائمة الصفحات المطلوبة", "The list of pages you need")],
        after: t("3 أشهر دعم لإصلاح الأعطال والتعديلات البسيطة. الاستضافة والنطاق مشمولان للسنة الأولى، ثم يُجدَّدان باسمك بسعر المزود.", "3 months of support for bug fixes and small edits. Hosting and domain are included for year one, then renewed in your name at the provider's price."),
        price: 10999,
        from: false,
        ...oneTime,
        delivery: t("21 يوم عمل", "21 business days"),
        revisions: t("جولتا تعديل", "Two rounds"),
        featured: true,
        features: [
          t("حتى 15 صفحة بالعربية والإنجليزية", "Up to 15 pages in Arabic and English"),
          t("تصميم مخصص بهوية شركتك", "A custom design in your brand"),
          t("لوحة تحكم لتعديل النصوص والصور والمقالات", "A panel to edit text, images and articles"),
          t("مدونة، ويمكن تخصيص حتى 3 صفحات للحملات الإعلانية", "A blog; up to 3 pages can serve ad campaigns"),
          t("إعداد التحليلات وبكسل الإعلانات والتهيئة التقنية لمحركات البحث", "Analytics, ad pixels and technical SEO set up"),
          t("استضافة سحابية قياسية ونطاق (.com) للسنة الأولى", "Standard cloud hosting and a .com domain for the first year"),
          t("3 أشهر دعم لإصلاح الأعطال وتعديلات المحتوى البسيطة", "3 months of support for bug fixes and small content edits")
        ],
        excludes: [t("تجديد الاستضافة والنطاق بعد السنة الأولى", "Hosting and domain renewal after year one"), t("إضافة أقسام أو مزايا جديدة خلال فترة الدعم", "New sections or features during support"), t("كتابة المحتوى والتصوير", "Copywriting and photography")]
      },
      {
        key: "web-pro",
        icon: "Layers",
        name: t("الموقع المؤسسي", "Corporate website"),
        tagline: t("موقع مخصص بصلاحيات وتكاملات للشركات الكبيرة والجهات", "A custom site with permissions and integrations for large organisations"),
        idealFor: t("الشركات الكبيرة والجهات التي تحتاج أدوار صلاحيات وتكاملات", "Large companies and entities that need roles and integrations"),
        model: PROJECT,
        about: t("موقع مؤسسي يُبنى حسب وثيقة نطاق نتفق عليها: صفحات بلغتين، ولوحة إدارة بصلاحيات لفريقك، وتكامل مع أحد أنظمتك. السعر المعلن للنطاق الأساسي، والسعر النهائي بعد ورشة المتطلبات.", "A corporate site built to an agreed scope document: bilingual pages, an admin panel with roles for your team and an integration with one of your systems. The published price covers the base scope; the final price follows the requirements workshop."),
        youProvide: [t("المحتوى والهوية المؤسسية", "Content and corporate identity"), t("بيانات الوصول للنظام المطلوب ربطه", "Access to the system to integrate"), t("شخص مسؤول من جهتك لاعتماد المراحل", "A person on your side to approve each stage")],
        after: t("6 أشهر دعم، ثم عقد صيانة اختياري. الاستضافة والتراخيص الخارجية على حساب الجهة.", "6 months of support, then an optional maintenance contract. Hosting and third-party licences are on your account."),
        price: 21999,
        from: true,
        ...oneTime,
        delivery: t("من 6 أسابيع حسب النطاق", "From 6 weeks, depending on scope"),
        revisions: byScope,
        features: [
          t("ورشة متطلبات ووثيقة نطاق معتمدة قبل البدء", "A requirements workshop and an approved scope before work starts"),
          t("النطاق الأساسي: حتى 20 صفحة بلغتين", "Base scope: up to 20 pages in two languages"),
          t("تصميم مخصص بالكامل", "A fully custom design"),
          t("لوحة إدارة بحتى 3 أدوار صلاحيات", "An admin panel with up to 3 permission roles"),
          t("تكامل واحد ضمن النطاق الأساسي (نظام العملاء أو الحجوزات أو الدفع)", "One integration in the base scope (CRM, bookings or payments)"),
          t("6 أشهر دعم", "6 months of support")
        ],
        excludes: [t("الصفحات والتكاملات والأدوار الإضافية (تُسعَّر بعد التحليل)", "Extra pages, integrations and roles (priced after analysis)"), t("الاستضافة والتراخيص الخارجية", "Hosting and third-party licences"), t("تطبيقات الجوال", "Mobile apps")]
      }
    ]
  },
  {
    id: "ecommerce",
    segment: "smb",
    service: "ecommerce",
    icon: "ShoppingCart",
    title: t("باقات المتاجر الإلكترونية", "Online store packages"),
    short: t("المتاجر الإلكترونية", "Online stores"),
    text: t("متجر جاهز للبيع على زد أو سلة أو شوبيفاي، من الإعداد حتى أول طلب، مع ربط وسائل الدفع والشحن والتتبع.", "A store ready to sell on Zid, Salla or Shopify — from set-up to the first order, with payments, shipping and tracking connected."),
    highlights: [t("متجر على زد أو سلة أو شوبيفاي باسمك", "A Zid, Salla or Shopify store in your name"), t("وسائل الدفع والشحن المتاحة لحسابك مربوطة", "The payment and shipping options available to your account connected"), t("التتبع جاهز للإعلان من اليوم الأول", "Tracking ready for ads from day one")],
    notice: t("اشتراك المنصة (زد أو سلة أو شوبيفاي) والتطبيقات المدفوعة ورسوم بوابات الدفع وشركات الشحن غير مشمولة، وتُدفع باسمك مباشرة ليبقى المتجر ملكك. الميزانية الإعلانية تُدفع من حسابك. أي تكامل يعتمد على واجهة برمجية لدى المنصة أو موافقة طرف ثالث نوضّحه قبل البدء.", "The platform subscription (Zid, Salla or Shopify), paid apps, payment gateway and shipping fees are not included; you pay them directly, in your name, so the store stays yours. Ad spend is paid from your account. Any integration that depends on a platform API or a third party's approval is explained before we start."),
    tiers: [
      {
        key: "store-launch",
        icon: "ShoppingBag",
        name: t("المتجر الأساسي", "Starter store"),
        tagline: t("متجر جاهز للبيع خلال 5 أيام عمل", "A store ready to sell in 5 business days"),
        idealFor: t("من يبيع عبر إنستغرام أو واتساب ويحتاج متجراً رسمياً", "Sellers on Instagram or WhatsApp who need a proper store"),
        model: STORE,
        about: t("نجهّز متجرك على زد أو سلة بقالب المنصة وبألوانك وشعارك، ونرفع منتجاتك، ونفعّل وسائل الدفع والشحن المتاحة لحسابك، ونربط أدوات التتبع لتبدأ البيع والإعلان.", "We set up your Zid or Salla store with the platform theme in your colours and logo, upload your products, activate the payment and shipping options available to your account and connect tracking, so you can start selling and advertising."),
        youProvide: [t("اشتراك زد أو سلة باسمك", "A Zid or Salla subscription in your name"), t("بيانات المنتجات وصورها", "Product data and photos"), t("السجل التجاري ووثائق تفعيل الدفع التي تطلبها المنصة", "Your commercial registration and the payment documents the platform asks for")],
        after: t("أسبوعا دعم بعد الإطلاق. اشتراك المنصة ورسوم الدفع والشحن تُدفع للمنصة مباشرة.", "Two weeks of support after launch. Platform, payment and shipping fees are paid to the platform directly."),
        price: 2799,
        from: false,
        ...oneTime,
        delivery: t("5 أيام عمل", "5 business days"),
        revisions: t("جولة تعديل واحدة", "One round"),
        features: [
          t("إعداد المتجر على زد أو سلة بقالب المنصة وتخصيصه بشعارك وألوانك", "Store set up on Zid or Salla with a platform theme in your logo and colours"),
          t("رفع حتى 30 منتجاً من بياناتك وصورك", "Up to 30 products from your data and photos"),
          t("الصفحات الأساسية: من نحن، الاسترجاع، الشحن، الخصوصية", "Core pages: about, returns, shipping, privacy"),
          t("إعداد وسائل الدفع والشحن المتاحة لحسابك", "The payment and shipping options available to your account set up"),
          t("ربط بكسل سناب وتيك توك وميتا وتحليلات جوجل", "Snap, TikTok and Meta pixels and Google Analytics connected"),
          t("دعم فني لمدة أسبوعين بعد الإطلاق", "Two weeks of support after launch")
        ],
        excludes: [t("اشتراك المنصة وتطبيقاتها ورسوم الدفع والشحن", "Platform subscription, apps, payment and shipping fees"), t("التصميم المخصص وتصوير المنتجات", "Custom design and product photography"), t("إدارة الحملات والميزانية الإعلانية", "Campaign management and ad spend")]
      },
      {
        key: "store-growth",
        icon: "TrendingUp",
        name: t("المتجر الاحترافي", "Professional store"),
        tagline: t("متجر بهوية علامتك جاهز لحملة الإطلاق", "A store in your brand, ready for its launch campaign"),
        idealFor: t("العلامات التجارية التي تعلن على منصات التواصل وتحتاج متجراً مميزاً", "Brands advertising on social media that need a distinctive store"),
        model: STORE,
        about: t("متجر بهوية علامتك ضمن إمكانيات منصة زد أو سلة، بحتى 100 منتج بخياراتها، ومربوط بالتتبع والكتالوج الإعلاني، مع تجهيز أول حملة و10 تصاميم للإطلاق.", "A store in your brand within what Zid or Salla allows, with up to 100 products and their options, connected to tracking and the ad catalogue, plus your first campaign prepared and 10 launch designs."),
        youProvide: [t("اشتراك زد أو سلة باسمك", "A Zid or Salla subscription in your name"), t("بيانات المنتجات وصورها", "Product data and photos"), t("السجل التجاري ووثائق تفعيل الدفع", "Commercial registration and payment documents"), t("حساب منصة إعلانية واحدة باسمك", "One ad platform account in your name")],
        after: t("شهر دعم وتدريب لفريقك على إدارة الطلبات. إدارة الحملات بعد الإطلاق متاحة في باقات الحملات الإعلانية.", "One month of support and team training on managing orders. Campaign management after launch is in the ad campaign plans."),
        price: 6599,
        from: false,
        ...oneTime,
        delivery: t("10 أيام عمل", "10 business days"),
        revisions: t("جولتا تعديل", "Two rounds"),
        featured: true,
        features: [
          t("تخصيص واجهة المتجر بهويتك ضمن إمكانيات المنصة", "Storefront customised in your brand within the platform's options"),
          t("رفع حتى 100 منتج بالخيارات (المقاس واللون) والتصنيفات", "Up to 100 products with options (size, colour) and categories"),
          t("إعداد الدفع والشحن والدفع عند الاستلام المتاحة لحسابك", "Payments, shipping and cash on delivery available to your account set up"),
          t("بكسل سناب وتيك توك وميتا مع تتبع الإضافة للسلة والشراء", "Snap, TikTok and Meta pixels tracking add-to-cart and purchases"),
          t("ربط كتالوج المنتجات بالمنصات الإعلانية حيث تدعمه المنصة", "Product catalogue linked to ad platforms where the platform supports it"),
          t("تجهيز حملة إطلاق على منصة إعلانية واحدة", "A launch campaign prepared on one ad platform"),
          t("10 تصاميم إطلاق لحسابات التواصل", "10 launch designs for your social accounts"),
          t("تدريب فريقك ودعم فني لمدة شهر", "Team training and one month of support")
        ],
        excludes: [t("اشتراك المنصة وتطبيقاتها ورسوم الدفع والشحن", "Platform subscription, apps, payment and shipping fees"), t("الميزانية الإعلانية", "Ad spend"), t("إدارة الحملات بعد الإطلاق (في باقات الحملات الإعلانية)", "Campaign management after launch (in the ad campaign plans)")]
      },
      {
        key: "store-scale",
        icon: "Building2",
        name: t("المتجر المتقدم", "Advanced store"),
        tagline: t("نطاق مخصص وتكاملات تُدرس حسب احتياج متجرك", "A custom scope, with integrations studied for your store"),
        idealFor: t("المتاجر ذات المبيعات العالية أو متعددة الفروع أو التي تبيع خارج المملكة", "High-volume, multi-branch or cross-border stores"),
        model: STORE,
        about: t("متجر بنطاق مخصص لمبيعات أكبر أو أكثر من فرع أو سوق، على شوبيفاي أو بتصميم مخصص. تكاملات المخزون والمحاسبة والفوترة الإلكترونية تُدرس أولاً ثم تُسعَّر منفصلة.", "A store with a custom scope for higher sales, several branches or markets, on Shopify or custom-designed. Inventory, accounting and e-invoicing integrations are studied first, then priced separately."),
        youProvide: [t("بيانات المنتجات والأنظمة الحالية", "Product data and your current systems"), t("حسابات المنصة والدفع والشحن باسمك", "Platform, payment and shipping accounts in your name"), t("شخص مسؤول لاعتماد النطاق والمراحل", "A person to approve the scope and stages")],
        after: t("3 أشهر دعم بأولوية، ثم صيانة اختيارية.", "3 months of priority support, then optional maintenance."),
        price: 19799,
        from: true,
        ...oneTime,
        delivery: t("من 4 أسابيع حسب النطاق", "From 4 weeks, depending on scope"),
        revisions: byScope,
        features: [
          t("تحليل المتطلبات ووثيقة نطاق قبل البدء", "Requirements analysis and a scope document before we start"),
          t("متجر بتصميم مخصص أو على شوبيفاي", "A custom-designed store or a Shopify store"),
          t("بكسل المنصات الإعلانية وربط المنتجات بتسوق جوجل", "Ad platform pixels and products linked to Google Shopping"),
          t("دراسة تقنية لتكاملات المخزون والمحاسبة والفوترة الإلكترونية (تُسعَّر منفصلة)", "A technical study of inventory, accounting and e-invoicing integrations (priced separately)"),
          t("تعدد اللغات والعملات للبيع خارج المملكة", "Multiple languages and currencies for selling abroad"),
          t("خطة إطلاق تسويقية لمدة 90 يوماً وإدارة حملات الشهر الأول على منصتين", "A 90-day launch marketing plan and first-month campaigns on two platforms"),
          t("دعم بأولوية لمدة 3 أشهر", "3 months of priority support")
        ],
        excludes: [t("اشتراك المنصة وتطبيقاتها ورسوم الدفع والشحن", "Platform subscription, apps, payment and shipping fees"), t("تنفيذ التكاملات قبل دراستها واعتماد عرض سعرها", "Building integrations before they are studied and quoted"), t("الميزانية الإعلانية", "Ad spend")]
      }
    ],
    journey: [
      { icon: "Lightbulb", title: t("الإعداد", "Set-up"), text: t("نختار معك المنصة المناسبة ونجهّز الشعار والألوان وصفحات السياسات.", "We choose the right platform with you and prepare your logo, colours and policy pages."), tier: "store-launch" },
      { icon: "ShoppingBag", title: t("بناء المتجر", "Building the store"), text: t("تخصيص المتجر ورفع المنتجات وربط الدفع والشحن.", "Store customised, products uploaded, payments and shipping connected."), tier: "store-growth" },
      { icon: "Target", title: t("التجهيز للإعلان", "Ready to advertise"), text: t("البكسل والتحليلات وكتالوج المنتجات، ليُقاس كل طلب.", "Pixels, analytics and the product catalogue, so every order is measured."), tier: "store-growth" },
      { icon: "Rocket", title: t("الإطلاق", "Launch"), text: t("تصاميم الإطلاق وأول حملة إعلانية.", "Launch designs and the first ad campaign."), tier: "store-growth" },
      { icon: "MessagesSquare", title: t("خدمة العملاء", "Customer service"), text: t("واتساب يرد على العملاء ويؤهلهم ويحوّلهم إلى فريقك.", "WhatsApp answers and qualifies customers and hands them to your team."), tier: "wa-pro" },
      { icon: "TrendingUp", title: t("النمو المستمر", "Ongoing growth"), text: t("إدارة الحملات شهرياً بتقارير تقيس الطلبات والتكلفة.", "Monthly campaign management with reports on orders and cost."), tier: "mkt-growth" }
    ]
  },
  {
    id: "digital-marketing",
    segment: "smb",
    service: "digital-marketing",
    icon: "Megaphone",
    title: t("باقات إدارة الحملات الإعلانية", "Ad campaign management plans"),
    short: t("الحملات الإعلانية", "Ad campaigns"),
    text: t("إدارة حملاتك على سناب شات وتيك توك وميتا وجوجل بعدد محدد من المنصات والحملات والمواد الإعلانية، مع متابعة دورية وتقرير شهري.", "Your campaigns on Snapchat, TikTok, Meta and Google with a set number of platforms, campaigns and creatives, regular optimisation and a monthly report."),
    highlights: [t("إعداد الحملات وإدارتها على المنصات المناسبة لنشاطك", "Campaigns set up and run on the platforms that fit your business"), t("مواد إعلانية واختبار أكثر من نسخة", "Ad creatives and testing several versions"), t("تقارير بالتكلفة والنتائج القابلة للقياس", "Reports on cost and measurable results")],
    notice: t("الأسعار أتعاب إدارة قبل الضريبة، والميزانية الإعلانية تُدفع للمنصات من حسابك مباشرة. تغطي أتعاب كل باقة إنفاقاً إعلانياً حتى الحد المذكور فيها، وإذا تجاوزه يُعاد تسعير الأتعاب بالاتفاق قبل الشهر التالي. لا نضمن عدداً محدداً من المبيعات أو العملاء المحتملين أو عائداً إعلانياً محدداً، ونلتزم بإدارة احترافية وتقارير شفافة.", "Prices are management fees before VAT; ad spend is paid to the platforms from your own account. Each plan's fee covers ad spend up to the limit it states; above it, the fee is re-quoted by agreement before the next month. We don't guarantee a number of sales or leads or a return on ad spend; we commit to professional management and transparent reporting."),
    tiers: [
      {
        key: "ads-launch",
        icon: "Target",
        name: t("التجربة الإعلانية", "Ads trial"),
        tagline: t("إعداد حملة وإدارتها 14 يوماً لتجربة الإعلان المدفوع", "One campaign set up and run for 14 days to try paid ads"),
        idealFor: t("من يبدأ الإعلان لأول مرة أو يعلن دون قياس واضح", "Anyone advertising for the first time, or without clear measurement"),
        model: TRIAL,
        about: t("تجربة قصيرة للإعلان المدفوع: نراجع جاهزية موقعك، ونجهّز التتبع، ونطلق حملة واحدة وندير ميزانيتها 14 يوماً، ثم نسلّمك تقريراً بالنتائج والخطوة المناسبة بعدها.", "A short trial of paid ads: we review your site's readiness, set up tracking, launch one campaign and manage its budget for 14 days, then hand you a report with the results and the right next step."),
        youProvide: [t("حساب إعلاني باسمك على المنصة المختارة", "An ad account in your name on the chosen platform"), t("الميزانية الإعلانية من حسابك", "The ad budget, from your account"), t("صور أو فيديو للمنتج أو الخدمة", "Photos or video of your product or service")],
        after: t("تنتهي الخدمة بعد 14 يوماً دون أي التزام، ويمكنك الاستمرار بإحدى الباقات الشهرية.", "The service ends after 14 days with no commitment; you can continue with a monthly plan."),
        price: 1499,
        from: false,
        period: t("لمدة 14 يوماً", "for 14 days"),
        billing: "one-time",
        delivery: t("الإعداد خلال 3 أيام عمل، ثم 14 يوماً من الإدارة", "Set up in 3 business days, then 14 days of management"),
        features: [
          t("مراجعة جاهزية الموقع أو المتجر للإعلان", "A readiness review of your site or store"),
          t("إعداد التتبع على منصة واحدة", "Tracking set up on one platform"),
          t("إطلاق حملة واحدة على منصة واحدة", "One campaign launched on one platform"),
          t("مادتان إعلانيتان من محتواك", "Two ad creatives from your content"),
          t("متابعة وتحسين خلال 14 يوماً لإنفاق حتى 2,500 ريال", "Optimisation over 14 days, for spend up to SAR 2,500"),
          t("تقرير ختامي بالنتائج", "A final report on the results")
        ],
        excludes: [t("الميزانية الإعلانية ورسوم المنصات", "Ad spend and platform fees"), t("التصوير وتصميم صفحات الهبوط", "Photography and landing page design")]
      },
      {
        key: "mkt-start",
        icon: "Megaphone",
        name: t("الأساسية", "Essential"),
        tagline: t("حملة واحدة تُدار باحتراف على منصة واحدة", "One campaign, professionally run on one platform"),
        idealFor: t("المشاريع التي بدأت الإعلان بانتظام", "Businesses that have started advertising regularly"),
        model: MONTHLY,
        about: t("ندير حملة إعلانية واحدة على منصة تختارها: نجهّز الاستهداف والإعلانات، ونتابع النتائج أسبوعياً ونحسّنها، ونرسل تقريراً شهرياً بالتكلفة والنتائج.", "We run one ad campaign on a platform you choose: targeting and ads set up, results reviewed and improved weekly, and a monthly report on cost and results."),
        youProvide: [t("حساب إعلاني باسمك", "An ad account in your name"), t("الميزانية الإعلانية، حتى 5,000 ريال شهرياً ضمن هذه الأتعاب", "Ad budget, up to SAR 5,000 a month within this fee"), t("صور أو فيديو من نشاطك", "Photos or video from your business")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 2199,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 5 أيام عمل", "We start within 5 business days"),
        features: [
          t("منصة إعلانية واحدة", "One ad platform"),
          t("حملة نشطة واحدة", "One active campaign"),
          t("مادتان إعلانيتان شهرياً", "Two ad creatives a month"),
          t("إعداد التتبع والتحقق من قياس الطلبات", "Tracking set up and order measurement checked"),
          t("متابعة وتحسين أسبوعي", "Weekly optimisation"),
          t("تقرير شهري بالتكلفة والنتائج", "A monthly report on cost and results"),
          t("تغطي الأتعاب إنفاقاً حتى 5,000 ريال شهرياً", "The fee covers spend up to SAR 5,000 a month")
        ],
        excludes: [t("الميزانية الإعلانية ورسوم المنصات", "Ad spend and platform fees"), t("التصوير وإنتاج الفيديو", "Photography and video production")]
      },
      {
        key: "mkt-growth",
        icon: "ChartLine",
        name: t("الاحترافية", "Professional"),
        tagline: t("حتى 3 حملات على منصتين", "Up to 3 campaigns on two platforms"),
        idealFor: t("المتاجر والشركات التي تبيع وتريد التوسع", "Stores and companies already selling that want to grow"),
        model: MONTHLY,
        about: t("ندير حتى 3 حملات على منصتين، مع إعادة استهداف من زار موقعك أو ترك السلة، و8 مواد إعلانية شهرياً، ومتابعة مرتين أسبوعياً.", "We run up to 3 campaigns on two platforms, retargeting site visitors and abandoned carts, with 8 creatives a month and optimisation twice a week."),
        youProvide: [t("حسابات إعلانية باسمك على المنصتين", "Ad accounts in your name on both platforms"), t("الميزانية الإعلانية، حتى 15,000 ريال شهرياً ضمن هذه الأتعاب", "Ad budget, up to SAR 15,000 a month within this fee"), t("صور أو فيديو من نشاطك", "Photos or video from your business")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 4399,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 5 أيام عمل", "We start within 5 business days"),
        featured: true,
        features: [
          t("منصتان إعلانيتان", "Two ad platforms"),
          t("حتى 3 حملات نشطة", "Up to 3 active campaigns"),
          t("8 مواد إعلانية شهرياً", "8 ad creatives a month"),
          t("إعادة استهداف زوار الموقع ومن تركوا السلة", "Retargeting site visitors and abandoned carts"),
          t("متابعة وتحسين مرتين أسبوعياً", "Optimisation twice a week"),
          t("تقرير شهري مفصل مع توصيات", "A detailed monthly report with recommendations"),
          t("تغطي الأتعاب إنفاقاً حتى 15,000 ريال شهرياً", "The fee covers spend up to SAR 15,000 a month")
        ],
        excludes: [t("الميزانية الإعلانية ورسوم المنصات", "Ad spend and platform fees"), t("إدارة حسابات التواصل (في باقاتها المستقلة)", "Social account management (in its own plans)")]
      },
      {
        key: "mkt-pro",
        icon: "Sparkles",
        name: t("المتقدمة", "Advanced"),
        tagline: t("حتى 6 حملات على 3 منصات", "Up to 6 campaigns on 3 platforms"),
        idealFor: t("الشركات والمتاجر ذات الميزانيات الإعلانية الأكبر", "Companies and stores with larger ad budgets"),
        model: MONTHLY,
        about: t("إدارة إعلانية شاملة لحتى 6 حملات على 3 منصات، منها إعلانات جوجل، مع خطة لتحسين معدل التحويل في موقعك، واجتماعين شهرياً لمراجعة النتائج.", "Full ad management for up to 6 campaigns on 3 platforms, including Google Ads, with a conversion-rate plan for your site and two meetings a month to review results."),
        youProvide: [t("حسابات إعلانية باسمك", "Ad accounts in your name"), t("الميزانية الإعلانية، حتى 40,000 ريال شهرياً ضمن هذه الأتعاب", "Ad budget, up to SAR 40,000 a month within this fee"), t("صلاحية الوصول للموقع أو المتجر وأدوات التحليل", "Access to your site or store and analytics")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 8299,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 7 أيام عمل", "We start within 7 business days"),
        features: [
          t("3 منصات إعلانية، منها إعلانات جوجل للبحث والتسوق عند الحاجة", "3 ad platforms, including Google Search and Shopping when needed"),
          t("حتى 6 حملات نشطة", "Up to 6 active campaigns"),
          t("16 مادة إعلانية شهرياً", "16 ad creatives a month"),
          t("خطة لتحسين معدل التحويل في متجرك أو موقعك", "A conversion-rate plan for your store or site"),
          t("متابعة وتحسين 3 مرات أسبوعياً", "Optimisation 3 times a week"),
          t("تقرير شهري مفصل واجتماعان شهرياً", "A detailed monthly report and two meetings a month"),
          t("تغطي الأتعاب إنفاقاً حتى 40,000 ريال شهرياً", "The fee covers spend up to SAR 40,000 a month")
        ],
        excludes: [t("الميزانية الإعلانية ورسوم المنصات", "Ad spend and platform fees"), t("التصوير وأجور المؤثرين", "Photography and influencer fees")]
      }
    ]
  },
  {
    id: "social-media",
    segment: "smb",
    service: "digital-marketing",
    icon: "Share2",
    title: t("باقات إدارة حسابات التواصل الاجتماعي", "Social media management plans"),
    short: t("التواصل الاجتماعي", "Social media"),
    text: t("محتوى منتظم بهوية علامتك: خطة شهرية وتصاميم ونصوص ونشر مجدول، بعدد منشورات ومنصات محدد.", "Steady content in your brand: a monthly plan, designs, captions and scheduled publishing, with a set number of posts and platforms."),
    highlights: [t("خطة محتوى شهرية بهوية علامتك", "A monthly content plan in your brand"), t("تصاميم ونصوص وفيديوهات قصيرة من موادك", "Designs, captions and short videos from your material"), t("نشر مجدول وتقرير شهري", "Scheduled publishing and a monthly report")],
    notice: t("المنشور قطعة محتوى واحدة تُهيَّأ للمنصات المشمولة، ولا يتضاعف عددها لكل منصة. الفيديوهات القصيرة حتى 60 ثانية من مواد يوفرها العميل، ولكل منشور أو فيديو جولة تعديل واحدة. التصوير الميداني والممثلون والتعليق الصوتي المدفوع غير مشمولة إلا بتسعير منفصل، ولا نضمن عدداً محدداً من المتابعين أو الوصول.", "A post is one piece of content adapted to the included platforms; the count doesn't multiply per platform. Short videos run up to 60 seconds, from footage the client provides, and each post or video has one revision round. On-site filming, actors and paid voice-over are only available at a separate price, and we don't guarantee a number of followers or reach."),
    tiers: [
      {
        key: "social-presence",
        icon: "Share2",
        name: t("الأساسية", "Essential"),
        tagline: t("حضور منتظم على منصة واحدة", "A steady presence on one platform"),
        idealFor: t("المشاريع الصغيرة التي تحتاج حضوراً منتظماً", "Small businesses that need a steady presence"),
        model: MONTHLY,
        about: t("نكتب ونصمم 8 منشورات شهرياً لحساب واحد، وننشرها حسب تقويم محتوى تعتمده مسبقاً، ونرسل لك تقريراً شهرياً بالأداء.", "We write and design 8 posts a month for one account, publish them on a content calendar you approve in advance, and send a monthly performance report."),
        youProvide: [t("صلاحية الوصول للحساب", "Access to the account"), t("الشعار وصور من نشاطك", "Your logo and photos from your business"), t("اعتماد خطة المحتوى قبل بداية كل شهر", "Approval of the content plan before each month")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 1999,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 5 أيام عمل", "We start within 5 business days"),
        revisions: t("جولة لكل منشور", "One round per post"),
        features: [
          t("8 منشورات شهرياً (كتابة وتصميم)", "8 posts a month (copy and design)"),
          t("منصة واحدة", "One platform"),
          t("تقويم محتوى شهري ونشر مجدول", "A monthly content calendar and scheduled publishing"),
          t("جولة تعديل واحدة لكل منشور", "One revision round per post"),
          t("تقرير شهري", "A monthly report")
        ],
        excludes: [t("الفيديو والتصوير", "Video and filming"), t("الرد على التعليقات والرسائل", "Replying to comments and messages"), t("الحملات الإعلانية (في باقات الحملات)", "Ad campaigns (in the campaign plans)")]
      },
      {
        key: "social-engage",
        icon: "MessagesSquare",
        name: t("الاحترافية", "Professional"),
        tagline: t("محتوى وفيديو ومتابعة للتعليقات على منصتين", "Content, video and comment monitoring on two platforms"),
        idealFor: t("العلامات التي تريد تفاعلاً أكبر مع جمهورها", "Brands that want more engagement with their audience"),
        model: MONTHLY,
        about: t("16 منشوراً و4 فيديوهات قصيرة شهرياً على منصتين، مع متابعة التعليقات والرد عليها بردود تعتمدها مسبقاً في ساعات العمل المتفق عليها.", "16 posts and 4 short videos a month on two platforms, with comments monitored and answered with replies you approve, during agreed working hours."),
        youProvide: [t("صلاحية الوصول للحسابات", "Access to the accounts"), t("مقاطع فيديو خام من نشاطك للمونتاج", "Raw video clips from your business for editing"), t("اعتماد خطة المحتوى والردود الجاهزة", "Approval of the content plan and ready replies")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 3899,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 5 أيام عمل", "We start within 5 business days"),
        revisions: t("جولة لكل منشور أو فيديو", "One round per post or video"),
        featured: true,
        features: [
          t("16 منشوراً شهرياً (كتابة وتصميم)", "16 posts a month (copy and design)"),
          t("4 فيديوهات قصيرة (حتى 60 ثانية) من موادك", "4 short videos (up to 60 seconds) from your footage"),
          t("منصتان", "Two platforms"),
          t("متابعة التعليقات في أيام العمل خلال ساعات متفق عليها، بردود تعتمدها مسبقاً", "Comment monitoring on business days during agreed hours, with replies you approve in advance"),
          t("خطة محتوى شهرية", "A monthly content plan"),
          t("تقرير أداء شهري", "A monthly performance report")
        ],
        excludes: [t("التصوير الميداني والتعليق الصوتي المدفوع", "On-site filming and paid voice-over"), t("الردود خارج الساعات المتفق عليها", "Replies outside the agreed hours"), t("الحملات الإعلانية", "Ad campaigns")]
      },
      {
        key: "social-brand",
        icon: "Sparkles",
        name: t("المتقدمة", "Advanced"),
        tagline: t("حضور متكامل على 3 منصات", "A complete presence on 3 platforms"),
        idealFor: t("العلامات المتوسعة التي تبني صورتها باستمرار", "Growing brands building their image continuously"),
        model: MONTHLY,
        about: t("حضور متكامل على حتى 3 منصات: 20 منشوراً و6 فيديوهات شهرياً، ومتابعة التعليقات، وتقرير شهري مع توصيات لتطوير المحتوى.", "A complete presence on up to 3 platforms: 20 posts and 6 videos a month, comment monitoring and a monthly report with recommendations."),
        youProvide: [t("صلاحية الوصول للحسابات", "Access to the accounts"), t("مقاطع فيديو خام من نشاطك", "Raw video clips from your business"), t("اعتماد خطة المحتوى والردود الجاهزة", "Approval of the content plan and ready replies")],
        after: t("تتجدد الخدمة شهرياً، ويمكنك الترقية أو الإلغاء بإشعار قبل 30 يوماً.", "The service renews monthly; you can upgrade or cancel with 30 days' notice."),
        price: 6599,
        from: false,
        ...perMonth,
        delivery: t("نبدأ خلال 7 أيام عمل", "We start within 7 business days"),
        revisions: t("جولة لكل منشور أو فيديو", "One round per post or video"),
        features: [
          t("20 منشوراً شهرياً (كتابة وتصميم)", "20 posts a month (copy and design)"),
          t("6 فيديوهات قصيرة (حتى 60 ثانية) من موادك", "6 short videos (up to 60 seconds) from your footage"),
          t("حتى 3 منصات", "Up to 3 platforms"),
          t("متابعة التعليقات في أيام العمل خلال ساعات متفق عليها، بردود تعتمدها مسبقاً", "Comment monitoring on business days during agreed hours, with replies you approve in advance"),
          t("خطة محتوى شهرية", "A monthly content plan"),
          t("تقرير أداء شهري مع توصيات", "A monthly performance report with recommendations")
        ],
        excludes: [t("التصوير الميداني والممثلون والتعليق الصوتي المدفوع", "On-site filming, actors and paid voice-over"), t("الردود خارج الساعات المتفق عليها", "Replies outside the agreed hours"), t("الحملات الإعلانية", "Ad campaigns")]
      }
    ]
  },
  {
    id: "integrated-marketing",
    segment: "smb",
    service: "digital-marketing",
    icon: "Rocket",
    draft: true,
    title: t("باقات التسويق المتكامل (90 يوماً)", "Integrated marketing plans (90 days)"),
    short: t("التسويق المتكامل", "Integrated marketing"),
    text: t("إدارة حسابات التواصل والحملات الإعلانية وخطة المحتوى في عقد واحد لمدة 3 أشهر، بفريق واحد يخطط وينفذ ويقيس.", "Social accounts, ad campaigns and a content plan in one 3-month contract — one team that plans, delivers and measures."),
    highlights: [t("محتوى وحملات بخطة واحدة متسقة", "Content and campaigns on one consistent plan"), t("مخرجات شهرية بعدد محدد", "A set number of deliverables every month"), t("سعر أقل من الباقات المنفصلة مقابل الالتزام 3 أشهر", "Less than the separate plans, for a 3-month commitment")],
    notice: t("مدة العقد 3 أشهر، والسعر المعلن إجمالي المدة وليس سعر الشهر. الميزانية الإعلانية منفصلة وتُدفع من حسابك. تصوير الفيديو وإنشاء الموقع والهوية البصرية وكتابة المقالات والتهيئة الشهرية لمحركات البحث غير مشمولة. نشر المادة نفسها على أكثر من منصة لا يضاعف عدد المخرجات، وأي إنتاج إضافي يُسعَّر بعد موافقتك.", "The contract runs 3 months and the price shown is the total for the term, not per month. Ad spend is separate and paid from your account. Video filming, building a website, brand identity, article writing and monthly SEO are not included. Publishing the same material on several platforms doesn't multiply the deliverables, and any extra production is priced after your approval."),
    tiers: [
      {
        key: "mkt90-basic",
        icon: "Megaphone",
        name: t("الأساسية", "Essential"),
        tagline: t("منصة وحملة ومحتوى منتظم", "One platform, one campaign and steady content"),
        idealFor: t("المشاريع التي تبدأ التسويق المنظم", "Businesses starting organised marketing"),
        model: TERM,
        about: t("حساب تواصل واحد وحملة إعلانية واحدة بخطة محتوى شهرية لمدة 3 أشهر، يديرها فريق واحد ويقيس نتائجها.", "One social account and one ad campaign with a monthly content plan for 3 months, run and measured by one team."),
        youProvide: [t("حسابات التواصل والإعلانات باسمك", "Social and ad accounts in your name"), t("الميزانية الإعلانية من حسابك", "Ad budget from your account"), t("مقاطع فيديو خام من نشاطك", "Raw video clips from your business")],
        after: t("ينتهي العقد بعد 3 أشهر، ويمكن تجديده أو الانتقال إلى باقة شهرية.", "The contract ends after 3 months; you can renew it or move to a monthly plan."),
        price: 10500,
        from: false,
        ...threeMonths,
        delivery: t("نبدأ خلال 7 أيام عمل", "We start within 7 business days"),
        features: [
          t("إدارة منصة تواصل واحدة", "One social platform managed"),
          t("8 منشورات مصممة شهرياً", "8 designed posts a month"),
          t("فيديو قصير واحد شهرياً من مواد العميل", "One short video a month from the client's footage"),
          t("إدارة حملة إعلانية واحدة", "One ad campaign managed"),
          t("خطة محتوى شهرية", "A monthly content plan"),
          t("تقرير شهري", "A monthly report")
        ],
        excludes: [t("الميزانية الإعلانية", "Ad spend"), t("تصوير الفيديو", "Video filming")]
      },
      {
        key: "mkt90-growth",
        icon: "ChartLine",
        name: t("الاحترافية", "Professional"),
        tagline: t("منصتان وحملتان وخطة تسويق شهرية", "Two platforms, two campaigns and a monthly marketing plan"),
        idealFor: t("العلامات التي تريد نمواً واضحاً خلال 3 أشهر", "Brands that want clear growth over 3 months"),
        model: TERM,
        about: t("منصتان وحتى حملتين إعلانيتين وخطة محتوى وتسويق شهرية لمدة 3 أشهر، مع تقرير أداء وتوصيات كل شهر.", "Two platforms, up to two ad campaigns and a monthly content and marketing plan for 3 months, with a performance report and recommendations each month."),
        youProvide: [t("حسابات التواصل والإعلانات باسمك", "Social and ad accounts in your name"), t("الميزانية الإعلانية من حسابك", "Ad budget from your account"), t("مقاطع فيديو خام من نشاطك", "Raw video clips from your business")],
        after: t("ينتهي العقد بعد 3 أشهر، ويمكن تجديده أو الانتقال إلى باقة شهرية.", "The contract ends after 3 months; you can renew it or move to a monthly plan."),
        price: 21000,
        from: false,
        ...threeMonths,
        delivery: t("نبدأ خلال 7 أيام عمل", "We start within 7 business days"),
        featured: true,
        features: [
          t("إدارة منصتين", "Two platforms managed"),
          t("12 منشوراً مصمماً شهرياً", "12 designed posts a month"),
          t("3 فيديوهات قصيرة شهرياً من مواد العميل", "3 short videos a month from the client's footage"),
          t("إدارة حتى حملتين إعلانيتين", "Up to two ad campaigns managed"),
          t("خطة محتوى وتسويق شهرية", "A monthly content and marketing plan"),
          t("تقرير أداء مع توصيات", "A performance report with recommendations")
        ],
        excludes: [t("الميزانية الإعلانية", "Ad spend"), t("تصوير الفيديو", "Video filming")]
      },
      {
        key: "mkt90-full",
        icon: "Sparkles",
        name: t("الشاملة", "Complete"),
        tagline: t("حتى 3 منصات و3 حملات واستراتيجية تسويق", "Up to 3 platforms, 3 campaigns and a marketing strategy"),
        idealFor: t("الشركات التي تحتاج فريق تسويق متكاملاً دون توظيف", "Companies that need a full marketing team without hiring"),
        model: TERM,
        about: t("فريق تسويق متكامل لمدة 3 أشهر: حتى 3 منصات و3 حملات، واستراتيجية محتوى وتسويق، واجتماع متابعة شهري.", "A full marketing team for 3 months: up to 3 platforms and 3 campaigns, a content and marketing strategy and a monthly follow-up meeting."),
        youProvide: [t("حسابات التواصل والإعلانات باسمك", "Social and ad accounts in your name"), t("الميزانية الإعلانية من حسابك", "Ad budget from your account"), t("مقاطع فيديو خام من نشاطك", "Raw video clips from your business")],
        after: t("ينتهي العقد بعد 3 أشهر، ويمكن تجديده أو الانتقال إلى باقة شهرية.", "The contract ends after 3 months; you can renew it or move to a monthly plan."),
        price: 37500,
        from: false,
        ...threeMonths,
        delivery: t("نبدأ خلال 10 أيام عمل", "We start within 10 business days"),
        features: [
          t("إدارة حتى 3 منصات", "Up to 3 platforms managed"),
          t("20 منشوراً مصمماً شهرياً", "20 designed posts a month"),
          t("5 فيديوهات قصيرة شهرياً من مواد العميل", "5 short videos a month from the client's footage"),
          t("إدارة حتى 3 حملات إعلانية", "Up to 3 ad campaigns managed"),
          t("استراتيجية محتوى وتسويق", "A content and marketing strategy"),
          t("تقارير شهرية واجتماع متابعة", "Monthly reports and a follow-up meeting")
        ],
        excludes: [t("الميزانية الإعلانية", "Ad spend"), t("تصوير الفيديو والموقع والهوية البصرية", "Video filming, website and brand identity")]
      }
    ]
  },
  {
    id: "whatsapp-automation",
    segment: "smb",
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    title: t("باقات واتساب للأعمال", "WhatsApp Business plans"),
    short: t("واتساب للأعمال", "WhatsApp"),
    text: t("حوّل محادثات واتساب إلى قناة مبيعات وخدمة منظمة: رقم رسمي موثّق، وصندوق محادثات مشترك لفريقك، وردود ومسارات آلية، وتقارير بسرعة الرد.", "Turn WhatsApp into an organised sales and service channel: a verified official number, a shared inbox for your team, automated replies and flows, and reports on response time."),
    highlights: [t("رقم رسمي موثّق باسم نشاطك على منصة واتساب للأعمال", "A verified official number in your business name on the WhatsApp Business Platform"), t("صندوق محادثات مشترك لفريقك مع توزيع المحادثات", "A shared team inbox with conversation routing"), t("مسارات آلية على مدار الساعة مع التحويل للموظف عند الحاجة", "Automated flows around the clock, handing over to staff when needed")],
    notice: t("الأسعار اشتراك شهري قبل الضريبة، أو سنوي بخصم شهرين، والحد الأدنى 3 أشهر، والإعداد مشمول. رسوم ميتا غير مشمولة: الرسائل التسويقية والحملات والمحادثات التي تبدأها أنت تُحتسب لكل رسالة حسب أسعار ميتا المتغيرة، وتُدفع حسب الاستخدام الفعلي وباسمك. ردودك على رسائل العملاء خلال 24 ساعة من رسالتهم مجانية ضمن حدود ميتا، واعتماد الحساب وقوالب الرسائل يخضع لموافقة ميتا.", "Prices are monthly subscriptions before VAT, or yearly with two months off; minimum 3 months, set-up included. Meta's fees are not included: marketing messages, campaigns and conversations you start are charged per message at Meta's changing prices, by actual usage, in your name. Replies within 24 hours of a customer's message are free within Meta's limits, and account and template approval is subject to Meta."),
    tiers: [
      {
        key: "wa-basic",
        icon: "MessageSquareMore",
        name: t("الأساسية", "Essential"),
        tagline: t("رقم رسمي وصندوق محادثات منظم", "An official number and an organised inbox"),
        idealFor: t("الأنشطة التي تنتقل من واتساب الجوال إلى واتساب الأعمال الرسمي", "Businesses moving from WhatsApp on a phone to the official platform"),
        model: WA,
        about: t("ننقل رقمك إلى منصة واتساب للأعمال الرسمية ونوثّق نشاطك لدى ميتا، ونجهّز قائمة ترحيب وردوداً سريعة، ليرد موظفك من صندوق محادثات منظم بدل جوال شخصي.", "We move your number to the official WhatsApp Business Platform, verify your business with Meta and set up a welcome menu and quick replies, so your staff answer from an organised inbox instead of a personal phone."),
        youProvide: [t("رقم جوال غير مرتبط بتطبيق واتساب العادي، أو نساعدك في نقله", "A number not tied to the regular WhatsApp app, or we help you move it"), t("السجل التجاري ووثائق التوثيق لدى ميتا", "Commercial registration and Meta verification documents"), t("حساب Meta Business باسمك", "A Meta Business account in your name")],
        after: t("اشتراك شهري بحد أدنى 3 أشهر. الرقم وحساب ميتا باسمك ويبقيان لك إذا أوقفت الاشتراك.", "A monthly subscription, minimum 3 months. The number and Meta account are in your name and stay yours if you stop."),
        price: 599,
        annual: 5990,
        from: false,
        ...perMonth,
        delivery: t("3 أيام عمل بعد اعتماد ميتا", "3 business days after Meta approval"),
        features: [
          t("ربط رقمك بمنصة واتساب للأعمال وتوثيق نشاطك لدى ميتا", "Your number on the WhatsApp Business Platform, business verified with Meta"),
          t("صندوق محادثات لمستخدم واحد", "An inbox for one user"),
          t("قائمة ترحيب آلية بالخدمات والفروع وأوقات العمل", "An automated welcome menu with services, branches and hours"),
          t("رد آلي خارج أوقات العمل و20 رداً سريعاً", "Out-of-hours auto-reply and 20 quick replies"),
          t("تصنيف المحادثات وملاحظات داخلية", "Conversation labels and internal notes"),
          t("تقرير شهري بعدد المحادثات وسرعة الرد", "A monthly report on conversations and response time")
        ],
        excludes: [t("رسوم رسائل ميتا (التسويقية والحملات)", "Meta message fees (marketing and campaigns)"), t("الشات بوت والحملات (في الباقات الأعلى)", "Chatbot and campaigns (in the higher plans)")]
      },
      {
        key: "wa-pro",
        icon: "Bot",
        name: t("الاحترافية", "Professional"),
        tagline: t("شات بوت يؤهل العملاء ويوزعهم على فريقك", "A chatbot that qualifies customers and routes them to your team"),
        idealFor: t("العيادات والمتاجر والعقار والشركات الخدمية كثيرة الاستفسارات", "Clinics, stores, real estate and service companies with many enquiries"),
        model: WA,
        about: t("كل ما في الأساسية مع شات بوت نصممه لنشاطك: يعرض الخدمات والأسعار، ويحجز أو يستقبل الطلب، ويجمع بيانات العميل ثم يحوّله للموظف المناسب مع ملخص المحادثة.", "Everything in Essential plus a chatbot designed for your business: it shows services and prices, books or takes the order, collects the customer's details and hands them to the right person with a summary."),
        youProvide: [t("رقم جوال غير مرتبط بتطبيق واتساب العادي", "A number not tied to the regular WhatsApp app"), t("السجل التجاري وحساب Meta Business باسمك", "Commercial registration and a Meta Business account in your name"), t("قائمة الخدمات والأسعار والأسئلة الشائعة", "Your services, prices and frequent questions")],
        after: t("اشتراك شهري بحد أدنى 3 أشهر. الرقم وحساب ميتا باسمك ويبقيان لك إذا أوقفت الاشتراك.", "A monthly subscription, minimum 3 months. The number and Meta account are in your name and stay yours if you stop."),
        price: 1299,
        annual: 12990,
        from: false,
        ...perMonth,
        delivery: t("7 أيام عمل بعد اعتماد ميتا", "7 business days after Meta approval"),
        featured: true,
        features: [
          t("مستخدمان مع توزيع المحادثات", "Two users with conversation routing"),
          t("شات بوت بمسارات مصممة لنشاطك: الخدمات والأسعار والحجز والطلبات", "A chatbot with flows for your business: services, prices, bookings and orders"),
          t("تأهيل العميل (الاسم والمدينة والخدمة) وتحويله بملخص", "Customer qualification (name, city, service) and hand-over with a summary"),
          t("10 قوالب رسائل معتمدة: تأكيد وتذكير ومتابعة", "10 approved templates: confirmation, reminder and follow-up"),
          t("إعداد حملاتك وإرسالها للعملاء الموافقين (تكلفة الرسائل حسب ميتا)", "Your campaigns set up and sent to opted-in customers (message cost per Meta)"),
          t("ربط مع سلة أو زد أو جداول جوجل", "Integration with Salla, Zid or Google Sheets"),
          t("تقرير شهري بأداء الفريق والحملات", "A monthly report on team and campaign performance")
        ],
        excludes: [t("رسوم رسائل ميتا (التسويقية والحملات)", "Meta message fees (marketing and campaigns)"), t("الذكاء الاصطناعي وتكامل نظام العملاء (في الأتمتة المتكاملة)", "AI and CRM integration (in Full automation)")]
      },
      {
        key: "wa-advanced",
        icon: "Workflow",
        name: t("الأتمتة المتكاملة", "Full automation"),
        tagline: t("واتساب مرتبط بأنظمتك مع مساعد ذكي", "WhatsApp linked to your systems, with an AI assistant"),
        idealFor: t("الشركات متعددة الفروع والمتاجر ذات الطلبات العالية", "Multi-branch companies and high-volume stores"),
        model: WA,
        about: t("واتساب مرتبط بأنظمتك: مساعد ذكاء اصطناعي يجيب من ملفاتك، وتكامل مع نظام العملاء أو المبيعات، وإشعارات الطلب والشحن، وتوزيع المحادثات على الفروع. السعر المعلن للنطاق الأساسي ويُحدَّد النهائي بعد التحليل.", "WhatsApp connected to your systems: an AI assistant answering from your files, CRM or sales integration, order and shipping notifications and routing across branches. The published price covers the base scope; the final price follows analysis."),
        youProvide: [t("رقم جوال وحساب Meta Business باسمك", "A number and a Meta Business account in your name"), t("الملفات التي سيجيب منها المساعد", "The files the assistant will answer from"), t("صلاحيات الوصول لأنظمتك (CRM / ERP)", "Access to your systems (CRM / ERP)")],
        after: t("اشتراك شهري بحد أدنى 3 أشهر، مع مدير حساب. رسوم ميتا والذكاء الاصطناعي حسب الاستخدام.", "A monthly subscription, minimum 3 months, with an account manager. Meta and AI fees by usage."),
        price: 2999,
        annual: 29990,
        from: true,
        ...perMonth,
        delivery: t("بعد تحليل النطاق، عادة 3 إلى 4 أسابيع", "After scope analysis, usually 3 to 4 weeks"),
        features: [
          t("كل ما في الاحترافية مع 3 مستخدمين", "Everything in Professional, with 3 users"),
          t("مساعد ذكاء اصطناعي يجيب من ملفاتك بالعربية والإنجليزية", "An AI assistant answering from your files in Arabic and English"),
          t("تكامل مع نظام العملاء أو نظام المبيعات (CRM / ERP)", "Integration with your CRM or sales system (CRM / ERP)"),
          t("استرداد السلات المتروكة وإشعارات الطلب والشحن", "Abandoned-cart recovery and order and shipping notifications"),
          t("توزيع المحادثات على الفروع تلقائياً", "Automatic routing across branches"),
          t("مدير حساب ومراجعة شهرية للأداء", "An account manager and a monthly performance review")
        ],
        excludes: [t("رسوم رسائل ميتا ورسوم الذكاء الاصطناعي حسب الاستخدام", "Meta message and AI usage fees"), t("المستخدمون والتكاملات الإضافية (تُسعَّر عند الطلب)", "Extra users and integrations (priced on request)")]
      }
    ]
  },
  {
    id: "ai-automation",
    segment: "business",
    service: "ai-automation",
    icon: "Bot",
    title: t("حلول الذكاء الاصطناعي والأتمتة", "AI & automation solutions"),
    short: t("الذكاء الاصطناعي", "AI & automation"),
    text: t("أتمتة الأعمال المتكررة، ومساعد ذكي يرد على عملائك ويخدم فريقك، بحدود استخدام مكتوبة في العقد.", "Automating repetitive work, and an AI assistant that answers your customers and serves your team, with usage limits written into the contract."),
    highlights: [t("أتمتة العمليات بين أدواتك وأنظمتك", "Process automation across your tools and systems"), t("مساعد يفهم العربية واللهجة السعودية", "An assistant that understands Arabic, including the Saudi dialect"), t("بياناتك ملكك ولا تُستخدم لتدريب نماذج عامة", "Your data stays yours and never trains public models")],
    notice: t("أسعار البداية رسوم تأسيس لمرة واحدة للنطاق المذكور. استضافة التشغيل ورسوم نماذج الذكاء الاصطناعي تُدفع حسب الاستخدام الفعلي وباسمك، ونقدّرها كتابياً قبل البدء. لكل حل حد استهلاك شهري مكتوب في العقد مع تنبيه قبل بلوغه، ولا نقدّم استخداماً أو رسائل بلا حد. الصيانة والتحسين بعد فترة الدعم اشتراك شهري اختياري يُسعَّر في عرض السعر.", "Starting prices are one-time set-up fees for the stated scope. Hosting and AI model fees are paid by actual usage, in your name, and estimated in writing before we start. Every solution has a monthly usage limit in the contract with an alert before it is reached; we don't offer usage or messages without a limit. Maintenance and tuning after the support period is an optional monthly subscription priced in the quote."),
    tiers: [
      {
        key: "ai-auto-starter",
        icon: "Workflow",
        name: t("أتمتة العمليات", "Process automation"),
        tagline: t("عمليتان متكررتان تعملان تلقائياً دون تدخل يدوي", "Two repetitive processes that run automatically, without manual work"),
        idealFor: t("الشركات التي يكرر فريقها الخطوات نفسها يدوياً كل يوم", "Companies whose team repeats the same manual steps every day"),
        model: SYSTEM,
        about: t("نبني لك نظام أتمتة يعمل داخل أدواتك. مثال: طلب يصل من نموذج الموقع فيُسجَّل في نظام العملاء، ويصل للعميل رد عبر واتساب، ويُبلَّغ الموظف المختص، دون أي تدخل يدوي. نختار معك عمليتين، ونبنيهما ونختبرهما ونسلّمهما موثّقتين.", "We build an automation system that runs inside your tools. Example: a request from your site form is saved to your CRM, the customer gets a WhatsApp reply and the right employee is notified, with no manual work. We pick two processes with you, build and test them, and hand them over documented."),
        youProvide: [t("وصف العمليتين وخطواتهما الحالية", "A description of the two processes and their current steps"), t("صلاحيات الوصول للأدوات المطلوب ربطها", "Access to the tools to connect"), t("اشتراكات الأدوات باسمك", "Tool subscriptions in your name")],
        after: t("النظام ملكك وحساباته باسمك. بعد فترة الدعم تتوفر صيانة اختيارية، وتكلفة التشغيل الشهرية (الاستضافة واستخدام الذكاء الاصطناعي) تُدفع حسب الاستخدام ونقدّرها لك كتابياً قبل البدء.", "The system is yours and its accounts are in your name. After the support period, maintenance is optional; the monthly running cost (hosting and AI usage) is paid by usage and estimated for you in writing before we start."),
        price: 5499,
        from: true,
        ...oneTime,
        delivery: t("من 10 أيام عمل", "From 10 business days"),
        features: [
          t("تحليل عملياتك وأتمتة عمليتين قياسيتين حتى 10 خطوات لكل منهما", "Your processes reviewed and two standard processes automated, up to 10 steps each"),
          t("ربط حتى 3 أدوات (النماذج، الجداول، البريد، واتساب، نظام العملاء)", "Up to 3 tools connected (forms, sheets, e-mail, WhatsApp, CRM)"),
          t("مصدرا بيانات كحد أقصى", "Up to two data sources"),
          t("تصنيف الرسائل وتلخيصها بالذكاء الاصطناعي ضمن حد استهلاك شهري متفق عليه", "AI sorting and summarising of messages within an agreed monthly usage limit"),
          t("تنبيه عند أي خطأ وتوثيق لكل عملية", "An alert on any failure and documentation for each process"),
          t("تدريب فريقك ودعم فني لمدة شهر", "Team training and one month of support")
        ],
        excludes: [t("اشتراكات الأدوات واستضافة التشغيل ورسوم الذكاء الاصطناعي حسب الاستخدام", "Tool subscriptions, hosting and AI usage fees"), t("الصيانة الشهرية بعد شهر الدعم (اختيارية)", "Monthly maintenance after the support month (optional)"), t("أي عملية أو تكامل إضافي", "Any extra process or integration")]
      },
      {
        key: "ai-site-bot",
        icon: "MessagesSquare",
        name: t("المساعد الذكي للموقع", "Website AI assistant"),
        tagline: t("يجيب زوار موقعك فوراً من ملفاتك", "Answers your site visitors instantly from your files"),
        idealFor: t("الشركات التي يتكرر فيها سؤال الزوار نفسه", "Companies whose visitors keep asking the same questions"),
        model: SYSTEM,
        about: t("نبني مساعداً ذكياً خاصاً بشركتك ونُدرّبه على ملفاتك وصفحات موقعك، ليجيب الزوار فوراً بالعربية والإنجليزية ويجمع بيانات المهتمين ويرسلها لك. يعمل على موقعك وبحسابك، وليس اشتراكاً في منصة جاهزة.", "We build an AI assistant for your company, trained on your files and site pages, that answers visitors instantly in Arabic and English and collects interested leads for you. It runs on your site and your account — not a subscription to a ready-made platform."),
        youProvide: [t("الملفات والمعلومات التي سيجيب منها (حتى 50 صفحة)", "The files and information it will answer from (up to 50 pages)"), t("صلاحية إضافة نافذة المحادثة إلى موقعك", "Permission to add the chat window to your site"), t("حساب مزوّد الذكاء الاصطناعي باسمك، ونساعدك في إنشائه", "An AI provider account in your name; we help you create it")],
        after: t("النظام ملكك وحساباته باسمك. بعد فترة الدعم تتوفر صيانة اختيارية، وتكلفة التشغيل الشهرية (الاستضافة واستخدام الذكاء الاصطناعي) تُدفع حسب الاستخدام ونقدّرها لك كتابياً قبل البدء.", "The system is yours and its accounts are in your name. After the support period, maintenance is optional; the monthly running cost (hosting and AI usage) is paid by usage and estimated for you in writing before we start."),
        price: 6599,
        from: true,
        ...oneTime,
        delivery: t("من 10 أيام عمل", "From 10 business days"),
        features: [
          t("مدرَّب على حتى 50 صفحة من ملفاتك وموقعك", "Trained on up to 50 pages of your files and site"),
          t("نافذة محادثة بهويتك على موقع واحد", "A branded chat window on one website"),
          t("العربية والإنجليزية", "Arabic and English"),
          t("جمع بيانات المهتمين وإرسالها إلى بريدك أو نظام واحد", "Collects leads and sends them to your inbox or one system"),
          t("حد محادثات شهري متفق عليه مع تنبيه قبل بلوغه", "An agreed monthly conversation limit with an alert before it is reached"),
          t("مراجعة الردود وتحسينها لمدة شهر", "A month of answer review and tuning")
        ],
        excludes: [t("استضافة التشغيل ورسوم استخدام الذكاء الاصطناعي", "Hosting and AI usage fees"), t("واتساب والحجوزات (في المساعد الذكي المتكامل)", "WhatsApp and bookings (in the Integrated AI assistant)"), t("الصيانة الشهرية بعد شهر الدعم (اختيارية)", "Monthly maintenance after the support month (optional)")]
      },
      {
        key: "ai-assistant",
        icon: "Bot",
        name: t("المساعد الذكي المتكامل", "Integrated AI assistant"),
        tagline: t("يرد على عملائك عبر واتساب والموقع ويحجز مواعيدهم", "Answers your customers on WhatsApp and your site, and books their appointments"),
        idealFor: t("العيادات والمتاجر والعقار والشركات الخدمية كثيرة الاستفسارات", "Clinics, stores, real estate and service companies with many enquiries"),
        model: SYSTEM,
        about: t("مساعد ذكي خاص بشركتك يرد على عملائك في واتساب والموقع ويفهم اللهجة السعودية، ويحجز المواعيد مباشرة في نظام الحجوزات، ويسجّل العميل في نظام العملاء، ويحوّل المحادثة لموظف عند الحاجة. نبنيه ونربطه ونسلّمه لك.", "An AI assistant for your company that answers customers on WhatsApp and your site, understands the Saudi dialect, books appointments directly in your booking system, records customers in your CRM and hands over to staff when needed. We build it, connect it and hand it over to you."),
        youProvide: [t("معلومات الخدمات والأسعار والسياسات", "Your services, prices and policies"), t("اشتراك واتساب للأعمال (من باقاتنا أو مزوّد آخر)", "A WhatsApp Business subscription (ours or another provider's)"), t("صلاحيات الوصول لنظام الحجوزات ونظام العملاء", "Access to your booking system and CRM")],
        after: t("النظام ملكك وحساباته باسمك. بعد فترة الدعم تتوفر صيانة اختيارية، وتكلفة التشغيل الشهرية (الاستضافة واستخدام الذكاء الاصطناعي) تُدفع حسب الاستخدام ونقدّرها لك كتابياً قبل البدء.", "The system is yours and its accounts are in your name. After the support period, maintenance is optional; the monthly running cost (hosting and AI usage) is paid by usage and estimated for you in writing before we start."),
        price: 14299,
        from: true,
        ...oneTime,
        delivery: t("من 3 أسابيع", "From 3 weeks"),
        featured: true,
        features: [
          t("مدرَّب على خدماتك وأسعارك وسياساتك من حتى 3 مصادر بيانات", "Trained on your services, prices and policies from up to 3 data sources"),
          t("يرد على واتساب وموقعك بالعربية (واللهجة السعودية) والإنجليزية", "Answers on WhatsApp and your website in Arabic (incl. the Saudi dialect) and English"),
          t("تكاملان: نظام حجوزات أو تقويم واحد، ونظام عملاء واحد", "Two integrations: one booking system or calendar, and one CRM"),
          t("تحويل المحادثة للموظف المناسب، ولوحة مراجعة لحتى 3 مستخدمين", "Hand-over to the right person, and a review dashboard for up to 3 users"),
          t("حد محادثات شهري متفق عليه مع تنبيه عند 80%", "An agreed monthly conversation limit with an alert at 80%"),
          t("بياناتك تبقى في حساباتك ولا تُستخدم لتدريب نماذج عامة، وتُحذف عند الطلب", "Your data stays in your accounts, never trains public models and is deleted on request"),
          t("ضبط وتحسين لمدة 3 أشهر", "Three months of tuning")
        ],
        excludes: [t("استضافة التشغيل ورسوم الذكاء الاصطناعي ورسائل ميتا حسب الاستخدام", "Hosting, AI usage and Meta message fees"), t("اشتراك واتساب للأعمال (في باقات واتساب)", "The WhatsApp Business subscription (in the WhatsApp plans)"), t("التكاملات والمستخدمون الإضافيون والصيانة بعد 3 أشهر", "Extra integrations and users, and maintenance after 3 months")]
      },
      {
        key: "ai-custom",
        icon: "Sparkles",
        name: t("الحلول المخصصة للشركات", "Custom solutions for companies"),
        tagline: t("ذكاء اصطناعي داخل أنظمتك وبياناتك", "AI inside your systems and data"),
        idealFor: t("الشركات والجهات التي لديها بيانات ومستندات كثيرة وأنظمة قائمة", "Companies and entities with lots of data, documents and existing systems"),
        model: SYSTEM,
        about: t("حل ذكاء اصطناعي يُبنى داخل أنظمة شركتك وبياناتها: مساعد معرفة لفريقك، وقراءة المستندات واستخراج بياناتها، وتكاملات بالعدد المحدد في وثيقة النطاق، مع صلاحيات وسجل تدقيق، ويمكن استضافته في حسابك السحابي.", "An AI solution built inside your company's systems and data: a knowledge assistant for your team, document reading and data extraction, and integrations as set in the scope document, with permissions and an audit trail; it can be hosted in your own cloud account."),
        youProvide: [t("المستندات ومصادر البيانات المطلوبة", "The documents and data sources involved"), t("صلاحيات الأنظمة المراد ربطها", "Access to the systems to connect"), t("شخص أو فريق مسؤول لاعتماد حالات الاستخدام", "A person or team to approve the use cases")],
        after: t("النظام ملكك وحساباته باسمك. بعد فترة الدعم تتوفر صيانة اختيارية، وتكلفة التشغيل الشهرية (الاستضافة واستخدام الذكاء الاصطناعي) تُدفع حسب الاستخدام ونقدّرها لك كتابياً قبل البدء.", "The system is yours and its accounts are in your name. After the support period, maintenance is optional; the monthly running cost (hosting and AI usage) is paid by usage and estimated for you in writing before we start."),
        price: 27499,
        from: true,
        ...oneTime,
        delivery: t("من 6 أسابيع حسب النطاق", "From 6 weeks, depending on scope"),
        features: [
          t("ورشة لتحديد حالات الاستخدام ووثيقة نطاق تحدد مصادر البيانات والتكاملات والمستخدمين", "A use-case workshop and a scope document naming data sources, integrations and users"),
          t("مساعد معرفة داخلي يجيب فريقك من مستندات الشركة", "An internal knowledge assistant answering your team from company documents"),
          t("قراءة الفواتير والعقود والمستندات واستخراج بياناتها", "Invoices, contracts and documents read and their data extracted"),
          t("تكاملات مع أنظمتك بالعدد المحدد في وثيقة النطاق", "Integrations with your systems, as many as the scope document sets"),
          t("صلاحيات وسجل تدقيق، وخيار الاستضافة في حسابك السحابي", "Permissions, an audit trail and the option to host in your own cloud account"),
          t("حدود استهلاك شهرية مكتوبة وتقرير استخدام", "Written monthly usage limits and a usage report"),
          t("تسليم موثّق ودعم وتحسين لمدة 6 أشهر", "Documented hand-over and 6 months of support and tuning")
        ],
        excludes: [t("الخوادم ورسوم نماذج الذكاء الاصطناعي حسب الاستخدام", "Servers and AI model usage fees"), t("تراخيص الأنظمة الخارجية", "Third-party system licences"), t("أي تكامل أو مصدر بيانات خارج وثيقة النطاق", "Any integration or data source outside the scope document")]
      }
    ]
  },
  {
    id: "software-development",
    segment: "business",
    service: "web-development",
    icon: "Layers",
    title: t("تطوير الأنظمة والتطبيقات", "Systems & app development"),
    short: t("الأنظمة والتطبيقات", "Systems & apps"),
    text: t("من تصميم واجهات تطبيقك إلى نظام متكامل لشركتك: نحلل المتطلبات، ونوثّق النطاق، ونسلّم على مراحل مع الاختبار والدعم.", "From your app's interface design to a complete company system: we analyse requirements, document the scope and deliver in stages with testing and support."),
    highlights: [t("وثيقة نطاق مكتوبة قبل أي برمجة", "A written scope before any development"), t("تسليم على مراحل مع نسخ تجريبية", "Delivery in stages with test versions"), t("ملكية كاملة للكود وتسليم موثّق", "Full code ownership and a documented hand-over")],
    notice: t("أسعار البداية للنطاق الأساسي المذكور فقط، ولا تعني تنفيذ أي مشروع مهما كان حجمه. يُحدَّد السعر النهائي بعد تحليل المتطلبات حسب ساعات التصميم والتطوير والاختبار والإدارة والتكاملات والمخاطر والصيانة، وتُنفَّذ المشاريع الكبيرة بعرض سعر مخصص ووثيقة نطاق ومراحل تسليم. تطبيقات الآيفون والأندرويد الأصلية والاستضافة وتكاليف نماذج الذكاء الاصطناعي غير مشمولة.", "Starting prices cover the stated base scope only and are not a promise to build any project whatever its size. The final price follows requirements analysis — design, development, testing and management hours, integrations, risk and maintenance — and large projects run on a custom quote, a scope document and delivery stages. Native iOS / Android apps, hosting and AI model costs are not included."),
    tiers: [
      {
        key: "ux-ui",
        icon: "PenTool",
        name: t("تصميم واجهات المستخدم (UX/UI)", "UX/UI design"),
        tagline: t("تصميم فقط، دون برمجة", "Design only, no development"),
        idealFor: t("رواد الأعمال والشركات قبل بدء برمجة تطبيق أو نظام", "Founders and companies before building an app or system"),
        model: DESIGN,
        about: t("نصمم واجهات تطبيقك أو نظامك قبل البرمجة: رحلة المستخدم ومخطط الشاشات، ثم التصميم النهائي ونموذج تفاعلي تجرّبه، وتستلم ملفات منظمة يبني عليها أي فريق برمجة.", "We design your app or system's screens before development: user journey and wireframes, then the final design and a clickable prototype, delivered as organised files any development team can build from."),
        youProvide: [t("فكرة المنتج والمستخدمون المستهدفون", "Your product idea and target users"), t("الشعار والهوية إن وُجدت", "Your logo and brand, if any"), t("أمثلة لتطبيقات تعجبك (اختياري)", "Examples of apps you like (optional)")],
        after: t("تستلم ملفات التصميم المصدرية وتملكها. البرمجة غير مشمولة ويمكن تسعيرها منفصلة.", "You receive and own the source design files. Development isn't included and can be quoted separately."),
        price: 5499,
        from: true,
        ...oneTime,
        delivery: t("من 14 يوم عمل", "From 14 business days"),
        revisions: t("جولتا تعديل", "Two rounds"),
        features: [
          t("النطاق الأساسي: حتى 15 شاشة ضمن مسار استخدام واحد متفق عليه", "Base scope: up to 15 screens within one agreed user flow"),
          t("رحلة المستخدم ومخططات الشاشات قبل التصميم", "User journey and wireframes before design"),
          t("نموذج تفاعلي قابل للتجربة", "A clickable interactive prototype"),
          t("جولتا تعديل", "Two revision rounds"),
          t("ملفات تصميم منظمة جاهزة للمطورين", "Design files organised and ready for developers")
        ],
        excludes: [t("برمجة التطبيق أو النظام", "Developing the app or system"), t("الشعار والهوية البصرية", "Logo and brand identity")]
      },
      {
        key: "integration",
        icon: "Plug",
        name: t("ربط الأنظمة", "System integration"),
        tagline: t("نظامان يتبادلان البيانات تلقائياً", "Two systems exchanging data automatically"),
        idealFor: t("الشركات التي تُدخل البيانات نفسها في أكثر من نظام", "Companies entering the same data in several systems"),
        model: SYSTEM,
        about: t("نربط نظامين تستخدمهما، مثل المتجر والمحاسبة أو نظام العملاء والجداول، لتنتقل البيانات بينهما تلقائياً بدل إدخالها مرتين، مع سجل لكل عملية وتنبيه عند الخطأ.", "We connect two systems you use — such as your store and accounting, or your CRM and spreadsheets — so data moves between them automatically instead of being entered twice, with a log of every transfer and alerts on errors."),
        youProvide: [t("اسما النظامين والبيانات المطلوب نقلها", "The two systems and the data to move"), t("صلاحيات الوصول وواجهات البرمجة (API)", "Access and API credentials"), t("اشتراكات الأنظمة باسمك", "System subscriptions in your name")],
        after: t("الربط ملكك ويعمل على حساباتك. شهر دعم، ثم صيانة اختيارية إذا تغيّر أحد النظامين.", "The integration is yours and runs on your accounts. One month of support, then optional maintenance if either system changes."),
        price: 6599,
        from: true,
        ...oneTime,
        delivery: t("من 7 أيام عمل", "From 7 business days"),
        features: [
          t("ربط نظامين عبر واجهاتهما البرمجية الموثّقة", "Two systems connected through their documented APIs"),
          t("مزامنة تلقائية في الاتجاهين عند الحاجة", "Automatic two-way sync when needed"),
          t("إعادة المحاولة تلقائياً عند انقطاع أحد النظامين", "Automatic retries when either system is down"),
          t("سجل لكل عملية وتنبيه عند الخطأ", "A log of every transfer and alerts on errors"),
          t("دعم فني لمدة شهر", "One month of support")
        ],
        excludes: [t("اشتراكات الأنظمة ورسوم واجهاتها", "System subscriptions and API fees"), t("الأنظمة التي لا تتيح واجهة برمجية أو تتطلب موافقة طرف ثالث (نوضحها قبل البدء)", "Systems without an API or that need a third party's approval (explained before we start)")]
      },
      {
        key: "dashboard",
        icon: "ChartColumn",
        name: t("لوحة مؤشرات الإدارة", "Management dashboard"),
        tagline: t("أرقام شركتك في شاشة واحدة تتحدّث تلقائياً", "Your company's numbers on one self-updating screen"),
        idealFor: t("المديرون الذين يريدون قرارات مبنية على أرقام فعلية", "Managers who want decisions based on real numbers"),
        model: SYSTEM,
        about: t("لوحة تجمع أهم أرقام شركتك، مثل المبيعات والطلبات والتحصيل، من مصدرين للبيانات، وتتحدّث تلقائياً، وتصلك ملخصاتها أسبوعياً بالبريد.", "A dashboard bringing together your key numbers — such as sales, orders and collections — from two data sources, updating automatically, with a weekly summary by e-mail."),
        youProvide: [t("المؤشرات التي تريد متابعتها", "The KPIs you want to follow"), t("صلاحيات الوصول لمصادر البيانات", "Access to the data sources"), t("شخص يراجع الأرقام عند الإطلاق", "Someone to check the numbers at launch")],
        after: t("اللوحة ملكك. شهر دعم، وإضافة مؤشرات أو مصادر لاحقاً تُسعَّر منفصلة.", "The dashboard is yours. One month of support; extra KPIs or sources later are priced separately."),
        price: 7699,
        from: true,
        ...oneTime,
        delivery: t("من 10 أيام عمل", "From 10 business days"),
        features: [
          t("حتى 12 مؤشراً في لوحة واحدة", "Up to 12 KPIs on one dashboard"),
          t("ربط حتى مصدرين للبيانات", "Up to 2 data sources connected"),
          t("تحديث تلقائي وصلاحيات لمن يطّلع عليها", "Automatic refresh and access control"),
          t("تقرير أسبوعي بالبريد", "A weekly e-mail report"),
          t("دعم فني لمدة شهر", "One month of support")
        ],
        excludes: [t("تراخيص أدوات التقارير إن وُجدت", "Reporting tool licences, if any"), t("تنظيف البيانات التاريخية الكبيرة", "Cleaning large historical data")]
      },
      {
        key: "app-mvp",
        icon: "Rocket",
        name: t("نسخة أولى من تطبيق ويب (MVP)", "Web app MVP"),
        tagline: t("نسخة تعمل لاختبار فكرتك في السوق", "A working version to test your idea in the market"),
        idealFor: t("الشركات الناشئة والمشاريع الجديدة", "Start-ups and new ventures"),
        model: SYSTEM,
        about: t("نسخة أولى عاملة من تطبيق الويب الخاص بك بالمزايا الأساسية فقط، لتختبر فكرتك مع مستخدمين حقيقيين قبل التوسع. نحدد المزايا معاً في وثيقة نطاق، ثم نبني ونختبر ونسلّم الكود موثّقاً.", "A working first version of your web app with only the core features, to test your idea with real users before scaling. We define the features together in a scope document, then build, test and hand over documented code."),
        youProvide: [t("وصف الفكرة والمستخدمين والمزايا الأساسية", "Your idea, users and core features"), t("شخص مسؤول لاعتماد المراحل", "A person to approve each stage"), t("حسابات الاستضافة والخدمات الخارجية باسمك", "Hosting and third-party accounts in your name")],
        after: t("الكود ملكك بالكامل. 3 أشهر دعم، والتطوير بعدها بعرض سعر أو بفريق تقني شهري.", "The code is fully yours. 3 months of support; further development by quote or with a monthly tech team."),
        price: 27499,
        from: true,
        ...oneTime,
        delivery: t("من 8 أسابيع حسب النطاق", "From 8 weeks, depending on scope"),
        revisions: byScope,
        features: [
          t("تحليل المتطلبات ووثيقة نطاق محددة", "Requirements analysis and a defined scope"),
          t("الشاشات الأساسية بالعربية والإنجليزية", "Core screens in Arabic and English"),
          t("قاعدة بيانات وحسابات مستخدمين عند الحاجة", "A database and user accounts when needed"),
          t("اختبار قبل التسليم", "Testing before hand-over"),
          t("تسليم موثّق ودعم لمدة 3 أشهر", "Documented hand-over and 3 months of support")
        ],
        excludes: [t("تطبيقات الآيفون والأندرويد الأصلية", "Native iOS and Android apps"), t("الاستضافة والخدمات الخارجية", "Hosting and third-party services")]
      },
      {
        key: "enterprise-systems",
        icon: "Building2",
        name: t("أنظمة الشركات", "Enterprise systems"),
        tagline: t("نظام مبني على طريقة عمل شركتك", "A system built around how your company works"),
        idealFor: t("الشركات المتوسطة والكبيرة ذات العمليات والأنظمة المتعددة", "Mid-size and large companies with many processes and systems"),
        model: SYSTEM,
        about: t("نظام خاص بشركتك مبني على طريقة عملها: إدارة العمليات والصلاحيات والتقارير، وتكامل مع أنظمتك الحالية. نبدأ بدراسة المتطلبات، ثم عرض سعر ومراحل تسليم. الرقم المعلن مؤشر أولي فقط.", "A system built around how your company works: operations, permissions and reports, integrated with your current systems. We start with a requirements study, then a quote and delivery stages. The published figure is an initial indication only."),
        youProvide: [t("وصف العمليات الحالية والأنظمة المستخدمة", "Your current processes and systems"), t("فريق أو شخص مسؤول من جهتك", "A responsible person or team on your side"), t("صلاحيات الأنظمة المراد ربطها", "Access to the systems to connect")],
        after: t("النظام والكود ملكك. دعم بعد التسليم وعقد صيانة حسب الاتفاق.", "The system and code are yours. Support after delivery and a maintenance contract as agreed."),
        price: 38500,
        from: true,
        indicative: true,
        ...oneTime,
        delivery: t("تُحدَّد بعد دراسة المتطلبات", "Set after the requirements study"),
        revisions: byScope,
        features: [
          t("دراسة متطلبات ووثيقة نطاق ومراحل تسليم وعرض سعر مخصص", "A requirements study, scope document, delivery stages and a custom quote"),
          t("لوحات إدارة وأدوار وصلاحيات", "Admin dashboards, roles and permissions"),
          t("تكاملات مع أنظمتك (ERP، المحاسبة، نظام العملاء) حسب الدراسة", "Integrations with your systems (ERP, accounting, CRM) per the study"),
          t("تقارير ومؤشرات للإدارة", "Reports and KPIs for management"),
          t("سجل تدقيق وحماية للبيانات", "An audit trail and data protection"),
          t("تسليم على مراحل ودعم وصيانة", "Staged delivery, support and maintenance")
        ],
        excludes: [t("الخوادم والتراخيص الخارجية", "Servers and third-party licences"), t("تطبيقات الجوال الأصلية (تُسعَّر منفصلة)", "Native mobile apps (priced separately)")]
      }
    ]
  },
  {
    id: "dedicated-tech-team",
    segment: "business",
    service: "dedicated-tech-team",
    icon: "Users",
    title: t("الفريق التقني المخصص", "Dedicated tech team"),
    short: t("الفريق التقني", "Tech team"),
    text: t("فريق تقني يعمل لشركتك شهرياً دون أعباء التوظيف: مطور ومصمم ومدير مشروع.", "A tech team working for your company every month, without the cost of hiring: a developer, a designer and a project manager."),
    highlights: [t("مطور ومصمم ومدير مشروع لشركتك", "A developer, a designer and a project manager for you"), t("120 ساعة مشتركة للفريق شهرياً حسب أولوياتك", "120 shared team hours a month on your priorities"), t("دون أعباء التوظيف والتأمينات", "No hiring or payroll costs")],
    notice: t("يضم الفريق في كل الباقات مطوّر برمجيات متكاملاً ومصمم واجهات وتجربة مستخدم ومدير مشروع. الـ120 ساعة شهرياً مشتركة للفريق كاملاً، وليست 120 ساعة لكل فرد، وتُوزَّع بين التطوير والتصميم وإدارة المشروع حسب أولويات تتفقون عليها كل شهر. يعمل الفريق في أيام وساعات العمل الرسمية، والساعات الإضافية تُعتمد مسبقاً. تختلف الباقات في مدة الالتزام والسعر الشهري وترحيل الساعات.", "Every plan includes a full-stack developer, a UI/UX designer and a project manager. The 120 hours a month are shared by the whole team — not 120 hours per person — and split between development, design and project management by priorities agreed each month. The team works official business days and hours; extra hours are approved in advance. Plans differ in commitment, monthly price and hour rollover."),
    tiers: [
      {
        key: "team-monthly",
        icon: "CalendarClock",
        name: t("اشتراك شهري", "Monthly"),
        tagline: t("مرونة كاملة شهراً بشهر", "Full flexibility, month to month"),
        idealFor: t("مشروع قصير، أو تجربة العمل معنا قبل الالتزام", "A short project, or trying us before committing"),
        model: TEAM_M,
        about: t("مطور ومصمم ومدير مشروع يعملون على أولوياتك بـ120 ساعة مشتركة شهرياً، مع اجتماع أسبوعي وتقرير بالساعات والمهام. مناسب لتطوير منتجك أو موقعك أو أنظمتك باستمرار.", "A developer, a designer and a project manager working on your priorities for 120 shared hours a month, with a weekly meeting and a report of hours and tasks — for continuously developing your product, site or systems."),
        youProvide: [t("قائمة الأولويات والمهام", "Your list of priorities and tasks"), t("صلاحيات الوصول للأنظمة والحسابات", "Access to the relevant systems and accounts"), t("شخص مسؤول للتواصل واعتماد الأعمال", "A contact person to approve the work")],
        after: t("كل ما ينفّذه الفريق ملكك، والاستضافة وتراخيص الأدوات على حسابك.", "Everything the team builds is yours; hosting and tool licences are on your account."),
        price: 13500,
        from: false,
        ...perMonth,
        delivery: t("يبدأ الفريق خلال 7 أيام عمل", "The team starts within 7 business days"),
        features: [
          t("120 ساعة عمل مشتركة للفريق شهرياً", "120 shared team hours a month"),
          t("اجتماع أسبوعي ومتابعة يومية عبر قناة مشتركة", "A weekly meeting and daily updates on a shared channel"),
          t("تعديل الأولويات ونطاق العمل كل شهر", "Priorities and scope adjusted every month"),
          t("تقرير إنجاز شهري بالساعات والمهام", "A monthly report of hours and tasks"),
          t("الإلغاء بإشعار قبل 30 يوماً", "Cancel with 30 days' notice")
        ],
        excludes: [t("الاستضافة وتراخيص الأدوات الخارجية", "Hosting and third-party tool licences"), t("ترحيل الساعات غير المستخدمة", "Rolling over unused hours")]
      },
      {
        key: "team-semiannual",
        icon: "Calendar",
        name: t("التزام 6 أشهر", "6-month commitment"),
        tagline: t("خطة تطوير واضحة بسعر شهري أقل", "A clear development plan at a lower monthly rate"),
        idealFor: t("الشركات التي لديها خطة تطوير لعدة أشهر", "Companies with a multi-month development plan"),
        model: TEAM_6,
        about: t("الفريق نفسه بـ120 ساعة مشتركة شهرياً، مع خطة تطوير مكتوبة لستة أشهر، وترحيل حتى 20 ساعة غير مستخدمة للشهر التالي، ومراجعة أداء ربع سنوية.", "The same team for 120 shared hours a month, with a written six-month plan, up to 20 unused hours rolled to the next month and a quarterly review."),
        youProvide: [t("قائمة الأولويات والمهام", "Your list of priorities and tasks"), t("صلاحيات الوصول للأنظمة والحسابات", "Access to the relevant systems and accounts"), t("شخص مسؤول للتواصل واعتماد الأعمال", "A contact person to approve the work")],
        after: t("كل ما ينفّذه الفريق ملكك، والاستضافة وتراخيص الأدوات على حسابك.", "Everything the team builds is yours; hosting and tool licences are on your account."),
        price: 12400,
        from: false,
        ...perMonth,
        delivery: t("يبدأ الفريق خلال 7 أيام عمل", "The team starts within 7 business days"),
        featured: true,
        features: [
          t("120 ساعة مشتركة للفريق شهرياً، أقل من الاشتراك الشهري بـ8%", "120 shared team hours a month, 8% below the monthly plan"),
          t("خطة تطوير مكتوبة لستة أشهر", "A written six-month development plan"),
          t("ترحيل حتى 20 ساعة غير مستخدمة إلى الشهر التالي فقط", "Up to 20 unused hours roll over to the next month only"),
          t("مراجعة أداء ربع سنوية مع الإدارة", "A quarterly performance review with management"),
          t("أولوية في جدولة المهام العاجلة", "Priority scheduling for urgent tasks")
        ],
        excludes: [t("الاستضافة وتراخيص الأدوات الخارجية", "Hosting and third-party tool licences")]
      },
      {
        key: "team-annual",
        icon: "Award",
        name: t("التزام سنوي", "Annual commitment"),
        tagline: t("شريك تقني طويل المدى", "A long-term technology partner"),
        idealFor: t("الشركات التي تريد فريقاً تقنياً ثابتاً بدل التوظيف", "Companies that want a steady tech team instead of hiring"),
        model: TEAM_12,
        about: t("الفريق نفسه طوال السنة بـ120 ساعة مشتركة شهرياً، مع خارطة طريق تقنية سنوية، وترحيل حتى 30 ساعة، واختبار قبل كل إصدار، وأعلى أولوية في الدعم.", "The same team all year for 120 shared hours a month, with an annual roadmap, up to 30 hours rolled over, testing before every release and top support priority."),
        youProvide: [t("قائمة الأولويات والمهام", "Your list of priorities and tasks"), t("صلاحيات الوصول للأنظمة والحسابات", "Access to the relevant systems and accounts"), t("شخص مسؤول للتواصل واعتماد الأعمال", "A contact person to approve the work")],
        after: t("كل ما ينفّذه الفريق ملكك، والاستضافة وتراخيص الأدوات على حسابك.", "Everything the team builds is yours; hosting and tool licences are on your account."),
        price: 11200,
        from: false,
        ...perMonth,
        delivery: t("يبدأ الفريق خلال 7 أيام عمل", "The team starts within 7 business days"),
        features: [
          t("120 ساعة مشتركة للفريق شهرياً، أقل من الاشتراك الشهري بـ17%", "120 shared team hours a month, 17% below the monthly plan"),
          t("أعضاء الفريق أنفسهم طوال السنة", "The same team members all year"),
          t("خارطة طريق تقنية سنوية", "An annual technology roadmap"),
          t("ترحيل حتى 30 ساعة غير مستخدمة إلى الشهر التالي فقط", "Up to 30 unused hours roll over to the next month only"),
          t("مراجعة جودة واختبار قبل كل إصدار", "QA review and testing before every release"),
          t("أعلى أولوية في الدعم خلال ساعات العمل", "Top support priority during business hours")
        ],
        excludes: [t("الاستضافة وتراخيص الأدوات الخارجية", "Hosting and third-party tool licences")]
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
 * Limited-time offers. The self-renewing daily deals and weekly offers were stopped on 2026-11-05; an offer is added
 * here only with the company's approval, real dates and a `basis` of current fixed-price packages (see `Offer`). AI and
 * systems packages have "from" prices only, so they can't back an offer.
 *
 * 1–14 Dec 2026 ( after the raised prices of 2026-11-05 are live, so every struck price is one the site really
 * charged): four offers 13–18% below their packages. None duplicates a permanent plan (ads + social together is the
 * 90-day plan) and none is cheaper per month than a permanent price for the same thing.
 */
// the campaign name is shown on every banner, as the offers section title and on the hero button — change it here only
const CAMPAIGN = { campaign: t("عروض لفترة محدودة", "Limited-time offers"), startsAt: "2026-12-01", endsAt: "2026-12-14", approved: "طلب المالك — 2026-11-05" };
const holdPrice = t("يُثبَّت سعر العرض للطلبات المرسلة حتى نهاية 14 ديسمبر 2026، ولو بدأ التنفيذ بعد ذلك", "The offer price holds for requests sent by the end of 14 December 2026, even if work starts later");
const halfHalf = t("الدفع: 50% عند البدء و50% عند التسليم", "Payment: 50% to start, 50% on delivery");

export const offers: Offer[] = [
  {
    slug: "ramadan-store",
    service: "ecommerce",
    icon: "ShoppingBag",
    ...CAMPAIGN,
    name: t("إطلاق متجر متكامل", "Complete store launch"),
    pitch: t("المتجر الاحترافي مع إدارة حملته الإعلانية في الشهر الأول، ليكون متجرك جاهزاً قبل موسم رمضان.", "The Professional store with its ad campaign managed for the first month, so your store is ready before the Ramadan season."),
    forWho: t("العلامات التي تبيع عبر إنستغرام أو واتساب وتريد متجراً رسمياً يبدأ البيع والإعلان مباشرة.", "Brands selling on Instagram or WhatsApp that want a proper store that starts selling and advertising right away."),
    price: 7499,
    basis: [{ key: "store-growth" }, { key: "mkt-start", months: 1 }],
    terms: [holdPrice, halfHalf, t("يبدأ شهر الحملة بعد إطلاق المتجر", "The campaign month starts after the store goes live")]
  },
  {
    slug: "business-website-season",
    service: "web-development",
    icon: "Rocket",
    ...CAMPAIGN,
    name: t("موقع الأعمال", "Business website"),
    pitch: t("موقع ثنائي اللغة بتصميم مخصص ولوحة تحكم واستضافة للسنة الأولى، لتبدأ عام 2027 بموقع جديد.", "A bilingual, custom-designed site with a content panel and first-year hosting, so you start 2027 with a new website."),
    forWho: t("الشركات التي تعتمد على موقعها في استقبال العملاء والحملات.", "Companies that rely on their website for enquiries and campaigns."),
    price: 9499,
    basis: [{ key: "web-growth" }],
    terms: [holdPrice, halfHalf]
  },
  {
    slug: "landing-campaign-season",
    service: "digital-marketing",
    icon: "MousePointerClick",
    ...CAMPAIGN,
    name: t("حملة جاهزة: صفحة هبوط وشهر إعلانات", "Ready campaign: landing page + a month of ads"),
    pitch: t("صفحة هبوط لعرضك أو منتجك، مع إدارة حملته الإعلانية لمدة شهر على منصة واحدة.", "A landing page for your offer or product, with its ad campaign managed for a month on one platform."),
    forWho: t("من لديه منتج أو خدمة أو عرض يريد الإعلان عنه مطلع العام أو في موسم رمضان.", "Anyone with a product, service or offer to advertise early in the year or in Ramadan."),
    price: 4299,
    basis: [{ key: "landing-page" }, { key: "mkt-start", months: 1 }],
    terms: [holdPrice, halfHalf, t("يبدأ شهر الحملة بعد نشر الصفحة", "The campaign month starts once the page is live")]
  },
  {
    slug: "whatsapp-season",
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    ...CAMPAIGN,
    name: t("واتساب الاحترافية — الشهر الأول", "WhatsApp Professional — first month"),
    pitch: t("رقم رسمي وشات بوت يؤهل العملاء ويوزعهم على فريقك، بسعر مخفّض للشهر الأول.", "An official number and a chatbot that qualifies customers and routes them to your team, at a reduced price for the first month."),
    forWho: t("المتاجر والشركات التي تزيد رسائلها في المواسم وتحتاج رداً منظماً وسريعاً.", "Stores and companies whose messages peak in busy seasons and need organised, fast replies."),
    price: 1079,
    basis: [{ key: "wa-pro", months: 1 }],
    terms: [holdPrice, t("سعر العرض للشهر الأول فقط ويُدفع مقدماً، ثم يستمر الاشتراك بالسعر الشهري المعلن للباقة وبشروطها، ومنها الحد الأدنى 3 أشهر", "The offer price covers the first month only, paid upfront; the subscription then continues at the package's published monthly price and terms, including its 3-month minimum"), t("اعتماد الحساب وقوالب الرسائل يخضع لموافقة ميتا", "Account and template approval is subject to Meta")]
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
  "season-marketing": "mkt-growth",
  today: null
};

export const deals: Deal[] = [
  {
    token: "example-k3v9q2",
    client: t("شركة المثال التجارية", "Example Trading Co."),
    title: t("عرض خاص: موقع ومتجر وواتساب", "Special offer: website, store and WhatsApp"),
    text: t("مثال لعرض خاص بعميل واحد، ورابطه لا يظهر في الموقع ولا في محركات البحث.", "An example single-client offer; its link is not listed on the site or in search engines."),
    items: [
      { label: t("موقع الشركة — موقع الأعمال", "Company website — Business website"), price: 10999 },
      { label: t("متجر إلكتروني — المتجر الاحترافي", "Online store — Professional store"), price: 6599 },
      { label: t("واتساب للأعمال — الاحترافية (3 أشهر)", "WhatsApp — Professional (3 months)"), price: 3897 }
    ],
    total: 21495,
    expiresAt: "2030-12-31",
    preview: true
  }
];

/** Design examples (`preview`) and unapproved groups (`draft`) exist in development only. */
const inDevelopment = () => process.env.NODE_ENV !== "production";
const live = (x: { preview?: boolean; draft?: boolean }) => !(x.preview || x.draft) || inDevelopment();
/** The package groups visitors may see (drafts only in development). */
export const visibleGroups = (groups: PackageGroup[] = packageGroups) => groups.filter(live);
const day = (s: string) => new Date(`${s}T00:00:00+03:00`);
/** End of the given Riyadh day as an ISO instant (private deals and offers run through their last day). */
export const offerEndInstant = (s: string) => new Date(day(s).getTime() + 86_400_000).toISOString();

/** A visible package by key, with its group. */
export function findTier(key: string, groups: PackageGroup[] = packageGroups) {
  for (const g of visibleGroups(groups)) {
    const x = g.tiers.find((y) => y.key === key);
    if (x) return { group: g, tier: x };
  }
  return null;
}
/** An offer's packages with what each costs today; null when a part has no fixed price or is not visible. */
export function basisParts(o: Offer, groups: PackageGroup[] = packageGroups) {
  const parts = o.basis.map((b) => {
    const f = findTier(b.key, groups);
    if (!f || f.tier.from || f.tier.price === null) return null;
    const months = f.tier.billing === "one-time" ? null : (b.months ?? 1);
    return { ...f, months, price: f.tier.price * (months ?? 1) };
  });
  return parts.length && parts.every((p) => p !== null) ? (parts as NonNullable<(typeof parts)[number]>[]) : null;
}
/** What an offer's packages cost today at their published prices (its struck price). */
export function basisPrice(o: Offer, groups: PackageGroup[] = packageGroups): number | null {
  const parts = basisParts(o, groups);
  return parts ? parts.reduce((s, p) => s + p.price, 0) : null;
}
/** live = approved, within its dates and cheaper than its packages; scheduled / ended by date; invalid = never shown. */
export function offerStatus(o: Offer, now = new Date(), groups: PackageGroup[] = packageGroups): "live" | "scheduled" | "ended" | "invalid" {
  const base = basisPrice(o, groups);
  if (!o.approved || base === null || o.price >= base || o.endsAt < o.startsAt) return "invalid";
  if (now < day(o.startsAt)) return "scheduled";
  if (now >= new Date(offerEndInstant(o.endsAt))) return "ended";
  return "live";
}
/** Offers running now. */
export function activeOffers(now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return list.filter((o) => offerStatus(o, now, groups) === "live");
}
/** What the page shows: running offers, plus — in development only — approved offers that haven't started (preview). */
export function visibleOffers(now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return list.filter((o) => {
    const s = offerStatus(o, now, groups);
    return s === "live" || (s === "scheduled" && inDevelopment());
  });
}
export function findOffer(slug: string, now = new Date(), list = offers, groups: PackageGroup[] = packageGroups) {
  return activeOffers(now, list, groups).find((o) => o.slug === slug) ?? null;
}
/** A private deal by its token: `expired` once past expiresAt (the page then says so instead of showing it). */
export function findDeal(token: string, now = new Date()) {
  const d = deals.find((x) => x.token === token && live(x));
  if (!d) return null;
  return { deal: d, expired: now >= new Date(offerEndInstant(d.expiresAt)) };
}

const sar = (n: number) => `${n.toLocaleString("en-US")} ر.س`;
/** What a form key stands for ("pkg:web-growth", "offer:<slug>", "deal:<token>"), in Arabic for the CRM / e-mail. */
export function offerLabel(key: string, cat: Catalog = fileCatalog): string | null {
  const [kind, id] = key.split(":");
  if (kind === "pkg") {
    const f = findTier(id, cat.groups);
    if (f) return `${f.group.title.ar} — ${f.tier.name.ar}`;
  }
  if (kind === "offer") {
    const o = cat.offers.find((x) => x.slug === id);
    if (o) return `عرض لفترة محدودة: ${o.name.ar}`;
    if (id in retiredOffers) return `عرض سابق متوقف (${id})`;
  }
  if (kind === "deal") {
    const d = deals.find((x) => x.token === id && live(x));
    if (d) return `عرض خاص: ${d.title.ar} (${d.client.ar})`;
  }
  return null;
}
/**
 * The reference price of a form key at the moment of the request, resolved on the server (never from the visitor):
 * amount, how it is paid and one Arabic line for the CRM lead and the e-mail. null when the key has no price.
 */
export function offerReference(key: string, cat: Catalog = fileCatalog): { price: number; from: boolean; billing: Billing; termMonths: number | null; text: string } | null {
  const [kind, id] = key.split(":");
  const vat = "قبل ضريبة القيمة المضافة 15%";
  if (kind === "pkg") {
    const x = findTier(id, cat.groups)?.tier;
    if (!x || x.price === null) return null;
    const lead = x.from ? (x.indicative ? "مؤشر أولي من " : "يبدأ من ") : "";
    const avg = x.termMonths ? ` (متوسط ${sar(Math.round(x.price / x.termMonths))} شهرياً)` : "";
    return { price: x.price, from: x.from, billing: x.billing, termMonths: x.termMonths ?? null, text: `${lead}${sar(x.price)} — ${x.period?.ar ?? ""}${avg}، ${vat}` };
  }
  if (kind === "offer") {
    const o = findOffer(id, new Date(), cat.offers, cat.groups);
    const base = o ? basisPrice(o, cat.groups) : null;
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
  eyebrow: t("الباقات والعروض", "Packages & offers"),
  title: t("حلول رقمية لأعمالك *بأسعار واضحة ونطاق محدد*", "Digital solutions for your business, *with clear prices and a defined scope*"),
  sub: t("مواقع ومتاجر إلكترونية، وإدارة إعلانات وحسابات تواصل اجتماعي، وواتساب للأعمال، وحلول ذكاء اصطناعي وأنظمة. لكل باقة سعر معلن ونطاق مكتوب، وما لا تشمله مذكور بوضوح.", "Websites and online stores, ads and social media management, WhatsApp Business, AI and systems. Every package has a published price and a written scope, and states plainly what it doesn't include."),
  seePackages: t("تصفّح الباقات", "Browse packages"),
  whatsapp: t("تواصل عبر واتساب", "Chat on WhatsApp"),
  heroPoints: [t("أسعار معلنة قبل الضريبة", "Published prices before VAT"), t("نطاق مكتوب لكل باقة", "A written scope for every package"), t("فاتورة ضريبية لكل دفعة", "A tax invoice for every payment"), t("ملكية كاملة بعد السداد", "Full ownership once paid")],
  pickService: t("اختر الخدمة", "Choose a service"),
  startsAt: t("يبدأ من", "From"),
  // what the page means by each word
  glossary: [
    { title: t("الباقة", "Package"), text: t("خدمة بنطاق مكتوب وسعر معلن.", "A service with a written scope and a published price.") },
    { title: t("العرض", "Offer"), text: t("سعر خاص على باقة أو أكثر لفترة محددة بتاريخ.", "A special price on one or more packages, for set dates.") },
    { title: t("عرض السعر المخصص", "Custom quote"), text: t("للمشاريع التي يختلف سعرها حسب المتطلبات.", "For projects whose price depends on requirements.") }
  ],
  // offers
  offersNote: t("أسعار خاصة على باقات محددة لفترة محدودة. السعر قبل الخصم هو سعر الباقة المعلن حالياً، ويُثبَّت سعر العرض للطلبات المرسلة قبل انتهائه.", "Special prices on selected packages for a limited time. The price before discount is the package's current published price, and requests sent before the end date keep the offer price."),
  offerDates: t("من {start} إلى {end}", "{start} to {end}"),
  upcoming: t("معاينة: يبدأ العرض في {date} ولا يظهر للزوار قبل ذلك", "Preview: the offer starts on {date} and is hidden from visitors until then"),
  components: t("يشمل العرض", "The offer includes"),
  partsTotal: t("بدلاً من", "Instead of"),
  offerPrice: t("سعر العرض", "Offer price"),
  forMonths: t("لمدة {n} أشهر", "for {n} months"),
  forMonth: t("لمدة شهر", "for one month"),
  packageDetails: t("تفاصيل الباقة", "Package details"),
  offerTerms: t("شروط العرض", "Offer conditions"),
  offerExcludes: t("لا يشمله العرض", "Not included"),
  scopeFromPackages: t("نطاق كل باقة في العرض هو نفسه المكتوب في صفحتها.", "Each package in the offer keeps the scope written on its own page."),
  ended: t("انتهى هذا العرض", "This offer has ended"),
  endedText: t("يمكنك طلب الباقة بسعرها الحالي، أو طلب عرض سعر يناسب احتياجك.", "You can order the package at its current price, or ask for a quote that fits your needs."),
  endsIn: t("ينتهي خلال", "Ends in"),
  endsOn: t("ينتهي في", "Ends on"),
  days: t("يوم", "d"),
  hours: t("ساعة", "h"),
  minutes: t("دقيقة", "m"),
  save: t("توفير", "Save"),
  /** {n} = the discount percentage */
  off: t("خصم {n}%", "{n}% off"),
  details: t("تفاصيل العرض", "Offer details"),
  // packages
  packagesTitle: t("الباقات", "Packages"),
  packagesSub: t("كل باقة تذكر ما تشمله وحدودها وما لا تشمله. الأسعار قبل ضريبة القيمة المضافة، و«يبدأ من» سعر النطاق الأساسي المكتوب فقط.", "Every package states what it includes, its limits and what it doesn't. Prices are before VAT; \"From\" covers the written base scope only."),
  mostPopular: t("الأكثر طلباً", "Most requested"),
  idealFor: t("مناسبة لـ", "Best for"),
  included: t("ما تشمله الباقة", "What's included"),
  aboutPackage: t("ماذا ستحصل عليه", "What you get"),
  youProvide: t("ما نحتاجه منك", "What we need from you"),
  after: t("بعد التسليم", "After delivery"),
  moreDetails: t("ما نحتاجه منك وما بعد التسليم", "What we need from you, and after delivery"),
  notIncluded: t("لا تشمل", "Not included"),
  delivery: t("مدة التنفيذ", "Delivery"),
  revisions: t("جولات التعديل", "Revisions"),
  from: t("يبدأ من", "From"),
  indicative: t("مؤشر أولي من", "Initial indication from"),
  scopeNote: t("السعر للنطاق الأساسي المذكور، والسعر النهائي بعد تحليل المتطلبات.", "The price covers the stated base scope; the final price follows a requirements analysis."),
  inclVat: t("شامل الضريبة", "incl. VAT"),
  exVat: t("قبل الضريبة", "before VAT"),
  monthlyAvg: t("المتوسط الشهري", "Monthly average"),
  billing: { "one-time": t("دفعة واحدة", "One-time"), monthly: t("اشتراك شهري", "Monthly subscription"), term: t("عقد 3 أشهر", "3-month contract") } as Record<"one-time" | "monthly" | "term", L>,
  yearly: t("أو سنوياً", "or yearly"),
  onRequest: t("السعر حسب المتطلبات", "Priced to your requirements"),
  choose: t("اطلب الباقة", "Order this package"),
  customQuote: t("اطلب عرض سعر", "Request a quote"),
  quote: t("اطلب عرض سعر", "Request a quote"),
  aboutService: t("عن الخدمة", "About the service"),
  draft: t("مسودة للمراجعة — تظهر على جهازك فقط حتى اعتماد الأسعار", "Draft for review — visible on your machine only until prices are approved"),
  journeyTitle: t("رحلة متجرك معنا: من الإعداد إلى النمو", "Your store's journey with us: from set-up to growth"),
  journeySub: t("لكل خطوة باقة تغطيها، فابدأ من المرحلة التي أنت فيها.", "Each step has a package that covers it, so start from where you are."),
  journeyStep: t("الخطوة", "Step"),
  prev: t("السابق", "Previous"),
  next: t("التالي", "Next"),
  // business solutions
  solutionsTitle: t("حلول *الشركات*", "Business *solutions*"),
  solutionsSub: t("الذكاء الاصطناعي، والأنظمة والتطبيقات، والفريق التقني المخصص. نبدأ بجلسة لفهم المتطلبات، ثم نرسل عرض سعر مكتوباً بنطاق واضح.", "AI, systems and apps, and a dedicated tech team. We start with a session to understand your requirements, then send a written quote with a clear scope."),
  // package / offer page
  forWho: t("لمن هذا العرض؟", "Who is it for?"),
  deliverables: t("ما يشمله العرض", "What the offer includes"),
  terms: t("الشروط", "Conditions"),
  excludes: t("لا يشمله العرض", "Not included"),
  formTitle: t("أرسل طلبك", "Send your request"),
  formSub: t("اترك بياناتك ويتواصل معك فريقنا خلال يوم عمل.", "Leave your details and our team will contact you within one business day."),
  chosen: t("الطلب", "Your request"),
  share: t("مشاركة الرابط", "Share the link"),
  copy: t("نسخ الرابط", "Copy link"),
  copied: t("تم النسخ ✓", "Copied ✓"),
  shareWa: t("إرسال عبر واتساب", "Send on WhatsApp"),
  orderNow: t("اطلب الآن", "Order now"),
  orderWa: t("اطلب عبر واتساب", "Order on WhatsApp"),
  waHello: t("مرحباً DMS Tech، أرغب في طلب:", "Hello DMS Tech, I would like to order:"),
  waPrice: t("السعر", "Price"),
  compareTitle: t("قارن *الباقات*", "Compare *packages*"),
  compareSub: t("اختر ما يناسب مرحلة نشاطك، ويمكنك الترقية لاحقاً.", "Choose what fits your stage; you can upgrade later."),
  current: t("الباقة الحالية", "This package"),
  view: t("التفاصيل", "Details"),
  allOffers: t("كل الباقات والعروض", "All packages & offers"),
  consult: t("اطلب استشارة", "Book a consultation"),
  customCta: t("اطلب عرض سعر مخصص", "Request a custom quote"),
  howTitle: t("كيف *نبدأ*؟", "How do we *start*?"),
  how: [
    { icon: "Send", title: t("أرسل طلبك", "Send your request"), text: t("عبر النموذج أو واتساب، ويصلنا اسم الباقة وسعرها المرجعي.", "Through the form or WhatsApp; we receive the package and its reference price.") },
    { icon: "PhoneCall", title: t("نتواصل معك", "We contact you"), text: t("خلال يوم عمل لفهم نشاطك وتأكيد التفاصيل.", "Within one business day to understand your business and confirm the details.") },
    { icon: "ClipboardList", title: t("عرض السعر والفاتورة", "Quote and invoice"), text: t("نرسل عرضاً مكتوباً بالنطاق والسعر، ثم فاتورة ضريبية للدفعة الأولى.", "We send a written quote with the scope and price, then a tax invoice for the first payment.") },
    { icon: "Rocket", title: t("نبدأ التنفيذ", "We start"), text: t("مدير مشروع يتابع معك حتى التسليم في الموعد المكتوب.", "A project manager follows up with you until delivery on the written date.") }
  ],
  // private deals (/offers/deal/[token])
  dealFor: t("عرض خاص مقدَّم إلى", "A special offer for"),
  dealItems: t("ما يشمله العرض", "What's included"),
  dealTotal: t("الإجمالي", "Total"),
  dealOnRequest: t("يُحدَّد السعر بعد مناقشة التفاصيل معكم", "Pricing follows a short discussion with you"),
  dealValid: t("صالح حتى", "Valid until"),
  preview: t("مثال للتصميم — يظهر على جهازك فقط", "Design example — visible on your machine only"),
  // rest of the page
  projectsTitle: t("من *أعمالنا*", "From *our work*"),
  projectsSub: t("مشاريع نفّذناها لعملائنا.", "Projects we delivered for our clients."),
  allProjects: t("كل الأعمال", "All our work"),
  whyTitle: t("لماذا *DMS Tech*؟", "Why *DMS Tech*?"),
  whySub: t("كل باقة مكتوبة بالتفصيل قبل أن تدفع.", "Every package is written out in detail before you pay."),
  why: [
    { icon: "Tag", title: t("سعر واضح من البداية", "A clear price from the start"), text: t("تعرف ما تشمله الباقة وما لا تشمله قبل الطلب.", "You know what's included and what isn't before you order.") },
    { icon: "ShieldCheck", title: t("ملكية كاملة", "Full ownership"), text: t("الموقع والمتجر والحسابات باسمك، ونسلّمك كل شيء موثّقاً.", "The site, store and accounts are in your name, handed over with documentation.") },
    { icon: "CalendarClock", title: t("مدة تنفيذ مكتوبة", "A written delivery time"), text: t("لكل باقة مدة محددة، ومدير مشروع يتابع معك حتى التسليم.", "Every package has a set time, and a project manager until delivery.") },
    { icon: "ClipboardList", title: t("فاتورة ضريبية", "Tax invoice"), text: t("فواتير متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك.", "Invoices that meet ZATCA requirements.") },
    { icon: "LifeBuoy", title: t("دعم بعد التسليم", "Support after delivery"), text: t("فترة دعم مكتوبة في كل باقة، ويمكنك الاستمرار معنا بعدها.", "A written support period in every package, and you can continue with us afterwards.") },
    { icon: "MessagesSquare", title: t("فريق يعرف السوق السعودي", "A team that knows the Saudi market"), text: t("نتواصل معك بالعربية عبر واتساب والبريد والاجتماعات.", "We work with you in Arabic over WhatsApp, e-mail and meetings.") }
  ],
  faqTitle: t("الأسئلة *الشائعة*", "Frequently asked *questions*"),
  faqs: [
    { q: t("هل الأسعار شاملة ضريبة القيمة المضافة؟", "Do prices include VAT?"), a: t("لا. الأسعار المعلنة قبل ضريبة القيمة المضافة 15%، ويظهر السعر شاملاً الضريبة أسفل كل سعر.", "No. Published prices are before 15% VAT, and the VAT-inclusive price is shown under each price.") },
    { q: t("ما الفرق بين «يبدأ من» والسعر الثابت؟", "What is the difference between \"From\" and a fixed price?"), a: t("السعر الثابت يشمل النطاق المكتوب كاملاً. أما «يبدأ من» فهو سعر النطاق الأساسي فقط، ونرسل لك عرض سعر مكتوباً بعد فهم متطلباتك وقبل أي التزام.", "A fixed price covers the whole written scope. \"From\" is the price of the base scope only; we send a written quote after understanding your requirements and before any commitment.") },
    { q: t("هل اشتراك زد أو سلة مشمول في باقات المتاجر؟", "Is the Zid or Salla subscription included?"), a: t("لا. يُدفع اشتراك المنصة لها مباشرة وباسمك ليبقى المتجر ملكك، ونساعدك في اختيار الخطة المناسبة لحجم مبيعاتك.", "No. You pay the platform directly, in your name, so the store stays yours; we help you choose the right plan.") },
    { q: t("هل الميزانية الإعلانية ضمن باقات الحملات؟", "Is ad spend part of the campaign plans?"), a: t("لا. تُدفع الميزانية للمنصات الإعلانية من حسابك مباشرة، ونحن نُدير الحملات ونحسّنها. ولكل باقة حد إنفاق تغطيه أتعابها.", "No. You pay the ad platforms directly; we run and optimise the campaigns. Each plan states the spend its fee covers.") },
    { q: t("كيف يتم الدفع؟", "How do I pay?"), a: t("المشاريع على دفعتين عادةً: 50% عند البدء و50% عند التسليم، والاشتراكات تُدفع شهرياً أو مقدماً حسب الباقة، مع فاتورة ضريبية لكل دفعة.", "Projects are usually paid in two parts — 50% to start and 50% on delivery — and subscriptions monthly or upfront depending on the plan, with a tax invoice for every payment.") },
    { q: t("كيف أحصل على سعر العرض؟", "How do I get an offer price?"), a: t("لكل عرض تاريخ نهاية مكتوب على صفحته. أرسل الطلب قبل انتهائه ويُثبَّت لك السعر حتى لو بدأ التنفيذ بعد ذلك.", "Every offer shows its end date. Send your request before it and the price holds even if work starts later.") },
    { q: t("هل يمكن تعديل الباقة لتناسبني؟", "Can a package be tailored to me?"), a: t("نعم. اطلب عرض سعر مخصصاً ونبني لك نطاقاً يناسب احتياجك وميزانيتك.", "Yes. Request a custom quote and we'll build a scope around your needs and budget.") },
    { q: t("ماذا يحدث بعد انتهاء فترة الدعم؟", "What happens after the support period?"), a: t("يمكنك الاستمرار معنا باشتراك صيانة أو تسويق أو فريق تقني، أو إدارة كل شيء بنفسك، فكل شيء باسمك.", "You can continue with a maintenance, marketing or tech team plan, or run everything yourself — it's all in your name.") }
  ],
  termsTitle: t("الشروط العامة", "General terms"),
  generalTerms: [
    t("جميع الأسعار بالريال السعودي وقبل ضريبة القيمة المضافة 15%، وتصدر فاتورة ضريبية لكل دفعة.", "All prices are in Saudi riyals before 15% VAT, and every payment gets a tax invoice."),
    t("يُكتب نطاق كل باقة في عرض السعر، وأي عمل خارجه يُسعَّر ويُعتمد كتابياً قبل تنفيذه.", "Each package's scope is written in the quote; any work outside it is priced and approved in writing before it is done."),
    t("عدد جولات التعديل مذكور في كل باقة، والتعديلات الإضافية تُسعَّر منفصلة.", "Each package states its revision rounds; extra revisions are priced separately."),
    t("تبدأ مدة التنفيذ بعد استلام الدفعة الأولى والمحتوى والصلاحيات واعتماد النطاق، والعميل مسؤول عن توفيرها في وقتها.", "Delivery time starts after the first payment, content, access and scope approval are received; providing them on time is the client's responsibility."),
    t("رسوم المنصات والاستضافة والنطاقات والإعلانات ورسائل ميتا واستخدام الذكاء الاصطناعي تُدفع باسم العميل وعلى حسابه.", "Platform, hosting, domain, advertising, Meta message and AI usage fees are paid by the client, in the client's name."),
    t("الدعم الفني محدود بالمدة المذكورة في الباقة وبأيام وساعات العمل، ويشمل إصلاح الأعطال دون تطوير مزايا جديدة.", "Support is limited to each package's stated period and to business days and hours; it covers fixing faults, not building new features."),
    t("يُسلَّم العمل لمراجعتك، وإذا لم تصلنا ملاحظات خلال 7 أيام عمل من التسليم يُعدّ مقبولاً.", "Work is delivered for your review; if we receive no comments within 7 business days of delivery, it is considered accepted."),
    t("تتجدد الاشتراكات الشهرية تلقائياً حتى إلغائها بإشعار قبل 30 يوماً، وتنتهي العقود محددة المدة بانتهاء مدتها ما لم تُجدَّد كتابياً.", "Monthly subscriptions renew each month until cancelled with 30 days' notice; fixed-term contracts end with their term unless renewed in writing."),
    t("تنتقل إليك ملكية الأعمال المسلَّمة بعد سداد المستحقات كاملة، وتبقى المكونات والقوالب والإضافات الخارجية خاضعة لتراخيص أصحابها.", "Ownership of the delivered work passes to you once paid in full; third-party components, themes and plug-ins remain under their owners' licences."),
    t("لا نضمن عدداً محدداً من المبيعات أو العملاء أو المتابعين أو عائداً إعلانياً أو ترتيباً في محركات البحث، ونلتزم بجودة التنفيذ والقياس الشفاف.", "We don't guarantee a number of sales, leads or followers, a return on ad spend or a search ranking; we commit to quality work and transparent measurement.")
  ],
  vatNote: t("الأسعار بالريال السعودي قبل ضريبة القيمة المضافة 15%، ولا تشمل رسوم المنصات والإعلانات والاستضافة واستخدام الذكاء الاصطناعي ما لم تنص الباقة على ذلك.", "Prices are in Saudi riyals before 15% VAT and exclude platform, advertising, hosting and AI usage fees unless the package states them."),
  ctaTitle: t("لم تجد الباقة المناسبة؟", "Didn't find the right package?"),
  ctaText: t("تواصل معنا عبر واتساب أو اطلب عرض سعر مخصص، ونرد عليك خلال ساعات العمل.", "Message us on WhatsApp or request a custom quote; we reply within working hours.")
};

/** Everything the dashboard edits: sections with their packages, the limited-time offers and the page texts. */
export type OffersCopy = typeof offersCopy;
export type Catalog = { groups: PackageGroup[]; offers: Offer[]; copy: OffersCopy };
/** The built-in catalog (this file). */
export const fileCatalog: Catalog = { groups: packageGroups, offers, copy: offersCopy };
