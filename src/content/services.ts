import type { Service } from "./types";

export const services: Service[] = [
  {
    slug: "ai-automation",
    icon: "BrainCircuit",
    image: "/images/photos/svc-ai.jpg",
    eyebrow: { ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
    title: { ar: "حلول الذكاء الاصطناعي وأتمتة الأعمال", en: "AI Solutions & Business Automation" },
    summary: {
      ar: "أنظمة ذكية تقلل العمل اليدوي وتحسّن القرارات",
      en: "Intelligent systems that reduce manual work"
    },
    description: {
      ar: "نبني أنظمة ذكية تقلل العمل اليدوي، وتحسّن جودة القرارات، وتبسّط عمليات أعمالك — من المساعدات الذكية حتى أتمتة سير العمل الكامل وربط أنظمتك ببعضها.",
      en: "We build intelligent systems that reduce manual work, improve decisions and streamline business operations — from smart assistants to end-to-end workflow automation and connected systems."
    },
    highlights: [
      { ar: "مساعدات ذكية للدعم والمبيعات", en: "Smart assistants for support and sales" },
      { ar: "أتمتة المهام والموافقات المتكررة", en: "Automate repetitive tasks and approvals" },
      { ar: "تحويل البيانات إلى رؤى قابلة للتنفيذ", en: "Turn data into actionable insights" }
    ],
    features: [
      { icon: "Bot", title: { ar: "المساعدات الذكية", en: "AI Assistants" }, description: { ar: "مساعدات ذكية للدعم والمبيعات والعمليات.", en: "Smart assistants for support, sales and operations." } },
      { icon: "Workflow", title: { ar: "أتمتة سير العمل", en: "Workflow Automation" }, description: { ar: "أتمتة المهام والموافقات المتكررة.", en: "Automate repetitive tasks and approvals." } },
      { icon: "ChartColumn", title: { ar: "البيانات والتقارير", en: "Data & Reporting" }, description: { ar: "تحويل البيانات إلى رؤى قابلة للتنفيذ.", en: "Transform data into actionable insights." } },
      { icon: "Cable", title: { ar: "تكامل الأنظمة", en: "System Integration" }, description: { ar: "ربط الأدوات وواجهات API ومنصات الأعمال.", en: "Connect tools, APIs and business platforms." } }
    ],
    benefits: [
      { icon: "Zap", label: { ar: "عمليات أسرع", en: "Faster Operations" } },
      { icon: "Settings", label: { ar: "عمل يدوي أقل", en: "Lower Manual Work" } },
      { icon: "ChartLine", label: { ar: "قرارات أفضل", en: "Better Decision-Making" } }
    ],
    order: 1
  },
  {
    slug: "whatsapp-automation",
    icon: "MessagesSquare",
    image: "/images/photos/svc-whatsapp.jpg",
    eyebrow: { ar: "واتساب", en: "WhatsApp" },
    title: { ar: "حلول وأتمتة واتساب", en: "WhatsApp Solutions & Automation" },
    summary: { ar: "حوّل المحادثات إلى تجربة عملاء أسرع وأذكى", en: "Turn conversations into a faster, smarter customer experience" },
    description: {
      ar: "نبني مسارات محادثة ذكية على واتساب تلتقط العملاء المحتملين، وتتابعهم تلقائياً، وتدير المبيعات والدعم، وتزامن كل تفاعل مع أنظمة أعمالك.",
      en: "We build smart WhatsApp flows that capture leads, follow up automatically, run sales and support, and sync every interaction with your business systems."
    },
    highlights: [
      { ar: "التقاط الاستفسارات وتوجيهها تلقائياً", en: "Capture and route inquiries automatically" },
      { ar: "تذكيرات ومتابعات تلقائية", en: "Automated reminders and follow-ups" },
      { ar: "مزامنة المحادثات مع CRM", en: "Sync conversations with your CRM" }
    ],
    features: [
      { icon: "Filter", title: { ar: "تأهيل العملاء المحتملين", en: "Lead Qualification" }, description: { ar: "التقاط الاستفسارات وتوجيهها تلقائياً.", en: "Capture and route inquiries automatically." } },
      { icon: "CalendarClock", title: { ar: "متابعات تلقائية", en: "Automated Follow-Ups" }, description: { ar: "إرسال التذكيرات والتحديثات ورسائل رعاية العملاء.", en: "Send reminders, updates and nurturing messages." } },
      { icon: "MessagesSquare", title: { ar: "مسارات المبيعات والدعم", en: "Sales & Support Flows" }, description: { ar: "الرد والمساعدة والتحويل عبر محادثات ذكية.", en: "Answer, assist and convert through smart conversations." } },
      { icon: "DatabaseZap", title: { ar: "التكامل مع CRM", en: "CRM Integration" }, description: { ar: "مزامنة تفاعلات واتساب مع أنظمة أعمالك.", en: "Sync WhatsApp interactions with your business systems." } }
    ],
    benefits: [
      { icon: "Zap", label: { ar: "استجابة أسرع", en: "Faster Response" } },
      { icon: "TrendingUp", label: { ar: "تفاعل أعلى", en: "Higher Engagement" } },
      { icon: "Clock", label: { ar: "متاح 24/7", en: "24/7 Availability" } }
    ],
    order: 2
  },
  {
    slug: "web-development",
    icon: "MonitorSmartphone",
    image: "/images/photos/svc-web.jpg",
    eyebrow: { ar: "المواقع الإلكترونية", en: "Websites" },
    title: { ar: "تصميم وتطوير المواقع", en: "Website Design & Development" },
    summary: { ar: "مواقع تركّز على التحويل وتأثير العلامة التجارية", en: "Conversion-focused websites for brand impact" },
    description: {
      ar: "مواقع مصممة لتعزيز حضور علامتك التجارية وتحقيق نمو أعمالك — سريعة، متجاوبة مع كل الأجهزة، ومحسّنة لمحركات البحث.",
      en: "Conversion-focused websites crafted for brand impact and business growth — fast, responsive on every device and optimized for search."
    },
    highlights: [
      { ar: "مواقع شركات احترافية", en: "Professional corporate websites" },
      { ar: "صفحات هبوط مصممة للتحويل", en: "Landing pages designed to convert" },
      { ar: "أداء سريع وتحسين لمحركات البحث", en: "Fast performance and SEO" }
    ],
    features: [
      { icon: "Monitor", title: { ar: "مواقع الشركات", en: "Corporate Websites" }, description: { ar: "حضور رقمي احترافي لأعمالك.", en: "Professional digital presence for your business." } },
      { icon: "MousePointerClick", title: { ar: "صفحات الهبوط", en: "Landing Pages" }, description: { ar: "صفحات مركّزة مصممة للتحويل.", en: "Focused pages designed to convert." } },
      { icon: "PenTool", title: { ar: "تصميم UX / UI", en: "UX / UI Design" }, description: { ar: "تجارب واضحة وحديثة وسهلة الاستخدام.", en: "Clear, modern and user-friendly experiences." } },
      { icon: "Gauge", title: { ar: "الأداء و SEO", en: "Performance & SEO" }, description: { ar: "تحميل سريع، تجاوب كامل، وتحسين مستمر.", en: "Fast loading, responsive and optimized." } }
    ],
    benefits: [
      { icon: "Monitor", label: { ar: "سطح المكتب", en: "Desktop" } },
      { icon: "Smartphone", label: { ar: "الجوال", en: "Mobile" } },
      { icon: "Gauge", label: { ar: "أداء عالٍ", en: "High Performance" } }
    ],
    order: 3
  },
  {
    slug: "app-development",
    icon: "Smartphone",
    image: "/images/photos/svc-apps.jpg",
    eyebrow: { ar: "تطوير التطبيقات", en: "App Development" },
    title: { ar: "خدمات تطوير التطبيقات", en: "Application Development Services" },
    summary: { ar: "من الفكرة حتى الإطلاق، نبني منتجات رقمية قابلة للتوسع", en: "From concept to launch, we build scalable digital products" },
    description: {
      ar: "نبني تطبيقات ويب وجوال وأنظمة إدارة داخلية مع تكاملات آمنة وسحابية — مصممة للأداء والأمان والنمو طويل المدى.",
      en: "We build web and mobile applications and internal admin systems with secure, cloud-ready integrations — built for performance, security and long-term growth."
    },
    highlights: [
      { ar: "منصات وبوابات ولوحات تحكم", en: "Platforms, portals and dashboards" },
      { ar: "تطبيقات iOS و Android", en: "iOS and Android apps" },
      { ar: "تكامل خلفي آمن ونشر سحابي", en: "Secure back-end and cloud deployment" }
    ],
    features: [
      { icon: "Globe", title: { ar: "تطبيقات الويب", en: "Web Applications" }, description: { ar: "منصات وبوابات ولوحات تحكم حديثة.", en: "Modern platforms, portals and dashboards." } },
      { icon: "Smartphone", title: { ar: "تطبيقات الجوال", en: "Mobile App Solutions" }, description: { ar: "تجارب متعددة المنصات لـ iOS و Android.", en: "Cross-platform experiences for iOS and Android." } },
      { icon: "Settings", title: { ar: "أنظمة الإدارة", en: "Admin Systems" }, description: { ar: "أدوات داخلية للفرق والعمليات.", en: "Internal tools for teams and operations." } },
      { icon: "Cloud", title: { ar: "API والتكامل السحابي", en: "API & Cloud Integration" }, description: { ar: "اتصال خلفي آمن ونشر موثوق.", en: "Secure back-end connectivity and deployment." } }
    ],
    benefits: [
      { icon: "Gauge", label: { ar: "الأداء", en: "Performance" } },
      { icon: "ShieldCheck", label: { ar: "الأمان", en: "Security" } },
      { icon: "TrendingUp", label: { ar: "نمو طويل المدى", en: "Long-term Growth" } }
    ],
    order: 4
  },
  {
    slug: "ecommerce",
    icon: "ShoppingCart",
    image: "/images/photos/svc-ecommerce.jpg",
    eyebrow: { ar: "التجارة الإلكترونية", en: "E-Commerce" },
    title: { ar: "إطلاق المتاجر الإلكترونية", en: "E-Commerce Store Setup" },
    summary: { ar: "إطلاق وتنمية المتاجر على زد وسلة وشوبيفاي", en: "Launch and grow online stores on Zid, Salla and Shopify" },
    description: {
      ar: "نطلق متجرك الإلكتروني وننمّيه على زد وسلة وشوبيفاي — من الهيكلة والتصميم حتى الدفع والشحن وإدارة المنتجات. مصمم ليساعد متجرك على البيع أكثر بعوائق أقل.",
      en: "We launch and grow your online store on Zid, Salla and Shopify — from structure and design to payments, shipping and catalog management. Designed to help your store sell more with less friction."
    },
    highlights: [
      { ar: "إطلاق وإعداد المتجر بالكامل", en: "Complete store launch and setup" },
      { ar: "واجهات متاجر مصممة للتحويل", en: "Storefronts built for conversion" },
      { ar: "ربط الدفع والشحن والعمليات", en: "Payments, shipping and operations" }
    ],
    features: [
      { icon: "Rocket", title: { ar: "إطلاق وإعداد المتجر", en: "Store Launch & Setup" }, description: { ar: "من الهيكلة حتى الإعداد الكامل.", en: "From structure to complete configuration." } },
      { icon: "Palette", title: { ar: "الثيم وتجربة المستخدم", en: "Theme & User Experience" }, description: { ar: "واجهات متاجر نظيفة مصممة للتحويل.", en: "Clean storefronts built for conversion." } },
      { icon: "CreditCard", title: { ar: "الدفع والشحن", en: "Payments & Shipping" }, description: { ar: "ربط الدفع والتوصيل والعمليات.", en: "Integrate checkout, delivery and operations." } },
      { icon: "Package", title: { ar: "إدارة الكتالوج", en: "Catalog Management" }, description: { ar: "المنتجات والمجموعات والعرض التجاري.", en: "Products, collections and merchandising." } }
    ],
    benefits: [
      { icon: "ShoppingBag", label: { ar: "زد", en: "Zid" } },
      { icon: "ShoppingBag", label: { ar: "سلة", en: "Salla" } },
      { icon: "ShoppingBag", label: { ar: "شوبيفاي", en: "Shopify" } }
    ],
    order: 5
  },
  {
    slug: "digital-marketing",
    icon: "Megaphone",
    image: "/images/photos/svc-marketing.jpg",
    eyebrow: { ar: "التسويق والإبداع", en: "Marketing & Creative" },
    title: { ar: "التسويق الرقمي والتصميم الإبداعي", en: "Digital Marketing & Creative Design" },
    summary: { ar: "حملات ومحتوى وتصاميم تقوّي علامتك وتحقق النمو", en: "Campaigns, content and visuals that drive growth" },
    description: {
      ar: "حملات ومحتوى وتصاميم تقوّي علامتك التجارية وتحقق النمو — مصممة لجذب الانتباه، وبناء الثقة، وتحقيق التحويل.",
      en: "Campaigns, content and visuals that strengthen your brand and drive growth — designed to attract attention, build trust and convert."
    },
    highlights: [
      { ar: "محتوى واستراتيجية للمنصات", en: "Content and platform strategy" },
      { ar: "حملات إعلانية بنتائج قابلة للقياس", en: "Performance campaigns with measurable reach" },
      { ar: "هوية بصرية تميّز علامتك", en: "Distinctive visual identity" }
    ],
    features: [
      { icon: "Share2", title: { ar: "إدارة وسائل التواصل", en: "Social Media Marketing" }, description: { ar: "محتوى جذاب واستراتيجية لكل منصة.", en: "Engaging content and platform strategy." } },
      { icon: "TrendingUp", title: { ar: "الإعلانات الممولة", en: "Paid Advertising" }, description: { ar: "حملات أداء بوصول قابل للقياس.", en: "Performance campaigns for measurable reach." } },
      { icon: "PenTool", title: { ar: "الهوية البصرية", en: "Branding & Visual Identity" }, description: { ar: "تصاميم مميزة ترفع من صورة علامتك.", en: "Distinctive visuals that elevate perception." } },
      { icon: "Image", title: { ar: "التصاميم الإبداعية", en: "Creative Design Assets" }, description: { ar: "منشورات وعروض تقديمية ومواد تسويقية.", en: "Posts, presentations and marketing materials." } }
    ],
    benefits: [
      { icon: "Target", label: { ar: "جذب الانتباه", en: "Attract Attention" } },
      { icon: "Handshake", label: { ar: "بناء الثقة", en: "Build Trust" } },
      { icon: "TrendingUp", label: { ar: "تحقيق التحويل", en: "Convert" } }
    ],
    order: 6
  },
  {
    slug: "digital-transformation",
    icon: "Network",
    image: "/images/photos/svc-transformation.jpg",
    eyebrow: { ar: "التحول الرقمي", en: "Digital Transformation" },
    title: { ar: "التحول الرقمي وتكامل الأنظمة", en: "Digital Transformation & Systems Integration" },
    summary: { ar: "اربط الفرق والأدوات والبيانات في سير عمل واحد", en: "Connect teams, tools and data into one workflow" },
    description: {
      ar: "نساعد الشركات على توحيد عملياتها عبر تكاملات API والأنظمة السحابية ولوحات البيانات الذكية — لتربط الفرق والأدوات والبيانات في سير عمل واحد عالي الأداء.",
      en: "We help businesses unify operations through API integrations, cloud systems and smart dashboards — connecting teams, tools and data into one high-performance workflow."
    },
    highlights: [
      { ar: "ربط التطبيقات ومصادر البيانات", en: "Connect apps and data sources" },
      { ar: "مزامنة CRM و ERP", en: "CRM & ERP sync" },
      { ar: "لوحات مؤشرات لحظية", en: "Real-time KPI dashboards" }
    ],
    features: [
      { icon: "Link", title: { ar: "تكاملات API", en: "API Integrations" }, description: { ar: "ربط التطبيقات ومصادر البيانات والمنصات الخارجية.", en: "Connect apps, data sources and third-party platforms." } },
      { icon: "DatabaseZap", title: { ar: "مزامنة CRM و ERP", en: "CRM & ERP Sync" }, description: { ar: "توحيد بيانات المبيعات والعمليات والعملاء.", en: "Align sales, operations and customer data." } },
      { icon: "LayoutDashboard", title: { ar: "لوحات بيانات مخصصة", en: "Custom Dashboards" }, description: { ar: "تتبّع مؤشرات الأداء بشكل لحظي.", en: "Track KPIs with real-time visibility." } },
      { icon: "CloudUpload", title: { ar: "سير عمل سحابي", en: "Cloud Workflows" }, description: { ar: "تحديث العمليات بأتمتة قابلة للتوسع.", en: "Modernize operations with scalable automation." } }
    ],
    benefits: [
      { icon: "Server", label: { ar: "أنظمة مترابطة", en: "Connected Systems" } },
      { icon: "ChartColumn", label: { ar: "رؤى لحظية", en: "Real-Time Insights" } },
      { icon: "TrendingUp", label: { ar: "عمليات قابلة للتوسع", en: "Scalable Operations" } }
    ],
    order: 7
  },
  {
    slug: "ux-ui-design",
    icon: "PenTool",
    image: "/images/photos/svc-ux.jpg",
    eyebrow: { ar: "تجربة المستخدم", en: "UX / UI" },
    title: { ar: "تصميم تجربة وواجهة المستخدم", en: "UX / UI Design & Brand Experiences" },
    summary: { ar: "أنظمة تصميم تحوّل الأفكار إلى منتجات لا تُنسى", en: "Design systems that turn ideas into memorable products" },
    description: {
      ar: "من المخططات الأولية إلى الواجهات المصقولة، نصمم رحلات المستخدم وأنظمة التصميم والأصول الإبداعية التي ترتقي بعلامتك التجارية.",
      en: "From wireframes to polished interfaces, we craft user journeys, design systems and creative assets that elevate your brand."
    },
    highlights: [
      { ar: "رحلات مستخدم وتخطيط للتحويل", en: "User flows and conversion planning" },
      { ar: "واجهات حديثة للويب والجوال", en: "Modern interfaces for web and mobile" },
      { ar: "مكونات موحّدة لتسليم أسرع", en: "Consistent components for faster delivery" }
    ],
    features: [
      { icon: "SearchCheck", title: { ar: "أبحاث تجربة المستخدم", en: "UX Research" }, description: { ar: "رحلات المستخدم والهيكلة وتخطيط التحويل.", en: "User flows, structure and conversion planning." } },
      { icon: "MonitorSmartphone", title: { ar: "تصميم الواجهات", en: "UI Design" }, description: { ar: "واجهات حديثة للويب والجوال.", en: "Modern interfaces for web and mobile." } },
      { icon: "Layers", title: { ar: "أنظمة التصميم", en: "Design Systems" }, description: { ar: "مكونات موحّدة لتسليم أسرع.", en: "Consistent components for faster delivery." } },
      { icon: "Gem", title: { ar: "أصول العلامة التجارية", en: "Brand Assets" }, description: { ar: "عروض تقديمية وتصاميم سوشيال ومواد تسويقية.", en: "Presentations, social visuals and marketing creatives." } }
    ],
    benefits: [
      { icon: "Gem", label: { ar: "تجارب واضحة", en: "Clear Experiences" } },
      { icon: "ChartColumn", label: { ar: "علامة أقوى", en: "Stronger Branding" } },
      { icon: "Target", label: { ar: "تحويل أفضل", en: "Better Conversion" } }
    ],
    order: 8
  }
];
