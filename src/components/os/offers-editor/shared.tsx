/** Shared types, helpers and form controls of the offers editor. */
import { createContext, useContext } from "react";
import { Icon, iconNames, type IconName } from "@/components/ui/Icon";
import { type L } from "@/content/types";

type Problem = { where: string; ar: string; en: string };
export type State = {
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
export type Opt = { value: string; label: string };

/** The dashboard's language for the editor's own words. */
export const LangCtx = createContext(true);
export const useT = () => {
  const AR = useContext(LangCtx);
  return { AR, x: (ar: string, en: string) => (AR ? ar : en) };
};

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const emptyL = (): L => ({ ar: "", en: "" });
export const today = () => new Date().toISOString().slice(0, 10);
export const plusDays = (d: string, n: number) =>
  new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** a link-safe key from any text: "Web Pro 2" → "web-pro-2" */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
export const uniqueKey = (base: string, taken: Set<string>) => {
  let k = slugify(base) || "item";
  for (let i = 2; taken.has(k); i++) k = `${slugify(base) || "item"}-${i}`;
  return k;
};
export const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};
export const money = (n: number | null, AR: boolean) =>
  n === null ? "—" : `${n.toLocaleString("en-US")} ${AR ? "ر.س" : "SAR"}`;

// --- small fields ---------------------------------------------------------------------------------

export function Label({
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
export function LField({
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
export function LList({
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

export function IconBtn({
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

export function IconPick({
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

export function Num({
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

export function Check({
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

export function Select({
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

export function Card({
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
