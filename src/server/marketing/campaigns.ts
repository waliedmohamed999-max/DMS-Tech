import { z } from "zod";
import { Prisma, type CampaignStatus, type ConsentStatus, type MarketingCampaign } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, systemCtx, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { nextNumber } from "../crm/sequence";
import { money, optDate, optId, optText, reqText } from "../crm/normalize";
import { cancelApprovalTx, registerApprovalHandler, requestApprovalTx } from "../approvals/service";
import { enqueue } from "../integrations/outbox";
import { connectionFor } from "../integrations/registry";
import { templateMessage } from "../whatsapp/service";
import { campaignFunnel } from "./attribution";
import { decIn, D, r2 } from "../ops/shared";

/**
 * Marketing campaigns (docs/MARKETING.md).
 *   DRAFT ──submit──▶ READY  (eligible recipients ≤ organization threshold, or the CAMPAIGN approval was granted)
 *         └─ over threshold → Approval CAMPAIGN (whatsapp.campaigns.approve) bound to the campaign VERSION
 *   READY ──start──▶ RUNNING ⇄ PAUSED ──▶ COMPLETED | FAILED ; CANCELLED from any open state
 * Every content / audience edit bumps `version`; an approval for another version is stale and cannot start the campaign.
 * Starting takes the recipient SNAPSHOT (consent-filtered; skipped rows kept with a reason) in the same transaction —
 * after that the recipients, template and parameters are frozen (service + DB triggers).
 * The worker queues messages at sendRatePerMinute; one CampaignMessage per (recipient, version) prevents double sends,
 * and a provider failure only fails that recipient — it never rolls back the campaign.
 * Non-WhatsApp channels are tracking-only (manual spend, UTM attribution); this build sends nothing to ad platforms.
 */

const OPEN_STATES: CampaignStatus[] = ["DRAFT", "READY", "RUNNING", "PAUSED"];
const EDITABLE: CampaignStatus[] = ["DRAFT", "READY"];

const canEdit = (ctx: Ctx) => canAny(ctx, "marketing.manage", "whatsapp.campaigns.create");
const requireEdit = (ctx: Ctx) => {
  if (!canEdit(ctx)) throw forbidden("marketing.manage");
};

const params = z.preprocess((v) => (typeof v === "string" ? v.split("|").map((x) => x.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(300)).max(10));
const bool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

const campaignSchema = z.object({
  name: reqText(3, 160),
  channel: z.enum(["WHATSAPP", "META", "GOOGLE", "LINKEDIN", "TIKTOK", "EMAIL", "OTHER"]).default("WHATSAPP"),
  objective: optText(500),
  budget: money.optional(),
  currency: z.preprocess((v) => (v ? String(v).toUpperCase() : "SAR"), z.string().length(3)),
  startDate: optDate,
  endDate: optDate,
  externalCampaignId: optText(120),
  utmSource: optText(80),
  utmMedium: optText(80),
  utmCampaign: optText(120),
  utmContent: optText(120),
  utmTerm: optText(120),
  templateId: optId,
  templateParams: params,
  requireOptIn: bool.default(true),
  sendRatePerMinute: z.coerce.number().int().min(1).max(600).default(30)
});

export const audienceFilter = z.object({
  kind: z.enum(["leads", "clients"]).default("leads"),
  leadSources: z.preprocess((v) => (typeof v === "string" ? (v ? [v] : []) : v ?? []), z.array(z.string().max(40)).max(20)),
  leadStatuses: z.preprocess((v) => (typeof v === "string" ? (v ? [v] : []) : v ?? []), z.array(z.enum(["OPEN", "QUALIFIED", "CONVERTED", "LOST"])).max(4)),
  clientStatuses: z.preprocess((v) => (typeof v === "string" ? (v ? [v] : []) : v ?? []), z.array(z.enum(["PROSPECT", "ACTIVE", "INACTIVE"])).max(3)),
  serviceId: optId,
  city: optText(80),
  stageId: optId
});
export type AudienceFilter = z.infer<typeof audienceFilter>;
type Person = { phone: string; name: string; leadId?: string | null; contactId?: string | null; clientId?: string | null };

// --- reads ------------------------------------------------------------------------------------------

export async function listCampaigns(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "marketing.view");
  const { status, channel, q } = z.object({ status: z.string().max(20).optional(), channel: z.string().max(20).optional(), q: z.string().trim().max(80).optional() }).parse(raw ?? {});
  const where: Prisma.MarketingCampaignWhereInput = {
    organizationId: ctx.organizationId,
    ...(status ? { status: status as CampaignStatus } : {}),
    ...(channel ? { channel: channel as "WHATSAPP" } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { utmCampaign: { contains: q, mode: "insensitive" } }] } : {})
  };
  const rows = await prisma.marketingCampaign.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { audience: { select: { eligibleCount: true, estimatedCount: true } } } });
  return { rows, canCreate: canEdit(ctx) };
}

