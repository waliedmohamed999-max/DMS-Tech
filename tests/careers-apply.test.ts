import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import "@/server";
import { applicationSchema, captureJobApplication, cvProblem } from "@/server/hr/careers-intake";
import { buildCareersMail } from "@/server/notify/careers-mail";
import { documentsFor } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { isOpenJob, jobs } from "@/content/careers";
import { getJobs, getJobSlugs, getOpenJobSlugs } from "@/lib/content";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

vi.mock("server-only", () => ({}));

let orgId: string;
let storageDir: string;
const prevSlug = process.env.OS_ORG_SLUG;
beforeAll(() => {
  process.env.OS_ORG_SLUG = "test-org";
  storageDir = mkdtempSync(path.join(tmpdir(), "dms-cv-"));
  setDocumentStorage(new LocalStorageForTests(storageDir));
});
afterAll(() => {
  process.env.OS_ORG_SLUG = prevSlug;
  setDocumentStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const PDF = Buffer.from("%PDF-1.4\n% cv\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");
const cv = (name = "Sara-CV.pdf") => ({ name, type: "application/pdf", data: PDF });
const form = (over: Record<string, unknown> = {}) =>
  applicationSchema.parse({ job: jobs[0].slug, name: "سارة أحمد العتيبي", email: "Sara@Example.com", phone: "0551234567", city: "الرياض", experienceYears: "4", linkedinUrl: "https://linkedin.com/in/sara", message: "مهتمة بالوظيفة", consent: "true", elapsed: 9000, ...over });

describe("website job applications", () => {
  it("1. creates the dashboard opening, the candidate (source WEBSITE), the application and the CV document; HR is notified", async () => {
    const hr = await ctxFor((await makeUser(orgId, "hr@x.test", ["hr_manager"])).id);
    const r = await captureJobApplication(form(), cv(), { ip: "1.2.3.4" });
    expect(r.outcome).toBe("created");
    const opening = await prisma.jobOpening.findFirstOrThrow({ where: { organizationId: orgId, websiteSlug: jobs[0].slug } });
    expect([opening.status, opening.title]).toEqual(["OPEN", jobs[0].title.ar]);
    const c = await prisma.candidate.findFirstOrThrow({ where: { organizationId: orgId }, include: { applications: true } });
    expect([c.firstName, c.lastName, c.emailNormalized, c.source, c.city, c.experienceYears]).toEqual(["سارة", "أحمد العتيبي", "sara@example.com", "WEBSITE", "الرياض", 4]);
    expect(c.applications[0].notes).toContain("مهتمة بالوظيفة");
    const docs = await documentsFor(hr, { type: "CANDIDATE", id: c.id });
    expect(docs?.docs.map((d) => [d.classification, d.title])).toEqual([["CONFIDENTIAL", "السيرة الذاتية — سارة أحمد العتيبي"]]);
    const n = await prisma.notification.findMany({ where: { userId: hr.userId } });
    expect(n.map((x) => x.href)).toEqual([`/app/hr/recruitment/candidates/${c.id}`]);
    // the audit trail never stores the applicant's contact details
    const audit = await prisma.auditLog.findMany({ where: { action: "website.application_received" } });
    expect(JSON.stringify(audit)).not.toContain("0551234567");
  });

  it("2. the same person applying again: one candidate, one application per opening, the new message appended; another role adds an application", async () => {
    await captureJobApplication(form(), cv(), {});
    const again = await captureJobApplication(form({ email: "sara@example.com", message: "رسالة ثانية" }), cv("cv2.pdf"), {});
    expect(again.outcome).toBe("appended");
    await captureJobApplication(form({ job: jobs[1].slug }), null, {});
    const c = await prisma.candidate.findMany({ where: { organizationId: orgId }, include: { applications: true } });
    expect(c).toHaveLength(1);
    expect(c[0].applications).toHaveLength(2);
    const first = c[0].applications.find((a) => a.notes?.includes("رسالة ثانية"))!;
    expect(first.notes).toContain("مهتمة بالوظيفة");
    expect(await prisma.jobOpening.count({ where: { organizationId: orgId } })).toBe(2);
  });

  it("3. unknown roles become open applications; spam is dropped silently", async () => {
    await captureJobApplication(form({ job: "no-such-role" }), null, {});
    expect((await prisma.jobOpening.findFirstOrThrow({ where: { organizationId: orgId } })).websiteSlug).toBe("general");
    expect((await captureJobApplication(form({ elapsed: 300, email: "bot@x.test" }), null, {})).outcome).toBe("spam");
    expect(await prisma.candidate.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it("4. validation: consent, phone and links are required / checked; CV type and size", () => {
    expect(applicationSchema.safeParse({ name: "Sara Ali", email: "s@x.test", phone: "0551234567" }).success).toBe(false);
    expect(applicationSchema.safeParse({ name: "Sara Ali", email: "s@x.test", phone: "abc", consent: "true" }).success).toBe(false);
    expect(applicationSchema.safeParse({ name: "Sara Ali", email: "s@x.test", phone: "0551234567", consent: "true", linkedinUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(cvProblem({ name: "cv.exe", type: "", data: PDF })).toBe("CV_TYPE");
    expect(cvProblem({ name: "cv.pdf", type: "", data: Buffer.alloc(6 * 1024 * 1024) })).toBe("CV_TOO_LARGE");
    expect(cvProblem(cv())).toBeNull();
  });

  it("5. a CV whose content does not match its type is refused and nothing is saved", async () => {
    await expect(captureJobApplication(form(), { name: "cv.pdf", type: "application/pdf", data: Buffer.from("not a pdf") }, {})).rejects.toThrow(/FILE_CONTENT_MISMATCH/);
    expect(await prisma.candidate.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it("6. the careers e-mail: role in the subject, reply-to the applicant, CV attached, and a warning when the dashboard save failed", () => {
    const m = buildCareersMail(form(), cv(), { saved: true, candidateNumber: "CAN-000007" });
    expect(m.subject).toContain(jobs[0].title.ar);
    expect(m.to).toEqual([process.env.LEAD_NOTIFY_EMAIL?.trim() || "info@dmstech.sa"]);
    expect(m.replyTo).toBe("Sara@Example.com");
    expect(m.attachments?.[0]).toMatchObject({ filename: "Sara-CV.pdf", contentType: "application/pdf" });
    expect(m.text).toContain("CAN-000007");
    expect(buildCareersMail(form(), cv("سيرة.pdf"), { saved: false }).attachments?.[0].filename).toBe("CV.pdf");
    expect(buildCareersMail(form(), null, { saved: false }).text).toContain("تعذّر حفظ الطلب");
  });

  it("7. closed roles: hidden from the list and the sitemap, page kept; an application from a closed page goes to the open application with a note", async () => {
    const open = jobs.filter(isOpenJob);
    expect(open.map((j) => j.slug)).toEqual(["ai-engineer", "ai-agents-developer", "full-stack-engineer", "business-development-executive", "customer-service-representative", "social-media-manager"]);
    expect(jobs.filter((j) => j.status === "closed")).toHaveLength(21);
    expect((await getJobs("ar")).map((j) => j.slug)).toEqual(open.map((j) => j.slug));
    expect(await getOpenJobSlugs()).toHaveLength(6);
    expect(await getJobSlugs()).toContain("frontend-developer");
    await captureJobApplication(form({ job: "frontend-developer" }), null, {});
    const a = await prisma.application.findFirstOrThrow({ include: { job: true } });
    expect(a.job.websiteSlug).toBe("general");
    expect(a.notes).toContain("صفحة وظيفة منتهية");
  });
});
