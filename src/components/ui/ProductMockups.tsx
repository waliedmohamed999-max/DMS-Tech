import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";

/**
 * Coded product screens for the DMS Chat Bot and NOVA AI pages (no hooks — usable from server and client
 * components). Illustrative UI only: names and numbers are sample data inside a mock screen. Brand purple for the
 * interface; WhatsApp green is kept only for chat bubbles, as in the home service cards.
 */
export type MockupKey =
  | "cb-campaigns"
  | "cb-flow"
  | "cb-crm"
  | "cb-store"
  | "cb-official"
  | "nova-studio"
  | "nova-sales"
  | "nova-brain"
  | "nova-inbox";

type Lc = "ar" | "en";
const pick = (l: Lc, ar: string, en: string) => (l === "ar" ? ar : en);

/** App window chrome shared by every mockup. */
function Frame({ title, icon, badge, children, className = "" }: { title: string; icon: ReactNode; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-mist bg-white text-[13px] shadow-lg ${className}`}>
      <div className="flex items-center gap-3 border-b border-mist px-4 py-2.5">
        <span className="flex gap-1.5" dir="ltr">
          {[0, 1, 2].map((d) => (
            <span key={d} className="size-2.5 rounded-full bg-line" />
          ))}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-ink">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

const Tile = ({ icon, size = 14, strong = false }: { icon: IconName; size?: number; strong?: boolean }) => (
  <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${strong ? "bg-iris text-white" : "bg-lilac text-iris"}`}>
    <Icon name={icon} size={size} />
  </span>
);

