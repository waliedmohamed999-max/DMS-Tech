import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/ui/Icon";

// ---------------------------------------------------------------------------
// Formatting — Latin digits in both languages so figures and tables stay readable
// ---------------------------------------------------------------------------

const tag = (locale: string) => (locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");
export const fmtNumber = (n: number, locale: string, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag(locale), opts).format(n);
export const fmtMoney = (n: number, locale: string, currency = "SAR") =>
  new Intl.NumberFormat(tag(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
export const fmtDate = (d: Date | string, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  new Intl.DateTimeFormat(tag(locale), { timeZone: "Asia/Riyadh", ...opts }).format(new Date(d));
export const fmtDateTime = (d: Date | string, locale: string) => fmtDate(d, locale, { dateStyle: "medium", timeStyle: "short" });
export function fmtRelative(d: Date | string, locale: string, now = Date.now()) {
  const diff = (new Date(d).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(d, locale);
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: React.ReactNode; icon?: IconName }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-9 place-items-center rounded-lg border border-os-line bg-os-surface text-os-muted">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.3px] text-os-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-os-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = "Inbox", title, text, action }: { icon?: IconName; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-os-line bg-os-raised text-os-muted">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-semibold text-os-text">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-os-muted">{text}</p>
      {action}
    </div>
  );
}

export async function PermissionDenied({ permission }: { permission: string }) {
  const t = await getTranslations("os.denied");
  return (
    <div className="os-card mx-auto mt-10 max-w-lg">
      <EmptyState
        icon="ShieldCheck"
        title={t("title")}
        text={t("text", { permission })}
        action={
          <Link href="/app" className="os-btn-secondary mt-2">
            {t("home")}
          </Link>
        }
      />
    </div>
  );
}

const TONES = {
  neutral: "border-os-line-strong bg-os-raised text-os-muted",
  iris: "border-iris/40 bg-iris/15 text-iris-light",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  gold: "border-gold/30 bg-gold/10 text-gold"
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium ${TONES[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const priorityTone = (p: string): Tone => (p === "URGENT" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral");
export const statusTone = (s: string): Tone =>
  ({ ACTIVE: "success", APPROVED: "success", PROCESSED: "success", PENDING: "warning", INVITED: "info", DISABLED: "neutral", REJECTED: "danger", FAILED: "danger", CANCELLED: "neutral" })[s] as Tone ?? "neutral";

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${h} 45% 38%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Server-rendered pagination that preserves the current query string. */
export async function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const t = await getTranslations("os.common");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(p));
    return `${basePath}?${q}`;
  };
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-os-line px-4 py-3 text-xs text-os-muted">
      <span className="tabular">{t("showing", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className="os-btn-secondary h-8 px-2.5 text-xs">
            {t("prev")}
          </Link>
        ) : (
          <span className="os-btn-secondary pointer-events-none h-8 px-2.5 text-xs opacity-40">{t("prev")}</span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className="os-btn-secondary h-8 px-2.5 text-xs">
            {t("next")}
          </Link>
        ) : (
          <span className="os-btn-secondary pointer-events-none h-8 px-2.5 text-xs opacity-40">{t("next")}</span>
        )}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-os-raised ${className}`} />;
}

export function SectionCard({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`os-card overflow-hidden ${className}`}>
      <header className="flex h-12 items-center justify-between gap-3 border-b border-os-line px-4">
        <h2 className="text-sm font-semibold text-os-text">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Next 16: searchParams arrive as a Promise of string | string[] values. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