export async function getCampaign(ctx: Ctx, id: string) {
  requirePermission(ctx, "marketing.view");
  const c = await prisma.marketingCampaign.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { audience: true, template: true, spend: { orderBy: { date: "desc" } } } });
  if (!c) throw notFound("MarketingCampaign");
  const [statusCounts, skipped, approval, org, conn, templates, funnel, last] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } }),
    prisma.campaignRecipient.groupBy({ by: ["skipReason"], where: { campaignId: id, status: "SKIPPED" }, _count: { _all: true } }),
    c.approvalId ? prisma.approval.findUnique({ where: { id: c.approvalId }, select: { id: true, status: true, decidedAt: true, decisionComment: true, payload: true } }) : null,
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { campaignApprovalThreshold: true } }),
    connectionFor(ctx.organizationId, "WHATSAPP"),
    prisma.whatsAppTemplate.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, language: true, status: true } }),
    can(ctx, "marketing.reports.view") ? campaignFunnel(ctx.organizationId, [id], "first") : null,
    can(ctx, "marketing.reports.view") ? campaignFunnel(ctx.organizationId, [id], "last") : null
  ]);
  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Record<string, number>;
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, phone: true, name: true, status: true, skipReason: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, errorCode: true, leadId: true, clientId: true } });
  const spendManual = c.spend.filter((s) => s.source === "MANUAL").reduce((a, s) => a.plus(s.amount), D(0));
  const spendSynced = c.spend.filter((s) => s.source === "PROVIDER_SYNCED").reduce((a, s) => a.plus(s.amount), D(0));
  return {
    campaign: c,
    counts,
    skippedByReason: Object.fromEntries(skipped.map((s) => [s.skipReason ?? "OTHER", s._count._all])),
    recipients,
    approval,
    threshold: org.campaignApprovalThreshold,
    approvalStale: Boolean(c.approvedVersion && c.approvedVersion !== c.version),
    connectionStatus: conn?.status ?? "NOT_CONFIGURED",
    templates,
    funnelFirst: funnel?.[id] ?? null,
    funnelLast: last?.[id] ?? null,
    spend: { manual: r2(spendManual).toFixed(2), synced: r2(spendSynced).toFixed(2) },
    canEdit: canEdit(ctx),
    canReports: can(ctx, "marketing.reports.view")
  };
}

// --- write: create / edit (bumps version) -------------------------------------------------------------

async function lock(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "MarketingCampaign" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const c = await tx.marketingCampaign.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("MarketingCampaign");
  return c;
}

async function checkTemplate(tx: Tx, ctx: Ctx, templateId: string | null | undefined) {
  if (!templateId) return;
  const t = await tx.whatsAppTemplate.findFirst({ where: { id: templateId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!t) throw invalid("UNKNOWN_TEMPLATE");
}

export async function createCampaign(ctx: Ctx, raw: unknown) {
  requireEdit(ctx);
  const input = campaignSchema.parse(raw);
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw invalid("DATE_ORDER");
  return unitOfWork(ctx, async (tx, uow) => {
    await checkTemplate(tx, ctx, input.templateId);
    const number = await nextNumber(tx, ctx.organizationId, "CMP");
    const c = await tx.marketingCampaign.create({
      data: { organizationId: ctx.organizationId, number, ...input, budget: input.budget ?? null, templateParams: input.templateParams, ownerId: ctx.userId, createdById: ctx.userId, utmCampaign: input.utmCampaign ?? number.toLowerCase() }
    });
    await uow.audit({ action: "campaign.created", entityType: "MarketingCampaign", entityId: c.id, after: { number, name: c.name, channel: c.channel, utmCampaign: c.utmCampaign } });
    return { id: c.id };
  });
}

/** Any edit of a DRAFT / READY campaign bumps the version: a pending approval is withdrawn and a granted one becomes stale. */
async function bump(tx: Tx, uow: Uow, ctx: Ctx, c: MarketingCampaign, data: Prisma.MarketingCampaignUpdateInput, reason: string) {
  if (!EDITABLE.includes(c.status)) throw conflict(`CAMPAIGN_NOT_EDITABLE:${c.status}`);
  let approvalId = c.approvalId;
  if (c.approvalId) {
    const a = await tx.approval.findUnique({ where: { id: c.approvalId }, select: { status: true } });
    if (a?.status === "PENDING") await cancelApprovalTx(tx, uow, ctx, c.approvalId, { allowNonRequester: true, runHook: false });
    approvalId = null;
  }
  const next = await tx.marketingCampaign.update({ where: { id: c.id }, data: { ...data, version: { increment: 1 }, status: "DRAFT", approvalId } });
  if (c.approvedVersion) await uow.audit({ action: "campaign.approval_stale", entityType: "MarketingCampaign", entityId: c.id, after: { approvedVersion: c.approvedVersion, version: next.version, reason } });
  return next;
}

export async function updateCampaign(ctx: Ctx, id: string, raw: unknown) {
  requireEdit(ctx);
  const input = campaignSchema.partial().parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    await checkTemplate(tx, ctx, input.templateId);
    const content = ["templateId", "templateParams", "requireOptIn", "channel", "sendRatePerMinute"] as const;
    const changed = content.filter((k) => k in input && JSON.stringify(input[k] ?? null) !== JSON.stringify((c as Record<string, unknown>)[k] ?? (k === "templateParams" ? [] : null)));
    const data = { ...input, templateParams: input.templateParams } as Prisma.MarketingCampaignUpdateInput;
    if (changed.length) await bump(tx, uow, ctx, c, data, changed.join(","));
    else {
      if (!OPEN_STATES.includes(c.status) && c.status !== "COMPLETED") throw conflict(`CAMPAIGN_NOT_EDITABLE:${c.status}`);
      // descriptive fields (name, objective, budget, dates, UTM) never invalidate an approval
      const { templateId: _t, templateParams: _p, requireOptIn: _r, channel: _c, sendRatePerMinute: _s, ...meta } = input;
      await tx.marketingCampaign.update({ where: { id }, data: meta });
    }
    await uow.audit({ action: "campaign.updated", entityType: "MarketingCampaign", entityId: id, before: { version: c.version }, after: { fields: Object.keys(input), contentChanged: changed } });
  });
}

