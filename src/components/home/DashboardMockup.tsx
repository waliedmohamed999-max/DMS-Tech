import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

const copy = {
  ar: {
    nav: ["لوحة التحكم", "المحادثات", "سير العمل", "العملاء", "التقارير", "الإعدادات"],
    title: "نظرة عامة على الأداء",
    range: "آخر 30 يوماً",
    kpis: [
      ["المحادثات", "12,480", "▲ 36%"],
      ["عملاء محتملون", "1,248", "▲ 28%"],
      ["وقت الاستجابة", "4 ث", "▼ 72%"]
    ],
    flow: ["رسالة جديدة", "تصنيف ذكي", "مزامنة CRM"],
    autoTitle: "تمت الأتمتة",
    autoText: "متابعة تلقائية لـ 320 عميل",
    chatText: "أهلاً! شكراً لتواصلك معنا، كيف نقدر نساعدك اليوم؟"
  },
  en: {
    nav: ["Dashboard", "Conversations", "Workflows", "Customers", "Reports", "Settings"],
    title: "Performance overview",
    range: "Last 30 days",
    kpis: [
      ["Conversations", "12,480", "▲ 36%"],
      ["Leads", "1,248", "▲ 28%"],
      ["Response time", "4s", "▼ 72%"]
    ],
    flow: ["New message", "Smart triage", "CRM sync"],
    autoTitle: "Automated",
    autoText: "Follow-ups sent to 320 leads",
    chatText: "Hi! Thanks for reaching out to DMS Tech. How can we help you today?"
  }
};

const navIcons: IconName[] = ["LayoutDashboard", "MessagesSquare", "Workflow", "Users", "ChartColumn", "Settings"];
const flowIcons: IconName[] = ["MessagesSquare", "Sparkles", "DatabaseZap"];

/** Illustrative product UI (NOVA AI) — Wrike heroes use the product itself as the visual. */
export default function DashboardMockup({ locale }: { locale: "ar" | "en" }) {
  const c = copy[locale];
  return (
    <div className="relative text-ink" aria-hidden="true">
      <div className="overflow-hidden rounded-card border border-mist bg-white shadow-[rgba(0,0,0,0.25)_0px_25px_45px_-45px,0_40px_80px_-40px_rgba(0,0,0,.35)]">
        <div className="flex items-center gap-1.5 border-b border-[#ebedef] bg-cloud px-4 py-3" dir="ltr">
          <i className="size-2.5 rounded-full bg-line" />
          <i className="size-2.5 rounded-full bg-line" />
          <i className="size-2.5 rounded-full bg-line" />
          <span className="mx-auto rounded-full bg-white px-3.5 py-0.5 text-[11px] text-iron">app.dms1t.com / nova-ai</span>
        </div>
        <div className="grid min-h-[360px] sm:grid-cols-[150px_1fr]">
          <aside className="hidden content-start gap-1 bg-ink p-3 text-xs text-[#c4c6c8] sm:grid">
            <div className="mb-3 flex items-center gap-2 px-2 text-[13px] font-semibold text-white">
              <b className="badge-icon size-6 rounded-md text-xs">N</b> NOVA AI
            </div>
            {c.nav.map((n, i) => (
              <span key={n} className={`flex items-center gap-2 rounded-lg p-2 ${i === 0 ? "bg-iris/15 text-iris-light" : ""}`}>
                <Icon name={navIcons[i]} size={15} /> {n}
              </span>
            ))}
          </aside>
          <div className="grid content-start gap-3.5 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{c.title}</h4>
              <small className="rounded-full bg-cloud px-2.5 py-0.5 text-[11px] text-iron">{c.range}</small>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {c.kpis.map(([label, value, delta]) => (
                <div key={label} className="rounded-xl bg-cloud px-3 py-2.5">
                  <span className="block text-[10.5px] text-iron">{label}</span>
                  <strong className="block text-[17px] font-bold tabular-nums">{value}</strong>
                  <em className="text-[10.5px] font-semibold not-italic text-iris">{delta}</em>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-mist p-3">
              <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="block h-[120px] w-full">
                <defs>
                  <linearGradient id="mock-g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#624de3" stopOpacity=".35" />
                    <stop offset="1" stopColor="#624de3" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="#eef1f7">
                  <line x1="0" y1="30" x2="400" y2="30" />
                  <line x1="0" y1="60" x2="400" y2="60" />
                  <line x1="0" y1="90" x2="400" y2="90" />
                </g>
                <path d="M0 98 C40 92 60 80 90 82 S150 60 180 64 S240 40 270 44 S330 20 360 22 L400 14 L400 120 L0 120Z" fill="url(#mock-g)" />
                <path d="M0 98 C40 92 60 80 90 82 S150 60 180 64 S240 40 270 44 S330 20 360 22 L400 14" fill="none" stroke="#624de3" strokeWidth="2.5" />
                <path d="M0 108 C50 104 80 100 120 98 S200 90 240 86 S320 76 400 70" fill="none" stroke="#bfc7d9" strokeWidth="2" strokeDasharray="4 5" />
                <circle cx="360" cy="22" r="5" fill="#fff" stroke="#624de3" strokeWidth="2.5" />
              </svg>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {c.flow.map((f, i) => (
                <div key={f} className="flex items-center gap-1.5 rounded-lg border border-dashed border-mist p-2 text-[11px] text-iron">
                  <Icon name={flowIcons[i]} size={14} className="text-iris" /> {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -top-7 end-2 flex animate-bob items-center gap-3 rounded-2xl border border-mist bg-white px-4 py-3 shadow-lg sm:-end-7 [animation-delay:-3s]">
        <span className="badge-icon size-10">
          <Icon name="Workflow" size={18} />
        </span>
        <div>
          <strong className="block text-[13px]">{c.autoTitle}</strong>
          <span className="text-[11.5px] text-iron">{c.autoText}</span>
        </div>
      </div>
      <div className="absolute -bottom-10 start-2 flex max-w-[260px] animate-bob items-start gap-3 rounded-2xl border border-mist bg-white px-4 py-3 shadow-lg sm:-start-7">
        <span className="badge-icon size-10">
          <BrandIcon slug="whatsapp" size={18} />
        </span>
        <div>
          <strong className="block text-[13px]">DMS Tech</strong>
          <span className="text-[11.5px] leading-snug text-iron">{c.chatText}</span>
        </div>
      </div>
    </div>
  );
}
