import { z } from "zod";
import { Prisma, type ConsentChannel, type ConsentStatus, type IntegrationConnection, type WaMessageStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, canAny, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { normPhone, optId, optText, reqText } from "../crm/normalize";
import { clientWhere, ownedWhere } from "../crm/scope";
import { createLeadTx, leadCreateSchema } from "../crm/leads";
import { createTicket, ticketWhere } from "../ops/support";
import { addNote } from "../crm/activities";
import { enqueue, registerFailureHook, registerOutboxHandler } from "../integrations/outbox";
import { connectionFor, recordExecution } from "../integrations/registry";
import { whatsapp as wa } from "../integrations/adapters";
import { IntegrationError } from "../integrations/http";

/**
 * WhatsApp Business Platform (official Cloud API only — no personal WhatsApp, no QR scraping, no passwords).
 * Inbound: webhook → messages stored once (unique provider message id) → conversation matched to CRM only when
 * exactly one record matches; ambiguous matches are shown to an operator, never merged.
 * Outbound: queued in the outbox and sent by the worker; provider failures never roll back the OS state.
 */

const OPT_OUT = /^\s*(stop|unsubscribe|إلغاء|الغاء|إيقاف|ايقاف|توقف)\s*$/i;
const RANK: Record<WaMessageStatus, number> = { RECEIVED: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };

// --- consent -----------------------------------------------------------------------------------

export async function currentConsent(db: Tx | typeof prisma, organizationId: string, channel: ConsentChannel, address: string): Promise<ConsentStatus> {
  const c = await db.contactConsent.findFirst({ where: { organizationId, channel, address }, orderBy: { recordedAt: "desc" }, select: { status: true } });
  return c?.status ?? "UNKNOWN";
}

async function writeConsent(tx: Tx, uow: Uow, organizationId: string, e: { channel: ConsentChannel; address: string; status: ConsentStatus; source: string; note?: string | null; leadId?: string | null; contactId?: string | null; recordedById?: string | null }) {
  const before = await currentConsent(tx, organizationId, e.channel, e.address);
  if (before === e.status) return before;
  await tx.contactConsent.create({ data: { organizationId, ...e, note: e.note ?? null, leadId: e.leadId ?? null, contactId: e.contactId ?? null, recordedById: e.recordedById ?? null } });
  await uow.audit({ action: "consent.changed", entityType: "ContactConsent", entityId: e.address, before: { status: before }, after: { channel: e.channel, status: e.status, source: e.source } });
  return before;
}

const consentSchema = z.object({ channel: z.enum(["WHATSAPP", "EMAIL", "SMS", "PHONE"]).default("WHATSAPP"), address: reqText(4, 200), status: z.enum(["OPTED_IN", "OPTED_OUT", "BLOCKED"]), source: reqText(2, 80), note: optText(500) });

/** Explicit consent change. Re-enabling an opted-out / blocked address needs a recorded reason (never silent). */
export async function setConsent(ctx: Ctx, raw: unknown) {
  if (!canAny(ctx, "whatsapp.manage", "marketing.manage")) throw forbidden("whatsapp.manage");
  const input = consentSchema.parse(raw);
  const address = input.channel === "EMAIL" ? input.address.trim().toLowerCase() : normPhone(input.address);
  if (!address) throw invalid("ADDRESS_INVALID");
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await currentConsent(tx, ctx.organizationId, input.channel, address);
    if ((before === "OPTED_OUT" || before === "BLOCKED") && input.status === "OPTED_IN" && !input.note) throw invalid("REOPT_IN_REASON_REQUIRED");
    await writeConsent(tx, uow, ctx.organizationId, { channel: input.channel, address, status: input.status, source: input.source, note: input.note, recordedById: ctx.userId || null });
  });
}

// --- contact matching ----------------------------------------------------------------------------

export type Candidate = { type: "lead" | "contact" | "client"; id: string; label: string; clientId?: string | null };