// --- audience ----------------------------------------------------------------------------------------

/** People matching the filter, one row per phone (WhatsApp channel needs a phone). */
export async function resolveAudience(db: Tx | typeof prisma, organizationId: string, f: AudienceFilter): Promise<Person[]> {
  const out = new Map<string, Person>();
  if (f.kind === "leads") {
    const leads = await db.lead.findMany({
      where: {
        organizationId, archivedAt: null,
        status: { in: f.leadStatuses.length ? f.leadStatuses : ["OPEN", "QUALIFIED"] },
        ...(f.leadSources.length ? { source: { in: f.leadSources as "WEBSITE"[] } } : {}),
        ...(f.serviceId ? { serviceId: f.serviceId } : {}),
        ...(f.city ? { city: { equals: f.city, mode: "insensitive" } } : {}),
        ...(f.stageId ? { opportunity: { stageId: f.stageId, status: "OPEN" } } : {}),
        OR: [{ whatsappNormalized: { not: null } }, { phoneNormalized: { not: null } }]
      },
      orderBy: { createdAt: "asc" },
      take: 20_000,
      select: { id: true, name: true, whatsappNormalized: true, phoneNormalized: true }
    });
    for (const l of leads) {
      const phone = l.whatsappNormalized ?? l.phoneNormalized!;
      if (!out.has(phone)) out.set(phone, { phone, name: l.name, leadId: l.id });
    }
  } else {
    const clients = await db.client.findMany({
      where: {
        organizationId, deletedAt: null,
        status: { in: f.clientStatuses.length ? f.clientStatuses : ["ACTIVE"] },
        ...(f.city ? { city: { equals: f.city, mode: "insensitive" } } : {}),
        ...(f.serviceId || f.stageId ? { opportunities: { some: { ...(f.serviceId ? { serviceId: f.serviceId } : {}), ...(f.stageId ? { stageId: f.stageId, status: "OPEN" } : {}) } } } : {})
      },
      orderBy: { createdAt: "asc" },
      take: 20_000,
      select: { id: true, displayName: true, phoneNormalized: true, contacts: { where: { deletedAt: null, phoneNormalized: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { id: true, firstName: true, lastName: true, phoneNormalized: true } } }
    });
    for (const c of clients) {
      const ct = c.contacts[0];
      const phone = ct?.phoneNormalized ?? c.phoneNormalized;
      if (!phone || out.has(phone)) continue;
      out.set(phone, { phone, name: ct ? `${ct.firstName} ${ct.lastName ?? ""}`.trim() : c.displayName, contactId: ct?.id ?? null, clientId: c.id });
    }
  }
  return [...out.values()];
}

/** Latest consent per phone (append-only history → newest row wins). */
export async function consentMap(db: Tx | typeof prisma, organizationId: string, phones: string[]) {
  const map = new Map<string, ConsentStatus>();
  for (let i = 0; i < phones.length; i += 1000) {
    const rows = await db.contactConsent.findMany({ where: { organizationId, channel: "WHATSAPP", address: { in: phones.slice(i, i + 1000) } }, orderBy: { recordedAt: "desc" }, select: { address: true, status: true } });
    for (const r of rows) if (!map.has(r.address)) map.set(r.address, r.status);
  }
  return map;
}

/** Why a person cannot receive the campaign (null = eligible). Opted-out / blocked people are never re-enabled silently. */
export const skipReason = (status: ConsentStatus | undefined, requireOptIn: boolean) =>
  status === "OPTED_OUT" ? "OPTED_OUT" : status === "BLOCKED" ? "BLOCKED" : requireOptIn && status !== "OPTED_IN" ? "NO_OPT_IN" : null;

async function evaluate(db: Tx | typeof prisma, organizationId: string, f: AudienceFilter, requireOptIn: boolean) {
  const people = await resolveAudience(db, organizationId, f);
  const consent = await consentMap(db, organizationId, people.map((p) => p.phone));
  const rows = people.map((p) => ({ ...p, skip: skipReason(consent.get(p.phone), requireOptIn) }));
  const reasons: Record<string, number> = {};
  for (const r of rows) if (r.skip) reasons[r.skip] = (reasons[r.skip] ?? 0) + 1;
  return { rows, estimated: rows.length, eligible: rows.filter((r) => !r.skip).length, reasons };
}

export async function previewAudience(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "marketing.view");
  const c = await prisma.marketingCampaign.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { audience: true } });
  if (!c) throw notFound("MarketingCampaign");
  const f = audienceFilter.parse(raw ?? c.audience?.filter ?? {});
  const e = await evaluate(prisma, ctx.organizationId, f, c.requireOptIn);
  return { estimated: e.estimated, eligible: e.eligible, reasons: e.reasons, sample: e.rows.slice(0, 20).map((r) => ({ name: r.name, phoneLast4: r.phone.slice(-4), skip: r.skip })) };
}

