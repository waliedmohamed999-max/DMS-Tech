import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";

/**
 * Case studies for selected client projects (/clients and /clients/[slug]): the challenge, DMS Tech's role, the
 * journey from founding to growth, and the outcome — in words only, never invented figures.
 *
 * DRAFTS: `approved: false` entries were written by the team as drafts from each client's line of business and are
 * shown in development only (marked "draft"). The company reviews each one against what was actually delivered,
 * corrects it and sets `approved: true` before it appears on the live site.
 */
export type CaseStudy = {
  /** the project's slug in src/content/projects.ts */
  slug: string;
  approved: boolean;
  /** one line for the card */
  summary: L;
  challenge: L;
  /** DMS Tech's role: the services delivered */
  role: L[];
  journey: { icon: IconName; stage: L; text: L }[];
  /** the outcome, described — no invented numbers */
  outcome: L[];
  /** the package page that sells the same kind of work */
  package: string;
};

const founding = (ar: string, en: string) => ({ icon: "Lightbulb" as IconName, stage: { ar: "التأسيس", en: "Founding" }, text: { ar, en } });
const launch = (ar: string, en: string) => ({ icon: "Rocket" as IconName, stage: { ar: "الإطلاق", en: "Launch" }, text: { ar, en } });
const growth = (ar: string, en: string) => ({ icon: "TrendingUp" as IconName, stage: { ar: "النمو", en: "Growth" }, text: { ar, en } });

