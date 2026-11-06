import { z } from "zod";
import { prisma, type Tx } from "../db";
import { systemCtx } from "../context";
import { unitOfWork } from "../events/bus";
import { nextNumber } from "../crm/sequence";
import { normEmail } from "../crm/normalize";
import { storeFile, type UploadedFile } from "../ops/documents";
import { storageFor } from "../ops/storage";
import { isOpenJob, jobs } from "@/content/careers";

/**
 * Public careers page → recruitment (docs/HR.md#website-applications).
 *
 * Only this whitelisted schema is accepted from the internet. Each website opening (content slug) is mirrored by ONE
 * dashboard JobOpening (`websiteSlug`, created OPEN on its first application); open applications go to "general".
 * The candidate is matched by e-mail (one candidate per person); applying twice to the same opening appends to the
 * existing application instead of failing. The CV is stored as a CONFIDENTIAL document on the candidate (same
 * validation, storage and malware-scan boundary as every document). HR is notified in the dashboard; the company
 * company inbox gets an e-mail with the CV attached (src/server/notify/careers-mail.ts) — independently of the database.
 */

export const GENERAL_SLUG = "general";
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_TYPES = ["pdf", "docx"] as const;

const phoneRe = /^\+?[0-9\s()-]{8,20}$/;
const t = (max: number) => z.string().trim().max(max).optional().default("");
const url = z
  .string()
  .trim()
  .max(300)
  .optional()
  .default("")
  .refine((v) => !v || /^https?:\/\/[^\s<>"]+$/i.test(v), "URL_INVALID");

export const applicationSchema = z.object({
  job: z.string().trim().max(120).default(GENERAL_SLUG),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().max(160).pipe(z.email()),
  phone: z.string().trim().regex(phoneRe, "PHONE_INVALID"),
  city: t(80),
  experienceYears: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(50).optional()),
  linkedinUrl: url,
  portfolioUrl: url,
  noticePeriodDays: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(0).max(365).optional()),
  salaryExpectation: z.preprocess((v) => (v === "" || v == null ? undefined : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,7}$/, "SALARY_INVALID").optional()),
  message: t(3000),
  consent: z.preprocess((v) => v === true || v === "true" || v === "on", z.literal(true)),
  locale: z.enum(["ar", "en"]).default("ar"),
  page: z.string().max(200).optional().default(""),
  /** honeypot: real users never fill it */
  website: z.string().max(0).optional(),
  /** ms since the form was rendered; bots submit instantly */
  elapsed: z.coerce.number().int().min(0).max(86_400_000).optional()
});
export type ApplicationInput = z.output<typeof applicationSchema>;

/** The website opening an application is for (null = open application). Unknown or closed roles fall back to open application. */
export const websiteJob = (slug: string) => jobs.find((j) => j.slug === slug && isOpenJob(j)) ?? null;

export function applicationSpam(d: ApplicationInput): string | null {
  if (d.website) return "honeypot";
  if (d.elapsed !== undefined && d.elapsed < 2500) return "too_fast";
  if ((d.message.match(/https?:\/\/|www\./gi) ?? []).length > 3) return "links";
  if (/<\s*(script|a\s+href|iframe)/i.test(d.message + d.name)) return "markup";
  return null;
}

/** CV checks before anything is stored: PDF or Word, 5 MB at most, content matching the extension (storage re-checks). */
export function cvProblem(file: UploadedFile | null): string | null {
  if (!file) return null;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!(CV_TYPES as readonly string[]).includes(ext)) return "CV_TYPE";
  if (!file.data.length) return "CV_EMPTY";
  if (file.data.length > CV_MAX_BYTES) return "CV_TOO_LARGE";
  return null;
}

const splitName = (full: string) => {
  const parts = full.replace(/\s+/g, " ").trim().split(" ");
  return parts.length === 1 ? { firstName: parts[0], lastName: "-" } : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

async function orgId(): Promise<string> {
  const slug = process.env.OS_ORG_SLUG ?? "dms-tech";
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) throw new Error(`organization ${slug} not bootstrapped`);
  return org.id;
}