/** All CRM records with this phone. Exactly one distinct person → safe match; more → ambiguous (operator decides). */
export async function matchPhone(db: Tx | typeof prisma, organizationId: string, phone: string): Promise<Candidate[]> {
  const [contacts, clients, leads] = await Promise.all([
    db.contact.findMany({ where: { organizationId, phoneNormalized: phone, deletedAt: null }, select: { id: true, firstName: true, lastName: true, clientId: true } }),
    db.client.findMany({ where: { organizationId, phoneNormalized: phone, deletedAt: null }, select: { id: true, displayName: true } }),
    db.lead.findMany({ where: { organizationId, OR: [{ phoneNormalized: phone }, { whatsappNormalized: phone }], status: { not: "ARCHIVED" } }, select: { id: true, number: true, name: true, convertedClientId: true } })
  ]);
  const out: Candidate[] = contacts.map((c) => ({ type: "contact" as const, id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim(), clientId: c.clientId }));
  const coveredClients = new Set(contacts.map((c) => c.clientId).filter(Boolean));
  for (const c of clients) if (!coveredClients.has(c.id)) out.push({ type: "client", id: c.id, label: c.displayName, clientId: c.id });
  const allClients = new Set(out.map((o) => o.clientId).filter(Boolean));
  // a lead already converted into a matched client is the same person, not a second candidate
  for (const l of leads) if (!l.convertedClientId || !allClients.has(l.convertedClientId)) out.push({ type: "lead", id: l.id, label: `${l.number} · ${l.name}` });
  return out;
}

const linkData = (c: Candidate) => (c.type === "lead" ? { leadId: c.id } : c.type === "contact" ? { contactId: c.id, clientId: c.clientId ?? null } : { clientId: c.id });

// --- inbound webhook processing -------------------------------------------------------------------

const waPayload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        messaging_product: z.string().optional(),
        contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string().max(200) }).partial().optional() })).optional(),
        messages: z.array(z.object({ from: z.string().max(32), id: z.string().max(200), timestamp: z.string().max(20), type: z.string().max(30), text: z.object({ body: z.string().max(4096) }).optional(), button: z.object({ text: z.string().max(500) }).partial().optional(), interactive: z.unknown().optional(), image: z.object({ id: z.string(), mime_type: z.string().optional() }).partial().optional(), document: z.object({ id: z.string(), mime_type: z.string().optional(), filename: z.string().optional() }).partial().optional() }).passthrough()).optional(),
        statuses: z.array(z.object({ id: z.string().max(200), status: z.enum(["sent", "delivered", "read", "failed"]), timestamp: z.string().max(20), recipient_id: z.string().max(32).optional(), errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() }).passthrough()).optional() })).optional(),
        event: z.string().optional(),
        message_template_id: z.union([z.string(), z.number()]).optional(),
        message_template_name: z.string().optional(),
        message_template_language: z.string().optional(),
        reason: z.string().nullable().optional()
      }).passthrough()
    }))
  }))
});
export type WaPayload = z.infer<typeof waPayload>;
export const parseWaPayload = (body: unknown) => waPayload.safeParse(body);

const ts = (s: string) => new Date(Number(s) * 1000);

