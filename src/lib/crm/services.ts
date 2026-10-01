/**
 * Temporary typed service-category layer (Phase 2).
 *
 * The full Service Catalog arrives in Phase 3. Until then CRM records store one of
 * these stable keys (`Lead.interestedService`, `Opportunity.serviceCategory`).
 * Keys reuse the public website's service slugs where they exist, so website
 * submissions map 1:1. Phase 3 migration: create a Service row per key and backfill
 * a serviceId FK from these strings. Keys are never renamed.
 */
export const SERVICE_CATEGORIES = [
  { key: "ai-automation", ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
  { key: "whatsapp-automation", ar: "أتمتة واتساب", en: "WhatsApp Automation" },
  { key: "web-development", ar: "تطوير المواقع", en: "Web Development" },
  { key: "app-development", ar: "تطبيقات الجوال", en: "Mobile Apps" },
  { key: "ecommerce", ar: "المتاجر الإلكترونية", en: "E-Commerce" },
  { key: "digital-marketing", ar: "التسويق الرقمي", en: "Digital Marketing" },
  { key: "branding-design", ar: "الهوية والتصميم", en: "Branding / Design" },
  { key: "digital-transformation", ar: "التحول الرقمي", en: "Digital Transformation" },
  { key: "systems-integration", ar: "تكامل الأنظمة", en: "Systems Integration" },
  { key: "ux-ui-design", ar: "تصميم UX/UI", en: "UX/UI" },
  { key: "nova-ai", ar: "NOVA AI", en: "NOVA AI" },
  { key: "custom-software", ar: "برمجيات مخصصة", en: "Custom Software" },
  { key: "support-maintenance", ar: "الدعم والصيانة", en: "Support / Maintenance" },
  { key: "consulting", ar: "الاستشارات", en: "Consulting" },
  { key: "other", ar: "أخرى", en: "Other" }
] as const;

export type ServiceKey = (typeof SERVICE_CATEGORIES)[number]["key"];
export const SERVICE_KEYS = SERVICE_CATEGORIES.map((s) => s.key) as [ServiceKey, ...ServiceKey[]];
export const serviceLabel = (key: string | null | undefined, locale: string) => {
  const s = SERVICE_CATEGORIES.find((x) => x.key === key);
  return s ? (locale === "ar" ? s.ar : s.en) : (key ?? "—");
};

export const LEAD_SOURCES = ["WEBSITE", "WHATSAPP", "PHONE", "REFERRAL", "LINKEDIN", "INSTAGRAM", "GOOGLE_ADS", "META_ADS", "TIKTOK", "GOVERNMENT_OPPORTUNITY", "PARTNER", "MANUAL", "OTHER"] as const;
export const LEAD_STATUSES = ["OPEN", "QUALIFIED", "CONVERTED", "LOST", "ARCHIVED"] as const;
export const LEAD_STAGES = ["NEW", "ATTEMPTED", "CONTACTED", "ENGAGED", "UNRESPONSIVE"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const OPP_STATUSES = ["OPEN", "WON", "LOST", "ARCHIVED"] as const;
export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const ACTIVITY_TYPES_USER = ["CALL", "EMAIL", "WHATSAPP", "MEETING", "NOTE", "TASK", "FOLLOW_UP"] as const;

/** Website budget options (public form value → range in SAR). Labels live in the public message files. */
export const WEBSITE_BUDGETS: Record<string, { min: string | null; max: string | null }> = {
  undecided: { min: null, max: null },
  "lt-10k": { min: "0", max: "10000" },
  "10k-30k": { min: "10000", max: "30000" },
  "30k-100k": { min: "30000", max: "100000" },
  "gt-100k": { min: "100000", max: null }
};
export const WEBSITE_BUDGET_KEYS = Object.keys(WEBSITE_BUDGETS);

/** Display name of a record's service: catalog service (Phase 3) first, legacy key label as fallback. */
export const serviceName = (service: { nameAr: string; nameEn: string } | null | undefined, legacyKey: string | null | undefined, locale: string) =>
  service ? (locale === "ar" ? service.nameAr : service.nameEn) : legacyKey ? serviceLabel(legacyKey, locale) : null;
