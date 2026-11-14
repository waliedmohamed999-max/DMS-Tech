"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import { site } from "@/content/site";
import { ATTRIBUTION_KEY, readAttribution } from "@/components/layout/AttributionCapture";
import { newEventId, track } from "@/lib/track";

type Status = "idle" | "sending" | "success" | "error";

// single source of truth for the company number (src/content/site.ts)
const WHATSAPP = site.whatsapp;
const phoneRe = /^\+?[0-9\s-]{8,16}$/;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// budget option values sent to the CRM (labels come from the message files, same order)
const BUDGET_KEYS = ["undecided", "lt-10k", "10k-30k", "30k-100k", "gt-100k"];

/**
 * Attribution sent with every submission: the campaign of this URL, or the one the visit started from (utm_* and ad
 * click ids, kept in session storage by AttributionCapture), plus referrer and page. No cookies.
 */
function attribution() {
  if (typeof window === "undefined") return {};
  let utm: Record<string, string> = readAttribution(window.location.search);
  if (!Object.keys(utm).length) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) ?? "{}") as Record<string, string>;
      utm = Object.fromEntries(Object.entries(stored).filter(([k]) => k !== "landing"));
    } catch {}
  }
  return { utm, referrer: document.referrer.slice(0, 300), page: window.location.pathname.slice(0, 200) };
}

type FieldErrors = Partial<Record<"name" | "phone" | "email", string>>;
const ids = (...list: (string | false | undefined)[]) => list.filter(Boolean).join(" ") || undefined;

export type FormQuestion = { key: string; label: string; options?: string[]; placeholder?: string };

async function submitLead(payload: Record<string, unknown>) {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(String(res.status));
}