/** Runs inside the webhook's transaction; every write is idempotent on provider ids. */
export async function processWhatsAppPayload(tx: Tx, uow: Uow, conn: IntegrationConnection, p: WaPayload) {
  const org = conn.organizationId;
  const stats = { messages: 0, duplicates: 0, statuses: 0, templates: 0 };
  for (const entry of p.entry)
    for (const change of entry.changes) {
      const v = change.value;
      if (change.field === "message_template_status_update" && v.message_template_name) {
        const status = (["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"].includes(String(v.event)) ? v.event : "UNKNOWN") as "APPROVED";
        const r = await tx.whatsAppTemplate.updateMany({ where: { organizationId: org, name: v.message_template_name, ...(v.message_template_language ? { language: v.message_template_language } : {}) }, data: { status, syncedAt: new Date(), providerTemplateId: v.message_template_id ? String(v.message_template_id) : undefined } });
        stats.templates += r.count;
        continue;
      }
      for (const m of v.messages ?? []) {
        const waId = normPhone(m.from);
        if (!waId) continue;
        const profile = v.contacts?.find((c) => normPhone(c.wa_id) === waId)?.profile?.name ?? null;
        let conv = await tx.whatsAppConversation.findUnique({ where: { organizationId_waId: { organizationId: org, waId } } });
        if (!conv) {
          const cands = await matchPhone(tx, org, waId);
          conv = await tx.whatsAppConversation.create({ data: { organizationId: org, connectionId: conn.id, waId, profileName: profile, matchState: cands.length === 1 ? "MATCHED" : cands.length > 1 ? "AMBIGUOUS" : "UNMATCHED", candidates: cands.length > 1 ? (cands as unknown as Prisma.InputJsonValue) : undefined, ...(cands.length === 1 ? linkData(cands[0]) : {}) } });
        }
        const body = m.text?.body ?? m.button?.text ?? null;
        const media = m.image ?? m.document ?? null;
        const created = await tx.whatsAppMessage.createMany({
          data: [{ organizationId: org, conversationId: conv.id, direction: "INBOUND", providerMessageId: m.id, messageType: m.type, body, metadata: media ? ({ mediaId: media.id ?? null, mime: media.mime_type ?? null, stored: false } as Prisma.InputJsonValue) : undefined, status: "RECEIVED", sentAt: ts(m.timestamp) }],
          skipDuplicates: true
        });
        if (!created.count) {
          stats.duplicates++;
          continue;
        }
        stats.messages++;
        await tx.whatsAppConversation.update({ where: { id: conv.id }, data: { lastMessageAt: ts(m.timestamp), lastInboundAt: ts(m.timestamp), ...(profile && !conv.profileName ? { profileName: profile } : {}) } });
        if (body && OPT_OUT.test(body)) await writeConsent(tx, uow, org, { channel: "WHATSAPP", address: waId, status: "OPTED_OUT", source: "whatsapp_keyword", leadId: conv.leadId, contactId: conv.contactId });
        // reply to a recent campaign message → REPLIED (real provider data only)
        const recent = await tx.campaignRecipient.findFirst({ where: { campaign: { organizationId: org }, phone: waId, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { sentAt: "desc" } });
        if (recent) await tx.campaignRecipient.update({ where: { id: recent.id }, data: { status: "REPLIED", repliedAt: ts(m.timestamp) } });
        uow.emit({ type: "whatsapp.message_received", entityType: "WhatsAppConversation", entityId: conv.id, payload: { conversationId: conv.id, matched: conv.matchState, waIdLast4: waId.slice(-4) } });
      }
      for (const s of v.statuses ?? []) {
        stats.statuses++;
        const status = s.status.toUpperCase() as WaMessageStatus;
        const at = ts(s.timestamp);
        const msg = await tx.whatsAppMessage.findUnique({ where: { organizationId_providerMessageId: { organizationId: org, providerMessageId: s.id } } });
        if (msg && RANK[status] > RANK[msg.status]) {
          await tx.whatsAppMessage.update({ where: { id: msg.id }, data: { status, ...(status === "DELIVERED" ? { deliveredAt: at } : status === "READ" ? { readAt: at, deliveredAt: msg.deliveredAt ?? at } : status === "FAILED" ? { failedAt: at, errorCode: s.errors?.[0]?.code ? String(s.errors[0].code) : "FAILED" } : { sentAt: at }) } });
          if (status === "FAILED") uow.emit({ type: "whatsapp.message_failed", entityType: "WhatsAppMessage", entityId: msg.id, payload: { messageId: msg.id, code: s.errors?.[0]?.code ?? null } });
        }
        const rec = await tx.campaignRecipient.findFirst({ where: { campaign: { organizationId: org }, providerMessageId: s.id } });
        if (rec && rec.status !== "REPLIED" && rec.status !== "FAILED") {
          const rStatus = status === "SENT" ? "SENT" : status === "DELIVERED" ? "DELIVERED" : status === "READ" ? "READ" : "FAILED";
          const order = ["PENDING", "QUEUED", "SENT", "DELIVERED", "READ"];
          if (rStatus === "FAILED" || order.indexOf(rStatus) > order.indexOf(rec.status)) await tx.campaignRecipient.update({ where: { id: rec.id }, data: { status: rStatus, ...(rStatus === "DELIVERED" ? { deliveredAt: at } : rStatus === "READ" ? { readAt: at } : rStatus === "FAILED" ? { failedAt: at, errorCode: s.errors?.[0]?.code ? String(s.errors[0].code) : "FAILED" } : {}) } });
        }
      }
    }
  return stats;
}

// --- operator actions ----------------------------------------------------------------------------

const VIEW = (ctx: Ctx) => requirePermission(ctx, "whatsapp.view");

export async function listConversations(ctx: Ctx, raw: unknown) {
  VIEW(ctx);
  const { filter, q } = z.object({ filter: z.enum(["all", "unmatched", "ambiguous", "matched"]).default("all"), q: z.string().trim().max(60).optional() }).parse(raw ?? {});
  const where: Prisma.WhatsAppConversationWhereInput = { organizationId: ctx.organizationId, ...(filter === "all" ? {} : { matchState: filter.toUpperCase() as "MATCHED" }), ...(q ? { OR: [{ waId: { contains: q.replace(/\D/g, "") || q } }, { profileName: { contains: q, mode: "insensitive" } }] } : {}) };
  const rows = await prisma.whatsAppConversation.findMany({ where, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, take: 100, include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, messageType: true, createdAt: true } } } });
  const counts = Object.fromEntries(await Promise.all((["MATCHED", "AMBIGUOUS", "UNMATCHED"] as const).map(async (s) => [s, await prisma.whatsAppConversation.count({ where: { organizationId: ctx.organizationId, matchState: s } })] as const)));
  return { rows, counts };
}