export async function setAudience(ctx: Ctx, id: string, raw: unknown) {
  requireEdit(ctx);
  const f = audienceFilter.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    const e = await evaluate(tx, ctx.organizationId, f, c.requireOptIn);
    await bump(tx, uow, ctx, c, {}, "audience");
    await tx.campaignAudience.upsert({ where: { campaignId: id }, create: { campaignId: id, filter: f as Prisma.InputJsonValue, estimatedCount: e.estimated, eligibleCount: e.eligible, computedAt: new Date() }, update: { filter: f as Prisma.InputJsonValue, estimatedCount: e.estimated, eligibleCount: e.eligible, computedAt: new Date() } });
    await uow.audit({ action: "campaign.audience_set", entityType: "MarketingCampaign", entityId: id, after: { filter: f, estimated: e.estimated, eligible: e.eligible, skipped: e.reasons } });
    return { estimated: e.estimated, eligible: e.eligible };
  });
}

// --- submit / approval ---------------------------------------------------------------------------------

export async function submitCampaign(ctx: Ctx, id: string) {
  requireEdit(ctx);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    if (c.status !== "DRAFT") throw conflict(`CAMPAIGN_NOT_DRAFT:${c.status}`);
    if (c.approvalId) {
      const a = await tx.approval.findUnique({ where: { id: c.approvalId }, select: { status: true } });
      if (a?.status === "PENDING") throw conflict("APPROVAL_ALREADY_PENDING");
    }
    if (c.channel !== "WHATSAPP") {
      // tracking-only channels have nothing to send → nothing to approve
      await tx.marketingCampaign.update({ where: { id }, data: { status: "READY", approvedVersion: c.version, approvalId: null } });
      await uow.audit({ action: "campaign.ready", entityType: "MarketingCampaign", entityId: id, after: { version: c.version, channel: c.channel } });
      return { status: "READY" as const };
    }
    const tpl = c.templateId ? await tx.whatsAppTemplate.findUnique({ where: { id: c.templateId } }) : null;
    if (!tpl) throw invalid("TEMPLATE_REQUIRED");
    if (tpl.status !== "APPROVED") throw conflict("TEMPLATE_NOT_APPROVED");
    const aud = await tx.campaignAudience.findUnique({ where: { campaignId: id } });
    if (!aud) throw invalid("AUDIENCE_REQUIRED");
    const e = await evaluate(tx, ctx.organizationId, audienceFilter.parse(aud.filter), c.requireOptIn);
    if (!e.eligible) throw conflict("NO_ELIGIBLE_RECIPIENTS");
    await tx.campaignAudience.update({ where: { campaignId: id }, data: { estimatedCount: e.estimated, eligibleCount: e.eligible, computedAt: new Date() } });
    const snapshot = { campaignId: id, version: c.version, templateId: tpl.id, template: `${tpl.name}/${tpl.language}`, params: c.templateParams ?? [], eligible: e.eligible, estimated: e.estimated, skipped: e.reasons, requireOptIn: c.requireOptIn, sendRatePerMinute: c.sendRatePerMinute };
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { campaignApprovalThreshold: true } });
    if (e.eligible > org.campaignApprovalThreshold) {
      const a = await requestApprovalTx(tx, uow, ctx, {
        type: "CAMPAIGN", entityType: "MarketingCampaign", entityId: id, requiredPermission: "whatsapp.campaigns.approve", priority: "MEDIUM",
        title: `${c.number} · ${c.name}`, summary: `${e.eligible} recipients · ${tpl.name}/${tpl.language} · v${c.version}`, payload: snapshot
      });
      await tx.marketingCampaign.update({ where: { id }, data: { approvalId: a.id } });
      await uow.audit({ action: "campaign.submitted", entityType: "MarketingCampaign", entityId: id, after: { ...snapshot, approvalId: a.id } });
      return { status: "PENDING_APPROVAL" as const };
    }
    await tx.marketingCampaign.update({ where: { id }, data: { status: "READY", approvedVersion: c.version, approvedSnapshot: snapshot as Prisma.InputJsonValue, approvalId: null } });
    await uow.audit({ action: "campaign.ready", entityType: "MarketingCampaign", entityId: id, after: { ...snapshot, approvalWaived: `≤ ${org.campaignApprovalThreshold}` } });
    return { status: "READY" as const };
  });
}

