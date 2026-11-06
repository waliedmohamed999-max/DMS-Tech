"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, iconNames, type IconName } from "@/components/ui/Icon";
import {
  basisPrice,
  offerStatus,
  type Catalog,
  type Offer,
  type PackageGroup,
  type Tier,
} from "@/content/offers";
import type { L } from "@/content/types";
import {
  discardCatalogAction,
  publishCatalogAction,
  restoreCatalogAction,
  saveCatalogAction,
} from "@/lib/os/website-actions";

type Problem = { where: string; ar: string; en: string };
type State = {
  hasDraft: boolean;
  draftSavedAt: string | null;
  draftSavedBy: string | null;
  live: {
    version: number;
    publishedAt: string | null;
    publishedBy: string | null;
  } | null;
  problems: Problem[];
  notes: Problem[];
  history: {
    id: string;
    version: number;
    live: boolean;
    note: string | null;
    publishedAt: string | null;
    publishedBy: string | null;
  }[];
};
type Opt = { value: string; label: string };

/** The dashboard's language for the editor's own words. */
const LangCtx = createContext(true);
const useT = () => {
  const AR = useContext(LangCtx);
  return { AR, x: (ar: string, en: string) => (AR ? ar : en) };
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const emptyL = (): L => ({ ar: "", en: "" });
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) =>
  new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** a link-safe key from any text: "Web Pro 2" → "web-pro-2" */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const uniqueKey = (base: string, taken: Set<string>) => {
  let k = slugify(base) || "item";
  for (let i = 2; taken.has(k); i++) k = `${slugify(base) || "item"}-${i}`;
  return k;
};
const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};
const money = (n: number | null, AR: boolean) =>
  n === null ? "—" : `${n.toLocaleString("en-US")} ${AR ? "ر.س" : "SAR"}`;

// --- small fields ---------------------------------------------------------------------------------

function Label({
  text,
  hint,
  children,
}: {
  text: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid content-start gap-1">
      <span className="os-label mb-0">{text}</span>
      {children}
      {hint && (
        <span className="text-[11px] leading-relaxed text-os-faint">
          {hint}
        </span>
      )}
    </label>
  );
}

