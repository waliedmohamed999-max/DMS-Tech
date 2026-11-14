"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";

/** Labels kept here (inline Arabic / English) so the shared message files stay untouched. */
const T = {
  ar: {
    title: "قدّم على الوظيفة الآن",
    titleGeneral: "أرسل سيرتك الذاتية",
    sub: "املأ البيانات وأرفق سيرتك الذاتية — يصل طلبك مباشرة لفريق التوظيف، ونرد عليك بعد المراجعة.",
    role: "الوظيفة",
    general: "تقديم عام (بدون وظيفة محددة)",
    name: "الاسم الكامل",
    namePh: "الاسم الأول واسم العائلة",
    email: "البريد الإلكتروني",
    phone: "رقم الجوال",
    phonePh: "05xxxxxxxx",
    city: "المدينة",
    cityPh: "مثال: الرياض",
    experience: "سنوات الخبرة",
    linkedin: "رابط LinkedIn (اختياري)",
    portfolio: "رابط معرض الأعمال أو GitHub (اختياري)",
    notice: "مدة الإشعار بالأيام (اختياري)",
    noticePh: "مثال: 30",
    salary: "الراتب الشهري المتوقع بالريال (اختياري)",
    message: "نبذة عنك ولماذا تناسبك الوظيفة (اختياري)",
    cv: "السيرة الذاتية",
    cvHint: "PDF أو Word — حتى 5 ميجابايت",
    cvPick: "اختر الملف",
    consent: "أوافق على حفظ بياناتي واستخدامها لأغراض التوظيف في DMS Tech فقط.",
    send: "إرسال الطلب",
    sending: "جارٍ الإرسال…",
    success: "وصلنا طلبك بنجاح",
    successText: "شكراً لاهتمامك بالانضمام إلى DMS Tech. سيراجع فريق التوظيف طلبك ونتواصل معك إذا كانت خبرتك مناسبة.",
    again: "إرسال طلب آخر",
    required: "هذا الحقل مطلوب",
    errors: {
      name: "اكتب اسمك الكامل.",
      email: "اكتب بريداً إلكترونياً صحيحاً.",
      phone: "اكتب رقم جوال صحيحاً.",
      linkedinUrl: "رابط LinkedIn يجب أن يبدأ بـ https://",
      portfolioUrl: "رابط الأعمال يجب أن يبدأ بـ https://",
      experienceYears: "سنوات الخبرة رقم من 0 إلى 50.",
      noticePeriodDays: "مدة الإشعار رقم من 0 إلى 365.",
      salaryExpectation: "الراتب المتوقع أرقام فقط.",
      consent: "الموافقة على استخدام البيانات مطلوبة.",
      CV_REQUIRED: "أرفق سيرتك الذاتية.",
      CV_TYPE: "السيرة الذاتية يجب أن تكون PDF أو Word (docx).",
      CV_TOO_LARGE: "حجم الملف أكبر من 5 ميجابايت.",
      CV_EMPTY: "الملف فارغ.",
      FILE_CONTENT_MISMATCH: "محتوى الملف لا يطابق نوعه — احفظه من جديد PDF وحاول مرة أخرى.",
      FILE_TYPE_MISMATCH: "نوع الملف غير صحيح — استخدم PDF أو Word.",
      FILE_REJECTED_BY_SCANNER: "رُفض الملف لأسباب أمنية.",
      rate_limited: "أرسلت عدة طلبات خلال وقت قصير — حاول بعد قليل.",
      too_large: "حجم الطلب كبير — قلّل حجم الملف.",
      server: "تعذّر الإرسال الآن. حاول مرة أخرى بعد قليل."
    } as Record<string, string>
  },
  en: {
    title: "Apply for this role",
    titleGeneral: "Send us your CV",
    sub: "Fill in your details and attach your CV — it goes straight to our hiring team, and we reply after review.",
    role: "Role",
    general: "Open application (no specific role)",
    name: "Full name",
    namePh: "First and last name",
    email: "E-mail",
    phone: "Mobile number",
    phonePh: "+9665xxxxxxxx",
    city: "City",
    cityPh: "e.g. Riyadh",
    experience: "Years of experience",
    linkedin: "LinkedIn URL (optional)",
    portfolio: "Portfolio or GitHub URL (optional)",
    notice: "Notice period in days (optional)",
    noticePh: "e.g. 30",
    salary: "Expected monthly salary in SAR (optional)",
    message: "About you and why the role fits (optional)",
    cv: "CV",
    cvHint: "PDF or Word — up to 5 MB",
    cvPick: "Choose file",
    consent: "I agree that DMS Tech stores and uses my data for recruitment only.",
    send: "Send application",
    sending: "Sending…",
    success: "Application received",
    successText: "Thanks for your interest in joining DMS Tech. Our hiring team will review your application and contact you if your experience is a fit.",
    again: "Send another application",
    required: "Required",
    errors: {
      name: "Enter your full name.",
      email: "Enter a valid e-mail.",
      phone: "Enter a valid mobile number.",
      linkedinUrl: "The LinkedIn link must start with https://",
      portfolioUrl: "The portfolio link must start with https://",
      experienceYears: "Years of experience: 0 to 50.",
      noticePeriodDays: "Notice period: 0 to 365 days.",
      salaryExpectation: "Expected salary: digits only.",
      consent: "Please agree to the use of your data.",
      CV_REQUIRED: "Attach your CV.",
      CV_TYPE: "The CV must be a PDF or Word (docx) file.",
      CV_TOO_LARGE: "The file is larger than 5 MB.",
      CV_EMPTY: "The file is empty.",
      FILE_CONTENT_MISMATCH: "The file's content does not match its type — save it again as PDF and retry.",
      FILE_TYPE_MISMATCH: "Wrong file type — use PDF or Word.",
      FILE_REJECTED_BY_SCANNER: "The file was rejected for security reasons.",
      rate_limited: "Too many applications in a short time — please try again later.",
      too_large: "The request is too large — use a smaller file.",
      server: "Could not send right now. Please try again shortly."
    } as Record<string, string>
  }
};

