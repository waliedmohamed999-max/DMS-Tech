import type { IconName } from "@/components/ui/Icon";
import type { Job, L } from "./types";

/**
 * Careers: open roles (/careers, /careers/[slug]) and the page copy. Applications go by e-mail to site.email with
 * the CV attached (the subject names the role). Benefits list only what the company offers by how it works
 * (remote-friendly, real projects, learning) — no salary or insurance claims.
 */
export const jobs: Job[] = [
  {
    slug: "full-stack-developer",
    service: "web-development",
    title: { ar: "مطوّر Full-Stack", en: "Full-Stack Developer" },
    team: { ar: "تطوير التطبيقات", en: "App Development" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "CodeXml",
    description: { ar: "بناء تطبيقات ويب وأنظمة إدارة باستخدام Next.js و Node.js.", en: "Build web apps and admin systems with Next.js and Node.js." },
    about: {
      ar: "ستعمل ضمن فريق التطوير على مواقع وأنظمة حقيقية لعملائنا ولمنتجاتنا الداخلية: من لوحات التحكم وأنظمة الإدارة إلى بوابات العملاء والتكاملات. تتولى الميزة من الفكرة حتى الإطلاق، وتهتم بالأداء والأمان وجودة الكود.",
      en: "You'll join the development team building real websites and systems for our clients and our own products — from dashboards and admin systems to customer portals and integrations. You'll own features from idea to launch, with care for performance, security and code quality."
    },
    responsibilities: [
      { ar: "تطوير واجهات ويب سريعة ومتجاوبة باستخدام Next.js و React و TypeScript", en: "Build fast, responsive web interfaces with Next.js, React and TypeScript" },
      { ar: "بناء واجهات API وخدمات خلفية باستخدام Node.js", en: "Build APIs and back-end services with Node.js" },
      { ar: "تصميم قواعد البيانات وكتابة استعلامات فعّالة (PostgreSQL / Prisma)", en: "Design databases and write efficient queries (PostgreSQL / Prisma)" },
      { ar: "ربط الأنظمة بخدمات خارجية: بوابات الدفع، واتساب، أنظمة ERP و CRM", en: "Integrate systems with external services: payment gateways, WhatsApp, ERP and CRM" },
      { ar: "كتابة اختبارات ومراجعة كود الزملاء والالتزام بمعايير الأمان", en: "Write tests, review teammates' code and follow security best practices" },
      { ar: "المشاركة في تقدير المهام والتخطيط مع مدير المشروع", en: "Take part in estimation and planning with the project manager" }
    ],
    requirements: [
      { ar: "خبرة عملية لا تقل عن 3 سنوات في تطوير تطبيقات الويب", en: "At least 3 years of hands-on web application development" },
      { ar: "إتقان JavaScript / TypeScript و React، وخبرة في Next.js", en: "Strong JavaScript / TypeScript and React, with Next.js experience" },
      { ar: "خبرة في Node.js وبناء واجهات REST", en: "Experience with Node.js and building REST APIs" },
      { ar: "معرفة جيدة بقواعد البيانات العلائقية (PostgreSQL أو MySQL)", en: "Good knowledge of relational databases (PostgreSQL or MySQL)" },
      { ar: "استخدام Git والعمل ضمن فريق بمراجعات كود", en: "Git and team workflows with code review" },
      { ar: "معرض أعمال أو مشاريع يمكن الاطلاع عليها", en: "A portfolio or projects we can look at" }
    ],
    niceToHave: [
      { ar: "خبرة في واجهات عربية (RTL) ومواقع ثنائية اللغة", en: "Experience with Arabic (RTL) and bilingual websites" },
      { ar: "معرفة بـ Docker والنشر على السحابة", en: "Docker and cloud deployment" },
      { ar: "خبرة في تطبيقات الجوال (React Native أو Flutter)", en: "Mobile apps (React Native or Flutter)" }
    ],
    skills: ["Next.js", "React", "TypeScript", "Node.js", "PostgreSQL", "Prisma", "Tailwind CSS", "Git"]
  },
  {
    slug: "ai-automation-engineer",
    service: "ai-automation",
    title: { ar: "مهندس أتمتة وذكاء اصطناعي", en: "AI & Automation Engineer" },
    team: { ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Bot",
    description: { ar: "تصميم مساعدات ذكية ومسارات أتمتة وتكاملات API.", en: "Design AI assistants, automation flows and API integrations." },
    about: {
      ar: "ستبني حلول الذكاء الاصطناعي والأتمتة التي نقدمها لعملائنا: مساعدات ذكية تجيب من بيانات الشركة، وبوتات واتساب، ومسارات أتمتة تربط الأنظمة ببعضها وتوفّر ساعات من العمل اليدوي.",
      en: "You'll build the AI and automation solutions we deliver to clients: assistants that answer from company data, WhatsApp bots, and automation flows that connect systems and save hours of manual work."
    },
    responsibilities: [
      { ar: "تصميم وبناء مساعدات ذكية تعتمد على نماذج اللغة (LLMs) وبيانات العميل", en: "Design and build assistants powered by LLMs and the client's data" },
      { ar: "بناء مسارات أتمتة وتكاملات بين الأنظمة عبر واجهات API و Webhooks", en: "Build automation flows and system integrations via APIs and webhooks" },
      { ar: "تطوير بوتات واتساب للرد والتأهيل والمتابعة", en: "Develop WhatsApp bots for replies, qualification and follow-up" },
      { ar: "تجهيز البيانات والمستندات للبحث الذكي (RAG)", en: "Prepare data and documents for smart retrieval (RAG)" },
      { ar: "قياس جودة الإجابات وتحسينها ومراقبة التكلفة والأداء", en: "Measure and improve answer quality, and monitor cost and performance" },
      { ar: "توثيق الحلول وتدريب فرق العملاء على استخدامها", en: "Document solutions and train client teams to use them" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في البرمجة باستخدام Python أو Node.js", en: "At least 2 years of programming in Python or Node.js" },
      { ar: "خبرة عملية في التعامل مع واجهات نماذج الذكاء الاصطناعي (OpenAI أو Claude أو غيرها)", en: "Hands-on experience with AI model APIs (OpenAI, Claude or others)" },
      { ar: "فهم جيد لواجهات REST و Webhooks وصيغة JSON", en: "Good understanding of REST APIs, webhooks and JSON" },
      { ar: "خبرة في أدوات الأتمتة مثل n8n أو Make أو ما يشابهها", en: "Experience with automation tools such as n8n, Make or similar" },
      { ar: "القدرة على تحويل احتياج العميل إلى حل عملي واضح", en: "Able to turn a client's need into a clear, practical solution" }
    ],
    niceToHave: [
      { ar: "خبرة في قواعد البيانات المتجهية والبحث الدلالي", en: "Vector databases and semantic search" },
      { ar: "خبرة في WhatsApp Business Platform", en: "WhatsApp Business Platform experience" },
      { ar: "معالجة النصوص العربية", en: "Arabic text processing" }
    ],
    skills: ["Python", "Node.js", "LLM APIs", "RAG", "n8n", "Make", "Webhooks", "WhatsApp API"]
  },
  {
    slug: "ux-ui-designer",
    service: "ux-ui-design",
    title: { ar: "مصمم UX / UI", en: "UX / UI Designer" },
    team: { ar: "التصميم", en: "Design" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "PencilRuler",
    description: { ar: "تصميم واجهات وأنظمة تصميم لمنتجات الويب والجوال.", en: "Design interfaces and design systems for web and mobile products." },
    about: {
      ar: "ستصمم تجارب استخدام واضحة وجميلة لمواقع وتطبيقات وأنظمة إدارة، بالعربية والإنجليزية. تعمل جنباً إلى جنب مع المطورين من البحث والتخطيط حتى التسليم، وتبني أنظمة تصميم تحافظ على اتساق المنتج.",
      en: "You'll design clear, beautiful experiences for websites, apps and admin systems, in Arabic and English. You'll work side by side with developers from research and planning to hand-off, and build design systems that keep products consistent."
    },
    responsibilities: [
      { ar: "فهم احتياج المستخدم والعميل وتحويله إلى رحلات استخدام ونماذج أولية", en: "Understand user and client needs and turn them into user flows and prototypes" },
      { ar: "تصميم واجهات الويب والجوال بدقة عالية على Figma", en: "Design high-fidelity web and mobile interfaces in Figma" },
      { ar: "بناء أنظمة تصميم ومكتبات مكوّنات قابلة لإعادة الاستخدام", en: "Build design systems and reusable component libraries" },
      { ar: "تصميم واجهات عربية (RTL) احترافية بنفس جودة الإنجليزية", en: "Design professional Arabic (RTL) interfaces as polished as the English ones" },
      { ar: "تسليم التصاميم للمطورين ومتابعة التنفيذ", en: "Hand designs over to developers and follow implementation" },
      { ar: "اختبار التصاميم مع المستخدمين وتحسينها", en: "Test designs with users and iterate" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في تصميم الواجهات وتجربة المستخدم", en: "At least 2 years of UI and UX design" },
      { ar: "إتقان Figma (المكوّنات، Auto Layout، النماذج التفاعلية)", en: "Strong Figma skills (components, Auto Layout, prototyping)" },
      { ar: "معرض أعمال يوضح طريقة تفكيرك وليس التصاميم النهائية فقط", en: "A portfolio that shows how you think, not just final screens" },
      { ar: "فهم جيد للطباعة والألوان والمسافات وإمكانية الوصول", en: "Good grasp of typography, color, spacing and accessibility" },
      { ar: "خبرة في تصميم واجهات عربية", en: "Experience designing Arabic interfaces" }
    ],
    niceToHave: [
      { ar: "معرفة أساسية بـ HTML و CSS", en: "Basic HTML and CSS" },
      { ar: "تصميم الحركة والتفاعلات الدقيقة", en: "Motion and micro-interaction design" },
      { ar: "خبرة في تصميم لوحات التحكم وأنظمة الإدارة", en: "Dashboard and admin system design" }
    ],
    skills: ["Figma", "UX Research", "Prototyping", "Design Systems", "RTL", "Accessibility"]
  },
  {
    slug: "digital-marketing-specialist",
    service: "digital-marketing",
    title: { ar: "أخصائي تسويق رقمي", en: "Digital Marketing Specialist" },
    team: { ar: "التسويق", en: "Marketing" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية", en: "Saudi Arabia" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Megaphone",
    description: { ar: "إدارة الحملات الممولة والمحتوى وقياس الأداء.", en: "Run paid campaigns and content, and measure performance." },
    about: {
      ar: "ستقود الحملات الرقمية لعملائنا وللشركة: من التخطيط والاستهداف إلى المحتوى والتحليل. هدفك نتائج قابلة للقياس — عملاء محتملون ومبيعات حقيقية، لا مجرد مشاهدات.",
      en: "You'll lead digital campaigns for our clients and the company — from planning and targeting to content and analysis. Your goal is measurable results: real leads and sales, not just views."
    },
    responsibilities: [
      { ar: "تخطيط وإدارة الحملات الممولة على Meta و Google و TikTok و Snapchat", en: "Plan and run paid campaigns on Meta, Google, TikTok and Snapchat" },
      { ar: "إعداد خطط المحتوى الشهرية بالتعاون مع فريق التصميم", en: "Prepare monthly content plans with the design team" },
      { ar: "إعداد أدوات القياس والتتبّع (Pixel و GA4 و Tag Manager)", en: "Set up measurement and tracking (Pixel, GA4, Tag Manager)" },
      { ar: "تحليل النتائج أسبوعياً وتحسين الاستهداف والميزانيات", en: "Analyze results weekly and optimize targeting and budgets" },
      { ar: "إعداد تقارير أداء واضحة للعملاء", en: "Prepare clear performance reports for clients" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في إدارة الحملات الممولة", en: "At least 2 years running paid campaigns" },
      { ar: "معرفة بالسوق السعودي وسلوك الجمهور المحلي", en: "Knowledge of the Saudi market and local audience behavior" },
      { ar: "خبرة عملية في Meta Ads Manager و Google Ads", en: "Hands-on Meta Ads Manager and Google Ads" },
      { ar: "مهارات تحليلية وإتقان GA4 أو أدوات تحليل مشابهة", en: "Analytical skills and GA4 or similar analytics tools" },
      { ar: "كتابة إعلانية جيدة بالعربية", en: "Good Arabic ad copywriting" }
    ],
    niceToHave: [
      { ar: "شهادات Google أو Meta المعتمدة", en: "Google or Meta certifications" },
      { ar: "خبرة في تسويق المتاجر الإلكترونية (زد / سلة)", en: "E-commerce marketing (Zid / Salla)" },
      { ar: "خبرة في تحسين محركات البحث (SEO)", en: "SEO experience" }
    ],
    skills: ["Meta Ads", "Google Ads", "TikTok Ads", "Snapchat Ads", "GA4", "Tag Manager", "SEO"]
  },
  {
    slug: "frontend-developer",
    service: "web-development",
    title: { ar: "مطوّر واجهات أمامية (Front-End)", en: "Front-End Developer" },
    team: { ar: "تطوير المواقع", en: "Web Development" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Monitor",
    description: { ar: "تحويل التصاميم إلى مواقع سريعة ومتجاوبة بالعربية والإنجليزية.", en: "Turn designs into fast, responsive Arabic and English websites." },
    about: {
      ar: "ستحوّل تصاميم فريقنا إلى مواقع وصفحات هبوط ولوحات تحكم دقيقة التنفيذ، سريعة التحميل ومتوافقة مع كل الأجهزة، مع اهتمام خاص بالواجهات العربية.",
      en: "You'll turn our team's designs into pixel-accurate websites, landing pages and dashboards that load fast on every device — with special care for Arabic interfaces."
    },
    responsibilities: [
      { ar: "تنفيذ الواجهات من تصاميم Figma بدقة عالية", en: "Implement interfaces from Figma designs with high accuracy" },
      { ar: "بناء مكوّنات React قابلة لإعادة الاستخدام", en: "Build reusable React components" },
      { ar: "تحسين سرعة المواقع ونتائج Core Web Vitals", en: "Improve site speed and Core Web Vitals" },
      { ar: "ضمان التوافق مع الجوال والمتصفحات المختلفة واتجاه RTL", en: "Ensure mobile, cross-browser and RTL support" },
      { ar: "ربط الواجهات بواجهات API بالتعاون مع مطوّري الخلفية", en: "Connect interfaces to APIs with the back-end developers" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في تطوير الواجهات", en: "At least 2 years of front-end development" },
      { ar: "إتقان HTML و CSS و JavaScript و TypeScript", en: "Strong HTML, CSS, JavaScript and TypeScript" },
      { ar: "خبرة في React و Tailwind CSS", en: "Experience with React and Tailwind CSS" },
      { ar: "اهتمام بالتفاصيل وجودة التنفيذ", en: "Attention to detail and implementation quality" },
      { ar: "معرض أعمال لمواقع منشورة", en: "A portfolio of live websites" }
    ],
    niceToHave: [
      { ar: "خبرة في Next.js", en: "Next.js experience" },
      { ar: "خبرة في الحركة والتفاعلات (Framer Motion)", en: "Animation and interactions (Framer Motion)" },
      { ar: "معرفة بتحسين محركات البحث التقني", en: "Technical SEO knowledge" }
    ],
    skills: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Figma", "Web Performance", "RTL"]
  },
  {
    slug: "mobile-app-developer",
    service: "web-development",
    title: { ar: "مطوّر تطبيقات جوال", en: "Mobile App Developer" },
    team: { ar: "تطوير التطبيقات", en: "App Development" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "Smartphone",
    description: { ar: "بناء تطبيقات iOS و Android متعددة المنصات ونشرها على المتاجر.", en: "Build cross-platform iOS and Android apps and publish them to the stores." },
    about: {
      ar: "ستبني تطبيقات جوال لعملائنا ولمنتجاتنا: تطبيقات خدمات، ومتاجر، وتطبيقات داخلية للفرق — من أول شاشة حتى النشر على App Store و Google Play.",
      en: "You'll build mobile apps for our clients and products — service apps, shopping apps and internal team apps — from the first screen to publishing on the App Store and Google Play."
    },
    responsibilities: [
      { ar: "تطوير تطبيقات متعددة المنصات بـ Flutter أو React Native", en: "Develop cross-platform apps with Flutter or React Native" },
      { ar: "ربط التطبيقات بواجهات API وخدمات الدفع والإشعارات", en: "Connect apps to APIs, payments and push notifications" },
      { ar: "نشر التطبيقات وإدارة إصداراتها على المتاجر", en: "Publish apps and manage store releases" },
      { ar: "تحسين الأداء واستهلاك البطارية وحجم التطبيق", en: "Optimize performance, battery use and app size" },
      { ar: "كتابة اختبارات ومعالجة أعطال المستخدمين", en: "Write tests and fix user-reported crashes" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 3 سنوات في تطوير تطبيقات الجوال", en: "At least 3 years of mobile app development" },
      { ar: "إتقان Flutter (Dart) أو React Native", en: "Strong Flutter (Dart) or React Native" },
      { ar: "تطبيقات منشورة على App Store أو Google Play", en: "Apps published on the App Store or Google Play" },
      { ar: "خبرة في إدارة الحالة والتخزين المحلي", en: "State management and local storage experience" },
      { ar: "دعم الواجهات العربية (RTL)", en: "Arabic (RTL) interface support" }
    ],
    niceToHave: [
      { ar: "خبرة في Swift أو Kotlin", en: "Swift or Kotlin experience" },
      { ar: "خبرة في Firebase", en: "Firebase experience" },
      { ar: "ربط بوابات الدفع المحلية (Apple Pay، مدى)", en: "Local payment gateways (Apple Pay, mada)" }
    ],
    skills: ["Flutter", "Dart", "React Native", "Firebase", "REST APIs", "App Store", "Google Play"]
  },
  {
    slug: "automation-specialist",
    service: "ai-automation",
    title: { ar: "أخصائي أتمتة العمليات", en: "Process Automation Specialist" },
    team: { ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Workflow",
    description: { ar: "أتمتة المهام والموافقات المتكررة وربط أدوات العمل ببعضها.", en: "Automate repetitive tasks and approvals and connect business tools." },
    about: {
      ar: "ستدرس طريقة عمل عملائنا وتحوّل المهام اليدوية المتكررة إلى مسارات تعمل تلقائياً: نماذج، موافقات، تقارير، وإشعارات — باستخدام أدوات الأتمتة الحديثة.",
      en: "You'll study how our clients work and turn repetitive manual tasks into flows that run on their own — forms, approvals, reports and notifications — using modern automation tools."
    },
    responsibilities: [
      { ar: "تحليل العمليات اليدوية واقتراح ما يمكن أتمتته", en: "Analyze manual processes and propose what to automate" },
      { ar: "بناء مسارات أتمتة على n8n و Make و Zapier", en: "Build automation flows on n8n, Make and Zapier" },
      { ar: "ربط الأدوات: Google Workspace، أنظمة CRM، جداول البيانات، البريد", en: "Connect tools: Google Workspace, CRMs, spreadsheets, e-mail" },
      { ar: "مراقبة المسارات ومعالجة الأخطاء وتوثيقها", en: "Monitor flows, handle errors and document them" },
      { ar: "تدريب فرق العملاء على استخدام الحلول", en: "Train client teams on the solutions" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في أدوات الأتمتة", en: "At least 2 years with automation tools" },
      { ar: "فهم واجهات API و Webhooks وصيغة JSON", en: "Understanding of APIs, webhooks and JSON" },
      { ar: "تفكير منطقي وقدرة على تحليل العمليات", en: "Logical thinking and process analysis" },
      { ar: "معرفة أساسية بالبرمجة (JavaScript أو Python)", en: "Basic programming (JavaScript or Python)" }
    ],
    niceToHave: [
      { ar: "خبرة في دمج نماذج الذكاء الاصطناعي داخل المسارات", en: "Adding AI models inside flows" },
      { ar: "خبرة في أنظمة ERP أو المحاسبة", en: "ERP or accounting systems" }
    ],
    skills: ["n8n", "Make", "Zapier", "Webhooks", "JSON", "Google Workspace", "JavaScript"]
  },
  {
    slug: "data-bi-analyst",
    service: "ai-automation",
    title: { ar: "محلل بيانات ولوحات تقارير (BI)", en: "Data & BI Analyst" },
    team: { ar: "البيانات والتقارير", en: "Data & Reporting" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "ChartColumn",
    description: { ar: "تحويل بيانات العملاء إلى لوحات تقارير ورؤى تساعد على اتخاذ القرار.", en: "Turn client data into dashboards and insights that drive decisions." },
    about: {
      ar: "ستجمع بيانات المبيعات والعمليات من أنظمة مختلفة، وتبني منها لوحات تقارير واضحة تساعد الإدارة على اتخاذ قرارات أسرع وأدق.",
      en: "You'll bring sales and operations data together from different systems and build clear dashboards that help management decide faster and better."
    },
    responsibilities: [
      { ar: "جمع البيانات وتنظيفها من مصادر متعددة", en: "Collect and clean data from multiple sources" },
      { ar: "بناء لوحات تقارير على Power BI أو Looker Studio", en: "Build dashboards in Power BI or Looker Studio" },
      { ar: "كتابة استعلامات SQL وتحليل المؤشرات", en: "Write SQL queries and analyze KPIs" },
      { ar: "إعداد تقارير دورية تلقائية للعملاء", en: "Set up automated recurring reports for clients" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في تحليل البيانات", en: "At least 2 years of data analysis" },
      { ar: "إتقان SQL و Excel المتقدم", en: "Strong SQL and advanced Excel" },
      { ar: "خبرة في Power BI أو Looker Studio أو Tableau", en: "Power BI, Looker Studio or Tableau experience" },
      { ar: "قدرة على عرض الأرقام بطريقة يفهمها غير المتخصصين", en: "Able to present numbers to non-specialists" }
    ],
    niceToHave: [
      { ar: "معرفة بـ Python لتحليل البيانات", en: "Python for data analysis" },
      { ar: "خبرة في بيانات المتاجر الإلكترونية والتسويق", en: "E-commerce and marketing data" }
    ],
    skills: ["SQL", "Power BI", "Looker Studio", "Excel", "Python", "GA4"]
  },
  {
    slug: "whatsapp-solutions-specialist",
    service: "whatsapp-automation",
    title: { ar: "أخصائي حلول واتساب للأعمال", en: "WhatsApp Business Solutions Specialist" },
    team: { ar: "حلول واتساب", en: "WhatsApp Solutions" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "MessagesSquare",
    description: { ar: "إعداد واتساب للأعمال وبناء تدفقات الشات بوت والحملات للعملاء.", en: "Set up WhatsApp Business and build chatbot flows and campaigns for clients." },
    about: {
      ar: "ستكون المسؤول عن تشغيل واتساب لعملائنا: ربط الأرقام بالمنصة الرسمية، تصميم تدفقات الرد الآلي، إعداد قوالب الرسائل والحملات، ومتابعة النتائج.",
      en: "You'll run WhatsApp for our clients: connecting numbers to the official platform, designing auto-reply flows, setting up message templates and campaigns, and tracking results."
    },
    responsibilities: [
      { ar: "ربط أرقام العملاء بـ WhatsApp Business Platform والتحقق منها", en: "Connect and verify client numbers on the WhatsApp Business Platform" },
      { ar: "تصميم تدفقات شات بوت للرد والتأهيل والتحويل للموظفين", en: "Design chatbot flows for replies, qualification and hand-over" },
      { ar: "إعداد قوالب الرسائل واعتمادها من Meta", en: "Create message templates and get them approved by Meta" },
      { ar: "إطلاق الحملات وتحليل معدلات القراءة والرد", en: "Launch campaigns and analyze read and reply rates" },
      { ar: "دعم العملاء وتدريب فرقهم على صندوق المحادثات", en: "Support clients and train their teams on the inbox" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في واتساب للأعمال أو منصات المحادثة", en: "At least 2 years with WhatsApp Business or chat platforms" },
      { ar: "فهم سياسات Meta وقوالب الرسائل", en: "Understanding of Meta policies and message templates" },
      { ar: "خبرة في أدوات بناء الشات بوت بلا كود", en: "No-code chatbot builder experience" },
      { ar: "كتابة رسائل عربية واضحة ومقنعة", en: "Clear, persuasive Arabic message writing" }
    ],
    niceToHave: [
      { ar: "خبرة في WhatsApp Cloud API", en: "WhatsApp Cloud API experience" },
      { ar: "ربط واتساب بمتاجر زد وسلة", en: "Connecting WhatsApp to Zid and Salla stores" }
    ],
    skills: ["WhatsApp Business Platform", "Cloud API", "Chatbot Flows", "Meta Business Manager", "CRM"]
  },
  {
    slug: "customer-success-specialist",
    service: "whatsapp-automation",
    title: { ar: "أخصائي نجاح العملاء", en: "Customer Success Specialist" },
    team: { ar: "نجاح العملاء", en: "Customer Success" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية", en: "Saudi Arabia" },
    experience: { ar: "سنة فأكثر", en: "1+ years" },
    icon: "Headset",
    description: { ar: "مرافقة العملاء بعد الإطلاق والتأكد من حصولهم على أفضل نتيجة.", en: "Guide clients after launch and make sure they get the best results." },
    about: {
      ar: "ستكون نقطة التواصل الأولى لعملائنا بعد التعاقد: تساعدهم على البدء، تجيب عن أسئلتهم، وتتابع استخدامهم لحلولنا حتى يحققوا النتائج المتوقعة.",
      en: "You'll be our clients' first point of contact after signing: helping them get started, answering their questions and following their use of our solutions until they see the results they expect."
    },
    responsibilities: [
      { ar: "تهيئة العملاء الجدد وتدريبهم على الأنظمة", en: "Onboard new clients and train them on the systems" },
      { ar: "الرد على استفسارات العملاء ومتابعة طلبات الدعم", en: "Answer client questions and follow up support requests" },
      { ar: "متابعة رضا العملاء ورفع الملاحظات لفريق المنتج", en: "Track satisfaction and pass feedback to the product team" },
      { ar: "اقتراح حلول إضافية تناسب احتياج العميل", en: "Suggest additional solutions that fit the client's needs" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنة في خدمة أو نجاح العملاء", en: "At least 1 year in customer service or success" },
      { ar: "مهارات تواصل ممتازة بالعربية، والإنجليزية ميزة", en: "Excellent Arabic communication; English is a plus" },
      { ar: "صبر وقدرة على شرح الأمور التقنية ببساطة", en: "Patience and the ability to explain technical things simply" },
      { ar: "تنظيم ومتابعة دقيقة", en: "Organized, with careful follow-up" }
    ],
    niceToHave: [
      { ar: "خبرة سابقة في شركة تقنية أو SaaS", en: "Previous tech or SaaS company experience" },
      { ar: "خبرة في أنظمة CRM", en: "CRM experience" }
    ],
    skills: ["Onboarding", "CRM", "WhatsApp", "Support Tickets", "Communication"]
  },
  {
    slug: "ecommerce-specialist",
    service: "ecommerce",
    title: { ar: "أخصائي متاجر إلكترونية", en: "E-Commerce Specialist" },
    team: { ar: "التجارة الإلكترونية", en: "E-Commerce" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "ShoppingCart",
    description: { ar: "إطلاق متاجر زد وسلة وشوبيفاي وتجهيزها للبيع من اليوم الأول.", en: "Launch Zid, Salla and Shopify stores ready to sell from day one." },
    about: {
      ar: "ستطلق متاجر عملائنا كاملة: اختيار المنصة، إعداد الثيم، رفع المنتجات، ربط الدفع والشحن، وتجهيز المتجر للحملات التسويقية.",
      en: "You'll launch our clients' stores end to end: choosing the platform, setting up the theme, uploading products, connecting payments and shipping, and getting the store ready for campaigns."
    },
    responsibilities: [
      { ar: "إعداد المتاجر على زد وسلة وشوبيفاي", en: "Set up stores on Zid, Salla and Shopify" },
      { ar: "رفع المنتجات وتنظيم التصنيفات والخيارات", en: "Upload products and organize categories and variants" },
      { ar: "ربط بوابات الدفع وشركات الشحن", en: "Connect payment gateways and shipping companies" },
      { ar: "تحسين صفحات المنتجات لرفع معدل التحويل", en: "Optimize product pages for conversion" },
      { ar: "إعداد أدوات التتبع والتطبيقات الإضافية", en: "Set up tracking and add-on apps" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في إدارة أو إطلاق المتاجر", en: "At least 2 years running or launching stores" },
      { ar: "إتقان منصتي زد وسلة، وشوبيفاي ميزة", en: "Strong Zid and Salla; Shopify is a plus" },
      { ar: "فهم رحلة الشراء وتجربة العميل", en: "Understanding of the buying journey and customer experience" },
      { ar: "اهتمام بالتفاصيل والتنظيم", en: "Attention to detail and organization" }
    ],
    niceToHave: [
      { ar: "معرفة بـ HTML و CSS لتخصيص الثيمات", en: "HTML and CSS for theme tweaks" },
      { ar: "خبرة في الإعلانات الممولة للمتاجر", en: "Paid ads for online stores" }
    ],
    skills: ["Zid", "Salla", "Shopify", "Payment Gateways", "Shipping", "Pixel"]
  },
  {
    slug: "store-theme-developer",
    service: "ecommerce",
    title: { ar: "مطوّر ثيمات وتكاملات المتاجر", en: "Store Theme & Integrations Developer" },
    team: { ar: "التجارة الإلكترونية", en: "E-Commerce" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "ShoppingBag",
    description: { ar: "تطوير ثيمات مخصصة وتطبيقات وتكاملات لمنصات المتاجر.", en: "Build custom themes, apps and integrations for store platforms." },
    about: {
      ar: "ستطوّر ثيمات مخصصة لمتاجر عملائنا وتربط المتاجر بأنظمتهم الأخرى: المحاسبة، المخزون، واتساب، وأنظمة الشحن — عبر واجهات المنصات البرمجية.",
      en: "You'll develop custom themes for our clients' stores and connect them to their other systems — accounting, inventory, WhatsApp and shipping — through the platforms' APIs."
    },
    responsibilities: [
      { ar: "تطوير وتخصيص ثيمات شوبيفاي (Liquid) وثيمات سلة وزد", en: "Build and customize Shopify (Liquid), Salla and Zid themes" },
      { ar: "بناء تكاملات عبر واجهات API الخاصة بالمنصات", en: "Build integrations through the platforms' APIs" },
      { ar: "مزامنة الطلبات والمخزون مع الأنظمة الخارجية", en: "Sync orders and inventory with external systems" },
      { ar: "تحسين سرعة المتاجر وتجربة الجوال", en: "Improve store speed and the mobile experience" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في تطوير المتاجر", en: "At least 2 years of store development" },
      { ar: "إتقان HTML و CSS و JavaScript", en: "Strong HTML, CSS and JavaScript" },
      { ar: "خبرة في Liquid أو Twig", en: "Liquid or Twig experience" },
      { ar: "خبرة في التعامل مع واجهات REST و Webhooks", en: "Experience with REST APIs and webhooks" }
    ],
    niceToHave: [
      { ar: "خبرة في Node.js", en: "Node.js experience" },
      { ar: "بناء تطبيقات على متجر تطبيقات سلة أو شوبيفاي", en: "Building apps for the Salla or Shopify app stores" }
    ],
    skills: ["Shopify Liquid", "Salla", "Zid", "JavaScript", "REST APIs", "Webhooks"]
  },
  {
    slug: "graphic-designer",
    service: "digital-marketing",
    title: { ar: "مصمم جرافيك", en: "Graphic Designer" },
    team: { ar: "التصميم الإبداعي", en: "Creative Design" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Palette",
    description: { ar: "تصميم محتوى التواصل الاجتماعي والإعلانات بهوية كل علامة.", en: "Design social content and ads in each brand's identity." },
    about: {
      ar: "ستصمم المحتوى البصري لحملات عملائنا: منشورات، إعلانات، كاروسيل، وعروض — بجودة عالية وبما يتوافق مع هوية كل علامة.",
      en: "You'll design the visual content for our clients' campaigns — posts, ads, carousels and presentations — at a high standard and true to each brand."
    },
    responsibilities: [
      { ar: "تصميم منشورات وإعلانات لمنصات التواصل الاجتماعي", en: "Design posts and ads for social platforms" },
      { ar: "الالتزام بالهوية البصرية لكل عميل", en: "Follow each client's visual identity" },
      { ar: "تجهيز المقاسات المختلفة لكل منصة", en: "Prepare sizes for every platform" },
      { ar: "التعاون مع فريق المحتوى والإعلانات", en: "Work with the content and ads team" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في التصميم الجرافيكي", en: "At least 2 years of graphic design" },
      { ar: "إتقان Adobe Photoshop و Illustrator أو Figma", en: "Strong Adobe Photoshop and Illustrator, or Figma" },
      { ar: "إحساس قوي بالخط العربي والتكوين", en: "A strong eye for Arabic typography and composition" },
      { ar: "معرض أعمال حديث", en: "A recent portfolio" }
    ],
    niceToHave: [
      { ar: "مهارات أساسية في الموشن جرافيك", en: "Basic motion graphics" },
      { ar: "استخدام أدوات التصميم بالذكاء الاصطناعي", en: "AI design tools" }
    ],
    skills: ["Photoshop", "Illustrator", "Figma", "Canva", "Social Media Design", "Arabic Typography"]
  },
  {
    slug: "content-writer",
    service: "digital-marketing",
    title: { ar: "كاتب محتوى وإعلانات", en: "Content & Ad Copywriter" },
    team: { ar: "التسويق", en: "Marketing" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "PenTool",
    description: { ar: "كتابة محتوى عربي مقنع للمنصات والإعلانات والمواقع.", en: "Write persuasive Arabic content for social, ads and websites." },
    about: {
      ar: "ستكتب محتوى عملائنا بصوت كل علامة: منشورات، نصوص إعلانية، صفحات مواقع، ورسائل واتساب — محتوى واضح يبيع ويبني الثقة.",
      en: "You'll write our clients' content in each brand's voice — posts, ad copy, web pages and WhatsApp messages — clear content that sells and builds trust."
    },
    responsibilities: [
      { ar: "كتابة خطط المحتوى الشهرية ونصوص المنشورات", en: "Write monthly content plans and post copy" },
      { ar: "كتابة نصوص الإعلانات وصفحات الهبوط", en: "Write ad copy and landing pages" },
      { ar: "كتابة محتوى المواقع والمدونات بما يناسب محركات البحث", en: "Write SEO-friendly website and blog content" },
      { ar: "تكييف النبرة مع هوية كل عميل", en: "Adapt the tone to each client's brand" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في كتابة المحتوى التسويقي", en: "At least 2 years of marketing copywriting" },
      { ar: "لغة عربية سليمة وأسلوب جذّاب", en: "Correct Arabic and an engaging style" },
      { ar: "فهم الجمهور السعودي واللهجة المحلية", en: "Understanding of the Saudi audience and local dialect" },
      { ar: "نماذج من أعمال منشورة", en: "Samples of published work" }
    ],
    niceToHave: [
      { ar: "الكتابة بالإنجليزية", en: "Writing in English" },
      { ar: "خبرة في تحسين محركات البحث (SEO)", en: "SEO experience" }
    ],
    skills: ["Copywriting", "Content Plans", "SEO Writing", "Ad Copy", "Arabic"]
  },
  {
    slug: "video-motion-designer",
    service: "digital-marketing",
    title: { ar: "مصمم موشن ومونتير فيديو", en: "Motion Designer & Video Editor" },
    team: { ar: "التصميم الإبداعي", en: "Creative Design" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Play",
    description: { ar: "إنتاج فيديوهات قصيرة وموشن جرافيك للإعلانات والمنصات.", en: "Produce short videos and motion graphics for ads and social." },
    about: {
      ar: "ستنتج الفيديوهات التي تتصدر حملات عملائنا: ريلز وتيك توك، إعلانات قصيرة، وفيديوهات شرح بالموشن جرافيك.",
      en: "You'll produce the videos that lead our clients' campaigns — Reels and TikToks, short ads and animated explainer videos."
    },
    responsibilities: [
      { ar: "مونتاج فيديوهات قصيرة للمنصات بإيقاع جذّاب", en: "Edit short, well-paced videos for social platforms" },
      { ar: "تصميم موشن جرافيك وفيديوهات شرح", en: "Create motion graphics and explainer videos" },
      { ar: "إضافة النصوص والترجمة والمؤثرات الصوتية", en: "Add captions, subtitles and sound effects" },
      { ar: "تجهيز نسخ متعددة لكل منصة ومقاس", en: "Prepare versions for each platform and format" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في المونتاج أو الموشن", en: "At least 2 years of video editing or motion design" },
      { ar: "إتقان Premiere Pro أو CapCut و After Effects", en: "Strong Premiere Pro or CapCut, and After Effects" },
      { ar: "فهم أسلوب المحتوى القصير على تيك توك وإنستغرام", en: "Understanding of short-form content on TikTok and Instagram" },
      { ar: "معرض أعمال فيديو", en: "A video portfolio" }
    ],
    niceToHave: [
      { ar: "تصوير بالجوال أو الكاميرا", en: "Phone or camera shooting" },
      { ar: "أدوات الفيديو بالذكاء الاصطناعي", en: "AI video tools" }
    ],
    skills: ["Premiere Pro", "After Effects", "CapCut", "Motion Graphics", "Reels", "TikTok"]
  },
  {
    slug: "systems-integration-engineer",
    service: "digital-transformation",
    title: { ar: "مهندس تكامل الأنظمة", en: "Systems Integration Engineer" },
    team: { ar: "التحول الرقمي", en: "Digital Transformation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "Cable",
    description: { ar: "ربط أنظمة ERP و CRM والمحاسبة والمتاجر لتعمل كنظام واحد.", en: "Connect ERP, CRM, accounting and store systems so they work as one." },
    about: {
      ar: "ستربط الأنظمة المتفرقة لدى عملائنا — أنظمة الموارد، العملاء، المحاسبة، المتاجر، والفوترة الإلكترونية — حتى تنتقل البيانات بينها تلقائياً وبدقة.",
      en: "You'll connect our clients' scattered systems — ERP, CRM, accounting, stores and e-invoicing — so data flows between them automatically and accurately."
    },
    responsibilities: [
      { ar: "تصميم وتنفيذ تكاملات بين الأنظمة عبر API و Webhooks", en: "Design and build system integrations via APIs and webhooks" },
      { ar: "ترحيل البيانات من الأنظمة القديمة", en: "Migrate data from legacy systems" },
      { ar: "مراقبة التكاملات ومعالجة الأخطاء وإعادة المحاولة", en: "Monitor integrations and handle errors and retries" },
      { ar: "توثيق تدفق البيانات بين الأنظمة", en: "Document data flows between systems" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 3 سنوات في تطوير الخلفيات أو التكاملات", en: "At least 3 years of back-end or integration development" },
      { ar: "إتقان Node.js أو Python و SQL", en: "Strong Node.js or Python, and SQL" },
      { ar: "خبرة في REST و OAuth و Webhooks", en: "REST, OAuth and webhooks experience" },
      { ar: "خبرة في نظام ERP أو CRM واحد على الأقل", en: "Experience with at least one ERP or CRM" }
    ],
    niceToHave: [
      { ar: "خبرة في Odoo أو Zoho أو SAP", en: "Odoo, Zoho or SAP experience" },
      { ar: "معرفة بمتطلبات الفوترة الإلكترونية (فاتورة / ZATCA)", en: "E-invoicing knowledge (Fatoora / ZATCA)" }
    ],
    skills: ["Node.js", "Python", "SQL", "REST", "OAuth", "Odoo", "Zoho", "ZATCA"]
  },
  {
    slug: "business-analyst",
    service: "digital-transformation",
    title: { ar: "محلل أعمال", en: "Business Analyst" },
    team: { ar: "التحول الرقمي", en: "Digital Transformation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية", en: "Saudi Arabia" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "ClipboardList",
    description: { ar: "فهم احتياج العميل وتحويله إلى متطلبات واضحة لفريق التطوير.", en: "Understand client needs and turn them into clear requirements for the team." },
    about: {
      ar: "ستجلس مع عملائنا لفهم طريقة عملهم وتحدياتهم، ثم تحوّلها إلى متطلبات ورحلات استخدام واضحة يبني عليها فريق التطوير الحل المناسب.",
      en: "You'll sit with our clients to understand how they work and what holds them back, then turn that into clear requirements and user journeys the team builds from."
    },
    responsibilities: [
      { ar: "إدارة ورش العمل مع العملاء وجمع المتطلبات", en: "Run client workshops and gather requirements" },
      { ar: "رسم العمليات الحالية والمستقبلية", en: "Map current and future processes" },
      { ar: "كتابة وثائق المتطلبات وقصص المستخدمين", en: "Write requirement documents and user stories" },
      { ar: "التأكد من أن الحل المسلَّم يطابق الاحتياج", en: "Make sure the delivered solution matches the need" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 3 سنوات في تحليل الأعمال", en: "At least 3 years of business analysis" },
      { ar: "مهارات تواصل وعرض ممتازة بالعربية والإنجليزية", en: "Excellent communication and presentation in Arabic and English" },
      { ar: "خبرة في رسم العمليات (BPMN أو ما يشابهه)", en: "Process mapping (BPMN or similar)" },
      { ar: "فهم جيد لدورة تطوير البرمجيات", en: "Good understanding of the software development cycle" }
    ],
    niceToHave: [
      { ar: "شهادة CBAP أو PMI-PBA", en: "CBAP or PMI-PBA certification" },
      { ar: "خبرة في القطاع الحكومي أو الشركات الكبيرة", en: "Government or enterprise experience" }
    ],
    skills: ["Requirements", "User Stories", "BPMN", "Jira", "Workshops", "Documentation"]
  },
  {
    slug: "technical-project-manager",
    service: "dedicated-tech-team",
    title: { ar: "مدير مشاريع تقنية", en: "Technical Project Manager" },
    team: { ar: "الفريق التقني المتكامل", en: "Dedicated Tech Team" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية", en: "Saudi Arabia" },
    experience: { ar: "4 سنوات فأكثر", en: "4+ years" },
    icon: "Briefcase",
    description: { ar: "قيادة فرق التطوير وتسليم المشاريع في وقتها وبجودة عالية.", en: "Lead development teams and deliver projects on time and to a high standard." },
    about: {
      ar: "ستقود فرقنا التقنية المخصصة للعملاء: تخطط المراحل، توزّع المهام، تتابع التقدم، وتكون حلقة الوصل الواضحة بين العميل والفريق.",
      en: "You'll lead the tech teams we dedicate to clients — planning phases, assigning work, tracking progress, and being the clear link between the client and the team."
    },
    responsibilities: [
      { ar: "تخطيط المشاريع وتقسيمها إلى مراحل ومهام", en: "Plan projects and break them into phases and tasks" },
      { ar: "إدارة الفريق بمنهجية Agile / Scrum", en: "Run the team with Agile / Scrum" },
      { ar: "متابعة الجداول والمخاطر والتكلفة", en: "Track schedules, risks and cost" },
      { ar: "التواصل الدوري مع العملاء وإعداد تقارير التقدم", en: "Keep clients updated with regular progress reports" },
      { ar: "ضمان جودة التسليم والتزام الفريق", en: "Ensure delivery quality and team commitment" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 4 سنوات في إدارة مشاريع تقنية", en: "At least 4 years managing tech projects" },
      { ar: "فهم تقني جيد لتطوير الويب والتطبيقات", en: "Good technical understanding of web and app development" },
      { ar: "خبرة في Jira أو أدوات إدارة مشابهة", en: "Jira or similar tools" },
      { ar: "قيادة وتواصل ممتاز مع العملاء", en: "Strong leadership and client communication" }
    ],
    niceToHave: [
      { ar: "شهادة PMP أو Scrum Master", en: "PMP or Scrum Master certification" },
      { ar: "خلفية برمجية سابقة", en: "A previous programming background" }
    ],
    skills: ["Agile", "Scrum", "Jira", "Planning", "Risk Management", "Client Communication"]
  },
  {
    slug: "devops-engineer",
    service: "dedicated-tech-team",
    title: { ar: "مهندس DevOps والبنية السحابية", en: "DevOps & Cloud Engineer" },
    team: { ar: "الفريق التقني المتكامل", en: "Dedicated Tech Team" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "Server",
    description: { ar: "إدارة الخوادم والنشر الآلي والمراقبة وأمان الأنظمة.", en: "Run servers, automated deployment, monitoring and system security." },
    about: {
      ar: "ستضمن أن أنظمة عملائنا تعمل بثبات وأمان: من إعداد الخوادم والسحابة إلى خطوط النشر الآلي والنسخ الاحتياطي والمراقبة.",
      en: "You'll keep our clients' systems running reliably and securely — from servers and cloud setup to automated deployment pipelines, backups and monitoring."
    },
    responsibilities: [
      { ar: "إعداد وإدارة الخوادم والبيئات السحابية", en: "Set up and manage servers and cloud environments" },
      { ar: "بناء خطوط النشر الآلي (CI/CD)", en: "Build CI/CD pipelines" },
      { ar: "إعداد المراقبة والتنبيهات والنسخ الاحتياطي", en: "Set up monitoring, alerts and backups" },
      { ar: "تطبيق معايير الأمان وإدارة الصلاحيات والأسرار", en: "Apply security standards and manage access and secrets" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 3 سنوات في DevOps أو إدارة الأنظمة", en: "At least 3 years of DevOps or systems administration" },
      { ar: "إتقان Linux و Docker", en: "Strong Linux and Docker" },
      { ar: "خبرة في GitHub Actions أو أدوات CI/CD مشابهة", en: "GitHub Actions or similar CI/CD" },
      { ar: "خبرة في AWS أو Azure أو Google Cloud", en: "AWS, Azure or Google Cloud experience" }
    ],
    niceToHave: [
      { ar: "خبرة في Kubernetes و Terraform", en: "Kubernetes and Terraform" },
      { ar: "خبرة في استضافة cPanel وخوادم Nginx", en: "cPanel hosting and Nginx" }
    ],
    skills: ["Linux", "Docker", "GitHub Actions", "AWS", "Nginx", "PostgreSQL", "Monitoring"]
  },
  {
    slug: "qa-engineer",
    service: "dedicated-tech-team",
    title: { ar: "مهندس ضمان الجودة (QA)", en: "QA Engineer" },
    team: { ar: "الفريق التقني المتكامل", en: "Dedicated Tech Team" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "SearchCheck",
    description: { ar: "اختبار المواقع والتطبيقات قبل الإطلاق وضمان خلوّها من الأخطاء.", en: "Test websites and apps before launch and make sure they're bug-free." },
    about: {
      ar: "ستكون خط الدفاع الأخير قبل وصول أي منتج للعميل: تختبر الوظائف والأداء والتوافق، وتكتب اختبارات آلية تحمي الجودة مع كل تحديث.",
      en: "You'll be the last line of defence before anything reaches the client — testing features, performance and compatibility, and writing automated tests that protect quality with every update."
    },
    responsibilities: [
      { ar: "كتابة خطط وحالات الاختبار", en: "Write test plans and test cases" },
      { ar: "اختبار المواقع والتطبيقات يدوياً وآلياً", en: "Test websites and apps manually and automatically" },
      { ar: "توثيق الأخطاء ومتابعة إصلاحها مع المطورين", en: "Report bugs and follow fixes with developers" },
      { ar: "اختبار التوافق مع الأجهزة والمتصفحات والعربية", en: "Test device, browser and Arabic compatibility" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في اختبار البرمجيات", en: "At least 2 years of software testing" },
      { ar: "خبرة في أدوات الاختبار الآلي مثل Playwright أو Cypress", en: "Automated testing tools such as Playwright or Cypress" },
      { ar: "دقة عالية ومهارة في توثيق الأخطاء", en: "High attention to detail and clear bug reports" },
      { ar: "معرفة باختبار واجهات API", en: "API testing knowledge" }
    ],
    niceToHave: [
      { ar: "اختبار الأداء والأمان", en: "Performance and security testing" },
      { ar: "شهادة ISTQB", en: "ISTQB certification" }
    ],
    skills: ["Playwright", "Cypress", "Postman", "Test Plans", "Jira", "Accessibility"]
  },
  {
    slug: "brand-identity-designer",
    service: "ux-ui-design",
    title: { ar: "مصمم هوية بصرية", en: "Brand Identity Designer" },
    team: { ar: "التصميم", en: "Design" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "Gem",
    description: { ar: "بناء هويات بصرية متكاملة للعلامات من الشعار حتى دليل الاستخدام.", en: "Build complete brand identities, from the logo to the brand guidelines." },
    about: {
      ar: "ستبني هويات بصرية تعبّر عن عملائنا: الشعار، الألوان، الخطوط، والعناصر — ثم دليل استخدام يضمن ظهور العلامة بشكل متسق في كل مكان.",
      en: "You'll create visual identities that express our clients — logo, colors, type and elements — and then the guidelines that keep the brand consistent everywhere."
    },
    responsibilities: [
      { ar: "البحث عن العلامة وجمهورها ومنافسيها", en: "Research the brand, its audience and competitors" },
      { ar: "تصميم الشعارات والهويات البصرية", en: "Design logos and visual identities" },
      { ar: "إعداد أدلة الهوية وتطبيقاتها", en: "Prepare brand guidelines and applications" },
      { ar: "التعاون مع فريق UX/UI لنقل الهوية إلى المنتجات الرقمية", en: "Work with UX/UI to bring the brand into digital products" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن 3 سنوات في تصميم الهويات", en: "At least 3 years of brand identity design" },
      { ar: "إتقان Adobe Illustrator", en: "Strong Adobe Illustrator" },
      { ar: "خبرة في الشعارات العربية والثنائية اللغة", en: "Arabic and bilingual logo experience" },
      { ar: "معرض أعمال يوضح مراحل التفكير", en: "A portfolio that shows your process" }
    ],
    niceToHave: [
      { ar: "تصميم الخطوط والحروف", en: "Type and lettering design" },
      { ar: "تصميم التغليف والمطبوعات", en: "Packaging and print design" }
    ],
    skills: ["Illustrator", "Photoshop", "Brand Guidelines", "Logo Design", "Arabic Lettering"]
  }
];

export const careersCopy = {
  rolesCount: { ar: "وظيفة متاحة", en: "open roles" } as L,
  all: { ar: "كل الأقسام", en: "All teams" } as L,
  details: { ar: "عرض التفاصيل", en: "View details" } as L,
  back: { ar: "كل الوظائف", en: "All jobs" } as L,
  experience: { ar: "الخبرة", en: "Experience" } as L,
  about: { ar: "عن الوظيفة", en: "About the role" } as L,
  responsibilities: { ar: "المسؤوليات", en: "Responsibilities" } as L,
  requirements: { ar: "المتطلبات", en: "Requirements" } as L,
  niceToHave: { ar: "ميزة إضافية", en: "Nice to have" } as L,
  skills: { ar: "المهارات والأدوات", en: "Skills & tools" } as L,
  summary: { ar: "ملخص الوظيفة", en: "Job summary" } as L,
  applyTitle: { ar: "كيف تتقدم؟", en: "How to apply" } as L,
  applyText: {
    ar: "أرسل سيرتك الذاتية ورابط أعمالك إلى بريد التوظيف، واكتب اسم الوظيفة في عنوان الرسالة. نراجع كل طلب ونرد عليك.",
    en: "Send your CV and a link to your work to our careers e-mail, with the job title in the subject. We review every application and get back to you."
  } as L,
  mailSubject: { ar: "طلب توظيف", en: "Job application" } as L,
  browse: { ar: "تصفح الوظائف", en: "Browse jobs" } as L,
  mailBody: {
    ar: "مرحباً فريق DMS Tech،\n\nأرغب في التقدم لوظيفة: {job}\n\nالاسم:\nرقم الجوال:\nرابط الأعمال / LinkedIn:\n\nالسيرة الذاتية مرفقة.\n",
    en: "Hello DMS Tech team,\n\nI'd like to apply for: {job}\n\nName:\nPhone:\nPortfolio / LinkedIn:\n\nMy CV is attached.\n"
  } as L,
  other: { ar: "وظائف أخرى", en: "Other openings" } as L,
  perksTitle: { ar: "لماذا تعمل *معنا*؟", en: "Why work *with us*?" } as L,
  perks: [
    { icon: "Rocket", title: { ar: "مشاريع حقيقية", en: "Real projects" }, text: { ar: "تعمل على أنظمة ومنتجات يستخدمها عملاء حقيقيون كل يوم.", en: "Work on systems and products real customers use every day." } },
    { icon: "Globe", title: { ar: "مرونة في العمل", en: "Flexible work" }, text: { ar: "أغلب وظائفنا تقبل العمل عن بُعد من داخل المملكة.", en: "Most of our roles are open to remote work within Saudi Arabia." } },
    { icon: "Sparkles", title: { ar: "أحدث التقنيات", en: "Modern stack" }, text: { ar: "ذكاء اصطناعي، أتمتة، وأدوات تطوير حديثة في عملك اليومي.", en: "AI, automation and modern tooling in your daily work." } },
    { icon: "GraduationCap", title: { ar: "تعلّم مستمر", en: "Keep learning" }, text: { ar: "مراجعات كود، مشاركة معرفة، وفرص لتطوير مهاراتك.", en: "Code reviews, knowledge sharing and room to grow your skills." } },
    { icon: "Users", title: { ar: "فريق متعاون", en: "A team that helps" }, text: { ar: "فريق صغير، قرارات سريعة، وأثر واضح لعملك.", en: "A small team, quick decisions and visible impact." } },
    { icon: "TrendingUp", title: { ar: "مسار نمو", en: "Room to grow" }, text: { ar: "نكبر مع كل مشروع، وتكبر مسؤولياتك معنا.", en: "We grow with every project — and so does your role." } }
  ] as { icon: IconName; title: L; text: L }[],
  processTitle: { ar: "مراحل *التوظيف*", en: "Our hiring *process*" } as L,
  process: [
    { icon: "Send", title: { ar: "أرسل طلبك", en: "Apply" }, text: { ar: "سيرتك الذاتية ورابط أعمالك على بريد التوظيف.", en: "Your CV and a link to your work, by e-mail." } },
    { icon: "FileSearch", title: { ar: "مراجعة الطلب", en: "Review" }, text: { ar: "نراجع خبرتك وأعمالك بعناية.", en: "We review your experience and work carefully." } },
    { icon: "PhoneCall", title: { ar: "مقابلة تعارف", en: "Intro call" }, text: { ar: "مكالمة قصيرة للتعارف وفهم توقعاتك.", en: "A short call to get to know you and your expectations." } },
    { icon: "ClipboardList", title: { ar: "مقابلة فنية", en: "Technical interview" }, text: { ar: "نقاش عملي حول مهاراتك ومشاريعك.", en: "A practical discussion about your skills and projects." } },
    { icon: "Handshake", title: { ar: "العرض الوظيفي", en: "Offer" }, text: { ar: "عرض واضح وبداية رحلتك معنا.", en: "A clear offer — and the start of your journey with us." } }
  ] as { icon: IconName; title: L; text: L }[]
};
