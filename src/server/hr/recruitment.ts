import { z } from "zod";
import type { ApplicationStage, JobStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { normEmail, optDate, optEmail, optId, optText, parseListParams, reqText } from "../crm/normalize";
import { nextNumber } from "../crm/sequence";
import { addDays, ymd } from "../commercial/dates";
import { registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { createEmployeeTx } from "./employees";

/**
 * Recruitment / ATS — docs/HR.md. Jobs → candidates → applications (stage pipeline) → interviews
 * (stored schedule, no calendar integration) → evaluations (human ratings, no AI) → offers
 * (Approval OFFER) → accepted → explicit conversion to Employee (once; no automatic user account).
 * Stages are an enum with server-enforced transitions (documented choice: the pipeline is fixed for now,
 * unlike the configurable CRM pipeline).
 */

export const STAGE_TRANSITIONS: Record<ApplicationStage, readonly ApplicationStage[]> = {
  APPLIED: ["SCREENING", "INTERVIEW", "REJECTED"],
  SCREENING: ["INTERVIEW", "TECHNICAL", "REJECTED"],
  INTERVIEW: ["TECHNICAL", "FINAL_INTERVIEW", "OFFER", "REJECTED"],
  TECHNICAL: ["INTERVIEW", "FINAL_INTERVIEW", "OFFER", "REJECTED"],
  FINAL_INTERVIEW: ["OFFER", "REJECTED"],
  OFFER: ["FINAL_INTERVIEW", "REJECTED"],
  HIRED: [],
  REJECTED: ["SCREENING"]
};
export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["ON_HOLD", "CLOSED", "CANCELLED"],
  ON_HOLD: ["OPEN", "CLOSED", "CANCELLED"],
  CLOSED: ["OPEN"],
  CANCELLED: []
};

// --- jobs --------------------------------------------------------------------------

const jobSchema = z.object({
  title: reqText(2, 160),
  departmentId: optId,
  location: optText(120),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"]).default("FULL_TIME"),
  headcount: z.coerce.number().int().min(1).max(100).default(1),
  description: optText(8000),
  requirements: optText(8000),
  ownerId: optId
});

export async function createJob(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = jobSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, organizationId: ctx.organizationId } }))) throw invalid("UNKNOWN_DEPARTMENT");
    const number = await nextNumber(tx, ctx.organizationId, "JOB");
    const j = await tx.jobOpening.create({ data: { ...input, organizationId: ctx.organizationId, number, ownerId: input.ownerId ?? (ctx.userId || null), createdById: ctx.userId || null } });
    await uow.audit({ action: "job.created", entityType: "JobOpening", entityId: j.id, after: { number, title: j.title } });
    return { id: j.id, number };
  });
}

export async function updateJob(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = jobSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.jobOpening.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!before) throw notFound("JobOpening");
    await tx.jobOpening.update({ where: { id }, data: input });
    await uow.audit({ action: "job.updated", entityType: "JobOpening", entityId: id, before: { title: before.title }, after: { title: input.title } });
  });
}

export async function setJobStatus(ctx: Ctx, id: string, to: JobStatus) {
  requirePermission(ctx, "hr.recruitment.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "JobOpening" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const j = await tx.jobOpening.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!j) throw notFound("JobOpening");
    if (!JOB_TRANSITIONS[j.status].includes(to)) throw conflict(`JOB_INVALID_TRANSITION:${j.status}`);
    await tx.jobOpening.update({ where: { id }, data: { status: to, ...(to === "OPEN" ? { openedAt: j.openedAt ?? new Date(), closedAt: null } : {}), ...(to === "CLOSED" || to === "CANCELLED" ? { closedAt: new Date() } : {}) } });
    await uow.audit({ action: "job.status_changed", entityType: "JobOpening", entityId: id, before: { status: j.status }, after: { status: to } });
    if (to === "OPEN") uow.emit({ type: "job.opened", entityType: "JobOpening", entityId: id, payload: { jobId: id, number: j.number, title: j.title }, activity: { entityLabel: `${j.number} · ${j.title}`, href: `/app/hr/recruitment/jobs/${id}`, visibility: "hr.recruitment.view" } });
  });
}

// --- candidates & applications -------------------------------------------------------

