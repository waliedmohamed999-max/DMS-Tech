import type { Post } from "./types";

/**
 * Starter articles (the job openings live in careers.ts). Replace/extend them from the dashboard once the
 * `posts` and `jobs` tables are live (see supabase/migrations).
 */
export const posts: Post[] = [
  {
    slug: "whatsapp-sales-channel",
    category: { ar: "أتمتة واتساب", en: "WhatsApp Automation" },
    title: { ar: "كيف تحوّل واتساب إلى قناة مبيعات تعمل على مدار الساعة", en: "How to turn WhatsApp into a 24/7 sales channel" },
    excerpt: {
      ar: "خطوات عملية لتأهيل العملاء ومتابعتهم تلقائياً دون أن تفقد أي فرصة.",
      en: "Practical steps to qualify and follow up with leads automatically without losing a single opportunity."
    },
    image: "/images/photos/svc-whatsapp.jpg",
    date: "2026-09-20",
    readMinutes: 4,
    body: [
      {
        ar: "أغلب عملائك يفضّلون التواصل عبر واتساب، لكن الرد اليدوي على كل رسالة يستهلك وقت فريقك ويؤخر الاستجابة — وكل دقيقة تأخير تعني فرصة أقل لإتمام البيع.",
        en: "Most of your customers prefer WhatsApp, but answering every message manually drains your team's time and slows responses — and every minute of delay lowers your chance to close."
      },
      {
        ar: "الخطوة الأولى هي تأهيل العملاء تلقائياً: أسئلة قصيرة تحدد احتياج العميل وميزانيته، ثم توجيهه للقسم أو الموظف المناسب.",
        en: "Step one is automatic qualification: a few short questions that identify the customer's need and budget, then route them to the right team or person."
      },
      {
        ar: "الخطوة الثانية هي المتابعة التلقائية: تذكيرات بالمواعيد، ورسائل بعد إرسال عرض السعر، وتحديثات حالة الطلب — كلها تُرسل في وقتها دون تدخل يدوي.",
        en: "Step two is automated follow-up: appointment reminders, messages after a quote is sent and order status updates — all delivered on time without manual work."
      },
      {
        ar: "وأخيراً، اربط المحادثات بنظام CRM الخاص بك حتى يرى فريق المبيعات تاريخ كل عميل في مكان واحد، وتقيس الإدارة أداء القناة بالأرقام.",
        en: "Finally, connect conversations to your CRM so sales sees every customer's history in one place and management can measure the channel with real numbers."
      }
    ]
  },
  {
    slug: "zid-salla-shopify",
    category: { ar: "التجارة الإلكترونية", en: "E-Commerce" },
    title: { ar: "زد أم سلة أم شوبيفاي؟ دليلك لاختيار منصة متجرك", en: "Zid, Salla or Shopify? Choosing the right store platform" },
    excerpt: {
      ar: "مقارنة مبسطة تساعدك على اختيار المنصة الأنسب لحجم ونوع تجارتك.",
      en: "A simple comparison to help you choose the platform that fits your business."
    },
    image: "/images/photos/blog-payments.jpg",
    date: "2026-09-05",
    readMinutes: 5,
    body: [
      {
        ar: "اختيار المنصة المناسبة قرار يؤثر على سرعة إطلاق متجرك وتكاليف تشغيله وقدرته على التوسع لاحقاً.",
        en: "Choosing the right platform affects how fast you launch, what it costs to run and how well you can scale later."
      },
      {
        ar: "زد وسلة منصتان سعوديتان تدعمان العربية ووسائل الدفع والشحن المحلية بشكل ممتاز، وتناسبان أغلب المتاجر التي تستهدف السوق السعودي والخليجي.",
        en: "Zid and Salla are Saudi platforms with excellent Arabic, local payment and shipping support — a great fit for most stores targeting Saudi and GCC customers."
      },
      {
        ar: "شوبيفاي خيار قوي للعلامات التي تستهدف أسواقاً عالمية أو تحتاج تخصيصاً متقدماً وتطبيقات كثيرة.",
        en: "Shopify is a strong choice for brands selling internationally or needing advanced customization and a large app ecosystem."
      },
      {
        ar: "في DMS Tech نساعدك على الاختيار بناءً على منتجاتك وجمهورك وخطط نموك، ثم نطلق المتجر كاملاً: الثيم، الدفع، الشحن، والكتالوج.",
        en: "At DMS Tech we help you choose based on your products, audience and growth plans — then launch the full store: theme, payments, shipping and catalog."
      }
    ]
  },
  {
    slug: "ai-automation-processes",
    category: { ar: "الذكاء الاصطناعي", en: "AI" },
    title: { ar: "5 عمليات في شركتك يمكن أتمتتها بالذكاء الاصطناعي اليوم", en: "5 processes in your company you can automate with AI today" },
    excerpt: {
      ar: "من خدمة العملاء إلى التقارير — أين تبدأ رحلة الأتمتة لتحقيق أسرع عائد.",
      en: "From customer service to reporting — where to start automating for the fastest return."
    },
    image: "/images/photos/blog-ai.jpg",
    date: "2026-08-22",
    readMinutes: 6,
    body: [
      {
        ar: "الأتمتة لا تعني استبدال فريقك، بل تحريره من المهام المتكررة ليركز على ما يصنع الفرق.",
        en: "Automation isn't about replacing your team — it frees them from repetitive work so they can focus on what matters."
      },
      {
        ar: "1) الرد على الأسئلة المتكررة للعملاء. 2) تأهيل العملاء المحتملين وتوزيعهم. 3) الموافقات الداخلية مثل الإجازات والمشتريات.",
        en: "1) Answering frequent customer questions. 2) Qualifying and assigning leads. 3) Internal approvals such as leave and purchases."
      },
      {
        ar: "4) إعداد التقارير الدورية من بيانات المبيعات والعمليات. 5) البحث في مستندات الشركة وسياساتها للإجابة الفورية.",
        en: "4) Building recurring reports from sales and operations data. 5) Searching company documents and policies for instant answers."
      },
      {
        ar: "ابدأ بعملية واحدة واضحة وقابلة للقياس، ثم توسّع تدريجياً — وهذا بالضبط ما نبنيه في منصة NOVA AI.",
        en: "Start with one clear, measurable process and expand gradually — exactly what we build with NOVA AI."
      }
    ]
  }
];

