import type { Feature, L } from "./types";

/**
 * DMS Chat Bot — the company's WhatsApp messaging product ("Digital Messaging System"), presented like NOVA AI and
 * marked "coming soon". Texts follow the product's own published description (campaigns, smart chatbot, unified CRM,
 * official WhatsApp Business Platform). No public link while it is not launched.
 */
export const chatbot = {
  slug: "dms-chat-bot",
  title: { ar: "DMS Chat Bot", en: "DMS Chat Bot" } as L,
  fullName: { ar: "نظام الرسائل الرقمية من DMS", en: "DMS Digital Messaging System" } as L,
  tagline: { ar: "أدِر محادثات عملائك على واتساب من مكان واحد", en: "Manage your customer conversations on WhatsApp from one place" } as L,
  description: {
    ar: "حملات، شات بوت ذكي، وCRM موحّد — مبني على WhatsApp Business Platform الرسمي، لكل متجر وعيادة وصالون ونشاط خدمي.",
    en: "Campaigns, a smart chatbot and a unified CRM — built on the official WhatsApp Business Platform, for every store, clinic, salon and service business."
  } as L,
  image: "/images/photos/dms-chat-bot.png",
  features: [
    { icon: "MessagesSquare", title: { ar: "صندوق محادثات موحّد", en: "Unified inbox" }, description: { ar: "كل محادثات واتساب مع عملائك في مكان واحد.", en: "All your WhatsApp customer conversations in one place." } },
    { icon: "Bot", title: { ar: "شات بوت ذكي", en: "Smart chatbot" }, description: { ar: "يرد على عملائك تلقائياً على واتساب.", en: "Replies to your customers automatically on WhatsApp." } },
    { icon: "Megaphone", title: { ar: "حملات واتساب", en: "WhatsApp campaigns" }, description: { ar: "أرسل حملاتك لعملائك من نفس المنصة.", en: "Send your campaigns to customers from the same platform." } },
    { icon: "Users", title: { ar: "CRM موحّد", en: "Unified CRM" }, description: { ar: "بيانات عملائك ومحادثاتهم مرتبطة في سجل واحد.", en: "Customer data and conversations linked in one record." } },
    { icon: "ShieldCheck", title: { ar: "واتساب الرسمي", en: "Official WhatsApp" }, description: { ar: "مبني على WhatsApp Business Platform الرسمي.", en: "Built on the official WhatsApp Business Platform." } },
    { icon: "ShoppingBag", title: { ar: "لكل نشاط", en: "For every business" }, description: { ar: "للمتاجر والعيادات والصالونات والأنشطة الخدمية.", en: "For stores, clinics, salons and service businesses." } }
  ] satisfies Feature[]
};

/** Small, client-safe labels (imported by the header and footer). */
export const chatbotNav = {
  href: "/dms-chat-bot",
  title: { ar: "DMS Chat Bot", en: "DMS Chat Bot" },
  desc: { ar: "إدارة محادثات واتساب وحملاتك من مكان واحد", en: "WhatsApp conversations and campaigns in one place" },
  soon: { ar: "قريباً", en: "Soon" },
  soonLong: { ar: "قريباً — قيد الإطلاق", en: "Coming soon" },
  notify: { ar: "سجّل اهتمامك", en: "Register your interest" },
  features: { ar: "ماذا ستقدّم لك", en: "What it will do for you" }
};