export async function getConversation(ctx: Ctx, id: string) {
  VIEW(ctx);
  const c = await prisma.whatsAppConversation.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } } });
  if (!c) throw notFound("WhatsAppConversation");
  // linked CRM records are shown only to people who can see them in CRM
  const [lead, contact, client, ticket, consent, conn] = await Promise.all([
    c.leadId && can(ctx, "crm.leads.view") ? prisma.lead.findFirst({ where: { id: c.leadId, ...(await ownedWhere(ctx)) }, select: { id: true, number: true, name: true, status: true } }) : null,
    c.contactId && can(ctx, "crm.contacts.view") ? prisma.contact.findFirst({ where: { id: c.contactId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, clientId: true } }) : null,
    c.clientId && can(ctx, "crm.clients.view") ? prisma.client.findFirst({ where: { id: c.clientId, ...(await clientWhere(ctx)) }, select: { id: true, number: true, displayName: true } }) : null,
    c.ticketId ? prisma.supportTicket.findFirst({ where: { AND: [{ id: c.ticketId, organizationId: ctx.organizationId }, await ticketWhere(ctx)] }, select: { id: true, number: true, subject: true, status: true } }) : null,
    currentConsent(prisma, ctx.organizationId, "WHATSAPP", c.waId),
    connectionFor(ctx.organizationId, "WHATSAPP")
  ]);
  const windowOpen = Boolean(c.lastInboundAt && Date.now() - c.lastInboundAt.getTime() < 24 * 3600_000);
  const templates = await prisma.whatsAppTemplate.findMany({ where: { organizationId: ctx.organizationId, status: "APPROVED" }, orderBy: { name: "asc" } });
  return { conversation: c, lead, contact, client, ticket, consent, windowOpen, templates, connectionStatus: conn?.status ?? "NOT_CONFIGURED", connectionEnv: conn?.environment ?? null };
}

async function lockConv(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "WhatsAppConversation" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const c = await tx.whatsAppConversation.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("WhatsAppConversation");
  return c;
}

