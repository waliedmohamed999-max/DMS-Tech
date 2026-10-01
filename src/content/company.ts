import type { AiCard, Feature, ProcessPhase, Value, L } from "./types";

/** NOVA AI — the company's own platform */
export const nova = {
  title: { ar: "NOVA AI", en: "NOVA AI" } as L,
  tagline: {
    ar: "منصتنا الذكية للأتمتة والرؤى وتفاعل العملاء",
    en: "Our intelligent platform for automation, insights and customer engagement"
  } as L,
  description: {
    ar: "تساعد NOVA AI الشركات على توحيد المحادثات، وأتمتة سير العمل، واستخراج الرؤى، وتقديم تجارب رقمية أسرع.",
    en: "NOVA AI helps businesses centralize conversations, automate workflows, surface insights and deliver faster digital experiences."
  } as L,
  image: "/images/photos/nova.jpg",
  features: [
    { icon: "Bot", title: { ar: "مساعد ذكي", en: "Smart Assistant" }, description: { ar: "يرد على عملائك ويساعد فريقك على مدار الساعة.", en: "Answers customers and assists your team around the clock." } },
    { icon: "FileSearch", title: { ar: "البحث في المعرفة", en: "Knowledge Search" }, description: { ar: "إجابات فورية من مستنداتك وقاعدة معرفتك.", en: "Instant answers from your documents and knowledge base." } },
    { icon: "Workflow", title: { ar: "محرك سير العمل", en: "Workflow Engine" }, description: { ar: "أتمتة المهام والموافقات والتسليم بين الفرق.", en: "Automate tasks, approvals and hand-offs between teams." } },
    { icon: "ChartColumn", title: { ar: "لوحة التحليلات", en: "Analytics Dashboard" }, description: { ar: "مؤشرات الأداء والمحادثات في لوحة واحدة.", en: "KPIs and conversations in a single dashboard." } },
    { icon: "Network", title: { ar: "تكامل متعدد القنوات", en: "Omnichannel Integration" }, description: { ar: "واتساب والموقع والسوشيال في مكان واحد.", en: "WhatsApp, web and social in one place." } }
  ] satisfies Feature[],
  badges: [
    { icon: "Lightbulb", label: { ar: "من تطوير DMS Tech", en: "Built by DMS Tech" } },
    { icon: "Server", label: { ar: "قابلة للتوسع", en: "Scalable" } },
    { icon: "ShieldCheck", label: { ar: "آمنة", en: "Secure" } },
    { icon: "Target", label: { ar: "قابلة للتنفيذ", en: "Actionable" } }
  ] as const
};

/** Home — Wrike-style AI bento grid */
export const aiCards: AiCard[] = [
  {
    icon: "Sparkles",
    size: "lg",
    title: { ar: "NOVA AI", en: "NOVA AI" },
    description: {
      ar: "منصة واحدة توحّد محادثاتك، وتؤتمت سير العمل، وتستخرج الرؤى، وتقدّم تجارب رقمية أسرع لعملائك.",
      en: "One platform that centralizes conversations, automates workflows, surfaces insights and delivers faster digital experiences."
    },
    cta: { ar: "اكتشف NOVA AI", en: "Discover NOVA AI" },
    href: "/nova-ai"
  },
  {
    icon: "Bot",
    size: "md",
    title: { ar: "المساعدات الذكية", en: "AI assistants" },
    description: { ar: "مساعدات ذكية تتولى الدعم والمبيعات والعمليات اليومية نيابةً عن فريقك.", en: "Smart assistants that handle everyday support, sales and operations for your team." },
    cta: { ar: "استكشف المساعدات", en: "Explore assistants" },
    href: "/services/ai-automation"
  },
  {
    icon: "Workflow",
    size: "md",
    title: { ar: "أتمتة سير العمل", en: "Workflow automation" },
    description: { ar: "أتمت المهام والموافقات المتكررة وقلّل العمل اليدوي في كل قسم.", en: "Automate repetitive tasks and approvals and cut manual work across departments." },
    cta: { ar: "ابدأ الأتمتة", en: "Start automating" },
    href: "/services/ai-automation"
  },
  {
    icon: "ChartLine",
    size: "sm",
    title: { ar: "رؤى البيانات", en: "Data insights" },
    description: { ar: "حوّل بياناتك الخام إلى تقارير ولوحات قابلة للتنفيذ.", en: "Turn raw data into actionable reports and dashboards." },
    cta: { ar: "اكتشف الرؤى", en: "Unlock insights" },
    href: "/services/digital-transformation"
  },
  {
    icon: "Cable",
    size: "sm",
    title: { ar: "تكامل الأنظمة و API", en: "Systems & API integration" },
    description: { ar: "اربط أدواتك ومنصاتك ببعضها بأمان عبر واجهات API.", en: "Securely connect your tools and platforms through APIs." },
    cta: { ar: "اربط أنظمتك", en: "Connect your systems" },
    href: "/services/digital-transformation"
  }
];