export const caseStudies: CaseStudy[] = [
  {
    slug: "shalfa",
    approved: false,
    summary: { ar: "علامة شماغ سعودية: من فكرة وهوية إلى متجر يبيع بقصة تراثية ويُدار بالحملات.", en: "A Saudi shemagh brand: from an idea and identity to a store that sells a heritage story, driven by campaigns." },
    challenge: { ar: "علامة جديدة في سوق مزدحم بالشماغ، تريد أن تتميز بقصة تراثية سعودية وتبيع أونلاين لعملاء في كل مناطق المملكة، دون متجر أو حضور رقمي منظم.", en: "A new brand in a crowded shemagh market, wanting to stand out with a Saudi heritage story and sell online across the Kingdom, without a store or an organised online presence." },
    role: [
      { ar: "صياغة قصة العلامة وهويتها البصرية للمتجر", en: "Brand story and visual identity for the store" },
      { ar: "تصميم وإطلاق المتجر الإلكتروني وصفحات المنتجات", en: "Store design and launch, with product pages" },
      { ar: "ربط الدفع والشحن داخل المملكة", en: "Payments and shipping across the Kingdom" },
      { ar: "تجهيز البكسل وحملات الإطلاق على السوشيال ميديا", en: "Pixels and social media launch campaigns" }
    ],
    journey: [
      founding("بنينا رسالة العلامة حول قصة «الشلفا» التاريخية، واخترنا ألواناً وصوراً تعكس الأصالة والفخامة.", "We built the brand message around the historic “Shalfa” story and chose colours and imagery that speak of heritage and quality."),
      launch("أطلقنا متجراً بصفحات منتجات تشرح الخامة والمقاس والاستخدام، مع دفع وشحن جاهزين وصفحات سياسات واضحة.", "We launched a store whose product pages explain fabric, sizing and use, with payments, shipping and clear policy pages ready."),
      growth("جهزنا التتبع وحملات المواسم مثل رمضان واليوم الوطني، ومحتوى يربط المنتج بالقصة لجذب الشراء المتكرر.", "We set up tracking and seasonal campaigns such as Ramadan and National Day, with content tying the product to its story to drive repeat purchases.")
    ],
    outcome: [
      { ar: "متجر يعكس هوية العلامة ويروي قصتها بدلاً من عرض المنتج فقط", en: "A store that carries the brand and tells its story, not just the product" },
      { ar: "قناة بيع مباشرة تصل لعملاء المملكة كلها", en: "A direct sales channel reaching customers across the Kingdom" },
      { ar: "أساس قياس واضح للحملات الموسمية", en: "Clear measurement in place for seasonal campaigns" }
    ],
    package: "store-growth"
  },
  {
    slug: "mihmar",
    approved: false,
    summary: { ar: "عسل طبيعي: من البيع عبر الرسائل إلى متجر يبني الثقة في الجودة ويستقبل الطلبات.", en: "Natural honey: from selling over messages to a store that builds trust in quality and takes orders." },
    challenge: { ar: "منتج غذائي يعتمد على الثقة في الجودة والمصدر، وكانت الطلبات تأتي عبر الرسائل يدوياً، مما يصعّب المتابعة ويحدّ من الوصول لعملاء جدد.", en: "A food product that depends on trust in quality and origin, with orders arriving by hand over messages — hard to track and limiting reach." },
    role: [
      { ar: "تصميم متجر يبرز مصدر العسل وجودته", en: "A store design that highlights origin and quality" },
      { ar: "تنظيم المنتجات بالأحجام والأنواع", en: "Products organised by size and type" },
      { ar: "ربط الدفع والشحن والطلبات على واتساب", en: "Payments, shipping and WhatsApp order alerts" },
      { ar: "محتوى سوشيال ميديا وحملة إطلاق", en: "Social media content and a launch campaign" }
    ],
    journey: [
      founding("حددنا ما يبحث عنه عميل العسل: المصدر، والنقاء، وطريقة التخزين، وبنينا محتوى المتجر حولها.", "We defined what honey buyers look for — origin, purity and storage — and built the store's content around it."),
      launch("أطلقنا المتجر بصفحات منتجات تشرح كل نوع، مع خيارات الأحجام، ودفع وشحن جاهزين، وإشعار بكل طلب على واتساب.", "We launched with product pages explaining each type, size options, payments and shipping ready, and an alert for every order on WhatsApp."),
      growth("حوّلنا أسئلة العملاء المتكررة إلى محتوى ومنشورات، وجهزنا حملات للمواسم التي يزيد فيها الطلب على العسل.", "We turned customers' frequent questions into content and posts, and prepared campaigns for the seasons when honey demand rises.")
    ],
    outcome: [
      { ar: "طلبات منظمة بدل المتابعة اليدوية عبر الرسائل", en: "Organised orders instead of manual follow-up over messages" },
      { ar: "صفحة منتج تجيب عن أسئلة الجودة قبل أن تُطرح", en: "Product pages that answer quality questions before they're asked" },
      { ar: "حضور يبني الثقة لدى العملاء الجدد", en: "A presence that builds trust with new customers" }
    ],
    package: "store-launch"
  },
  {
    slug: "khanenh",
    approved: false,
    summary: { ar: "بهارات وتوابل: متجر يعرض تشكيلة واسعة بوضوح، ومحتوى يحوّل الوصفات إلى مبيعات.", en: "Spices: a store that presents a wide range clearly, and content that turns recipes into sales." },
    challenge: { ar: "تشكيلة كبيرة من البهارات والخلطات يصعب عرضها وتصفحها، وعميل يحتاج أن يعرف استخدام كل خلطة قبل الشراء.", en: "A large range of spices and blends that is hard to present and browse, and buyers who need to know each blend's use before buying." },
    role: [
      { ar: "تصنيف المنتجات وتسهيل التصفح والبحث", en: "Product categories and easy browsing and search" },
      { ar: "تصميم المتجر بهوية العلامة", en: "Store design in the brand's identity" },
      { ar: "ربط الدفع والشحن والكوبونات", en: "Payments, shipping and coupons" },
      { ar: "محتوى وصفات وفيديوهات قصيرة للسوشيال", en: "Recipe content and short social videos" }
    ],
    journey: [
      founding("نظمنا التشكيلة في تصنيفات يفهمها العميل: حسب الطبق والاستخدام والنوع.", "We organised the range into categories customers understand: by dish, use and type."),
      launch("أطلقنا المتجر بصفحات تشرح استخدام كل خلطة، مع خيارات الأحجام والكوبونات الأولى.", "We launched with pages explaining each blend's use, size options and the first coupons."),
      growth("بنينا محتوى وصفات يربط كل وصفة بالخلطة المناسبة، فيتحول المتابع إلى مشترٍ.", "We built recipe content linking each recipe to the right blend, turning followers into buyers.")
    ],
    outcome: [
      { ar: "تصفح أسهل لتشكيلة كبيرة", en: "Easier browsing of a large range" },
      { ar: "محتوى يجيب «كيف أستخدمها؟» ويقود للشراء", en: "Content that answers “how do I use it?” and leads to purchase" },
      { ar: "متجر جاهز لحملات المناسبات والمواسم", en: "A store ready for occasion and seasonal campaigns" }
    ],
    package: "store-growth"
  },
  {
    slug: "bahrna",
    approved: false,
    summary: { ar: "مطعم بحرنا: طلب أونلاين على زد، ومحتوى يجعل الأطباق تُطلب من الصورة.", en: "Bahruna restaurant: online ordering on Zid, and content that makes dishes order-worthy from the photo." },
    challenge: { ar: "مطعم يحتاج قناة طلب مباشرة إلى جانب تطبيقات التوصيل، وقائمة واضحة يتصفحها العميل ويطلب منها بسهولة.", en: "A restaurant needing a direct ordering channel alongside delivery apps, and a clear menu customers can browse and order from easily." },
    role: [
      { ar: "إعداد متجر الطلب على منصة زد", en: "Ordering store set up on Zid" },
      { ar: "تنظيم القائمة بالأقسام والإضافات", en: "Menu organised by sections and add-ons" },
      { ar: "ربط الدفع وخيارات الاستلام والتوصيل", en: "Payments plus pick-up and delivery options" },
      { ar: "محتوى وتصوير للأطباق على السوشيال", en: "Dish content and photography for social" }
    ],
    journey: [
      founding("حولنا قائمة المطعم إلى أقسام واضحة بأسماء وأوصاف تفتح الشهية وصور لكل طبق.", "We turned the menu into clear sections with appetising names, descriptions and a photo for every dish."),
      launch("أطلقنا الطلب أونلاين على زد مع الدفع المسبق وخيارات الاستلام، ليطلب العميل مباشرة من المطعم.", "We launched online ordering on Zid with prepayment and pick-up options, so customers order straight from the restaurant."),
      growth("جهزنا محتوى للعروض والأطباق المميزة يقود إلى رابط الطلب المباشر.", "We prepared content for offers and signature dishes that leads to the direct ordering link.")
    ],
    outcome: [
      { ar: "قناة طلب مباشرة يملكها المطعم", en: "A direct ordering channel the restaurant owns" },
      { ar: "قائمة واضحة تقلل أسئلة العملاء", en: "A clear menu that cuts customers' questions" },
      { ar: "محتوى يحوّل المتابع إلى طلب", en: "Content that turns followers into orders" }
    ],
    package: "store-launch"
  },
  {
    slug: "logex",
    approved: false,
    summary: { ar: "شركة شحن: موقع يقدّم الخدمات للشركات بوضوح ويحوّل الزوار إلى طلبات عروض أسعار.", en: "A shipping company: a site that presents its services to businesses clearly and turns visitors into quote requests." },
    challenge: { ar: "شركة لوجستية تخدم الشركات، تحتاج موقعاً يشرح خدماتها ونطاق تغطيتها بثقة ويجمع طلبات عروض الأسعار بشكل منظم.", en: "A logistics company serving businesses, needing a site that explains its services and coverage with confidence and collects quote requests in an organised way." },
    role: [
      { ar: "هيكلة الخدمات ونطاق التغطية في صفحات واضحة", en: "Services and coverage structured into clear pages" },
      { ar: "تصميم موقع مؤسسي بهوية الشركة", en: "A corporate site in the company's identity" },
      { ar: "نموذج طلب عرض سعر يصل للفريق مباشرة", en: "A quote request form that reaches the team directly" },
      { ar: "تهيئة لمحركات البحث للخدمات الأساسية", en: "Search optimisation for the core services" }
    ],
    journey: [
      founding("حددنا ما يحتاجه عميل الشحن قبل التواصل: الخدمات، والمدن المغطاة، وطريقة التعامل.", "We defined what a shipping client needs before getting in touch: services, cities covered and how to work together."),
      launch("أطلقنا موقعاً بصفحات خدمات ورسائل ثقة واضحة، ونموذج طلب عرض سعر بأسئلة تختصر المتابعة.", "We launched a site with service pages, clear trust signals and a quote form whose questions shorten follow-up."),
      growth("هيأنا الصفحات للبحث عن خدمات الشحن، لتصل الشركات للموقع عند بحثها عن مزود.", "We optimised the pages for shipping-service searches, so businesses find the site when looking for a provider.")
    ],
    outcome: [
      { ar: "حضور مؤسسي يعكس حجم الشركة", en: "A corporate presence that reflects the company" },
      { ar: "طلبات عروض أسعار منظمة بالمعلومات المطلوبة", en: "Organised quote requests with the information needed" },
      { ar: "أساس للظهور في نتائج البحث", en: "A foundation for appearing in search results" }
    ],
    package: "web-growth"
  }
];

/** Case studies that may be shown: approved ones, plus drafts in development (never in production). */
export const visibleCaseStudies = () => caseStudies.filter((c) => c.approved || process.env.NODE_ENV !== "production");

export const caseCopy = {
  title: { ar: "دراسات *حالة*", en: "Case *studies*" } as L,
  sub: { ar: "كيف رافقنا عملاءنا من الفكرة إلى الإطلاق ثم النمو.", en: "How we took our clients from idea to launch, then growth." } as L,
  read: { ar: "اقرأ دراسة الحالة", en: "Read the case study" } as L,
  challenge: { ar: "التحدي", en: "The challenge" } as L,
  role: { ar: "دور DMS Tech", en: "DMS Tech's role" } as L,
  journey: { ar: "الرحلة: من التأسيس إلى النمو", en: "The journey: from founding to growth" } as L,
  outcome: { ar: "النتيجة", en: "The outcome" } as L,
  cta: { ar: "تريد رحلة مثلها؟ شاهد الباقة المناسبة", en: "Want a journey like this? See the matching package" } as L,
  draft: { ar: "مسودة — تظهر هنا فقط حتى تعتمدها الشركة", en: "Draft — shown here only until the company approves it" } as L
};