/** Explicit link to ONE CRM record the operator can see (resolves an ambiguous / unmatched conversation). */
export async function linkConversation(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "whatsapp.send");
  const input = z.object({ type: z.enum(["lead", "contact", "client"]), targetId: z.string().min(1) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockConv(tx, ctx, id);
    let data: { leadId?: string | null; contactId?: string | null; clientId?: string | null };
    if (input.type === "lead") {
      if (!can(ctx, "crm.leads.view") || !(await tx.lead.findFirst({ where: { id: input.targetId, organizationId: ctx.organizationId, ...(await ownedWhere(ctx)) } }))) throw invalid("UNKNOWN_LEAD");
      data = { leadId: input.targetId };
    } else if (input.type === "contact") {
      const ct = can(ctx, "crm.contacts.view") ? await tx.contact.findFirst({ where: { id: input.targetId, organizationId: ctx.organizationId }, select: { id: true, clientId: true } }) : null;
      if (!ct) throw invalid("UNKNOWN_CONTACT");
      data = { contactId: ct.id, clientId: ct.clientId };
    } else {
      if (!can(ctx, "crm.clients.view") || !(await tx.client.findFirst({ where: { id: input.targetId, organizationId: ctx.organizationId, ...(await clientWhere(ctx)) } }))) throw invalid("UNKNOWN_CLIENT");
      data = { clientId: input.targetId };
    }
    await tx.whatsAppConversation.update({ where: { id }, data: { ...data, matchState: "MATCHED", candidates: Prisma.DbNull } });
    await uow.audit({ action: "whatsapp.conversation_linked", entityType: "WhatsAppConversation", entityId: id, before: { matchState: c.matchState, leadId: c.leadId, contactId: c.contactId, clientId: c.clientId }, after: { ...data, matchState: "MATCHED" } });
  });
}

/** Explicit: create a lead from the conversation (source WHATSAPP; campaign attribution when it replied to one). */
export async function createLeadFromConversation(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "whatsapp.view");
  requirePermission(ctx, "crm.leads.create");
  const input = z.object({ name: reqText(2, 160), companyName: optText(160), notes: optText(2000) }).parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockConv(tx, ctx, id);
    if (c.leadId) throw conflict("CONVERSATION_ALREADY_HAS_LEAD");
    const replied = await tx.campaignRecipient.findFirst({ where: { campaign: { organizationId: ctx.organizationId }, phone: c.waId, status: "REPLIED" }, orderBy: { repliedAt: "desc" }, select: { campaignId: true } });
    const data = leadCreateSchema.parse({ name: input.name, companyName: input.companyName, whatsapp: `+${c.waId}`, source: "WHATSAPP", ownerId: ctx.userId, notes: input.notes, nextFollowUpAt: new Date() });
    const lead = await createLeadTx(tx, uow, ctx, data, {
      touch: { source: "whatsapp", medium: replied ? "whatsapp_campaign" : "whatsapp", campaignId: replied?.campaignId ?? null }
    });
    await tx.whatsAppConversation.update({ where: { id }, data: { leadId: lead.id, matchState: "MATCHED", candidates: Prisma.DbNull } });
    await uow.audit({ action: "whatsapp.lead_created", entityType: "WhatsAppConversation", entityId: id, after: { leadId: lead.id, number: lead.number, campaignId: replied?.campaignId ?? null } });
    return { id: lead.id };
  });
}

/** Explicit: turn the conversation into a support ticket (never automatic). */
export async function createTicketFromConversation(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "whatsapp.view");
  const input = z.object({ subject: reqText(3, 200), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), category: z.enum(["TECHNICAL", "BUG", "ACCESS", "CHANGE_REQUEST", "BILLING", "QUESTION", "OTHER"]).default("TECHNICAL") }).parse(raw);
  const c = await prisma.whatsAppConversation.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 5 } } });
  if (!c) throw notFound("WhatsAppConversation");
  if (c.ticketId) throw conflict("CONVERSATION_ALREADY_HAS_TICKET");
  const description = [`WhatsApp +${c.waId}${c.profileName ? ` (${c.profileName})` : ""}`, ...c.messages.reverse().map((m) => `> ${m.body ?? `[${m.messageType}]`}`)].join("\n");
  const visibleClient = c.clientId && can(ctx, "crm.clients.view") && (await prisma.client.findFirst({ where: { id: c.clientId, ...(await clientWhere(ctx)) }, select: { id: true } })) ? c.clientId : null;
  const t = await createTicket(ctx, { subject: input.subject, description, priority: input.priority, category: input.category, source: "OTHER", clientId: visibleClient, tags: "whatsapp" });
  await unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.whatsAppConversation.updateMany({ where: { id, ticketId: null }, data: { ticketId: t.id } });
    if (r.count !== 1) throw conflict("CONVERSATION_ALREADY_HAS_TICKET");
    await uow.audit({ action: "whatsapp.ticket_created", entityType: "WhatsAppConversation", entityId: id, after: { ticketId: t.id, number: t.number } });
  });
  return { id: t.id };
}

