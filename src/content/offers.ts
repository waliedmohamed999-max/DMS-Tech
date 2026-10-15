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
/** `id`: the tab / link key (#pkg-<id>) · `service`: the service page it belongs to · `segment`: smb = everyday packages,
 * business = company solutions (quote-led). */
export type PackageGroup = { id: string; segment: "smb" | "business"; service: string; icon: IconName; title: L; short: L; text: L; highlights: L[]; notice: L; tiers: Tier[]; journey?: JourneyStep[] };
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
    id: "web-development",
    segment: "smb",
    service: "web-development",
    icon: "CodeXml",
    title: { ar: "باقات المواقع الإلكترونية", en: "Website packages" },
    short: { ar: "المواقع الإلكترونية", en: "Websites" },
    text: { ar: "من موقع تعريفي أنيق لشركتك إلى موقع مؤسسي بتكاملات وصلاحيات.", en: "From an elegant company site to a corporate site with integrations and permissions." },
    highlights: [{ ar: "تصميم مخصص بهويتك يعمل على الجوال", en: "A custom design in your brand that works on mobile" }, { ar: "سرعة وتهيئة لمحركات البحث من اليوم الأول", en: "Speed and SEO from day one" }, { ar: "ملكية كاملة للموقع والكود", en: "Full ownership of the site and code" }],
    notice: { ar: "الأسعار تشمل التصميم والبرمجة والإطلاق. المحتوى (النصوص والصور) يقدمه العميل، ونساعدك في صياغته عند الحاجة.", en: "Prices cover design, development and launch. Content (text and images) comes from the client; we can help write it." },
    tiers: [
      {
        key: "web-starter",
        icon: "Monitor",
        name: { ar: "الانطلاق", en: "Launch" },
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
        key: "landing-page",
        icon: "MousePointerClick",
        name: { ar: "صفحة هبوط", en: "Landing page" },
        tagline: { ar: "صفحة واحدة تحوّل زوار إعلانك إلى طلبات", en: "One page that turns ad visitors into orders" },
        idealFor: { ar: "من يطلق حملة لمنتج أو خدمة أو عرض محدد", en: "Anyone running a campaign for one product, service or offer" },
        price: 1799,
        from: false,
        period: oneTime,
        delivery: { ar: "5 أيام عمل", en: "5 business days" },
        features: [
          { ar: "صفحة واحدة بتصميم مخصص متجاوب مع الجوال", en: "One custom, mobile-first page" },
          { ar: "العرض والمميزات وآراء العملاء والأسئلة", en: "Offer, benefits, testimonials and FAQs" },
          { ar: "زر واتساب ونموذج طلب يصل لبريدك", en: "WhatsApp button and an order form to your inbox" },
          { ar: "بكسل الإعلانات وتحليلات جوجل", en: "Ad pixels and Google Analytics" },
          { ar: "نشرها على نطاقك مع شهادة الأمان", en: "Published on your domain with SSL" }
        ],
        excludes: [
          { ar: "الاستضافة والنطاق إن لم تكن لديك", en: "Hosting and domain if you don't have them" },
          { ar: "إدارة الحملة وميزانية الإعلانات", en: "Campaign management and ad spend" }
        ]
      },
      {
        key: "web-growth",
        icon: "Rocket",
        name: { ar: "الأعمال", en: "Business" },
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
        name: { ar: "المؤسسات", en: "Enterprise" },
        tagline: { ar: "موقع مؤسسي مخصص بتكاملات وصلاحيات", en: "A custom corporate site with integrations and permissions" },
        idealFor: { ar: "الشركات الكبيرة والجهات التي تحتاج تصميماً وتكاملات خاصة", en: "Large companies and entities that need custom design and integrations" },
        price: 9999,
        from: true,
        period: oneTime,
        delivery: { ar: "من 6 أسابيع حسب نطاق المشروع", en: "From 6 weeks, depending on scope" },
        features: [
          { ar: "ورشة متطلبات ووثيقة نطاق متفق عليها", en: "A requirements workshop and an agreed scope" },
          { ar: "تصميم مخصص بالكامل بهوية مؤسستك", en: "A fully custom design in your corporate identity" },
          { ar: "لوحة إدارة بصلاحيات لكل دور", en: "An admin panel with role permissions" },
          { ar: "تكاملات محددة مع أنظمتك (نظام العملاء، الحجوزات، الدفع)", en: "Defined integrations with your systems (CRM, bookings, payments)" },
          { ar: "تحسين متقدم للسرعة ومحركات البحث", en: "Advanced speed and SEO work" },
          { ar: "ملكية كاملة للكود ودعم 6 أشهر", en: "Full code ownership and 6 months of support" }
        ],
        excludes: [
          { ar: "الاستضافة والتراخيص الخارجية", en: "Hosting and third-party licences" },
          { ar: "تطبيقات الجوال (في تطوير الأنظمة والتطبيقات)", en: "Mobile apps (in systems & app development)" }
        ]
      }
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
        name: { ar: "التجارة المتقدمة", en: "Advanced commerce" },
        tagline: { ar: "متجر كبير بخطة إطلاق تسويقية كاملة", en: "A large store with a full launch marketing plan" },
        idealFor: { ar: "المتاجر ذات المبيعات العالية أو الفروع أو التي تبيع خارج المملكة", en: "High-volume stores, multi-branch businesses or cross-border sellers" },
        price: 8999,
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
    id: "digital-marketing",
    segment: "smb",
    service: "digital-marketing",
    icon: "Megaphone",
    title: { ar: "باقات إدارة الحملات الإعلانية", en: "Ad campaign management plans" },
    short: { ar: "الحملات الإعلانية", en: "Ad campaigns" },
    text: { ar: "ندير حملاتك على سناب وتيك توك وميتا وجوجل بخطة واضحة، ونتابعها ونحسّنها بتقارير تقيس النتائج الفعلية.", en: "We run your Snap, TikTok, Meta and Google campaigns with a clear plan, then monitor and improve them with reports on real results." },
    highlights: [
      { ar: "إعداد وإدارة الحملات على المنصات المناسبة لنشاطك", en: "Campaigns set up and run on the platforms that fit your business" },
      { ar: "تصاميم إعلانية واختبار أكثر من إعلان", en: "Ad designs and testing several ads" },
      { ar: "تقارير بالتكلفة والنتائج القابلة للقياس", en: "Reports on cost and measurable results" }
    ],
    notice: { ar: "الأسعار رسوم إدارة قبل الضريبة. الميزانية الإعلانية تُدفع للمنصات من حسابك مباشرة ومنفصلة عن الباقة، ولا نَعِد بعدد مبيعات أو نتائج مضمونة — نَعِد بإدارة احترافية وقياس شفاف.", en: "Prices are management fees before VAT. Ad spend is paid to the platforms from your own account, separately, and we don't promise a guaranteed number of sales — we promise professional management and transparent measurement." },
    tiers: [
      {
        key: "ads-launch",
        icon: "Target",
        name: { ar: "جاهز للإعلان", en: "Ready to advertise" },
        tagline: { ar: "أول حملة لمشروعك: تجهيز وإدارة 14 يوماً", en: "Your first campaign: set-up and 14 days of management" },
        idealFor: { ar: "من يبدأ الإعلان لأول مرة أو يعلن دون قياس واضح", en: "Anyone advertising for the first time, or without clear measurement" },
        price: 1499,
        from: false,
        period: { ar: "لمدة 14 يوماً", en: "for 14 days" },
        delivery: { ar: "التجهيز خلال 3 أيام عمل، ثم 14 يوم إدارة", en: "Set up in 3 business days, then 14 days of management" },
        features: [
          { ar: "مراجعة جاهزية الموقع أو المتجر للإعلان", en: "A readiness review of your site or store" },
          { ar: "إعداد التتبع على المنصة المختارة", en: "Tracking set up on the chosen platform" },
          { ar: "إطلاق حملتين على منصة واحدة", en: "Two campaigns launched on one platform" },
          { ar: "4 مواد إعلانية من محتواك", en: "4 ad creatives from your content" },
          { ar: "إدارة وتحسين 14 يوماً", en: "14 days of management and optimisation" },
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
        idealFor: { ar: "المشاريع التي تبدأ الإعلان لأول مرة", en: "Businesses advertising for the first time" },
        price: 1499,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        features: [
          { ar: "إدارة حملة واحدة على منصة واحدة", en: "One campaign on one platform" },
          { ar: "تصميمان إعلانيان شهرياً", en: "Two ad designs a month" },
          { ar: "إعداد التتبع والتأكد من قياس الطلبات", en: "Tracking set up and order measurement checked" },
          { ar: "متابعة وتحسين أسبوعي", en: "Weekly monitoring and optimisation" },
          { ar: "تقرير شهري بالتكلفة والنتائج", en: "A monthly report on cost and results" }
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
        price: 3499,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        featured: true,
        features: [
          { ar: "إدارة حتى 3 حملات على منصتين", en: "Up to 3 campaigns on two platforms" },
          { ar: "8 مواد إعلانية شهرياً", en: "8 ad creatives a month" },
          { ar: "إعادة استهداف الزوار ومن ترك السلة", en: "Retargeting visitors and abandoned carts" },
          { ar: "تتبع وتحسين دوري للجمهور والإعلانات", en: "Tracking and regular audience / ad optimisation" },
          { ar: "تقرير مفصل شهرياً بالتوصيات", en: "A detailed monthly report with recommendations" }
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
        price: 6999,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "إدارة حتى 6 حملات على 3 منصات", en: "Up to 6 campaigns on 3 platforms" },
          { ar: "16 مادة إعلانية شهرياً", en: "16 ad creatives a month" },
          { ar: "خطة لتحسين نسبة التحويل في متجرك أو موقعك", en: "A conversion-rate improvement plan for your store or site" },
          { ar: "إعلانات جوجل في البحث والتسوق عند الحاجة", en: "Google Search and Shopping ads when needed" },
          { ar: "اجتماعان شهرياً وتقارير مفصلة", en: "Two meetings a month and detailed reports" }
        ],
        excludes: [
          { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
          { ar: "التصوير وأجور المؤثرين", en: "Photography and influencer fees" }
        ]
      }
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
      { ar: "تقويم محتوى شهري بهويتك", en: "A monthly content calendar in your brand" },
      { ar: "تصاميم ونصوص وفيديوهات قصيرة من موادك", en: "Designs, captions and short videos from your material" },
      { ar: "نشر منظم وتقارير شهرية", en: "Organised publishing and monthly reports" }
    ],
    notice: { ar: "المنشورات قطع محتوى فريدة تُعاد صياغتها للمنصات المشمولة، وليست عدداً مستقلاً لكل منصة. التصوير الميداني والتعليق الصوتي المدفوع والممثلون غير مشمولين، ولا نَعِد بعدد متابعين أو وصول محدد.", en: "Posts are unique pieces adapted to the included platforms, not a separate count per platform. On-site filming, paid voice-over and actors are not included, and we don't promise a set number of followers or reach." },
    tiers: [
      {
        key: "social-presence",
        icon: "Share2",
        name: { ar: "الحضور", en: "Presence" },
        tagline: { ar: "حساب نشط واحترافي", en: "One active, professional account" },
        idealFor: { ar: "المشاريع الصغيرة التي تريد حضوراً منتظماً", en: "Small businesses that want a steady presence" },
        price: 1499,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        features: [
          { ar: "8 منشورات شهرياً بالتصميم والكتابة", en: "8 posts a month, designed and written" },
          { ar: "إدارة النشر على حساب واحد", en: "Publishing on one account" },
          { ar: "تقويم محتوى شهري", en: "A monthly content calendar" },
          { ar: "تقرير شهري", en: "A monthly report" }
        ],
        excludes: [
          { ar: "التصوير والفيديو", en: "Filming and video" },
          { ar: "الحملات الإعلانية (في باقات الحملات)", en: "Ad campaigns (in the campaign plans)" }
        ]
      },
      {
        key: "social-engage",
        icon: "MessagesSquare",
        name: { ar: "التفاعل", en: "Engagement" },
        tagline: { ar: "محتوى وفيديو ومتابعة على منصتين", en: "Content, video and community on two platforms" },
        idealFor: { ar: "العلامات التي تريد تفاعلاً أكبر مع جمهورها", en: "Brands that want more engagement with their audience" },
        price: 2999,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
        featured: true,
        features: [
          { ar: "16 منشوراً شهرياً بالتصميم والكتابة", en: "16 posts a month, designed and written" },
          { ar: "4 فيديوهات قصيرة بمونتاج موادك", en: "4 short videos edited from your footage" },
          { ar: "النشر على منصتين", en: "Publishing on two platforms" },
          { ar: "متابعة التعليقات في ساعات عمل متفق عليها", en: "Comment management during agreed working hours" },
          { ar: "تقرير شهري", en: "A monthly report" }
        ],
        excludes: [
          { ar: "التصوير الميداني والتعليق الصوتي المدفوع", en: "On-site filming and paid voice-over" },
          { ar: "الحملات الإعلانية", en: "Ad campaigns" }
        ]
      },
      {
        key: "social-brand",
        icon: "Sparkles",
        name: { ar: "العلامة التجارية", en: "Brand" },
        tagline: { ar: "حضور متكامل على 3 منصات", en: "A complete presence on 3 platforms" },
        idealFor: { ar: "العلامات المتوسعة التي تبني صورتها باستمرار", en: "Growing brands building their image continuously" },
        price: 4999,
        from: false,
        period: perMonth,
        delivery: { ar: "نبدأ خلال 7 أيام عمل", en: "We start within 7 business days" },
        features: [
          { ar: "20 منشوراً شهرياً بالتصميم والكتابة", en: "20 posts a month, designed and written" },
          { ar: "6 فيديوهات قصيرة بمونتاج موادك", en: "6 short videos edited from your footage" },
          { ar: "النشر على 3 منصات", en: "Publishing on 3 platforms" },
          { ar: "تقويم محتوى وتحسين دوري", en: "A content calendar and regular improvement" },
          { ar: "تقارير أداء شهرية", en: "Monthly performance reports" }
        ],
        excludes: [
          { ar: "التصوير الميداني والممثلون والتعليق الصوتي المدفوع", en: "On-site filming, actors and paid voice-over" },
          { ar: "الحملات الإعلانية", en: "Ad campaigns" }
        ]
      }
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
    notice: { ar: "الأسعار اشتراك شهري قبل الضريبة، والحد الأدنى 3 أشهر، والإعداد مشمول. رسوم محادثات ميتا تُدفع حسب الاستخدام الفعلي وباسمك (الرد خلال 24 ساعة من رسالة العميل مجاني ضمن حدود ميتا). اعتماد الحساب وقوالب الرسائل يخضع لموافقة ميتا.", en: "Prices are monthly subscriptions before VAT, minimum 3 months, set-up included. Meta's conversation fees are paid by actual usage in your name (replying within 24 hours of a client's message is free within Meta's limits). Account and template approval is subject to Meta." },
    tiers: [
      {
        key: "wa-basic",
        icon: "MessageSquareMore",
        name: { ar: "الانطلاق", en: "Launch" },
        tagline: { ar: "رقم رسمي منظم وفريق يرد من مكان واحد", en: "An organised official number and a team replying from one place" },
        idealFor: { ar: "الأنشطة التي تنتقل من واتساب الجوال إلى واتساب الأعمال الرسمي", en: "Businesses moving from WhatsApp on a phone to the official business platform" },
        price: 599,
        from: false,
        period: perMonth,
        delivery: { ar: "3 أيام عمل بعد اعتماد ميتا", en: "3 business days after Meta approval" },
        features: [
          { ar: "ربط رقمك بمنصة واتساب للأعمال وتوثيق نشاطك لدى ميتا", en: "Your number on the WhatsApp Business Platform, business verified with Meta" },
          { ar: "صندوق محادثات مشترك حتى مستخدمين اثنين", en: "A shared inbox for up to 2 users" },
          { ar: "قائمة ترحيب آلية بالخدمات والفروع وأوقات العمل", en: "An automated welcome menu with services, branches and hours" },
          { ar: "رد خارج أوقات العمل و20 رداً سريعاً جاهزاً", en: "Out-of-hours replies and 20 ready quick replies" },
          { ar: "تصنيف المحادثات وملاحظات داخلية", en: "Conversation labels and internal notes" },
          { ar: "تقرير شهري بعدد المحادثات وسرعة الرد", en: "A monthly report on conversations and response time" }
        ],
        excludes: [
          { ar: "رسوم محادثات ميتا حسب الاستخدام", en: "Meta conversation fees, by usage" },
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
        from: false,
        period: perMonth,
        delivery: { ar: "7 أيام عمل بعد اعتماد ميتا", en: "7 business days after Meta approval" },
        featured: true,
        features: [
          { ar: "حتى 5 مستخدمين مع توزيع المحادثات على الأقسام", en: "Up to 5 users with routing by department" },
          { ar: "شات بوت بمسارات مصممة لنشاطك: خدمات، أسعار، حجز، طلبات", en: "A chatbot with flows designed for you: services, prices, booking, orders" },
          { ar: "تأهيل العملاء (الاسم، المدينة، الخدمة) وتحويلهم بملخص", en: "Lead qualification (name, city, service) and hand-over with a summary" },
          { ar: "10 قوالب رسائل معتمدة: تأكيد، تذكير، متابعة", en: "10 approved templates: confirmation, reminder, follow-up" },
          { ar: "رسائل جماعية للعملاء الموافقين حتى 2,000 رسالة شهرياً", en: "Broadcasts to opted-in clients, up to 2,000 messages a month" },
          { ar: "ربط مع سلة أو زد أو جداول جوجل", en: "Integration with Salla, Zid or Google Sheets" },
          { ar: "تقارير أداء الفريق والحملات شهرياً", en: "Monthly team and campaign reports" }
        ],
        excludes: [
          { ar: "رسوم محادثات ميتا حسب الاستخدام", en: "Meta conversation fees, by usage" },
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
        from: true,
        period: perMonth,
        delivery: { ar: "بعد تحليل النطاق — عادة 3 إلى 4 أسابيع", en: "After scope analysis — usually 3–4 weeks" },
        features: [
          { ar: "كل مميزات الاحترافية وحتى 15 مستخدماً", en: "Everything in Professional and up to 15 users" },
          { ar: "مساعد ذكاء اصطناعي يجيب من ملفاتك بالعربي والإنجليزي", en: "An AI assistant answering from your files in Arabic and English" },
          { ar: "تكامل مع نظام العملاء أو نظام المبيعات (CRM / ERP)", en: "Integration with your CRM or sales system (CRM / ERP)" },
          { ar: "استرداد السلات المتروكة وإشعارات الطلب والشحن", en: "Abandoned-cart recovery and order / shipping notifications" },
          { ar: "توزيع المحادثات على الفروع والفرق تلقائياً", en: "Automatic routing across branches and teams" },
          { ar: "مدير حساب مخصص ومراجعة شهرية للأداء", en: "A dedicated account manager and monthly performance review" }
        ],
        excludes: [
          { ar: "رسوم محادثات ميتا ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Meta conversation and AI usage fees" },
          { ar: "التكاملات الإضافية تُسعَّر حسب النطاق", en: "Extra integrations priced by scope" }
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
        key: "ai-site-bot",
        icon: "MessagesSquare",
        name: { ar: "مساعد ذكي للموقع", en: "Website AI assistant" },
        tagline: { ar: "يجيب زوار موقعك فوراً من ملفاتك", en: "Answers your site visitors instantly from your files" },
        idealFor: { ar: "الشركات التي يسأل زوار موقعها نفس الأسئلة كثيراً", en: "Companies whose site visitors keep asking the same questions" },
        price: 3999,
        from: false,
        period: oneTime,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
        features: [
          { ar: "مدرَّب على حتى 50 صفحة من ملفاتك وموقعك", en: "Trained on up to 50 pages of your files and site" },
          { ar: "نافذة محادثة بهويتك في كل الصفحات", en: "A branded chat window on every page" },
          { ar: "عربي وإنجليزي", en: "Arabic and English" },
          { ar: "يجمع بيانات المهتمين ويرسلها لفريقك", en: "Collects interested leads for your team" },
          { ar: "مراجعة وتحسين الردود لمدة شهر", en: "A month of review and answer tuning" }
        ],
        excludes: [
          { ar: "رسوم استخدام الذكاء الاصطناعي", en: "AI usage fees" },
          { ar: "واتساب (في باقة «مساعد ذكاء اصطناعي»)", en: "WhatsApp (in the AI assistant package)" }
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
    notice: { ar: "أسعار البداية تُحدَّد نهائياً بعد جلسة تحليل المتطلبات. تطبيقات الآيفون والأندرويد الأصلية، والاستضافة، وتكاليف نماذج الذكاء الاصطناعي غير مشمولة تلقائياً في أسعار البداية.", en: "Starting prices are finalised after a requirements session. Native iOS / Android apps, hosting and AI model costs are not automatically included in starting prices." },
    tiers: [
      {
        key: "ux-ui",
        icon: "PenTool",
        name: { ar: "تصميم واجهات UX/UI", en: "UX/UI design" },
        tagline: { ar: "تصميم فقط — بدون برمجة", en: "Design only — no development" },
        idealFor: { ar: "رواد الأعمال والشركات قبل بدء برمجة تطبيق أو نظام", en: "Founders and companies before building an app or system" },
        price: 2999,
        from: false,
        period: oneTime,
        delivery: { ar: "14 يوم عمل", en: "14 business days" },
        features: [
          { ar: "حتى 15 شاشة ضمن تدفق استخدام واحد متفق عليه", en: "Up to 15 screens within one agreed user flow" },
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
        price: 2999,
        from: false,
        period: oneTime,
        delivery: { ar: "7 أيام عمل", en: "7 business days" },
        features: [
          { ar: "ربط نظامين عبر واجهاتهما البرمجية", en: "Two systems connected through their APIs" },
          { ar: "مزامنة تلقائية في الاتجاهين عند الحاجة", en: "Automatic two-way sync when needed" },
          { ar: "إعادة المحاولة تلقائياً عند انقطاع أي نظام", en: "Automatic retries when a system is down" },
          { ar: "سجل لكل عملية وتنبيه عند الخطأ", en: "A log of every transfer and alerts on errors" },
          { ar: "دعم لمدة شهر", en: "One month of support" }
        ],
        excludes: [
          { ar: "اشتراكات الأنظمة ورسوم واجهاتها", en: "System subscriptions and API fees" },
          { ar: "تطوير أنظمة جديدة", en: "Building new systems" }
        ]
      },
      {
        key: "dashboard",
        icon: "ChartColumn",
        name: { ar: "لوحة تقارير الإدارة", en: "Management dashboard" },
        tagline: { ar: "أرقام شركتك في شاشة واحدة تتحدث وحدها", en: "Your company's numbers on one self-updating screen" },
        idealFor: { ar: "المديرون الذين يريدون قرارات مبنية على أرقام حقيقية", en: "Managers who want decisions based on real numbers" },
        price: 3999,
        from: false,
        period: oneTime,
        delivery: { ar: "10 أيام عمل", en: "10 business days" },
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
        price: 14999,
        from: true,
        period: oneTime,
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
        price: 19999,
        from: true,
        period: oneTime,
        delivery: { ar: "تُحدَّد بعد جلسة التحليل", en: "Set after the analysis session" },
        features: [
          { ar: "لوحات إدارة وأدوار وصلاحيات", en: "Admin dashboards, roles and permissions" },
          { ar: "تكاملات مع أنظمتك (ERP، المحاسبة، نظام العملاء)", en: "Integrations with your systems (ERP, accounting, CRM)" },
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
 * Short, stable links for ads (/offers/<alias>) → the package or offer they open. The form still sends the real key,
 * so the CRM and the e-mail always name the real item.
 */
export const offerAliases: Record<string, string> = {
  "store-marketing": "store-week",
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

export const offers: Offer[] = [
  {
    slug: "store-week",
    cycle: "weekly",
    service: "ecommerce",
    icon: "ShoppingCart",
    badge: { ar: "عرض الأسبوع — متجر وانطلاقة تسويقية", en: "Offer of the week — store + marketing launch" },
    title: { ar: "متجرك + انطلاقة تسويقية: من فكرة متجر إلى إطلاق متكامل", en: "Your store + a marketing launch: from idea to a complete launch" },
    text: { ar: "باقة «الانطلاق» للمتاجر (1,999) مع أول شهر من «البداية» للحملات (1,499) و«الحضور» للسوشيال (1,499) — متجر جاهز وحملة افتتاح ومحتوى إطلاق بسعر واحد بدل 4,997 ريالاً.", en: "The store Launch package (1,999) with a first month of Starter campaigns (1,499) and Presence social (1,499) — a ready store, an opening campaign and launch content at one price instead of SAR 4,997." },
    forWho: { ar: "لأصحاب المشاريع الجديدة والعلامات التي تبيع من إنستغرام أو واتساب وتريد متجراً وإطلاقاً تسويقياً معاً.", en: "For new businesses and brands selling on Instagram or WhatsApp that want a store and a marketing launch together." },
    features: [
      { ar: "متجر على سلة أو زد بهويتك", en: "A Salla or Zid store in your brand" },
      { ar: "رفع حتى 50 منتجاً", en: "Up to 50 products uploaded" },
      { ar: "حملة افتتاح تُدار 14 يوماً", en: "An opening campaign run for 14 days" },
      { ar: "6 تصاميم إعلانية و8 منشورات", en: "6 ad designs and 8 posts" },
      { ar: "جلسة متابعة وتوصيات", en: "A follow-up and recommendations session" }
    ],
    deliverables: [
      { title: { ar: "المتجر", en: "The store" }, text: { ar: "إعداد المتجر على سلة أو زد بقالب متاح مخصص بهويتك، والصفحات والسياسات من بياناتك.", en: "The store set up on Salla or Zid with a theme styled in your brand, pages and policies from your details." } },
      { title: { ar: "المنتجات", en: "Products" }, text: { ar: "رفع حتى 50 منتجاً من بيانات وصور جاهزة.", en: "Up to 50 products from ready data and photos." } },
      { title: { ar: "الدفع والشحن", en: "Payments & shipping" }, text: { ar: "تهيئة وسائل الدفع والشحن المتاحة لحسابك، وزر واتساب وتحليلات أساسية.", en: "Your available payment and shipping options set up, a WhatsApp button and basic analytics." } },
      { title: { ar: "حملة الافتتاح", en: "Opening campaign" }, text: { ar: "إعداد حملة افتتاح على منصة واحدة بـ 6 تصاميم إعلانية وإدارتها 14 يوماً بعد الإطلاق.", en: "An opening campaign on one platform with 6 ad designs, run for 14 days after launch." } },
      { title: { ar: "محتوى الإطلاق", en: "Launch content" }, text: { ar: "8 منشورات سوشيال ميديا بالتصميم والنص.", en: "8 designed and written social posts." } },
      { title: { ar: "المتابعة", en: "Follow-up" }, text: { ar: "جلسة متابعة بعد الإطلاق بالنتائج وتوصيات للتطوير.", en: "A post-launch session with results and recommendations." } }
    ],
    delivery: { ar: "المتجر خلال 10 أيام عمل، ثم 14 يوم إدارة إعلانية", en: "The store in 10 business days, then 14 days of ad management" },
    terms: [
      { ar: "اشتراك سلة أو زد والميزانية الإعلانية على حساب العميل وباسمه", en: "The Salla / Zid subscription and ad spend are the client's, in their name" },
      { ar: "الدفع: 50% عند البدء و50% عند تسليم المتجر", en: "Payment: 50% to start, 50% on store delivery" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "التصوير وكتابة أوصاف المنتجات من الصفر", en: "Photography and writing product descriptions from scratch" },
      { ar: "رسوم المنصة والإنفاق الإعلاني", en: "Platform fees and ad spend" }
    ],
    price: 3999,
    oldPrice: 4997
  },
  {
    slug: "web-week",
    cycle: "weekly",
    service: "web-development",
    icon: "Rocket",
    badge: { ar: "عرض الأسبوع — موقع الأعمال", en: "Offer of the week — business website" },
    title: { ar: "موقع شركتك الاحترافي بالعربي والإنجليزي بـ 4,499 ريالاً", en: "Your professional bilingual company website for SAR 4,499" },
    text: { ar: "باقة «الأعمال» للمواقع (5,999) بسعر الأسبوع: حتى 15 صفحة بالعربية والإنجليزية بتصميم مخصص، ولوحة تحكم، ومدونة وصفحات هبوط، واستضافة ونطاق للسنة الأولى.", en: "The Business website package (5,999) at this week's price: up to 15 custom-designed pages in Arabic and English, a content panel, a blog and landing pages, hosting and domain for year one." },
    forWho: { ar: "للشركات التي تعتمد على موقعها في جلب العملاء والحملات الإعلانية.", en: "For companies that rely on their website for leads and ad campaigns." },
    features: [
      { ar: "حتى 15 صفحة بالعربية والإنجليزية", en: "Up to 15 pages in Arabic and English" },
      { ar: "تصميم مخصص ولوحة تحكم", en: "Custom design and a content panel" },
      { ar: "مدونة و3 صفحات هبوط", en: "A blog and 3 landing pages" },
      { ar: "استضافة ونطاق دوت كوم للسنة الأولى", en: "Hosting and a .com domain for year one" },
      { ar: "دعم فني لمدة 3 أشهر", en: "3 months of support" }
    ],
    deliverables: [
      { title: { ar: "التصميم", en: "Design" }, text: { ar: "تصميم مخصص بهوية شركتك لكل الصفحات، متجاوب مع الجوال.", en: "A custom design in your brand for every page, mobile-first." } },
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "لوحة تحكم لتعديل النصوص والصور والأخبار، ومدونة.", en: "A panel to edit text, images and news, and a blog." } },
      { title: { ar: "الحملات", en: "Campaigns" }, text: { ar: "3 صفحات هبوط للحملات، وبكسل الإعلانات وتحليلات جوجل.", en: "3 campaign landing pages, ad pixels and Google Analytics." } },
      { title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "استضافة سحابية ونطاق دوت كوم للسنة الأولى، وتحسين السرعة ومحركات البحث.", en: "Cloud hosting and a .com domain for year one, speed and SEO work." } }
    ],
    delivery: { ar: "21 يوم عمل", en: "21 business days" },
    terms: [
      { ar: "الدفع: 50% عند البدء و50% عند الإطلاق", en: "Payment: 50% to start, 50% at launch" },
      { ar: "جولتان من التعديلات", en: "Two revision rounds" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "كتابة المحتوى والتصوير", en: "Copywriting and photography" },
      { ar: "تجديد الاستضافة والنطاق بعد السنة الأولى", en: "Hosting and domain renewal after year one" }
    ],
    price: 4499,
    oldPrice: 5999
  },
  {
    slug: "marketing-week",
    cycle: "weekly",
    service: "digital-marketing",
    icon: "ChartLine",
    badge: { ar: "عرض الأسبوع — تسويق متكامل", en: "Offer of the week — full marketing" },
    title: { ar: "أول شهر تسويق متكامل: حملات «النمو» + سوشيال «التفاعل»", en: "Your first full marketing month: Growth campaigns + Engagement social" },
    text: { ar: "باقة «النمو» للحملات (3,499) مع باقة «التفاعل» للسوشيال (2,999) لشهرك الأول بسعر واحد: حتى 3 حملات على منصتين، و16 منشوراً و4 فيديوهات، ومتابعة التعليقات — بدل 6,498 ريالاً.", en: "The Growth campaign plan (3,499) and the Engagement social plan (2,999) for your first month at one price: up to 3 campaigns on two platforms, 16 posts, 4 videos and comment management — instead of SAR 6,498." },
    forWho: { ar: "للمتاجر والشركات التي تريد إعلانات ومحتوى يعملان معاً بخطة واحدة.", en: "For stores and companies that want ads and content working together in one plan." },
    features: [
      { ar: "حتى 3 حملات على منصتين و8 مواد إعلانية", en: "Up to 3 campaigns on two platforms, 8 creatives" },
      { ar: "16 منشوراً و4 فيديوهات قصيرة", en: "16 posts and 4 short videos" },
      { ar: "إعادة استهداف الزوار ومن ترك السلة", en: "Retargeting visitors and abandoned carts" },
      { ar: "متابعة التعليقات في ساعات العمل", en: "Comment management in working hours" },
      { ar: "تقرير مفصل بالتوصيات", en: "A detailed report with recommendations" }
    ],
    deliverables: [
      { title: { ar: "الحملات", en: "Campaigns" }, text: { ar: "إدارة حتى 3 حملات على منصتين بـ 8 مواد إعلانية، مع تتبع وتحسين دوري.", en: "Up to 3 campaigns on two platforms with 8 creatives, tracked and optimised." } },
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "16 منشوراً بالتصميم والكتابة و4 فيديوهات قصيرة بمونتاج موادك، منشورة على منصتين.", en: "16 designed and written posts and 4 short videos from your footage, published on two platforms." } },
      { title: { ar: "التقرير", en: "Report" }, text: { ar: "تقرير شهري مفصل بالنتائج وتوصيات الشهر التالي.", en: "A detailed monthly report with results and next steps." } }
    ],
    delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
    terms: [
      { ar: "السعر للشهر الأول فقط، وبعده تختار الباقات الشهرية بموافقتك — لا تجديد تلقائي", en: "First month only; then you choose the monthly plans — no automatic renewal" },
      { ar: "لا نضمن عدد مبيعات أو متابعين", en: "No guaranteed sales or followers" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "الميزانية الإعلانية ورسوم المنصات", en: "Ad spend and platform fees" },
      { ar: "التصوير الميداني", en: "On-site filming" }
    ],
    price: 4999,
    oldPrice: 6498
  },
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
    badge: { ar: "صفقة اليوم — تجربة التسويق", en: "Deal of the day — try our marketing" },
    title: { ar: "تجربة التسويق لأول شهر: محتوى + حملة إعلانية بـ 1,999 ريالاً", en: "Try our marketing for a month: content + an ad campaign, SAR 1,999" },
    text: { ar: "باقة «البداية» للحملات (1,499) مع باقة «الحضور» للسوشيال (1,499) لشهرك الأول بسعر واحد: خطة تسويق، ومحتوى منتظم، وحملة إعلانية تُدار وتُقاس.", en: "The Starter campaign plan (1,499) and the Presence social plan (1,499) for your first month at one price: a marketing plan, regular content and a managed, measured ad campaign." },
    forWho: { ar: "للمشاريع التي تريد تجربة إدارة التسويق معنا قبل اختيار باقة شهرية.", en: "For businesses that want to try our marketing before choosing a monthly plan." },
    features: [
      { ar: "جلسة تأسيس لخطة التسويق", en: "A marketing plan kick-off session" },
      { ar: "12 منشوراً وفيديوهان قصيران", en: "12 posts and 2 short videos" },
      { ar: "إدارة حملة إعلانية واحدة", en: "One managed ad campaign" }
    ],
    deliverables: [
      { title: { ar: "خطة التسويق", en: "Marketing plan" }, text: { ar: "جلسة لفهم نشاطك وجمهورك وتحديد الرسائل والمنصات المناسبة.", en: "A session on your business and audience to set the right messages and platforms." } },
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "12 منشوراً بالتصميم والنص، وفيديوهان قصيران بمونتاج موادك، وجدولتها على منصتين.", en: "12 designed and written posts, 2 short videos edited from your footage, scheduled on two platforms." } },
      { title: { ar: "الحملة", en: "Campaign" }, text: { ar: "إعداد وإدارة حملة إعلانية واحدة على منصة واحدة مع تتبع النتائج.", en: "One ad campaign set up and run on one platform, with results tracked." } },
      { title: { ar: "التقرير", en: "Report" }, text: { ar: "تقرير نهاية الشهر بالنتائج والتوصيات للشهر التالي.", en: "An end-of-month report with results and recommendations." } }
    ],
    delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
    terms: [
      { ar: "السعر للشهر الأول فقط، وبعده تختار باقة شهرية بموافقتك — لا يوجد تجديد تلقائي", en: "The price is for the first month only; then you choose a monthly plan — no automatic renewal" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "الميزانية الإعلانية (تُدفع للمنصة من حسابك)", en: "Ad spend (paid to the platform from your account)" },
      { ar: "التصوير الميداني", en: "On-site filming" }
    ],
    price: 1999,
    oldPrice: 2998
  },
  {
    slug: "day-whatsapp",
    cycle: "daily",
    service: "whatsapp-automation",
    icon: "Bot",
    badge: { ar: "صفقة اليوم — واتساب للأعمال", en: "Deal of the day — WhatsApp for business" },
    title: { ar: "واتساب الاحترافي 3 أشهر بـ 2,499 ريالاً بدل 3,897: بوت يرد ويؤهل ويوزع على فريقك", en: "WhatsApp Professional, 3 months for SAR 2,499 instead of 3,897: a bot that answers, qualifies and routes" },
    text: { ar: "باقة «الاحترافية» (1,299 شهرياً) لمدة 3 أشهر بسعر اليوم: رقمك الرسمي، ومسارات محادثة مصممة لنشاطك، وتأهيل العملاء وتحويل الجادّين للموظف المناسب، وصندوق محادثات مشترك لفريقك.", en: "The Professional plan (1,299/month) for 3 months at today's price: your official number, conversation flows designed for your business, lead qualification and hand-over to the right person, and a shared inbox for your team." },
    forWho: { ar: "للعيادات والمتاجر والشركات العقارية والخدمية التي تصلها رسائل كثيرة ولا تستطيع الرد عليها كلها بسرعة.", en: "For clinics, stores, real-estate and service companies with more messages than they can answer quickly." },
    features: [
      { ar: "مسارات محادثة مصممة لنشاطك", en: "Conversation flows designed for your business" },
      { ar: "تأهيل العملاء وتحويلهم لفريقك", en: "Lead qualification and hand-over to your team" },
      { ar: "حتى 5 موظفين ورسائل جماعية للعملاء", en: "Up to 5 staff and broadcasts to clients" }
    ],
    deliverables: [
      { title: { ar: "الرقم الرسمي", en: "Official number" }, text: { ar: "ربط رقمك بمنصة واتساب للأعمال وتوثيق نشاطك لدى ميتا.", en: "Your number on the WhatsApp Business Platform with your business verified by Meta." } },
      { title: { ar: "مسارات المحادثة", en: "Conversation flows" }, text: { ar: "قائمة خدمات أو منتجات، وأسئلة متكررة، وحجز أو طلب، بالعربي والإنجليزي.", en: "A service or product menu, FAQs and booking or ordering, in Arabic and English." } },
      { title: { ar: "التأهيل والتحويل", en: "Qualification & hand-over" }, text: { ar: "يسأل عن الاسم والمدينة والخدمة، ثم يحوّل المحادثة للموظف المناسب مع ملخص.", en: "Asks for name, city and service, then hands the chat to the right person with a summary." } },
      { title: { ar: "الفريق والتقارير", en: "Team & reports" }, text: { ar: "صندوق مشترك حتى 5 موظفين، و10 قوالب رسائل، ورسائل جماعية حتى 2,000 شهرياً، وربط مع سلة أو زد، وتقرير شهري.", en: "A shared inbox for up to 5 staff, 10 templates, broadcasts up to 2,000 a month, Salla / Zid integration and a monthly report." } }
    ],
    delivery: { ar: "5 أيام عمل بعد اعتماد ميتا لحسابك", en: "5 business days after Meta approves your account" },
    terms: [
      { ar: "الدفع مقدماً عن الأشهر الثلاثة، وبعدها بسعر الباقة (1,299 شهرياً) أو الإلغاء بلا التزام", en: "The three months are paid upfront; then the plan price (1,299/month) or cancel with no commitment" },
      { ar: "اعتماد الحساب وقوالب الرسائل يخضع لموافقة ميتا", en: "Account and template approval is subject to Meta" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "رسوم رسائل ميتا حسب الاستخدام", en: "Meta message fees, billed by usage" }],
    price: 2499,
    oldPrice: 3897
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
    slug: "day-social",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Share2",
    badge: { ar: "صفقة اليوم — سوشيال ميديا", en: "Deal of the day — social media" },
    title: { ar: "أول شهر من باقة «التفاعل» للسوشيال ميديا بـ 1,999 ريالاً", en: "Your first Engagement social media month, SAR 1,999" },
    text: { ar: "باقة «التفاعل» (2,999) لشهرك الأول بسعر اليوم: 16 منشوراً بالتصميم والكتابة، و4 فيديوهات قصيرة من موادك، ونشر منظم على منصتين مع متابعة التعليقات.", en: "The Engagement plan (2,999) for your first month at today's price: 16 designed and written posts, 4 short videos from your footage and organised publishing on two platforms with comment management." },
    forWho: { ar: "للعلامات التي تريد حضوراً احترافياً وتفاعلاً أكبر دون أن تشغل نفسها بالتصميم والنشر.", en: "For brands that want a professional presence and more engagement without handling design and publishing." },
    features: [
      { ar: "16 منشوراً بالتصميم والكتابة", en: "16 designed and written posts" },
      { ar: "4 فيديوهات قصيرة بمونتاج موادك", en: "4 short videos edited from your footage" },
      { ar: "النشر على منصتين ومتابعة التعليقات", en: "Publishing on two platforms with comment management" }
    ],
    deliverables: [
      { title: { ar: "خطة المحتوى", en: "Content plan" }, text: { ar: "تقويم شهري بالأفكار والمواعيد المناسبة لجمهورك.", en: "A monthly calendar of ideas and the right times for your audience." } },
      { title: { ar: "التصاميم والنصوص", en: "Designs & captions" }, text: { ar: "16 منشوراً بهويتك مع نص تسويقي لكل منشور.", en: "16 posts in your brand with a caption for each." } },
      { title: { ar: "الفيديو", en: "Video" }, text: { ar: "4 فيديوهات قصيرة بمونتاج موادك المصورة.", en: "4 short videos edited from your footage." } },
      { title: { ar: "النشر والمتابعة", en: "Publishing & community" }, text: { ar: "نشر منظم على منصتين ومتابعة التعليقات في ساعات العمل المتفق عليها، وتقرير شهري.", en: "Organised publishing on two platforms, comment management in agreed hours and a monthly report." } }
    ],
    delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
    terms: [
      { ar: "السعر للشهر الأول فقط، وبعده تستمر بسعر الباقة (2,999) أو تتوقف", en: "First month only; then the plan price (2,999) or stop" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "التصوير الميداني والتعليق الصوتي المدفوع", en: "On-site filming and paid voice-over" },
      { ar: "الحملات الإعلانية", en: "Ad campaigns" }
    ],
    price: 1999,
    oldPrice: 2999
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
    slug: "day-ads",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Target",
    badge: { ar: "صفقة اليوم — أول حملة إعلانية", en: "Deal of the day — your first campaign" },
    title: { ar: "«جاهز للإعلان» بـ 999 ريالاً: تجهيز وإدارة حملتك 14 يوماً", en: "Ready to advertise for SAR 999: set-up and 14 days of management" },
    text: { ar: "باقة «جاهز للإعلان» (1,499) بسعر اليوم: نراجع جاهزية موقعك، ونجهز التتبع، ونطلق حملتين على منصة واحدة وندير ونحسّن أداءهما 14 يوماً.", en: "The Ready-to-advertise package (1,499) at today's price: readiness review, tracking, two campaigns on one platform, run and optimised for 14 days." },
    forWho: { ar: "لمن يبدأ الإعلان لأول مرة أو يعلن دون قياس واضح للنتائج.", en: "For anyone advertising for the first time, or without clear measurement." },
    features: [
      { ar: "حملتان على منصة واحدة", en: "Two campaigns on one platform" },
      { ar: "4 مواد إعلانية من محتواك", en: "4 creatives from your content" },
      { ar: "إدارة 14 يوماً وتقرير ختامي", en: "14 days of management and a final report" }
    ],
    deliverables: [
      { title: { ar: "الجاهزية والتتبع", en: "Readiness & tracking" }, text: { ar: "مراجعة صفحاتك وطريقة الطلب، وإعداد التتبع على المنصة المختارة.", en: "A review of your pages and ordering flow, and tracking on the chosen platform." } },
      { title: { ar: "الحملات", en: "Campaigns" }, text: { ar: "إطلاق حملتين بـ 4 مواد إعلانية من محتواك.", en: "Two campaigns launched with 4 creatives from your content." } },
      { title: { ar: "الإدارة والتقرير", en: "Management & report" }, text: { ar: "متابعة وتحسين 14 يوماً، ثم تقرير بالتكلفة والنتائج القابلة للقياس.", en: "14 days of optimisation, then a report on cost and measurable results." } }
    ],
    delivery: { ar: "التجهيز خلال 3 أيام عمل، ثم 14 يوم إدارة", en: "Set up in 3 business days, then 14 days of management" },
    terms: [
      { ar: "منصة إعلانية واحدة يختارها العميل", en: "One ad platform of the client's choice" },
      { ar: "لا نضمن عدد مبيعات — النتائج تعتمد على المنتج والسوق والميزانية", en: "No guaranteed sales — results depend on product, market and budget" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "ميزانية الإعلانات", en: "Ad spend" },
      { ar: "التصوير وصفحات الهبوط الجديدة", en: "Photography and new landing pages" }
    ],
    price: 999,
    oldPrice: 1499
  },
  {
    slug: "day-store-growth",
    cycle: "daily",
    service: "ecommerce",
    icon: "TrendingUp",
    badge: { ar: "صفقة اليوم — متجر بهويتك", en: "Deal of the day — a branded store" },
    title: { ar: "باقة «النمو» للمتاجر بـ 3,299 ريالاً بدل 4,499", en: "The store Growth package for SAR 3,299 instead of 4,499" },
    text: { ar: "متجر بتصميم مخصص لهويتك وحتى 100 منتج، مع البكسل والكتالوج وتجهيز حملة الافتتاح — باقة «النمو» كاملة بسعر اليوم.", en: "A store custom-designed in your brand with up to 100 products, pixels, catalogue and the opening campaign set up — the full Growth package at today's price." },
    forWho: { ar: "للعلامات التي تريد متجراً مميزاً جاهزاً للإعلان على السوشيال ميديا.", en: "For brands that want a distinctive store ready for social media ads." },
    features: [
      { ar: "تصميم مخصص وحتى 100 منتج", en: "Custom design and up to 100 products" },
      { ar: "بكسل وكتالوج وحسابات إعلانية", en: "Pixels, catalogue and ad accounts" },
      { ar: "10 تصاميم إطلاق وتدريب فريقك", en: "10 launch designs and team training" }
    ],
    deliverables: [
      { title: { ar: "المتجر", en: "The store" }, text: { ar: "تصميم مخصص للرئيسية وصفحة المنتج، ورفع حتى 100 منتج بالخيارات والتصنيفات.", en: "A custom home and product page, up to 100 products with options and categories." } },
      { title: { ar: "الدفع والشحن", en: "Payments & shipping" }, text: { ar: "ربط الدفع والشحن والدفع عند الاستلام.", en: "Payments, shipping and cash on delivery connected." } },
      { title: { ar: "الجاهزية للإعلان", en: "Ready for ads" }, text: { ar: "بكسل سناب وتيك توك وميتا، وربط الكتالوج، وتجهيز الحسابات الإعلانية وحملة الافتتاح.", en: "Snap, TikTok and Meta pixels, catalogue sync, ad accounts and the opening campaign set up." } }
    ],
    delivery: { ar: "10 أيام عمل", en: "10 business days" },
    terms: [
      { ar: "اشتراك المنصة على حساب العميل وباسمه", en: "The platform subscription is the client's, in their name" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [
      { ar: "اشتراك المنصة ورسوم الدفع والشحن", en: "Platform subscription, payment and shipping fees" },
      { ar: "ميزانية الإعلانات", en: "Ad spend" }
    ],
    price: 3299,
    oldPrice: 4499
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
  title: { ar: "حلول تقنية وتسويقية *تساعد أعمالك تنمو*", en: "Tech and marketing solutions *that help your business grow*" } as L,
  sub: { ar: "مواقع ومتاجر إلكترونية، تسويق رقمي، ذكاء اصطناعي وأتمتة أعمال. اختر الحل المناسب لمرحلة مشروعك بخدمات واضحة وأسعار شفافة.", en: "Websites and online stores, digital marketing, AI and business automation. Choose the solution that fits your stage, with clear services and transparent prices." } as L,
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
  mostPopular: { ar: "الباقة المقترحة", en: "Recommended" } as L,
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
    { ar: "جميع الأسعار قبل ضريبة القيمة المضافة 15%، وتصدر لكل دفعة فاتورة ضريبية.", en: "All prices exclude 15% VAT, and every payment gets a tax invoice." },
    { ar: "الاشتراكات الخارجية (المنصات، الإعلانات، رسائل ميتا، استخدام الذكاء الاصطناعي) تُدفع باسم العميل وعلى حسابه.", en: "External subscriptions (platforms, ads, Meta messages, AI usage) are paid by the client, in the client's name." },
    { ar: "تبدأ مدة التنفيذ بعد استلام المحتوى والصلاحيات المطلوبة واعتماد النطاق.", en: "Delivery time starts after we receive the content and access we need and the scope is approved." },
    { ar: "نطاق كل باقة مكتوب، وأي إضافة خارجه تُسعَّر منفصلة بعد موافقتك.", en: "Every package has a written scope; anything outside it is priced separately after your approval." },
    { ar: "لا نضمن عدد مبيعات أو متابعين أو ترتيباً محدداً في محركات البحث — نلتزم بجودة التنفيذ والقياس الشفاف.", en: "We don't guarantee a number of sales, followers or a search ranking — we commit to quality work and transparent measurement." },
    { ar: "تنتقل لك ملكية الأعمال والحسابات بالكامل عند سداد المستحقات.", en: "Full ownership of the work and accounts passes to you once payments are settled." }
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