registerApprovalHandler("CAMPAIGN", {
  async onApproved(tx, uow, approval, ctx) {
    const snap = approval.payload as { campaignId: string; version: number };
    await tx.$queryRaw`SELECT id FROM "MarketingCampaign" WHERE id = ${snap.campaignId} FOR UPDATE`;
    const c = await tx.marketingCampaign.findUniqueOrThrow({ where: { id: snap.campaignId } });
    // the approval is bound to the version it showed the approver
    if (c.status !== "DRAFT" || c.approvalId !== approval.id || c.version !== snap.version) throw conflict("CAMPAIGN_APPROVAL_STALE");
    if (c.createdById === ctx.userId) throw forbidden("self-approval");
    await tx.marketingCampaign.update({ where: { id: c.id }, data: { status: "READY", approvedVersion: c.version, approvedSnapshot: approval.payload as Prisma.InputJsonValue } });
    await uow.audit({ action: "campaign.approved", entityType: "MarketingCampaign", entityId: c.id, after: { version: c.version, approvalId: approval.id } });
    uow.emit({ type: "campaign.approved", entityType: "MarketingCampaign", entityId: c.id, payload: { campaignId: c.id, number: c.number, createdById: c.createdById } });
  },
  async onRejected(tx, uow, approval) {
    const snap = approval.payload as { campaignId: string };
    const c = await tx.marketingCampaign.findUniqueOrThrow({ where: { id: snap.campaignId } });
    if (c.approvalId !== approval.id) return;
    await tx.marketingCampaign.update({ where: { id: c.id }, data: { approvalId: null } });
    await uow.audit({ action: "campaign.rejected", entityType: "MarketingCampaign", entityId: c.id, after: { comment: approval.decisionComment ?? null } });
  },
  async onCancelled(tx, _uow, approval) {
    const snap = approval.payload as { campaignId: string };
    await tx.marketingCampaign.updateMany({ where: { id: snap.campaignId, approvalId: approval.id }, data: { approvalId: null } });
  }
});

// --- start / pause / resume / cancel / complete ------------------------------------------------------

export async function startCampaign(ctx: Ctx, id: string) {
  requireEdit(ctx);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    if (c.status !== "READY") throw conflict(`CAMPAIGN_NOT_READY:${c.status}`);
    if (c.approvedVersion !== c.version) throw conflict("CAMPAIGN_APPROVAL_STALE");
    if (c.channel !== "WHATSAPP") {
      await tx.marketingCampaign.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date() } });
      await uow.audit({ action: "campaign.started", entityType: "MarketingCampaign", entityId: id, after: { channel: c.channel, trackingOnly: true } });
      uow.emit({ type: "campaign.started", entityType: "MarketingCampaign", entityId: id, payload: { campaignId: id, number: c.number, recipients: 0 } });
      return { recipients: 0, skipped: 0 };
    }
    const conn = await connectionFor(ctx.organizationId, "WHATSAPP");
    if (!conn || !["CONNECTED", "DEGRADED"].includes(conn.status)) throw conflict(`WHATSAPP_NOT_CONNECTED:${conn?.status ?? "NOT_CONFIGURED"}`);
    const tpl = c.templateId ? await tx.whatsAppTemplate.findUnique({ where: { id: c.templateId } }) : null;
    if (!tpl || tpl.status !== "APPROVED") throw conflict("TEMPLATE_NOT_APPROVED");
    const aud = await tx.campaignAudience.findUnique({ where: { campaignId: id } });
    if (!aud) throw invalid("AUDIENCE_REQUIRED");
    const e = await evaluate(tx, ctx.organizationId, audienceFilter.parse(aud.filter), c.requireOptIn);
    const approved = (c.approvedSnapshot ?? {}) as { eligible?: number };
    // the audience may have grown since approval → more people than the approver agreed to need a new approval
    if (approved.eligible !== undefined && e.eligible > approved.eligible) {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { campaignApprovalThreshold: true } });
      if (e.eligible > org.campaignApprovalThreshold) throw conflict(`AUDIENCE_GREW_REAPPROVAL:${approved.eligible}→${e.eligible}`);
    }
    if (!e.eligible) throw conflict("NO_ELIGIBLE_RECIPIENTS");
    // the snapshot: every matched person is recorded, skipped ones with their reason
    await tx.campaignRecipient.createMany({
      data: e.rows.map((r) => ({ campaignId: id, phone: r.phone, name: r.name.slice(0, 160), leadId: r.leadId ?? null, contactId: r.contactId ?? null, clientId: r.clientId ?? null, status: r.skip ? ("SKIPPED" as const) : ("PENDING" as const), skipReason: r.skip })),
      skipDuplicates: true
    });
    await tx.marketingCampaign.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date(), recipientCount: e.eligible } });
    await tx.campaignAudience.update({ where: { campaignId: id }, data: { estimatedCount: e.estimated, eligibleCount: e.eligible, computedAt: new Date() } });
    const skippedCount = e.estimated - e.eligible;
    if (skippedCount) await uow.audit({ action: "campaign.recipient_skipped", entityType: "MarketingCampaign", entityId: id, after: { count: skippedCount, reasons: e.reasons } });
    await uow.audit({ action: "campaign.started", entityType: "MarketingCampaign", entityId: id, after: { version: c.version, recipients: e.eligible, skipped: skippedCount, template: `${tpl.name}/${tpl.language}` } });
    uow.emit({ type: "campaign.started", entityType: "MarketingCampaign", entityId: id, payload: { campaignId: id, number: c.number, recipients: e.eligible } });
    return { recipients: e.eligible, skipped: skippedCount };
  });
}