/** Explicit CRM note on the linked lead / client. */
export async function addConversationNote(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "whatsapp.view");
  const { body } = z.object({ body: reqText(2, 4000) }).parse(raw);
  const c = await prisma.whatsAppConversation.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("WhatsAppConversation");
  const target = c.leadId ? { entityType: "LEAD" as const, entityId: c.leadId } : c.clientId ? { entityType: "CLIENT" as const, entityId: c.clientId } : null;
  if (!target) throw conflict("CONVERSATION_NOT_LINKED");
  await addNote(ctx, { ...target, body: `WhatsApp: ${body}` });
}

const replySchema = z.object({ body: optText(4096), templateId: optId, params: z.preprocess((v) => (typeof v === "string" ? v.split("|").map((x) => x.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(500)).max(10)) });

/** Operator reply: free text only inside the 24-hour customer window, otherwise an APPROVED template. Queued → worker sends. */
export async function sendReply(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "whatsapp.send");
  const input = replySchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lockConv(tx, ctx, id);
    const conn = await connectionFor(ctx.organizationId, "WHATSAPP");
    if (!conn || !["CONNECTED", "DEGRADED"].includes(conn.status)) throw conflict(`WHATSAPP_NOT_CONNECTED:${conn?.status ?? "NOT_CONFIGURED"}`);
    if ((await currentConsent(tx, ctx.organizationId, "WHATSAPP", c.waId)) === "BLOCKED") throw conflict("CONTACT_BLOCKED");
    const windowOpen = Boolean(c.lastInboundAt && Date.now() - c.lastInboundAt.getTime() < 24 * 3600_000);
    let message: Record<string, unknown>;
    let body: string | null = null;
    if (input.templateId) {
      const tpl = await tx.whatsAppTemplate.findFirst({ where: { id: input.templateId, organizationId: ctx.organizationId } });
      if (!tpl || tpl.status !== "APPROVED") throw conflict("TEMPLATE_NOT_APPROVED");
      message = templateMessage(c.waId, tpl.name, tpl.language, input.params);
      body = `[template ${tpl.name}]`;
    } else {
      if (!input.body) throw invalid("MESSAGE_REQUIRED");
      if (!windowOpen) throw conflict("TEMPLATE_REQUIRED_OUTSIDE_WINDOW");
      message = { to: c.waId, type: "text", text: { body: input.body } };
      body = input.body;
    }
    const msg = await tx.whatsAppMessage.create({ data: { organizationId: ctx.organizationId, conversationId: id, direction: "OUTBOUND", messageType: input.templateId ? "template" : "text", body, status: "QUEUED", createdById: ctx.userId || null } });
    await enqueue(tx, ctx.organizationId, { provider: "WHATSAPP", connectionId: conn.id, eventType: "whatsapp.send", idempotencyKey: `wa:msg:${msg.id}`, entityType: "WhatsAppMessage", entityId: msg.id, payload: { messageId: msg.id, message } });
    await tx.whatsAppConversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    await uow.audit({ action: "whatsapp.message_sent", entityType: "WhatsAppConversation", entityId: id, after: { messageId: msg.id, type: msg.messageType, queued: true } });
    return { id: msg.id };
  });
}

export const templateMessage = (to: string, name: string, language: string, params: string[]) => ({
  to, type: "template",
  template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) }
});

