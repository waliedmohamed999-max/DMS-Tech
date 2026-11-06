import type { Job } from "./types";

/**
 * Open roles (from 6 Nov 2026). Listed first on /careers; each has its own page with the application form.
 * Salaries are not published (agreed at the offer stage); locations follow how each role works.
 */
export const openJobs: Job[] = [
  {
    slug: "ai-engineer",
    service: "ai-automation",
    status: "open",
    title: { ar: "مهندس ذكاء اصطناعي", en: "AI Engineer" },
    team: { ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "3 سنوات فأكثر", en: "3+ years" },
    icon: "BrainCircuit",
    description: {
      ar: "تصميم وبناء حلول ذكاء اصطناعي حقيقية: مساعدات ذكية، بحث في مستندات الشركات، وأتمتة قرارات العمل.",
      en: "Design and build real AI solutions: smart assistants, search over company documents and automated business decisions."
    },
    about: {
      ar: "ستقود الجانب الهندسي لحلول الذكاء الاصطناعي التي نقدمها لعملائنا: من فهم المشكلة واختيار النموذج المناسب، إلى بناء أنظمة RAG والمساعدات الذكية وربطها بأنظمة العميل وقياس جودتها وتكلفتها في الإنتاج. تعمل مع فريق التطوير ومدير المشروع، وتشرح للعميل ما يمكن وما لا يمكن بوضوح.",
      en: "You'll lead the engineering of the AI solutions we deliver to clients: from understanding the problem and choosing the right model, to building RAG systems and smart assistants, connecting them to the client's systems and measuring their quality and cost in production. You'll work with the development team and project manager, and explain clearly to clients what is and isn't possible."
    },
    responsibilities: [
      { ar: "تصميم حلول قائمة على النماذج اللغوية الكبيرة (LLMs) حسب احتياج كل عميل", en: "Design solutions built on large language models (LLMs) for each client's needs" },
      { ar: "بناء أنظمة RAG للبحث والإجابة من مستندات وبيانات الشركات، مع قواعد بيانات المتجهات", en: "Build RAG systems that search and answer from company documents and data, with vector databases" },
      { ar: "تطوير مساعدات ووكلاء ذكيين يستخدمون الأدوات وواجهات API لتنفيذ مهام فعلية", en: "Develop smart assistants and agents that use tools and APIs to carry out real tasks" },
      { ar: "تقييم جودة الإجابات ودقتها باللغة العربية، وتقليل الأخطاء والهلوسة", en: "Evaluate answer quality and accuracy in Arabic, and reduce errors and hallucinations" },
      { ar: "مراقبة الأداء والتكلفة وزمن الاستجابة في الإنتاج وتحسينها", en: "Monitor and improve performance, cost and latency in production" },
      { ar: "الالتزام بخصوصية بيانات العملاء وأمنها في كل حل", en: "Protect client data privacy and security in every solution" },
      { ar: "توثيق الحلول ونقل المعرفة للفريق", en: "Document solutions and share knowledge with the team" }
    ],
    requirements: [
      { ar: "خبرة عملية لا تقل عن 3 سنوات في هندسة البرمجيات، منها سنة على الأقل في مشاريع ذكاء اصطناعي", en: "At least 3 years of software engineering, including at least 1 year on AI projects" },
      { ar: "إتقان Python، ومعرفة جيدة بـ TypeScript أو Node.js", en: "Strong Python, with good TypeScript or Node.js" },
      { ar: "خبرة عملية مع واجهات النماذج اللغوية (Claude أو OpenAI أو غيرها) وهندسة التعليمات", en: "Hands-on experience with LLM APIs (Claude, OpenAI or others) and prompt engineering" },
      { ar: "بناء نظام RAG واحد على الأقل في بيئة إنتاج", en: "Built at least one RAG system in production" },
      { ar: "معرفة بقواعد البيانات (PostgreSQL) وقواعد بيانات المتجهات (مثل pgvector)", en: "Database knowledge (PostgreSQL) and vector databases (such as pgvector)" },
      { ar: "قدرة على شرح الأمور التقنية لغير المتخصصين بالعربية", en: "Able to explain technical matters to non-specialists in Arabic" }
    ],
    niceToHave: [
      { ar: "خبرة في معالجة اللغة العربية وتحدياتها", en: "Experience with Arabic language processing and its challenges" },
      { ar: "خبرة في تقييم النماذج (Evals) وبناء مجموعات اختبار", en: "Experience with model evaluation (evals) and building test sets" },
      { ar: "معرفة بـ MCP وبناء أدوات للوكلاء", en: "Knowledge of MCP and building tools for agents" },
      { ar: "خبرة في النشر السحابي وDocker", en: "Cloud deployment and Docker experience" }
    ],
    skills: ["Python", "LLMs", "RAG", "Vector DBs", "pgvector", "Prompt Engineering", "AI Agents", "Evals", "TypeScript", "PostgreSQL"]
  },
  {
    slug: "ai-agents-developer",
    service: "ai-automation",
    status: "open",
    title: { ar: "مطوّر وكلاء وأتمتة بالذكاء الاصطناعي", en: "AI Agents & Automation Developer" },
    team: { ar: "الذكاء الاصطناعي والأتمتة", en: "AI & Automation" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Bot",
    description: {
      ar: "بناء وكلاء ذكاء اصطناعي ومسارات أتمتة توفّر وقت فرق العملاء: الرد على العملاء، المتابعة، والتقارير.",
      en: "Build AI agents and automation flows that save client teams time: answering customers, follow-ups and reporting."
    },
    about: {
      ar: "ستحوّل العمل اليدوي المتكرر عند عملائنا إلى مسارات تعمل تلقائياً: وكيل يرد على عملاء واتساب ويؤهلهم، أتمتة تنقل البيانات بين المتجر ونظام CRM، وتقارير تصل للإدارة كل صباح. تبني الحل وتختبره مع العميل وتتابعه بعد الإطلاق.",
      en: "You'll turn repetitive manual work at our clients into flows that run on their own: an agent that answers and qualifies WhatsApp customers, automation that moves data between the store and the CRM, and reports that reach management every morning. You build the solution, test it with the client and follow it up after launch."
    },
    responsibilities: [
      { ar: "تحليل العمليات اليدوية عند العميل واقتراح ما يمكن أتمتته", en: "Analyse a client's manual processes and propose what can be automated" },
      { ar: "بناء وكلاء محادثة بالذكاء الاصطناعي لواتساب والمواقع، مع تحويل الحالات المعقدة للموظفين", en: "Build AI chat agents for WhatsApp and websites, handing complex cases to staff" },
      { ar: "بناء مسارات أتمتة باستخدام n8n أو Make وربطها عبر واجهات API وWebhooks", en: "Build automation flows with n8n or Make, connected through APIs and webhooks" },
      { ar: "ربط الأنظمة: المتاجر (زد، سلة، شوبيفاي)، أنظمة CRM، Google Workspace", en: "Connect systems: stores (Zid, Salla, Shopify), CRMs, Google Workspace" },
      { ar: "اختبار المسارات ومعالجة الأخطاء ومراقبتها بعد الإطلاق", en: "Test flows, handle errors and monitor them after launch" },
      { ar: "تدريب فريق العميل وكتابة دليل استخدام مبسط", en: "Train the client's team and write a simple user guide" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في الأتمتة أو التطوير", en: "At least 2 years in automation or development" },
      { ar: "خبرة عملية في n8n أو Make أو Zapier", en: "Hands-on n8n, Make or Zapier experience" },
      { ar: "فهم واجهات REST وJSON وWebhooks", en: "Understanding of REST APIs, JSON and webhooks" },
      { ar: "خبرة في بناء شات بوت أو وكيل يستخدم نموذجاً لغوياً", en: "Experience building a chatbot or an agent on a language model" },
      { ar: "معرفة أساسية بـ JavaScript أو Python", en: "Basic JavaScript or Python" },
      { ar: "تفكير منظم واهتمام بالتفاصيل", en: "Structured thinking and attention to detail" }
    ],
    niceToHave: [
      { ar: "خبرة في WhatsApp Business Platform", en: "WhatsApp Business Platform experience" },
      { ar: "خبرة في ربط المتاجر الإلكترونية السعودية", en: "Experience integrating Saudi e-commerce platforms" },
      { ar: "معرفة بقواعد البيانات", en: "Database knowledge" }
    ],
    skills: ["n8n", "Make", "Webhooks", "REST APIs", "AI Agents", "Chatbots", "WhatsApp API", "JavaScript", "Python"]
  },
  {
    slug: "full-stack-engineer",
    service: "web-development",
    status: "open",
    openings: 2,
    title: { ar: "مبرمج Full-Stack", en: "Full-Stack Developer" },
    team: { ar: "تطوير التطبيقات", en: "App Development" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "CodeXml",
    description: {
      ar: "بناء مواقع وأنظمة إدارة ولوحات تحكم حقيقية لعملائنا ولمنتجاتنا باستخدام Next.js وNode.js.",
      en: "Build real websites, admin systems and dashboards for our clients and products with Next.js and Node.js."
    },
    about: {
      ar: "نوسّع فريق التطوير ونبحث عن أكثر من مبرمج Full-Stack. ستعمل على الواجهة والخادم وقاعدة البيانات معاً: مواقع شركات، متاجر، أنظمة إدارة داخلية، وتكاملات مع خدمات خارجية. تستلم الميزة من الفكرة حتى الإطلاق، مع مراجعة كود واختبارات.",
      en: "We're growing the development team and hiring more than one full-stack developer. You'll work across the front end, server and database: company websites, stores, internal admin systems and integrations with external services. You'll take features from idea to launch, with code review and tests."
    },
    responsibilities: [
      { ar: "تطوير واجهات سريعة ومتجاوبة باستخدام Next.js وReact وTypeScript، بالعربية والإنجليزية", en: "Build fast, responsive interfaces with Next.js, React and TypeScript, in Arabic and English" },
      { ar: "بناء واجهات API وخدمات خلفية بـ Node.js", en: "Build APIs and back-end services with Node.js" },
      { ar: "تصميم قواعد البيانات وكتابة استعلامات فعّالة (PostgreSQL وPrisma)", en: "Design databases and write efficient queries (PostgreSQL and Prisma)" },
      { ar: "ربط الأنظمة بخدمات خارجية: بوابات الدفع، واتساب، الفوترة الإلكترونية", en: "Integrate external services: payment gateways, WhatsApp, e-invoicing" },
      { ar: "كتابة الاختبارات ومراجعة كود الزملاء والالتزام بمعايير الأمان", en: "Write tests, review teammates' code and follow security practices" },
      { ar: "النشر والمتابعة بعد الإطلاق وإصلاح المشاكل", en: "Deploy, follow up after launch and fix issues" }
    ],
    requirements: [
      { ar: "خبرة عملية لا تقل عن سنتين في تطوير تطبيقات الويب", en: "At least 2 years of hands-on web development" },
      { ar: "إتقان JavaScript وTypeScript وReact، وخبرة في Next.js", en: "Strong JavaScript, TypeScript and React, with Next.js experience" },
      { ar: "خبرة في Node.js وبناء واجهات REST", en: "Node.js and REST API experience" },
      { ar: "معرفة جيدة بقواعد البيانات العلائقية (PostgreSQL أو MySQL)", en: "Good knowledge of relational databases (PostgreSQL or MySQL)" },
      { ar: "استخدام Git والعمل ضمن فريق بمراجعات كود", en: "Git and team workflows with code review" },
      { ar: "أعمال سابقة أو حساب GitHub يمكن الاطلاع عليه", en: "Previous work or a GitHub profile we can look at" }
    ],
    niceToHave: [
      { ar: "خبرة في واجهات عربية من اليمين لليسار (RTL)", en: "Experience with Arabic right-to-left (RTL) interfaces" },
      { ar: "خبرة في Tailwind CSS", en: "Tailwind CSS experience" },
      { ar: "خبرة في ربط النماذج اللغوية بالتطبيقات", en: "Experience connecting language models to applications" },
      { ar: "معرفة بالنشر على Vercel أو الاستضافات السحابية", en: "Deployment on Vercel or cloud hosting" }
    ],
    skills: ["Next.js", "React", "TypeScript", "Node.js", "PostgreSQL", "Prisma", "Tailwind CSS", "REST APIs", "Git"]
  },
  {
    slug: "business-development-executive",
    service: "digital-transformation",
    status: "open",
    title: { ar: "مسؤول تسويق وتطوير أعمال", en: "Business Development & Marketing Executive" },
    team: { ar: "المبيعات وتطوير الأعمال", en: "Sales & Business Development" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية", en: "Saudi Arabia" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Handshake",
    description: {
      ar: "جلب مشاريع جديدة للشركة: البحث عن العملاء، التواصل معهم، تقديم خدماتنا، ومتابعة الصفقات حتى التعاقد.",
      en: "Bring new projects to the company: find clients, reach out, present our services and follow deals through to signing."
    },
    about: {
      ar: "مهمتك الأساسية أن تجلب مشاريع جديدة: مواقع وأنظمة ومتاجر وحلول ذكاء اصطناعي وتسويق. تبحث عن الشركات التي تحتاج خدماتنا، وتتواصل معها، وتفهم احتياجها، وتنسّق مع الفريق التقني لإعداد العرض المناسب، ثم تتابع حتى توقيع العقد. ستعمل على نظام CRM الخاص بنا، وتشارك في التسويق والحملات التي تجلب العملاء.",
      en: "Your core job is to bring in new projects: websites, systems, stores, AI solutions and marketing. You'll find companies that need our services, reach out, understand their needs, work with the technical team on the right proposal, then follow through to the signed contract. You'll work in our CRM and take part in the marketing and campaigns that bring in clients."
    },
    responsibilities: [
      { ar: "بناء قائمة عملاء محتملين من الشركات والمتاجر في السعودية والتواصل معهم", en: "Build a pipeline of prospective companies and stores in Saudi Arabia and reach out to them" },
      { ar: "عقد اجتماعات تعريفية (حضورية أو عن بُعد) وفهم احتياج العميل", en: "Hold intro meetings (in person or remote) and understand the client's needs" },
      { ar: "إعداد عروض الأسعار مع الفريق التقني ومتابعتها حتى التعاقد", en: "Prepare quotations with the technical team and follow them up to signing" },
      { ar: "متابعة العملاء المحتملين من الموقع والحملات والرد عليهم بسرعة", en: "Follow up leads from the website and campaigns, and respond quickly" },
      { ar: "تسجيل كل فرصة ومتابعة في نظام CRM وتحقيق الأهداف الشهرية", en: "Record every opportunity and follow-up in the CRM and meet monthly targets" },
      { ar: "المشاركة في خطط التسويق والمعارض والفعاليات والشراكات", en: "Take part in marketing plans, exhibitions, events and partnerships" },
      { ar: "بناء علاقات طويلة مع العملاء وفتح فرص جديدة معهم", en: "Build long-term client relationships and open new opportunities with them" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في المبيعات أو تطوير الأعمال، ويُفضّل في التقنية أو التسويق الرقمي", en: "At least 2 years in sales or business development, ideally in tech or digital marketing" },
      { ar: "سجل واضح في جلب عملاء أو مشاريع وتحقيق أهداف مبيعات", en: "A clear record of winning clients or projects and meeting sales targets" },
      { ar: "مهارات تواصل وتفاوض وإقناع ممتازة بالعربية", en: "Excellent Arabic communication, negotiation and persuasion" },
      { ar: "فهم عام للخدمات الرقمية: المواقع، المتاجر، التسويق، الأتمتة", en: "General understanding of digital services: websites, stores, marketing, automation" },
      { ar: "خبرة في استخدام نظام CRM وLinkedIn للوصول للعملاء", en: "Experience with a CRM and LinkedIn for reaching clients" },
      { ar: "شبكة علاقات في سوق الأعمال السعودي ميزة قوية", en: "A network in the Saudi business market is a strong plus" }
    ],
    niceToHave: [
      { ar: "الإنجليزية الجيدة", en: "Good English" },
      { ar: "خبرة في بيع خدمات لقطاعات حكومية أو شبه حكومية", en: "Experience selling to government or semi-government sectors" },
      { ar: "خبرة في إعداد العروض التقديمية", en: "Experience preparing presentations" },
      { ar: "رخصة قيادة سارية", en: "A valid driving licence" }
    ],
    skills: ["B2B Sales", "Lead Generation", "CRM", "LinkedIn", "Negotiation", "Proposals", "Account Management", "Digital Marketing"]
  },
  {
    slug: "customer-service-representative",
    service: "whatsapp-automation",
    status: "open",
    openings: 2,
    title: { ar: "موظفة خدمة عملاء", en: "Customer Service Representative (Female)" },
    team: { ar: "خدمة العملاء", en: "Customer Service" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنة فأكثر", en: "1+ years" },
    icon: "Headset",
    description: {
      ar: "الرد على عملاء الشركة وعملاء عملائنا عبر واتساب والهاتف والبريد، ومتابعة طلباتهم حتى تُحل.",
      en: "Answer our clients and our clients' customers on WhatsApp, phone and e-mail, and follow their requests until resolved."
    },
    about: {
      ar: "نبحث عن موظفات خدمة عملاء يملكن أسلوباً لطيفاً وصبراً وقدرة على الشرح. ستردين على استفسارات العملاء، وتسجلين طلباتهم في نظامنا، وتتابعينها مع الفريق حتى تُحل، وتتأكدين أن العميل راضٍ. بعض العمل يكون لصالح عملائنا: إدارة محادثات واتساب لمتاجرهم والرد على زبائنهم.",
      en: "We're hiring customer service representatives with a kind manner, patience and the ability to explain. You'll answer client questions, log their requests in our system, follow them with the team until resolved and make sure the client is satisfied. Part of the work is for our clients: handling WhatsApp chats for their stores and answering their customers."
    },
    responsibilities: [
      { ar: "الرد على استفسارات العملاء عبر واتساب والهاتف والبريد باحترافية وسرعة", en: "Answer client questions on WhatsApp, phone and e-mail professionally and quickly" },
      { ar: "تسجيل الطلبات والشكاوى في نظام التذاكر ومتابعتها حتى الحل", en: "Log requests and complaints in the ticketing system and follow them to resolution" },
      { ar: "إدارة محادثات واتساب لمتاجر عملائنا والرد على زبائنهم", en: "Handle WhatsApp chats for our clients' stores and answer their customers" },
      { ar: "تحويل العملاء المهتمين بخدمات جديدة لفريق المبيعات", en: "Pass customers interested in new services to the sales team" },
      { ar: "متابعة رضا العملاء بعد حل الطلب", en: "Check client satisfaction after a request is resolved" },
      { ar: "اقتراح تحسينات للردود الجاهزة والأسئلة الشائعة", en: "Suggest improvements to saved replies and FAQs" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنة في خدمة العملاء أو مركز اتصال", en: "At least 1 year in customer service or a call centre" },
      { ar: "مهارات تواصل ممتازة بالعربية كتابة ومحادثة", en: "Excellent written and spoken Arabic" },
      { ar: "صبر وأسلوب لطيف وقدرة على التعامل مع العملاء الغاضبين", en: "Patience, a kind manner and the ability to handle upset customers" },
      { ar: "سرعة في الكتابة واستخدام الحاسب والجوال", en: "Fast typing and comfortable with computers and phones" },
      { ar: "الالتزام بأوقات العمل والتنظيم في المتابعة", en: "Punctual and organised in follow-up" }
    ],
    niceToHave: [
      { ar: "الإنجليزية الجيدة", en: "Good English" },
      { ar: "خبرة سابقة في متجر إلكتروني أو شركة تقنية", en: "Previous experience in an online store or tech company" },
      { ar: "خبرة في أنظمة التذاكر أو CRM", en: "Experience with ticketing systems or a CRM" }
    ],
    skills: ["Customer Service", "WhatsApp Business", "Ticketing", "CRM", "Phone Support", "Arabic Writing", "Problem Solving"]
  },
  {
    slug: "social-media-manager",
    service: "digital-marketing",
    status: "open",
    title: { ar: "مسؤول/ة إدارة حسابات التواصل الاجتماعي", en: "Social Media Manager" },
    team: { ar: "التسويق الرقمي", en: "Digital Marketing" },
    type: { ar: "دوام كامل", en: "Full-time" },
    location: { ar: "السعودية / عن بُعد", en: "Saudi Arabia / Remote" },
    experience: { ar: "سنتان فأكثر", en: "2+ years" },
    icon: "Share2",
    description: {
      ar: "إدارة حسابات التواصل الاجتماعي لعملائنا ولشركتنا: خطة المحتوى، النشر، التفاعل، والتقارير الشهرية.",
      en: "Run social media accounts for our clients and our company: content plans, publishing, engagement and monthly reports."
    },
    about: {
      ar: "ستدير حسابات عملائنا على إنستغرام وتيك توك وسناب شات وإكس ولينكدإن: تضع خطة المحتوى الشهرية، وتنسّق مع المصممين وكتّاب المحتوى، وتنشر في الوقت المناسب، وتتفاعل مع المتابعين، وتقيس النتائج وتكتب تقريراً واضحاً للعميل. ستدير أيضاً حسابات DMS Tech نفسها.",
      en: "You'll run our clients' accounts on Instagram, TikTok, Snapchat, X and LinkedIn: set the monthly content plan, work with designers and writers, publish at the right time, engage with followers, measure results and write a clear report for the client. You'll also run DMS Tech's own accounts."
    },
    responsibilities: [
      { ar: "إعداد خطة محتوى شهرية لكل عميل حسب أهدافه وجمهوره", en: "Prepare a monthly content plan for each client based on goals and audience" },
      { ar: "جدولة ونشر المحتوى على المنصات المختلفة", en: "Schedule and publish content across platforms" },
      { ar: "الرد على التعليقات والرسائل وإدارة التفاعل مع المتابعين", en: "Reply to comments and messages and manage follower engagement" },
      { ar: "التنسيق مع المصممين وكتّاب المحتوى وصنّاع الفيديو", en: "Work with designers, content writers and video makers" },
      { ar: "متابعة الترندات والمناسبات السعودية واستثمارها في المحتوى", en: "Follow trends and Saudi occasions and use them in content" },
      { ar: "قياس النتائج وإعداد تقارير شهرية واضحة للعملاء", en: "Measure results and prepare clear monthly client reports" },
      { ar: "التنسيق مع فريق الإعلانات في الحملات الممولة", en: "Coordinate with the ads team on paid campaigns" }
    ],
    requirements: [
      { ar: "خبرة لا تقل عن سنتين في إدارة حسابات التواصل الاجتماعي لعلامات تجارية", en: "At least 2 years managing social media accounts for brands" },
      { ar: "معرفة عميقة بإنستغرام وتيك توك وسناب شات وإكس في السوق السعودي", en: "Deep knowledge of Instagram, TikTok, Snapchat and X in the Saudi market" },
      { ar: "كتابة عربية جذابة وبلهجة تناسب الجمهور السعودي", en: "Engaging Arabic writing in a tone that suits Saudi audiences" },
      { ar: "خبرة في أدوات الجدولة والتحليلات", en: "Experience with scheduling and analytics tools" },
      { ar: "معرض أعمال بحسابات أدرتها ونتائجها", en: "A portfolio of accounts you managed and their results" }
    ],
    niceToHave: [
      { ar: "خبرة في تصوير ومونتاج فيديوهات قصيرة (ريلز / تيك توك)", en: "Shooting and editing short videos (Reels / TikTok)" },
      { ar: "خبرة في إدارة الإعلانات الممولة على ميتا وتيك توك وسناب", en: "Running paid ads on Meta, TikTok and Snap" },
      { ar: "أساسيات التصميم بـ Canva أو Photoshop", en: "Design basics in Canva or Photoshop" }
    ],
    skills: ["Instagram", "TikTok", "Snapchat", "X", "LinkedIn", "Content Planning", "Meta Business Suite", "Analytics", "Canva", "Copywriting"]
  }
];