const Status = ({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "brand" }) => (
  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone === "ok" ? "bg-mint text-fern" : "bg-lilac text-iris"}`}>
    <span className={`size-1.5 rounded-full ${tone === "ok" ? "bg-fern" : "bg-iris"}`} />
    {children}
  </span>
);

/* ───────────────────────── DMS Chat Bot ───────────────────────── */

/** Hero: the shared WhatsApp inbox — chat list, open conversation (bot → human hand-over), customer card. */
export function ChatbotHeroMockup({ locale: l }: { locale: Lc }) {
  const chats = [
    { n: pick(l, "أحمد العتيبي", "Ahmed Alotaibi"), m: pick(l, "أبغى أعرف الأسعار", "What are your prices?"), tag: pick(l, "طلب جديد", "New lead"), unread: 2, on: true },
    { n: pick(l, "سارة القحطاني", "Sara Alqahtani"), m: pick(l, "تم الدفع، شكراً", "Paid, thank you"), tag: pick(l, "عميل", "Customer"), unread: 0, on: false },
    { n: pick(l, "متجر الريحان", "Al Rayhan Store"), m: pick(l, "نسيت السلة 🙈", "Forgot my cart 🙈"), tag: pick(l, "سلة متروكة", "Abandoned cart"), unread: 1, on: false },
    { n: pick(l, "عيادة النخبة", "Elite Clinic"), m: pick(l, "تأكيد موعد الخميس", "Confirm Thursday"), tag: pick(l, "موعد", "Booking"), unread: 0, on: false }
  ];
  return (
    <Frame
      title="DMS Chat Bot"
      icon={<BrandIcon slug="whatsapp" size={16} colored />}
      badge={<Status>{pick(l, "متصل · واتساب الرسمي", "Connected · official API")}</Status>}
    >
      <div className="grid min-h-[360px] bg-cloud md:grid-cols-[190px_1fr_170px]">
        {/* chats */}
        <ul className="hidden content-start gap-1 border-e border-mist bg-white p-2 md:grid">
          <li className="mb-1 flex items-center gap-2 rounded-lg bg-cloud px-2 py-1.5 text-[12px] text-graphite">
            <Icon name="Search" size={13} /> {pick(l, "بحث في المحادثات", "Search chats")}
          </li>
          {chats.map((c) => (
            <li key={c.n} className={`grid gap-0.5 rounded-lg px-2 py-2 ${c.on ? "bg-lilac" : ""}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-ink">{c.n}</span>
                {c.unread > 0 && <span className="grid size-4 shrink-0 place-items-center rounded-full bg-iris text-[10px] font-bold text-white">{c.unread}</span>}
              </span>
              <span className="truncate text-[11.5px] text-iron">{c.m}</span>
              <span className="w-fit rounded bg-white px-1.5 text-[10px] font-medium text-iris">{c.tag}</span>
            </li>
          ))}
        </ul>

        {/* conversation */}
        <div className="grid content-between gap-3 p-4">
          <div className="grid gap-2.5">
            <span className="mx-auto rounded-full bg-white px-3 py-0.5 text-[11px] text-graphite shadow-card">{pick(l, "اليوم", "Today")}</span>
            <span className="w-fit max-w-[80%] rounded-2xl rounded-ss-sm bg-white px-3 py-2 text-ink shadow-card">{pick(l, "السلام عليكم، أبغى أعرف أسعار الباقات", "Hi, I'd like to know your plan prices")}</span>
            <div className="ms-auto grid max-w-[85%] gap-1.5">
              <span className="rounded-2xl rounded-se-sm bg-[#d9fdd3] px-3 py-2 text-ink shadow-card">
                <span className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-iris">
                  <Icon name="Bot" size={11} /> {pick(l, "رد آلي", "Auto-reply")}
                </span>
                {pick(l, "أهلاً أحمد 👋 اختر نوع نشاطك عشان أرسل لك الباقة المناسبة:", "Hi Ahmed 👋 Pick your business type and I'll send the right plan:")}
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {[pick(l, "متجر إلكتروني", "Online store"), pick(l, "عيادة", "Clinic"), pick(l, "التحدث لموظف", "Talk to an agent")].map((b) => (
                  <span key={b} className="rounded-full border border-iris/30 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-iris">
                    {b}
                  </span>
                ))}
              </span>
            </div>
            <span className="mx-auto flex items-center gap-1.5 rounded-full bg-lilac px-3 py-1 text-[11px] font-medium text-iris">
              <Icon name="Headset" size={12} /> {pick(l, "تم تحويل المحادثة إلى نورة — المبيعات", "Handed over to Noura — Sales")}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 text-graphite">
            <Icon name="Sparkles" size={14} className="text-iris" />
            <span className="flex-1 truncate text-[12px]">{pick(l, "اكتب رداً أو اختر رداً سريعاً…", "Type a reply or pick a quick reply…")}</span>
            <span className="grid size-7 place-items-center rounded-lg bg-iris text-white">
              <Icon name="Send" size={13} />
            </span>
          </div>
        </div>

        {/* customer */}
        <aside className="hidden content-start gap-3 border-s border-mist bg-white p-3 md:grid">
          <span className="grid justify-items-center gap-1 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-lilac text-base font-bold text-iris">{chats[0].n.charAt(0)}</span>
            <span className="font-semibold text-ink">{chats[0].n}</span>
            <span className="text-[11px] text-graphite" dir="ltr">+966 5• ••• ••12</span>
          </span>
          {[
            [pick(l, "المرحلة", "Stage"), pick(l, "مهتم", "Interested")],
            [pick(l, "المسؤول", "Owner"), pick(l, "نورة", "Noura")],
            [pick(l, "المصدر", "Source"), pick(l, "حملة رمضان", "Ramadan campaign")]
          ].map(([k, v]) => (
            <span key={k} className="flex items-center justify-between gap-2 border-b border-mist pb-2 text-[11.5px] last:border-0">
              <span className="text-graphite">{k}</span>
              <span className="font-semibold text-ink">{v}</span>
            </span>
          ))}
          <span className="rounded-lg bg-lilac/60 p-2 text-[11px] leading-relaxed text-ink">
            <span className="mb-0.5 flex items-center gap-1 font-semibold text-iris">
              <Icon name="Pencil" size={11} /> {pick(l, "ملاحظة داخلية", "Internal note")}
            </span>
            {pick(l, "مهتم بالباقة الاحترافية — أرسل العرض اليوم", "Interested in Pro — send the quote today")}
          </span>
        </aside>
      </div>
    </Frame>
  );
}

