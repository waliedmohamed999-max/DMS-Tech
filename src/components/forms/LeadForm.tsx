"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/Brand";
import { site } from "@/content/site";
import { ATTRIBUTION_KEY, readAttribution } from "@/components/layout/AttributionCapture";
import { track } from "@/lib/track";

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
  offer?: { key: string; label: string; caption: string };
  /** extra questions for this offer (answers go to the CRM as details) */
  questions?: FormQuestion[];
}) {
  const t = useTranslations("form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
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
    if (!data.name?.trim() || (!data.phone?.trim() && !data.email?.trim())) return setError(t("required"));
    if ((data.phone && !phoneRe.test(data.phone)) || (data.email && !emailRe.test(data.email))) return setError(t("invalidContact"));

    setError("");
    setStatus("sending");
    const serviceTitle = services.find((s) => s.slug === data.service)?.title ?? data.service;
    setSummary(
      [`DMS Tech — ${offer?.label ?? serviceTitle}`, data.name, data.phone, data.email, data.company, data.message].filter(Boolean).join("\n")
    );
    try {
      await submitLead({ ...data, ...(Object.keys(details).length ? { details } : {}), source, locale, ...attribution(), elapsed: Date.now() - shownAt.current });
      setStatus("success");
      track("generate_lead", { form: source, offer: offer?.key, service: data.service }, `lead:${shownAt.current}`);
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
        <a href={waLink(summary)} target="_blank" rel="noopener noreferrer" className="btn btn-dark">
          <BrandIcon slug="whatsapp" size={18} /> {t("successWa")}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card grid gap-5 border border-mist p-6 shadow-lg sm:grid-cols-2 sm:p-10">
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
      <Field label={t("name")} htmlFor="lf-name">
        <input id="lf-name" name="name" className="input" placeholder={t("namePh")} autoComplete="name" required />
      </Field>
      <Field label={t("phone")} htmlFor="lf-phone">
        <input id="lf-phone" name="phone" type="tel" dir="ltr" className="input rtl:text-right" placeholder={t("phonePh")} autoComplete="tel" />
      </Field>
      <Field label={t("email")} htmlFor="lf-email">
        <input id="lf-email" name="email" type="email" dir="ltr" className="input rtl:text-right" placeholder={t("emailPh")} autoComplete="email" />
      </Field>
      <Field label={t("company")} htmlFor="lf-company">
        <input id="lf-company" name="company" className="input" placeholder={t("companyPh")} autoComplete="organization" />
      </Field>
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

function Field({ label, htmlFor, full, children }: { label: string; htmlFor: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-iron">
        {label}
      </label>
      {children}
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
    try {
      await submitLead({ [isEmail ? "email" : "phone"]: value, source, locale, ...attribution() });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const altLink = (
    <a
      href={waLink(locale === "ar" ? "مرحباً DMS Tech، أرغب في الحصول على عرض سعر." : "Hi DMS Tech, I'd like to get a quote.")}
      target="_blank"
      rel="noopener noreferrer"
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
