import { site } from "@/content/site";
import type { Job, L } from "@/content/types";

/**
 * schema.org JSON-LD for the public site. Only facts kept in src/content are used — no address, salary, opening
 * hours or ratings are published there, so none appear here (see the PR for the questions to the owner).
 */
const base = () => site.url.replace(/\/$/, "");
/** absolute public URL; Arabic is unprefixed, English lives under /en */
export const absUrl = (locale: string, path = "/") => {
  const p = path === "/" ? "" : path;
  return `${base()}${locale === "en" ? "/en" : ""}${p}`;
};
const abs = (src: string) => (/^https?:\/\//.test(src) ? src : `${base()}${src.startsWith("/") ? "" : "/"}${src}`);
export const organizationId = () => `${base()}/#organization`;
const inLanguage = (locale: string) => (locale === "en" ? "en" : "ar");
const ctx = "https://schema.org";

export function organizationLd(locale: string, description: string) {
  return {
    "@context": ctx,
    "@type": "Organization",
    "@id": organizationId(),
    name: site.name,
    url: absUrl(locale),
    logo: abs("/images/logo.png"),
    description,
    email: site.email,
    telephone: `+${site.whatsapp}`,
    identifier: { "@type": "PropertyValue", propertyID: site.crLabel.en, name: locale === "en" ? site.crLabel.en : site.crLabel.ar, value: site.crNumber },
    sameAs: Object.values(site.socials)
  };
}

export function breadcrumbLd(locale: string, items: { name: string; path: string }[]) {
  return {
    "@context": ctx,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(locale, it.path) }))
  };
}

export function serviceLd(locale: string, s: { slug: string; title: string; description: string; image: string; eyebrow?: string }) {
  return {
    "@context": ctx,
    "@type": "Service",
    name: s.title,
    description: s.description,
    ...(s.eyebrow ? { serviceType: s.eyebrow } : {}),
    url: absUrl(locale, `/services/${s.slug}`),
    image: abs(s.image),
    inLanguage: inLanguage(locale),
    provider: { "@id": organizationId() }
  };
}

export function blogPostingLd(locale: string, p: { slug: string; title: string; excerpt: string; image: string; date: string; category: string }) {
  const url = absUrl(locale, `/blog/${p.slug}`);
  return {
    "@context": ctx,
    "@type": "BlogPosting",
    headline: p.title,
    description: p.excerpt,
    image: [abs(p.image)],
    datePublished: p.date,
    articleSection: p.category,
    inLanguage: inLanguage(locale),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", "@id": organizationId(), name: site.name, url: base() },
    publisher: { "@id": organizationId() }
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = (l: L, locale: string) => (locale === "en" ? l.en : l.ar);
const EMPLOYMENT: Record<string, string> = { "full-time": "FULL_TIME", "part-time": "PART_TIME", contract: "CONTRACTOR", internship: "INTERN", temporary: "TEMPORARY" };

/**
 * A job page's JobPosting — open roles only (a closed role keeps its page for old links but is not a posting).
 * Salary is not published (agreed at the offer stage) and the company address is not in the content, so
 * baseSalary / streetAddress are left out; the location is the country, plus "remote" where the role says so.
 */
export function jobPostingLd(
  locale: string,
  job: Job,
  opts: { datePosted?: string; labels: { about: string; responsibilities: string; requirements: string; niceToHave: string } }
) {
  if (job.status === "closed") return null;
  const list = (title: string, items: L[]) => (items.length ? `<h3>${esc(title)}</h3><ul>${items.map((i) => `<li>${esc(pick(i, locale))}</li>`).join("")}</ul>` : "");
  const description =
    `<h3>${esc(opts.labels.about)}</h3><p>${esc(pick(job.about, locale))}</p>` +
    list(opts.labels.responsibilities, job.responsibilities) +
    list(opts.labels.requirements, job.requirements) +
    list(opts.labels.niceToHave, job.niceToHave);
  const remote = /remote/i.test(job.location.en);
  const saudi = /saudi/i.test(job.location.en);
  const employmentType = EMPLOYMENT[job.type.en.trim().toLowerCase()];
  const years = /^(\d+)\+?\s*years?$/i.exec(job.experience.en.trim());
  return {
    "@context": ctx,
    "@type": "JobPosting",
    title: pick(job.title, locale),
    description,
    ...(opts.datePosted ? { datePosted: opts.datePosted } : {}),
    ...(employmentType ? { employmentType } : {}),
    hiringOrganization: { "@type": "Organization", "@id": organizationId(), name: site.name, sameAs: base(), logo: abs("/images/logo.png") },
    ...(saudi ? { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "SA" } } } : {}),
    ...(remote ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "Saudi Arabia" } } : {}),
    ...(years ? { experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: Number(years[1]) * 12 } } : {}),
    ...(job.skills.length ? { skills: job.skills.join(", ") } : {}),
    ...(job.openings && job.openings > 1 ? { totalJobOpenings: job.openings } : {}),
    occupationalCategory: pick(job.team, locale),
    directApply: true,
    inLanguage: inLanguage(locale),
    url: absUrl(locale, `/careers/${job.slug}`)
  };
}
