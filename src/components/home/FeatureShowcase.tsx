"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Icon, type IconName } from "@/components/ui/Icon";

type Feature = { icon: IconName; title: string; text: string };

const screens = {
  ar: {
    app: "DMS · مساحة العمل",
    live: "مباشر",
    nav: [
      { icon: "Inbox", label: "الوارد الموحّد" },
      { icon: "Users", label: "مهام الفريق" },
      { icon: "Workflow", label: "الأتمتة" }
    ],
    navMore: [
      { icon: "ChartColumn", label: "التقارير" },
      { icon: "Settings", label: "الإعدادات" }
    ],
    inbox: {
      title: "الوارد الموحّد",
      badge: "24 جديدة",
      channels: [
        { icon: "MessageSquareMore", label: "واتساب" },
        { icon: "Globe", label: "الموقع" },
        { icon: "ShoppingBag", label: "المتجر" },
        { icon: "Mail", label: "البريد" }
      ],
      rows: [
        { name: "أحمد العتيبي", text: "أبغى عرض سعر للباقة الاحترافية", channel: "واتساب", time: "الآن", unread: true },
        { name: "سارة القحطاني", text: "متى يوصل الطلب رقم 1042؟", channel: "المتجر", time: "5 د", unread: true },
        { name: "مؤسسة النخبة", text: "تم استلام العقد، شكراً لكم", channel: "البريد", time: "1 س", unread: false }
      ]
    },
    team: {
      title: "مهام الفريق",
      rows: [
        { task: "متابعة عرض السعر", team: "المبيعات", who: "ن", due: "اليوم", done: true },
        { task: "الرد على تذكرة #214", team: "الدعم", who: "ر", due: "خلال ساعتين", done: false },
        { task: "اعتماد فاتورة المورد", team: "الإدارة", who: "م", due: "غداً", done: false }
      ],
      progress: "إنجاز الأسبوع",
      percent: 68
    },
    flow: {
      title: "طلب جديد ← العملاء",
      status: "مفعّل",
      steps: [
        { icon: "Zap", label: "رسالة جديدة على واتساب", hint: "بداية المسار" },
        { icon: "Filter", label: "تصنيف الطلب تلقائياً", hint: "حسب نوع الخدمة" },
        { icon: "Users", label: "إضافة العميل وتحويله", hint: "لفريق المبيعات" },
        { icon: "Send", label: "رد فوري للعميل", hint: "خلال ثوانٍ" }
      ],
      runs: "1,284 تنفيذ هذا الشهر"
    }
  },
  en: {
    app: "DMS · Workspace",
    live: "Live",
    nav: [
      { icon: "Inbox", label: "Unified inbox" },
      { icon: "Users", label: "Team tasks" },
      { icon: "Workflow", label: "Automation" }
    ],
    navMore: [
      { icon: "ChartColumn", label: "Reports" },
      { icon: "Settings", label: "Settings" }
    ],
    inbox: {
      title: "Unified inbox",
      badge: "24 new",
      channels: [
        { icon: "MessageSquareMore", label: "WhatsApp" },
        { icon: "Globe", label: "Website" },
        { icon: "ShoppingBag", label: "Store" },
        { icon: "Mail", label: "Email" }
      ],
      rows: [
        { name: "Ahmed Alotaibi", text: "I'd like a quote for the Pro plan", channel: "WhatsApp", time: "now", unread: true },
        { name: "Sara Alqahtani", text: "When will order #1042 arrive?", channel: "Store", time: "5m", unread: true },
        { name: "Elite Est.", text: "Contract received, thank you", channel: "Email", time: "1h", unread: false }
      ]
    },
    team: {
      title: "Team tasks",
      rows: [
        { task: "Follow up the quote", team: "Sales", who: "N", due: "Today", done: true },
        { task: "Reply to ticket #214", team: "Support", who: "R", due: "In 2h", done: false },
        { task: "Approve supplier invoice", team: "Admin", who: "M", due: "Tomorrow", done: false }
      ],
      progress: "Weekly progress",
      percent: 68
    },
    flow: {
      title: "New request → Customers",
      status: "Active",
      steps: [
        { icon: "Zap", label: "New WhatsApp message", hint: "Trigger" },
        { icon: "Filter", label: "Classify the request", hint: "By service type" },
        { icon: "Users", label: "Add & assign the customer", hint: "To the sales team" },
        { icon: "Send", label: "Instant reply", hint: "Within seconds" }
      ],
      runs: "1,284 runs this month"
    }
  }
} as const;

