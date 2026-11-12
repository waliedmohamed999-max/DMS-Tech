/** Limited-time offers, retired offer links and private deals. */
import { type Deal, type Offer } from "./model";
import { t } from "./packages";

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
