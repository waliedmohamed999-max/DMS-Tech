/** The live DMS Chat Bot platform — change it here when it moves to its own domain. */
const PLATFORM = "https://lime-magpie-603955.hostingersite.com";

/** DMS Chat Bot labels and links — small on purpose: the header (a client component) and the footer import it. */
export const chatbotNav = {
  /** the product page on this site (also the form key "dms-chat-bot") */
  href: "/dms-chat-bot",
  /** the platform itself: menu and footer open it directly */
  platform: PLATFORM,
  login: `${PLATFORM}/login`,
  register: `${PLATFORM}/register`,
  partners: `${PLATFORM}/affiliates`,
  title: { ar: "DMS Chat Bot", en: "DMS Chat Bot" },
  desc: { ar: "إدارة محادثات واتساب وحملاتك من مكان واحد", en: "WhatsApp conversations and campaigns in one place" },
  live: { ar: "متاح الآن", en: "Available now" },
  start: { ar: "ابدأ الآن", en: "Start now" },
  loginLabel: { ar: "تسجيل الدخول", en: "Log in" },
  partner: { ar: "ابدأ كشريك", en: "Become a partner" },
  contact: { ar: "تواصل معنا", en: "Contact us" },
  howItWorks: { ar: "شاهد كيف تعمل", en: "See how it works" },
  features: { ar: "ماذا ستقدّم لك", en: "What it will do for you" }
};