async function transition(ctx: Ctx, id: string, from: CampaignStatus[], to: CampaignStatus, action: string, extra: (c: MarketingCampaign, tx: Tx, uow: Uow) => Promise<Prisma.MarketingCampaignUpdateInput>) {
  requireEdit(ctx);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    if (!from.includes(c.status)) throw conflict(`CAMPAIGN_BAD_TRANSITION:${c.status}→${to}`);
    const data = await extra(c, tx, uow);
    await tx.marketingCampaign.update({ where: { id }, data: { ...data, status: to } });
    await uow.audit({ action, entityType: "MarketingCampaign", entityId: id, before: { status: c.status }, after: { status: to } });
  });
}

/** Pause stops queueing new messages. Messages already handed to the outbox (≤ one minute of the send rate) are still delivered. */
export const pauseCampaign = (ctx: Ctx, id: string) => transition(ctx, id, ["RUNNING"], "PAUSED", "campaign.paused", async () => ({ pausedAt: new Date() }));
export const resumeCampaign = (ctx: Ctx, id: string) => transition(ctx, id, ["PAUSED"], "RUNNING", "campaign.resumed", async () => ({ pausedAt: null }));
export const completeCampaign = (ctx: Ctx, id: string) =>
  transition(ctx, id, ["RUNNING", "PAUSED"], "COMPLETED", "campaign.completed", async (c, tx) => {
    if (c.channel === "WHATSAPP" && (await tx.campaignRecipient.count({ where: { campaignId: c.id, status: { in: ["PENDING", "QUEUED"] } } }))) throw conflict("CAMPAIGN_HAS_PENDING_RECIPIENTS");
    return { completedAt: new Date() };
  });

/** Cancel: pending approval withdrawn; not-yet-queued recipients are skipped (CAMPAIGN_CANCELLED); queued messages are dropped by the sender. */
export const cancelCampaign = (ctx: Ctx, id: string) =>
  transition(ctx, id, OPEN_STATES, "CANCELLED", "campaign.cancelled", async (c, tx, uow) => {
    if (c.approvalId) {
      const a = await tx.approval.findUnique({ where: { id: c.approvalId }, select: { status: true } });
      if (a?.status === "PENDING") await cancelApprovalTx(tx, uow, ctx, c.approvalId, { allowNonRequester: true, runHook: false });
    }
    await tx.campaignRecipient.updateMany({ where: { campaignId: c.id, status: "PENDING" }, data: { status: "SKIPPED", skipReason: "CAMPAIGN_CANCELLED" } });
    return { cancelledAt: new Date() };
  });

// --- spend (manual vs provider-synced kept apart) --------------------------------------------------------

const spendSchema = z.object({ date: z.coerce.date(), amount: decIn(), currency: z.preprocess((v) => (v ? String(v).toUpperCase() : undefined), z.string().length(3).optional()), note: optText(300) });

export async function addSpend(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "marketing.manage");
  const input = spendSchema.parse(raw);
  if (D(input.amount).lte(0)) throw invalid("AMOUNT_INVALID");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    if ((input.currency ?? c.currency) !== c.currency) throw invalid("CURRENCY_MISMATCH");
    const s = await tx.campaignSpend.create({ data: { campaignId: id, date: input.date, amount: input.amount, currency: c.currency, source: "MANUAL", note: input.note ?? null, recordedById: ctx.userId } });
    await uow.audit({ action: "campaign.spend_recorded", entityType: "MarketingCampaign", entityId: id, after: { spendId: s.id, amount: input.amount, currency: c.currency, date: input.date, source: "MANUAL" } });
  });
}

