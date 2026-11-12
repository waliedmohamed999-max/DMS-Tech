import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { pageMetadata } from "@/lib/seo";
import { blogPostingLd, breadcrumbLd, jobPostingLd, organizationLd, serviceLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { jobs } from "@/content/careers";
import { OPEN_JOBS_POSTED_AT, openJobs } from "@/content/careers-open";
import { site } from "@/content/site";
import robots from "@/app/robots";

/** Per-page share previews, JSON-LD (facts from src/content only) and robots. */
describe("pageMetadata (share previews)", () => {
  it("sets the page's own title, description, canonical, Open Graph and Twitter card — stars stripped", () => {
    const m = pageMetadata({ locale: "ar", path: "/careers", title: "انضم إلى *فريق*", description: "نص", image: "/images/photos/careers-office.jpg" });
    expect(m.title).toBe("انضم إلى فريق");
    expect(m.alternates.canonical).toBe("/careers");
    expect(m.openGraph).toMatchObject({ title: "انضم إلى فريق", description: "نص", url: "/careers", locale: "ar_SA", alternateLocale: ["en_US"], siteName: site.name, type: "website" });
    expect(m.openGraph.images[0].url).toBe("/images/photos/careers-office.jpg");
    expect(m.twitter).toEqual({ card: "summary_large_image", title: "انضم إلى فريق", description: "نص", images: ["/images/photos/careers-office.jpg"] });
  });
  it("English pages: /en canonical and en_US; no image → the default share image", () => {
    const m = pageMetadata({ locale: "en", path: "/contact", title: "Contact" });
    expect(m.alternates.canonical).toBe("/en/contact");
    expect(m.openGraph.locale).toBe("en_US");
    expect(m.openGraph.images[0].url).toMatch(/^\/images\//);
  });
});

describe("JSON-LD", () => {
  it("is emitted exactly like /offers: a data block with < escaped", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: { name: "</script><b>" } }));
    expect(html).toBe('<script type="application/ld+json">{"name":"\\u003c/script>\\u003cb>"}</script>');
  });
  it("Organization uses only site.ts facts (no invented address)", () => {
    const o = organizationLd("ar", "d");
    expect(o).toMatchObject({ "@type": "Organization", name: site.name, email: site.email, telephone: `+${site.whatsapp}` });
    expect(o.identifier.value).toBe(site.crNumber);
    expect(o).not.toHaveProperty("address");
  });
  it("Service / BlogPosting / BreadcrumbList link back to the Organization with absolute URLs", () => {
    const s = serviceLd("en", { slug: "x", title: "T", description: "D", image: "/i.jpg" });
    expect(s.url).toBe(`${site.url}/en/services/x`);
    expect(s.image).toBe(`${site.url}/i.jpg`);
    const b = blogPostingLd("ar", { slug: "p", title: "T", excerpt: "E", image: "/i.jpg", date: "2026-09-20", category: "C" });
    expect(b).toMatchObject({ "@type": "BlogPosting", datePublished: "2026-09-20", url: `${site.url}/blog/p` });
    const c = breadcrumbLd("ar", [{ name: "الرئيسية", path: "/" }, { name: "x", path: "/blog" }]);
    expect(c.itemListElement[0]).toMatchObject({ position: 1, item: site.url });
  });
  it("JobPosting: open roles only, no salary, HTML-escaped description", () => {
    const labels = { about: "A", responsibilities: "R", requirements: "Q", niceToHave: "N" };
    const open = openJobs[0];
    const j = jobPostingLd("en", open, { datePosted: OPEN_JOBS_POSTED_AT, labels })!;
    expect(j).toMatchObject({ "@type": "JobPosting", title: open.title.en, datePosted: "2026-11-06", employmentType: "FULL_TIME", directApply: true });
    expect(j).not.toHaveProperty("baseSalary");
    expect(j.description).toContain("<ul><li>");
    const closed = jobs.find((x) => x.status === "closed")!;
    expect(jobPostingLd("en", closed, { labels })).toBeNull();
  });
});

describe("robots", () => {
  it("keeps crawlers out of the dashboard (/app) and the API", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toEqual(["/api/", "/app"]);
  });
});