/** One text in Arabic and English, side by side. */
function LField({
  label,
  value,
  onChange,
  long,
  hint,
  disabled,
}: {
  label: string;
  value: L;
  onChange: (v: L) => void;
  long?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const cls = "os-input w-full";
  return (
    <div className="grid gap-1">
      <span className="os-label mb-0">{label}</span>
      <div className="grid gap-2 md:grid-cols-2">
        {long ? (
          <textarea
            className={`${cls} min-h-20 py-2`}
            dir="rtl"
            placeholder="العربية"
            value={value.ar}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, ar: e.target.value })}
          />
        ) : (
          <input
            className={cls}
            dir="rtl"
            placeholder="العربية"
            value={value.ar}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, ar: e.target.value })}
          />
        )}
        {long ? (
          <textarea
            className={`${cls} min-h-20 py-2`}
            dir="ltr"
            placeholder="English"
            value={value.en}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        ) : (
          <input
            className={cls}
            dir="ltr"
            placeholder="English"
            value={value.en}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, en: e.target.value })}
          />
        )}
      </div>
      {hint && (
        <span className="text-[11px] leading-relaxed text-os-faint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** A list of bilingual lines (features, exclusions, terms…): add, remove, reorder. */
function LList({
  label,
  items,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  items: L[];
  onChange: (v: L[]) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const { x, AR } = useT();
  return (
    <div className="grid gap-1.5">
      <span className="os-label mb-0">{label}</span>
      {hint && <span className="-mt-1 text-[11px] text-os-faint">{hint}</span>}
      {items.map((it, i) => (
        <div
          key={i}
          className="grid items-start gap-2 md:grid-cols-[1fr_1fr_auto]"
        >
          <input
            className="os-input"
            dir="rtl"
            placeholder="العربية"
            value={it.ar}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                items.map((y, j) =>
                  j === i ? { ...y, ar: e.target.value } : y,
                ),
              )
            }
          />
          <input
            className="os-input"
            dir="ltr"
            placeholder="English"
            value={it.en}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                items.map((y, j) =>
                  j === i ? { ...y, en: e.target.value } : y,
                ),
              )
            }
          />
          {!disabled && (
            <span className="flex gap-1">
              <IconBtn
                icon="ChevronDown"
                label={x("تحريك لأسفل", "Move down")}
                onClick={() => onChange(move(items, i, 1))}
              />
              <IconBtn
                icon="X"
                label={x("حذف", "Remove")}
                danger
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              />
            </span>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          className="os-btn-ghost h-8 w-fit px-2 text-xs"
          onClick={() => onChange([...items, emptyL()])}
        >
          + {x("إضافة سطر", "Add a line")}
        </button>
      )}
    </div>
  );
}

function IconBtn({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-md border border-os-line ${danger ? "text-danger hover:bg-danger/10" : "text-os-muted hover:bg-os-hover"} disabled:opacity-40`}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function IconPick({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: IconName) => void;
  disabled?: boolean;
}) {
  const { x, AR } = useT();
  return (
    <Label text={x("الأيقونة", "Icon")}>
      <span className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-os-line bg-os-raised text-iris-light">
          <Icon
            name={
              (iconNames.includes(value as IconName)
                ? value
                : "Tag") as IconName
            }
            size={17}
          />
        </span>
        <select
          className="os-input w-full"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as IconName)}
        >
          {iconNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </span>
    </Label>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
  allowEmpty,
  disabled,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  hint?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const { x, AR } = useT();
  return (
    <Label text={label} hint={hint}>
      <input
        className="os-input w-full"
        dir="ltr"
        inputMode="decimal"
        disabled={disabled}
        value={value ?? ""}
        placeholder={allowEmpty ? x("فارغ", "empty") : "0"}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          onChange(v === "" ? (allowEmpty ? null : 0) : Number(v));
        }}
      />
    </Label>
  );
}

function Check({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-iris"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="grid">
        <span className="font-medium text-os-text">{label}</span>
        {hint && <span className="text-[11px] text-os-faint">{hint}</span>}
      </span>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Label text={label} hint={hint}>
      <select
        className="os-input w-full"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.some((o) => o.value === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Label>
  );
}

function Card({
  title,
  sub,
  open,
  onToggle,
  tools,
  children,
  tone,
}: {
  title: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  tools?: React.ReactNode;
  children: React.ReactNode;
  tone?: "draft" | "featured";
}) {
  const { x, AR } = useT();
  return (
    <div
      className={`os-card overflow-hidden ${tone === "featured" ? "border-iris/50" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          <Icon
            name="ChevronDown"
            size={16}
            className={`shrink-0 text-os-muted transition ${open ? "rotate-180" : ""}`}
          />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-semibold text-os-text">
              {title || x("(بدون اسم)", "(untitled)")}
            </span>
            {sub && (
              <span className="truncate text-xs text-os-muted">{sub}</span>
            )}
          </span>
          {tone === "draft" && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {x("مسودة لا تظهر", "Hidden draft")}
            </span>
          )}
        </button>
        {tools && <span className="flex flex-wrap gap-1">{tools}</span>}
      </div>
      {open && (
        <div className="grid gap-4 border-t border-os-line px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

// --- templates for new items ----------------------------------------------------------------------

const newTier = (key: string): Tier => ({
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

function TierForm({
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

// --- sections -------------------------------------------------------------------------------------

function GroupsTab({
  cat,
  setCat,
  services,
  disabled,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  services: Opt[];
  disabled: boolean;
}) {
  const { x, AR } = useT();
  const [sel, setSel] = useState(0);
  const [openTier, setOpenTier] = useState<string | null>(null);
  const g = cat.groups[Math.min(sel, cat.groups.length - 1)];
  const gi = cat.groups.indexOf(g);
  const allTierKeys = new Set(
    cat.groups.flatMap((y) => y.tiers.map((t) => t.key)),
  );
  const setGroup = (ng: PackageGroup) =>
    setCat({ ...cat, groups: cat.groups.map((y, i) => (i === gi ? ng : y)) });
  const setG = <K extends keyof PackageGroup>(k: K, v: PackageGroup[K]) =>
    setGroup({ ...g, [k]: v });

  const addGroup = () => {
    const id = uniqueKey("new-section", new Set(cat.groups.map((y) => y.id)));
    const ng: PackageGroup = {
      id,
      segment: "smb",
      service: services[0]?.value ?? "web-development",
      icon: "Layers",
      title: { ar: "قسم جديد", en: "New section" },
      short: { ar: "قسم جديد", en: "New section" },
      text: emptyL(),
      highlights: [],
      notice: emptyL(),
      tiers: [newTier(uniqueKey(`${id}-basic`, allTierKeys))],
      draft: true,
    };
    setCat({ ...cat, groups: [...cat.groups, ng] });
    setSel(cat.groups.length);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="os-card h-fit overflow-hidden">
        <div className="border-b border-os-line px-3 py-2 text-xs font-semibold text-os-muted">
          {x("الأقسام (بترتيب ظهورها)", "Sections (in page order)")}
        </div>
        <ul className="divide-y divide-os-line">
          {cat.groups.map((y, i) => (
            <li
              key={`${y.id}-${i}`}
              className={`flex items-center gap-1 px-2 py-1.5 ${i === gi ? "bg-os-hover" : ""}`}
            >
              <button
                type="button"
                onClick={() => setSel(i)}
                className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-start text-sm"
              >
                <Icon
                  name={y.icon}
                  size={15}
                  className="shrink-0 text-iris-light"
                />
                <span className="grid min-w-0">
                  <span className="truncate font-medium">
                    {AR ? y.short.ar : y.short.en}
                  </span>
                  <span className="text-[11px] text-os-faint">
                    {y.tiers.length} {x("باقات", "packages")} ·{" "}
                    {y.segment === "smb"
                      ? x("باقات", "Packages")
                      : x("حلول الشركات", "Business")}
                    {y.draft ? ` · ${x("مسودة", "draft")}` : ""}
                  </span>
                </span>
              </button>
              {!disabled && (
                <span className="flex">
                  <button
                    type="button"
                    className="os-btn-ghost size-7 px-0"
                    title={x("لأعلى", "Up")}
                    onClick={() => (
                      setCat({ ...cat, groups: move(cat.groups, i, -1) }),
                      setSel(Math.max(0, i - 1))
                    )}
                  >
                    <Icon name="ChevronDown" size={14} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    className="os-btn-ghost size-7 px-0"
                    title={x("لأسفل", "Down")}
                    onClick={() => (
                      setCat({ ...cat, groups: move(cat.groups, i, 1) }),
                      setSel(Math.min(cat.groups.length - 1, i + 1))
                    )}
                  >
                    <Icon name="ChevronDown" size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!disabled && (
          <div className="border-t border-os-line p-2">
            <button
              type="button"
              className="os-btn-secondary w-full"
              onClick={addGroup}
            >
              + {x("قسم جديد", "New section")}
            </button>
          </div>
        )}
      </aside>

      {g && (
        <div className="grid content-start gap-4">
          <div className="os-card grid gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                {x("بيانات القسم", "Section details")}
              </h2>
              {!disabled && (
                <button
                  type="button"
                  className="os-btn-danger h-8 text-xs"
                  disabled={cat.groups.length < 2}
                  onClick={() => {
                    if (
                      !window.confirm(
                        x(
                          `حذف قسم «${g.title.ar}» وكل باقاته؟`,
                          `Delete the section "${g.title.en}" and all its packages?`,
                        ),
                      )
                    )
                      return;
                    setCat({
                      ...cat,
                      groups: cat.groups.filter((_, i) => i !== gi),
                    });
                    setSel(0);
                  }}
                >
                  <Icon name="X" size={14} /> {x("حذف القسم", "Delete section")}
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Label
                text={x("رابط القسم", "Section link")}
                hint={`/offers#pkg-${g.id}`}
              >
                <input
                  className="os-input"
                  dir="ltr"
                  value={g.id}
                  disabled={disabled}
                  onChange={(e) => setG("id", slugify(e.target.value))}
                />
              </Label>
              <IconPick
                value={g.icon}
                onChange={(v) => setG("icon", v)}
                disabled={disabled}
              />
              <Select
                label={x("مكانه في الصفحة", "Where it shows")}
                value={g.segment}
                disabled={disabled}
                options={[
                  { value: "smb", label: x("الباقات", "Packages") },
                  {
                    value: "business",
                    label: x(
                      "حلول الشركات (بعرض سعر)",
                      "Business solutions (quote)",
                    ),
                  },
                ]}
                onChange={(v) => setG("segment", v as PackageGroup["segment"])}
              />
              <Select
                label={x("صفحة الخدمة المرتبطة", "Linked service page")}
                value={g.service}
                options={services}
                disabled={disabled}
                onChange={(v) => setG("service", v)}
              />
            </div>
            <Check
              label={x(
                "مسودة (لا تظهر للزوار)",
                "Draft (hidden from visitors)",
              )}
              hint={x(
                "استخدمها لقسم لم تُعتمد أسعاره بعد",
                "Use it for a section whose prices aren't approved yet",
              )}
              checked={Boolean(g.draft)}
              onChange={(v) => setG("draft", v || undefined)}
              disabled={disabled}
            />
            <LField
              label={x("عنوان القسم", "Section title")}
              value={g.title}
              onChange={(v) => setG("title", v)}
              disabled={disabled}
            />
            <LField
              label={x("الاسم المختصر (في التبويب)", "Short name (tab)")}
              value={g.short}
              onChange={(v) => setG("short", v)}
              disabled={disabled}
            />
            <LField
              label={x("وصف القسم", "Section description")}
              value={g.text}
              onChange={(v) => setG("text", v)}
              long
              disabled={disabled}
            />
            <LList
              label={x("أهم المزايا (3 أسطر)", "Key highlights (3 lines)")}
              items={g.highlights}
              onChange={(v) => setG("highlights", v)}
              disabled={disabled}
            />
            <LField
              label={x(
                "ملاحظة الشروط فوق الباقات",
                "Conditions note above the packages",
              )}
              value={g.notice}
              onChange={(v) => setG("notice", v)}
              long
              disabled={disabled}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {x("باقات القسم", "Packages in this section")} ({g.tiers.length})
            </h2>
            {!disabled && (
              <button
                type="button"
                className="os-btn-primary"
                onClick={() => {
                  const key = uniqueKey(`${g.id}-new`, allTierKeys);
                  setG("tiers", [...g.tiers, newTier(key)]);
                  setOpenTier(key);
                }}
              >
                + {x("باقة جديدة", "New package")}
              </button>
            )}
          </div>
          {g.tiers.map((t, ti) => (
            <Card
              key={`${t.key}-${ti}`}
              title={`${AR ? t.name.ar : t.name.en}`}
              sub={`${t.from ? x("يبدأ من ", "from ") : ""}${money(t.price, AR)} · ${AR ? (t.period?.ar ?? "") : (t.period?.en ?? "")}`}
              open={openTier === t.key}
              onToggle={() => setOpenTier(openTier === t.key ? null : t.key)}
              tone={t.featured ? "featured" : undefined}
              tools={
                !disabled && (
                  <>
                    <IconBtn
                      icon="ChevronDown"
                      label={x("تحريك لأسفل", "Move down")}
                      onClick={() => setG("tiers", move(g.tiers, ti, 1))}
                    />
                    <IconBtn
                      icon="Layers"
                      label={x("نسخ الباقة", "Duplicate")}
                      onClick={() => {
                        const c = clone(t);
                        c.key = uniqueKey(`${t.key}-copy`, allTierKeys);
                        c.name = {
                          ar: `${t.name.ar} (نسخة)`,
                          en: `${t.name.en} (copy)`,
                        };
                        c.featured = undefined;
                        setG("tiers", [
                          ...g.tiers.slice(0, ti + 1),
                          c,
                          ...g.tiers.slice(ti + 1),
                        ]);
                        setOpenTier(c.key);
                      }}
                    />
                    <IconBtn
                      icon="X"
                      danger
                      label={x("حذف الباقة", "Delete package")}
                      disabled={g.tiers.length < 2}
                      onClick={() =>
                        window.confirm(
                          x(
                            `حذف باقة «${t.name.ar}»؟`,
                            `Delete "${t.name.en}"?`,
                          ),
                        ) &&
                        setG(
                          "tiers",
                          g.tiers.filter((_, j) => j !== ti),
                        )
                      }
                    />
                  </>
                )
              }
            >
              <TierForm
                t={t}
                disabled={disabled}
                onChange={(nt) =>
                  setG(
                    "tiers",
                    g.tiers.map((y, j) => (j === ti ? nt : y)),
                  )
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// --- offers ---------------------------------------------------------------------------------------

function OffersTab({
  cat,
  setCat,
  services,
  disabled,
  userName,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  services: Opt[];
  disabled: boolean;
  userName: string;
}) {
  const { x, AR } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const tiers = cat.groups.flatMap((g) => g.tiers.map((t) => ({ g, t })));
  const fixed = tiers.filter(
    ({ g, t }) => !t.from && t.price !== null && !g.draft,
  );
  const tierOpts: Opt[] = fixed.map(({ g, t }) => ({
    value: t.key,
    label: `${AR ? g.short.ar : g.short.en} — ${AR ? t.name.ar : t.name.en} (${money(t.price, AR)}${t.billing === "one-time" ? "" : x(" شهرياً", "/mo")})`,
  }));
  const setOffer = (i: number, o: Offer) =>
    setCat({ ...cat, offers: cat.offers.map((y, j) => (j === i ? o : y)) });
  const statusLabel = {
    live: x("يعمل الآن", "Live now"),
    scheduled: x("مجدول", "Scheduled"),
    ended: x("انتهى", "Ended"),
    invalid: x(
      "لن يظهر — راجع السعر والباقات والاعتماد",
      "Won't show — check price, packages and approval",
    ),
  };
  const addOffer = () => {
    const first = fixed[0];
    if (!first) return;
    const slug = uniqueKey(
      "new-offer",
      new Set([
        ...cat.offers.map((o) => o.slug),
        ...tiers.map(({ t }) => t.key),
      ]),
    );
    const start = today();
    const o: Offer = {
      slug,
      service: first.g.service,
      icon: "Tag",
      campaign: cat.offers[0]?.campaign ?? {
        ar: "عروض لفترة محدودة",
        en: "Limited-time offers",
      },
      name: { ar: "عرض جديد", en: "New offer" },
      pitch: emptyL(),
      forWho: emptyL(),
      price: Math.round((first.t.price ?? 0) * 0.85),
      basis: [{ key: first.t.key }],
      terms: [],
      startsAt: start,
      endsAt: plusDays(start, 13),
      approved: null,
    };
    setCat({ ...cat, offers: [...cat.offers, o] });
    setOpen(slug);
  };

  return (
    <div className="grid gap-4">
      <div className="os-card grid gap-2 p-4 text-sm leading-relaxed text-os-muted">
        <p>
          {x(
            "العرض = سعر خاص على باقة أو أكثر لفترة محددة. محتواه وما لا يشمله وسعره قبل الخصم تُؤخذ تلقائياً من الباقات التي تختارها، فلا يمكن أن يتعارض معها. يظهر العرض للزوار فقط إذا كان معتمداً، وسعره أقل من باقاته، وبين تاريخي البداية والنهاية.",
            "An offer is a special price on one or more packages for set dates. Its contents, exclusions and struck price come from the packages you pick, so it can't contradict them. Visitors see it only when approved, cheaper than its packages and between its dates.",
          )}
        </p>
      </div>
      {!disabled && (
        <button
          type="button"
          className="os-btn-primary w-fit"
          onClick={addOffer}
          disabled={!fixed.length}
        >
          + {x("عرض جديد", "New offer")}
        </button>
      )}
      {cat.offers.length === 0 && (
        <p className="os-card p-6 text-center text-sm text-os-muted">
          {x("لا توجد عروض الآن.", "No offers yet.")}
        </p>
      )}
      {cat.offers.map((o, i) => {
        const base = basisPrice(o, cat.groups);
        const status = offerStatus(o, new Date(), cat.groups);
        const off = base ? Math.round((1 - o.price / base) * 100) : null;
        const set = <K extends keyof Offer>(k: K, v: Offer[K]) =>
          setOffer(i, { ...o, [k]: v });
        return (
          <Card
            key={`${o.slug}-${i}`}
            title={AR ? o.name.ar : o.name.en}
            sub={`${money(o.price, AR)} ${base ? `${x("بدلاً من", "instead of")} ${money(base, AR)} (${off}%)` : ""} · ${o.startsAt} → ${o.endsAt} · ${statusLabel[status]}`}
            open={open === o.slug}
            onToggle={() => setOpen(open === o.slug ? null : o.slug)}
            tools={
              !disabled && (
                <>
                  <IconBtn
                    icon="ChevronDown"
                    label={x("تحريك لأسفل", "Move down")}
                    onClick={() =>
                      setCat({ ...cat, offers: move(cat.offers, i, 1) })
                    }
                  />
                  <IconBtn
                    icon="X"
                    danger
                    label={x("حذف العرض", "Delete offer")}
                    onClick={() =>
                      window.confirm(
                        x(`حذف عرض «${o.name.ar}»؟`, `Delete "${o.name.en}"?`),
                      ) &&
                      setCat({
                        ...cat,
                        offers: cat.offers.filter((_, j) => j !== i),
                      })
                    }
                  />
                </>
              )
            }
          >
            <div
              className={`rounded-lg px-3 py-2 text-sm font-medium ${status === "invalid" ? "bg-danger/10 text-danger" : status === "live" ? "bg-success/10 text-success" : "bg-os-raised text-os-muted"}`}
            >
              {statusLabel[status]}
              {base !== null && (
                <span className="ms-2 font-normal">
                  · {x("قيمة الباقات", "Packages value")} {money(base, AR)} ·{" "}
                  {x("التوفير", "Saving")} {money(base - o.price, AR)} ({off}%)
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Label
                text={x("رابط العرض", "Offer link")}
                hint={`/offers/${o.slug}`}
              >
                <input
                  className="os-input"
                  dir="ltr"
                  value={o.slug}
                  disabled={disabled}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                />
              </Label>
              <IconPick
                value={o.icon}
                onChange={(v) => set("icon", v)}
                disabled={disabled}
              />
              <Num
                label={x(
                  "سعر العرض قبل الضريبة (ر.س)",
                  "Offer price before VAT (SAR)",
                )}
                value={o.price}
                onChange={(v) => set("price", v ?? 0)}
                disabled={disabled}
              />
              <Select
                label={x("صفحة الخدمة المرتبطة", "Linked service page")}
                value={o.service}
                options={services}
                onChange={(v) => set("service", v)}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Label text={x("يبدأ في", "Starts on")}>
                <input
                  type="date"
                  className="os-input"
                  dir="ltr"
                  value={o.startsAt}
                  disabled={disabled}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
              </Label>
              <Label text={x("ينتهي في (آخر يوم)", "Ends on (last day)")}>
                <input
                  type="date"
                  className="os-input"
                  dir="ltr"
                  value={o.endsAt}
                  disabled={disabled}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
              </Label>
              <div className="grid content-end">
                <Check
                  label={x("العرض معتمد", "Offer approved")}
                  hint={
                    o.approved ??
                    x(
                      "بدون اعتماد لا يظهر للزوار",
                      "Without approval visitors don't see it",
                    )
                  }
                  checked={Boolean(o.approved)}
                  disabled={disabled}
                  onChange={(v) =>
                    set("approved", v ? `${userName} — ${today()}` : null)
                  }
                />
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-os-line p-3">
              <span className="os-label mb-0">
                {x("الباقات داخل العرض", "Packages in the offer")}
              </span>
              {o.basis.map((b, bi) => {
                const t = tiers.find((y) => y.t.key === b.key)?.t;
                return (
                  <div
                    key={bi}
                    className="grid items-end gap-2 md:grid-cols-[1fr_140px_auto]"
                  >
                    <Select
                      label={x("الباقة", "Package")}
                      value={b.key}
                      options={tierOpts}
                      disabled={disabled}
                      onChange={(v) =>
                        set(
                          "basis",
                          o.basis.map((y, j) =>
                            j === bi ? { ...y, key: v } : y,
                          ),
                        )
                      }
                    />
                    {t && t.billing !== "one-time" ? (
                      <Num
                        label={x("عدد الأشهر", "Months")}
                        value={b.months ?? 1}
                        disabled={disabled}
                        onChange={(v) =>
                          set(
                            "basis",
                            o.basis.map((y, j) =>
                              j === bi
                                ? {
                                    ...y,
                                    months: Math.max(1, Math.round(v ?? 1)),
                                  }
                                : y,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span />
                    )}
                    {!disabled && (
                      <IconBtn
                        icon="X"
                        danger
                        label={x("إزالة", "Remove")}
                        disabled={o.basis.length < 2}
                        onClick={() =>
                          set(
                            "basis",
                            o.basis.filter((_, j) => j !== bi),
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!disabled && (
                <button
                  type="button"
                  className="os-btn-ghost h-8 w-fit px-2 text-xs"
                  onClick={() =>
                    set("basis", [...o.basis, { key: fixed[0]?.t.key ?? "" }])
                  }
                >
                  + {x("إضافة باقة للعرض", "Add a package")}
                </button>
              )}
            </div>
            <LField
              label={x(
                "اسم الحملة (يظهر أعلى البانر)",
                "Campaign name (top of the banner)",
              )}
              value={o.campaign}
              onChange={(v) => set("campaign", v)}
              disabled={disabled}
              hint={x(
                "اسم القسم في الصفحة يُؤخذ من أول عرض",
                "The page section title comes from the first offer",
              )}
            />
            <LField
              label={x("اسم العرض", "Offer name")}
              value={o.name}
              onChange={(v) => set("name", v)}
              disabled={disabled}
            />
            <LField
              label={x(
                "جملة العرض (ماذا يحصل العميل)",
                "Pitch (what the client gets)",
              )}
              value={o.pitch}
              onChange={(v) => set("pitch", v)}
              long
              disabled={disabled}
            />
            <LField
              label={x("لمن هذا العرض؟", "Who is it for?")}
              value={o.forWho}
              onChange={(v) => set("forWho", v)}
              long
              disabled={disabled}
            />
            <LList
              label={x("شروط العرض", "Offer conditions")}
              items={o.terms}
              onChange={(v) => set("terms", v)}
              disabled={disabled}
            />
          </Card>
        );
      })}
    </div>
  );
}

// --- page texts -----------------------------------------------------------------------------------

const COPY_LABELS: Record<string, [string, string]> = {
  eyebrow: ["اسم الصفحة", "Page name"],
  title: [
    "العنوان الرئيسي (ما بين * * يظهر ملوّناً)",
    "Main title (text between * * is highlighted)",
  ],
  sub: ["الوصف تحت العنوان", "Text under the title"],
  heroPoints: ["نقاط أعلى الصفحة", "Hero points"],
  glossary: ["معاني الكلمات (باقة / عرض / عرض سعر)", "Glossary"],
  offersNote: ["وصف قسم العروض", "Offers section text"],
  packagesTitle: ["عنوان قسم الباقات", "Packages title"],
  packagesSub: ["وصف قسم الباقات", "Packages text"],
  solutionsTitle: ["عنوان حلول الشركات", "Business solutions title"],
  solutionsSub: ["وصف حلول الشركات", "Business solutions text"],
  howTitle: ["عنوان «كيف نبدأ»", "“How we start” title"],
  how: ["خطوات «كيف نبدأ»", "“How we start” steps"],
  whyTitle: ["عنوان «لماذا نحن»", "“Why us” title"],
  whySub: ["وصف «لماذا نحن»", "“Why us” text"],
  why: ["أسباب «لماذا نحن»", "“Why us” items"],
  faqTitle: ["عنوان الأسئلة الشائعة", "FAQ title"],
  faqs: ["الأسئلة الشائعة", "FAQ"],
  termsTitle: ["عنوان الشروط العامة", "General terms title"],
  generalTerms: ["الشروط العامة", "General terms"],
  vatNote: ["ملاحظة الضريبة أسفل الباقات", "VAT note"],
  ctaTitle: ["عنوان الدعوة الأخيرة", "Closing title"],
  ctaText: ["نص الدعوة الأخيرة", "Closing text"],
  projectsTitle: ["عنوان «من أعمالنا»", "Projects title"],
  projectsSub: ["وصف «من أعمالنا»", "Projects text"],
};
const FIELD_LABELS: Record<string, [string, string]> = {
  title: ["العنوان", "Title"],
  text: ["النص", "Text"],
  q: ["السؤال", "Question"],
  a: ["الجواب", "Answer"],
  icon: ["الأيقونة", "Icon"],
};
const isLv = (v: unknown): v is L =>
  !!v &&
  typeof v === "object" &&
  typeof (v as L).ar === "string" &&
  typeof (v as L).en === "string" &&
  Object.keys(v as object).length === 2;

/** Any text shape from the page copy: a text, a list of texts, a list of cards, or a group of texts. */
function CopyValue({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const { x, AR } = useT();
  if (isLv(value))
    return (
      <LField
        label={label}
        value={value}
        onChange={onChange}
        long={value.ar.length > 70}
        disabled={disabled}
      />
    );
  if (typeof value === "string")
    return <IconPick value={value} onChange={onChange} disabled={disabled} />;
  if (Array.isArray(value)) {
    if (value.every(isLv))
      return (
        <LList
          label={label}
          items={value as L[]}
          onChange={onChange}
          disabled={disabled}
        />
      );
    return (
      <div className="grid gap-2">
        <span className="os-label mb-0">{label}</span>
        {value.map((item, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-lg border border-os-line p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-os-muted">
                #{i + 1}
              </span>
              {!disabled && (
                <span className="flex gap-1">
                  <IconBtn
                    icon="ChevronDown"
                    label={x("تحريك لأسفل", "Move down")}
                    onClick={() => onChange(move(value, i, 1))}
                  />
                  <IconBtn
                    icon="X"
                    danger
                    label={x("حذف", "Remove")}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                  />
                </span>
              )}
            </div>
            {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
              <CopyValue
                key={k}
                label={FIELD_LABELS[k] ? x(...FIELD_LABELS[k]) : k}
                value={v}
                disabled={disabled}
                onChange={(nv) =>
                  onChange(
                    value.map((y, j) =>
                      j === i ? { ...(y as object), [k]: nv } : y,
                    ),
                  )
                }
              />
            ))}
          </div>
        ))}
        {!disabled && value.length > 0 && (
          <button
            type="button"
            className="os-btn-ghost h-8 w-fit px-2 text-xs"
            onClick={() => {
              const t = clone(value[0]) as Record<string, unknown>;
              for (const k of Object.keys(t)) if (isLv(t[k])) t[k] = emptyL();
              onChange([...value, t]);
            }}
          >
            + {x("إضافة", "Add")}
          </button>
        )}
      </div>
    );
  }
  if (value && typeof value === "object")
    return (
      <div className="grid gap-3 rounded-lg border border-os-line p-3">
        <span className="os-label mb-0">{label}</span>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <CopyValue
            key={k}
            label={k}
            value={v}
            disabled={disabled}
            onChange={(nv) => onChange({ ...(value as object), [k]: nv })}
          />
        ))}
      </div>
    );
  return null;
}

function CopyTab({
  cat,
  setCat,
  disabled,
}: {
  cat: Catalog;
  setCat: (c: Catalog) => void;
  disabled: boolean;
}) {
  const { x, AR } = useT();
  const [showAll, setShowAll] = useState(false);
  const copy = cat.copy as unknown as Record<string, unknown>;
  const keys = Object.keys(copy).filter((k) => showAll || k in COPY_LABELS);
  return (
    <div className="grid gap-4">
      <div className="os-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-os-muted">
        <p>
          {x(
            "نصوص صفحة العروض: العناوين والأوصاف والأسئلة الشائعة والشروط. «كل النصوص» تعرض أيضاً الكلمات الصغيرة مثل أسماء الأزرار.",
            "The offers page texts: titles, descriptions, FAQ and terms. “All texts” also shows small words such as button labels.",
          )}
        </p>
        <Check
          label={x("كل النصوص", "All texts")}
          checked={showAll}
          onChange={setShowAll}
        />
      </div>
      <div className="os-card grid gap-5 p-4">
        {keys.map((k) => (
          <CopyValue
            key={k}
            label={COPY_LABELS[k] ? x(...COPY_LABELS[k]) : k}
            value={copy[k]}
            disabled={disabled}
            onChange={(v) =>
              setCat({
                ...cat,
                copy: { ...cat.copy, [k]: v } as Catalog["copy"],
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

// --- the editor -----------------------------------------------------------------------------------

const ERRORS: Record<string, [string, string]> = {
  CATALOG_INVALID: [
    "بيانات ناقصة أو غير صحيحة — راجع الحقل",
    "Missing or invalid data — check the field",
  ],
  CATALOG_HAS_PROBLEMS: [
    "لا يمكن النشر قبل حل المشكلات المذكورة",
    "Fix the listed problems before publishing",
  ],
  CATALOG_NO_DRAFT: [
    "لا توجد مسودة محفوظة للنشر",
    "There is no saved draft to publish",
  ],
  FORBIDDEN: [
    "ليست لديك صلاحية لهذا الإجراء",
    "You don't have permission for this",
  ],
  UNAUTHENTICATED: [
    "انتهت الجلسة، سجّل الدخول مرة أخرى",
    "Your session ended, sign in again",
  ],
};
/** "groups.2.tiers.0.price" → "Section 3 ← package 1 ← price" */
const friendlyPath = (p: string, cat: Catalog, AR: boolean) => {
  const m = /^groups\.(\d+)(?:\.tiers\.(\d+))?\.?(.*)$/.exec(p);
  if (m) {
    const g = cat.groups[Number(m[1])];
    const t = m[2] !== undefined ? g?.tiers[Number(m[2])] : null;
    return [
      g ? (AR ? g.title.ar : g.title.en) : `#${Number(m[1]) + 1}`,
      t ? (AR ? t.name.ar : t.name.en) : null,
      m[3] || null,
    ]
      .filter(Boolean)
      .join(" ← ");
  }
  const o = /^offers\.(\d+)\.?(.*)$/.exec(p);
  if (o)
    return [
      cat.offers[Number(o[1])]
        ? AR
          ? cat.offers[Number(o[1])].name.ar
          : cat.offers[Number(o[1])].name.en
        : `#${Number(o[1]) + 1}`,
      o[2] || null,
    ]
      .filter(Boolean)
      .join(" ← ");
  return p;
};

export function OffersEditor({
  locale,
  initial,
  state,
  canEdit,
  canPublish,
  services,
  me,
}: {
  locale: "ar" | "en";
  initial: Catalog;
  state: State;
  canEdit: boolean;
  canPublish: boolean;
  services: Opt[];
  me: string;
}) {
  const AR = locale === "ar";
  const x = (ar: string, en: string) => (AR ? ar : en);
  const router = useRouter();
  const [cat, setCatRaw] = useState<Catalog>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"groups" | "offers" | "copy" | "publish">(
    "groups",
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState(state.problems);
  const [notes, setNotes] = useState(state.notes);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const disabled = !canEdit;
  const setCat = (c: Catalog) => {
    setCatRaw(c);
    setDirty(true);
    setMsg(null);
  };
  // a fresh server state (after save / publish / restore) replaces the local copy
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCatRaw(initial);
    setProblems(state.problems);
    setNotes(state.notes);
    setDirty(false);
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const fail = (r: { error: string; field?: Record<string, string> }) => {
    const e = ERRORS[r.error];
    const where = r.field?._detail
      ? ` (${friendlyPath(r.field._detail, cat, AR)})`
      : "";
    setMsg({ ok: false, text: `${e ? x(...e) : r.error}${where}` });
  };
  const save = (then?: () => void) =>
    start(async () => {
      const r = await saveCatalogAction(cat);
      if (!r.ok) return fail(r);
      setDirty(false);
      setProblems(r.data?.problems ?? []);
      setNotes(r.data?.notes ?? []);
      setMsg({
        ok: true,
        text: x(
          "تم حفظ المسودة. الزوار ما زالوا يرون النسخة المنشورة.",
          "Draft saved. Visitors still see the published version.",
        ),
      });
      router.refresh();
      then?.();
    });

  const tabs: {
    key: typeof tab;
    label: string;
    icon: IconName;
    count?: number;
  }[] = [
    {
      key: "groups",
      label: x("الأقسام والباقات", "Sections & packages"),
      icon: "Layers",
      count: cat.groups.reduce((s, g) => s + g.tiers.length, 0),
    },
    {
      key: "offers",
      label: x("العروض", "Offers"),
      icon: "Tag",
      count: cat.offers.length,
    },
    { key: "copy", label: x("نصوص الصفحة", "Page texts"), icon: "FileText" },
    {
      key: "publish",
      label: x("النشر والسجل", "Publish & history"),
      icon: "CloudUpload",
      count: problems.length || undefined,
    },
  ];

  return (
    <LangCtx.Provider value={AR}>
      <div className="grid gap-4">
        {/* status + actions, always in view */}
        <div className="os-card sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 p-3 shadow-sm">
          <div className="grid gap-0.5 text-xs text-os-muted">
            <span>
              {state.live
                ? x(
                    `المنشور الآن: النسخة ${state.live.version}${state.live.publishedBy ? ` — ${state.live.publishedBy}` : ""}`,
                    `Live: version ${state.live.version}${state.live.publishedBy ? ` — ${state.live.publishedBy}` : ""}`,
                  )
                : x(
                    "المنشور الآن: النسخة الأصلية المدمجة في الموقع",
                    "Live: the original built-in catalog",
                  )}
            </span>
            <span className={dirty ? "font-semibold text-warning" : ""}>
              {dirty
                ? x("لديك تعديلات غير محفوظة", "You have unsaved changes")
                : state.hasDraft
                  ? x(
                      "توجد مسودة محفوظة لم تُنشر",
                      "A saved draft is waiting to be published",
                    )
                  : x(
                      "لا توجد مسودة — التعديل يبدأ من النسخة المنشورة",
                      "No draft — editing starts from the live version",
                    )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                className="os-btn-primary"
                disabled={pending || !dirty}
                onClick={() => save()}
              >
                {pending ? (
                  <Icon name="Timer" size={15} className="animate-spin" />
                ) : (
                  <Icon name="Check" size={15} />
                )}{" "}
                {x("حفظ المسودة", "Save draft")}
              </button>
            )}
            <a
              className={`os-btn-secondary ${!state.hasDraft && !dirty ? "pointer-events-none opacity-50" : ""}`}
              href="/offers?preview=draft"
              target="_blank"
              rel="noreferrer"
              onClick={(e) =>
                dirty &&
                (e.preventDefault(),
                save(() => window.open("/offers?preview=draft", "_blank")))
              }
            >
              <Icon name="ExternalLink" size={15} />{" "}
              {x("معاينة المسودة", "Preview draft")}
            </a>
            <a
              className="os-btn-ghost"
              href="/offers"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="Globe" size={15} />{" "}
              {x("الصفحة المنشورة", "Live page")}
            </a>
          </div>
        </div>
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
          >
            {msg.text}
          </p>
        )}
        {disabled && (
          <p className="rounded-lg bg-os-raised px-3 py-2 text-sm text-os-muted">
            {x(
              "عرض فقط — ليست لديك صلاحية التعديل.",
              "View only — you can't edit.",
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-1 border-b border-os-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}
            >
              <Icon name={t.icon} size={15} /> {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-[11px] ${t.key === "publish" ? "bg-danger/15 text-danger" : "bg-os-raised text-os-muted"}`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "groups" && (
          <GroupsTab
            cat={cat}
            setCat={setCat}
            services={services}
            disabled={disabled}
          />
        )}
        {tab === "offers" && (
          <OffersTab
            cat={cat}
            setCat={setCat}
            services={services}
            disabled={disabled}
            userName={me}
          />
        )}
        {tab === "copy" && (
          <CopyTab cat={cat} setCat={setCat} disabled={disabled} />
        )}
        {tab === "publish" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="os-card grid content-start gap-3 p-4">
              <h2 className="text-base font-semibold">
                {x("قبل النشر", "Before publishing")}
              </h2>
              {dirty && (
                <p className="text-sm text-warning">
                  {x(
                    "احفظ المسودة أولاً لتحديث الفحص.",
                    "Save the draft first to refresh the check.",
                  )}
                </p>
              )}
              {problems.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <Icon name="CircleCheck" size={16} />{" "}
                  {x(
                    "لا توجد تعارضات — المسودة جاهزة للنشر.",
                    "No contradictions — the draft is ready to publish.",
                  )}
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {problems.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      <b>{p.where}:</b> {AR ? p.ar : p.en}
                    </li>
                  ))}
                </ul>
              )}
              {notes.length > 0 && (
                <ul className="grid gap-1.5">
                  {notes.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
                    >
                      <b>{p.where}:</b> {AR ? p.ar : p.en}
                    </li>
                  ))}
                </ul>
              )}
              {canPublish ? (
                <div className="grid gap-2 border-t border-os-line pt-3">
                  <Label
                    text={x(
                      "ملاحظة على هذه النسخة (اختياري)",
                      "Note for this version (optional)",
                    )}
                  >
                    <input
                      className="os-input"
                      value={note}
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={x(
                        "مثال: عروض ديسمبر",
                        "e.g. December offers",
                      )}
                    />
                  </Label>
                  <button
                    type="button"
                    className="os-btn-primary w-fit"
                    disabled={
                      pending || dirty || !state.hasDraft || problems.length > 0
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          x(
                            "نشر المسودة؟ ستظهر للزوار فوراً.",
                            "Publish the draft? Visitors will see it right away.",
                          ),
                        )
                      )
                        return;
                      start(async () => {
                        const r = await publishCatalogAction(note);
                        if (!r.ok) return fail(r);
                        setNote("");
                        setMsg({
                          ok: true,
                          text: x(
                            `تم النشر (النسخة ${r.data?.version}). الصفحة تتحدث للزوار خلال 30 ثانية.`,
                            `Published (version ${r.data?.version}). Visitors see it within 30 seconds.`,
                          ),
                        });
                        router.refresh();
                      });
                    }}
                  >
                    <Icon name="CloudUpload" size={15} />{" "}
                    {x("نشر للزوار", "Publish to visitors")}
                  </button>
                </div>
              ) : (
                <p className="border-t border-os-line pt-3 text-sm text-os-muted">
                  {x(
                    "النشر للمدير التنفيذي أو المدير العام. احفظ المسودة وأبلغهم لمراجعتها.",
                    "Publishing is for the CEO or general manager. Save the draft and ask them to review it.",
                  )}
                </p>
              )}
              {canEdit && state.hasDraft && (
                <button
                  type="button"
                  className="os-btn-ghost w-fit text-danger"
                  disabled={pending}
                  onClick={() =>
                    window.confirm(
                      x(
                        "تجاهل المسودة والرجوع للنسخة المنشورة؟",
                        "Discard the draft and go back to the live version?",
                      ),
                    ) &&
                    start(async () => {
                      const r = await discardCatalogAction();
                      if (!r.ok) return fail(r);
                      setMsg({
                        ok: true,
                        text: x("تم تجاهل المسودة.", "Draft discarded."),
                      });
                      router.refresh();
                    })
                  }
                >
                  <Icon name="RotateCcw" size={15} />{" "}
                  {x("تجاهل المسودة", "Discard draft")}
                </button>
              )}
            </div>
            <div className="os-card grid content-start gap-3 p-4">
              <h2 className="text-base font-semibold">
                {x("سجل النسخ المنشورة", "Published versions")}
              </h2>
              {state.history.length === 0 && (
                <p className="text-sm text-os-muted">
                  {x(
                    "لم يُنشر شيء من لوحة التحكم بعد — الموقع يعرض النسخة الأصلية.",
                    "Nothing published from the dashboard yet — the site shows the original catalog.",
                  )}
                </p>
              )}
              <ul className="divide-y divide-os-line">
                {state.history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="grid">
                      <span className="font-medium">
                        {x("النسخة", "Version")} {h.version}{" "}
                        {h.live && (
                          <span className="ms-1 rounded-full bg-success/15 px-2 text-[11px] text-success">
                            {x("المنشورة", "Live")}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-os-muted">
                        {h.publishedAt
                          ? new Date(h.publishedAt).toLocaleString(
                              AR ? "ar-SA-u-nu-latn" : "en-GB",
                            )
                          : ""}{" "}
                        {h.publishedBy ? `— ${h.publishedBy}` : ""}{" "}
                        {h.note ? `· ${h.note}` : ""}
                      </span>
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        className="os-btn-ghost h-8 text-xs"
                        disabled={pending}
                        onClick={() =>
                          window.confirm(
                            x(
                              "نسخ هذه النسخة إلى المسودة؟ (تستبدل المسودة الحالية)",
                              "Copy this version into the draft? (replaces the current draft)",
                            ),
                          ) &&
                          start(async () => {
                            const r = await restoreCatalogAction(h.id);
                            if (!r.ok) return fail(r);
                            setMsg({
                              ok: true,
                              text: x(
                                "تم نسخها إلى المسودة — راجعها ثم انشرها.",
                                "Copied into the draft — review it, then publish.",
                              ),
                            });
                            router.refresh();
                          })
                        }
                      >
                        <Icon name="RotateCcw" size={14} />{" "}
                        {x("استرجاع", "Restore")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <button
                  type="button"
                  className="os-btn-ghost w-fit text-xs"
                  disabled={pending}
                  onClick={() =>
                    window.confirm(
                      x(
                        "نسخ النسخة الأصلية المدمجة في الموقع إلى المسودة؟",
                        "Copy the original built-in catalog into the draft?",
                      ),
                    ) &&
                    start(async () => {
                      const r = await restoreCatalogAction("builtin");
                      if (!r.ok) return fail(r);
                      setMsg({
                        ok: true,
                        text: x(
                          "تم نسخ النسخة الأصلية إلى المسودة.",
                          "The original catalog was copied into the draft.",
                        ),
                      });
                      router.refresh();
                    })
                  }
                >
                  <Icon name="RotateCcw" size={14} />{" "}
                  {x("البدء من النسخة الأصلية", "Start from the original")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </LangCtx.Provider>
  );
}
