/** Extra request-form questions per service and the /offers section aliases. */
import { type L } from "../types";

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