const MAX = 5 * 1024 * 1024;
/** error codes that belong to the CV file field (client checks and the server's upload verdict) */
const isCv = (code: string) => code === "cv" || code.startsWith("CV_") || code.startsWith("FILE_");
type Role = { slug: string; title: string };

/**
 * The application form of the careers pages: posts multipart to /api/careers/apply, which saves the candidate in the
 * dashboard (recruitment) and e-mails the company inbox with the CV attached.
 */
export default function JobApplyForm({ locale, job, roles }: { locale: "ar" | "en"; job?: Role; roles?: Role[] }) {
  const t = T[locale];
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const cv = fd.get("cv");
    const missing: string[] = [];
    for (const k of ["name", "email", "phone"]) if (!String(fd.get(k) ?? "").trim()) missing.push(k);
    if (!(cv instanceof File) || !cv.size) missing.push("CV_REQUIRED");
    if (!fd.get("consent")) missing.push("consent");
    if (cv instanceof File && cv.size > MAX) missing.push("CV_TOO_LARGE");
    if (missing.length) {
      setBad(missing);
      setError(t.errors[missing[0]] ?? t.required);
      (form.elements.namedItem(isCv(missing[0]) ? "cv" : missing[0]) as HTMLElement | null)?.focus();
      return;
    }
    fd.set("elapsed", String(Date.now() - shownAt.current));
    fd.set("locale", locale);
    fd.set("page", window.location.pathname);
    setStatus("sending");
    setError("");
    setBad([]);
    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body: fd });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; issues?: string[]; cv?: string };
      if (res.ok && r.ok) {
        setStatus("done");
        form.reset();
        setFileName("");
        return;
      }
      // the CV verdict comes back as a code of its own: flag the file field with it
      const issues = [...(r.cv ? [r.cv] : []), ...(r.issues ?? [])];
      setBad(issues);
      setError(t.errors[r.cv ?? ""] ?? t.errors[issues[0] ?? ""] ?? t.errors[r.error ?? ""] ?? t.errors.server);
    } catch {
      setError(t.errors.server);
    }
    setStatus("idle");
  };

  if (status === "done") {
    return (
      <div id="apply" className="card grid scroll-mt-28 justify-items-center gap-4 border border-mist p-10 text-center shadow-lg">
        <span className="badge-icon size-16">
          <Icon name="CircleCheck" size={28} />
        </span>
        <p className="text-xl font-bold">{t.success}</p>
        <p className="max-w-md text-[15px] leading-relaxed text-iron">{t.successText}</p>
        <button type="button" className="btn btn-outline" onClick={() => setStatus("idle")}>
          {t.again}
        </button>
      </div>
    );
  }

  const cvError = bad.find(isCv);
  /** aria-invalid + aria-describedby for a control; its message is rendered by `message(k)` right under it */
  const flag = (k: string, hint?: string) => {
    const on = k === "cv" ? Boolean(cvError) : bad.includes(k);
    return { "aria-invalid": on ? true : undefined, "aria-describedby": [hint, on && `ja-${k}-error`].filter(Boolean).join(" ") || undefined } as const;
  };
  const message = (k: string) => {
    const code = k === "cv" ? cvError : bad.includes(k) ? k : undefined;
    return code ? (
      <p id={`ja-${k}-error`} className="text-[13px] font-medium text-red-700">
        {t.errors[code] ?? t.required}
      </p>
    ) : null;
  };
  const field = (k: string, label: string, input: React.ReactNode, full = false) => (
    <div className={`grid content-start gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <label htmlFor={`ja-${k}`} className="text-sm font-semibold text-iron">
        {label}
      </label>
      {input}
      {message(k)}
    </div>
  );

  return (
    <form
      id="apply"
      onSubmit={onSubmit}
      // a corrected field clears its own message and the summary at once
      onInput={(e) => {
        const name = (e.target as HTMLInputElement).name;
        if (bad.length) setBad(bad.filter((b) => (name === "cv" ? !isCv(b) : b !== name)));
        if (error) setError("");
      }}
      noValidate encType="multipart/form-data" className="card grid scroll-mt-28 gap-5 border border-mist p-6 shadow-lg sm:grid-cols-2 sm:p-10">
      <div className="grid gap-1 sm:col-span-2">
        <h2 className="text-2xl font-bold">{job ? t.title : t.titleGeneral}</h2>
        <p className="text-[15px] leading-relaxed text-iron">{t.sub}</p>
      </div>
      {job ? (
        <div className="flex items-center gap-3 rounded-2xl bg-lilac px-4 py-3 sm:col-span-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-iris text-white">
            <Icon name="Briefcase" size={17} />
          </span>
          <span className="grid">
            <span className="text-xs text-iris">{t.role}</span>
            <span className="font-bold text-ink">{job.title}</span>
          </span>
          <input type="hidden" name="job" value={job.slug} />
        </div>
      ) : (
        field(
          "job",
          t.role,
          <select id="ja-job" name="job" className="input" defaultValue="general">
            <option value="general">{t.general}</option>
            {(roles ?? []).map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.title}
              </option>
            ))}
          </select>,
          true
        )
      )}
      {field("name", `${t.name} *`, <input id="ja-name" name="name" className="input" required {...flag("name")} placeholder={t.namePh} autoComplete="name" maxLength={120} />)}
      {field("email", `${t.email} *`, <input id="ja-email" name="email" type="email" dir="ltr" className="input rtl:text-right" required {...flag("email")} autoComplete="email" maxLength={160} />)}
      {field("phone", `${t.phone} *`, <input id="ja-phone" name="phone" type="tel" dir="ltr" className="input rtl:text-right" required {...flag("phone")} placeholder={t.phonePh} autoComplete="tel" maxLength={20} />)}
      {field("city", t.city, <input id="ja-city" name="city" className="input" placeholder={t.cityPh} autoComplete="address-level2" maxLength={80} />)}
      {field("experienceYears", t.experience, <input id="ja-experienceYears" name="experienceYears" type="number" min={0} max={50} dir="ltr" className="input rtl:text-right" {...flag("experienceYears")} />)}
      {field("noticePeriodDays", t.notice, <input id="ja-noticePeriodDays" name="noticePeriodDays" type="number" min={0} max={365} dir="ltr" className="input rtl:text-right" {...flag("noticePeriodDays")} placeholder={t.noticePh} />)}
      {field("linkedinUrl", t.linkedin, <input id="ja-linkedinUrl" name="linkedinUrl" type="url" dir="ltr" className="input rtl:text-right" {...flag("linkedinUrl")} placeholder="https://linkedin.com/in/…" maxLength={300} />)}
      {field("portfolioUrl", t.portfolio, <input id="ja-portfolioUrl" name="portfolioUrl" type="url" dir="ltr" className="input rtl:text-right" {...flag("portfolioUrl")} placeholder="https://" maxLength={300} />)}
      {field("salaryExpectation", t.salary, <input id="ja-salaryExpectation" name="salaryExpectation" inputMode="numeric" dir="ltr" className="input rtl:text-right" {...flag("salaryExpectation")} maxLength={9} />, true)}
      {field("message", t.message, <textarea id="ja-message" name="message" className="input min-h-28 resize-y" maxLength={3000} />, true)}
      <div className="grid gap-2 sm:col-span-2">
        <span className="text-sm font-semibold text-iron">{t.cv} *</span>
        <label
          htmlFor="ja-cv"
          className={`flex cursor-pointer flex-wrap items-center gap-3 rounded-input border border-dashed bg-cloud px-4 py-4 transition hover:border-iris focus-within:border-iris focus-within:ring-4 focus-within:ring-iris/15 ${cvError ? "border-red-600" : "border-mist"}`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-iris shadow-sm">
            <Icon name="FileText" size={18} />
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-semibold text-ink">{fileName || t.cvPick}</span>
            <span id="ja-cv-hint" className="text-xs text-iron">{t.cvHint}</span>
          </span>
          <input id="ja-cv" name="cv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" required {...flag("cv", "ja-cv-hint")} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        {message("cv")}
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <label className="flex items-start gap-3 text-sm text-iron">
          <input type="checkbox" name="consent" value="true" className="mt-1 size-4 accent-[#624de3]" required {...flag("consent")} />
          {t.consent} *
        </label>
        {message("consent")}
      </div>
      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-3 sm:col-span-2">
        {error && (
          <p role="alert" className="rounded-input bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
            <Icon name="Send" size={17} /> {status === "sending" ? t.sending : t.send}
          </button>
        </div>
      </div>
    </form>
  );
}