/** Pull template statuses from the provider (the only source of "approved"). */
export async function syncTemplates(ctx: Ctx) {
  requirePermission(ctx, "whatsapp.manage");
  const conn = await connectionFor(ctx.organizationId, "WHATSAPP");
  if (!conn || !["CONNECTED", "DEGRADED"].includes(conn.status)) throw conflict(`WHATSAPP_NOT_CONNECTED:${conn?.status ?? "NOT_CONFIGURED"}`);
  const started = new Date();
  let list: Awaited<ReturnType<typeof wa.templates>>;
  try {
    list = await wa.templates(conn);
  } catch (e) {
    await recordExecution(prisma, { organizationId: ctx.organizationId, connectionId: conn.id, provider: "WHATSAPP", direction: "OUTBOUND", action: "templates.sync", ok: false, errorCode: (e as IntegrationError).code ?? "ERROR", error: (e as Error).message, startedAt: started });
    throw conflict(`PROVIDER_ERROR:${(e as IntegrationError).code ?? "ERROR"}`);
  }
  return unitOfWork(ctx, async (tx, uow) => {
    for (const t of list) {
      const status = (["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"].includes(String(t.status)) ? t.status : "UNKNOWN") as "APPROVED";
      await tx.whatsAppTemplate.upsert({
        where: { organizationId_name_language: { organizationId: ctx.organizationId, name: t.name, language: t.language } },
        create: { organizationId: ctx.organizationId, connectionId: conn.id, providerTemplateId: t.id, name: t.name, language: t.language, category: t.category ?? null, status, components: (t.components ?? undefined) as Prisma.InputJsonValue, syncedAt: new Date() },
        update: { providerTemplateId: t.id, category: t.category ?? null, status, components: (t.components ?? undefined) as Prisma.InputJsonValue, syncedAt: new Date() }
      });
    }
    await tx.integrationConnection.update({ where: { id: conn.id }, data: { lastSuccessfulSyncAt: new Date() } });
    await recordExecution(tx, { organizationId: ctx.organizationId, connectionId: conn.id, provider: "WHATSAPP", direction: "OUTBOUND", action: "templates.sync", ok: true, metadata: { count: list.length }, startedAt: started });
    await uow.audit({ action: "whatsapp.templates_synced", entityType: "IntegrationConnection", entityId: conn.id, after: { count: list.length } });
    return { count: list.length };
  });
}

export const listTemplates = (ctx: Ctx) => (VIEW(ctx), prisma.whatsAppTemplate.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ status: "asc" }, { name: "asc" }] }));

// --- outbox handler -------------------------------------------------------------------------------

registerOutboxHandler("whatsapp.send", async (item) => {
  const { messageId, message } = item.payload as { messageId: string; message: Record<string, unknown> };
  const conn = item.connectionId ? await prisma.integrationConnection.findUnique({ where: { id: item.connectionId } }) : null;
  if (!conn || conn.status === "DISABLED") throw new IntegrationError("NOT_CONNECTED", "WhatsApp connection disabled or missing", false);
  if (!["CONNECTED", "DEGRADED"].includes(conn.status)) throw new IntegrationError("NOT_CONNECTED", `WhatsApp connection is ${conn.status}`, true);
  const msg = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new IntegrationError("MESSAGE_MISSING", "message row missing", false);
  if (msg.providerMessageId) return { externalReference: msg.providerMessageId }; // already sent (idempotent retry)
  if (msg.campaignRecipientId) {
    const rec = await prisma.campaignRecipient.findUnique({ where: { id: msg.campaignRecipientId }, select: { campaign: { select: { status: true } } } });
    if (rec?.campaign.status === "CANCELLED") {
      // cancelled after queueing: drop, never send
      await prisma.$transaction([
        prisma.whatsAppMessage.update({ where: { id: messageId }, data: { status: "FAILED", failedAt: new Date(), errorCode: "CAMPAIGN_CANCELLED" } }),
        prisma.campaignRecipient.update({ where: { id: msg.campaignRecipientId }, data: { status: "SKIPPED", skipReason: "CAMPAIGN_CANCELLED" } })
      ]);
      return { externalReference: null };
    }
  }
  const providerId = await wa.send(conn, message);
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppMessage.update({ where: { id: messageId }, data: { providerMessageId: providerId, status: "SENT", sentAt: new Date() } });
    if (msg.campaignRecipientId) await tx.campaignRecipient.update({ where: { id: msg.campaignRecipientId }, data: { status: "SENT", sentAt: new Date(), providerMessageId: providerId } });
  });
  return { externalReference: providerId };
});

registerFailureHook("whatsapp.send", async (tx, item, error, dead) => {
  if (!dead) return;
  const { messageId } = item.payload as { messageId: string };
  const msg = await tx.whatsAppMessage.update({ where: { id: messageId }, data: { status: "FAILED", failedAt: new Date(), errorCode: error.code } });
  if (msg.campaignRecipientId) await tx.campaignRecipient.update({ where: { id: msg.campaignRecipientId }, data: { status: "FAILED", failedAt: new Date(), errorCode: error.code } });
});
