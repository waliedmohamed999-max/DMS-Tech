import { z } from "zod";
import { recordTouch, touchFromCapture } from "../marketing/attribution";
import { prisma } from "../db";
import { systemCtx, type Ctx } from "../context";
import { unitOfWork } from "../events/bus";
import { SERVICE_KEYS, WEBSITE_BUDGET_KEYS, WEBSITE_BUDGETS } from "@/lib/crm/services";
import { normEmail, normPhone } from "./normalize";
import { systemActivity } from "./activities";
import { createLeadTx } from "./leads";

/**
 * Public website → CRM lead capture.
 *
 * Only this whitelisted schema is accepted from the internet: no owner, status,
 * priority or any other internal CRM field can be set by a visitor. Internal IDs are
 * never returned. See docs/CRM.md "Website lead flow" for duplicate handling.
 */

const phoneRe = /^\+?[0-9\s()-]{8,20}$/;
const t = (max: number) => z.string().trim().max(max).optional().default("");

export const websiteLeadSchema = z
  .object({
    name: t(120),
    phone: t(25),
    whatsapp: t(25),
    email: t(160),
    company: t(160),
    service: t(60),
    budget: t(40),
    message: t(4000),
    source: z.enum(["quote", "contact", "hero", "cta", "career"]).default("quote"),
    locale: z.enum(["ar", "en"]).default("ar"),
    utm: z.record(z.string().regex(/^utm_(source|medium|campaign|term|content)$/), z.string().max(150)).optional(),
    referrer: z.string().max(300).optional().default(""),
    page: z.string().max(200).optional().default(""),
    /** honeypot: real users never fill it */
    website: z.string().max(0).optional(),
    /** ms since the form was rendered; bots submit instantly */
    elapsed: z.coerce.number().int().min(0).max(86_400_000).optional()
  })
  .refine((d) => (d.phone && phoneRe.test(d.phone)) || (d.email && z.email().safeParse(d.email).success) || (d.whatsapp && phoneRe.test(d.whatsapp)), {
    message: "contact",
    path: ["phone"]
  });

export type WebsiteLeadInput = z.input<typeof websiteLeadSchema>;

export type CaptureResult = { outcome: "created" | "appended" | "spam"; leadNumber?: string };

/** Heuristics that silently drop obvious spam (the visitor still sees success). */
export function spamReason(d: z.output<typeof websiteLeadSchema>): string | null {
  if (d.website) return "honeypot";
  if (d.elapsed !== undefined && d.elapsed < 1500) return "too_fast";
  const links = (d.message.match(/https?:\/\/|www\./gi) ?? []).length;
  if (links > 2) return "links";
  if (/<\s*(script|a\s+href|iframe)/i.test(d.message + d.name + d.company)) return "markup";
  return null;
}

async function orgId(): Promise<string> {
  const slug = process.env.OS_ORG_SLUG ?? "dms-tech";
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) throw new Error(`organization ${slug} not bootstrapped`);
  return org.id;
}

/**
 * Duplicate policy (safest, nothing is ever dropped or merged):
 * 1. Same normalized email/phone/WhatsApp as an OPEN or QUALIFIED lead → no new lead;
 *    the full submission is appended to that lead as a SYSTEM activity and the owner is notified.
 * 2. Matches only a CONVERTED / LOST / ARCHIVED lead or an existing client → a new lead is
 *    created with `duplicateOfId` pointing at the latest matching lead (a "returning" flag).
 * 3. No match → new lead.
 */
export async function captureWebsiteLead(raw: unknown, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<CaptureResult> {
  const d = websiteLeadSchema.parse(raw);
  const ctx: Ctx = systemCtx(await orgId(), meta);

  const spam = spamReason(d);
  if (spam) {
    await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, action: "website.lead_rejected_spam", entityType: "Lead", after: { reason: spam }, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
    return { outcome: "spam" };
  }

  const email = normEmail(d.email || null);
  const phone = normPhone(d.phone || null);
  const wa = normPhone(d.whatsapp || null);
  const service = (SERVICE_KEYS as readonly string[]).includes(d.service) ? d.service : d.service ? "other" : null;
  const budget = WEBSITE_BUDGET_KEYS.includes(d.budget) ? WEBSITE_BUDGETS[d.budget] : null;
  const captureMeta = { form: d.source, utm: d.utm ?? {}, referrer: d.referrer || null, page: d.page || null, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 200) ?? null, budgetOption: d.budget || null, rawService: d.service || null };

  const matchOr = [
    ...(email ? [{ emailNormalized: email }] : []),
    ...(phone ? [{ phoneNormalized: phone }, { whatsappNormalized: phone }] : []),
    ...(wa ? [{ phoneNormalized: wa }, { whatsappNormalized: wa }] : [])
  ];

  return unitOfWork(ctx, async (tx, uow) => {
    const open = matchOr.length
      ? await tx.lead.findFirst({ where: { organizationId: ctx.organizationId, status: { in: ["OPEN", "QUALIFIED"] }, OR: matchOr }, orderBy: { createdAt: "desc" } })
      : null;

    if (open) {
      await systemActivity(tx, ctx, {
        entityType: "LEAD",
        entityId: open.id,
        title: "website.resubmission",
        description: d.message || null,
        metadata: { name: d.name, company: d.company, email: d.email, phone: d.phone, whatsapp: d.whatsapp, service, ...captureMeta }
      });
      await tx.lead.update({ where: { id: open.id }, data: { lastActivityAt: new Date(), nextFollowUpAt: open.nextFollowUpAt ?? new Date() } });
      // later contact → a new TOUCH (last touch); the first touch is never overwritten
      await recordTouch(tx, uow, ctx.organizationId, open.id, touchFromCapture("website", captureMeta));
      await uow.audit({ action: "website.lead_appended", entityType: "Lead", entityId: open.id, after: { reason: "open_duplicate" } });
      uow.emit({ type: "website.lead_received", entityType: "Lead", entityId: open.id, payload: { leadId: open.id, number: open.number, name: open.name, ownerId: open.ownerId, duplicate: true } });
      return { outcome: "appended" as const, leadNumber: open.number };
    }

    const previous = matchOr.length
      ? await tx.lead.findFirst({ where: { organizationId: ctx.organizationId, OR: matchOr }, orderBy: { createdAt: "desc" }, select: { id: true } })
      : null;

    const lead = await createLeadTx(
      tx,
      uow,
      ctx,
      {
        name: d.name || d.company || d.email || d.phone || d.whatsapp || "Website visitor",
        companyName: d.company || null,
        email: d.email || null,
        phone: d.phone || null,
        whatsapp: d.whatsapp || null,
        source: "WEBSITE",
        interestedService: service as (typeof SERVICE_KEYS)[number] | null,
        serviceId: service ? ((await tx.service.findFirst({ where: { organizationId: ctx.organizationId, key: service, active: true }, select: { id: true } }))?.id ?? null) : null,
        budgetMin: budget?.min ?? null,
        budgetMax: budget?.max ?? null,
        currency: "SAR",
        ownerId: null,
        priority: "MEDIUM",
        nextFollowUpAt: new Date(),
        message: d.message || null,
        notes: null
      },
      { captureMeta, duplicateOfId: previous?.id ?? null, locale: d.locale }
    );
    uow.emit({ type: "website.lead_received", entityType: "Lead", entityId: lead.id, payload: { leadId: lead.id, number: lead.number, name: lead.name, ownerId: null, duplicate: false } });
    return { outcome: "created" as const, leadNumber: lead.number };
  });
}
