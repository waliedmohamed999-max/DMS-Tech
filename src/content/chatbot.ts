import type { IconName } from "@/components/ui/Icon";
import type { L } from "./types";

/**
 * DMS Chat Bot — the company's WhatsApp CRM platform ("Digital Messaging System"), marked "coming soon".
 * Content follows the product's own marketing pages (repo DMS-Chat-Boot-new: siteContent defaults, services,
 * channels & tools, solutions, vision, methodology, pricing FAQ — Arabic there; English here is a faithful
 * translation). Deliberately NOT carried over: placeholder statistics, testimonials and client logos (not real
 * yet), prices (not announced), and the QR "coexistence" channel (unofficial WhatsApp library).
 */
type Item = { icon: IconName; title: L; text: L };

export const chatbot = {
  slug: "dms-chat-bot",
  title: { ar: "DMS Chat Bot", en: "DMS Chat Bot" } as L,
  fullName: { ar: "نظام الرسائل الرقمية من DMS", en: "DMS Digital Messaging System" } as L,
  tagline: { ar: "أدِر محادثات عملائك على *واتساب* من مكان واحد", en: "Manage your customer conversations on *WhatsApp* from one place" } as L,
  description: {
    ar: "حملات، شات بوت ذكي، وCRM موحّد — مبني على WhatsApp Business Platform الرسمي، لكل متجر وعيادة وصالون ونشاط خدمي.",
    en: "Campaigns, a smart chatbot and a unified CRM — built on the official WhatsApp Business Platform, for every store, clinic, salon and service business."
  } as L,
  image: "/images/photos/dms-chat-bot.png",

  sectionNav: [
    { id: "services", label: { ar: "الخدمات", en: "Services" } },
    { id: "channels", label: { ar: "القنوات والأدوات", en: "Channels & tools" } },
    { id: "solutions", label: { ar: "الحلول", en: "Solutions" } },
    { id: "method", label: { ar: "كيف تبدأ", en: "Getting started" } },
    { id: "faq", label: { ar: "الأسئلة الشائعة", en: "FAQ" } }
  ] as { id: string; label: L }[],

  featuresTitle: { ar: "كل شيء تحتاجه *في مكان واحد*", en: "Everything you need *in one place*" } as L,
  features: [
    { icon: "Megaphone", title: { ar: "حملات وشرائح ذكية", en: "Smart campaigns & segments" }, text: { ar: "استهدف عملاءك بحملات فورية أو آلية مثل استرداد السلة المتروكة تلقائياً.", en: "Reach customers with instant or automated campaigns, like recovering abandoned carts automatically." } },
    { icon: "Bot", title: { ar: "شات بوت ذكي بلا كود", en: "No-code smart chatbot" }, text: { ar: "ابنِ تدفقات ردّ آلي واختبرها قبل النشر، مع تحويل سلس للموظف البشري عند الحاجة.", en: "Build automated reply flows, test them before publishing, and hand over smoothly to a human agent when needed." } },
    { icon: "Users", title: { ar: "CRM موحّد", en: "Unified CRM" }, text: { ar: "صندوق محادثات واحد لكل فريقك، مع ملف كامل لكل عميل وسجل تفاعلاته.", en: "One inbox for your whole team, with a full profile and interaction history for every customer." } },
    { icon: "Plug", title: { ar: "تكامل مع متجرك", en: "Store integration" }, text: { ar: "ربط حقيقي مع زد وسلة لمزامنة الطلبات، أو ربط رقم واتساب Cloud API يدوياً.", en: "Real integration with Zid and Salla to sync orders, or connect a WhatsApp Cloud API number manually." } }
  ] as Item[],

  servicesTitle: { ar: "خدماتنا *بالتفصيل*", en: "Our services *in detail*" } as L,
  services: [
    {
      icon: "Megaphone",
      title: { ar: "الحملات الإعلانية عبر واتساب", en: "WhatsApp marketing campaigns" },
      text: { ar: "أرسل حملات مجزّأة حسب شرائح عملائك (جدد، عملاء متكررون، سلة متروكة) باستخدام قوالب رسائل معتمدة من Meta. تتبّع نتائج كل حملة لحظياً: عدد المُرسَل، المُسلَّم، المقروء، والمبيعات الفعلية الناتجة عنها.", en: "Send campaigns segmented by customer group (new, repeat, abandoned cart) using Meta-approved message templates. Track every campaign live: sent, delivered, read — and the actual sales it generated." },
      points: [
        { ar: "استهداف بالشرائح والفلاتر", en: "Targeting by segments and filters" },
        { ar: "قوالب رسائل معتمدة رسمياً", en: "Officially approved message templates" },
        { ar: "تتبع تحويل المبيعات لكل حملة", en: "Sales conversion tracking per campaign" },
        { ar: "حملات آلية (استرداد السلة المتروكة، تنشيط العملاء الخاملين)", en: "Automated campaigns (abandoned-cart recovery, reactivating dormant customers)" }
      ]
    },
    {
      icon: "Bot",
      title: { ar: "الشات بوت الذكي", en: "Smart chatbot" },
      text: { ar: "محرر تدفقات بصري بلا كود: صمّم رحلة الرد الآلي بالسحب والإفلات، اختبرها قبل النشر، وحوّل المحادثة لموظف بشري في أي لحظة تحتاج تدخلاً إنسانياً.", en: "A visual, no-code flow editor: design the automated reply journey by drag and drop, test it before publishing, and hand the conversation to a human agent whenever it needs a personal touch." },
      points: [
        { ar: "محرر تدفقات بصري بلا كود", en: "Visual no-code flow editor" },
        { ar: "اختبار حي قبل النشر", en: "Live testing before publishing" },
        { ar: "تحويل سلس للموظف البشري", en: "Smooth hand-over to a human agent" },
        { ar: "ردود سريعة محفوظة للأسئلة المتكررة", en: "Saved quick replies for frequent questions" }
      ]
    },
    {
      icon: "Inbox",
      title: { ar: "CRM موحّد", en: "Unified CRM" },
      text: { ar: "صندوق محادثات واحد يجمع كل رسائل عملائك عبر واتساب، مع ملف عميل كامل (بيانات، مرحلة الشراء، سجل الطلبات) وأدوات فريق (تعيين المحادثات، ملاحظات داخلية، أدوار وصلاحيات).", en: "One inbox that gathers all your customers' WhatsApp messages, with a full customer profile (details, purchase stage, order history) and team tools (assigning conversations, internal notes, roles and permissions)." },
      points: [
        { ar: "صندوق محادثات موحّد للفريق كامل", en: "A unified inbox for the whole team" },
        { ar: "ملف عميل كامل وسجل تفاعلات", en: "Full customer profile and interaction history" },
        { ar: "تعيين المحادثات وملاحظات داخلية", en: "Conversation assignment and internal notes" },
        { ar: "أدوار وصلاحيات دقيقة لكل عضو", en: "Fine-grained roles and permissions per member" }
      ]
    },
    {
      icon: "ShoppingCart",
      title: { ar: "تكامل المتاجر", en: "Store integrations" },
      text: { ar: "ربط حقيقي مع منصتي زد وسلة يزامن طلباتك ومنتجاتك تلقائياً، ويتيح حملات استرداد السلة المتروكة بلا أي تدخل يدوي.", en: "Real integration with Zid and Salla that syncs your orders and products automatically and runs abandoned-cart recovery campaigns with no manual work." },
      points: [
        { ar: "مزامنة تلقائية للطلبات والمنتجات", en: "Automatic order and product sync" },
        { ar: "استرداد السلة المتروكة آلياً", en: "Automatic abandoned-cart recovery" },
        { ar: "ربط رقم واتساب Cloud API يدوياً أيضاً", en: "Manual WhatsApp Cloud API number connection too" }
      ]
    },
    {
      icon: "ShieldCheck",
      title: { ar: "الربط الرسمي مع واتساب (Meta)", en: "Official WhatsApp connection (Meta)" },
      text: { ar: "المنصة مبنية على WhatsApp Business Platform الرسمي من Meta — موثوقية أعلى، إمكانية استخدام قوالب رسائل معتمدة، ودعم لفريق أكبر على نفس الرقم.", en: "The platform is built on Meta's official WhatsApp Business Platform — higher reliability, approved message templates, and support for a larger team on the same number." },
      points: [
        { ar: "بناء على WhatsApp Business Platform الرسمي", en: "Built on the official WhatsApp Business Platform" },
        { ar: "قوالب رسائل معتمدة من Meta", en: "Meta-approved message templates" },
        { ar: "دعم فريق متعدد على نفس رقم واتساب", en: "Multiple team members on the same WhatsApp number" }
      ]
    }
  ] as (Item & { points: L[] })[],

  channelsTitle: { ar: "القنوات والأدوات *في مكان واحد*", en: "Channels and tools *in one place*" } as L,
  channelsSub: { ar: "اربط قنواتك الحقيقية، وأدر كل تفاعل مع عملائك من نفس لوحة التحكم.", en: "Connect your real channels and manage every customer interaction from the same dashboard." } as L,
  channelsLabel: { ar: "القنوات", en: "Channels" } as L,
  toolsLabel: { ar: "الأدوات", en: "Tools" } as L,
  channels: [
    { icon: "MessagesSquare", brand: "whatsapp", title: { ar: "واتساب API", en: "WhatsApp API" }, text: { ar: "ربط رسمي مع WhatsApp Business Platform تحت علامتك التجارية.", en: "Official connection to the WhatsApp Business Platform under your brand." } },
    { icon: "ShoppingBag", brand: null, title: { ar: "زد (Zid)", en: "Zid" }, text: { ar: "مزامنة تلقائية لطلبات ومنتجات متجرك على منصة زد.", en: "Automatic sync of your Zid store's orders and products." } },
    { icon: "ShoppingCart", brand: null, title: { ar: "سلة (Salla)", en: "Salla" }, text: { ar: "مزامنة تلقائية لطلبات ومنتجات متجرك على منصة سلة.", en: "Automatic sync of your Salla store's orders and products." } },
    { icon: "Sparkles", brand: null, title: { ar: "قنوات جديدة قريباً", en: "More channels soon" }, text: { ar: "نعمل على إضافة قنوات وتكاملات جديدة — ترقّب التحديثات.", en: "New channels and integrations are on the way — stay tuned." } }
  ] as (Item & { brand: string | null })[],
  tools: [
    { icon: "Megaphone", title: { ar: "الحملات", en: "Campaigns" }, text: { ar: "أرسل حملات جماعية وأتمتة استرداد السلة المتروكة.", en: "Bulk campaigns and automated abandoned-cart recovery." } },
    { icon: "Users", title: { ar: "جهات الاتصال", en: "Contacts" }, text: { ar: "نظام CRM بسيط مبني حول محادثات عملائك الفعلية.", en: "A simple CRM built around your real customer conversations." } },
    { icon: "Inbox", title: { ar: "صندوق الوارد", en: "Inbox" }, text: { ar: "صندوق محادثات موحّد لكل فريقك على قناة واحدة.", en: "One shared inbox for your whole team on one channel." } },
    { icon: "Bot", title: { ar: "الموظف الذكي", en: "AI agent" }, text: { ar: "مساعد ذكاء اصطناعي يردّ بالعربية والإنجليزية.", en: "An AI assistant that replies in Arabic and English." } },
    { icon: "LayoutTemplate", title: { ar: "قوالب الرسائل", en: "Message templates" }, text: { ar: "قوالب معتمدة من Meta جاهزة لحملاتك ومحادثاتك.", en: "Meta-approved templates ready for your campaigns and chats." } }
  ] as Item[],

  solutionsTitle: { ar: "حلول تناسب *نشاطك وفريقك*", en: "Solutions for *your business and team*" } as L,
  solutionsSub: { ar: "منصة واحدة تتكيّف مع طبيعة عملك، أياً كان قطاعك أو حجم فريقك.", en: "One platform that adapts to how you work, whatever your industry or team size." } as L,
  byIndustry: { ar: "حسب القطاع", en: "By industry" } as L,
  byTeam: { ar: "حسب الفريق", en: "By team" } as L,
  industries: [
    { icon: "GraduationCap", title: { ar: "التعليم", en: "Education" }, text: { ar: "تواصل مع الطلاب وأولياء الأمور عبر واتساب", en: "Reach students and parents on WhatsApp" } },
    { icon: "Building2", title: { ar: "العقارات", en: "Real estate" }, text: { ar: "أرسل تفاصيل العقارات ونظّم مواعيد المعاينة", en: "Send property details and organize viewings" } },
    { icon: "Globe", title: { ar: "السفر والضيافة", en: "Travel & hospitality" }, text: { ar: "حوّل الاستفسارات إلى حجوزات مؤكدة", en: "Turn inquiries into confirmed bookings" } },
    { icon: "Stethoscope", title: { ar: "الرعاية الصحية", en: "Healthcare" }, text: { ar: "ذكّر المرضى بالمواعيد ونظّم المتابعات", en: "Remind patients of appointments and organize follow-ups" } },
    { icon: "ShoppingBag", title: { ar: "التجزئة والتجارة الإلكترونية", en: "Retail & e-commerce" }, text: { ar: "استرجع السلال المتروكة وزد المبيعات", en: "Recover abandoned carts and grow sales" } },
    { icon: "Package", title: { ar: "الأطعمة والمشروبات", en: "Food & beverage" }, text: { ar: "استقبل الطلبات والحجوزات عبر واتساب", en: "Take orders and reservations on WhatsApp" } }
  ] as Item[],
  teams: [
    { icon: "TrendingUp", title: { ar: "المبيعات", en: "Sales" }, text: { ar: "أغلق صفقات أكثر عبر محادثات منظّمة", en: "Close more deals through organized conversations" } },
    { icon: "Megaphone", title: { ar: "التسويق", en: "Marketing" }, text: { ar: "نفّذ حملاتك بشرائح عملاء دقيقة", en: "Run campaigns with precise customer segments" } },
    { icon: "Headset", title: { ar: "الدعم الفني", en: "Support" }, text: { ar: "ردّ أسرع على استفسارات العملاء عبر قناة واحدة", en: "Faster answers to customer questions on one channel" } }
  ] as Item[],

  visionTitle: { ar: "رؤيتنا", en: "Our vision" } as L,
  vision: {
    ar: "نؤمن أن واتساب سيبقى القناة الأولى للتواصل التجاري في منطقتنا لسنوات قادمة، وأن الفارق الحقيقي بين الأنشطة التجارية لن يكون في وجودها على واتساب، بل في مدى تنظيم وأتمتة هذا التواصل. رؤيتنا أن يصبح كل تاجر — من صاحب متجر صغير إلى سلسلة متاجر كبيرة — قادراً على إدارة آلاف المحادثات بنفس جودة الرد على أول عميل، عبر أتمتة ذكية لا تُفقد فيها اللمسة الإنسانية.",
    en: "We believe WhatsApp will remain the leading channel for business communication in our region for years to come, and that the real difference between businesses won't be whether they are on WhatsApp, but how organized and automated that communication is. Our vision is for every merchant — from a small shop owner to a large chain — to handle thousands of conversations with the same quality as the reply to their very first customer, through smart automation that never loses the human touch."
  } as L,
  methodTitle: { ar: "منهجيتنا: *من التسجيل إلى النتائج*", en: "Our method: *from sign-up to results*" } as L,
  method: [
    { icon: "ClipboardList", title: { ar: "التسجيل", en: "Sign up" }, text: { ar: "قدّم طلب انضمامك واختر الباقة المناسبة لحجم نشاطك.", en: "Apply to join and choose the plan that fits your business size." } },
    { icon: "Plug", title: { ar: "ربط المتجر وواتساب", en: "Connect your store and WhatsApp" }, text: { ar: "اربط رقم واتساب بيزنس الرسمي، ومتجرك الإلكتروني إن وُجد (زد أو سلة).", en: "Connect your official WhatsApp Business number and your online store if you have one (Zid or Salla)." } },
    { icon: "Bot", title: { ar: "إعداد الشات بوت", en: "Set up the chatbot" }, text: { ar: "صمّم تدفق الرد الآلي الأول لأسئلتك المتكررة، واختبره قبل النشر.", en: "Design your first automated reply flow for frequent questions and test it before publishing." } },
    { icon: "Megaphone", title: { ar: "إطلاق الحملات", en: "Launch campaigns" }, text: { ar: "أرسل أول حملة مستهدفة لعملائك، أو فعّل حملة آلية لاسترداد السلة المتروكة.", en: "Send your first targeted campaign, or switch on an automated abandoned-cart recovery campaign." } },
    { icon: "ChartLine", title: { ar: "نتائج قابلة للقياس", en: "Measurable results" }, text: { ar: "تابع معدلات الرد والتحويل والمبيعات الناتجة من كل حملة وتدفق بوت، وحسّن باستمرار.", en: "Track reply rates, conversions and the sales from every campaign and bot flow — and keep improving." } }
  ] as Item[],

  faqTitle: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" } as L,
  faq: [
    { q: { ar: "متى تُطلق المنصة؟", en: "When does the platform launch?" }, a: { ar: "المنصة قيد الإطلاق. سجّل اهتمامك وسنتواصل معك فور فتح الاشتراكات.", en: "The platform is about to launch. Register your interest and we'll contact you as soon as subscriptions open." } },
    { q: { ar: "هل الربط مع واتساب رسمي؟", en: "Is the WhatsApp connection official?" }, a: { ar: "نعم، المنصة مبنية على WhatsApp Business Platform الرسمي من Meta، مع قوالب رسائل معتمدة ودعم لفريق متعدد على نفس الرقم.", en: "Yes — it's built on Meta's official WhatsApp Business Platform, with approved message templates and support for multiple team members on one number." } },
    { q: { ar: "هل تتكامل مع متجري؟", en: "Does it integrate with my store?" }, a: { ar: "نعم، مع زد وسلة لمزامنة الطلبات والمنتجات تلقائياً وتشغيل حملات استرداد السلة المتروكة، ويمكن أيضاً ربط رقم واتساب Cloud API يدوياً.", en: "Yes — with Zid and Salla to sync orders and products automatically and run abandoned-cart recovery, and you can also connect a WhatsApp Cloud API number manually." } },
    { q: { ar: "هل توجد فترة تجريبية مجانية؟", en: "Is there a free trial?" }, a: { ar: "نعم، كل باقة تبدأ بفترة تجريبية مجانية تتيح لك تجربة المنصة كاملة قبل أي التزام مالي.", en: "Yes — every plan starts with a free trial so you can try the full platform before any financial commitment." } },
    { q: { ar: "هل يمكنني تغيير باقتي لاحقاً؟", en: "Can I change my plan later?" }, a: { ar: "نعم، يمكنك الترقية أو التخفيض في أي وقت من لوحة التحكم، ويُحتسب الفرق تلقائياً في فاتورتك التالية.", en: "Yes — upgrade or downgrade anytime from the dashboard; the difference is applied to your next invoice automatically." } },
    { q: { ar: "ماذا يحدث إذا تجاوزت حد الرسائل الشهري؟", en: "What if I exceed my monthly message limit?" }, a: { ar: "سنُشعرك عند اقترابك من الحد، ويمكنك الترقية لباقة أعلى فوراً من لوحة الفوترة لتفادي أي انقطاع.", en: "We'll notify you as you approach the limit, and you can upgrade instantly from the billing page to avoid any interruption." } },
    { q: { ar: "هل الأسعار تشمل ضريبة القيمة المضافة؟", en: "Do prices include VAT?" }, a: { ar: "الأسعار المعروضة قبل الضريبة، وتُضاف ضريبة القيمة المضافة وفق الأنظمة المعمول بها عند إصدار الفاتورة.", en: "Prices are shown before tax; VAT is added according to the applicable regulations when the invoice is issued." } },
    { q: { ar: "هل يمكنني إلغاء اشتراكي في أي وقت؟", en: "Can I cancel anytime?" }, a: { ar: "نعم، لا يوجد التزام بعقد طويل الأجل — يمكنك إلغاء الاشتراك من لوحة الفوترة مباشرة.", en: "Yes — there's no long-term contract; you can cancel directly from the billing page." } }
  ] as { q: L; a: L }[]
};
