import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";

/**
 * Packages, limited-time offers and private deals (/offers, /offers/[slug], /offers/deal/[token]).
 *
 * PRICES (SAR, before VAT): revised with the owner on 2026-10-14 — competitive agency prices ending in 99; longer terms
 * get a clear discount (team 8% / 17%). Every tier states who it suits, exact quantities and what is NOT included
 * (store packages never include the Zid / Salla / Shopify subscription). `price: null` shows "priced to your needs". Never change a price without the
 * company's approval.
 * OFFERS renew by themselves (weekly, or one daily deal per day) — see the block above `offers`. PRIVATE DEALS run
 * until expiresAt; entries with `preview: true` are design examples rendered in development only.
 * Every package, offer and deal has a stable `key`; the website form sends it and the server resolves it here (see
 * offerLabel), so the CRM lead and the e-mail show exactly what the client asked for.
 */

export type Tier = {
  key: string;
  icon: IconName;
  name: L;
  tagline: L;
  /** who the package suits */
  idealFor: L;
  price: number | null;
  /** true = "from" price (scope-dependent); false = a fixed price */
  from: boolean;
  period: L | null;
  delivery: L;
  featured?: boolean;
  features: L[];
  /** stated plainly so nobody is surprised later */
  excludes: L[];
};
/** One step of a client journey shown under a group's tiers; `tier` is the package that covers it. */
export type JourneyStep = { icon: IconName; title: L; text: L; tier: string };
/** `notice`: one sentence shown above the tiers (e.g. the store platform subscription is not included). */
/** `short`: the tab / hero tile name · `highlights`: three things the service delivers, shown beside its visual. */
export type PackageGroup = { service: string; icon: IconName; title: L; short: L; text: L; highlights: L[]; notice: L; tiers: Tier[]; journey?: JourneyStep[] };
export type Offer = {
  slug: string;
  /** weekly: Sunday → Saturday, renews every week · daily: one deal per Riyadh day (24 hours) */
  cycle: "weekly" | "daily";
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
  oldPrice: number;
};
export type Deal = { token: string; client: L; title: L; text: L; items: { label: L; price: number | null }[]; total: number | null; expiresAt: string; preview?: boolean };

const perMonth: L = { ar: "شهرياً", en: "per month" };
const oneTime: L = { ar: "دفعة واحدة", en: "one-time" };

