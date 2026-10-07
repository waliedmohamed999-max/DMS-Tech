import type { Service } from "./types";

export const services: Service[] = [
  {
    slug: "ai-automation",
    icon: "Bot",
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
    eyebrow: { ar: "المواقع والتطبيقات", en: "Websites & Apps" },
    title: { ar: "تطوير المواقع والتطبيقات", en: "Web & App Development" },
    summary: { ar: "مواقع وتطبيقات ومنصات رقمية — من الفكرة حتى الإطلاق", en: "Websites, apps and digital platforms — from idea to launch" },
    description: {
      ar: "نصمم ونطوّر مواقع الشركات وصفحات الهبوط وتطبيقات الويب والجوال وأنظمة الإدارة الداخلية — سريعة، متجاوبة مع كل الأجهزة، محسّنة لمحركات البحث، ومبنية بتكاملات آمنة وسحابية للأداء والنمو طويل المدى.",
      en: "We design and build corporate websites, landing pages, web and mobile apps and internal admin systems — fast, responsive on every device, optimized for search, and built with secure, cloud-ready integrations for performance and long-term growth."
    },
    highlights: [
      { ar: "مواقع شركات وصفحات هبوط للتحويل", en: "Corporate websites and landing pages that convert" },
      { ar: "تطبيقات ويب وجوال iOS و Android", en: "Web and iOS / Android mobile apps" },
      { ar: "أداء سريع و SEO وتكامل سحابي آمن", en: "Fast performance, SEO and secure cloud integration" }
    ],
    features: [
      { icon: "Monitor", title: { ar: "مواقع الشركات", en: "Corporate Websites" }, description: { ar: "حضور رقمي احترافي لأعمالك.", en: "Professional digital presence for your business." } },
      { icon: "MousePointerClick", title: { ar: "صفحات الهبوط", en: "Landing Pages" }, description: { ar: "صفحات مركّزة مصممة للتحويل.", en: "Focused pages designed to convert." } },
      { icon: "Globe", title: { ar: "تطبيقات الويب", en: "Web Applications" }, description: { ar: "منصات وبوابات ولوحات تحكم حديثة.", en: "Modern platforms, portals and dashboards." } },
      { icon: "Smartphone", title: { ar: "تطبيقات الجوال", en: "Mobile Apps" }, description: { ar: "تجارب متعددة المنصات لـ iOS و Android.", en: "Cross-platform experiences for iOS and Android." } },
      { icon: "Settings", title: { ar: "أنظمة الإدارة", en: "Admin Systems" }, description: { ar: "أدوات داخلية للفرق والعمليات.", en: "Internal tools for teams and operations." } },
      { icon: "PenTool", title: { ar: "تصميم UX / UI", en: "UX / UI Design" }, description: { ar: "تجارب واضحة وحديثة وسهلة الاستخدام.", en: "Clear, modern and user-friendly experiences." } },
      { icon: "Gauge", title: { ar: "الأداء و SEO", en: "Performance & SEO" }, description: { ar: "تحميل سريع، تجاوب كامل، وتحسين مستمر.", en: "Fast loading, responsive and optimized." } },
      { icon: "Cloud", title: { ar: "API والتكامل السحابي", en: "API & Cloud Integration" }, description: { ar: "اتصال خلفي آمن ونشر موثوق.", en: "Secure back-end connectivity and deployment." } }
    ],
    benefits: [
      { icon: "MonitorSmartphone", label: { ar: "كل الأجهزة", en: "Every device" } },
      { icon: "Gauge", label: { ar: "أداء عالٍ", en: "High Performance" } },
      { icon: "ShieldCheck", label: { ar: "أمان ونمو طويل المدى", en: "Security & long-term growth" } }
    ],
    order: 3
  },
  {
    slug: "dedicated-tech-team",
    icon: "Users",
    image: "/images/photos/about-team.jpg",
    eyebrow: { ar: "فريق تقني متكامل", en: "Dedicated Tech Team" },
    title: { ar: "فريق تقني متكامل لشركتك", en: "A Complete Tech Team for Your Business" },
    summary: { ar: "فريق تقني كامل يعمل لشركتك باشتراك مرن — بدون أعباء التوظيف", en: "A full tech team working for you on a flexible subscription — without the hiring overhead" },
    description: {
      ar: "للشركات التي تحتاج قدرات تقنية حقيقية ولا تستطيع — أو لا تريد — بناء فريق داخلي. نوفّر لك فريقاً متكاملاً من مدير مشروع ومصممين ومطورين ومختصي جودة ودعم، يعمل على أولوياتك كأنه جزء من شركتك، باشتراك شهري أو نصف سنوي أو سنوي.",
      en: "For companies that need real technical capability but can't — or don't want to — build an in-house team. We give you a complete team of a project manager, designers, developers, QA and support specialists who work on your priorities as if they were part of your company, on a monthly, six-month or annual subscription."
    },
    highlights: [
      { ar: "بدون تكاليف توظيف أو تأمينات أو تجهيزات", en: "No hiring, insurance or equipment costs" },
      { ar: "فريق متعدد التخصصات بمدير مشروع واحد", en: "A multi-skilled team under one project manager" },
      { ar: "اشتراك مرن: شهري، نصف سنوي، أو سنوي", en: "Flexible terms: monthly, six-month or annual" }
    ],
    features: [
      { icon: "ClipboardList", title: { ar: "مدير مشروع مخصص", en: "Dedicated project manager" }, description: { ar: "نقطة تواصل واحدة تنظّم الأولويات وتتابع التسليم وترفع التقارير.", en: "One point of contact who sets priorities, tracks delivery and reports progress." } },
      { icon: "PenTool", title: { ar: "مصمم UX / UI", en: "UX / UI designer" }, description: { ar: "واجهات وتجارب استخدام متسقة مع هوية علامتك.", en: "Interfaces and user experiences consistent with your brand." } },
      { icon: "Monitor", title: { ar: "مطوّر واجهات أمامية", en: "Front-end developer" }, description: { ar: "مواقع ولوحات تحكم سريعة ومتجاوبة.", en: "Fast, responsive websites and dashboards." } },
      { icon: "Server", title: { ar: "مطوّر أنظمة خلفية و API", en: "Back-end & API developer" }, description: { ar: "قواعد بيانات وواجهات برمجية وتكاملات آمنة.", en: "Databases, APIs and secure integrations." } },
      { icon: "Smartphone", title: { ar: "مطوّر تطبيقات جوال", en: "Mobile developer" }, description: { ar: "تطبيقات iOS و Android وتحديثاتها المستمرة.", en: "iOS and Android apps and their ongoing updates." } },
      { icon: "SearchCheck", title: { ar: "مختص جودة واختبار", en: "QA & testing specialist" }, description: { ar: "اختبار كل إصدار قبل وصوله لعملائك.", en: "Every release tested before it reaches your customers." } },
      { icon: "Cloud", title: { ar: "مهندس سحابة و DevOps", en: "Cloud & DevOps engineer" }, description: { ar: "النشر والمراقبة والنسخ الاحتياطي والأمان.", en: "Deployment, monitoring, backups and security." } },
      { icon: "Headset", title: { ar: "دعم فني وصيانة", en: "Support & maintenance" }, description: { ar: "متابعة الأعطال والتحديثات وطلبات التعديل.", en: "Bug fixes, updates and change requests." } }
    ],
    benefits: [
      { icon: "BadgeCheck", label: { ar: "بدون أعباء توظيف", en: "No hiring overhead" } },
      { icon: "Rocket", label: { ar: "بدء أسرع", en: "Faster start" } },
      { icon: "TrendingUp", label: { ar: "توسّع حسب الحاجة", en: "Scale as you grow" } }
    ],
    order: 4,
    audience: [
      { icon: "Rocket", title: { ar: "الشركات الناشئة", en: "Startups" }, description: { ar: "تحتاج منتجاً تقنياً متكاملاً دون أن تبني فريقاً من الصفر.", en: "Need a complete tech product without building a team from scratch." } },
      { icon: "Building2", title: { ar: "الشركات بلا قسم تقني", en: "Companies without an IT department" }, description: { ar: "لديها احتياجات تقنية مستمرة ولا يوجد لديها موظفون تقنيون.", en: "Have ongoing technical needs but no technical staff." } },
      { icon: "Layers", title: { ar: "أصحاب المشاريع الرقمية المستمرة", en: "Businesses with ongoing digital products" }, description: { ar: "موقع أو تطبيق أو متجر أو أنظمة داخلية تحتاج تطويراً وتحديثاً متواصلاً.", en: "A website, app, store or internal systems that need continuous development." } },
      { icon: "Users", title: { ar: "فرق تقنية تحتاج دعماً", en: "Tech teams that need reinforcement" }, description: { ar: "لديها فريق داخلي وتحتاج تخصصات إضافية أو سرعة أكبر في التنفيذ.", en: "Have an in-house team and need extra skills or faster delivery." } }
    ],
    comparison: [
      { label: { ar: "التكلفة", en: "Cost" }, inHouse: { ar: "رواتب وتأمينات وإقامات وأجهزة وتراخيص ومكاتب", en: "Salaries, insurance, visas, equipment, licenses and office space" }, withUs: { ar: "اشتراك واحد واضح يشمل الفريق كاملاً", en: "One clear subscription covering the whole team" } },
      { label: { ar: "سرعة البدء", en: "Time to start" }, inHouse: { ar: "أسابيع أو أشهر للبحث والتوظيف والتأهيل", en: "Weeks or months to search, hire and onboard" }, withUs: { ar: "يبدأ الفريق بعد الاتفاق على النطاق مباشرة", en: "The team starts as soon as the scope is agreed" } },
      { label: { ar: "التخصصات", en: "Skills" }, inHouse: { ar: "موظف منفصل لكل تخصص", en: "A separate hire for every skill" }, withUs: { ar: "فريق متعدد التخصصات في اشتراك واحد", en: "A multi-skilled team in one subscription" } },
      { label: { ar: "المرونة", en: "Flexibility" }, inHouse: { ar: "صعوبة التوسع أو التقليص حسب المرحلة", en: "Hard to scale up or down with each stage" }, withUs: { ar: "زيادة الفريق أو تقليصه حسب احتياجك", en: "Grow or shrink the team to match your needs" } },
      { label: { ar: "الاستمرارية", en: "Continuity" }, inHouse: { ar: "خطر فقدان المعرفة عند استقالة موظف", en: "Knowledge walks out when an employee leaves" }, withUs: { ar: "فريق وتوثيق يضمنان استمرار العمل", en: "A team and documentation keep the work going" } },
      { label: { ar: "الإدارة", en: "Management" }, inHouse: { ar: "تحتاج خبرة تقنية داخلية لإدارة الفريق", en: "Needs in-house technical leadership" }, withUs: { ar: "مدير مشروع مخصص يدير الفريق نيابةً عنك", en: "A dedicated project manager runs the team for you" } }
    ],
    plans: [
      {
        icon: "CalendarClock",
        name: { ar: "الشهري", en: "Monthly" },
        term: { ar: "التزام شهراً بشهر", en: "Month-to-month" },
        for: { ar: "للمشاريع قصيرة المدى أو لتجربة العمل معنا", en: "For short-term needs or to try working with us" },
        features: [
          { ar: "مرونة كاملة في التجديد", en: "Full flexibility to renew" },
          { ar: "تعديل نطاق العمل كل شهر", en: "Adjust the scope every month" },
          { ar: "تقرير إنجاز شهري", en: "Monthly progress report" },
          { ar: "إمكانية الانتقال لباقة أطول", en: "Upgrade to a longer term anytime" }
        ]
      },
      {
        icon: "Calendar",
        name: { ar: "النصف سنوي", en: "Six-month" },
        term: { ar: "6 أشهر", en: "6 months" },
        for: { ar: "للشركات التي لديها خطة تطوير واضحة", en: "For companies with a clear development plan" },
        featured: true,
        features: [
          { ar: "سعر شهري أفضل من الباقة الشهرية", en: "A better monthly rate than month-to-month" },
          { ar: "خطة تطوير لستة أشهر", en: "A six-month development plan" },
          { ar: "مراجعة أداء ربع سنوية", en: "Quarterly performance review" },
          { ar: "أولوية في جدولة المهام", en: "Priority scheduling" }
        ]
      },
      {
        icon: "Award",
        name: { ar: "السنوي", en: "Annual" },
        term: { ar: "12 شهراً", en: "12 months" },
        for: { ar: "شريك تقني طويل المدى لشركتك", en: "A long-term technology partner for your business" },
        features: [
          { ar: "أفضل قيمة شهرية", en: "The best monthly value" },
          { ar: "خارطة طريق تقنية سنوية", en: "An annual technology roadmap" },
          { ar: "فريق ثابت مخصص لشركتك", en: "A stable team dedicated to your company" },
          { ar: "أولوية قصوى في الدعم", en: "Top priority support" }
        ]
      }
    ],
    process: [
      { icon: "MessagesSquare", title: { ar: "جلسة تعرّف", en: "Discovery call" }, description: { ar: "نفهم نشاطك وأهدافك واحتياجاتك التقنية الحالية والقادمة.", en: "We understand your business, goals and current and upcoming technical needs." } },
      { icon: "Users", title: { ar: "تشكيلة الفريق", en: "Team composition" }, description: { ar: "نقترح التخصصات ونطاق العمل المناسب، ونرسل عرض السعر.", en: "We propose the right skills and scope, and send you a quote." } },
      { icon: "Handshake", title: { ar: "الاشتراك والعقد", en: "Subscription & contract" }, description: { ar: "تختار مدة الاشتراك: شهري أو نصف سنوي أو سنوي، ونوقّع العقد.", en: "You choose the term — monthly, six-month or annual — and we sign the contract." } },
      { icon: "Rocket", title: { ar: "انطلاق العمل", en: "Kick-off" }, description: { ar: "يبدأ الفريق بخطة واضحة ودورات عمل قصيرة بأولويات متفق عليها.", en: "The team starts with a clear plan and short work cycles on agreed priorities." } },
      { icon: "ChartLine", title: { ar: "متابعة وتطوير مستمر", en: "Reporting & continuous improvement" }, description: { ar: "تقارير دورية واجتماعات متابعة، وتعديل الأولويات حسب نتائجك.", en: "Regular reports and check-ins, with priorities adjusted to your results." } }
    ],
    faq: [
      { q: { ar: "ما الفرق بين هذه الخدمة وتنفيذ مشروع منفصل؟", en: "How is this different from a one-off project?" }, a: { ar: "المشروع المنفصل له نطاق وتسليم محدد ثم ينتهي. أما الفريق المتكامل فيعمل باستمرار على أولوياتك المتغيرة طوال مدة الاشتراك: تطوير، تحسين، صيانة، وميزات جديدة.", en: "A one-off project has a fixed scope and delivery, then ends. A dedicated team works continuously on your changing priorities for the whole subscription: development, improvements, maintenance and new features." } },
      { q: { ar: "كيف يُحدَّد سعر الاشتراك؟", en: "How is the subscription priced?" }, a: { ar: "حسب حجم الفريق والتخصصات المطلوبة ومدة الاشتراك. بعد جلسة التعرّف نرسل لك عرض سعر واضحاً، والباقات الأطول تمنحك سعراً شهرياً أفضل.", en: "By team size, the skills you need and the subscription term. After the discovery call we send a clear quote; longer terms get a better monthly rate." } },
      { q: { ar: "هل يمكن تغيير حجم الفريق لاحقاً؟", en: "Can the team size change later?" }, a: { ar: "نعم، يمكن زيادة التخصصات أو تقليلها حسب مرحلة مشروعك، عند التجديد أو بالاتفاق خلال الاشتراك.", en: "Yes — skills can be added or reduced to match your project's stage, at renewal or by agreement during the subscription." } },
      { q: { ar: "كيف أتابع عمل الفريق؟", en: "How do I follow the team's work?" }, a: { ar: "من خلال مدير مشروع مخصص، وتقارير إنجاز دورية، واجتماعات متابعة منتظمة تراجع فيها ما تم وما هو قادم.", en: "Through a dedicated project manager, regular progress reports and recurring check-ins to review what's done and what's next." } },
      { q: { ar: "لمن تكون ملكية الكود والتصاميم؟", en: "Who owns the code and designs?" }, a: { ar: "تنتقل ملكية الكود والتصاميم والمستندات المنجزة لشركتك وفق بنود العقد.", en: "Ownership of the delivered code, designs and documents transfers to your company under the contract." } },
      { q: { ar: "هل يمكن البدء بشهر واحد؟", en: "Can we start with one month?" }, a: { ar: "نعم، الاشتراك الشهري مناسب للبداية، ويمكنك الانتقال إلى النصف سنوي أو السنوي في أي وقت.", en: "Yes — the monthly plan is a good way to start, and you can move to six-month or annual at any time." } },
      { q: { ar: "ماذا يحدث عند انتهاء الاشتراك؟", en: "What happens when the subscription ends?" }, a: { ar: "يمكنك التجديد، أو نسلّمك الكود والتوثيق وبيانات الوصول كاملة لضمان استمرار عملك.", en: "You can renew, or we hand over the code, documentation and access details so your work continues." } }
    ]
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

/** Headings of the optional service-page sections (audience, comparison, plans, process, FAQ). */
export const serviceExtrasCopy = {
  audienceTitle: { ar: "لمن هذه *الخدمة*؟", en: "Who is this *for*?" },
  teamTitle: { ar: "تشكيلة *فريقك*", en: "Your *team*" },
  comparisonTitle: { ar: "التوظيف الداخلي أم *فريق DMS*؟", en: "In-house hiring or *a DMS team*?" },
  inHouse: { ar: "توظيف فريق داخلي", en: "Hiring in-house" },
  withUs: { ar: "فريق DMS التقني", en: "DMS tech team" },
  plansTitle: { ar: "اختر *مدة الاشتراك*", en: "Choose your *term*" },
  plansSub: { ar: "السعر يُحدَّد حسب حجم الفريق والتخصصات المطلوبة — اطلب عرض سعر مخصصاً لشركتك.", en: "Pricing depends on team size and the skills you need — request a quote tailored to your company." },
  popular: { ar: "الأكثر اختياراً", en: "Most popular" },
  planCta: { ar: "اطلب عرض سعر", en: "Request a quote" },
  processTitle: { ar: "كيف *نبدأ معاً*", en: "How we *get started*" },
  faqTitle: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" }
};