function CbCampaigns({ l }: { l: Lc }) {
  const stats = [
    [pick(l, "مُرسَل", "Sent"), "1,240"],
    [pick(l, "مُسلَّم", "Delivered"), "1,198"],
    [pick(l, "مقروء", "Read"), "1,032"],
    [pick(l, "مبيعات", "Sales"), "18,400"]
  ];
  return (
    <Frame title={pick(l, "حملة: استرداد السلة المتروكة", "Campaign: abandoned-cart recovery")} icon={<Tile icon="Megaphone" />} badge={<Status>{pick(l, "آلية", "Automated")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <div className="flex flex-wrap gap-1.5">
          {[pick(l, "سلة متروكة", "Abandoned cart"), pick(l, "آخر 24 ساعة", "Last 24h"), pick(l, "الرياض وجدة", "Riyadh & Jeddah")].map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-full border border-mist bg-white px-2.5 py-0.5 text-[11px] text-iron">
              <Icon name="Filter" size={11} className="text-iris" /> {c}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([k, v], i) => (
            <span key={k} className={`grid gap-0.5 rounded-xl border p-3 ${i === 3 ? "border-iris bg-iris text-white" : "border-mist bg-white"}`}>
              <span className={`text-[11px] ${i === 3 ? "text-white/80" : "text-graphite"}`}>
                {k}
                {i === 3 && " (SAR)"}
              </span>
              <span className="text-lg font-bold" dir="ltr">
                {v}
              </span>
            </span>
          ))}
        </div>
        <div className="grid gap-2 rounded-xl border border-mist bg-white p-3">
          {[
            [pick(l, "مُسلَّم", "Delivered"), 97],
            [pick(l, "مقروء", "Read"), 83],
            [pick(l, "نقر على الرابط", "Clicked"), 41],
            [pick(l, "أكمل الشراء", "Purchased"), 18]
          ].map(([k, v]) => (
            <span key={k} className="grid grid-cols-[88px_1fr_34px] items-center gap-2 text-[11.5px]">
              <span className="text-iron">{k}</span>
              <span className="h-2 overflow-hidden rounded-full bg-mist">
                <span className="block h-full rounded-full bg-gradient-to-r from-iris to-iris-soft rtl:bg-gradient-to-l" style={{ width: `${v}%` }} />
              </span>
              <span className="text-end font-semibold text-ink" dir="ltr">
                {v}%
              </span>
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function CbFlow({ l }: { l: Lc }) {
  const branches: [IconName, string][] = [
    ["Tag", pick(l, "الأسعار", "Prices")],
    ["Package", pick(l, "حالة الطلب", "Order status")],
    ["Headset", pick(l, "موظف", "Agent")]
  ];
  return (
    <Frame
      title={pick(l, "تدفق: الترحيب والفرز", "Flow: welcome & routing")}
      icon={<Tile icon="Workflow" />}
      badge={
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-iris px-2.5 py-1 text-[11px] font-semibold text-white">
          <Icon name="Play" size={11} /> {pick(l, "اختبار", "Test")}
        </span>
      }
    >
      <div className="grid justify-items-center gap-0 bg-cloud bg-[radial-gradient(#d9dbde_1px,transparent_1px)] p-5 [background-size:16px_16px]">
        <span className="flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 font-semibold text-ink shadow-card">
          <Tile icon="MessageSquareMore" strong /> {pick(l, "رسالة جديدة من العميل", "New customer message")}
        </span>
        <span className="h-5 w-px bg-line" />
        <span className="grid gap-1 rounded-xl border border-iris bg-white px-3 py-2 text-center shadow-card">
          <span className="text-[10.5px] font-semibold text-iris">{pick(l, "سؤال بأزرار", "Buttons question")}</span>
          <span className="font-semibold text-ink">{pick(l, "كيف نقدر نخدمك؟", "How can we help?")}</span>
        </span>
        <span className="h-4 w-px bg-line" />
        <span className="h-px w-2/3 bg-line" />
        <div className="grid w-full grid-cols-3 gap-2">
          {branches.map(([icon, t]) => (
            <span key={t} className="grid justify-items-center">
              <span className="h-4 w-px bg-line" />
              <span className="flex w-full flex-col items-center gap-1 rounded-xl border border-mist bg-white px-1 py-2 text-center text-[11.5px] font-medium text-ink shadow-card">
                <Tile icon={icon} size={12} />
                {t}
              </span>
            </span>
          ))}
        </div>
        <span className="mt-3 flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-[11px] font-semibold text-fern">
          <Icon name="CircleCheck" size={12} /> {pick(l, "تم الاختبار — جاهز للنشر", "Tested — ready to publish")}
        </span>
      </div>
    </Frame>
  );
}

function CbCrm({ l }: { l: Lc }) {
  const stages = [pick(l, "جديد", "New"), pick(l, "مهتم", "Interested"), pick(l, "عرض سعر", "Quote"), pick(l, "عميل", "Customer")];
  return (
    <Frame title={pick(l, "ملف العميل", "Customer profile")} icon={<Tile icon="Users" />} badge={<Status tone="brand">{pick(l, "مُسند لـ نورة", "Assigned to Noura")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <div className="flex items-center gap-3 rounded-xl border border-mist bg-white p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lilac text-base font-bold text-iris">{pick(l, "س", "S")}</span>
          <span className="grid min-w-0 flex-1">
            <span className="font-semibold text-ink">{pick(l, "سارة القحطاني", "Sara Alqahtani")}</span>
            <span className="text-[11.5px] text-graphite">{pick(l, "عميلة منذ مارس · 4 طلبات", "Customer since March · 4 orders")}</span>
          </span>
          <BrandIcon slug="whatsapp" size={18} colored />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {stages.map((s, i) => (
            <span key={s} className="grid gap-1 text-center text-[10.5px] font-medium">
              <span className={`h-1.5 rounded-full ${i <= 2 ? "bg-iris" : "bg-mist"}`} />
              <span className={i === 2 ? "text-iris" : "text-graphite"}>{s}</span>
            </span>
          ))}
        </div>
        <ul className="grid gap-1.5 rounded-xl border border-mist bg-white p-3 text-[12px]">
          {[
            ["Package", pick(l, "طلب #1042 — تم الشحن", "Order #1042 — shipped"), pick(l, "أمس", "Yesterday")],
            ["MessagesSquare", pick(l, "سألت عن الباقة السنوية", "Asked about the yearly plan"), pick(l, "اليوم", "Today")],
            ["Megaphone", pick(l, "فتحت حملة رمضان", "Opened the Ramadan campaign"), pick(l, "قبل 3 أيام", "3 days ago")]
          ].map(([icon, t, d]) => (
            <li key={t} className="flex items-center gap-2">
              <Icon name={icon as IconName} size={13} className="shrink-0 text-iris" />
              <span className="flex-1 truncate text-ink">{t}</span>
              <span className="shrink-0 text-[11px] text-graphite">{d}</span>
            </li>
          ))}
        </ul>
        <span className="rounded-xl border border-dashed border-iris/40 bg-white p-2.5 text-[11.5px] text-ink">
          <span className="font-semibold text-iris">{pick(l, "ملاحظة داخلية: ", "Internal note: ")}</span>
          {pick(l, "تفضّل التواصل مساءً", "Prefers evening contact")}
        </span>
      </div>
    </Frame>
  );
}

function CbStore({ l }: { l: Lc }) {
  return (
    <Frame title={pick(l, "تكامل المتاجر", "Store integrations")} icon={<Tile icon="ShoppingCart" />} badge={<Status>{pick(l, "مزامنة تلقائية", "Auto-sync")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {[pick(l, "زد", "Zid"), "DMS", pick(l, "سلة", "Salla")].map((s, i) =>
            i === 1 ? (
              <span key={s} className="grid size-12 place-items-center rounded-2xl bg-iris text-white shadow-[0_0_0_5px_#efecff]">
                <Icon name="RotateCcw" size={20} />
              </span>
            ) : (
              <span key={s} className="flex items-center justify-center gap-2 rounded-xl border border-mist bg-white py-3 font-bold text-ink">
                <Icon name="ShoppingBag" size={15} className="text-iris" /> {s}
                <Icon name="CircleCheck" size={14} className="text-fern" />
              </span>
            )
          )}
        </div>
        <ul className="grid gap-1.5">
          {[
            ["#1042", "349", pick(l, "تم الشحن", "Shipped"), pick(l, "أُرسل إشعار الشحن", "Shipping update sent")],
            ["#1043", "1,120", pick(l, "جديد", "New"), pick(l, "أُرسل تأكيد الطلب", "Order confirmation sent")],
            ["#1044", "215", pick(l, "سلة متروكة", "Abandoned"), pick(l, "تذكير بعد ساعة", "Reminder in 1h")]
          ].map(([id, amount, st, note]) => (
            <li key={id} className="flex items-center gap-3 rounded-xl border border-mist bg-white px-3 py-2">
              <span className="font-mono text-[12px] font-semibold text-ink" dir="ltr">
                {id}
              </span>
              <span className="text-[12px] text-iron" dir="ltr">
                SAR {amount}
              </span>
              <span className="rounded-full bg-lilac px-2 py-0.5 text-[10.5px] font-medium text-iris">{st}</span>
              <span className="ms-auto flex items-center gap-1 truncate text-[11px] text-graphite">
                <BrandIcon slug="whatsapp" size={12} colored /> {note}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

function CbOfficial({ l }: { l: Lc }) {
  return (
    <Frame title={pick(l, "قوالب الرسائل", "Message templates")} icon={<Tile icon="LayoutTemplate" />} badge={<Status>{pick(l, "معتمد من Meta", "Meta-approved")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4 sm:grid-cols-[1fr_1.1fr]">
        <ul className="grid content-start gap-1.5">
          {[
            ["order_update", pick(l, "خدمة", "Utility"), true],
            ["ramadan_offer", pick(l, "تسويق", "Marketing"), true],
            ["otp_login", pick(l, "مصادقة", "Auth"), false]
          ].map(([name, cat, on]) => (
            <li key={name as string} className={`grid gap-0.5 rounded-xl border px-3 py-2 ${on ? "border-mist bg-white" : "border-dashed border-line"}`}>
              <span className="font-mono text-[12px] font-semibold text-ink" dir="ltr">
                {name}
              </span>
              <span className="flex items-center justify-between text-[11px]">
                <span className="text-graphite">{cat}</span>
                <span className={on ? "flex items-center gap-1 font-semibold text-fern" : "text-graphite"}>
                  {on ? <Icon name="BadgeCheck" size={12} /> : null}
                  {on ? pick(l, "معتمد", "Approved") : pick(l, "قيد المراجعة", "In review")}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="grid content-start gap-2 rounded-xl bg-[#efe7dc] p-3">
          <span className="rounded-xl rounded-ss-sm bg-white p-2.5 text-[12px] leading-relaxed text-ink shadow-card">
            {pick(l, "مرحباً {{1}} 👋 طلبك رقم {{2}} في الطريق إليك وسيصلك خلال {{3}}.", "Hi {{1}} 👋 your order {{2}} is on its way and arrives within {{3}}.")}
            <span className="mt-2 grid border-t border-mist pt-1.5 text-center font-semibold text-[#027eb5]">{pick(l, "تتبّع الطلب", "Track order")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 sm:col-span-2">
          <span className="flex -space-x-1.5 rtl:space-x-reverse">
            {[pick(l, "ن", "N"), pick(l, "ر", "R"), pick(l, "م", "M")].map((a) => (
              <span key={a} className="grid size-6 place-items-center rounded-full border-2 border-white bg-iris text-[10px] font-bold text-white">
                {a}
              </span>
            ))}
          </span>
          <span className="text-[12px] text-ink">{pick(l, "3 موظفين يعملون على نفس رقم واتساب", "3 agents working on one WhatsApp number")}</span>
          <Icon name="ShieldCheck" size={15} className="ms-auto text-iris" />
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── NOVA AI ───────────────────────── */

function NovaStudio({ l }: { l: Lc }) {
  const days = l === "ar" ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس"] : ["Sun", "Mon", "Tue", "Wed", "Thu"];
  const posts: (null | { t: string; s: 0 | 1 | 2; icon: string })[] = [
    { t: pick(l, "عرض رمضان", "Ramadan offer"), s: 0, icon: "instagram" },
    null,
    { t: pick(l, "قبل وبعد", "Before & after"), s: 1, icon: "tiktok" },
    { t: pick(l, "نصيحة الأسبوع", "Tip of the week"), s: 2, icon: "linkedin" },
    { t: pick(l, "آراء العملاء", "Testimonials"), s: 1, icon: "facebook" }
  ];
  const st = [
    [pick(l, "بانتظار موافقتك", "Awaiting approval"), "bg-iris text-white"],
    [pick(l, "مجدول", "Scheduled"), "bg-lilac text-iris"],
    [pick(l, "منشور", "Published"), "bg-mint text-fern"]
  ];
  return (
    <Frame title={pick(l, "استوديو المحتوى — هذا الأسبوع", "Content Studio — this week")} icon={<Tile icon="PenTool" />} badge={<Status tone="brand">{pick(l, "7 منشورات", "7 posts")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <div className="grid grid-cols-5 gap-1.5">
          {days.map((d, i) => {
            const p = posts[i];
            return (
              <span key={d} className="grid min-h-[132px] content-start gap-1.5 rounded-xl border border-mist bg-white p-1.5">
                <span className="text-center text-[10.5px] font-semibold text-graphite">{d}</span>
                {p && (
                  <span className="grid gap-1 rounded-lg border border-mist p-1.5">
                    <span className="aspect-[4/3] rounded-md bg-gradient-to-br from-lilac to-[#d9d2ff]" />
                    <span className="flex items-center gap-1 text-[10px] font-semibold leading-tight text-ink">
                      <BrandIcon slug={p.icon} size={10} colored />
                      <span className="truncate">{p.t}</span>
                    </span>
                    <span className={`truncate rounded px-1 text-center text-[9px] font-semibold ${st[p.s][1]}`}>{st[p.s][0]}</span>
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <span className="flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 text-[12px] text-ink">
          <Icon name="Sparkles" size={14} className="text-iris" />
          {pick(l, "NOVA جهّز 3 منشورات جديدة بأسلوب علامتك", "NOVA drafted 3 new posts in your brand voice")}
          <span className="ms-auto rounded-lg bg-iris px-2 py-0.5 text-[11px] font-semibold text-white">{pick(l, "مراجعة", "Review")}</span>
        </span>
      </div>
    </Frame>
  );
}

function NovaSales({ l }: { l: Lc }) {
  const cols = [
    { t: pick(l, "مهتم", "Lead"), cards: [[pick(l, "مريم أحمد", "Mariam A."), "Instagram"], [pick(l, "شركة الأفق", "Horizon Co."), "WhatsApp"]] },
    { t: pick(l, "عرض سعر", "Proposal"), cards: [[pick(l, "فعاليات صالح", "Saleh Events"), "SAR 12,000"]] },
    { t: pick(l, "تم الإغلاق", "Won"), cards: [[pick(l, "ناصر للاستشارات", "Nasser Consulting"), "SAR 28,500"]] }
  ];
  return (
    <Frame title={pick(l, "مكتب المبيعات", "Sales Desk")} icon={<Tile icon="Route" />} badge={<Status>{pick(l, "4 فرص نشطة", "4 open deals")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <div className="grid grid-cols-3 gap-2">
          {cols.map((c, ci) => (
            <div key={c.t} className="grid content-start gap-1.5 rounded-xl bg-white/70 p-1.5">
              <span className="flex items-center justify-between px-1 text-[11px] font-semibold text-iron">
                {c.t}
                <span className="rounded-full bg-mist px-1.5 text-[10px]">{c.cards.length}</span>
              </span>
              {c.cards.map(([n, v]) => (
                <span key={n} className={`grid gap-1 rounded-lg border bg-white p-2 shadow-card ${ci === 2 ? "border-fern/40" : "border-mist"}`}>
                  <span className="truncate text-[11.5px] font-semibold text-ink">{n}</span>
                  <span className="truncate text-[10.5px] text-graphite" dir="ltr">
                    {v}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <span className="grid gap-1 rounded-xl border border-iris/30 bg-white p-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-iris">
            <Icon name="Target" size={12} /> {pick(l, "مساعد المبيعات", "Sales Assistant")}
          </span>
          <span className="text-[12px] text-ink">{pick(l, "«فعاليات صالح» لم تتحرك منذ أسبوعين — جهّزت لك رسالة متابعة.", "“Saleh Events” hasn't moved in two weeks — I drafted a follow-up.")}</span>
        </span>
      </div>
    </Frame>
  );
}

function NovaBrain({ l }: { l: Lc }) {
  const rows: [IconName, string, string][] = [
    ["Palette", pick(l, "صوت العلامة", "Brand voice"), pick(l, "دافئ، مباشر، خبير", "Warm, direct, expert")],
    ["Tag", pick(l, "العروض", "Offers"), pick(l, "باقة رمضان · خصم 20%", "Ramadan bundle · 20% off")],
    ["Users", pick(l, "الجمهور", "Audience"), pick(l, "نساء 25–40 · الرياض", "Women 25–40 · Riyadh")],
    ["TrendingUp", pick(l, "ما ينجح", "What works"), pick(l, "المحتوى التعليمي", "Educational posts")]
  ];
  return (
    <Frame title={pick(l, "عقل الشركة", "Company Brain")} icon={<Tile icon="Sparkles" strong />} badge={<Status>{pick(l, "تم التحديث الآن", "Updated just now")}</Status>}>
      <div className="grid gap-3 bg-cloud p-4">
        <ul className="grid gap-1.5">
          {rows.map(([icon, k, v]) => (
            <li key={k} className="flex items-center gap-3 rounded-xl border border-mist bg-white px-3 py-2">
              <Tile icon={icon} size={13} />
              <span className="text-[11.5px] text-graphite">{k}</span>
              <span className="ms-auto truncate font-semibold text-ink">{v}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line bg-white p-2.5">
          <span className="text-[11px] text-graphite">{pick(l, "يتعلّم من:", "Learns from:")}</span>
          {["instagram", "tiktok", "whatsapp", "gmail"].map((s) => (
            <span key={s} className="grid size-6 place-items-center rounded-md bg-cloud">
              <BrandIcon slug={s} size={13} colored />
            </span>
          ))}
          <span className="ms-auto flex items-center gap-1 text-[11px] font-semibold text-iris">
            <Icon name="Languages" size={12} /> {pick(l, "عربي · English", "Arabic · English")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

function NovaInbox({ l }: { l: Lc }) {
  return (
    <Frame title={pick(l, "صندوق واتساب", "WhatsApp Inbox")} icon={<BrandIcon slug="whatsapp" size={16} colored />} badge={<Status>{pick(l, "عميل مهتم جديد", "New lead")}</Status>}>
      <div className="grid gap-2.5 bg-[#efe7dc] p-4">
        <span className="w-fit max-w-[80%] rounded-2xl rounded-ss-sm bg-white px-3 py-2 text-ink shadow-card">{pick(l, "هل جلسة العناية متاحة يوم الجمعة؟", "Is the facial available on Friday?")}</span>
        <div className="ms-auto grid w-[86%] gap-2 rounded-2xl rounded-se-sm border-2 border-dashed border-iris/50 bg-white p-3 shadow-card">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-iris">
            <Icon name="Sparkles" size={12} /> {pick(l, "مسودة من NOVA — بانتظار موافقتك", "NOVA draft — awaiting your approval")}
          </span>
          <span className="text-ink">{pick(l, "أكيد! متاح الجمعة الساعة 4 أو 6 مساءً. أحجز لك موعد؟", "Yes — Friday at 4 pm or 6 pm. Shall I book one?")}</span>
          <span className="flex gap-1.5">
            <span className="flex items-center gap-1 rounded-lg bg-iris px-2.5 py-1 text-[11px] font-semibold text-white">
              <Icon name="Check" size={12} /> {pick(l, "وافق وأرسل", "Approve & send")}
            </span>
            <span className="flex items-center gap-1 rounded-lg border border-mist px-2.5 py-1 text-[11px] font-semibold text-ink">
              <Icon name="Pencil" size={11} /> {pick(l, "تعديل", "Edit")}
            </span>
          </span>
        </div>
        <span className="mx-auto flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] text-iron">
          <Icon name="Route" size={12} className="text-iris" /> {pick(l, "أُضيف إلى مسار المبيعات تلقائياً", "Added to the sales pipeline automatically")}
        </span>
      </div>
    </Frame>
  );
}

const registry: Record<MockupKey, (p: { l: Lc }) => ReactNode> = {
  "cb-campaigns": CbCampaigns,
  "cb-flow": CbFlow,
  "cb-crm": CbCrm,
  "cb-store": CbStore,
  "cb-official": CbOfficial,
  "nova-studio": NovaStudio,
  "nova-sales": NovaSales,
  "nova-brain": NovaBrain,
  "nova-inbox": NovaInbox
};

export function ProductMockup({ name, locale }: { name: MockupKey; locale: string }) {
  const Cmp = registry[name];
  return <Cmp l={locale === "ar" ? "ar" : "en"} />;
}