const candidateSchema = z.object({
  firstName: reqText(1, 80),
  lastName: reqText(1, 80),
  email: optEmail,
  phone: optText(30),
  linkedinUrl: z.preprocess((v) => (v === "" || v == null ? null : v), z.url().max(300).nullable().optional()),
  source: z.enum(["WEBSITE", "REFERRAL", "LINKEDIN", "JOB_BOARD", "AGENCY", "OTHER"]).default("OTHER"),
  notes: optText(4000),
  jobId: optId,
  salaryExpectation: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable().optional()),
  noticePeriodDays: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(365).nullable().optional())
});

export async function createCandidate(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = candidateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const emailNormalized = normEmail(input.email);
    if (emailNormalized) {
      const dup = await tx.candidate.findFirst({ where: { organizationId: ctx.organizationId, emailNormalized, archivedAt: null } });
      if (dup) throw conflict(`CANDIDATE_EXISTS:${dup.number}`);
    }
    const number = await nextNumber(tx, ctx.organizationId, "CAN");
    const c = await tx.candidate.create({ data: { organizationId: ctx.organizationId, number, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, emailNormalized, phone: input.phone ?? null, linkedinUrl: input.linkedinUrl ?? null, source: input.source, notes: input.notes ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "candidate.created", entityType: "Candidate", entityId: c.id, after: { number, source: c.source } });
    let applicationId: string | null = null;
    if (input.jobId) applicationId = (await applyTx(tx, uow, ctx, c.id, input.jobId, { salaryExpectation: input.salaryExpectation ?? null, noticePeriodDays: input.noticePeriodDays ?? null })).id;
    return { id: c.id, number, applicationId };
  });
}

async function applyTx(tx: Tx, uow: Parameters<Parameters<typeof unitOfWork>[1]>[1], ctx: Ctx, candidateId: string, jobId: string, extra: { salaryExpectation: number | null; noticePeriodDays: number | null; notes?: string | null }) {
  const job = await tx.jobOpening.findFirst({ where: { id: jobId, organizationId: ctx.organizationId } });
  if (!job) throw invalid("UNKNOWN_JOB");
  if (job.status !== "OPEN") throw conflict(`JOB_NOT_OPEN:${job.status}`);
  if (await tx.application.findFirst({ where: { candidateId, jobId } })) throw conflict("ALREADY_APPLIED");
  const a = await tx.application.create({ data: { organizationId: ctx.organizationId, candidateId, jobId, ownerId: job.ownerId, salaryExpectation: extra.salaryExpectation, noticePeriodDays: extra.noticePeriodDays, notes: extra.notes ?? null } });
  await uow.audit({ action: "candidate.applied", entityType: "Application", entityId: a.id, after: { candidateId, jobId, job: job.number } });
  uow.emit({ type: "candidate.applied", entityType: "Application", entityId: a.id, payload: { applicationId: a.id, candidateId, jobId, jobNumber: job.number, ownerId: job.ownerId } });
  return a;
}