/** The dashboard opening mirroring a website page — created OPEN on the first application, never duplicated. */
async function openingFor(tx: Tx, organizationId: string, slug: string) {
  const found = await tx.jobOpening.findFirst({ where: { organizationId, websiteSlug: slug } });
  if (found) return found;
  const j = websiteJob(slug);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`careers:opening:${organizationId}:${slug}`}))::text AS locked`;
  const again = await tx.jobOpening.findFirst({ where: { organizationId, websiteSlug: slug } });
  if (again) return again;
  return tx.jobOpening.create({
    data: {
      organizationId,
      number: await nextNumber(tx, organizationId, "JOB"),
      title: j ? j.title.ar : "طلبات توظيف عامة (من الموقع)",
      location: j?.location.ar ?? null,
      employmentType: "FULL_TIME",
      description: j ? j.about.ar : "السير الذاتية المرسلة من صفحة الوظائف دون وظيفة محددة.",
      requirements: j ? j.requirements.map((r) => `• ${r.ar}`).join("\n") : null,
      status: "OPEN",
      openedAt: new Date(),
      websiteSlug: slug
    }
  });
}

export type IntakeResult = { outcome: "created" | "appended" | "spam"; candidateNumber?: string; jobTitle?: string };

/**
 * Saves a website application: opening, candidate (matched by e-mail), application (or an appended note) and the CV.
 * The CV bytes are stored first and removed again if the transaction fails, so no orphan file is left behind.
 */
export async function captureJobApplication(d: ApplicationInput, file: UploadedFile | null, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<IntakeResult> {
  const org = await orgId();
  const ctx = systemCtx(org, { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  const spam = applicationSpam(d);
  if (spam) {
    await prisma.auditLog.create({ data: { organizationId: org, action: "website.application_rejected_spam", entityType: "Candidate", after: { reason: spam }, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
    return { outcome: "spam" };
  }
  const slug = websiteJob(d.job) ? d.job : GENERAL_SLUG;
  const job = websiteJob(slug);
  const stored = file ? await storeFile(org, file) : null;
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const opening = await openingFor(tx, org, slug);
      const email = normEmail(d.email);
      const { firstName, lastName } = splitName(d.name);
      let candidate = email ? await tx.candidate.findFirst({ where: { organizationId: org, emailNormalized: email, archivedAt: null }, orderBy: { createdAt: "desc" } }) : null;
      const profile = {
        phone: d.phone,
        city: d.city || null,
        experienceYears: d.experienceYears ?? null,
        linkedinUrl: d.linkedinUrl || null,
        portfolioUrl: d.portfolioUrl || null
      };
      if (candidate) {
        // keep what HR already has; fill what was missing, and take the newest contact details
        candidate = await tx.candidate.update({
          where: { id: candidate.id },
          data: { phone: d.phone, city: candidate.city ?? profile.city, experienceYears: profile.experienceYears ?? candidate.experienceYears, linkedinUrl: profile.linkedinUrl ?? candidate.linkedinUrl, portfolioUrl: profile.portfolioUrl ?? candidate.portfolioUrl }
        });
      } else {
        candidate = await tx.candidate.create({
          data: { organizationId: org, number: await nextNumber(tx, org, "CAN"), firstName, lastName, email: d.email, emailNormalized: email, source: "WEBSITE", ...profile }
        });
      }
      const stamp = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
      const closedRole = d.job !== slug && d.job !== GENERAL_SLUG ? jobs.find((j) => j.slug === d.job) : null;
      const note = [`تقديم من الموقع — ${stamp}`, closedRole ? `(أُرسل من صفحة وظيفة منتهية: ${closedRole.title.ar})` : "", d.message ? `رسالة المتقدم:\n${d.message}` : "", d.page ? `الصفحة: ${d.page}` : ""].filter(Boolean).join("\n");
      const existing = await tx.application.findUnique({ where: { candidateId_jobId: { candidateId: candidate.id, jobId: opening.id } } });
      let applicationId: string;
      let outcome: "created" | "appended";
      if (existing) {
        await tx.application.update({
          where: { id: existing.id },
          data: {
            notes: [existing.notes, note].filter(Boolean).join("\n\n").slice(-8000),
            ...(d.salaryExpectation ? { salaryExpectation: d.salaryExpectation } : {}),
            ...(d.noticePeriodDays !== undefined ? { noticePeriodDays: d.noticePeriodDays } : {})
          }
        });
        applicationId = existing.id;
        outcome = "appended";
      } else {
        const a = await tx.application.create({
          data: { organizationId: org, candidateId: candidate.id, jobId: opening.id, ownerId: opening.ownerId, salaryExpectation: d.salaryExpectation ?? null, noticePeriodDays: d.noticePeriodDays ?? null, notes: note }
        });
        applicationId = a.id;
        outcome = "created";
      }
      if (stored) {
        const number = await nextNumber(tx, org, "DOC");
        const doc = await tx.document.create({
          data: {
            organizationId: org,
            number,
            title: `السيرة الذاتية — ${firstName} ${lastName}`.slice(0, 200),
            description: `مرفوعة من صفحة الوظائف (${job ? job.title.ar : "تقديم عام"})`,
            category: "HR",
            entityType: "CANDIDATE",
            entityId: candidate.id,
            ownerId: opening.ownerId ?? "",
            classification: "CONFIDENTIAL",
            tags: ["cv", "website"],
            currentVersion: 1,
            versions: { create: { organizationId: org, versionNumber: 1, storageKey: stored.key, storageDriver: stored.driver, sha256: stored.sha, mime: stored.mime, size: stored.size, originalName: stored.name, scanStatus: stored.scan, note: "website application", uploadedById: opening.ownerId ?? "", ...(stored.scanRow ? { scan: { create: stored.scanRow } } : {}) } }
          }
        });
        await uow.audit({ action: "document.created", entityType: "Document", entityId: doc.id, after: { number, title: doc.title, classification: "CONFIDENTIAL", entity: `CANDIDATE:${candidate.id}`, sha256: stored.sha, size: stored.size, mime: stored.mime, source: "website" } });
      }
      // the audit trail never stores the applicant's contact details
      await uow.audit({ action: "website.application_received", entityType: "Candidate", entityId: candidate.id, after: { candidate: candidate.number, job: opening.number, websiteSlug: slug, outcome, cv: Boolean(stored) } });
      uow.emit({
        type: "candidate.applied_website",
        entityType: "Application",
        entityId: applicationId,
        payload: { applicationId, candidateId: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`.trim(), job: opening.title, jobNumber: opening.number, ownerId: opening.ownerId ?? "", repeat: String(outcome === "appended") },
        activity: { entityLabel: `${candidate.number} · ${candidate.firstName} ${candidate.lastName}`.trim(), href: `/app/hr/recruitment/candidates/${candidate.id}`, visibility: "hr.recruitment.view" }
      });
      return { outcome, candidateNumber: candidate.number, jobTitle: opening.title };
    });
  } catch (e) {
    if (stored) await storageFor(stored.driver).remove(stored.key).catch(() => undefined);
    throw e;
  }
}
