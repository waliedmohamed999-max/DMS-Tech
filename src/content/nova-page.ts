import type { IconName } from "@/components/ui/Icon";
import type { MockupKey } from "@/components/ui/ProductMockups";
import type { L } from "./types";

/**
 * NOVA AI page content (/nova-ai). Mirrors the NOVA platform's own landing page (texts in Arabic and English as
 * published there), rebuilt in the DMS Tech design. Sign-up / sign-in links live in company.ts (nova.app).
 * The FAQ answers only restate facts from that page.
 */
type Item = { icon: IconName; title: L; text: L };

export const novaPage = {
  eyebrow: { ar: "الذكاء الاصطناعي الذي يعرف شركتك", en: "The AI that knows your business" } as L,
  brain: { ar: "عقل NOVA", en: "NOVA Brain" } as L,
  heroTitle: { ar: "شركتك، مع *فريق نمو ذكي*", en: "Your company, with an *AI growth team*" } as L,
  heroSub: { ar: "خطّط. انشر. بِع. كل ذلك في مكان واحد.", en: "Plan. Publish. Sell. All in one place." } as L,
  startFree: { ar: "ابدأ الآن مجاناً", en: "Get started — it's free" } as L,
  trialNote: { ar: "مجاناً لمدة 14 يوماً. بالعربية والإنجليزية.", en: "Free for 14 days. Arabic & English." } as L,
  floating: [
    { icon: "CircleCheck", text: { ar: "محتوى الأسبوع جاهز لموافقتك", en: "This week's content is ready for approval" } },
    { icon: "MessagesSquare", text: { ar: "عميل مهتم جديد من واتساب", en: "New interested lead from WhatsApp" } }
  ] as { icon: IconName; text: L }[],
  sectionNav: [
    { id: "product", label: { ar: "المنتج", en: "Product" } },
    { id: "team", label: { ar: "الفريق الذكي", en: "AI Team" } },
    { id: "how", label: { ar: "كيف يعمل", en: "How it works" } },
    { id: "pricing", label: { ar: "الباقات", en: "Plans" } },
    { id: "faq", label: { ar: "الأسئلة الشائعة", en: "FAQ" } }
  ] as { id: string; label: L }[],

  channelsTitle: { ar: "يعمل مع قنواتك", en: "Works with your channels" } as L,
  channels: [
    { name: "Instagram", slug: "instagram" },
    { name: "Facebook", slug: "facebook" },
    { name: "LinkedIn", slug: "linkedin" },
    { name: "TikTok", slug: "tiktok" },
    { name: "WhatsApp", slug: "whatsapp" },
    { name: "Gmail", slug: "gmail" },
    { name: "Outlook", slug: null }
  ] as { name: string; slug: string | null }[],

  problem: {
    title: { ar: "عمل النمو مبعثر — *والذكاء الاصطناعي تائه بلا سياق*", en: "Growth work is scattered — *and AI is lost without context*" } as L,
    sub: {
      ar: "منشوراتك وعملاؤك ومحادثاتك موزعة على أدوات مختلفة، والذكاء الاصطناعي العام لا يرى شيئاً منها.",
      en: "Your posts, customers and conversations live in different tools. Generic AI can't see any of it."
    } as L,
    questions: [
      { ar: "أي منشور نجح؟", en: "Which post worked?" },
      { ar: "من ردّ؟", en: "Who replied?" },
      { ar: "هل هذا بأسلوبنا؟", en: "Is this on brand?" }
    ] as L[],
    items: [
      { icon: "Layers", title: { ar: "أدوات متفرقة", en: "Scattered tools" }, text: { ar: "المنشورات في تطبيق، والعملاء في آخر، والردود في ثالث — ولا شيء مترابط.", en: "Posts in one app, leads in another, replies in a third — nothing talks to anything." } },
      { icon: "Bot", title: { ar: "ذكاء اصطناعي عام", en: "Generic AI" }, text: { ar: "مساعدون لا يعرفون علامتك ولا عروضك ولا عملاءك، فيكتبون محتوى عاماً.", en: "Assistants that don't know your brand, your offers or your customers write generic content." } },
      { icon: "Timer", title: { ar: "متابعات ضائعة", en: "Missed follow-ups" }, text: { ar: "العملاء المحتملون يبردون بينما ينتقل الفريق بين النوافذ وينسخ السياق يدوياً.", en: "Leads go cold while the team switches tabs and copies context by hand." } }
    ] as Item[]
  },

  workspace: {
    title: { ar: "المحتوى والعملاء والمحادثات، *في مساحة عمل ذكية واحدة*", en: "Content, customers and conversations, *in one AI workspace*" } as L,
    sub: { ar: "كل ما يحتاجه فريق النمو، مبني حول عقل شركة واحد.", en: "Everything a growth team needs, built around one Company Brain." } as L,
    pillars: {
      studio: { ar: "استوديو المحتوى", en: "Content Studio" } as L,
      sales: { ar: "مكتب المبيعات", en: "Sales Desk" } as L,
      brain: { ar: "عقل الشركة", en: "Company Brain" } as L,
      inbox: { ar: "صندوق واتساب", en: "WhatsApp Inbox" } as L
    },
    /** The four pillars as an interactive tools explorer; points restate the modules listed below. */
    tools: [
      {
        icon: "PenTool",
        visual: "nova-studio",
        title: { ar: "استوديو المحتوى", en: "Content Studio" },
        text: { ar: "خطة محتوى أسبوعية جاهزة بأسلوب علامتك: منشورات وكاروسيل وصور، تصلك للموافقة ثم تُجدول وتُنشر على قنواتك.", en: "A weekly content plan in your brand voice: posts, carousels and images that arrive for approval, then get scheduled and published to your channels." },
        points: [{ ar: "خطط المحتوى والتقويم", en: "Content plans & calendar" }, { ar: "الكاروسيل واستوديو الصور", en: "Carousels & image studio" }, { ar: "الموافقات قبل النشر", en: "Approvals before publishing" }, { ar: "الحملات والقوالب", en: "Campaigns & templates" }]
      },
      {
        icon: "Route",
        visual: "nova-sales",
        title: { ar: "مكتب المبيعات", en: "Sales Desk" },
        text: { ar: "كل عميل محتمل في مسار مبيعات واضح، مع عروض الأسعار والمتابعات والاجتماعات — ومساعد ينبّهك للصفقات المتوقفة.", en: "Every lead in a clear pipeline, with quotes, follow-ups and meetings — and an assistant that flags stalled deals." },
        points: [{ ar: "العملاء المحتملون ومسار المبيعات", en: "Leads & pipeline" }, { ar: "عروض الأسعار", en: "Quotes" }, { ar: "المتابعات والاجتماعات", en: "Follow-ups & meetings" }, { ar: "نماذج العملاء", en: "Lead forms" }]
      },
      {
        icon: "Sparkles",
        visual: "nova-brain",
        title: { ar: "عقل الشركة", en: "Company Brain" },
        text: { ar: "يقرأ NOVA علامتك وعروضك وجمهورك ونتائجك السابقة قبل أن يكتب كلمة واحدة، ويتعلّم من النتائج الحقيقية كل أسبوع.", en: "NOVA reads your brand, offers, audience and past results before it writes a single word — and learns from real results every week." },
        points: [{ ar: "هوية العلامة وصوتها", en: "Brand kit & voice" }, { ar: "الرؤى والتحليلات", en: "Insights & analytics" }, { ar: "التقارير", en: "Reports" }, { ar: "العربية والإنجليزية", en: "Arabic & English" }]
      },
      {
        icon: "MessagesSquare",
        visual: "nova-inbox",
        title: { ar: "صندوق واتساب", en: "WhatsApp Inbox" },
        text: { ar: "ردود جاهزة يكتبها NOVA لعملائك على واتساب، ولا يُرسل شيء دون موافقة شخص من فريقك — وكل محادثة تتحول لفرصة في مسار المبيعات.", en: "NOVA drafts replies to your customers on WhatsApp, nothing is sent without a person on your team approving it — and every chat becomes a deal in the pipeline." },
        points: [{ ar: "صندوق الوارد", en: "Inbox" }, { ar: "ردود بانتظار موافقتك", en: "Replies awaiting approval" }, { ar: "الإشعارات", en: "Notifications" }, { ar: "سجل التدقيق والأمان", en: "Audit log & security" }]
      }
    ] as (Item & { points: L[]; visual: MockupKey })[],
    modules: [
      { icon: "PenTool", label: { ar: "خطط المحتوى", en: "Content plans" } },
      { icon: "Calendar", label: { ar: "التقويم", en: "Calendar" } },
      { icon: "CircleCheck", label: { ar: "الموافقات", en: "Approvals" } },
      { icon: "Megaphone", label: { ar: "الحملات", en: "Campaigns" } },
      { icon: "Columns", label: { ar: "الكاروسيل", en: "Carousels" } },
      { icon: "Image", label: { ar: "استوديو الصور", en: "Image studio" } },
      { icon: "ChartColumn", label: { ar: "التحليلات", en: "Analytics" } },
      { icon: "FileText", label: { ar: "التقارير", en: "Reports" } },
      { icon: "Users", label: { ar: "العملاء المحتملون", en: "Leads" } },
      { icon: "Route", label: { ar: "مسار المبيعات", en: "Pipeline" } },
      { icon: "Tag", label: { ar: "عروض الأسعار", en: "Quotes" } },
      { icon: "RotateCcw", label: { ar: "المتابعات", en: "Follow-ups" } },
      { icon: "CalendarClock", label: { ar: "الاجتماعات", en: "Meetings" } },
      { icon: "Inbox", label: { ar: "صندوق الوارد", en: "Inbox" } },
      { icon: "ClipboardList", label: { ar: "نماذج العملاء", en: "Lead forms" } },
      { icon: "Palette", label: { ar: "هوية العلامة", en: "Brand kit" } },
      { icon: "SlidersHorizontal", label: { ar: "الأدوار والصلاحيات", en: "Roles & permissions" } },
      { icon: "FileSearch", label: { ar: "سجل التدقيق", en: "Audit log" } },
      { icon: "Languages", label: { ar: "العربية والإنجليزية", en: "Arabic & English" } },
      { icon: "LayoutTemplate", label: { ar: "القوالب", en: "Templates" } },
      { icon: "Lightbulb", label: { ar: "الرؤى", en: "Insights" } },
      { icon: "Zap", label: { ar: "الإشعارات", en: "Notifications" } },
      { icon: "CreditCard", label: { ar: "الفوترة", en: "Billing" } },
      { icon: "ShieldCheck", label: { ar: "الأمان", en: "Security" } }
    ] as { icon: IconName; label: L }[]
  },

  team: {
    title: { ar: "عصر جديد من النمو، *مع فريقك الذكي*", en: "A new era of growth, *with your AI team*" } as L,
    build: { ar: "ابنِ فريقي الذكي", en: "Build my AI team" } as L,
    agents: [
      { icon: "Megaphone", title: { ar: "مدير التواصل الذكي", en: "AI Social Manager" }, text: { ar: "يخطط استراتيجية المحتوى", en: "Plans your content strategy" }, quote: { ar: "خططت للأسبوع القادم حول أفضل موضوعين أداءً لديك.", en: "I've planned next week around your two best-performing topics." } },
      { icon: "PenTool", title: { ar: "استراتيجي المحتوى", en: "Content Strategist" }, text: { ar: "يصنع الحملات والأفكار والنصوص والافتتاحيات", en: "Creates campaigns, topics, captions and hooks" }, quote: { ar: "7 نصوص جاهزة، لكل منها افتتاحية أقوى.", en: "7 captions ready, each with a stronger opening hook." } },
      { icon: "Palette", title: { ar: "المصمم الذكي", en: "AI Designer" }, text: { ar: "يصمم أفكاراً بصرية بهوية علامتك", en: "Creates branded visual concepts and creatives" }, quote: { ar: "ثلاثة منشورات دوّارة بألوانك وقواعد تصميمك.", en: "Three branded carousels, using your colors and layout rules." } },
      { icon: "ChartLine", title: { ar: "محلل الأداء", en: "Performance Analyst" }, text: { ar: "يقيّم الأداء ويقترح التحسينات", en: "Evaluates performance and recommends improvements" }, quote: { ar: "ارتفع الحفظ في المحتوى التعليمي. لنصنع المزيد منه.", en: "Saves rose on educational posts. Let's do more of those." } },
      { icon: "Handshake", title: { ar: "وكيل المبيعات الذكي", en: "AI Sales Agent" }, text: { ar: "يؤهّل العملاء المحتملين ويتابعهم", en: "Qualifies prospects and follows up with leads" }, quote: { ar: "طلب عميل جديد عرض سعر — جهّزت الرد.", en: "A new inquiry asked for a quote — I drafted the reply." } },
      { icon: "Target", title: { ar: "مساعد المبيعات", en: "Sales Assistant" }, text: { ar: "يتتبع الفرص والاعتراضات والخطوات التالية", en: "Tracks opportunities, objections and next actions" }, quote: { ar: "صفقتان لم تتحركا منذ أسبوعين. إليك دفعة بسيطة.", en: "Two deals haven't moved in two weeks. Here's a nudge." } }
    ] as (Item & { quote: L })[]
  },

  brainSection: {
    title: { ar: "أفضل ذكاء اصطناعي *هو ذكاؤك أنت*", en: "The best AI *is your AI*" } as L,
    sub: { ar: "متصل بالفعل بعلامتك التجارية ومحتواك وعملائك.", en: "Already plugged into your brand, your content and your customers." } as L,
    languages: { ar: "متاح بالعربية والإنجليزية", en: "Available in Arabic & English" } as L,
    pillars: {
      context: { title: { ar: "السياق", en: "Context" }, text: { ar: "يقرأ NOVA علامتك وعروضك وجمهورك ونتائجك السابقة قبل أن يكتب كلمة واحدة.", en: "NOVA reads your brand, offers, audience and past results before it writes a single word." } },
      approvals: { title: { ar: "الموافقات", en: "Approvals" }, text: { ar: "لا يُنشر أو يُرسل أو يُسعَّر شيء دون موافقة شخص من فريقك، وكل إجراء مسجّل.", en: "Nothing is published, sent or quoted without a person approving it. Every action is logged." } },
      learning: { title: { ar: "التعلّم", en: "Learning" }, text: { ar: "النتائج والمحادثات الحقيقية تعود إلى العقل، فيصبح كل أسبوع أدق من الذي قبله.", en: "Real results and conversations flow back into the brain, so every week is sharper than the last." } }
    },
    demo: {
      brainUpdated: { ar: "تم تحديث العقل", en: "Brain updated" } as L,
      brandVoice: { ar: "صوت العلامة:", en: "Brand voice:" } as L,
      voice: { ar: "دافئ، مباشر، خبير", en: "Warm, direct, expert" } as L,
      waiting: { ar: "بانتظار الموافقة", en: "Waiting for approval" } as L,
      offer: { ar: "عرض رمضان — 3 منشورات", en: "Ramadan offer — 3 posts" } as L,
      insight: { ar: "المنشورات التعليمية تتفوق على متوسطك", en: "Educational posts outperform your average" } as L
    }
  },

  how: {
    title: { ar: "اربط. افهم. أنشئ. *انمُ.*", en: "Connect. Understand. Create. *Grow.*" } as L,
    steps: [
      { icon: "Plug", title: { ar: "اربط", en: "Connect" }, text: { ar: "أخبرنا عن نشاطك واربط حساباتك خلال دقائق.", en: "Tell us about your business and connect your accounts in minutes." } },
      { icon: "BrainCircuit", title: { ar: "افهم", en: "Understand" }, text: { ar: "يتعلم فريقك علامتك وجمهورك وما ينجح بالفعل.", en: "Your team learns your brand, audience and what already works." } },
      { icon: "CircleCheck", title: { ar: "أنشئ ووافق", en: "Create & approve" }, text: { ar: "الخطط والمنشورات والردود تصلك جاهزة. وافق بلمسة واحدة.", en: "Plans, posts and replies arrive ready. You approve with one tap." } },
      { icon: "TrendingUp", title: { ar: "قِس وبِع", en: "Measure & sell" }, text: { ar: "النتائج الحقيقية تعود للفريق، ولكل عميل خطوة تالية.", en: "Real results feed back in, and every lead gets a next step." } }
    ] as Item[]
  },

  pricing: {
    title: { ar: "باقات بسيطة *تنمو معك*", en: "Simple plans that *grow with you*" } as L,
    sub: { ar: "ابدأ مجاناً لمدة 14 يوماً. تُؤكَّد الأسعار عند الدفع.", en: "Start free for 14 days. Pricing is confirmed at checkout." } as L,
    popular: { ar: "الأكثر اختياراً", en: "Most popular" } as L,
    cta: { ar: "ابدأ مجاناً", en: "Start free" } as L,
    plans: [
      { name: { ar: "البداية", en: "Starter" }, for: { ar: "لنشاط واحد يريد الاستمرارية", en: "For one business getting consistent" }, featured: false, features: [{ ar: "نشاط تجاري واحد", en: "1 business" }, { ar: "قناتا تواصل", en: "2 social channels" }, { ar: "مدير التواصل والاستراتيجي والمصمم", en: "Social Manager, Strategist & Designer" }, { ar: "تحليلات أساسية", en: "Basic analytics" }] },
      { name: { ar: "النمو", en: "Growth" }, for: { ar: "المحتوى والمبيعات معاً", en: "Content and sales working together" }, featured: true, features: [{ ar: "5 قنوات تواصل", en: "5 social channels" }, { ar: "وكيل ومساعد المبيعات", en: "AI Sales Agent & Assistant" }, { ar: "تحليلات متقدمة", en: "Advanced analytics" }, { ar: "استخدام أكبر للذكاء", en: "More AI usage" }] },
      { name: { ar: "التوسع", en: "Scale" }, for: { ar: "للفرق والعلامات المتعددة", en: "For teams and multiple brands" }, featured: false, features: [{ ar: "مقاعد للفريق وصلاحيات متقدمة", en: "Team seats & advanced permissions" }, { ar: "حدود أعلى", en: "Higher limits" }, { ar: "الأتمتة", en: "Automation" }, { ar: "أنشطة تجارية متعددة", en: "Multiple businesses" }] }
    ] as { name: L; for: L; featured: boolean; features: L[] }[]
  },

  faqTitle: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" } as L,
  faq: [
    { q: { ar: "ما هي NOVA؟", en: "What is NOVA?" }, a: { ar: "NOVA فريق نمو ذكي لشركتك: يخطط المحتوى وينشره ويتابع العملاء والمبيعات، كل ذلك في مساحة عمل واحدة مبنية حول «عقل الشركة» الذي يعرف علامتك وعروضك وعملاءك.", en: "NOVA is an AI growth team for your company: it plans and publishes content and follows up leads and sales, all in one workspace built around a Company Brain that knows your brand, offers and customers." } },
    { q: { ar: "هل يمكنني تجربتها مجاناً؟", en: "Can I try it for free?" }, a: { ar: "نعم، يمكنك البدء مجاناً لمدة 14 يوماً. تُؤكَّد الأسعار عند الدفع.", en: "Yes — you can start free for 14 days. Pricing is confirmed at checkout." } },
    { q: { ar: "هل تنشر NOVA أو ترسل شيئاً دون علمي؟", en: "Does NOVA publish or send anything without me?" }, a: { ar: "لا. لا يُنشر أو يُرسل أو يُسعَّر شيء دون موافقة شخص من فريقك، وكل إجراء مسجّل.", en: "No. Nothing is published, sent or quoted without a person on your team approving it, and every action is logged." } },
    { q: { ar: "ما القنوات التي تعمل معها؟", en: "Which channels does it work with?" }, a: { ar: "Instagram وFacebook وLinkedIn وTikTok وWhatsApp وGmail وOutlook.", en: "Instagram, Facebook, LinkedIn, TikTok, WhatsApp, Gmail and Outlook." } },
    { q: { ar: "هل تدعم اللغة العربية؟", en: "Does it support Arabic?" }, a: { ar: "نعم، NOVA متاحة بالعربية والإنجليزية.", en: "Yes — NOVA is available in Arabic and English." } },
    { q: { ar: "كيف أبدأ؟", en: "How do I get started?" }, a: { ar: "أنشئ حسابك، ثم أخبرنا عن نشاطك واربط حساباتك خلال دقائق. يتعلم فريقك الذكي علامتك وجمهورك، وتصلك الخطط والمنشورات والردود جاهزة لتوافق عليها.", en: "Create your account, tell us about your business and connect your accounts in minutes. Your AI team learns your brand and audience, and plans, posts and replies arrive ready for your approval." } },
    { q: { ar: "ما الفرق بين الباقات؟", en: "What's the difference between the plans?" }, a: { ar: "«البداية» لنشاط واحد بقناتي تواصل، و«النمو» يضيف وكيل ومساعد المبيعات و5 قنوات وتحليلات متقدمة، و«التوسع» للفرق والعلامات المتعددة مع صلاحيات متقدمة وأتمتة وحدود أعلى.", en: "Starter is for one business with 2 channels; Growth adds the AI Sales Agent & Assistant, 5 channels and advanced analytics; Scale is for teams and multiple brands, with advanced permissions, automation and higher limits." } }
  ] as { q: L; a: L }[],

  finalTitle: { ar: "فريق الذكاء الاصطناعي الوحيد *الذي يعرف شركتك فعلاً*", en: "The only AI team that *actually knows your business*" } as L,
  finalCta: { ar: "ابدأ مع NOVA", en: "Get started with NOVA" } as L,
  builtBy: { ar: "من تطوير DMS Tech", en: "Built by DMS Tech" } as L
};
