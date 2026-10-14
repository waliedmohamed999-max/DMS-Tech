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
export type PackageGroup = { service: string; icon: IconName; title: L; text: L; notice: L; tiers: Tier[]; journey?: JourneyStep[] };
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
    text: { ar: "من موقع تعريفي أنيق إلى نظام أو تطبيق متكامل.", en: "From an elegant company site to a complete system or app." },
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
          { ar: "شهادة SSL وتهيئة أساسية لمحركات البحث", en: "SSL and basic search engine set-up" },
          { ar: "جولة تعديلات واحدة على التصميم", en: "One round of design revisions" },
          { ar: "دعم فني شهر بعد الإطلاق", en: "One month of support after launch" }
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
          { ar: "مدونة و3 صفحات هبوط للحملات الإعلانية", en: "A blog and 3 landing pages for ad campaigns" },
          { ar: "تحسين السرعة وتهيئة متقدمة لمحركات البحث", en: "Speed optimisation and advanced SEO set-up" },
          { ar: "ربط Google Analytics وبكسل الإعلانات", en: "Google Analytics and ad pixels connected" },
          { ar: "استضافة سحابية ونطاق .com للسنة الأولى", en: "Cloud hosting and a .com domain for the first year" },
          { ar: "جولتا تعديلات ودعم فني 3 أشهر", en: "Two revision rounds and 3 months of support" }
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
          { ar: "تطبيق جوال iOS و Android عند الحاجة", en: "iOS and Android app when needed" },
          { ar: "تكاملات مع أنظمتك (محاسبة، CRM، بوابات دفع) عبر API", en: "Integrations with your systems (accounting, CRM, payments) via API" },
          { ar: "لوحات تقارير ومؤشرات للإدارة", en: "Reports and KPI dashboards for management" },
          { ar: "ملكية كاملة للكود وتسليم موثق", en: "Full code ownership and documented hand-over" },
          { ar: "دعم وصيانة 6 أشهر", en: "6 months of support and maintenance" }
        ],
        excludes: [
          { ar: "رسوم الخوادم ومتاجر التطبيقات (Apple / Google)", en: "Server costs and app store fees (Apple / Google)" },
          { ar: "تراخيص الأنظمة والخدمات الخارجية", en: "Third-party licences and services" }
        ]
      }
    ]
  },
  {
    service: "ecommerce",
    icon: "ShoppingCart",
    title: { ar: "باقات المتاجر الإلكترونية", en: "Online store packages" },
    text: { ar: "متجر جاهز للبيع والإعلان على زد أو سلة أو شوبيفاي — من التأسيس حتى أول طلب، ثم نكمل معك التسويق شهرياً.", en: "A store ready to sell and advertise on Zid, Salla or Shopify — from founding to the first order, then monthly marketing with you." },
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
          { ar: "تركيب بكسل سناب وتيك توك وميتا وتحليلات Google", en: "Snap, TikTok and Meta pixels plus Google Analytics installed" },
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
          { ar: "بكسل سناب وتيك توك وميتا مع تتبع الإضافة للسلة والشراء، و Google Analytics", en: "Snap, TikTok and Meta pixels tracking add-to-cart and purchases, plus Google Analytics" },
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
          { ar: "بكسل كل المنصات مع تتبع دقيق من الخادم (Conversions API) و Google Merchant Center", en: "Pixels on every platform with server-side tracking (Conversions API) and Google Merchant Center for Shopping" },
          { ar: "خطة تسويق إطلاق 90 يوماً وإدارة الحملات أول شهر على كل المنصات", en: "A 90-day launch marketing plan and first-month campaign management on every platform" },
          { ar: "استرداد السلات المتروكة برسائل واتساب تلقائية", en: "Automatic WhatsApp abandoned-cart recovery" },
          { ar: "متعدد اللغات والعملات عند البيع خارج المملكة", en: "Multi-language and multi-currency for selling abroad" },
          { ar: "تقارير مبيعات شهرية ودعم بأولوية 3 أشهر", en: "Monthly sales reports and 3 months of priority support" }
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
    text: { ar: "بعد الإطلاق نكمل معك: حملات إعلانية وسوشيال ميديا ونتائج تُقاس بالطلبات، لا بالإعجابات.", en: "After launch we keep going with you: ad campaigns and social media, measured in orders — not likes." },
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
          { ar: "إعلانات Google بحث وتسوق (Shopping)", en: "Google Search and Shopping ads" },
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
    text: { ar: "رد أسرع ومبيعات أكثر على القناة التي يفضلها عملاؤك.", en: "Faster replies and more sales on your clients' favourite channel." },
    notice: { ar: "اشتراك شهري بلا عقد طويل، والإعداد مجاني. رسوم الرسائل التي تتقاضاها Meta تُحتسب حسب استخدامك الفعلي، والرد على العميل خلال 24 ساعة من رسالته مجاني ضمن الحدود التي تحددها Meta.", en: "A monthly subscription with no long contract, and free set-up. Meta's own message fees follow your actual usage; replying within 24 hours of a client's message is free within Meta's limits." },
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
          { ar: "ربط رقمك بواتساب للأعمال الرسمي (WhatsApp API)", en: "Your number on the official WhatsApp Business Platform" },
          { ar: "مستخدم واحد", en: "One user" },
          { ar: "رسالة ترحيب ورد خارج أوقات العمل", en: "Welcome and out-of-hours messages" },
          { ar: "10 ردود سريعة جاهزة للأسئلة المتكررة", en: "10 ready quick replies for frequent questions" },
          { ar: "دعم فني عبر واتساب", en: "Support on WhatsApp" }
        ],
        excludes: [
          { ar: "رسوم رسائل Meta حسب الاستخدام", en: "Meta message fees, by usage" },
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
          { ar: "5 قوالب رسائل معتمدة من Meta", en: "5 Meta-approved message templates" },
          { ar: "تعيين المحادثات والملاحظات الداخلية", en: "Conversation assignment and internal notes" },
          { ar: "تقرير شهري بعدد المحادثات وسرعة الرد", en: "A monthly report on conversations and response time" }
        ],
        excludes: [
          { ar: "رسوم رسائل Meta حسب الاستخدام", en: "Meta message fees, by usage" },
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
        excludes: [{ ar: "رسوم رسائل Meta حسب الاستخدام", en: "Meta message fees, by usage" }]
      }
    ]
  },
  {
    service: "dedicated-tech-team",
    icon: "Users",
    title: { ar: "باقات الفريق التقني المتكامل", en: "Dedicated tech team plans" },
    text: { ar: "فريق تقني يعمل لشركتك شهرياً بدون أعباء التوظيف.", en: "A tech team working for your company every month, without the hiring burden." },
    notice: { ar: "الفريق في كل الباقات: مطور Full-Stack، مصمم UI/UX، ومدير مشروع — 120 ساعة عمل شهرياً توزَّع حسب أولوياتك. الفرق بين الباقات في مدة الالتزام والسعر الشهري والمزايا الإضافية.", en: "Every plan: a Full-Stack developer, a UI/UX designer and a project manager — 120 working hours a month, allocated to your priorities. Plans differ in term, monthly price and extras." },
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
    slug: "store-week",
    cycle: "weekly",
    service: "ecommerce",
    icon: "ShoppingCart",
    badge: { ar: "عرض الأسبوع — من الصفر لأول طلب", en: "Offer of the week — from zero to first order" },
    title: { ar: "متجرك جاهز للبيع + أول شهر تسويق", en: "Your store, ready to sell + your first marketing month" },
    text: { ar: "باقة النمو الكاملة مع أول شهر تسويق: متجر بهويتك، البكسل والكتالوج مربوطين، حملة الافتتاح وتصاميمها، ثم شهر كامل من إدارة الحملات والسوشيال ميديا حتى تصلك الطلبات.", en: "The full Growth package plus your first marketing month: a store in your brand, pixels and catalogue connected, the opening campaign and its designs, then a full month of campaign and social media management until orders come in." },
    forWho: { ar: "لأصحاب المشاريع الذين يبدؤون من الصفر ويريدون جهة واحدة تأخذهم من تأسيس المتجر حتى أول الطلبات.", en: "For business owners starting from zero who want one partner to take them from founding the store to the first orders." },
    features: [
      { ar: "كل مميزات باقة النمو للمتاجر", en: "Everything in the store Growth package" },
      { ar: "أول شهر من باقة تسويق «البداية»", en: "The first month of the Marketing Starter plan" },
      { ar: "بكسل + كتالوج + حملة الافتتاح", en: "Pixels + catalogue + opening campaign" },
      { ar: "شهر دعم فني إضافي مجاناً", en: "An extra month of support, free" }
    ],
    deliverables: [
      { title: { ar: "المتجر", en: "The store" }, text: { ar: "تصميم مخصص بهويتك، رفع حتى 100 منتج بالخيارات، وربط الدفع والشحن والدفع عند الاستلام.", en: "A custom design in your brand, up to 100 products with options, payments, shipping and cash on delivery connected." } },
      { title: { ar: "التتبع", en: "Tracking" }, text: { ar: "بكسل سناب وتيك توك وميتا وتحليلات Google، وربط كتالوج المنتجات بإنستغرام وتيك توك وسناب.", en: "Snap, TikTok and Meta pixels plus Google Analytics, and the product catalogue synced to Instagram, TikTok and Snap." } },
      { title: { ar: "الإطلاق", en: "Launch" }, text: { ar: "10 تصاميم افتتاح، كوبونات الخصم الأولى، وتجهيز الحسابات الإعلانية وإطلاق حملة الافتتاح.", en: "10 opening designs, the first discount coupons, ad accounts set up and the opening campaign launched." } },
      { title: { ar: "أول شهر تسويق", en: "First marketing month" }, text: { ar: "إدارة حسابين و12 منشوراً وحملة إعلانية بتحسين أسبوعي وتقرير بالطلبات وتكلفة الطلب.", en: "Two accounts, 12 posts and an ad campaign with weekly optimisation, plus a report on orders and cost per order." } },
      { title: { ar: "واتساب", en: "WhatsApp" }, text: { ar: "زر واتساب في المتجر وإشعار بكل طلب جديد على رقمك.", en: "A WhatsApp button in the store and an alert for every new order." } },
      { title: { ar: "التدريب", en: "Training" }, text: { ar: "جلسة أونلاين لفريقك على الطلبات والمنتجات والكوبونات وقراءة التقارير.", en: "An online session for your team on orders, products, coupons and reading reports." } }
    ],
    delivery: { ar: "المتجر خلال 10 أيام عمل، ثم يبدأ شهر التسويق مباشرة", en: "The store in 10 business days, then the marketing month starts right away" },
    terms: [
      { ar: "اشتراك منصة زد أو سلة وميزانية الإعلانات على حساب العميل وباسمه", en: "The Zid or Salla subscription and the ad budget are in the client's name and paid by the client" },
      { ar: "الدفع: 50% عند البدء و50% عند تسليم المتجر", en: "Payment: 50% to start, 50% on store delivery" },
      { ar: "بعد الشهر الأول تستمر باقة التسويق بسعرها المعتاد أو تتوقف بلا التزام", en: "After the first month the marketing plan continues at its normal price, or stops with no commitment" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "تصوير المنتجات", en: "Product photography" },
      { ar: "رسوم بوابات الدفع وشركات الشحن", en: "Payment gateway and shipping fees" }
    ],
    price: 3999,
    oldPrice: 5998
  },
  {
    slug: "whatsapp-week",
    cycle: "weekly",
    service: "whatsapp-automation",
    icon: "MessagesSquare",
    badge: { ar: "عرض الأسبوع — 3 أشهر بسعر شهرين", en: "This week — 3 months for 2" },
    title: { ar: "واتساب الاحترافي: بوت يرد على عملائك 24 ساعة", en: "WhatsApp Professional: a bot that answers your clients 24/7" },
    text: { ar: "جرّب الباقة الاحترافية 3 أشهر وادفع شهرين: شات بوت يرد ويؤهل العملاء ويحوّل الجادّين لفريقك، مع صندوق محادثات مشترك على رقمك الرسمي.", en: "Try Professional for 3 months and pay for 2: a chatbot that answers, qualifies clients and hands the serious ones to your team, with a shared inbox on your official number." },
    forWho: { ar: "للعيادات والصالونات والمتاجر والشركات التي تصلها رسائل كثيرة على واتساب ولا تستطيع الرد عليها كلها بسرعة.", en: "For clinics, salons, stores and companies that get many WhatsApp messages and can't answer them all quickly." },
    features: [
      { ar: "الباقة الاحترافية لمدة 3 أشهر", en: "Professional for 3 months" },
      { ar: "الإعداد والربط بالرقم الرسمي مجاناً", en: "Free set-up on your official number" },
      { ar: "تصميم أول تدفق شات بوت لنشاطك", en: "Your first chatbot flow designed for you" }
    ],
    deliverables: [
      { title: { ar: "الرقم الرسمي", en: "Official number" }, text: { ar: "ربط رقمك على WhatsApp Business Platform والتحقق من اسم نشاطك.", en: "Your number on the WhatsApp Business Platform with your business name verified." } },
      { title: { ar: "شات بوت", en: "Chatbot" }, text: { ar: "تدفق رد آلي مصمم لنشاطك: ترحيب، قائمة خدمات، أسئلة متكررة، وتحويل للموظف المناسب.", en: "An auto-reply flow designed for your business: welcome, service menu, FAQs and hand-over to the right person." } },
      { title: { ar: "صندوق محادثات", en: "Shared inbox" }, text: { ar: "صندوق واحد لفريقك حتى 3 موظفين، مع تعيين المحادثات والملاحظات الداخلية.", en: "One inbox for up to 3 team members, with assignment and internal notes." } },
      { title: { ar: "قوالب الرسائل", en: "Message templates" }, text: { ar: "إعداد واعتماد 3 قوالب رسائل من Meta (ترحيب، تذكير، متابعة).", en: "Three Meta-approved templates set up (welcome, reminder, follow-up)." } }
    ],
    delivery: { ar: "5 أيام عمل بعد اعتماد Meta لحسابك", en: "5 business days after Meta approves your account" },
    terms: [
      { ar: "الدفع مقدماً عن الأشهر الثلاثة", en: "The three months are paid upfront" },
      { ar: "بعد الأشهر الثلاثة يتجدد الاشتراك بسعر الباقة العادي أو يُلغى بلا التزام", en: "After three months it renews at the normal price or can be cancelled with no commitment" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "رسوم رسائل Meta حسب الاستخدام", en: "Meta message fees, billed by usage" },
      { ar: "الحملات التسويقية الجماعية (متاحة في الباقة المتقدمة)", en: "Bulk marketing campaigns (in the Advanced package)" }
    ],
    price: 998,
    oldPrice: 1497
  },
  {
    slug: "launch-bundle-week",
    cycle: "weekly",
    service: "web-development",
    icon: "Rocket",
    badge: { ar: "صفقة الأسبوع", en: "Bundle of the week" },
    title: { ar: "صفقة الانطلاق الرقمي: موقع + متجر + واتساب", en: "Digital launch bundle: website + store + WhatsApp" },
    text: { ar: "كل ما تحتاجه شركتك لتبدأ البيع أونلاين في صفقة واحدة ومدير مشروع واحد: موقع شركة احترافي، متجر جاهز، وواتساب يرد على عملائك 3 أشهر.", en: "Everything your business needs to sell online, in one deal with one project manager: a professional company website, a ready store and WhatsApp answering your clients for 3 months." },
    forWho: { ar: "للشركات الجديدة أو التي تبدأ حضورها الرقمي من الصفر وتريد كل شيء مرتبطاً ببعضه من البداية.", en: "For new companies, or companies starting their online presence from scratch, that want everything connected from day one." },
    features: [
      { ar: "موقع الشركة — الباقة الاحترافية", en: "Company website — Professional" },
      { ar: "متجر إلكتروني — باقة الانطلاق", en: "Online store — Launch" },
      { ar: "واتساب الأساسية — 3 أشهر", en: "WhatsApp Basic — 3 months" }
    ],
    deliverables: [
      { title: { ar: "موقع الشركة", en: "Company website" }, text: { ar: "حتى 15 صفحة بالعربية والإنجليزية، لوحة تحكم لتعديل المحتوى، مدونة، وتهيئة لمحركات البحث.", en: "Up to 15 pages in Arabic and English, a content panel, a blog and SEO set-up." } },
      { title: { ar: "المتجر", en: "Store" }, text: { ar: "متجر على زد أو سلة مع رفع حتى 30 منتجاً وربط الدفع والشحن.", en: "A Zid or Salla store with up to 30 products, payments and shipping connected." } },
      { title: { ar: "واتساب", en: "WhatsApp" }, text: { ar: "رقمك الرسمي مع رسالة ترحيب ورد آلي وردود سريعة لمدة 3 أشهر.", en: "Your official number with a welcome message, auto-reply and quick replies for 3 months." } },
      { title: { ar: "مدير مشروع", en: "Project manager" }, text: { ar: "شخص واحد يتابع معك كل الأعمال وجدولها حتى التسليم.", en: "One person who runs everything with you until delivery." } }
    ],
    delivery: { ar: "25 يوم عمل للموقع والمتجر معاً", en: "25 business days for the website and store together" },
    terms: [
      { ar: "الدفع: 40% عند البدء، 40% عند تسليم التصميم، 20% عند الإطلاق", en: "Payment: 40% to start, 40% on design sign-off, 20% at launch" },
      { ar: "النطاق والاستضافة سنة كاملة على حساب العميل وباسمه", en: "Domain and one year of hosting in the client's name, paid by the client" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل انتهاء العداد", en: "The price is locked for requests sent before the countdown ends" }
    ],
    excludes: [
      { ar: "اشتراك منصة المتجر ورسوم رسائل Meta", en: "The store platform subscription and Meta message fees" },
      { ar: "التصوير وكتابة المحتوى", en: "Photography and copywriting" }
    ],
    price: 6499,
    oldPrice: 8595
  },
  {
    slug: "day-website",
    cycle: "daily",
    service: "web-development",
    icon: "Monitor",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "موقع تعريفي لشركتك بـ 1,799 ريال", en: "A company website for SAR 1,799" },
    text: { ar: "الباقة الأساسية كاملة بأقل سعر: موقع أنيق حتى 5 صفحات، متجاوب مع الجوال، بنموذج تواصل وزر واتساب — جاهز خلال أسبوع.", en: "The full Starter package at the lowest price: an elegant site of up to 5 pages, mobile-ready, with a contact form and WhatsApp button — ready in a week." },
    forWho: { ar: "للشركات الصغيرة والمهنيين (مكاتب، عيادات، مقاولين) الذين يحتاجون حضوراً احترافياً بسرعة.", en: "For small companies and professionals (offices, clinics, contractors) who need a professional presence fast." },
    features: [
      { ar: "حتى 5 صفحات", en: "Up to 5 pages" },
      { ar: "متجاوب مع الجوال", en: "Mobile-ready" },
      { ar: "جاهز خلال 7 أيام عمل", en: "Ready in 7 business days" }
    ],
    deliverables: [
      { title: { ar: "الصفحات", en: "Pages" }, text: { ar: "الرئيسية، من نحن، الخدمات، أعمالنا، تواصل معنا.", en: "Home, about, services, our work, contact." } },
      { title: { ar: "التواصل", en: "Contact" }, text: { ar: "نموذج تواصل يصل لبريدك وزر واتساب ثابت في كل الصفحات.", en: "A contact form to your inbox and a WhatsApp button on every page." } },
      { title: { ar: "الأساسيات التقنية", en: "Technical basics" }, text: { ar: "شهادة SSL، تهيئة أساسية لمحركات البحث، وربط Google Analytics.", en: "SSL, basic SEO set-up and Google Analytics." } }
    ],
    delivery: { ar: "7 أيام عمل من استلام الشعار والمحتوى", en: "7 business days from receiving your logo and content" },
    terms: [
      { ar: "لغة واحدة (العربية أو الإنجليزية)", en: "One language (Arabic or English)" },
      { ar: "جولة تعديلات واحدة على التصميم", en: "One round of design revisions" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "النطاق والاستضافة وكتابة المحتوى", en: "Domain, hosting and copywriting" }],
    price: 1799,
    oldPrice: 2499
  },
  {
    slug: "day-store",
    cycle: "daily",
    service: "ecommerce",
    icon: "ShoppingBag",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "متجرك على زد أو سلة بـ 1,399 ريال", en: "Your Zid or Salla store for SAR 1,399" },
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
      { title: { ar: "جاهز للإعلان", en: "Ready to advertise" }, text: { ar: "تركيب بكسل سناب وتيك توك وميتا وتحليلات Google، وإنشاء حسابات المتجر على إنستغرام وتيك توك وسناب وربطها بالمتجر.", en: "Snap, TikTok and Meta pixels plus Google Analytics installed, and the store's Instagram, TikTok and Snap accounts created and linked." } }
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
    price: 1399,
    oldPrice: 1999
  },
  {
    slug: "day-whatsapp",
    cycle: "daily",
    service: "whatsapp-automation",
    icon: "MessageSquareMore",
    badge: { ar: "صفقة اليوم — 24 ساعة فقط", en: "Deal of the day — 24 hours only" },
    title: { ar: "واتساب الأساسية 3 أشهر بـ 349 ريال", en: "WhatsApp Basic, 3 months for SAR 349" },
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
    delivery: { ar: "يومان عمل بعد اعتماد Meta لحسابك", en: "2 business days after Meta approves your account" },
    terms: [
      { ar: "الدفع مقدماً عن الأشهر الثلاثة", en: "The three months are paid upfront" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "رسوم رسائل Meta حسب الاستخدام", en: "Meta message fees, billed by usage" }],
    price: 349,
    oldPrice: 597
  },
  {
    slug: "day-automation",
    cycle: "daily",
    service: "ai-automation",
    icon: "Workflow",
    badge: { ar: "صفقة اليوم — أتمتة", en: "Deal of the day — automation" },
    title: { ar: "أتمتة عملية متكررة في شركتك بـ 1,299 ريال", en: "Automate one repetitive process for SAR 1,299" },
    text: { ar: "اختر عملية تأخذ وقت فريقك كل يوم — استقبال الطلبات، إرسال عروض الأسعار، التقارير، المتابعة — ونحولها لعملية تلقائية تعمل وحدها.", en: "Pick a process that eats your team's time every day — taking requests, sending quotes, reports, follow-ups — and we turn it into one that runs by itself." },
    forWho: { ar: "للشركات التي يكرر موظفوها نفس الخطوات يدوياً بين البريد والجداول وواتساب والأنظمة.", en: "For companies whose staff repeat the same manual steps between e-mail, spreadsheets, WhatsApp and systems." },
    features: [
      { ar: "عملية واحدة حتى 8 خطوات", en: "One process, up to 8 steps" },
      { ar: "ربط أداتين أو نظامين", en: "Two tools or systems connected" },
      { ar: "ذكاء اصطناعي لقراءة وتصنيف الرسائل عند الحاجة", en: "AI to read and sort messages when needed" }
    ],
    deliverables: [
      { title: { ar: "تحليل العملية", en: "Process review" }, text: { ar: "جلسة نرسم فيها خطوات العملية الحالية ونحدد ما يمكن أتمتته.", en: "A session mapping today's steps and what can be automated." } },
      { title: { ar: "التنفيذ", en: "Build" }, text: { ar: "بناء الأتمتة وربط أدواتك (مثل نماذج الموقع، Google Sheets، البريد، واتساب، نظام العملاء).", en: "The automation built and your tools connected (e.g. site forms, Google Sheets, e-mail, WhatsApp, CRM)." } },
      { title: { ar: "التسليم", en: "Hand-over" }, text: { ar: "تجربة على بيانات حقيقية، شرح مسجل، ودعم 30 يوماً.", en: "Tested on real data, a recorded walkthrough and 30 days of support." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "عملية واحدة بحد أقصى 8 خطوات وأداتين", en: "One process, at most 8 steps and two tools" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "اشتراكات الأدوات الخارجية ورسوم الذكاء الاصطناعي حسب الاستخدام", en: "Third-party tool subscriptions and AI usage fees" }],
    price: 1299,
    oldPrice: 2199
  },
  {
    slug: "day-brand",
    cycle: "daily",
    service: "ux-ui-design",
    icon: "Palette",
    badge: { ar: "صفقة اليوم — تصميم", en: "Deal of the day — design" },
    title: { ar: "هوية بصرية كاملة لمشروعك بـ 999 ريال", en: "A complete brand identity for SAR 999" },
    text: { ar: "شعار احترافي مع ألوانك وخطوطك وقوالب سوشيال جاهزة — كل ما تحتاجه لتبدأ بشكل يثق فيه العميل من أول نظرة.", en: "A professional logo with your colours, fonts and ready social templates — everything you need to look trustworthy from the first glance." },
    forWho: { ar: "للمشاريع الجديدة والمتاجر التي تبدأ بدون هوية، أو تريد تجديد شكلها.", en: "For new businesses and stores starting without an identity, or refreshing their look." },
    features: [
      { ar: "3 مقترحات للشعار", en: "3 logo concepts" },
      { ar: "دليل ألوان وخطوط", en: "Colour and font guide" },
      { ar: "10 قوالب سوشيال ميديا", en: "10 social media templates" }
    ],
    deliverables: [
      { title: { ar: "الشعار", en: "Logo" }, text: { ar: "3 مقترحات، وجولتا تعديل على المقترح المختار، وتسليمه بكل الصيغ (PNG, SVG, PDF).", en: "3 concepts, two revision rounds on the chosen one, delivered in every format (PNG, SVG, PDF)." } },
      { title: { ar: "دليل الهوية", en: "Brand guide" }, text: { ar: "الألوان والخطوط وطريقة استخدام الشعار في ملف واحد.", en: "Colours, fonts and logo usage in one file." } },
      { title: { ar: "السوشيال", en: "Social" }, text: { ar: "10 قوالب منشورات وغلاف للحسابات قابلة للتعديل.", en: "10 editable post templates and account covers." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "جولتا تعديلات على المقترح المختار", en: "Two revision rounds on the chosen concept" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "تسجيل العلامة التجارية والمطبوعات", en: "Trademark registration and print" }],
    price: 999,
    oldPrice: 1799
  },
  {
    slug: "day-marketing",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Megaphone",
    badge: { ar: "صفقة اليوم — تسويق", en: "Deal of the day — marketing" },
    title: { ar: "أول شهر تسويق لمتجرك بـ 999 ريال", en: "Your store's first marketing month for SAR 999" },
    text: { ar: "باقة تسويق «البداية» لشهر كامل بسعر اليوم: ندير حسابين وننشر 12 منشوراً ونشغّل حملتك الإعلانية ونحسّنها كل أسبوع.", en: "The Marketing Starter plan for a full month at today's price: two accounts, 12 posts, and your ad campaign run and optimised every week." },
    forWho: { ar: "للمتاجر والمشاريع التي تريد تجربة إدارة التسويق معنا قبل الالتزام.", en: "For stores and businesses that want to try our marketing management before committing." },
    features: [
      { ar: "12 منشوراً بالتصميم والنص", en: "12 designed and written posts" },
      { ar: "حملة على منصة واحدة", en: "A campaign on one platform" },
      { ar: "تقرير بالطلبات وتكلفتها", en: "A report on orders and their cost" }
    ],
    deliverables: [
      { title: { ar: "المحتوى", en: "Content" }, text: { ar: "خطة محتوى للشهر و12 منشوراً على حسابين.", en: "A monthly content plan and 12 posts on two accounts." } },
      { title: { ar: "الإعلانات", en: "Ads" }, text: { ar: "حملة على سناب أو تيك توك أو ميتا بـ 4 تصاميم إعلانية وتحسين أسبوعي.", en: "A Snap, TikTok or Meta campaign with 4 ad designs and weekly optimisation." } },
      { title: { ar: "القياس", en: "Measurement" }, text: { ar: "فحص البكسل وتقرير نهاية الشهر بالطلبات وتكلفة الطلب الواحد.", en: "A pixel check and an end-of-month report on orders and cost per order." } }
    ],
    delivery: { ar: "نبدأ خلال 5 أيام عمل", en: "We start within 5 business days" },
    terms: [
      { ar: "شهر واحد بلا التزام بعده", en: "One month, no commitment after it" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "ميزانية الإعلانات (تُدفع للمنصة من حسابك)", en: "Ad budget (paid to the platform from your account)" }],
    price: 999,
    oldPrice: 1499
  },
  {
    slug: "day-social",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Share2",
    badge: { ar: "صفقة اليوم — سوشيال ميديا", en: "Deal of the day — social media" },
    title: { ar: "30 تصميم سوشيال ميديا بـ 1,999 ريال", en: "30 social media designs for SAR 1,999" },
    text: { ar: "شهر كامل من المنشورات بهويتك: تصاميم ونصوص جاهزة للنشر على إنستغرام وتيك توك وسناب وإكس.", en: "A full month of posts in your brand: designs and captions ready for Instagram, TikTok, Snap and X." },
    forWho: { ar: "لمن يدير حساباته بنفسه ويحتاج محتوى احترافياً منتظماً.", en: "For those who run their own accounts and need regular, professional content." },
    features: [
      { ar: "30 تصميماً بهويتك", en: "30 designs in your brand" },
      { ar: "نص لكل منشور مع الهاشتاقات", en: "A caption with hashtags for each post" },
      { ar: "مقاسات المنشور والستوري", en: "Post and story sizes" }
    ],
    deliverables: [
      { title: { ar: "خطة المحتوى", en: "Content plan" }, text: { ar: "جدول شهري بالأفكار والمواعيد المناسبة لجمهورك.", en: "A monthly calendar of ideas and the right posting times." } },
      { title: { ar: "التصاميم", en: "Designs" }, text: { ar: "30 تصميماً بمقاسي المنشور والستوري، مع جولة تعديل.", en: "30 designs in post and story sizes, with a revision round." } },
      { title: { ar: "النصوص", en: "Captions" }, text: { ar: "نص تسويقي لكل منشور بالعربية مع الهاشتاقات.", en: "A marketing caption for each post in Arabic, with hashtags." } }
    ],
    delivery: { ar: "7 أيام عمل", en: "7 business days" },
    terms: [
      { ar: "جولة تعديل واحدة على الدفعة كاملة", en: "One revision round on the whole batch" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "النشر وإدارة الحسابات والفيديو", en: "Publishing, account management and video" }],
    price: 1999,
    oldPrice: 2999
  },
  {
    slug: "day-ads-setup",
    cycle: "daily",
    service: "digital-marketing",
    icon: "Target",
    badge: { ar: "صفقة اليوم — إعلانات", en: "Deal of the day — ads" },
    title: { ar: "البكسل + الحسابات الإعلانية + أول حملة بـ 1,499 ريال", en: "Pixels + ad accounts + your first campaign for SAR 1,499" },
    text: { ar: "نجهز متجرك أو موقعك للإعلان صح: نركّب البكسل ونتأكد أن كل شراء يُقاس، ونجهز الحسابات الإعلانية ونطلق أول حملة.", en: "We get your store or site ready to advertise properly: pixels installed so every purchase is measured, ad accounts set up and your first campaign launched." },
    forWho: { ar: "لمن يعلن بدون قياس أو يريد البدء بالإعلانات بشكل صحيح من أول ريال.", en: "For anyone advertising without measurement, or starting ads the right way from the first riyal." },
    features: [
      { ar: "بكسل سناب وتيك توك وميتا", en: "Snap, TikTok and Meta pixels" },
      { ar: "تتبع الإضافة للسلة والشراء", en: "Add-to-cart and purchase tracking" },
      { ar: "إطلاق أول حملة على منصة واحدة", en: "First campaign launched on one platform" }
    ],
    deliverables: [
      { title: { ar: "البكسل والتتبع", en: "Pixels & tracking" }, text: { ar: "تركيب البكسل وتجربة أحداث المشاهدة والإضافة للسلة والشراء، وربط Google Analytics.", en: "Pixels installed, view / add-to-cart / purchase events tested, Google Analytics connected." } },
      { title: { ar: "الحسابات الإعلانية", en: "Ad accounts" }, text: { ar: "إنشاء أو ترتيب حساباتك الإعلانية وربطها بالمتجر وطرق الدفع.", en: "Your ad accounts created or tidied and linked to the store and payment methods." } },
      { title: { ar: "أول حملة", en: "First campaign" }, text: { ar: "إعداد الجمهور والإعلانات وإطلاق حملة على منصة واحدة بتصميمين.", en: "Audience and ads set up and a campaign launched on one platform with two designs." } }
    ],
    delivery: { ar: "3 أيام عمل", en: "3 business days" },
    terms: [
      { ar: "منصة إعلانية واحدة للحملة الأولى", en: "One ad platform for the first campaign" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "ميزانية الإعلانات وإدارة الحملة بعد إطلاقها", en: "Ad budget and managing the campaign after launch" }],
    price: 1499,
    oldPrice: 2499
  },
  {
    slug: "day-app-ui",
    cycle: "daily",
    service: "ux-ui-design",
    icon: "Smartphone",
    badge: { ar: "صفقة اليوم — تصميم تطبيقات", en: "Deal of the day — app design" },
    title: { ar: "تصميم واجهات تطبيقك حتى 15 شاشة بـ 2,499 ريال", en: "Your app's UI, up to 15 screens, for SAR 2,499" },
    text: { ar: "حوّل فكرة تطبيقك إلى تصميم كامل قابل للتجربة: رحلة المستخدم، الشاشات، ونموذج تفاعلي تعرضه على المستثمرين أو المطورين.", en: "Turn your app idea into a complete, clickable design: user journey, screens and an interactive prototype to show investors or developers." },
    forWho: { ar: "لأصحاب الأفكار والشركات الناشئة قبل بدء البرمجة.", en: "For founders and start-ups before development begins." },
    features: [
      { ar: "حتى 15 شاشة", en: "Up to 15 screens" },
      { ar: "نموذج تفاعلي على Figma", en: "An interactive Figma prototype" },
      { ar: "ملفات جاهزة للمطورين", en: "Developer-ready files" }
    ],
    deliverables: [
      { title: { ar: "رحلة المستخدم", en: "User journey" }, text: { ar: "تخطيط الشاشات والتنقل بينها قبل التصميم.", en: "Screens and navigation mapped before design." } },
      { title: { ar: "التصميم", en: "Design" }, text: { ar: "حتى 15 شاشة بهويتك للجوال، مع جولتي تعديل.", en: "Up to 15 mobile screens in your brand, with two revision rounds." } },
      { title: { ar: "التسليم", en: "Hand-over" }, text: { ar: "نموذج تفاعلي وملف Figma منظم بالمكونات للمطورين.", en: "An interactive prototype and an organised Figma file with components." } }
    ],
    delivery: { ar: "14 يوم عمل", en: "14 business days" },
    terms: [
      { ar: "جولتا تعديلات", en: "Two revision rounds" },
      { ar: "يُثبَّت السعر لمن يرسل الطلب قبل منتصف الليل", en: "The price is locked for requests sent before midnight" }
    ],
    excludes: [{ ar: "برمجة التطبيق (متاحة في باقات المواقع والتطبيقات)", en: "App development (in the website & app packages)" }],
    price: 2499,
    oldPrice: 3999
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
  shareWa: { ar: "إرسال على واتساب", en: "Send on WhatsApp" } as L,
  allOffers: { ar: "كل الباقات والعروض", en: "All packages & offers" } as L,
  ended: { ar: "انتهى هذا العرض", en: "This offer has ended" } as L,
  endedText: { ar: "يسعدنا مساعدتك بعرض جديد يناسب احتياجك.", en: "We'd be happy to prepare a new offer for you." } as L,
  dealFor: { ar: "عرض خاص مقدَّم إلى", en: "A special offer for" } as L,
  dealItems: { ar: "ما يشمله العرض", en: "What's included" } as L,
  dealTotal: { ar: "الإجمالي", en: "Total" } as L,
  dealOnRequest: { ar: "يُحدد السعر بعد مناقشة التفاصيل معكم", en: "Pricing follows a short discussion with you" } as L,
  dealValid: { ar: "صالح حتى", en: "Valid until" } as L,
  journeyTitle: { ar: "رحلتك معنا: من التأسيس إلى الطلبات… ونكمل", en: "Your journey with us: from founding to orders… and beyond" } as L,
  journeySub: { ar: "كل خطوة لها باقة تغطيها — ابدأ من حيث أنت الآن.", en: "Every step has a package that covers it — start wherever you are." } as L,
  journeyStep: { ar: "الخطوة", en: "Step" } as L,
  prev: { ar: "الصفقة السابقة", en: "Previous deal" } as L,
  next: { ar: "الصفقة التالية", en: "Next deal" } as L,
  vatNote: { ar: "الأسعار قبل ضريبة القيمة المضافة 15%.", en: "Prices exclude 15% VAT." } as L,
  preview: { ar: "مثال للتصميم — يظهر على جهازك فقط", en: "Design example — visible on your machine only" } as L
};