/** Rows rise in with a transform-only animation: if motion is paused or reduced they are simply shown, never left blank. */
const rise = (on: boolean, k: number) =>
  on ? { className: "motion-safe:animate-[riseIn_.5s_ease_both]", style: { animationDelay: `${0.15 + k * 0.12}s` } } : { className: "", style: undefined };

/** "Next level" block: selectable feature list + a product window that shows each feature at work */
export default function FeatureShowcase({ features }: { features: Feature[] }) {
  const locale = useLocale() === "ar" ? "ar" : "en";
  const c = screens[locale];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % features.length), 6000);
    return () => clearInterval(id);
  }, [paused, features.length]);

  const panels = [
    // 1. one language: every channel lands in a single inbox
    (on: boolean) => (
      <>
        <PanelHead icon="Inbox" title={c.inbox.title}>
          <span className="rounded-full bg-iris px-2 py-0.5 text-[11px] font-semibold text-white">{c.inbox.badge}</span>
        </PanelHead>
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {c.inbox.channels.map((ch) => (
            <span key={ch.label} className="flex items-center gap-1 rounded-full border border-mist bg-white px-2 py-0.5 text-[11px] text-iron">
              <Icon name={ch.icon} size={11} className="text-iris" />
              {ch.label}
            </span>
          ))}
        </div>
        <ul className="grid gap-2 px-4 pb-4">
          {c.inbox.rows.map((r, k) => {
            const a = rise(on, k);
            return (
              <li key={r.name} className={`flex items-center gap-3 rounded-xl border border-mist bg-white px-3 py-2.5 ${a.className}`} style={a.style}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lilac text-[12px] font-bold text-iris">{r.name.charAt(0)}</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{r.name}</span>
                    <span className="shrink-0 rounded bg-cloud px-1.5 text-[10.5px] text-iron">{r.channel}</span>
                  </span>
                  <span className="truncate text-[12px] text-iron">{r.text}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1 text-[10.5px] text-graphite">
                  {r.time}
                  {r.unread && <span className="size-2 rounded-full bg-iris" />}
                </span>
              </li>
            );
          })}
        </ul>
      </>
    ),
    // 2. effortless collaboration: shared tasks with owners and progress
    (on: boolean) => (
      <>
        <PanelHead icon="Users" title={c.team.title}>
          <span className="flex -space-x-1.5 rtl:space-x-reverse">
            {c.team.rows.map((r) => (
              <span key={r.who} className="grid size-6 place-items-center rounded-full border-2 border-cloud bg-iris text-[10px] font-bold text-white">
                {r.who}
              </span>
            ))}
          </span>
        </PanelHead>
        <ul className="grid gap-2 px-4 pb-3">
          {c.team.rows.map((r, k) => {
            const a = rise(on, k);
            return (
              <li key={r.task} className={`flex items-center gap-3 rounded-xl border border-mist bg-white px-3 py-2.5 ${a.className}`} style={a.style}>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${r.done ? "border-iris bg-iris text-white" : "border-line"}`}>
                  {r.done && <Icon name="Check" size={12} strokeWidth={2.5} />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={`truncate font-medium ${r.done ? "text-graphite line-through" : "text-ink"}`}>{r.task}</span>
                  <span className="flex items-center gap-1 text-[11px] text-iron">
                    <Icon name="Clock" size={11} />
                    {r.due}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-lilac px-2 py-0.5 text-[10.5px] font-medium text-iris">{r.team}</span>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{r.who}</span>
              </li>
            );
          })}
        </ul>
        <div className="mx-4 mb-4 grid gap-1.5 rounded-xl border border-mist bg-white px-3 py-2.5">
          <span className="flex justify-between text-[11.5px]">
            <span className="text-iron">{c.team.progress}</span>
            <span className="font-semibold text-ink" dir="ltr">{c.team.percent}%</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-mist">
            <span
              className={`block h-full origin-left rounded-full bg-iris rtl:origin-right ${on ? "motion-safe:animate-[progress_1.2s_ease_both]" : ""}`}
              style={{ width: `${c.team.percent}%` }}
            />
          </span>
        </div>
      </>
    ),
    // 3. a custom workflow: the steps run on their own
    (on: boolean) => (
      <>
        <PanelHead icon="Workflow" title={c.flow.title}>
          <span className="flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-fern">
            <span className="size-1.5 rounded-full bg-fern" />
            {c.flow.status}
          </span>
        </PanelHead>
        <ol className="relative grid gap-2 px-4 pb-3">
          <span className="absolute inset-y-4 start-[34px] w-px bg-line" aria-hidden />
          {c.flow.steps.map((s, k) => {
            const a = rise(on, k);
            return (
              <li key={s.label} className={`relative flex items-center gap-3 rounded-xl border border-mist bg-white px-3 py-2 ${a.className}`} style={a.style}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${k === 0 ? "bg-iris text-white" : "bg-lilac text-iris"}`}>
                  <Icon name={s.icon} size={14} />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium text-ink">{s.label}</span>
                  <span className="truncate text-[11px] text-iron">{s.hint}</span>
                </span>
                <Icon name="CircleCheck" size={15} className="shrink-0 text-iris" />
              </li>
            );
          })}
        </ol>
        <p className="mx-4 mb-4 flex items-center gap-1.5 text-[11.5px] text-iron">
          <Icon name="TrendingUp" size={13} className="text-iris" />
          {c.flow.runs}
        </p>
      </>
    )
  ];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ul className="grid gap-2">
        {features.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.title}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={on}
                className={`grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl border p-4 text-start transition-colors duration-300 ${
                  on ? "border-mist bg-white shadow-card" : "border-transparent hover:bg-cloud"
                }`}
              >
                <span className={`row-span-2 grid size-10 place-items-center rounded-xl transition-colors duration-300 ${on ? "bg-iris text-white" : "bg-lilac text-iris"}`}>
                  <Icon name={f.icon} size={18} />
                </span>
                <span className="text-base font-semibold text-ink">{f.title}</span>
                <span className="text-[14.5px] leading-relaxed text-iron">{f.text}</span>
                {on && (
                  <span className="col-start-2 mt-2 block h-0.5 overflow-hidden rounded-full bg-mist">
                    <span
                      key={`${active}-${paused}`}
                      className={`block h-full origin-left bg-iris rtl:origin-right ${paused ? "" : "animate-[progress_6s_linear_both]"}`}
                    />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="relative" aria-hidden>
        <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-lilac via-white to-lilac/40 blur-2xl" />
        <div className="overflow-hidden rounded-card border border-mist bg-white shadow-lg">
          {/* window bar */}
          <div className="flex items-center gap-3 border-b border-mist px-4 py-2.5">
            <span className="flex gap-1.5" dir="ltr">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-2.5 rounded-full bg-line" />
              ))}
            </span>
            <span className="flex-1 text-center text-[12px] font-medium text-iron">{c.app}</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-iris">
              <span className="size-1.5 rounded-full bg-iris animate-[softPulse_2.4s_ease-in-out_infinite]" />
              {c.live}
            </span>
          </div>

          <div className="grid text-[13px] sm:grid-cols-[150px_1fr]">
            <aside className="hidden content-start gap-1 border-e border-mist p-3 sm:grid">
              {c.nav.map((n, i) => (
                <span
                  key={n.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-300 ${i === active ? "bg-lilac font-semibold text-iris" : "text-iron"}`}
                >
                  <Icon name={n.icon} size={14} />
                  {n.label}
                </span>
              ))}
              <span className="my-2 h-px bg-mist" />
              {c.navMore.map((n) => (
                <span key={n.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-graphite">
                  <Icon name={n.icon} size={14} />
                  {n.label}
                </span>
              ))}
            </aside>

            {/* every panel shares one grid cell and only the active one is visible: the window keeps the height of the
                tallest panel, so the auto-rotation never resizes the section (no page jump on narrow screens) */}
            <div className="grid bg-cloud">
              {panels.map((panel, i) => {
                const on = i === active;
                return (
                  <div key={on ? `on-${active}` : `off-${i}`} className={`col-start-1 row-start-1 ${on ? "motion-safe:animate-[fadeIn_.35s_ease]" : "invisible"}`}>
                    {panel(on)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHead({ icon, title, children }: { icon: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
        <Icon name={icon} size={15} className="shrink-0 text-iris" />
        <span className="truncate">{title}</span>
      </span>
      {children}
    </div>
  );
}