// --- worker: queue the next batch ------------------------------------------------------------------------

const fill = (params: string[], r: { name: string | null }) => params.map((p) => p.replace(/\{\{\s*name\s*\}\}/gi, r.name || "").slice(0, 300) || "-");

/** One tick for every RUNNING WhatsApp campaign: queue up to sendRatePerMinute messages per minute; finish when nothing is left. */
export async function campaignTick(now = new Date(), organizationId?: string) {
  const running = await prisma.marketingCampaign.findMany({ where: { status: "RUNNING", channel: "WHATSAPP", ...(organizationId ? { organizationId } : {}) }, select: { id: true, organizationId: true } });
  const out = { queued: 0, completed: 0, failed: 0, skipped: 0 };
  for (const { id, organizationId: org } of running) {
    const ctx = systemCtx(org, { ip: "system", userAgent: "campaign-worker" });
    const r = await unitOfWork(ctx, async (tx, uow) => {
      await tx.$queryRaw`SELECT id FROM "MarketingCampaign" WHERE id = ${id} FOR UPDATE`;
      const c = await tx.marketingCampaign.findUniqueOrThrow({ where: { id }, include: { template: true } });
      if (c.status !== "RUNNING") return { queued: 0, done: null as null | "COMPLETED" | "FAILED", skipped: 0 };
      const conn = await tx.integrationConnection.findFirst({ where: { organizationId: org, provider: "WHATSAPP", status: { in: ["CONNECTED", "DEGRADED"] } } });
      const recent = await tx.campaignRecipient.count({ where: { campaignId: id, queuedAt: { gte: new Date(now.getTime() - 60_000) } } });
      const quota = conn && c.template?.status === "APPROVED" ? Math.max(0, c.sendRatePerMinute - recent) : 0; // provider down → wait, never fail the campaign
      let queued = 0;
      let skipped = 0;
      if (quota) {
        const batch = await tx.campaignRecipient.findMany({ where: { campaignId: id, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: quota });
        const consent = await consentMap(tx, org, batch.map((b) => b.phone));
        for (const rec of batch) {
          // consent re-checked at send time: an opt-out after the snapshot wins
          const why = skipReason(consent.get(rec.phone), c.requireOptIn);
          if (why) {
            await tx.campaignRecipient.update({ where: { id: rec.id }, data: { status: "SKIPPED", skipReason: `${why}_AFTER_SNAPSHOT` } });
            await uow.audit({ action: "campaign.recipient_skipped", entityType: "MarketingCampaign", entityId: id, after: { recipientId: rec.id, reason: why, phase: "send" } });
            skipped++;
            continue;
          }
          const guard = await tx.campaignMessage.createMany({ data: [{ campaignId: id, recipientId: rec.id, messageVersion: c.version }], skipDuplicates: true });
          if (!guard.count) continue; // already queued for this version → never a second send
          const conv = await tx.whatsAppConversation.upsert({ where: { organizationId_waId: { organizationId: org, waId: rec.phone } }, create: { organizationId: org, connectionId: conn!.id, waId: rec.phone, profileName: null, leadId: rec.leadId, contactId: rec.contactId, clientId: rec.clientId, matchState: rec.leadId || rec.contactId || rec.clientId ? "MATCHED" : "UNMATCHED" }, update: { lastMessageAt: now } });
          const msg = await tx.whatsAppMessage.create({ data: { organizationId: org, conversationId: conv.id, direction: "OUTBOUND", messageType: "template", body: `[campaign ${c.number} · ${c.template!.name}]`, status: "QUEUED", campaignRecipientId: rec.id, metadata: { campaignId: id, template: c.template!.name } } });
          const ob = await enqueue(tx, org, { provider: "WHATSAPP", connectionId: conn!.id, eventType: "whatsapp.send", idempotencyKey: `campaign:${id}:${rec.id}:${c.version}`, entityType: "CampaignRecipient", entityId: rec.id, payload: { messageId: msg.id, campaignId: id, message: templateMessage(rec.phone, c.template!.name, c.template!.language, fill((c.templateParams ?? []) as string[], rec)) } });
          await tx.campaignMessage.update({ where: { campaignId_recipientId_messageVersion: { campaignId: id, recipientId: rec.id, messageVersion: c.version } }, data: { outboxId: ob.id, waMessageId: msg.id } });
          await tx.campaignRecipient.update({ where: { id: rec.id }, data: { status: "QUEUED", queuedAt: now } });
          queued++;
        }
      }
      const open = await tx.campaignRecipient.count({ where: { campaignId: id, status: { in: ["PENDING", "QUEUED"] } } });
      if (open) return { queued, done: null, skipped };
      const delivered = await tx.campaignRecipient.count({ where: { campaignId: id, status: { in: ["SENT", "DELIVERED", "READ", "REPLIED"] } } });
      const failed = await tx.campaignRecipient.count({ where: { campaignId: id, status: "FAILED" } });
      const done = !delivered && failed ? ("FAILED" as const) : ("COMPLETED" as const);
      await tx.marketingCampaign.update({ where: { id }, data: done === "FAILED" ? { status: "FAILED", failedAt: now, failureReason: "ALL_DELIVERIES_FAILED" } : { status: "COMPLETED", completedAt: now } });
      await uow.audit({ action: done === "FAILED" ? "campaign.failed" : "campaign.completed", entityType: "MarketingCampaign", entityId: id, after: { delivered, failed } });
      uow.emit({ type: done === "FAILED" ? "campaign.failed" : "campaign.completed", entityType: "MarketingCampaign", entityId: id, payload: { campaignId: id, number: c.number, createdById: c.createdById, delivered, failed } });
      return { queued, done, skipped };
    });
    out.queued += r.queued;
    out.skipped += r.skipped;
    if (r.done === "COMPLETED") out.completed++;
    if (r.done === "FAILED") out.failed++;
  }
  return out;
}

// --- dashboard -----------------------------------------------------------------------------------------

/** Marketing dashboard — every figure is a count or sum of real rows; billed and collected are never merged. */
export async function marketingDashboard(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "marketing.view");
  const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(raw ?? {});
  const o = ctx.organizationId;
  const since = new Date(Date.now() - days * 86_400_000);
  const [byStatus, sources, inbound, unmatched, optOuts, campaigns, spend, recipients] = await Promise.all([
    prisma.marketingCampaign.groupBy({ by: ["status"], where: { organizationId: o }, _count: { _all: true } }),
    prisma.attributionTouch.groupBy({ by: ["source"], where: { organizationId: o, touchType: "FIRST", occurredAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 10 }),
    prisma.whatsAppMessage.count({ where: { organizationId: o, direction: "INBOUND", createdAt: { gte: since } } }),
    prisma.whatsAppConversation.count({ where: { organizationId: o, matchState: { in: ["UNMATCHED", "AMBIGUOUS"] } } }),
    prisma.contactConsent.count({ where: { organizationId: o, status: "OPTED_OUT", recordedAt: { gte: since } } }),
    prisma.marketingCampaign.findMany({ where: { organizationId: o, status: { in: ["RUNNING", "PAUSED", "COMPLETED", "READY"] } }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, number: true, name: true, channel: true, status: true, currency: true, recipientCount: true } }),
    prisma.campaignSpend.groupBy({ by: ["campaignId", "source"], where: { campaign: { organizationId: o } }, _sum: { amount: true } }),
    prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaign: { organizationId: o } }, _count: { _all: true } })
  ]);
  const reports = can(ctx, "marketing.reports.view");
  const funnel = reports && campaigns.length ? await campaignFunnel(o, campaigns.map((c) => c.id), "first") : {};
  const rows = campaigns.map((c) => {
    const rs = recipients.filter((r) => r.campaignId === c.id);
    const n = (...st: string[]) => rs.filter((r) => st.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
    const manual = spend.filter((s) => s.campaignId === c.id && s.source === "MANUAL").reduce((a, s) => a.plus(s._sum.amount ?? 0), D(0));
    const f = (funnel as Record<string, { leads: number; billed: string; collected: string; won: number; opportunities: number }>)[c.id];
    return {
      ...c,
      sent: n("SENT", "DELIVERED", "READ", "REPLIED"), delivered: n("DELIVERED", "READ", "REPLIED"), read: n("READ", "REPLIED"), replied: n("REPLIED"), failed: n("FAILED"), skipped: n("SKIPPED"),
      spendManual: r2(manual).toFixed(2),
      leads: f?.leads ?? null, opportunities: f?.opportunities ?? null, won: f?.won ?? null, billed: f?.billed ?? null, collected: f?.collected ?? null,
      // cost per lead only when both numbers are real
      costPerLead: f && f.leads > 0 && manual.gt(0) ? r2(manual.div(f.leads)).toFixed(2) : null
    };
  });
  return {
    days,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    sources: sources.map((s) => ({ source: s.source, leads: s._count._all })),
    whatsapp: { inbound, needsMatching: unmatched, optOuts },
    campaigns: rows,
    reports
  };
}

/** For search / attention: campaigns needing action. */
export async function campaignAttention(ctx: Ctx) {
  if (!can(ctx, "marketing.view")) return [];
  return prisma.marketingCampaign.findMany({ where: { organizationId: ctx.organizationId, OR: [{ status: "FAILED", failedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, { status: "READY" }] }, take: 10, select: { id: true, number: true, name: true, status: true } });
}

export type CampaignDetail = Awaited<ReturnType<typeof getCampaign>>;
