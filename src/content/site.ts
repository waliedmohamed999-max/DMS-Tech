/** Company-wide settings — the "settings" screen of the future dashboard. */
export const site = {
  name: "DMS Tech",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://dms1t.com",
  email: "info@dmstech.sa",
  phoneDisplay: "0550881255",
  whatsapp: "966550881255",
  socialHandle: "DMS1T",
  socials: {
    instagram: "https://instagram.com/dms1t",
    tiktok: "https://www.tiktok.com/@dms1t",
    youtube: "https://www.youtube.com/@dms1t",
    linkedin: "https://www.linkedin.com/company/dms1t",
    x: "https://x.com/dms1t"
  },
  announcement: {
    ar: "جديد: منصة NOVA AI لأتمتة المحادثات وسير العمل والتحليلات",
    en: "New: NOVA AI — one platform for conversations, workflows and insights",
    href: "/nova-ai"
  }
} as const;

export const whatsappLink = (text?: string) =>
  `https://wa.me/${site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