/** Delivery process — rendered as Wrike's 5 phase tabs */
export const phases: ProcessPhase[] = [
  {
    slug: "discover",
    icon: "Search",
    tab: { ar: "الاكتشاف", en: "Discover" },
    title: { ar: "نفهم أعمالك قبل أن نكتب سطراً واحداً", en: "We understand your business before we write a line" },
    description: {
      ar: "نحدد الأهداف والمتطلبات ونرسم خريطة الفرص — لنعرف أين تصنع التقنية والأتمتة أكبر أثر في أعمالك.",
      en: "We map goals, requirements and opportunities — so we know exactly where technology and automation create the most impact."
    },
    image: "/images/photos/phase-discover.jpg",
    features: [
      { icon: "Target", label: { ar: "تحديد الأهداف", en: "Goal setting" }, href: "/about" },
      { icon: "ClipboardList", label: { ar: "جمع المتطلبات", en: "Requirements" }, href: "/about" },
      { icon: "SearchCheck", label: { ar: "أبحاث المستخدم", en: "User research" }, href: "/services/ux-ui-design" },
      { icon: "Lightbulb", label: { ar: "خريطة الفرص", en: "Opportunity mapping" }, href: "/about" }
    ]
  },
  {
    slug: "plan",
    icon: "ClipboardList",
    tab: { ar: "التخطيط", en: "Plan" },
    title: { ar: "رؤية كاملة للنطاق وخارطة الطريق", en: "Full visibility on scope and roadmap" },
    description: {
      ar: "نحدد النطاق وخارطة الطريق وهندسة الحل، مع تواصل شفاف في كل مرحلة حتى تعرف دائماً أين وصل مشروعك.",
      en: "We define scope, roadmap and solution architecture, with transparent communication at every stage so you always know where things stand."
    },
    image: "/images/photos/phase-plan.jpg",
    features: [
      { icon: "Route", label: { ar: "خارطة الطريق", en: "Roadmap" }, href: "/about" },
      { icon: "Network", label: { ar: "هندسة الحل", en: "Solution architecture" }, href: "/services/digital-transformation" },
      { icon: "Plug", label: { ar: "التكاملات", en: "Integrations" }, href: "/services/digital-transformation" },
      { icon: "LayoutDashboard", label: { ar: "لوحات المتابعة", en: "Dashboards" }, href: "/services/digital-transformation" }
    ]
  },
  {
    slug: "build",
    icon: "Cog",
    tab: { ar: "البناء", en: "Build" },
    title: { ar: "تنفيذ تقني يسرّع التسليم", en: "Technical execution that accelerates delivery" },
    description: {
      ar: "نصمم ونطوّر ونعدّ الأتمتة بمنهجية مرنة (Agile)، بإصدارات متتابعة تراها وتختبرها أولاً بأول.",
      en: "We design, develop and set up automation with an agile approach — shipping iterations you can see and test along the way."
    },
    image: "/images/photos/phase-build.jpg",
    features: [
      { icon: "PenTool", label: { ar: "التصميم", en: "Design" }, href: "/services/ux-ui-design" },
      { icon: "Globe", label: { ar: "تطوير الويب", en: "Web development" }, href: "/services/web-development" },
      { icon: "Smartphone", label: { ar: "تطبيقات الجوال", en: "Mobile apps" }, href: "/services/app-development" },
      { icon: "Bot", label: { ar: "إعداد الأتمتة", en: "Automation setup" }, href: "/services/ai-automation" }
    ]
  },
  {
    slug: "launch",
    icon: "Rocket",
    tab: { ar: "الإطلاق", en: "Launch" },
    title: { ar: "إطلاق واثق وفريق جاهز", en: "A confident launch and a ready team" },
    description: {
      ar: "نختبر وننشر ونمكّن فريقك من استخدام الحل بكفاءة من اليوم الأول — دون مفاجآت.",
      en: "We test, deploy and enable your team to use the solution efficiently from day one — with no surprises."
    },
    image: "/images/photos/phase-launch.jpg",
    features: [
      { icon: "ShieldCheck", label: { ar: "الاختبار والجودة", en: "Testing & QA" }, href: "/about" },
      { icon: "CloudUpload", label: { ar: "النشر", en: "Deployment" }, href: "/services/app-development" },
      { icon: "Users", label: { ar: "تمكين الفريق", en: "Team enablement" }, href: "/about" },
      { icon: "Headset", label: { ar: "الدعم", en: "Support" }, href: "/contact" }
    ]
  },
  {
    slug: "optimize",
    icon: "ChartNoAxesCombined",
    tab: { ar: "التحسين", en: "Optimize" },
    title: { ar: "تحليلات وتحسين مستمر للنمو", en: "Analytics and continuous growth" },
    description: {
      ar: "نقيس النتائج ونطوّر باستمرار، ونحوّل البيانات إلى قرارات تدعم نمو أعمالك على المدى الطويل.",
      en: "We measure results and keep iterating, turning data into decisions that support long-term growth."
    },
    image: "/images/photos/phase-optimize.jpg",
    features: [
      { icon: "ChartColumn", label: { ar: "التحليلات", en: "Analytics" }, href: "/services/digital-transformation" },
      { icon: "TrendingUp", label: { ar: "التسويق والنمو", en: "Growth marketing" }, href: "/services/digital-marketing" },
      { icon: "Workflow", label: { ar: "تحسين الأتمتة", en: "Automation tuning" }, href: "/services/ai-automation" },
      { icon: "Timer", label: { ar: "تحسين الأداء", en: "Performance" }, href: "/services/web-development" }
    ]
  }
];