export const packageGroups: PackageGroup[] = [
  {
    service: "web-development",
    icon: "CodeXml",
    title: { ar: "باقات المواقع والتطبيقات", en: "Website & app packages" },
    short: { ar: "مواقع وتطبيقات", en: "Websites & apps" },
    text: { ar: "من موقع تعريفي أنيق إلى نظام أو تطبيق متكامل.", en: "From an elegant company site to a complete system or app." },
    highlights: [{ ar: "تصميم مخصص بهويتك يعمل على الجوال", en: "A custom design in your brand that works on mobile" }, { ar: "سرعة وتهيئة لمحركات البحث من اليوم الأول", en: "Speed and SEO from day one" }, { ar: "ملكية كاملة للموقع والكود", en: "Full ownership of the site and code" }],
    notice: { ar: "الأسعار تشمل التصميم والبرمجة والإطلاق. المحتوى (النصوص والصور) يقدمه العميل، ونساعدك في صياغته عند الحاجة.", en: "Prices cover design, development and launch. Content (text and images) comes from the client; we can help write it." },
    tiers: [
      {
        key: "web-starter",
        icon: "Monitor",
        name: { ar: "الأساسية", en: "Starter" },
        tagline: { ar: "حضور رقمي احترافي لشركتك", en: "A professional online presence" },
        idealFor: { ar: "المكاتب والعيادات والمقاولين والشركات الصغيرة", en: "Offices, clinics, contractors and small businesses" },
        price: 2499,
        from: false,
        period: oneTime,
        delivery: { ar: "7 أيام عمل", en: "7 business days" },
        features: [
          { ar: "5 صفحات: الرئيسية، من نحن، الخدمات، أعمالنا، تواصل معنا", en: "5 pages: home, about, services, our work, contact" },
          { ar: "لغة واحدة (العربية أو الإنجليزية)", en: "One language (Arabic or English)" },
          { ar: "تصميم متجاوب مع الجوال والأجهزة اللوحية", en: "Responsive on phones and tablets" },
          { ar: "نموذج تواصل يصل لبريدك وزر واتساب ثابت", en: "Contact form to your inbox and a fixed WhatsApp button" },
          { ar: "شهادة أمان وتهيئة أساسية لمحركات البحث", en: "SSL and basic search engine set-up" },
          { ar: "جولة تعديل واحدة على التصميم", en: "One round of design revisions" },
          { ar: "دعم فني لمدة شهر بعد الإطلاق", en: "One month of support after launch" }
        ],
        excludes: [
          { ar: "الاستضافة والنطاق (باسمك وعلى حسابك)", en: "Hosting and domain (in your name)" },
          { ar: "لوحة تحكم لتعديل المحتوى", en: "A content management panel" }
        ]
      },
      {
        key: "web-growth",
        icon: "Rocket",
        name: { ar: "الاحترافية", en: "Professional" },
        tagline: { ar: "موقع يجلب العملاء وتديره بنفسك", en: "A site that brings clients and you run yourself" },
        idealFor: { ar: "الشركات التي تعتمد على موقعها في جلب العملاء والحملات", en: "Companies that rely on their site for leads and campaigns" },
        price: 5999,
        from: false,
        period: oneTime,
        delivery: { ar: "21 يوم عمل", en: "21 business days" },
        featured: true,
        features: [
          { ar: "حتى 15 صفحة بالعربية والإنجليزية", en: "Up to 15 pages in Arabic and English" },
          { ar: "تصميم مخصص بهوية شركتك (ليس قالباً جاهزاً)", en: "A custom design in your brand (not a ready template)" },
          { ar: "لوحة تحكم لتعديل النصوص والصور والأخبار", en: "A panel to edit text, images and news" },
          { ar: "مدونة وثلاث صفحات هبوط للحملات الإعلانية", en: "A blog and 3 landing pages for ad campaigns" },
          { ar: "تحسين السرعة وتهيئة متقدمة لمحركات البحث", en: "Speed optimisation and advanced SEO set-up" },
          { ar: "ربط بكسل الإعلانات وتحليلات جوجل", en: "Google Analytics and ad pixels connected" },
          { ar: "استضافة سحابية ونطاق دوت كوم للسنة الأولى", en: "Cloud hosting and a .com domain for the first year" },
          { ar: "جولتان من التعديلات ودعم فني لمدة 3 أشهر", en: "Two revision rounds and 3 months of support" }
        ],
        excludes: [
          { ar: "تجديد الاستضافة والنطاق بعد السنة الأولى", en: "Hosting and domain renewal after year one" },
          { ar: "كتابة المحتوى والتصوير", en: "Copywriting and photography" }
        ]
      },
      {
        key: "web-pro",
        icon: "Layers",
        name: { ar: "المتقدمة", en: "Advanced" },
        tagline: { ar: "نظام أو تطبيق مصمم على مقاس عملك", en: "A system or app built around your business" },
        idealFor: { ar: "الشركات التي تحتاج بوابة عملاء أو نظاماً داخلياً أو تطبيق جوال", en: "Companies that need a client portal, an internal system or a mobile app" },
        price: 14999,
        from: true,
        period: oneTime,
        delivery: { ar: "من 6 أسابيع حسب نطاق المشروع", en: "From 6 weeks, depending on scope" },
        features: [
          { ar: "ورشة تحليل متطلبات ووثيقة نطاق مكتوبة قبل البدء", en: "A requirements workshop and a written scope before we start" },
          { ar: "تطبيق ويب أو نظام إدارة بصلاحيات لكل دور", en: "A web app or management system with role permissions" },
          { ar: "تطبيق جوال للآيفون والأندرويد عند الحاجة (يُسعَّر حسب متطلباته)", en: "iOS and Android app when needed (priced to its requirements)" },
          { ar: "ربط مع أنظمتك: المحاسبة وإدارة العملاء وبوابات الدفع", en: "Integrations with your systems (accounting, CRM, payments) via API" },
          { ar: "لوحات تقارير ومؤشرات للإدارة", en: "Reports and KPI dashboards for management" },
          { ar: "ملكية كاملة للكود وتسليم موثق", en: "Full code ownership and documented hand-over" },
          { ar: "دعم وصيانة لمدة 6 أشهر", en: "6 months of support and maintenance" }
        ],
        excludes: [
          { ar: "رسوم الخوادم ونشر التطبيق على متجري آبل وجوجل", en: "Server costs and app store fees (Apple / Google)" },
          { ar: "تراخيص الأنظمة والخدمات الخارجية", en: "Third-party licences and services" }
        ]
      }
    ]
  },
  {
    service: "ai-automation",
    icon: "Bot",
    title: { ar: "باقات الذكاء الاصطناعي والأتمتة", en: "AI & automation packages" },
    short: { ar: "ذكاء اصطناعي وأتمتة", en: "AI & automation" },
    text: { ar: "اجعل الأعمال المتكررة تعمل وحدها، ومساعداً ذكياً يرد على عملائك ويخدم فريقك على مدار الساعة.", en: "Let repetitive work run by itself, and an AI assistant answer your clients and serve your team around the clock." },
    highlights: [
      { ar: "أتمتة العمليات بين أدواتك وأنظمتك", en: "Process automation across your tools and systems" },
      { ar: "مساعد ذكاء اصطناعي يفهم اللهجة السعودية", en: "An AI assistant that understands Saudi Arabic" },
      { ar: "بياناتك محمية ومملوكة لك بالكامل", en: "Your data protected and fully yours" }
    ],
    notice: { ar: "رسوم استخدام نماذج الذكاء الاصطناعي واشتراكات الأدوات الخارجية تُدفع حسب الاستخدام الفعلي وباسمك — نقدّرها لك مسبقاً قبل البدء، وغالباً تبدأ من 100 ريال شهرياً للأنشطة الصغيرة.", en: "AI model usage and third-party tool subscriptions are paid by actual usage, in your name — we estimate them before we start; for small businesses they usually start around SAR 100 a month." },
    tiers: [
      {
        key: "ai-auto-starter",
        icon: "Workflow",
        name: { ar: "أتمتة الأعمال", en: "Business automation" },
        tagline: { ar: "عمليتان تعملان وحدهما بدل فريقك", en: "Two processes that run themselves" },
        idealFor: { ar: "الشركات التي يكرر فريقها نفس الخطوات يدوياً كل يوم", en: "Companies whose team repeats the same manual steps every day" },
        price: 2999,
        from: false,
        period: oneTime,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
        features: [
          { ar: "تحليل عملياتك واختيار الأعلى أثراً", en: "Your processes reviewed and the highest-impact ones chosen" },
          { ar: "أتمتة عمليتين حتى 10 خطوات لكل منهما", en: "Two processes automated, up to 10 steps each" },
          { ar: "ربط حتى 3 أدوات (نماذج، جداول، بريد، واتساب، نظام العملاء)", en: "Up to 3 tools connected (forms, sheets, e-mail, WhatsApp, CRM)" },
          { ar: "ذكاء اصطناعي لقراءة الرسائل وتصنيفها وتلخيصها", en: "AI to read, sort and summarise messages" },
          { ar: "تنبيهات عند أي خطأ وتوثيق لكل عملية", en: "Alerts on any failure and documentation for every process" },
          { ar: "تدريب فريقك ودعم فني لمدة شهر", en: "Team training and one month of support" }
        ],
        excludes: [
          { ar: "اشتراكات الأدوات ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Tool subscriptions and AI usage fees" },
          { ar: "تطوير أنظمة جديدة (في باقات البرمجة)", en: "Building new systems (in the development packages)" }
        ]
      },
      {
        key: "ai-assistant",
        icon: "Bot",
        name: { ar: "مساعد ذكاء اصطناعي", en: "AI assistant" },
        tagline: { ar: "موظف ذكي يرد على عملائك 24 ساعة", en: "A smart agent answering your clients 24/7" },
        idealFor: { ar: "العيادات والمتاجر والعقار والشركات الخدمية كثيرة الاستفسارات", en: "Clinics, stores, real estate and service companies with many enquiries" },
        price: 7999,
        from: false,
        period: oneTime,
        delivery: { ar: "3 أسابيع", en: "3 weeks" },
        featured: true,
        features: [
          { ar: "مساعد مدرَّب على خدماتك وأسعارك وسياساتك من ملفاتك", en: "An assistant trained on your services, prices and policies from your files" },
          { ar: "يرد على واتساب وموقعك بالعربي (واللهجة السعودية) والإنجليزي", en: "Answers on WhatsApp and your website in Arabic (incl. Saudi dialect) and English" },
          { ar: "يحجز المواعيد ويؤهل العملاء ويسجلهم في نظام العملاء", en: "Books appointments, qualifies leads and records them in your CRM" },
          { ar: "يحوّل المحادثة للموظف المناسب عند الحاجة", en: "Hands the chat to the right person when needed" },
          { ar: "لوحة لمراجعة المحادثات وتحسين الردود", en: "A dashboard to review conversations and improve answers" },
          { ar: "ضبط وتحسين مستمر لمدة 3 أشهر", en: "Three months of tuning and improvement" }
        ],
        excludes: [
          { ar: "رسوم استخدام الذكاء الاصطناعي ورسائل ميتا حسب الاستخدام", en: "AI usage and Meta message fees, by usage" },
          { ar: "اشتراك واتساب للأعمال (في باقات حلول واتساب)", en: "The WhatsApp Business subscription (in the WhatsApp packages)" }
        ]
      },
      {
        key: "ai-custom",
        icon: "Sparkles",
        name: { ar: "حلول ذكاء اصطناعي مخصصة", en: "Custom AI solutions" },
        tagline: { ar: "ذكاء اصطناعي داخل أنظمتك وبياناتك", en: "AI inside your systems and data" },
        idealFor: { ar: "الشركات والجهات التي لديها بيانات ومستندات كثيرة وأنظمة قائمة", en: "Companies and entities with lots of data, documents and existing systems" },
        price: 19999,
        from: true,
        period: oneTime,
        delivery: { ar: "من 6 أسابيع حسب النطاق", en: "From 6 weeks, depending on scope" },
        features: [
          { ar: "ورشة لتحديد حالات الاستخدام والعائد المتوقع", en: "A workshop to define use cases and expected return" },
          { ar: "مساعد معرفة داخلي يجيب فريقك من مستندات الشركة", en: "An internal knowledge assistant answering your team from company documents" },
          { ar: "قراءة الفواتير والعقود والمستندات واستخراج بياناتها تلقائياً", en: "Invoices, contracts and documents read and their data extracted automatically" },
          { ar: "ربط مع أنظمتك (ERP، المحاسبة، نظام العملاء)", en: "Integration with your systems (ERP, accounting, CRM)" },
          { ar: "صلاحيات وسجل تدقيق وحماية للبيانات الحساسة", en: "Permissions, audit trail and protection for sensitive data" },
          { ar: "تسليم موثق ودعم وتحسين لمدة 6 أشهر", en: "Documented hand-over and 6 months of support and tuning" }
        ],
        excludes: [
          { ar: "رسوم الخوادم ونماذج الذكاء الاصطناعي حسب الاستخدام", en: "Server and AI model costs, by usage" },
          { ar: "تراخيص الأنظمة الخارجية", en: "Third-party system licences" }
        ]
      }
    ]
  },
  {
    service: "ecommerce",
    icon: "ShoppingCart",
    title: { ar: "باقات المتاجر الإلكترونية", en: "Online store packages" },
    short: { ar: "متاجر إلكترونية", en: "Online stores" },
    text: { ar: "متجر جاهز للبيع والإعلان على زد أو سلة أو شوبيفاي — من التأسيس حتى أول طلب، ثم نكمل معك التسويق شهرياً.", en: "A store ready to sell and advertise on Zid, Salla or Shopify — from founding to the first order, then monthly marketing with you." },
    highlights: [{ ar: "متجر على زد أو سلة أو شوبيفاي جاهز للبيع", en: "A Zid, Salla or Shopify store ready to sell" }, { ar: "مدى وأبل باي وتابي وتمارا والشحن مربوطة", en: "mada, Apple Pay, Tabby, Tamara and shipping connected" }, { ar: "البكسل والكتالوج جاهزان للإعلان", en: "Pixels and catalogue ready for ads" }],
    notice: { ar: "مهم: اشتراك منصة زد أو سلة أو شوبيفاي غير مشمول في الباقات — يُدفع للمنصة مباشرة وباسمك، ليبقى المتجر ملكك بالكامل. وكذلك ميزانية الإعلانات تُدفع لمنصات الإعلان من حسابك. نساعدك في اختيار باقة المنصة المناسبة لحجم مبيعاتك.", en: "Important: the Zid, Salla or Shopify subscription is not included — you pay the platform directly, in your name, so the store stays fully yours. Ad budgets are likewise paid to the ad platforms from your account. We help you choose the right platform plan." },
    tiers: [
      {
        key: "store-launch",
        icon: "ShoppingBag",
        name: { ar: "الانطلاق", en: "Launch" },
        tagline: { ar: "متجر جاهز للبيع والإعلان بسرعة", en: "A store ready to sell and advertise, fast" },
        idealFor: { ar: "من يبيع على إنستغرام أو واتساب ويريد متجراً حقيقياً", en: "Sellers on Instagram or WhatsApp who want a real store" },
        price: 1999,
        from: false,
        period: oneTime,
        delivery: { ar: "5 أيام عمل", en: "5 business days" },
        features: [
          { ar: "إعداد المتجر على زد أو سلة بقالب المنصة وتخصيصه بشعارك وألوانك", en: "Store set up on Zid or Salla with a platform theme styled in your logo and colours" },
          { ar: "رفع حتى 30 منتجاً بالصور والوصف والأسعار", en: "Up to 30 products with photos, descriptions and prices" },
          { ar: "ربط مدى وأبل باي والبطاقات وشركات الشحن", en: "mada, Apple Pay, cards and shipping companies connected" },
          { ar: "صفحات السياسات: الاسترجاع والشحن والخصوصية", en: "Policy pages: returns, shipping and privacy" },
          { ar: "تركيب بكسل سناب وتيك توك وميتا وتحليلات جوجل", en: "Snap, TikTok and Meta pixels plus Google Analytics installed" },
          { ar: "إنشاء حسابات المتجر على إنستغرام وتيك توك وسناب وربطها بالمتجر", en: "Store accounts on Instagram, TikTok and Snap created and linked to the store" },
          { ar: "دعم فني أسبوعين بعد الإطلاق", en: "Two weeks of support after launch" }
        ],
        excludes: [
          { ar: "اشتراك المنصة ورسوم بوابات الدفع والشحن", en: "Platform subscription, payment and shipping fees" },
          { ar: "التصميم المخصص وتصوير المنتجات", en: "Custom design and product photography" },
          { ar: "إدارة الحملات وميزانية الإعلانات", en: "Campaign management and ad budget" }
        ]
      },
      {
        key: "store-growth",
        icon: "TrendingUp",
        name: { ar: "النمو", en: "Growth" },
        tagline: { ar: "متجر بهويتك وجاهز لحملة الإطلاق", en: "A store in your brand, ready for its launch campaign" },
        idealFor: { ar: "العلامات التي تريد متجراً مميزاً وتعلن على السوشيال ميديا", en: "Brands that want a distinctive store and advertise on social media" },
        price: 4499,
        from: false,
        period: oneTime,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
        featured: true,
        features: [
          { ar: "تصميم مخصص للصفحة الرئيسية وصفحة المنتج بهويتك", en: "Custom home and product page design in your brand" },
          { ar: "رفع حتى 100 منتج بالخيارات (المقاس، اللون…) والتصنيفات", en: "Up to 100 products with options (size, colour…) and categories" },
          { ar: "ربط الدفع والشحن والدفع عند الاستلام", en: "Payments, shipping and cash on delivery connected" },
          { ar: "بكسل سناب وتيك توك وميتا مع تتبع الإضافة للسلة والشراء، وتحليلات جوجل", en: "Snap, TikTok and Meta pixels tracking add-to-cart and purchases, plus Google Analytics" },
          { ar: "ربط كتالوج المنتجات بإنستغرام وفيسبوك شوب وتيك توك وسناب", en: "Product catalogue synced to Instagram & Facebook Shop, TikTok and Snap" },
          { ar: "تجهيز الحسابات الإعلانية وإطلاق حملة الافتتاح على منصة واحدة", en: "Ad accounts set up and the opening campaign launched on one platform" },
          { ar: "10 تصاميم سوشيال للإطلاق وكوبونات الخصم الأولى", en: "10 social launch designs and the first discount coupons" },
          { ar: "إشعار الطلبات على واتساب + تدريب فريقك ودعم فني شهر", en: "WhatsApp order alerts + team training and one month of support" }
        ],
        excludes: [
          { ar: "اشتراك المنصة ورسوم بوابات الدفع والشحن", en: "Platform subscription, payment and shipping fees" },
          { ar: "ميزانية الإعلانات (تُدفع للمنصة من حسابك)", en: "Ad budget (paid to the platform from your account)" },
          { ar: "إدارة الحملات بعد الإطلاق (في باقات التسويق الشهرية)", en: "Campaign management after launch (in the monthly marketing plans)" }
        ]
      },
      {
        key: "store-scale",
        icon: "Building2",
        name: { ar: "التوسع", en: "Scale" },
        tagline: { ar: "متجر كبير بخطة إطلاق تسويقية كاملة", en: "A large store with a full launch marketing plan" },
        idealFor: { ar: "المتاجر ذات المبيعات العالية أو الفروع أو التي تبيع خارج المملكة", en: "High-volume stores, multi-branch businesses or cross-border sellers" },
        price: 9999,
        from: true,
        period: oneTime,
        delivery: { ar: "من 4 أسابيع", en: "From 4 weeks" },
        features: [
          { ar: "متجر بتصميم كامل مخصص أو على شوبيفاي", en: "A fully custom store or a Shopify store" },
          { ar: "ربط مع أنظمة المخزون والمحاسبة والفوترة الإلكترونية", en: "Inventory, accounting and e-invoicing integration" },
          { ar: "بكسل كل المنصات مع تتبع دقيق من الخادم، وربط منتجاتك بتسوق جوجل", en: "Pixels on every platform with server-side tracking (Conversions API) and Google Merchant Center for Shopping" },
          { ar: "خطة تسويق إطلاق 90 يوماً وإدارة الحملات أول شهر على كل المنصات", en: "A 90-day launch marketing plan and first-month campaign management on every platform" },
          { ar: "استرداد السلات المتروكة برسائل واتساب تلقائية", en: "Automatic WhatsApp abandoned-cart recovery" },
          { ar: "متعدد اللغات والعملات عند البيع خارج المملكة", en: "Multi-language and multi-currency for selling abroad" },
          { ar: "تقارير مبيعات شهرية ودعم بأولوية لمدة 3 أشهر", en: "Monthly sales reports and 3 months of priority support" }
        ],
        excludes: [
          { ar: "اشتراك المنصة وتطبيقاتها المدفوعة", en: "Platform subscription and paid apps" },
          { ar: "رسوم بوابات الدفع والشحن وميزانية الإعلانات", en: "Payment and shipping fees and ad budget" }
        ]
      }
    ],
    journey: [
      { icon: "Lightbulb", title: { ar: "التأسيس", en: "Founding" }, text: { ar: "نختار معك المنصة المناسبة ونجهز الشعار والألوان وصفحات السياسات.", en: "We choose the right platform with you and prepare your logo, colours and policy pages." }, tier: "store-launch" },
      { icon: "ShoppingBag", title: { ar: "بناء المتجر", en: "Building the store" }, text: { ar: "تصميم المتجر ورفع المنتجات وربط الدفع والشحن.", en: "Store design, products uploaded, payments and shipping connected." }, tier: "store-growth" },
      { icon: "Target", title: { ar: "التجهيز للإعلان", en: "Ready to advertise" }, text: { ar: "البكسل والتحليلات وكتالوج المنتجات والحسابات الإعلانية — كل طلب يُقاس.", en: "Pixels, analytics, the product catalogue and ad accounts — every order is measured." }, tier: "store-growth" },
      { icon: "Rocket", title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "تصاميم الافتتاح وكوبونات الخصم وأول حملة إعلانية.", en: "Opening designs, discount coupons and the first ad campaign." }, tier: "store-growth" },
      { icon: "MessagesSquare", title: { ar: "أول الطلبات", en: "First orders" }, text: { ar: "واتساب يرد على العملاء ويبلغك بكل طلب ويسترجع السلات المتروكة.", en: "WhatsApp answers clients, alerts you to every order and recovers abandoned carts." }, tier: "wa-pro" },
      { icon: "TrendingUp", title: { ar: "النمو المستمر", en: "Ongoing growth" }, text: { ar: "إدارة الحملات والسوشيال ميديا شهرياً بتقارير تقيس الطلبات والعائد.", en: "Monthly campaign and social media management with reports on orders and return." }, tier: "mkt-growth" }
    ]
  },
  {
    service: "digital-marketing",
    icon: "Megaphone",
    title: { ar: "باقات تسويق المتاجر الشهرية", en: "Monthly store marketing plans" },
    short: { ar: "تسويق المتاجر", en: "Store marketing" },
    text: { ar: "بعد الإطلاق نكمل معك: حملات إعلانية وسوشيال ميديا ونتائج تُقاس بالطلبات، لا بالإعجابات.", en: "After launch we keep going with you: ad campaigns and social media, measured in orders — not likes." },
    highlights: [{ ar: "حملات على سناب وتيك توك وميتا وجوجل", en: "Campaigns on Snap, TikTok, Meta and Google" }, { ar: "محتوى وتصاميم وفيديوهات شهرية", en: "Monthly content, designs and videos" }, { ar: "تقارير بالطلبات وتكلفة الطلب، لا بالإعجابات", en: "Reports on orders and cost per order — not likes" }],
    notice: { ar: "ميزانية الإعلانات غير مشمولة — تُدفع مباشرة لمنصات الإعلان من حسابك وباسمك ونحن ندير الحملات (نوصي بـ 1,500 ريال شهرياً على الأقل). نوصي بـ 3 أشهر لتظهر النتائج، والإلغاء بإشعار قبل 30 يوماً.", en: "Ad budget is not included — you pay the ad platforms directly from your own account and we run the campaigns (we recommend at least SAR 1,500 a month). We recommend 3 months for results; cancel with 30 days' notice." },
    tiers: [
      {
        key: "mkt-start",
        icon: "Megaphone",
        name: { ar: "البداية", en: "Starter" },
        tagline: { ar: "حضور منتظم وحملة على منصة واحدة", en: "A steady presence and campaigns on one platform" },
        idealFor: { ar: "المتاجر الجديدة في أشهرها الأولى", en: "New stores in their first months" },
        price: 1499,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        features: [
          { ar: "إدارة حسابين (مثل إنستغرام وتيك توك)", en: "Two accounts managed (e.g. Instagram and TikTok)" },
          { ar: "12 منشوراً شهرياً بالتصميم والنص", en: "12 posts a month, designed and written" },
          { ar: "إدارة الحملات الإعلانية على منصة واحدة (سناب أو تيك توك أو ميتا)", en: "Ad campaigns on one platform (Snap, TikTok or Meta)" },
          { ar: "4 تصاميم إعلانية شهرياً وتحسين أسبوعي للحملة", en: "4 ad designs a month and weekly optimisation" },
          { ar: "فحص البكسل والتتبع شهرياً", en: "Monthly pixel and tracking check" },
          { ar: "تقرير شهري بالطلبات وتكلفة الطلب الواحد", en: "A monthly report on orders and cost per order" }
        ],
        excludes: [
          { ar: "ميزانية الإعلانات", en: "Ad budget" },
          { ar: "تصوير الفيديو والمنتجات", en: "Video and product shoots" }
        ]
      },
      {
        key: "mkt-growth",
        icon: "ChartLine",
        name: { ar: "نمو المبيعات", en: "Sales growth" },
        tagline: { ar: "حملات على كل المنصات المهمة ومحتوى فيديو", en: "Campaigns on every key platform, plus video content" },
        idealFor: { ar: "المتاجر التي بدأت تبيع وتريد مضاعفة الطلبات", en: "Stores already selling that want to multiply orders" },
        price: 2999,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        featured: true,
        features: [
          { ar: "إدارة 3 حسابات: 20 منشوراً و4 فيديوهات قصيرة (ريلز) شهرياً", en: "3 accounts: 20 posts and 4 short videos (reels) a month" },
          { ar: "حملات على سناب وتيك توك وميتا معاً", en: "Campaigns on Snap, TikTok and Meta together" },
          { ar: "إعادة استهداف زوار المتجر ومن ترك السلة", en: "Retargeting store visitors and abandoned carts" },
          { ar: "8 تصاميم إعلانية شهرياً واختبار أكثر من إعلان لكل حملة", en: "8 ad designs a month, A/B testing several ads per campaign" },
          { ar: "الرد على التعليقات والرسائل في أوقات العمل", en: "Replies to comments and messages during working hours" },
          { ar: "حملات المواسم: رمضان واليوم الوطني والجمعة البيضاء", en: "Seasonal campaigns: Ramadan, National Day, White Friday" },
          { ar: "تقرير كل أسبوعين واجتماع شهري", en: "A report every two weeks and a monthly meeting" }
        ],
        excludes: [
          { ar: "ميزانية الإعلانات", en: "Ad budget" },
          { ar: "جلسات التصوير الاحترافي (الفيديو من تصويرك ونحن نحرره)", en: "Professional shoots (you film, we edit)" }
        ]
      },
      {
        key: "mkt-pro",
        icon: "Sparkles",
        name: { ar: "الإدارة الكاملة", en: "Full management" },
        tagline: { ar: "فريق تسويق كامل لمتجرك", en: "A complete marketing team for your store" },
        idealFor: { ar: "المتاجر ذات المبيعات العالية والعلامات المتوسعة", en: "High-volume stores and growing brands" },
        price: 5499,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "كل مميزات نمو المبيعات", en: "Everything in Sales growth" },
          { ar: "30 منشوراً و8 فيديوهات شهرياً بسيناريو مكتوب", en: "30 posts and 8 scripted videos a month" },
          { ar: "إعلانات جوجل في البحث والتسوق", en: "Google Search and Shopping ads" },
          { ar: "جلسة تصوير منتجات شهرية حتى 20 منتجاً", en: "A monthly product shoot of up to 20 products" },
          { ar: "تنسيق حملات المؤثرين وحملات واتساب للعملاء السابقين", en: "Influencer campaigns and WhatsApp campaigns to past customers" },
          { ar: "توصيات شهرية لتحسين المتجر ورفع نسبة الشراء", en: "Monthly store improvements to raise conversion" },
          { ar: "مدير حساب مخصص وتقرير أسبوعي", en: "A dedicated account manager and a weekly report" }
        ],
        excludes: [
          { ar: "ميزانية الإعلانات", en: "Ad budget" },
          { ar: "أجور المؤثرين", en: "Influencer fees" }
        ]
      }
    ]
  },
  {
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    title: { ar: "باقات حلول واتساب", en: "WhatsApp solution packages" },
    short: { ar: "حلول واتساب", en: "WhatsApp" },
    text: { ar: "رد أسرع ومبيعات أكثر على القناة التي يفضلها عملاؤك.", en: "Faster replies and more sales on your clients' favourite channel." },
    highlights: [{ ar: "رقمك الرسمي باسم نشاطك", en: "Your official number under your business name" }, { ar: "بوت يرد ويحجز ويؤهل العملاء 24 ساعة", en: "A bot that answers, books and qualifies 24/7" }, { ar: "صندوق محادثات واحد لكل فريقك", en: "One inbox for your whole team" }],
    notice: { ar: "اشتراك شهري بلا عقد طويل، والإعداد مجاني. رسوم الرسائل التي تتقاضاها ميتا تُحتسب حسب استخدامك الفعلي، والرد على العميل خلال 24 ساعة من رسالته مجاني ضمن الحدود التي تحددها ميتا.", en: "A monthly subscription with no long contract, and free set-up. Meta's own message fees follow your actual usage; replying within 24 hours of a client's message is free within Meta's limits." },
    tiers: [
      {
        key: "wa-basic",
        icon: "MessageSquareMore",
        name: { ar: "الأساسية", en: "Basic" },
        tagline: { ar: "لا تفوّت أي رسالة", en: "Never miss a message" },
        idealFor: { ar: "الأنشطة الصغيرة التي تنظم رسائل واتساب لأول مرة", en: "Small businesses organising WhatsApp for the first time" },
        price: 199,
        from: false,
        period: perMonth,
        delivery: { ar: "يومان عمل", en: "2 business days" },
        features: [
          { ar: "ربط رقمك بمنصة واتساب للأعمال الرسمية", en: "Your number on the official WhatsApp Business Platform" },
          { ar: "مستخدم واحد", en: "One user" },
          { ar: "رسالة ترحيب ورد خارج أوقات العمل", en: "Welcome and out-of-hours messages" },
          { ar: "10 ردود سريعة جاهزة للأسئلة المتكررة", en: "10 ready quick replies for frequent questions" },
          { ar: "دعم فني عبر واتساب", en: "Support on WhatsApp" }
        ],
        excludes: [
          { ar: "رسوم رسائل ميتا حسب الاستخدام", en: "Meta message fees, by usage" },
          { ar: "الشات بوت والحملات", en: "Chatbot and campaigns" }
        ]
      },
      {
        key: "wa-pro",
        icon: "Bot",
        name: { ar: "الاحترافية", en: "Professional" },
        tagline: { ar: "بوت يرد 24 ساعة ويحوّل الجادّين لفريقك", en: "A 24/7 bot that hands serious leads to your team" },
        idealFor: { ar: "العيادات والصالونات والمتاجر والشركات كثيرة الرسائل", en: "Clinics, salons, stores and companies with many messages" },
        price: 499,
        from: false,
        period: perMonth,
        delivery: { ar: "5 أيام عمل", en: "5 business days" },
        featured: true,
        features: [
          { ar: "حتى 3 مستخدمين في صندوق محادثات مشترك", en: "Up to 3 users in a shared inbox" },
          { ar: "شات بوت بتدفقات مصممة لنشاطك (قائمة خدمات، حجز، أسئلة)", en: "Chatbot flows designed for your business (menu, booking, FAQs)" },
          { ar: "تأهيل العملاء وتحويلهم للموظف المناسب", en: "Lead qualification and hand-over to the right person" },
          { ar: "5 قوالب رسائل معتمدة من ميتا", en: "5 Meta-approved message templates" },
          { ar: "تعيين المحادثات والملاحظات الداخلية", en: "Conversation assignment and internal notes" },
          { ar: "تقرير شهري بعدد المحادثات وسرعة الرد", en: "A monthly report on conversations and response time" }
        ],
        excludes: [
          { ar: "رسوم رسائل ميتا حسب الاستخدام", en: "Meta message fees, by usage" },
          { ar: "الحملات الجماعية (في الباقة المتقدمة)", en: "Bulk campaigns (in Advanced)" }
        ]
      },
      {
        key: "wa-advanced",
        icon: "Megaphone",
        name: { ar: "المتقدمة", en: "Advanced" },
        tagline: { ar: "حملات وأتمتة كاملة مرتبطة بأنظمتك", en: "Campaigns and full automation linked to your systems" },
        idealFor: { ar: "الفرق الكبيرة والمتاجر التي تسوّق عبر واتساب", en: "Large teams and stores that market on WhatsApp" },
        price: 999,
        from: false,
        period: perMonth,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
        features: [
          { ar: "حتى 10 مستخدمين وصلاحيات لكل دور", en: "Up to 10 users with role permissions" },
          { ar: "كل مميزات الباقة الاحترافية", en: "Everything in Professional" },
          { ar: "حملات تسويقية بشرائح العملاء وجدولتها", en: "Segmented, scheduled marketing campaigns" },
          { ar: "ربط مع متجرك (زد / سلة) ونظام العملاء", en: "Store (Zid / Salla) and CRM integration" },
          { ar: "استرداد السلات المتروكة تلقائياً", en: "Automatic abandoned-cart recovery" },
          { ar: "تقارير أداء الحملات ومدير حساب مخصص", en: "Campaign reports and a dedicated account manager" }
        ],
        excludes: [{ ar: "رسوم رسائل ميتا حسب الاستخدام", en: "Meta message fees, by usage" }]
      }
    ]
  },
  {
    service: "dedicated-tech-team",
    icon: "Users",
    title: { ar: "باقات الفريق التقني المتكامل", en: "Dedicated tech team plans" },
    short: { ar: "فريق تقني", en: "Tech team" },
    text: { ar: "فريق تقني يعمل لشركتك شهرياً بدون أعباء التوظيف.", en: "A tech team working for your company every month, without the hiring burden." },
    highlights: [{ ar: "مطور ومصمم ومدير مشروع لشركتك", en: "A developer, designer and project manager for you" }, { ar: "120 ساعة شهرياً حسب أولوياتك", en: "120 hours a month on your priorities" }, { ar: "بلا أعباء توظيف أو تأمينات", en: "No hiring or payroll burden" }],
    notice: { ar: "الفريق في كل الباقات: مطور برمجيات متكامل، ومصمم واجهات وتجربة مستخدم، ومدير مشروع — 120 ساعة عمل شهرياً توزَّع حسب أولوياتك. الفرق بين الباقات في مدة الالتزام والسعر الشهري والمزايا الإضافية.", en: "Every plan: a Full-Stack developer, a UI/UX designer and a project manager — 120 working hours a month, allocated to your priorities. Plans differ in term, monthly price and extras." },
    tiers: [
      {
        key: "team-monthly",
        icon: "CalendarClock",
        name: { ar: "الشهري", en: "Monthly" },
        tagline: { ar: "مرونة كاملة شهراً بشهر", en: "Full flexibility, month to month" },
        idealFor: { ar: "مشروع قصير أو تجربة العمل معنا قبل الالتزام", en: "A short project, or trying us before committing" },
        price: 13500,
        from: false,
        period: perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        features: [
          { ar: "120 ساعة عمل شهرياً للفريق كاملاً", en: "120 team hours a month" },
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
        period: perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        featured: true,
        features: [
          { ar: "120 ساعة عمل شهرياً — وفّر 8% عن الشهري", en: "120 team hours a month — 8% below monthly" },
          { ar: "خطة تطوير مكتوبة لستة أشهر", en: "A written six-month development plan" },
          { ar: "ترحيل حتى 20 ساعة غير مستخدمة للشهر التالي", en: "Roll over up to 20 unused hours to the next month" },
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
        period: perMonth,
        delivery: { ar: "يبدأ الفريق خلال 7 أيام عمل", en: "The team starts within 7 business days" },
        features: [
          { ar: "120 ساعة عمل شهرياً — وفّر 17% عن الشهري", en: "120 team hours a month — 17% below monthly" },
          { ar: "نفس أعضاء الفريق طوال السنة", en: "The same team members all year" },
          { ar: "خارطة طريق تقنية سنوية", en: "An annual technology roadmap" },
          { ar: "ترحيل حتى 30 ساعة غير مستخدمة", en: "Roll over up to 30 unused hours" },
          { ar: "مراجعة جودة واختبار قبل كل إصدار", en: "QA review and testing before every release" },
          { ar: "أعلى أولوية في الدعم", en: "Top support priority" }
        ],
        excludes: [{ ar: "الاستضافة وتراخيص الأدوات الخارجية", en: "Hosting and third-party tool licences" }]
      }
    ]
  }
];

/**
 * Offers renew on their own: WEEKLY offers run Sunday → Saturday (Riyadh) and their countdown ends at the end of the
 * current week; DAILY deals rotate one per Riyadh calendar day (24 hours, a lower price than the weekly offers).
 * Each offer carries the full detail a client needs before asking: who it is for, the exact deliverables, delivery
 * time, conditions and what is not included.
 */
export const offers: Offer[] = [
  {
    slug: "ai-agent-week",
    cycle: "weekly",
    service: "ai-automation",
    icon: "Bot",
    badge: { ar: "عرض الأسبوع — ذكاء اصطناعي", en: "Offer of the week — AI" },
    title: { ar: "مساعد ذكاء اصطناعي يرد على عملائك 24 ساعة", en: "An AI assistant answering your clients 24/7" },
    text: { ar: "باقة «مساعد ذكاء اصطناعي» (7,999) بسعر الأسبوع: مساعد مدرَّب على خدماتك وأسعارك يرد على واتساب وموقعك بالعربي والإنجليزي، يحجز ويؤهل العملاء ويسجلهم في نظامك، ويحوّل الجادّين لفريقك.", en: "The AI assistant package (7,999) at this week's price: an assistant trained on your services and prices that answers on WhatsApp and your site in Arabic and English, books, qualifies and records leads, and hands serious ones to your team." },
    forWho: { ar: "للعيادات والمتاجر وشركات العقار والخدمات التي تصلها استفسارات كثيرة خارج أوقات العمل أو أكثر من قدرة فريقها.", en: "For clinics, stores, real-estate and service companies with more enquiries than their team can handle, or outside working hours." },
    features: [
      { ar: "مدرَّب على ملفاتك وخدماتك وأسعارك", en: "Trained on your files, services and prices" },
      { ar: "واتساب والموقع بالعربي والإنجليزي", en: "WhatsApp and website, Arabic and English" },
      { ar: "حجز وتأهيل وتسجيل في نظام العملاء", en: "Booking, qualification and CRM records" },
      { ar: "تحويل للموظف المناسب عند الحاجة", en: "Hand-over to the right person when needed" },
      { ar: "3 أشهر ضبط وتحسين", en: "Three months of tuning" }
    ],
    deliverables: [
      { title: { ar: "قاعدة المعرفة", en: "Knowledge base" }, text: { ar: "نجمع خدماتك وأسعارك وسياساتك وأسئلة عملائك المتكررة وندرّب المساعد عليها.", en: "We gather your services, prices, policies and frequent questions and train the assistant on them." } },
      { title: { ar: "القنوات", en: "Channels" }, text: { ar: "تشغيله على رقم واتساب الرسمي ونافذة محادثة في موقعك.", en: "Live on your official WhatsApp number and a chat window on your website." } },
      { title: { ar: "الحجز والتأهيل", en: "Booking & qualification" }, text: { ar: "يسأل عن الاحتياج والمدينة والميزانية، ويحجز المواعيد، ويسجل العميل في نظام العملاء.", en: "Asks about need, city and budget, books appointments and records the client in your CRM." } },
      { title: { ar: "التحويل لفريقك", en: "Hand-over" }, text: { ar: "يحوّل المحادثة للموظف المناسب مع ملخص بما قاله العميل.", en: "Passes the chat to the right person with a summary of what the client said." } },
      { title: { ar: "المراجعة والتحسين", en: "Review & tuning" }, text: { ar: "لوحة لمراجعة المحادثات، وتحسين أسبوعي للردود لمدة 3 أشهر.", en: "A dashboard to review conversations and weekly answer tuning for 3 months." } }
    ],
    delivery: { ar: "3 أسابيع من استلام المعلومات", en: "3 weeks from receiving your information" },
    terms: [
      { ar: "الدفع: 50% عند البدء و50% عند التشغيل", en: "Payment: 50% to start, 50% at go-live" },
      { ar: "يتطلب رقم واتساب للأعمال موثقاً لدى ميتا", en: "Requires a WhatsApp Business number verified with Meta" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "رسوم استخدام الذكاء الاصطناعي ورسائل ميتا حسب الاستخدام", en: "AI usage and Meta message fees, by usage" },
      { ar: "اشتراك واتساب للأعمال", en: "The WhatsApp Business subscription" }
    ],
    price: 5499,
    oldPrice: 7999
  },
  {
    slug: "ai-bundle-week",
    cycle: "weekly",
    service: "ai-automation",
    icon: "Sparkles",
    badge: { ar: "صفقة الأسبوع — التحول الذكي", en: "Bundle of the week — smart transformation" },
    title: { ar: "التحول الذكي: مساعد ذكاء اصطناعي + أتمتة عمليتين", en: "Smart transformation: AI assistant + two automated processes" },
    text: { ar: "باقة «مساعد ذكاء اصطناعي» (7,999) مع باقة «أتمتة الأعمال» (2,999) في مشروع واحد: المساعد يستقبل العملاء، والأتمتة تكمل الشغل بعده — من الطلب حتى المتابعة والتقرير — بدل 10,998 ريالاً.", en: "The AI assistant (7,999) and Business automation (2,999) packages in one project: the assistant receives clients and automation finishes the work after it — from request to follow-up and report — instead of SAR 10,998." },
    forWho: { ar: "للشركات التي تريد تقليل العمل اليدوي فعلياً: استقبال العملاء، وإدخال البيانات، والمتابعة، والتقارير — دون توظيف إضافي.", en: "For companies that really want less manual work — intake, data entry, follow-up and reports — without hiring more." },
    features: [
      { ar: "كل مميزات «مساعد ذكاء اصطناعي»", en: "Everything in AI assistant" },
      { ar: "أتمتة عمليتين بعد استقبال العميل", en: "Two processes automated after intake" },
      { ar: "ربط حتى 3 أدوات وأنظمة", en: "Up to 3 tools and systems connected" },
      { ar: "تقرير أسبوعي تلقائي للإدارة", en: "An automatic weekly report for management" },
      { ar: "مدير مشروع واحد للكل", en: "One project manager for all of it" }
    ],
    deliverables: [
      { title: { ar: "المساعد الذكي", en: "AI assistant" }, text: { ar: "مساعد على واتساب وموقعك مدرَّب على بياناتك، يحجز ويؤهل ويحوّل لفريقك.", en: "An assistant on WhatsApp and your site, trained on your data, that books, qualifies and hands over." } },
      { title: { ar: "الأتمتة", en: "Automation" }, text: { ar: "عمليتان حتى 10 خطوات لكل منهما، مثل: إنشاء عرض السعر وإرساله، أو متابعة العميل تلقائياً حتى الدفع.", en: "Two processes up to 10 steps each, e.g. creating and sending the quote, or automatic follow-up until payment." } },
      { title: { ar: "الربط", en: "Integration" }, text: { ar: "ربط حتى 3 أدوات: نظام العملاء، الجداول، البريد، المحاسبة.", en: "Up to 3 tools connected: CRM, sheets, e-mail, accounting." } },
      { title: { ar: "التقارير", en: "Reports" }, text: { ar: "تقرير أسبوعي تلقائي بعدد العملاء والطلبات ومصادرها وسرعة الرد.", en: "An automatic weekly report on clients, orders, sources and response time." } }
    ],
    delivery: { ar: "5 أسابيع للمشروع كاملاً", en: "5 weeks for the whole project" },
    terms: [
      { ar: "الدفع: 40% عند البدء، 40% عند تشغيل المساعد، 20% عند تسليم الأتمتة", en: "Payment: 40% to start, 40% at assistant go-live, 20% at automation hand-over" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "رسوم الذكاء الاصطناعي ورسائل ميتا واشتراكات الأدوات حسب الاستخدام", en: "AI, Meta message and tool fees, by usage" },
      { ar: "تطوير أنظمة جديدة من الصفر", en: "Building new systems from scratch" }
    ],
    price: 7999,
    oldPrice: 10998
  },
  {
    slug: "system-week",
    cycle: "weekly",
    service: "web-development",
    icon: "LayoutDashboard",
    badge: { ar: "عرض الأسبوع — برمجة", en: "Offer of the week — development" },
    title: { ar: "نظام إداري مخصص لشركتك: العملاء والطلبات والتقارير", en: "A custom management system: clients, orders and reports" },
    text: { ar: "نظام ويب مبني من الصفر على طريقة عمل شركتك، بنطاق محدد وسعر ثابت: العملاء، والطلبات أو المشاريع، والمهام، والصلاحيات، ولوحة تقارير — بدل أنظمة جاهزة لا تناسبك.", en: "A web system built from scratch around how your company works, with a defined scope and a fixed price: clients, orders or projects, tasks, permissions and a reports dashboard — instead of ready-made tools that don't fit." },
    forWho: { ar: "للشركات التي تدير عملها بالجداول وواتساب وتريد نظاماً واحداً منظماً تملكه بالكامل.", en: "For companies running on spreadsheets and WhatsApp that want one organised system they fully own." },
    features: [
      { ar: "تحليل متطلبات ووثيقة نطاق قبل البدء", en: "Requirements analysis and a written scope first" },
      { ar: "حتى 6 أقسام مثل العملاء والطلبات والمهام", en: "Up to 6 modules such as clients, orders and tasks" },
      { ar: "مستخدمون وصلاحيات لكل دور", en: "Users and role permissions" },
      { ar: "لوحة تقارير وتنبيهات بالبريد وواتساب", en: "A reports dashboard and e-mail / WhatsApp alerts" },
      { ar: "ملكية كاملة للكود ودعم 3 أشهر", en: "Full code ownership and 3 months of support" }
    ],
    deliverables: [
      { title: { ar: "التحليل والتصميم", en: "Analysis & design" }, text: { ar: "ورشة لفهم طريقة عملك، ووثيقة نطاق مكتوبة، وتصميم الشاشات قبل البرمجة.", en: "A workshop on how you work, a written scope and screen designs before development." } },
      { title: { ar: "النظام", en: "The system" }, text: { ar: "حتى 6 أقسام (مثل العملاء، الطلبات أو المشاريع، المهام، الفواتير البسيطة، المستندات)، بالعربي والإنجليزي.", en: "Up to 6 modules (e.g. clients, orders or projects, tasks, simple invoices, documents), in Arabic and English." } },
      { title: { ar: "الصلاحيات", en: "Permissions" }, text: { ar: "مستخدمون بأدوار مختلفة، وكل موظف يرى ما يخصه فقط، مع سجل لكل تعديل.", en: "Users with roles, each seeing only what concerns them, with a log of every change." } },
      { title: { ar: "التقارير والتنبيهات", en: "Reports & alerts" }, text: { ar: "لوحة مؤشرات للإدارة، وتنبيهات بالبريد وواتساب عند الأحداث المهمة.", en: "A KPI dashboard for management and e-mail / WhatsApp alerts on key events." } },
      { title: { ar: "التسليم", en: "Hand-over" }, text: { ar: "رفع النظام على خادمك، وتدريب فريقك، والكود كاملاً باسمك، ودعم 3 أشهر.", en: "Deployed on your server, team training, full code in your name and 3 months of support." } }
    ],
    delivery: { ar: "8 أسابيع من اعتماد وثيقة النطاق", en: "8 weeks from scope sign-off" },
    terms: [
      { ar: "النطاق محدد في وثيقة مكتوبة قبل البدء، وأي إضافة بعدها تُسعَّر منفصلة", en: "Scope is fixed in a written document first; additions are priced separately" },
      { ar: "الدفع: 30% عند البدء، 40% عند تسليم النسخة التجريبية، 30% عند الإطلاق", en: "Payment: 30% to start, 40% at the beta, 30% at launch" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "الخادم والنطاق (باسمك وعلى حسابك)", en: "Server and domain (in your name)" },
      { ar: "تطبيق الجوال (يُسعَّر منفصلاً)", en: "A mobile app (priced separately)" }
    ],
    price: 11999,
    oldPrice: 14999
  },
  {
    slug: "store-week",
    cycle: "weekly",
    service: "ecommerce",
    icon: "ShoppingCart",
    badge: { ar: "عرض الأسبوع — من الصفر لأول طلب", en: "Offer of the week — from zero to first order" },
    title: { ar: "متجرك جاهز للبيع + أول شهر تسويق", en: "Your store, ready to sell + your first marketing month" },
    text: { ar: "باقة النمو للمتاجر (4,499) مع أول شهر من تسويق «البداية» (1,499) بسعر واحد: متجر بهويتك على زد أو سلة، الدفع بمدى وأبل باي وتابي وتمارا، الشحن مربوط، البكسل والكتالوج جاهزان، ثم شهر كامل نشغّل فيه حملاتك وحساباتك حتى تصلك الطلبات.", en: "The store Growth package (4,499) plus the first month of Marketing Starter (1,499) at one price: a branded store on Zid or Salla, mada, Apple Pay, Tabby and Tamara payments, shipping connected, pixels and catalogue ready, then a full month running your campaigns and accounts until orders arrive." },
    forWho: { ar: "لأصحاب المشاريع في المملكة الذين يبدؤون من الصفر — أو ينتقلون من البيع على إنستغرام وواتساب — ويريدون جهة واحدة تأخذهم من تأسيس المتجر حتى أول الطلبات.", en: "For business owners in Saudi Arabia starting from zero — or moving from selling on Instagram and WhatsApp — who want one partner from founding the store to the first orders." },
    features: [
      { ar: "متجر بتصميم مخصص وحتى 100 منتج", en: "A custom-designed store with up to 100 products" },
      { ar: "مدى وأبل باي وتابي وتمارا والدفع عند الاستلام", en: "mada, Apple Pay, Tabby, Tamara and cash on delivery" },
      { ar: "بكسل سناب وتيك توك وميتا + ربط الكتالوج", en: "Snap, TikTok and Meta pixels + catalogue sync" },
      { ar: "حملة الافتتاح و10 تصاميم إطلاق", en: "The opening campaign and 10 launch designs" },
      { ar: "أول شهر تسويق: 12 منشوراً وحملة بتحسين أسبوعي", en: "First marketing month: 12 posts and a weekly-optimised campaign" }
    ],
    deliverables: [
      { title: { ar: "المتجر", en: "The store" }, text: { ar: "تصميم مخصص للرئيسية وصفحة المنتج بهويتك، رفع حتى 100 منتج بالخيارات والتصنيفات، وصفحات الاسترجاع والشحن والخصوصية.", en: "A custom home and product page in your brand, up to 100 products with options and categories, and returns, shipping and privacy pages." } },
      { title: { ar: "الدفع والشحن", en: "Payments & shipping" }, text: { ar: "مدى وأبل باي والبطاقات، تابي وتمارا للتقسيط، الدفع عند الاستلام، وربط شركات الشحن مثل سمسا وأرامكس وسبل.", en: "mada, Apple Pay and cards, Tabby and Tamara instalments, cash on delivery, and shipping such as SMSA, Aramex and SPL." } },
      { title: { ar: "التوثيق والضريبة", en: "Verification & VAT" }, text: { ar: "مساعدتك في توثيق المتجر عبر المركز السعودي للأعمال، وضبط الضريبة والفاتورة على المنصة إن كنت مسجلاً في ضريبة القيمة المضافة.", en: "Help verifying the store through the Saudi Business Center, and VAT and invoice settings on the platform if you are VAT-registered." } },
      { title: { ar: "التتبع", en: "Tracking" }, text: { ar: "بكسل سناب وتيك توك وميتا بتتبع الإضافة للسلة والشراء، وتحليلات جوجل، وربط الكتالوج بإنستغرام وتيك توك وسناب.", en: "Snap, TikTok and Meta pixels tracking add-to-cart and purchase, Google Analytics, and the catalogue synced to Instagram, TikTok and Snap." } },
      { title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "10 تصاميم افتتاح، كوبونات الخصم الأولى، تجهيز الحسابات الإعلانية وإطلاق حملة الافتتاح.", en: "10 opening designs, the first discount coupons, ad accounts set up and the opening campaign launched." } },
      { title: { ar: "أول شهر تسويق", en: "First marketing month" }, text: { ar: "إدارة حسابين، 12 منشوراً بالتصميم والنص، حملة على منصة واحدة بـ 4 تصاميم إعلانية وتحسين أسبوعي، وتقرير بالطلبات وتكلفة الطلب الواحد.", en: "Two accounts, 12 designed posts, a one-platform campaign with 4 ad designs and weekly optimisation, and a report on orders and cost per order." } },
      { title: { ar: "واتساب", en: "WhatsApp" }, text: { ar: "زر واتساب في المتجر وإشعار بكل طلب جديد على رقمك.", en: "A WhatsApp button in the store and an alert for every new order." } },
      { title: { ar: "التدريب والدعم", en: "Training & support" }, text: { ar: "جلسة أونلاين لفريقك على الطلبات والمنتجات والكوبونات وقراءة التقارير، ودعم فني لمدة شهرين.", en: "An online session for your team on orders, products, coupons and reports, and two months of support." } }
    ],
    delivery: { ar: "المتجر خلال 10 أيام عمل من استلام المنتجات والشعار، ثم يبدأ شهر التسويق مباشرة", en: "The store in 10 business days from receiving your products and logo, then the marketing month starts right away" },
    terms: [
      { ar: "اشتراك منصة زد أو سلة وميزانية الإعلانات على حساب العميل وباسمه (نوصي بـ 1,500 ريال للإعلانات في الشهر الأول)", en: "The Zid or Salla subscription and the ad budget are in the client's name and paid by the client (we recommend SAR 1,500 of ads in month one)" },
      { ar: "الدفع: 50% عند البدء و50% عند تسليم المتجر", en: "Payment: 50% to start, 50% on store delivery" },
      { ar: "جولتان من التعديلات على تصميم المتجر", en: "Two revision rounds on the store design" },
      { ar: "بعد الشهر الأول تستمر باقة التسويق بسعرها المعتاد (1,499 شهرياً) أو تتوقف بلا التزام", en: "After the first month marketing continues at its normal price (1,499/month) or stops with no commitment" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "تصوير المنتجات (متاح في باقة التسويق «الإدارة الكاملة»)", en: "Product photography (in the Full management marketing plan)" },
      { ar: "رسوم بوابات الدفع وشركات الشحن وتابي وتمارا", en: "Payment gateway, shipping, Tabby and Tamara fees" },
      { ar: "اشتراك المنصة وتطبيقاتها المدفوعة", en: "The platform subscription and its paid apps" }
    ],
    price: 3999,
    oldPrice: 5998
  },
  {
    slug: "day-automation",
    cycle: "daily",
    service: "ai-automation",
    icon: "Workflow",
    badge: { ar: "صفقة اليوم — أتمتة", en: "Deal of the day — automation" },
    title: { ar: "أتمتة عمليتين في شركتك بـ 1,999 ريالاً", en: "Two processes automated for SAR 1,999" },
    text: { ar: "باقة «أتمتة الأعمال» كاملة بسعر اليوم: نحوّل عمليتين يكررهما فريقك يومياً — مثل استقبال الطلبات وإرسال عروض الأسعار والمتابعة — إلى عمليات تعمل وحدها.", en: "The full Business automation package at today's price: two processes your team repeats daily — like taking requests, sending quotes and follow-ups — turned into ones that run by themselves." },
    forWho: { ar: "للشركات التي يضيع وقت فريقها في نقل البيانات بين البريد والجداول وواتساب والأنظمة.", en: "For companies whose team loses time moving data between e-mail, sheets, WhatsApp and systems." },
    features: [
      { ar: "عمليتان حتى 10 خطوات", en: "Two processes, up to 10 steps" },
      { ar: "ربط حتى 3 أدوات", en: "Up to 3 tools connected" },
      { ar: "ذكاء اصطناعي لقراءة الرسائل وتصنيفها", en: "AI to read and sort messages" }
    ],
    deliverables: [
      { title: { ar: "التحليل", en: "Review" }, text: { ar: "جلسة نرسم فيها عملياتك ونختار الأعلى أثراً.", en: "A session mapping your processes and picking the highest-impact ones." } },
      { title: { ar: "التنفيذ", en: "Build" }, text: { ar: "بناء الأتمتة وربط أدواتك، مع تنبيه عند أي خطأ.", en: "The automations built and your tools connected, with alerts on any failure." } },
      { title: { ar: "التسليم", en: "Hand-over" }, text: { ar: "تجربة على بيانات حقيقية، وتوثيق، وتدريب، ودعم لمدة شهر.", en: "Tested on real data, documented, team trained, one month of support." } }
    ],
    delivery: { ar: "10 أيام عمل", en: "10 business days" },
    terms: [
      { ar: "عمليتان بحد أقصى 10 خطوات لكل منهما و3 أدوات", en: "Two processes, at most 10 steps each and 3 tools" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "اشتراكات الأدوات ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Tool subscriptions and AI usage fees" }],
    price: 1999,
    oldPrice: 2999
  },
  {
    slug: "day-website",
    cycle: "daily",
    service: "web-development",
    icon: "Monitor",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "موقع تعريفي لشركتك بـ 1,499 ريالاً", en: "A company website for SAR 1,499" },
    text: { ar: "الباقة الأساسية كاملة بأقل سعر: موقع أنيق حتى 5 صفحات، متجاوب مع الجوال، بنموذج تواصل وزر واتساب — جاهز خلال أسبوع.", en: "The full Starter package at the lowest price: an elegant site of up to 5 pages, mobile-ready, with a contact form and WhatsApp button — ready in a week." },
    forWho: { ar: "للشركات الصغيرة والمهنيين (المكاتب والعيادات والمقاولون) الذين يحتاجون حضوراً احترافياً بسرعة.", en: "For small companies and professionals (offices, clinics, contractors) who need a professional presence fast." },
    features: [
      { ar: "حتى 5 صفحات", en: "Up to 5 pages" },
      { ar: "متجاوب مع الجوال", en: "Mobile-ready" },
      { ar: "جاهز خلال 7 أيام عمل", en: "Ready in 7 business days" }
    ],
    deliverables: [
      { title: { ar: "الصفحات", en: "Pages" }, text: { ar: "الرئيسية، من نحن، الخدمات، أعمالنا، تواصل معنا.", en: "Home, about, services, our work, contact." } },
      { title: { ar: "التواصل", en: "Contact" }, text: { ar: "نموذج تواصل يصل لبريدك وزر واتساب ثابت في كل الصفحات.", en: "A contact form to your inbox and a WhatsApp button on every page." } },
      { title: { ar: "الأساسيات التقنية", en: "Technical basics" }, text: { ar: "شهادة أمان، وتهيئة أساسية لمحركات البحث، وربط تحليلات جوجل.", en: "SSL, basic SEO set-up and Google Analytics." } }
    ],
    delivery: { ar: "7 أيام عمل من استلام الشعار والمحتوى", en: "7 business days from receiving your logo and content" },
    terms: [
      { ar: "لغة واحدة (العربية أو الإنجليزية)", en: "One language (Arabic or English)" },
      { ar: "جولة تعديل واحدة على التصميم", en: "One round of design revisions" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "النطاق والاستضافة وكتابة المحتوى", en: "Domain, hosting and copywriting" }],
    price: 1499,
    oldPrice: 2499
  },
  {
    slug: "day-store",
    cycle: "daily",
    service: "ecommerce",
    icon: "ShoppingBag",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "متجرك على زد أو سلة بـ 1,199 ريالاً", en: "Your Zid or Salla store for SAR 1,199" },
    text: { ar: "باقة الانطلاق بأقل سعر: نجهز متجرك ونرفع منتجاتك الأولى ونربط الدفع والشحن، لتبدأ البيع خلال 5 أيام.", en: "Launch at the lowest price: we set up your store, upload your first products and connect payments and shipping so you sell within 5 days." },
    forWho: { ar: "لمن يبيع على إنستغرام أو واتساب ويريد متجراً حقيقياً بأقل تكلفة.", en: "For sellers on Instagram or WhatsApp who want a real store at the lowest cost." },
    features: [
      { ar: "حتى 30 منتجاً", en: "Up to 30 products" },
      { ar: "الدفع والشحن مربوطان", en: "Payments and shipping connected" },
      { ar: "بكسل الإعلانات وحسابات السوشيال", en: "Ad pixels and social accounts" },
      { ar: "جاهز خلال 5 أيام عمل", en: "Ready in 5 business days" }
    ],
    deliverables: [
      { title: { ar: "الإعداد", en: "Set-up" }, text: { ar: "إعداد المتجر وصفحاته الأساسية بشعارك وألوانك.", en: "Store and core pages set up with your logo and colours." } },
      { title: { ar: "المنتجات", en: "Products" }, text: { ar: "رفع حتى 30 منتجاً بالصور والوصف والأسعار.", en: "Up to 30 products with photos, descriptions and prices." } },
      { title: { ar: "الدفع والشحن", en: "Payments & shipping" }, text: { ar: "ربط مدى وأبل باي وشركات الشحن المتاحة.", en: "mada, Apple Pay and the available shipping companies." } },
      { title: { ar: "جاهز للإعلان", en: "Ready to advertise" }, text: { ar: "تركيب بكسل سناب وتيك توك وميتا وتحليلات جوجل، وإنشاء حسابات المتجر على إنستغرام وتيك توك وسناب وربطها بالمتجر.", en: "Snap, TikTok and Meta pixels plus Google Analytics installed, and the store's Instagram, TikTok and Snap accounts created and linked." } }
    ],
    delivery: { ar: "5 أيام عمل من استلام المنتجات", en: "5 business days from receiving the products" },
    terms: [
      { ar: "اشتراك المنصة على حساب العميل وباسمه", en: "The platform subscription is in the client's name" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "التصميم المخصص (متاح في باقة النمو)", en: "Custom design (in the Growth package)" },
      { ar: "إدارة الحملات وميزانية الإعلانات", en: "Campaign management and ad budget" }
    ],
    price: 1199,
    oldPrice: 1999
  },
  {
    slug: "day-ai-bot",
    cycle: "daily",
    service: "ai-automation",
    icon: "Bot",
    badge: { ar: "صفقة اليوم — ذكاء اصطناعي", en: "Deal of the day — AI" },
    title: { ar: "مساعد ذكاء اصطناعي على موقعك يجيب من ملفاتك بـ 2,499 ريالاً", en: "An AI assistant on your website answering from your files, SAR 2,499" },
    text: { ar: "نافذة محادثة ذكية في موقعك تجيب زوارك فوراً من ملفاتك وخدماتك وأسعارك بالعربي والإنجليزي، وتجمع بيانات المهتمين وترسلها لفريقك.", en: "A smart chat window on your site that instantly answers visitors from your files, services and prices in Arabic and English, and collects interested leads for your team." },
    forWho: { ar: "للشركات التي يسأل زوار موقعها نفس الأسئلة كثيراً ولا يجدون من يرد عليهم فوراً.", en: "For companies whose site visitors keep asking the same questions and get no instant answer." },
    features: [
      { ar: "مدرَّب على ملفاتك وموقعك", en: "Trained on your files and site" },
      { ar: "عربي وإنجليزي", en: "Arabic and English" },
      { ar: "يجمع بيانات العملاء المهتمين", en: "Collects interested leads" }
    ],
    deliverables: [
      { title: { ar: "التدريب", en: "Training" }, text: { ar: "تدريب المساعد على حتى 50 صفحة من ملفاتك وصفحات موقعك.", en: "The assistant trained on up to 50 pages of your files and site." } },
      { title: { ar: "التركيب", en: "Installation" }, text: { ar: "نافذة محادثة بهويتك في كل صفحات الموقع.", en: "A branded chat window on every page of your site." } },
      { title: { ar: "العملاء المهتمون", en: "Leads" }, text: { ar: "يطلب الاسم والجوال من المهتمين ويرسلها لبريدك أو نظام العملاء.", en: "Asks interested visitors for name and phone and sends them to your inbox or CRM." } },
      { title: { ar: "التحسين", en: "Tuning" }, text: { ar: "مراجعة المحادثات وتحسين الردود لمدة شهر.", en: "Conversations reviewed and answers tuned for a month." } }
    ],
    delivery: { ar: "10 أيام عمل", en: "10 business days" },
    terms: [
      { ar: "الموقع فقط — واتساب متاح في باقة «مساعد ذكاء اصطناعي»", en: "Website only — WhatsApp is in the AI assistant package" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "رسوم استخدام الذكاء الاصطناعي حسب عدد المحادثات", en: "AI usage fees, by number of conversations" }],
    price: 2499,
    oldPrice: 3999
  },
  {
    slug: "day-marketing",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Megaphone",
    badge: { ar: "صفقة اليوم — تسويق", en: "Deal of the day — marketing" },
    title: { ar: "أول شهر من باقة «نمو المبيعات» بـ 1,999 ريالاً", en: "Your first Sales Growth month for SAR 1,999" },
    text: { ar: "باقة «نمو المبيعات» لشهر كامل بسعر اليوم: ندير 3 حسابات، 20 منشوراً و4 فيديوهات قصيرة، وحملاتك على سناب وتيك توك وميتا مع إعادة استهداف من ترك السلة.", en: "The Sales Growth plan for a full month at today's price: 3 accounts, 20 posts and 4 short videos, and your Snap, TikTok and Meta campaigns with abandoned-cart retargeting." },
    forWho: { ar: "للمتاجر والمشاريع التي تريد تجربة إدارة التسويق الكاملة معنا قبل الالتزام.", en: "For stores and businesses that want to try our full marketing management before committing." },
    features: [
      { ar: "20 منشوراً و4 فيديوهات قصيرة", en: "20 posts and 4 short videos" },
      { ar: "حملات على سناب وتيك توك وميتا", en: "Campaigns on Snap, TikTok and Meta" },
      { ar: "تقرير بالطلبات وتكلفتها", en: "A report on orders and their cost" }
    ],
    deliverables: [
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "خطة محتوى للشهر، 20 منشوراً و4 فيديوهات قصيرة (من تصويرك ونحن نحررها) على 3 حسابات.", en: "A monthly content plan, 20 posts and 4 short videos (you film, we edit) on 3 accounts." } },
      { title: { ar: "الإعلانات", en: "Ads" }, text: { ar: "حملات على سناب وتيك توك وميتا بـ 8 تصاميم إعلانية، وإعادة استهداف زوار المتجر ومن ترك السلة، وتحسين أسبوعي.", en: "Snap, TikTok and Meta campaigns with 8 ad designs, retargeting of visitors and abandoned carts, and weekly optimisation." } },
      { title: { ar: "القياس", en: "Measurement" }, text: { ar: "فحص البكسل وتقرير كل أسبوعين بالطلبات وتكلفة الطلب الواحد.", en: "A pixel check and a report every two weeks on orders and cost per order." } }
    ],
    delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
    terms: [
      { ar: "شهر واحد بلا التزام بعده", en: "One month, no commitment after it" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "ميزانية الإعلانات (تُدفع للمنصة من حسابك)", en: "Ad budget (paid to the platform from your account)" }],
    price: 1999,
    oldPrice: 2999
  },
  {
    slug: "day-whatsapp",
    cycle: "daily",
    service: "whatsapp-automation",
    icon: "MessageSquareMore",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "باقة واتساب الأساسية 3 أشهر بـ 349 ريالاً", en: "WhatsApp Basic, 3 months for SAR 349" },
    text: { ar: "لا تفوّت أي رسالة: نربط رقمك بواتساب للأعمال الرسمي مع رسالة ترحيب ورد آلي وردود سريعة — 3 أشهر بأقل من سعر شهرين.", en: "Never miss a message: your number on the official WhatsApp Business Platform with a welcome message, auto-reply and quick replies — 3 months for less than the price of 2." },
    forWho: { ar: "للأنشطة التي تبدأ في تنظيم رسائل واتساب لأول مرة.", en: "For businesses organising their WhatsApp messages for the first time." },
    features: [
      { ar: "3 أشهر من الباقة الأساسية", en: "3 months of Basic" },
      { ar: "الإعداد مجاناً", en: "Free set-up" },
      { ar: "جاهز خلال يومي عمل", en: "Ready in 2 business days" }
    ],
    deliverables: [
      { title: { ar: "الرقم الرسمي", en: "Official number" }, text: { ar: "ربط رقمك والتحقق من اسم نشاطك.", en: "Your number connected and business name verified." } },
      { title: { ar: "الرد الآلي", en: "Auto-reply" }, text: { ar: "رسالة ترحيب، رد خارج أوقات العمل، و10 ردود سريعة جاهزة.", en: "Welcome message, out-of-hours reply and 10 ready quick replies." } }
    ],
    delivery: { ar: "يومان عمل بعد اعتماد ميتا لحسابك", en: "2 business days after Meta approves your account" },
    terms: [
      { ar: "الدفع مقدماً عن الأشهر الثلاثة", en: "The three months are paid upfront" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "رسوم رسائل ميتا حسب الاستخدام", en: "Meta message fees, billed by usage" }],
    price: 349,
    oldPrice: 597
  },
  {
    slug: "day-integration",
    cycle: "daily",
    service: "digital-transformation",
    icon: "Plug",
    badge: { ar: "صفقة اليوم — ربط الأنظمة", en: "Deal of the day — integration" },
    title: { ar: "ربط نظامين ببعض تلقائياً بـ 1,799 ريالاً", en: "Two systems connected automatically for SAR 1,799" },
    text: { ar: "نوقف الإدخال المزدوج: نربط نظامين عندك ليتبادلا البيانات وحدهما — مثل المتجر مع المحاسبة، أو الموقع مع نظام العملاء، أو نظام العملاء مع واتساب.", en: "No more double entry: we connect two of your systems so they exchange data by themselves — e.g. store and accounting, site and CRM, or CRM and WhatsApp." },
    forWho: { ar: "للشركات التي يعيد موظفوها إدخال نفس البيانات في أكثر من نظام.", en: "For companies whose staff re-enter the same data in more than one system." },
    features: [
      { ar: "ربط نظامين عبر واجهاتهما البرمجية", en: "Two systems connected through their APIs" },
      { ar: "مزامنة تلقائية في الاتجاهين عند الحاجة", en: "Automatic two-way sync when needed" },
      { ar: "سجل وتنبيه عند أي خطأ", en: "A log and alerts on any failure" }
    ],
    deliverables: [
      { title: { ar: "التحليل", en: "Analysis" }, text: { ar: "تحديد البيانات التي تنتقل ومتى، ومراجعة واجهات النظامين.", en: "Which data moves and when, and a review of both systems' APIs." } },
      { title: { ar: "الربط", en: "Integration" }, text: { ar: "بناء الربط مع إعادة المحاولة تلقائياً عند انقطاع أي نظام.", en: "The integration built with automatic retries when a system is down." } },
      { title: { ar: "المتابعة", en: "Monitoring" }, text: { ar: "سجل لكل عملية نقل وتنبيه بالبريد عند الخطأ، ودعم لمدة شهر.", en: "A log of every transfer, e-mail alerts on errors and one month of support." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "يتطلب أن يوفر النظامان واجهة برمجية متاحة", en: "Both systems must offer an available API" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "اشتراكات الأنظمة ورسوم واجهاتها البرمجية", en: "System subscriptions and their API fees" }],
    price: 1799,
    oldPrice: 2999
  },
  {
    slug: "day-landing",
    cycle: "daily",
    service: "web-development",
    icon: "MousePointerClick",
    badge: { ar: "صفقة اليوم — صفحة هبوط", en: "Deal of the day — landing page" },
    title: { ar: "صفحة هبوط احترافية لحملتك الإعلانية بـ 999 ريالاً", en: "A professional landing page for your ad campaign, SAR 999" },
    text: { ar: "صفحة واحدة مصممة لتحويل زوار إعلانك إلى طلبات: عرض واضح، وزر طلب وواتساب، ونموذج يصل لبريدك، وبكسل يقيس كل طلب — أسرع وأرخص من موقع كامل.", en: "One page built to turn ad visitors into orders: a clear offer, order and WhatsApp buttons, a form to your inbox and a pixel that measures every order — faster and cheaper than a full site." },
    forWho: { ar: "لمن يطلق حملة على سناب أو تيك توك أو جوجل لمنتج أو خدمة أو عرض محدد، ويريد صفحة تبيع بدل إرسال الزوار للصفحة الرئيسية.", en: "For anyone running a Snap, TikTok or Google campaign for one product, service or offer who wants a page that sells instead of sending visitors to the home page." },
    features: [
      { ar: "صفحة واحدة بتصميم مخصص", en: "One custom-designed page" },
      { ar: "زر واتساب ونموذج طلب", en: "WhatsApp button and order form" },
      { ar: "بكسل الإعلانات وتحليلات جوجل", en: "Ad pixels and Google Analytics" }
    ],
    deliverables: [
      { title: { ar: "التصميم", en: "Design" }, text: { ar: "صفحة بهويتك متجاوبة مع الجوال: العرض، المميزات، آراء العملاء، الأسئلة المتكررة، وزر الطلب.", en: "A mobile-first page in your brand: the offer, benefits, testimonials, FAQs and the order button." } },
      { title: { ar: "الطلبات", en: "Orders" }, text: { ar: "نموذج يصل لبريدك وزر واتساب برسالة جاهزة باسم العرض.", en: "A form to your inbox and a WhatsApp button with a ready message naming the offer." } },
      { title: { ar: "القياس", en: "Measurement" }, text: { ar: "بكسل سناب وتيك توك وميتا وتحليلات جوجل مع تتبع كل طلب.", en: "Snap, TikTok and Meta pixels plus Google Analytics, tracking every order." } },
      { title: { ar: "النشر", en: "Publishing" }, text: { ar: "رفعها على نطاقك أو نطاق فرعي، مع شهادة الأمان وتحسين السرعة.", en: "Published on your domain or a sub-domain, with SSL and speed optimisation." } }
    ],
    delivery: { ar: "5 أيام عمل من استلام المحتوى", en: "5 business days from receiving the content" },
    terms: [
      { ar: "صفحة واحدة بلغة واحدة وجولة تعديل واحدة", en: "One page in one language, one revision round" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "الاستضافة والنطاق (إن لم تكن لديك)", en: "Hosting and domain (if you don't have them)" },
      { ar: "إدارة الحملة وميزانية الإعلانات", en: "Campaign management and ad budget" }
    ],
    price: 999,
    oldPrice: 1799
  },
  {
    slug: "day-brand",
    cycle: "daily",
    service: "ux-ui-design",
    icon: "Palette",
    badge: { ar: "صفقة اليوم — تصميم", en: "Deal of the day — design" },
    title: { ar: "هوية بصرية كاملة لمشروعك بـ 999 ريال", en: "A complete brand identity for SAR 999" },
    text: { ar: "شعار احترافي مع ألوانك وخطوطك وقالبين سوشيال جاهزين — كل ما تحتاجه لتبدأ بشكل يثق فيه العميل من أول نظرة.", en: "A professional logo with your colours, fonts and two ready social templates — everything you need to look trustworthy from the first glance." },
    forWho: { ar: "للمشاريع الجديدة والمتاجر التي تبدأ بدون هوية، أو تريد تجديد شكلها.", en: "For new businesses and stores starting without an identity, or refreshing their look." },
    features: [
      { ar: "3 مقترحات للشعار", en: "3 logo concepts" },
      { ar: "دليل ألوان وخطوط", en: "Colour and font guide" },
      { ar: "قالبان للسوشيال ميديا", en: "2 social media templates" }
    ],
    deliverables: [
      { title: { ar: "الشعار", en: "Logo" }, text: { ar: "3 مقترحات، وجولتان من التعديل على المقترح المختار، وتسليمه بكل الصيغ المناسبة للطباعة والنشر.", en: "3 concepts, two revision rounds on the chosen one, delivered in every format (PNG, SVG, PDF)." } },
      { title: { ar: "دليل الهوية", en: "Brand guide" }, text: { ar: "الألوان والخطوط وطريقة استخدام الشعار في ملف واحد.", en: "Colours, fonts and logo usage in one file." } },
      { title: { ar: "السوشيال", en: "Social" }, text: { ar: "قالبان للمنشورات وغلاف للحسابات، قابلة للتعديل.", en: "2 editable post templates and account covers." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "جولتان من التعديلات على المقترح المختار", en: "Two revision rounds on the chosen concept" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "تسجيل العلامة التجارية والمطبوعات", en: "Trademark registration and print" }],
    price: 999,
    oldPrice: 1599
  },
  {
    slug: "day-dashboard",
    cycle: "daily",
    service: "digital-transformation",
    icon: "ChartColumn",
    badge: { ar: "صفقة اليوم — تقارير الإدارة", en: "Deal of the day — management reports" },
    title: { ar: "لوحة تقارير ومؤشرات لإدارتك من بياناتك بـ 2,499 ريالاً", en: "A management KPI dashboard from your data, SAR 2,499" },
    text: { ar: "كل أرقام شركتك في شاشة واحدة تتحدث وحدها: المبيعات، والعملاء، والطلبات، والتحصيل — من جداولك وأنظمتك الحالية بدل تجميعها يدوياً كل أسبوع.", en: "All your company's numbers on one self-updating screen: sales, clients, orders and collections — from your current sheets and systems instead of compiling them by hand every week." },
    forWho: { ar: "للمديرين وأصحاب الشركات الذين يريدون قرارات أسرع مبنية على أرقام حقيقية.", en: "For managers and owners who want faster decisions based on real numbers." },
    features: [
      { ar: "حتى 12 مؤشراً في لوحة واحدة", en: "Up to 12 KPIs on one dashboard" },
      { ar: "ربط حتى مصدرين للبيانات", en: "Up to 2 data sources connected" },
      { ar: "تحديث تلقائي وتقرير أسبوعي بالبريد", en: "Automatic refresh and a weekly e-mail report" }
    ],
    deliverables: [
      { title: { ar: "المؤشرات", en: "KPIs" }, text: { ar: "جلسة نحدد فيها المؤشرات التي تهم إدارتك فعلاً.", en: "A session to define the KPIs that really matter to you." } },
      { title: { ar: "البيانات", en: "Data" }, text: { ar: "ربط حتى مصدرين (مثل الجداول والمتجر أو المحاسبة) وتنظيف البيانات.", en: "Up to 2 sources connected (e.g. sheets and store or accounting) and the data cleaned." } },
      { title: { ar: "اللوحة", en: "Dashboard" }, text: { ar: "لوحة بالعربي تعمل على الكمبيوتر والجوال، مع صلاحيات لمن يراها، وتقرير أسبوعي بالبريد.", en: "An Arabic dashboard on desktop and mobile, with access control and a weekly e-mail report." } }
    ],
    delivery: { ar: "10 أيام عمل", en: "10 business days" },
    terms: [
      { ar: "حتى 12 مؤشراً ومصدرين للبيانات", en: "Up to 12 KPIs and 2 data sources" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "تراخيص أدوات التقارير إن وُجدت", en: "Reporting tool licences, if any" }],
    price: 2499,
    oldPrice: 3999
  },
  {
    slug: "day-social",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Share2",
    badge: { ar: "صفقة اليوم — سوشيال ميديا", en: "Deal of the day — social media" },
    title: { ar: "شهر سوشيال ميديا كامل: 30 منشوراً بالتصميم والنشر بـ 1,999 ريالاً", en: "A full social media month: 30 posts designed and published for SAR 1,999" },
    text: { ar: "شهر كامل من المحتوى بهويتك: 30 منشوراً بالتصميم والنص، و4 فيديوهات قصيرة نحررها، وننشرها ونجدولها لك على 3 حسابات.", en: "A full month of content in your brand: 30 designed and written posts, 4 short videos we edit, published and scheduled on 3 accounts." },
    forWho: { ar: "لمن يريد حسابات نشطة باحترافية كل يوم دون أن يشغل نفسه بالتصميم والنشر — بدون حملات إعلانية.", en: "For anyone who wants professionally active accounts every day without handling design and posting — without ad campaigns." },
    features: [
      { ar: "30 منشوراً بالتصميم والنص", en: "30 designed and written posts" },
      { ar: "4 فيديوهات قصيرة (ريلز) نحررها", en: "4 short videos (reels) we edit" },
      { ar: "النشر والجدولة على 3 حسابات", en: "Publishing and scheduling on 3 accounts" }
    ],
    deliverables: [
      { title: { ar: "خطة المحتوى", en: "Content plan" }, text: { ar: "جدول شهري بالأفكار والمواعيد المناسبة لجمهورك.", en: "A monthly calendar of ideas and the right posting times." } },
      { title: { ar: "التصاميم", en: "Designs" }, text: { ar: "30 تصميماً بمقاسي المنشور والستوري، مع جولة تعديل.", en: "30 designs in post and story sizes, with a revision round." } },
      { title: { ar: "النصوص", en: "Captions" }, text: { ar: "نص تسويقي لكل منشور بالعربية مع الهاشتاقات.", en: "A marketing caption for each post in Arabic, with hashtags." } },
      { title: { ar: "الفيديو", en: "Video" }, text: { ar: "تحرير 4 فيديوهات قصيرة من تصويرك بالنصوص والموسيقى المناسبة.", en: "4 short videos edited from your footage, with captions and music." } },
      { title: { ar: "النشر", en: "Publishing" }, text: { ar: "نجدول وننشر المحتوى على 3 حسابات (مثل إنستغرام وتيك توك وسناب) في أفضل الأوقات لجمهورك.", en: "We schedule and publish on 3 accounts (e.g. Instagram, TikTok and Snap) at your audience's best times." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "جولة تعديل واحدة على الدفعة كاملة", en: "One revision round on the whole batch" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "الحملات الإعلانية والرد على الرسائل (في باقات التسويق الشهرية)", en: "Ad campaigns and replying to messages (in the monthly marketing plans)" },
      { ar: "تصوير الفيديو (التصوير منك ونحن نحرره)", en: "Filming (you film, we edit)" }
    ],
    price: 1999,
    oldPrice: 2999
  },
  {
    slug: "day-ads-setup",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Target",
    badge: { ar: "صفقة اليوم — إعلانات", en: "Deal of the day — ads" },
    title: { ar: "جاهز للإعلان: البكسل + الكتالوج + حملتين وإدارتها أسبوعين بـ 1,499 ريالاً", en: "Ready to advertise: pixels + catalogue + two campaigns managed for two weeks, SAR 1,499" },
    text: { ar: "نجهز متجرك أو موقعك للإعلان بالشكل الصحيح: نركّب البكسل ونربط كتالوج منتجاتك، ثم نطلق حملتين على منصتين وندير ونحسّن أداءهما أسبوعين كاملين.", en: "We get your store or site ready to advertise properly: pixels installed and your catalogue connected, then two campaigns on two platforms launched and optimised for two full weeks." },
    forWho: { ar: "لمن يعلن بدون قياس أو يريد البدء بالإعلانات بشكل صحيح من أول ريال.", en: "For anyone advertising without measurement, or starting ads the right way from the first riyal." },
    features: [
      { ar: "بكسل سناب وتيك توك وميتا مع تتبع الشراء", en: "Snap, TikTok and Meta pixels with purchase tracking" },
      { ar: "ربط كتالوج المنتجات", en: "Product catalogue connected" },
      { ar: "حملتان على منصتين و4 تصاميم إعلانية", en: "Two campaigns on two platforms and 4 ad designs" },
      { ar: "إدارة وتحسين أسبوعين", en: "Two weeks of management and optimisation" }
    ],
    deliverables: [
      { title: { ar: "البكسل والتتبع", en: "Pixels & tracking" }, text: { ar: "تركيب البكسل وتجربة أحداث المشاهدة والإضافة للسلة والشراء، وربط تحليلات جوجل.", en: "Pixels installed, view / add-to-cart / purchase events tested, Google Analytics connected." } },
      { title: { ar: "الحسابات الإعلانية", en: "Ad accounts" }, text: { ar: "إنشاء أو ترتيب حساباتك الإعلانية وربطها بالمتجر وطرق الدفع.", en: "Your ad accounts created or tidied and linked to the store and payment methods." } },
      { title: { ar: "الكتالوج", en: "Catalogue" }, text: { ar: "ربط منتجات متجرك بكتالوج ميتا وتيك توك وسناب لإعلانات المنتجات الديناميكية.", en: "Your store products synced to the Meta, TikTok and Snap catalogues for dynamic product ads." } },
      { title: { ar: "الحملات", en: "Campaigns" }, text: { ar: "إعداد الجمهور وإطلاق حملتين على منصتين بـ 4 تصاميم إعلانية.", en: "Audiences set up and two campaigns launched on two platforms with 4 ad designs." } },
      { title: { ar: "أسبوعا إدارة", en: "Two weeks of management" }, text: { ar: "متابعة يومية وتحسين الإعلانات والميزانية أسبوعين، وتقرير بالطلبات وتكلفة الطلب في النهاية.", en: "Daily monitoring and ad / budget optimisation for two weeks, ending with a report on orders and cost per order." } }
    ],
    delivery: { ar: "التجهيز خلال 3 أيام عمل، ثم أسبوعا إدارة", en: "Set up in 3 business days, then two weeks of management" },
    terms: [
      { ar: "منصتان إعلانيتان يختارهما العميل", en: "Two ad platforms of the client's choice" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "ميزانية الإعلانات (تُدفع للمنصة من حسابك)", en: "Ad budget (paid to the platform from your account)" },
      { ar: "الإدارة بعد الأسبوعين (في باقات التسويق الشهرية)", en: "Management after two weeks (in the monthly marketing plans)" }
    ],
    price: 1499,
    oldPrice: 2499
  }
];

export const deals: Deal[] = [
  {
    token: "example-k3v9q2",
    client: { ar: "شركة المثال التجارية", en: "Example Trading Co." },
    title: { ar: "عرض خاص: موقع ومتجر وواتساب", en: "Special offer: website, store and WhatsApp" },
    text: { ar: "مثال لصفقة خاصة بعميل واحد — رابطها لا يظهر في الموقع ولا في محركات البحث.", en: "An example single-client deal — its link is not listed on the site or in search engines." },
    items: [
      { label: { ar: "موقع الشركة — الباقة الاحترافية", en: "Company website — Professional" }, price: 8900 },
      { label: { ar: "متجر إلكتروني — باقة النمو", en: "Online store — Growth" }, price: 6900 },
      { label: { ar: "حلول واتساب — الباقة الاحترافية (3 أشهر)", en: "WhatsApp — Professional (3 months)" }, price: 2397 }
    ],
    total: 15900,
    expiresAt: "2030-12-31",
    preview: true
  }
];

const live = (x: { preview?: boolean }) => !x.preview || process.env.NODE_ENV !== "production";
const day = (s: string) => new Date(`${s}T00:00:00+03:00`);
/** End of the given Riyadh day as an ISO instant (private deals run through their last day). */
export const offerEndInstant = (s: string) => new Date(day(s).getTime() + 86_400_000).toISOString();

const RIYADH = 3 * 3_600_000; // UTC+3 all year
const DAY = 86_400_000;
const dayIndex = (now: Date) => Math.floor((now.getTime() + RIYADH) / DAY);
/** End of the current Riyadh day, or of the current week (weeks run Sunday → Saturday; 1 Jan 1970 was a Thursday). */
export function cycleEnd(cycle: Offer["cycle"], now = new Date()) {
  const d = dayIndex(now);
  const end = cycle === "daily" ? d + 1 : d + (7 - ((d + 4) % 7));
  return new Date(end * DAY - RIYADH);
}
/** How many 24-hour deals run at once (they slide in the deals banner). */
export const DEALS_PER_DAY = 4;
/** Today's 24-hour deals: the pool turns by one every Riyadh day, so the lead deal and the mix change daily. */
export function todaysDeals(now = new Date()) {
  const daily = offers.filter((o) => o.cycle === "daily");
  const start = dayIndex(now);
  return Array.from({ length: Math.min(DEALS_PER_DAY, daily.length) }, (_, i) => daily[(start + i) % daily.length]);
}
/** The lead deal of today (/offers/today). */
export function todaysDeal(now = new Date()) {
  return todaysDeals(now)[0] ?? null;
}
/** Offers available now: every weekly offer and today's deals. */
export function activeOffers(now = new Date()) {
  return [...offers.filter((o) => o.cycle === "weekly"), ...todaysDeals(now)];
}
export function findOffer(slug: string, now = new Date()) {
  if (slug === "today") return todaysDeal(now);
  return activeOffers(now).find((o) => o.slug === slug) ?? null;
}
/** A private deal by its token: `expired` once past expiresAt (the page then says so instead of showing it). */
export function findDeal(token: string, now = new Date()) {
  const d = deals.find((x) => x.token === token && live(x));
  if (!d) return null;
  return { deal: d, expired: now >= new Date(day(d.expiresAt).getTime() + DAY) };
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
    const o = offers.find((x) => x.slug === id);
    if (o) return `${o.cycle === "daily" ? "صفقة اليوم" : "عرض الأسبوع"}: ${o.title.ar}`;
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
  offersTitle: { ar: "عروض *هذا الأسبوع*", en: "This week's *offers*" } as L,
  weeklyNote: { ar: "تتجدد العروض كل أسبوع — أرسل طلبك قبل انتهاء العداد ليُثبَّت لك السعر.", en: "Offers renew every week — send your request before the countdown ends to lock the price." } as L,
  dayTitle: { ar: "صفقات اليوم", en: "Today's deals" } as L,
  dayNote: { ar: "سعر لا يتكرر — ينتهي عند منتصف الليل بتوقيت الرياض، وغداً صفقة مختلفة.", en: "A one-day price — it ends at midnight Riyadh time, and tomorrow brings a different deal." } as L,
  seeDeal: { ar: "احجز صفقة اليوم", en: "Grab today's deal" } as L,
  notToday: { ar: "هذه الصفقة ليست متاحة اليوم", en: "This deal isn't available today" } as L,
  notTodayText: { ar: "صفقات اليوم تتبدل كل 24 ساعة — شاهد صفقة اليوم الحالية.", en: "Daily deals change every 24 hours — see today's deal." } as L,
  seeToday: { ar: "شاهد صفقة اليوم", en: "See today's deal" } as L,
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
  packagesSub: { ar: "أسعار ثابتة وواضحة، وكل باقة تذكر بالضبط ما تشمله وما لا تشمله — والباقات المتقدمة تُسعَّر حسب نطاق مشروعك.", en: "Clear, fixed prices — every package says exactly what it includes and what it doesn't; Advanced packages are priced to your scope." } as L,
  mostPopular: { ar: "الأكثر طلباً", en: "Most popular" } as L,
  idealFor: { ar: "مناسبة لـ", en: "Best for" } as L,
  notIncluded: { ar: "غير مشمول", en: "Not included" } as L,
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
  shareWa: { ar: "أرسله لشخص على واتساب", en: "Send it to someone on WhatsApp" } as L,
  orderNow: { ar: "اطلب الآن", en: "Order now" } as L,
  orderWa: { ar: "اطلب على واتساب", en: "Order on WhatsApp" } as L,
  waHello: { ar: "مرحباً DMS Tech، أريد طلب:", en: "Hello DMS Tech, I would like to order:" } as L,
  waPrice: { ar: "السعر", en: "Price" } as L,
  howTitle: { ar: "كيف *نبدأ*؟", en: "How do we *start*?" } as L,
  how: [
    { icon: "Send", title: { ar: "أرسل طلبك", en: "Send your request" }, text: { ar: "من النموذج أو على واتساب — يُثبَّت لك السعر فوراً.", en: "Through the form or WhatsApp — your price is locked right away." } },
    { icon: "PhoneCall", title: { ar: "نتواصل معك", en: "We call you" }, text: { ar: "خلال يوم عمل لنفهم نشاطك ونؤكد التفاصيل.", en: "Within a business day to understand your business and confirm details." } },
    { icon: "ClipboardList", title: { ar: "عرض وفاتورة", en: "Quote & invoice" }, text: { ar: "نرسل لك العرض المكتوب والفاتورة الضريبية للدفعة الأولى.", en: "We send the written quote and the tax invoice for the first payment." } },
    { icon: "Rocket", title: { ar: "نبدأ التنفيذ", en: "We start" }, text: { ar: "مدير مشروع يتابع معك حتى التسليم في الموعد المكتوب.", en: "A project manager stays with you until delivery on the written date." } }
  ],
  quickFacts: { ar: "باختصار", en: "At a glance" } as L,
  allOffers: { ar: "كل الباقات والعروض", en: "All packages & offers" } as L,
  ended: { ar: "انتهى هذا العرض", en: "This offer has ended" } as L,
  endedText: { ar: "يسعدنا مساعدتك بعرض جديد يناسب احتياجك.", en: "We'd be happy to prepare a new offer for you." } as L,
  dealFor: { ar: "عرض خاص مقدَّم إلى", en: "A special offer for" } as L,
  dealItems: { ar: "ما يشمله العرض", en: "What's included" } as L,
  dealTotal: { ar: "الإجمالي", en: "Total" } as L,
  dealOnRequest: { ar: "يُحدد السعر بعد مناقشة التفاصيل معكم", en: "Pricing follows a short discussion with you" } as L,
  dealValid: { ar: "صالح حتى", en: "Valid until" } as L,
  heroPoints: [
    { ar: "أسعار معلنة بلا رسوم خفية", en: "Published prices, no hidden fees" },
    { ar: "الدفع على دفعات", en: "Pay in instalments" },
    { ar: "فاتورة ضريبية معتمدة", en: "A ZATCA-compliant tax invoice" },
    { ar: "ملكية كاملة لكل ما نبنيه لك", en: "You fully own everything we build" }
  ],
  pickService: { ar: "اختر خدمتك", en: "Pick your service" } as L,
  startsAt: { ar: "يبدأ من", en: "From" } as L,
  aboutService: { ar: "تعرّف على الخدمة", en: "About this service" } as L,
  todayTile: { ar: "صفقات اليوم", en: "Today's deals" } as L,
  todayTileText: { ar: "4 صفقات تتجدد كل 24 ساعة", en: "4 deals renewed every 24 hours" } as L,
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
    { q: { ar: "كيف أحصل على سعر العرض أو الصفقة؟", en: "How do I get an offer's price?" }, a: { ar: "أرسل الطلب من صفحة العرض قبل انتهاء العداد، ويُثبَّت لك السعر حتى لو بدأنا التنفيذ بعدها.", en: "Send the request from the offer page before the countdown ends and the price is locked, even if work starts later." } },
    { q: { ar: "هل يمكن تعديل الباقة لتناسبني؟", en: "Can a package be tailored to me?" }, a: { ar: "نعم. اطلب عرض سعر مخصص وسنبني لك باقة حسب احتياجك وميزانيتك.", en: "Yes. Ask for a custom quote and we'll build a package around your needs and budget." } },
    { q: { ar: "ماذا يحدث بعد انتهاء الدعم الفني؟", en: "What happens after support ends?" }, a: { ar: "يمكنك الاستمرار معنا بباقة صيانة أو تسويق أو فريق تقني شهري، أو إدارة كل شيء بنفسك — كل شيء باسمك.", en: "Continue with a maintenance, marketing or monthly team plan, or run everything yourself — it's all in your name." } }
  ],
  ctaTitle: { ar: "لم تجد ما يناسبك تماماً؟", en: "Didn't find exactly what you need?" } as L,
  ctaText: { ar: "كلمنا على واتساب أو اطلب عرض سعر مخصص — نرد عليك خلال ساعات العمل.", en: "Message us on WhatsApp or request a custom quote — we reply within working hours." } as L,
  journeyTitle: { ar: "رحلتك معنا: من التأسيس إلى الطلبات… ونكمل", en: "Your journey with us: from founding to orders… and beyond" } as L,
  journeySub: { ar: "كل خطوة لها باقة تغطيها — ابدأ من حيث أنت الآن.", en: "Every step has a package that covers it — start wherever you are." } as L,
  journeyStep: { ar: "الخطوة", en: "Step" } as L,
  prev: { ar: "الصفقة السابقة", en: "Previous deal" } as L,
  next: { ar: "الصفقة التالية", en: "Next deal" } as L,
  vatNote: { ar: "الأسعار قبل ضريبة القيمة المضافة 15%.", en: "Prices exclude 15% VAT." } as L,
  preview: { ar: "مثال للتصميم — يظهر على جهازك فقط", en: "Design example — visible on your machine only" } as L
};
