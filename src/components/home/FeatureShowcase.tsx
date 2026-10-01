"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Icon, type IconName } from "@/components/ui/Icon";

type Feature = { icon: IconName; title: string; text: string };

const screens = {
  ar: {
    nav: ["المصادر", "الوجهات", "الإعدادات"],
    group: "البيانات",
    items: ["المحادثات", "المهام", "سير العمل", "العملاء", "التقارير"],
    mode: "الوضع:",
    modeValue: "افتراضي",
    tables: [
      { title: "المحادثات", tag: "conversations", cols: ["الاسم", "القناة", "الحالة"], rows: [["أحمد العتيبي", "واتساب", "جديد"], ["سارة القحطاني", "الموقع", "متابعة"], ["مؤسسة النخبة", "إنستغرام", "مغلق"]] },
      { title: "المهام", tag: "tasks", cols: ["المهمة", "الفريق", "الموعد"], rows: [["متابعة عرض سعر", "المبيعات", "اليوم"], ["الرد على تذكرة #214", "الدعم", "خلال ساعتين"], ["اعتماد فاتورة", "الإدارة", "غداً"]] },
      { title: "سير العمل", tag: "workflows", cols: ["المسار", "الحالة", "التنفيذ"], rows: [["طلب جديد ← CRM", "مفعّل", "1,284"], ["تذكير بالدفع", "مفعّل", "312"], ["تقرير أسبوعي", "مجدول", "الأحد"]] }
    ]
  },
  en: {
    nav: ["Sources", "Destinations", "Settings"],
    group: "Data",
    items: ["Conversations", "Tasks", "Workflows", "Customers", "Reports"],
    mode: "Mode:",
    modeValue: "default",
    tables: [
      { title: "Conversations", tag: "conversations", cols: ["Name", "Channel", "Status"], rows: [["Ahmed Alotaibi", "WhatsApp", "New"], ["Sara Alqahtani", "Website", "Follow-up"], ["Elite Est.", "Instagram", "Closed"]] },
      { title: "Tasks", tag: "tasks", cols: ["Task", "Team", "Due"], rows: [["Follow up quote", "Sales", "Today"], ["Reply to ticket #214", "Support", "In 2h"], ["Approve invoice", "Admin", "Tomorrow"]] },
      { title: "Workflows", tag: "workflows", cols: ["Flow", "Status", "Runs"], rows: [["New lead → CRM", "Active", "1,284"], ["Payment reminder", "Active", "312"], ["Weekly report", "Scheduled", "Sun"]] }
    ]
  }
};

/** Specify "next level" block: selectable feature list + live product window */
export default function FeatureShowcase({ features }: { features: Feature[] }) {
  const locale = useLocale() === "ar" ? "ar" : "en";
  const c = screens[locale];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % features.length), 5000);
    return () => clearInterval(id);
  }, [paused, features.length]);

  const table = c.tables[active];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ul className="divide-y divide-mist">
        {features.map((f, i) => (
          <li key={f.title}>
            <button type="button" onClick={() => setActive(i)} className="grid w-full gap-1.5 py-5 text-start first:pt-0">
              <span className={`flex items-center gap-2 text-base font-semibold transition ${i === active ? "text-iris" : "text-ink"}`}>
                <Icon name={f.icon} size={16} className={i === active ? "text-iris" : "text-iron"} />
                {f.title}
              </span>
              <span className="text-[15px] leading-relaxed text-iron">{f.text}</span>
              <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-mist">
                {i === active && (
                  <span
                    key={`${active}-${paused}`}
                    className={`block h-full origin-left bg-iris rtl:origin-right ${paused ? "" : "animate-[progress_5s_linear_both]"}`}
                  />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="relative overflow-hidden rounded-card border border-mist bg-white shadow-lg" aria-hidden>
        {/* animated cursor that "clicks" the active data item, like Specify's product video */}
        <span
          key={`cursor-${active}`}
          className="pointer-events-none absolute z-10 animate-[cursorMove_1.4s_cubic-bezier(.4,0,.2,1)_both] ltr:left-[110px] rtl:right-[110px]"
          style={{ top: `${196 + c.items.indexOf(table.title) * 31}px` }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow rtl:-scale-x-100">
            <path d="M1 1 L1 17 L5.5 13 L8.5 20 L11.5 18.5 L8.5 12 L14.5 12 Z" fill="#1a1d1e" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <span className="absolute -start-1.5 -top-1.5 size-7 animate-[clickRing_1.4s_ease-out_both] rounded-full border-2 border-iris" />
        </span>
        <div className="grid min-h-[340px] grid-cols-[150px_1fr] text-[13px] sm:grid-cols-[170px_1fr]">
          <aside className="grid content-start gap-0.5 border-e border-mist p-3">
            {c.nav.map((n) => (
              <span key={n} className="rounded-md px-2 py-1.5 font-medium text-ink">
                {n}
              </span>
            ))}
            <span className="mt-4 px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-graphite">{c.group}</span>
            {c.items.map((n, i) => {
              const on = n === table.title;
              return (
                <span key={n} className={`flex items-center justify-between rounded-md px-2 py-1.5 transition ${on ? "bg-cloud font-medium text-ink" : "text-iron"}`}>
                  {n}
                  {i < 2 && <Icon name={locale === "ar" ? "ChevronLeft" : "ChevronRight"} size={12} className="text-graphite" />}
                </span>
              );
            })}
          </aside>
          <div className="grid content-start bg-cloud">
            <div className="flex items-center gap-2 border-b border-mist bg-white px-4 py-3">
              <span className="text-iron">{c.mode}</span>
              <span className="flex w-36 items-center justify-between rounded-md border border-line px-2.5 py-1 text-ink">
                {c.modeValue} <Icon name="ChevronDown" size={13} className="text-graphite" />
              </span>
            </div>
            <div key={active} className="m-3 overflow-hidden rounded-lg border border-mist bg-white motion-safe:animate-[fadeIn_.35s_ease]">
              <div className="flex items-center gap-2 border-b border-mist px-3 py-2.5">
                <Icon name="LayoutDashboard" size={14} className="text-iron" />
                <span className="font-medium text-ink">{table.title}</span>
                <span className="rounded bg-cloud px-1.5 py-0.5 font-mono text-[11px] text-iron">{table.tag}</span>
              </div>
              <table className="w-full text-start">
                <thead>
                  <tr className="border-b border-mist text-[10.5px] uppercase tracking-wider text-graphite">
                    {table.cols.map((col) => (
                      <th key={col} className="px-3 py-2 text-start font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r, ri) => (
                    <tr
                      key={r[0]}
                      className="border-b border-mist last:border-0 motion-safe:animate-[fadeIn_.4s_ease_both]"
                      style={{ animationDelay: `${1.1 + ri * 0.18}s` }}
                    >
                      {r.map((cell, k) => (
                        <td key={k} className={`px-3 py-2.5 ${k === 0 ? "font-medium text-ink" : "text-iron"}`}>
                          {k === 2 ? <span className="rounded-full bg-lilac px-2 py-0.5 text-[11.5px] font-medium text-iris">{cell}</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