export async function applyToJob(ctx: Ctx, candidateId: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = z.object({ jobId: z.string().min(1), salaryExpectation: candidateSchema.shape.salaryExpectation, noticePeriodDays: candidateSchema.shape.noticePeriodDays, notes: optText(2000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    if (!(await tx.candidate.findFirst({ where: { id: candidateId, organizationId: ctx.organizationId } }))) throw notFound("Candidate");
    return { id: (await applyTx(tx, uow, ctx, candidateId, input.jobId, { salaryExpectation: input.salaryExpectation ?? null, noticePeriodDays: input.noticePeriodDays ?? null, notes: input.notes })).id };
  });
}

export async function moveStage(ctx: Ctx, applicationId: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = z.object({ to: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW", "OFFER", "HIRED", "REJECTED"]), from: z.string().optional(), reason: optText(1000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${applicationId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const a = await tx.application.findFirst({ where: { id: applicationId, organizationId: ctx.organizationId }, include: { candidate: { select: { firstName: true, lastName: true } } } });
    if (!a) throw notFound("Application");
    if (input.from && input.from !== a.stage) throw conflict("APPLICATION_STALE");
    if (input.to === "HIRED") throw conflict("USE_HIRE_CONVERSION");
    if (!STAGE_TRANSITIONS[a.stage].includes(input.to)) throw conflict(`STAGE_INVALID_TRANSITION:${a.stage}`);
    if (input.to === "REJECTED" && (!input.reason || input.reason.trim().length < 3)) throw invalid("REASON_REQUIRED");
    await tx.application.update({ where: { id: applicationId }, data: { stage: input.to, stageChangedAt: new Date(), status: input.to === "REJECTED" ? "REJECTED" : "ACTIVE", rejectionReason: input.to === "REJECTED" ? input.reason : null } });
    await uow.audit({ action: "candidate.stage_changed", entityType: "Application", entityId: applicationId, before: { stage: a.stage }, after: { stage: input.to, reason: input.reason } });
    uow.emit({ type: "candidate.stage_changed", entityType: "Application", entityId: applicationId, payload: { applicationId, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`, from: a.stage, to: input.to, ownerId: a.ownerId } });
  });
}

// --- interviews & evaluations ----------------------------------------------------------

const interviewSchema = z.object({
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  type: z.enum(["PHONE", "VIDEO", "ONSITE", "TECHNICAL"]).default("VIDEO"),
  interviewerIds: z.array(z.string().min(1)).min(1).max(10),
  location: optText(300),
  notes: optText(2000)
});

export async function scheduleInterview(ctx: Ctx, applicationId: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = interviewSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await tx.application.findFirst({ where: { id: applicationId, organizationId: ctx.organizationId }, include: { candidate: true, job: true } });
    if (!a) throw notFound("Application");
    if (a.status !== "ACTIVE") throw conflict(`APPLICATION_CLOSED:${a.status}`);
    const users = await tx.user.count({ where: { id: { in: input.interviewerIds }, organizationId: ctx.organizationId, status: "ACTIVE" } });
    if (users !== new Set(input.interviewerIds).size) throw invalid("UNKNOWN_INTERVIEWER");
    const i = await tx.interview.create({ data: { organizationId: ctx.organizationId, applicationId, ...input, location: input.location ?? null, notes: input.notes ?? null, createdById: ctx.userId || null } });
    await uow.audit({ action: "interview.scheduled", entityType: "Application", entityId: applicationId, after: { interviewId: i.id, at: i.scheduledAt.toISOString(), type: i.type, interviewers: input.interviewerIds.length } });
    uow.emit({ type: "interview.scheduled", entityType: "Interview", entityId: i.id, payload: { applicationId, interviewers: input.interviewerIds.join(","), name: `${a.candidate.firstName} ${a.candidate.lastName}`, job: a.job.title, at: i.scheduledAt.toISOString() } });
    return { id: i.id };
  });
}

export async function setInterviewStatus(ctx: Ctx, id: string, status: "COMPLETED" | "CANCELLED" | "NO_SHOW") {
  requirePermission(ctx, "hr.recruitment.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const i = await tx.interview.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!i) throw notFound("Interview");
    if (i.status !== "SCHEDULED") throw conflict(`INTERVIEW_CLOSED:${i.status}`);
    await tx.interview.update({ where: { id }, data: { status } });
    await uow.audit({ action: "interview.status_changed", entityType: "Application", entityId: i.applicationId, after: { interviewId: id, status } });
  });
}

const evalSchema = z.object({ interviewId: optId, criteria: optText(500), rating: z.coerce.number().int().min(1).max(5), recommendation: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]).nullable().optional(), notes: optText(4000) });

/** Recruiters (hr.recruitment.manage) or an interviewer of this application. Human ratings only — no automatic scoring. */
export async function addEvaluation(ctx: Ctx, applicationId: string, raw: unknown) {
  const input = evalSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const a = await tx.application.findFirst({ where: { id: applicationId, organizationId: ctx.organizationId }, include: { interviews: { select: { id: true, interviewerIds: true } } } });
    if (!a) throw notFound("Application");
    const interviewer = a.interviews.some((i) => i.interviewerIds.includes(ctx.userId));
    if (!interviewer && !can(ctx, "hr.recruitment.manage")) throw forbidden("hr.recruitment.manage or interviewer");
    if (input.interviewId && !a.interviews.some((i) => i.id === input.interviewId)) throw invalid("INTERVIEW_NOT_OF_APPLICATION");
    const e = await tx.candidateEvaluation.create({ data: { organizationId: ctx.organizationId, applicationId, interviewId: input.interviewId ?? null, reviewerId: ctx.userId, criteria: input.criteria ?? null, rating: input.rating, recommendation: input.recommendation ?? null, notes: input.notes ?? null } });
    await uow.audit({ action: "candidate.evaluated", entityType: "Application", entityId: applicationId, after: { evaluationId: e.id, rating: input.rating, recommendation: input.recommendation } });
    return { id: e.id };
  });
}

// --- offers ------------------------------------------------------------------------------

const money = z.preprocess((v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d+(\.\d{1,2})?$/, "AMOUNT_INVALID"));
const offerSchema = z.object({ jobTitle: reqText(2, 160), salary: money, housingAllowance: money, transportAllowance: money, currency: z.string().trim().length(3).toUpperCase().default("SAR"), startDate: z.coerce.date(), expiresAt: optDate });

export async function createOffer(ctx: Ctx, applicationId: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = offerSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${applicationId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const a = await tx.application.findFirst({ where: { id: applicationId, organizationId: ctx.organizationId } });
    if (!a) throw notFound("Application");
    if (a.status !== "ACTIVE") throw conflict(`APPLICATION_CLOSED:${a.status}`);
    if (!["INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW", "OFFER"].includes(a.stage)) throw conflict(`STAGE_INVALID_TRANSITION:${a.stage}`);
    if (await tx.offer.findFirst({ where: { applicationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED"] } } })) throw conflict("OFFER_EXISTS");
    const number = await nextNumber(tx, ctx.organizationId, "OFR");
    const o = await tx.offer.create({ data: { organizationId: ctx.organizationId, number, applicationId, ...input, expiresAt: input.expiresAt ?? null, createdById: ctx.userId || null } });
    if (a.stage !== "OFFER") await tx.application.update({ where: { id: applicationId }, data: { stage: "OFFER", stageChangedAt: new Date() } });
    await uow.audit({ action: "offer.created", entityType: "Application", entityId: applicationId, after: { offerId: o.id, number, jobTitle: o.jobTitle, startDate: ymd(o.startDate) } });
    return { id: o.id, number };
  });
}

async function lockOffer(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const o = await tx.offer.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { application: { include: { candidate: true, job: true } } } });
  if (!o) throw notFound("Offer");
  return o;
}

export async function submitOffer(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.recruitment.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const o = await lockOffer(tx, ctx, id);
    if (o.status !== "DRAFT") throw conflict(`OFFER_INVALID_TRANSITION:${o.status}`);
    const a = await requestApprovalTx(tx, uow, ctx, {
      type: "OFFER",
      entityType: "Offer",
      entityId: id,
      title: `Offer ${o.number} · ${o.application.candidate.firstName} ${o.application.candidate.lastName} · ${o.jobTitle}`,
      payload: { offerId: id, number: o.number },
      requiredPermission: "hr.offers.approve",
      priority: "HIGH"
    });
    await tx.offer.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalId: a.id } });
    await uow.audit({ action: "offer.submitted", entityType: "Application", entityId: o.applicationId, after: { offerId: id, approvalId: a.id } });
  });
}

registerApprovalHandler("OFFER", {
  async onApproved(tx, uow, approval, ctx) {
    const p = approval.payload as { offerId: string };
    const o = await tx.offer.findUnique({ where: { id: p.offerId } });
    if (!o || o.status !== "PENDING_APPROVAL" || o.approvalId !== approval.id) throw conflict("OFFER_STALE_APPROVAL");
    if (o.createdById === ctx.userId) throw forbidden("self-approval (offer author)");
    await tx.offer.update({ where: { id: o.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    await uow.audit({ action: "offer.approved", entityType: "Application", entityId: o.applicationId, after: { offerId: o.id } });
    uow.emit({ type: "offer.approved", entityType: "Offer", entityId: o.id, payload: { offerId: o.id, number: o.number, createdById: o.createdById } });
  },
  async onRejected(tx, uow, approval) {
    const p = approval.payload as { offerId: string };
    const o = await tx.offer.findUnique({ where: { id: p.offerId } });
    if (!o || o.status !== "PENDING_APPROVAL") throw conflict("OFFER_STALE_APPROVAL");
    await tx.offer.update({ where: { id: o.id }, data: { status: "DRAFT", approvalId: null } });
    await uow.audit({ action: "offer.approval_rejected", entityType: "Application", entityId: o.applicationId, after: { offerId: o.id, comment: approval.decisionComment } });
  },
  async onCancelled(tx, _uow, approval) {
    const p = approval.payload as { offerId: string };
    await tx.offer.updateMany({ where: { id: p.offerId, status: "PENDING_APPROVAL" }, data: { status: "DRAFT", approvalId: null } });
  }
});

/** Record that the approved offer was given to the candidate (outside the system). */
export async function sendOffer(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.recruitment.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const o = await lockOffer(tx, ctx, id);
    if (o.status !== "APPROVED") throw conflict(`OFFER_INVALID_TRANSITION:${o.status}`);
    await tx.offer.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await uow.audit({ action: "offer.sent", entityType: "Application", entityId: o.applicationId, after: { offerId: id, method: "manual_record" } });
    uow.emit({ type: "offer.sent", entityType: "Offer", entityId: id, payload: { offerId: id, number: o.number } });
  });
}

/** Record the candidate's answer (manual record + confirmation). */
export async function recordOfferResponse(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.manage");
  const input = z.object({ decision: z.enum(["ACCEPTED", "REJECTED"]), reason: optText(1000), confirm: z.literal(true) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const o = await lockOffer(tx, ctx, id);
    if (o.status !== "SENT") throw conflict(`OFFER_INVALID_TRANSITION:${o.status}`);
    if (input.decision === "ACCEPTED") {
      await tx.offer.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      uow.emit({ type: "offer.accepted", entityType: "Offer", entityId: id, payload: { offerId: id, number: o.number, name: `${o.application.candidate.firstName} ${o.application.candidate.lastName}`, ownerId: o.application.ownerId ?? o.createdById } });
    } else {
      await tx.offer.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: input.reason ?? null } });
    }
    await uow.audit({ action: input.decision === "ACCEPTED" ? "offer.accepted" : "offer.rejected", entityType: "Application", entityId: o.applicationId, after: { offerId: id, reason: input.reason, recordedById: ctx.userId, method: "manual_record" } });
  });
}

export async function withdrawOffer(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.recruitment.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const o = await lockOffer(tx, ctx, id);
    if (!["DRAFT", "APPROVED", "SENT"].includes(o.status)) throw conflict(`OFFER_INVALID_TRANSITION:${o.status}`);
    await tx.offer.update({ where: { id }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
    await uow.audit({ action: "offer.withdrawn", entityType: "Application", entityId: o.applicationId, after: { offerId: id } });
  });
}

const convertSchema = z.object({ departmentId: optId, managerId: optId, workEmail: optEmail, createCompensation: z.boolean().default(true) });

/**
 * Accepted offer → Employee, exactly once (row lock + unique Offer.convertedEmployeeId + unique
 * Application.hiredEmployeeId). Marks the application HIRED, withdraws the candidate's other active
 * applications, optionally creates the starting compensation (needs hr.compensation.manage).
 * No system account is created here — that is a separate explicit action on the employee.
 */
export async function convertToEmployee(ctx: Ctx, offerId: string, raw: unknown) {
  requirePermission(ctx, "hr.employees.create");
  const input = convertSchema.parse(raw ?? {});
  if (input.createCompensation) requirePermission(ctx, "hr.compensation.manage");
  try {
    return await unitOfWork(ctx, async (tx, uow) => {
      const o = await lockOffer(tx, ctx, offerId);
      if (o.status !== "ACCEPTED") throw conflict(`OFFER_NOT_ACCEPTED:${o.status}`);
      if (o.convertedEmployeeId) throw conflict("ALREADY_CONVERTED");
      const c = o.application.candidate;
      const emp = await createEmployeeTx(tx, uow, ctx, {
        firstName: c.firstName, lastName: c.lastName, nameAr: null, workEmail: input.workEmail ?? null, personalEmail: c.email, workPhone: null, personalPhone: c.phone,
        jobTitle: o.jobTitle, departmentId: input.departmentId ?? o.application.job.departmentId, managerId: input.managerId ?? null, employmentType: o.application.job.employmentType,
        joinDate: o.startDate, probationEndDate: addDays(o.startDate, 90), workLocation: o.application.job.location, country: "SA", city: null, nationality: null,
        emergencyContactName: null, emergencyContactPhone: null, userId: null
      });
      if (input.createCompensation) {
        await tx.employeeCompensation.create({ data: { organizationId: ctx.organizationId, employeeId: emp.id, baseSalary: o.salary, housingAllowance: o.housingAllowance, transportAllowance: o.transportAllowance, currency: o.currency, effectiveFrom: o.startDate, notes: `Offer ${o.number}`, createdById: ctx.userId || null } });
        await uow.audit({ action: "compensation.created", entityType: "Employee", entityId: emp.id, after: { from: ymd(o.startDate), source: o.number } });
      }
      await tx.offer.update({ where: { id: offerId }, data: { convertedEmployeeId: emp.id, convertedAt: new Date() } });
      await tx.application.update({ where: { id: o.applicationId }, data: { stage: "HIRED", status: "HIRED", hiredEmployeeId: emp.id, stageChangedAt: new Date() } });
      const others = await tx.application.updateMany({ where: { candidateId: c.id, id: { not: o.applicationId }, status: "ACTIVE" }, data: { status: "WITHDRAWN" } });
      await uow.audit({ action: "employee.hired", entityType: "Employee", entityId: emp.id, after: { offer: o.number, applicationId: o.applicationId, candidate: c.number, otherApplicationsWithdrawn: others.count } });
      uow.emit({ type: "employee.hired", entityType: "Employee", entityId: emp.id, payload: { employeeId: emp.id, number: emp.number, name: `${c.firstName} ${c.lastName}`, offer: o.number }, activity: { entityLabel: `${emp.number} · ${c.firstName} ${c.lastName}`, href: `/app/hr/employees/${emp.id}`, visibility: "hr.employees.view" } });
      return { employeeId: emp.id, number: emp.number };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("ALREADY_CONVERTED");
    throw e;
  }
}

// --- read ------------------------------------------------------------------------------

export async function listJobs(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.view");
  const f = parseListParams(z.object({ status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED", "CANCELLED", "active"]).default("active"), q: z.string().trim().max(100).optional() }), raw ?? {});
  return prisma.jobOpening.findMany({
    where: { organizationId: ctx.organizationId, ...(f.status === "active" ? { status: { in: ["DRAFT", "OPEN", "ON_HOLD"] } } : { status: f.status }), ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }] } : {}) },
    orderBy: { createdAt: "desc" },
    include: { department: { select: { name: true, nameAr: true } }, _count: { select: { applications: { where: { status: "ACTIVE" } } } } }
  });
}

export async function getJob(ctx: Ctx, id: string) {
  requirePermission(ctx, "hr.recruitment.view");
  const j = await prisma.jobOpening.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { department: { select: { id: true, name: true, nameAr: true } }, applications: { orderBy: { stageChangedAt: "desc" }, include: { candidate: { select: { id: true, number: true, firstName: true, lastName: true, source: true } }, _count: { select: { interviews: true, evaluations: true } } } } }
  });
  if (!j) throw notFound("JobOpening");
  return j;
}

export async function listCandidates(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "hr.recruitment.view");
  const f = parseListParams(z.object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }), raw ?? {});
  const where: Prisma.CandidateWhereInput = { organizationId: ctx.organizationId, archivedAt: null, ...(f.q ? { OR: [{ firstName: { contains: f.q, mode: "insensitive" } }, { lastName: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q.toUpperCase() } }, { emailNormalized: { contains: f.q.toLowerCase() } }] } : {}) };
  const [items, total] = await Promise.all([
    prisma.candidate.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 30, take: 30, include: { applications: { select: { stage: true, status: true, job: { select: { number: true, title: true } } } } } }),
    prisma.candidate.count({ where })
  ]);
  return { items, total, page: f.page, pageSize: 30 };
}

export async function getCandidate(ctx: Ctx, id: string) {
  const c = await prisma.candidate.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      applications: {
        orderBy: { appliedAt: "desc" },
        include: {
          job: { select: { id: true, number: true, title: true, status: true, departmentId: true } },
          interviews: { orderBy: { scheduledAt: "desc" } },
          evaluations: { orderBy: { createdAt: "desc" } },
          offers: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });
  if (!c) throw notFound("Candidate");
  const viewer = can(ctx, "hr.recruitment.view");
  const interviewer = c.applications.some((a) => a.interviews.some((i) => i.interviewerIds.includes(ctx.userId)));
  if (!viewer && !interviewer) throw forbidden("hr.recruitment.view");
  if (!viewer) {
    // interviewers: their interviews and own evaluations only — no offers / salary expectations / other ratings
    return { candidate: { ...c, email: null, phone: null, notes: null, applications: c.applications.map((a) => ({ ...a, salaryExpectation: null, notes: null, offers: [], interviews: a.interviews.filter((i) => i.interviewerIds.includes(ctx.userId)), evaluations: a.evaluations.filter((e) => e.reviewerId === ctx.userId) })) }, full: false };
  }
  return { candidate: c, full: true };
}

/** Interviews the signed-in user takes part in (no recruitment permission needed). */
export async function myInterviews(ctx: Ctx) {
  return prisma.interview.findMany({ where: { organizationId: ctx.organizationId, interviewerIds: { has: ctx.userId }, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, include: { application: { select: { candidate: { select: { id: true, firstName: true, lastName: true } }, job: { select: { title: true } } } } } });
}
