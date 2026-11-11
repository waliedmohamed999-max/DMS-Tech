import { type Tier } from "@/content/offers";
import { type L } from "@/content/types";
import { Check, IconPick, LField, LList, Label, Num, Select, emptyL, slugify, useT } from "./shared";

// --- templates for new items ----------------------------------------------------------------------

export const newTier = (key: string): Tier => ({
  key,
  icon: "Package",
  name: { ar: "باقة جديدة", en: "New package" },
  tagline: emptyL(),
  idealFor: emptyL(),
  model: {
    ar: "مشروع يُنفَّذ لك وتملكه بالكامل بعد السداد — دفعة واحدة",
    en: "A project delivered to you and fully yours once paid — one payment",
  },
  about: emptyL(),
  youProvide: [],
  after: emptyL(),
  price: 0,
  from: false,
  period: { ar: "دفعة واحدة", en: "one-time" },
  billing: "one-time",
  delivery: { ar: "10 أيام عمل", en: "10 working days" },
  features: [{ ar: "بند يشمله", en: "An included item" }],
  excludes: [],
});

const PERIODS: Record<Tier["billing"], L> = {
  "one-time": { ar: "دفعة واحدة", en: "one-time" },
  monthly: { ar: "شهرياً", en: "per month" },
  term: { ar: "إجمالي 3 أشهر", en: "total for 3 months" },
};

// --- package (tier) form --------------------------------------------------------------------------

export function TierForm({
  t,
  onChange,
  disabled,
}: {
  t: Tier;
  onChange: (t: Tier) => void;
  disabled: boolean;
}) {
  const { x, AR } = useT();
  const set = <K extends keyof Tier>(k: K, v: Tier[K]) =>
    onChange({ ...t, [k]: v });
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Label
          text={x("رابط الباقة", "Package link")}
          hint={`/offers/${t.key}`}
        >
          <input
            className="os-input"
            dir="ltr"
            value={t.key}
            disabled={disabled}
            onChange={(e) => set("key", slugify(e.target.value))}
          />
        </Label>
        <IconPick
          value={t.icon}
          onChange={(v) => set("icon", v)}
          disabled={disabled}
        />
        <div className="grid content-end gap-2">
          <Check
            label={x("الأكثر طلباً", "Most requested")}
            checked={Boolean(t.featured)}
            onChange={(v) => set("featured", v || undefined)}
            disabled={disabled}
          />
        </div>
      </div>
      <LField
        label={x("اسم الباقة", "Package name")}
        value={t.name}
        onChange={(v) => set("name", v)}
        disabled={disabled}
      />
      <LField
        label={x("وصف قصير تحت الاسم", "Short line under the name")}
        value={t.tagline}
        onChange={(v) => set("tagline", v)}
        disabled={disabled}
      />

      <fieldset className="grid gap-3 rounded-lg border border-os-line p-3">
        <legend className="px-1 text-xs font-semibold text-iris-light">
          {x("السعر والدفع", "Price and billing")}
        </legend>
        <div className="grid gap-3 md:grid-cols-4">
          <Num
            label={x("السعر قبل الضريبة (ر.س)", "Price before VAT (SAR)")}
            value={t.price}
            allowEmpty
            hint={x(
              "اتركه فارغاً لـ «السعر حسب المتطلبات»",
              "Leave empty for “priced to your requirements”",
            )}
            onChange={(v) => set("price", v)}
            disabled={disabled}
          />
          <Select
            label={x("طريقة الدفع", "Billing")}
            value={t.billing}
            disabled={disabled}
            options={[
              { value: "one-time", label: x("دفعة واحدة", "One-time") },
              { value: "monthly", label: x("اشتراك شهري", "Monthly") },
              { value: "term", label: x("عقد لمدة محددة", "Fixed term") },
            ]}
            onChange={(v) => {
              const billing = v as Tier["billing"];
              onChange({
                ...t,
                billing,
                period: PERIODS[billing],
                termMonths:
                  billing === "term" ? (t.termMonths ?? 3) : undefined,
                annual: billing === "monthly" ? t.annual : undefined,
              });
            }}
          />
          {t.billing === "term" && (
            <Num
              label={x("مدة العقد (أشهر)", "Term (months)")}
              value={t.termMonths ?? 3}
              onChange={(v) => set("termMonths", v ?? 3)}
              disabled={disabled}
            />
          )}
          {t.billing === "monthly" && (
            <Num
              label={x("سعر سنوي (اختياري)", "Yearly price (optional)")}
              value={t.annual}
              allowEmpty
              onChange={(v) => set("annual", v ?? undefined)}
              disabled={disabled}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-5">
          <Check
            label={x("السعر «يبدأ من»", "“From” price")}
            hint={x(
              "للنطاق الأساسي، والسعر النهائي بعد التحليل",
              "Base scope; the final price follows analysis",
            )}
            checked={t.from}
            onChange={(v) =>
              onChange({
                ...t,
                from: v,
                indicative: v ? t.indicative : undefined,
              })
            }
            disabled={disabled}
          />
          {t.from && (
            <Check
              label={x("مؤشر أولي", "Initial indication")}
              checked={Boolean(t.indicative)}
              onChange={(v) => set("indicative", v || undefined)}
              disabled={disabled}
            />
          )}
        </div>
        {t.period && (
          <LField
            label={x("نص بعد السعر", "Text after the price")}
            value={t.period}
            onChange={(v) => set("period", v)}
            hint={x("مثل: دفعة واحدة / شهرياً", "e.g. one-time / per month")}
            disabled={disabled}
          />
        )}
      </fieldset>

      <LField
        label={x(
          "نوع الخدمة (سطر بارز في الكارت)",
          "Kind of service (highlighted line)",
        )}
        value={t.model}
        onChange={(v) => set("model", v)}
        long
        hint={x(
          "مثال: نظام خاص بشركتك نبنيه لك وتملكه — دفعة واحدة، وليس اشتراكاً",
          "e.g. a system you own — one payment, not a subscription",
        )}
        disabled={disabled}
      />
      <LField
        label={x(
          "ماذا سيحصل العميل (شرح بسيط)",
          "What the client gets (plain words)",
        )}
        value={t.about}
        onChange={(v) => set("about", v)}
        long
        disabled={disabled}
      />
      <LField
        label={x("مناسبة لـ", "Best for")}
        value={t.idealFor}
        onChange={(v) => set("idealFor", v)}
        disabled={disabled}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <LField
          label={x("مدة التنفيذ", "Delivery")}
          value={t.delivery}
          onChange={(v) => set("delivery", v)}
          disabled={disabled}
        />
        <LField
          label={x("جولات التعديل (اختياري)", "Revisions (optional)")}
          value={t.revisions ?? emptyL()}
          onChange={(v) => set("revisions", v.ar || v.en ? v : undefined)}
          disabled={disabled}
        />
      </div>
      <LList
        label={x("ما تشمله الباقة", "What's included")}
        items={t.features}
        onChange={(v) => set("features", v)}
        disabled={disabled}
      />
      <LList
        label={x("لا تشمل", "Not included")}
        items={t.excludes}
        onChange={(v) => set("excludes", v)}
        disabled={disabled}
      />
      <LList
        label={x("ما نحتاجه من العميل", "What we need from the client")}
        items={t.youProvide}
        onChange={(v) => set("youProvide", v)}
        disabled={disabled}
      />
      <LField
        label={x(
          "بعد التسليم (الدعم والتجديد والتكاليف)",
          "After delivery (support, renewal, running costs)",
        )}
        value={t.after}
        onChange={(v) => set("after", v)}
        long
        disabled={disabled}
      />
    </div>
  );
}