/** Why DMS Tech */
export const values: Value[] = [
  { icon: "Lightbulb", title: { ar: "تفكير استراتيجي", en: "Strategic Thinking" }, description: { ar: "نبدأ من أهداف عملك لنبني حلولاً تخدم نموك الحقيقي.", en: "We start from your business goals to build what actually drives growth." } },
  { icon: "Settings", title: { ar: "تنفيذ تقني", en: "Technical Execution" }, description: { ar: "فريق يحوّل الأفكار إلى منتجات عالية الأداء والأمان.", en: "A team that turns ideas into secure, high-performance products." } },
  { icon: "Bot", title: { ar: "عقلية الأتمتة", en: "Automation Mindset" }, description: { ar: "نؤتمت كل ما يمكن أتمتته لتوفير الوقت والتكلفة.", en: "We automate everything that can be automated to save time and cost." } },
  { icon: "TrendingUp", title: { ar: "التركيز على النمو", en: "Growth Focus" }, description: { ar: "نقيس النتائج ونحسّن باستمرار لتحقيق أثر ملموس.", en: "We measure outcomes and keep improving for real impact." } }
];

export const promises = [
  { icon: "Users", label: { ar: "تسليم مرن (Agile)", en: "Agile Delivery" } },
  { icon: "MessageSquareMore", label: { ar: "تواصل شفاف", en: "Transparent Communication" } },
  { icon: "ChartColumn", label: { ar: "تنفيذ يركّز على النتائج", en: "Results-Driven Execution" } },
  { icon: "SlidersHorizontal", label: { ar: "حلول مرنة", en: "Flexible Solutions" } },
  { icon: "Crosshair", label: { ar: "تنفيذ يركّز على القطاع", en: "Industry-Focused Execution" } },
  { icon: "TrendingUp", label: { ar: "أثر قابل للقياس", en: "Measurable Impact" } }
] as const;

/** Home — Wrike "trusted platform" two cards */
export const trustCards = [
  {
    icon: "LayoutTemplate",
    title: { ar: "حلول جاهزة قابلة للتخصيص", en: "Ready-made, customizable solutions" },
    description: {
      ar: "قوالب ومسارات أتمتة مجرّبة تمنح مشروعك هيكلاً ثابتاً من اليوم الأول، ثم نخصصها بالكامل لطريقة عملك.",
      en: "Proven templates and automation flows give your project a solid structure from day one — then we tailor them to how you work."
    },
    cta: { ar: "ابدأ الآن", en: "Get started now" },
    href: "/quote"
  },
  {
    icon: "LifeBuoy",
    title: { ar: "دعم يفهم احتياجاتك", en: "Support that understands your needs" },
    description: {
      ar: "فريق يرافقك بعد الإطلاق بالدعم الفني والتطوير المستمر والتدريب، حتى يحقق الحل أفضل عائد لأعمالك.",
      en: "A team that stays with you after launch — technical support, continuous development and training so the solution keeps paying off."
    },
    cta: { ar: "تواصل مع فريقنا", en: "Talk to our team" },
    href: "/contact"
  }
] as const;

/** Capability "chips" shown in the setup section (monospace, Specify parser-style) */
export const capabilities: string[][] = [
  ["lead-qualify", "auto-follow-up", "whatsapp-flows", "sync-crm", "ai-assistant", "knowledge-search", "smart-routing"],
  ["to-zid", "to-salla", "to-shopify", "checkout-optimize", "catalog-import", "payments", "shipping-sync"],
  ["kpi-dashboard", "api-gateway", "erp-sync", "social-schedule", "ads-report", "seo-optimize", "design-system"]
];