const waLink = (text: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

/** Full quote / contact form. `offer` (offers pages) shows the chosen package / offer and sends its key. */
export function LeadForm({
  services,
  defaultService,
  source = "quote",
  offer,
  questions = []
}: {
  services: { slug: string; title: string }[];
  defaultService?: string;
  source?: "quote" | "contact" | "career" | "offer";
  /** `value`: the package's SAR price before VAT when known (sent as the generate_lead value) */
  offer?: { key: string; label: string; caption: string; value?: number };
  /** extra questions for this offer (answers go to the CRM as details) */
  questions?: FormQuestion[];
}) {
  const t = useTranslations("form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState("");
  const budgets = t("budgetOptions").split("|");
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const all = Object.fromEntries(new FormData(form)) as Record<string, string>;
    // q_<key> fields answer the offer page questions; everything else is the standard form
    const details = Object.fromEntries(Object.entries(all).filter(([k, v]) => k.startsWith("q_") && v.trim()).map(([k, v]) => [k.slice(2), v.trim()]));
    const data = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith("q_")));
    // the summary alert keeps its wording; each failing field also gets its own message and aria-invalid
    const noContact = !data.phone?.trim() && !data.email?.trim();
    const missing: FieldErrors = {
      ...(data.name?.trim() ? {} : { name: t("nameRequired") }),
      ...(noContact ? { phone: t("contactRequired"), email: t("contactRequired") } : {})
    };
    const invalid: FieldErrors = {
      ...(data.phone && !phoneRe.test(data.phone) ? { phone: t("invalidPhone") } : {}),
      ...(data.email && !emailRe.test(data.email) ? { email: t("invalidEmail") } : {})
    };
    const failed = Object.keys(missing).length ? missing : invalid;
    const first = (["name", "phone", "email"] as const).find((k) => failed[k]);
    if (first) {
      setFieldErrors(failed);
      setError(t(failed === missing ? "required" : "invalidContact"));
      (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }

    setFieldErrors({});
    setError("");
    setStatus("sending");
    const serviceTitle = services.find((s) => s.slug === data.service)?.title ?? data.service;
    setSummary(
      [`DMS Tech — ${offer?.label ?? serviceTitle}`, data.name, data.phone, data.email, data.company, data.message].filter(Boolean).join("\n")
    );
    // one id for this request: the dataLayer event and the CRM lead (captureMeta.eventId) carry the same value
    const eventId = newEventId();
    try {
      await submitLead({ ...data, ...(Object.keys(details).length ? { details } : {}), source, locale, ...attribution(), elapsed: Date.now() - shownAt.current, eventId });
      setStatus("success");
      const value = offer?.value && offer.value > 0 ? offer.value : undefined;
      track("generate_lead", { form: source, offer: offer?.key, service: data.service, event_id: eventId, value, currency: value ? "SAR" : undefined }, `lead:${shownAt.current}`);
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="card grid justify-items-center gap-5 border border-mist p-10 text-center shadow-lg">
        <span className="badge-icon size-16">
          <Icon name="CircleCheck" size={30} />
        </span>
        <p className="text-xl font-bold">{t("success")}</p>
        <a href={waLink(summary)} target="_blank" rel="noopener noreferrer" className="btn btn-dark" data-track-cta="lead_success_whatsapp" data-track-offer={offer?.key}>
          <BrandIcon slug="whatsapp" size={18} /> {t("successWa")}
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      // editing a flagged field clears its message (phone and email share the "one of them" rule)
      onInput={(e) => {
        const name = (e.target as HTMLInputElement).name;
        if (name !== "name" && name !== "phone" && name !== "email") return;
        setFieldErrors((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          if (name !== "name" && prev.phone === prev.email) {
            delete next.phone;
            delete next.email;
          }
          return next;
        });
      }}
      noValidate
      className="card grid gap-5 border border-mist p-6 shadow-lg sm:grid-cols-2 sm:p-10">
      {offer && (
        <div className="flex items-center gap-3 rounded-2xl bg-lilac px-4 py-3 sm:col-span-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-iris text-white">
            <Icon name="BadgeCheck" size={18} />
          </span>
          <span className="grid">
            <span className="text-xs text-iris">{offer.caption}</span>
            <span className="font-bold text-ink">{offer.label}</span>
          </span>
          <input type="hidden" name="offer" value={offer.key} />
        </div>
      )}
      <Field label={`${t("name")} *`} htmlFor="lf-name" error={fieldErrors.name}>
        <input
          id="lf-name"
          name="name"
          className="input"
          placeholder={t("namePh")}
          autoComplete="name"
          required
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={ids(fieldErrors.name && "lf-name-error")}
        />
      </Field>
      <Field label={t("company")} htmlFor="lf-company">
        <input id="lf-company" name="company" className="input" placeholder={t("companyPh")} autoComplete="organization" />
      </Field>
      <Field label={t("phone")} htmlFor="lf-phone" error={fieldErrors.phone}>
        <input
          id="lf-phone"
          name="phone"
          type="tel"
          dir="ltr"
          className="input rtl:text-right"
          placeholder={t("phonePh")}
          autoComplete="tel"
          aria-invalid={fieldErrors.phone ? true : undefined}
          aria-describedby={ids("lf-contact-hint", fieldErrors.phone && "lf-phone-error")}
        />
      </Field>
      <Field label={t("email")} htmlFor="lf-email" error={fieldErrors.email}>
        <input
          id="lf-email"
          name="email"
          type="email"
          dir="ltr"
          className="input rtl:text-right"
          placeholder={t("emailPh")}
          autoComplete="email"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={ids("lf-contact-hint", fieldErrors.email && "lf-email-error")}
        />
      </Field>
      <p id="lf-contact-hint" className="-mt-2 text-[13px] text-iron sm:col-span-2">
        {t("contactHint")}
      </p>
      <Field label={t("service")} htmlFor="lf-service">
        <select id="lf-service" name="service" className="input" defaultValue={defaultService ?? services[0]?.slug}>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title}
            </option>
          ))}
          <option value="other">{t("serviceOther")}</option>
        </select>
      </Field>
      <Field label={t("budget")} htmlFor="lf-budget">
        <select id="lf-budget" name="budget" className="input">
          {budgets.map((b, i) => (
            <option key={b} value={BUDGET_KEYS[i] ?? "undecided"}>
              {b}
            </option>
          ))}
        </select>
      </Field>
      {questions.map((q) => (
        <Field key={q.key} label={q.label} htmlFor={`lf-q-${q.key}`}>
          {q.options ? (
            <select id={`lf-q-${q.key}`} name={`q_${q.key}`} className="input" defaultValue="">
              <option value="">—</option>
              {q.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input id={`lf-q-${q.key}`} name={`q_${q.key}`} className="input" placeholder={q.placeholder} maxLength={200} />
          )}
        </Field>
      ))}
      <Field label={t("message")} htmlFor="lf-message" full>
        <textarea id="lf-message" name="message" className="input min-h-32 resize-y" placeholder={t("messagePh")} />
      </Field>
      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid gap-3 sm:col-span-2">
        {(error || status === "error") && (
          <p role="alert" className="rounded-input bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || t("error")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
            {status === "sending" ? t("sending") : t("submit")}
            <Icon name={locale === "ar" ? "ArrowLeft" : "ArrowRight"} size={18} />
          </button>
          <p className="text-[13px] text-iron">{t("privacy")}</p>
        </div>
      </div>
    </form>
  );
}

/** `error` renders under the control as `<htmlFor>-error`; the control points at it with aria-describedby. */
function Field({ label, htmlFor, full, error, children }: { label: string; htmlFor: string; full?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className={`grid content-start gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-iron">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Wrike-style inline "email + button" capture used in the hero and final CTA */
export function QuickLead({
  placeholder,
  button,
  alt,
  source,
  dark = false
}: {
  placeholder: string;
  button: string;
  alt: string;
  source: "hero" | "cta";
  dark?: boolean;
}) {
  const t = useTranslations("form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("contact") ?? "").trim();
    const isEmail = emailRe.test(value);
    if (!isEmail && !phoneRe.test(value)) return setError(t("invalidContact"));
    setError("");
    setStatus("sending");
    const eventId = newEventId();
    try {
      await submitLead({ [isEmail ? "email" : "phone"]: value, source, locale, ...attribution(), eventId });
      setStatus("success");
      track("generate_lead", { form: source, event_id: eventId }, `lead:${eventId}`);
    } catch {
      setStatus("error");
    }
  }

  const altLink = (
    <a
      href={waLink(locale === "ar" ? "مرحباً DMS Tech، أرغب في الحصول على عرض سعر." : "Hi DMS Tech, I'd like to get a quote.")}
      target="_blank"
      rel="noopener noreferrer"
      data-track-cta="quick_lead_whatsapp"
      className={`inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline ${dark ? "text-[#c4c6c8]" : "text-iron"}`}
    >
      <BrandIcon slug="whatsapp" size={16} /> {alt}
    </a>
  );

  if (status === "success") {
    return (
      <div className="grid gap-3">
        <p className={`inline-flex items-center gap-2 font-semibold ${dark ? "text-white" : "text-ink"}`}>
          <Icon name="CircleCheck" className="text-iris" /> {t("success")}
        </p>
        {altLink}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-[540px] gap-3">
      <form onSubmit={onSubmit} noValidate className={`flex flex-col gap-2 rounded-xl bg-white p-1.5 sm:flex-row ${dark ? "" : "border border-mist"}`}>
        <input name="contact" aria-label={placeholder} placeholder={placeholder} className="min-w-0 flex-1 rounded-input bg-white px-3.5 py-3 text-[15px] text-ink placeholder:text-[#8d8e8f] focus:outline-none" />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button type="submit" disabled={status === "sending"} className="btn btn-dark !rounded-input">
          {status === "sending" ? t("sending") : button}
        </button>
      </form>
      {(error || status === "error") && <p role="alert" className="text-sm text-red-400">{error || t("error")}</p>}
      {altLink}
    </div>
  );
}
