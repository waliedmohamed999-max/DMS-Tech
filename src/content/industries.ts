import type { Industry, Integration } from "./types";

export const industries: Industry[] = [
  {
    slug: "retail-ecommerce",
    apps: ["shopify", "whatsapp", "googleanalytics", "meta"],
    icon: "ShoppingBag",
    image: "/images/photos/ind-retail.jpg",
    title: { ar: "التجزئة والتجارة الإلكترونية", en: "Retail & E-Commerce" },
    description: { ar: "متاجر، أنظمة نمو، ورحلات عملاء متكاملة.", en: "Stores, growth systems and customer journeys." },
    quote: { ar: "متجر يبيع أكثر، ومتابعة عملاء تعمل تلقائياً.", en: "A store that sells more, with follow-ups that run themselves." }
  },
  {
    slug: "healthcare",
    apps: ["whatsapp", "googleanalytics", "googlegemini"],
    icon: "Stethoscope",
    image: "/images/photos/ind-health.jpg",
    title: { ar: "الرعاية الصحية والعيادات", en: "Healthcare & Clinics" },
    description: { ar: "مسارات الحجز، المواقع، والأتمتة.", en: "Booking flows, websites and automation." },
    quote: { ar: "حجز أسهل للمرضى، ووقت أكثر لفريقك الطبي.", en: "Easier booking for patients, more time for your medical team." }
  },
  {
    slug: "education",
    apps: ["whatsapp", "youtube", "notion"],
    icon: "GraduationCap",
    image: "/images/photos/ind-education.jpg",
    title: { ar: "التعليم والتدريب", en: "Education & Training" },
    description: { ar: "بوابات ومنصات وتفاعل الطلاب.", en: "Portals, platforms and student engagement." },
    quote: { ar: "منصات تعليمية تجمع الطلاب والمحتوى والتواصل في مكان واحد.", en: "Learning platforms that bring students, content and communication together." }
  },
  {
    slug: "corporate",
    apps: ["hubspot", "odoo", "zoho", "notion"],
    icon: "Building2",
    image: "/images/photos/ind-corporate.jpg",
    title: { ar: "خدمات الشركات", en: "Corporate Services" },
    description: { ar: "العمليات، لوحات البيانات، وأتمتة سير العمل.", en: "Operations, dashboards and workflow automation." },
    quote: { ar: "عمليات مترابطة ولوحات تعرض الحقيقة لحظة بلحظة.", en: "Connected operations and dashboards that show the truth in real time." }
  },
  {
    slug: "real-estate",
    apps: ["whatsapp", "meta", "hubspot"],
    icon: "House",
    image: "/images/photos/ind-realestate.jpg",
    title: { ar: "العقارات", en: "Real Estate" },
    description: { ar: "مسارات العملاء، المواقع، ومتابعة واتساب.", en: "Lead funnels, websites and WhatsApp follow-up." },
    quote: { ar: "كل عميل محتمل يُلتقط ويُتابع حتى إتمام الصفقة.", en: "Every lead captured and followed up until the deal closes." }
  }
];

/**
 * Platforms we build on / integrate with. `slug` is a simple-icons slug; entries
 * without one render as a wordmark (e.g. Saudi platforms not in simple-icons).
 */
export const integrations: Integration[][] = [
  [
    { name: "Zid" }, { name: "Salla" }, { name: "Shopify", slug: "shopify" }, { name: "WooCommerce", slug: "woocommerce" },
    { name: "WhatsApp", slug: "whatsapp" }, { name: "Meta", slug: "meta" }, { name: "Instagram", slug: "instagram" },
    { name: "TikTok", slug: "tiktok" }, { name: "Snapchat", slug: "snapchat" }, { name: "Google Ads", slug: "googleads" }
  ],
  [
    { name: "Google Analytics", slug: "googleanalytics" }, { name: "HubSpot", slug: "hubspot" }, { name: "Zoho", slug: "zoho" },
    { name: "Odoo", slug: "odoo" }, { name: "Notion", slug: "notion" }, { name: "Zapier", slug: "zapier" },
    { name: "n8n", slug: "n8n" }, { name: "Make", slug: "make" }, { name: "Stripe", slug: "stripe" }, { name: "Apple Pay", slug: "applepay" }
  ],
  [
    { name: "Claude", slug: "claude" }, { name: "Google Gemini", slug: "googlegemini" }, { name: "Next.js", slug: "nextdotjs" },
    { name: "React", slug: "react" }, { name: "Flutter", slug: "flutter" }, { name: "Laravel", slug: "laravel" },
    { name: "Node.js", slug: "nodedotjs" }, { name: "Supabase", slug: "supabase" }, { name: "Firebase", slug: "firebase" },
    { name: "Google Cloud", slug: "googlecloud" }
  ]
];
