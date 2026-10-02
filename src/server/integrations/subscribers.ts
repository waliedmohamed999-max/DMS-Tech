import { prisma } from "../db";
import { subscribe } from "../events/bus";
import { usersWithAll } from "../events/subscribers";
import { customWebhook } from "./adapters";
import { enqueue, registerOutboxHandler } from "./outbox";
import { IntegrationError } from "./http";
import { ymd } from "../commercial/dates";

/**
 * Phase 8 subscribers (registered from registerSubscribers):
 *  · outbound CUSTOM webhooks: selected domain events → outbox (one row per connection × event, keyed by the
 *    DomainEvent id, so a re-dispatch never delivers twice). Only ids, numbers and amounts are sent — no personal notes.
 *  · notifications: INTEGRATIONS (failures / dead letters → integration managers) and MARKETING (campaign lifecycle).
 */

/** Events an external system may subscribe to (CUSTOM connection config `events`, comma-separated; "*" = all of these). */
export const OUTBOUND_EVENTS = ["lead.created", "lead.converted", "client.created", "opportunity.created", "opportunity.won", "quotation.accepted", "invoice.issued", "payment.recorded", "ticket.created", "ticket.resolved", "project.completed", "campaign.completed"] as const;
const SAFE_KEYS = new Set(["number", "source", "clientId", "projectId", "contractId", "invoiceId", "quotationId", "opportunityId", "leadId", "campaignId", "total", "amount", "currency", "status", "priority", "delivered", "failed", "recipients"]);

const pick = (p: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(p ?? {}).filter(([k, v]) => SAFE_KEYS.has(k) && (typeof v === "string" || typeof v === "number" || v === null)));

export function registerIntegrationSubscribers() {
  subscribe("*", async (e) => {
    if (!(OUTBOUND_EVENTS as readonly string[]).includes(e.type)) return;
    const conns = await prisma.integrationConnection.findMany({ where: { organizationId: e.organizationId, provider: "CUSTOM", status: { in: ["CONNECTED", "DEGRADED"] } } });
    for (const c of conns) {
      const wanted = String(((c.config ?? {}) as Record<string, string>).events ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!wanted.includes("*") && !wanted.includes(e.type)) continue;
      await prisma.$transaction((tx) =>
        enqueue(tx, e.organizationId, { provider: "CUSTOM", connectionId: c.id, eventType: "custom.deliver", idempotencyKey: `custom:${c.id}:${e.id}`, entityType: e.entityType, entityId: e.entityId, payload: { event: e.type, deliveryId: e.id, data: { entityType: e.entityType ?? null, entityId: e.entityId ?? null, ...pick(e.payload) } } })
      );
    }
  }, "integrations-outbound");

  // --- notifications ---
  const notify = async (organizationId: string, userIds: (string | null | undefined)[], category: "INTEGRATIONS" | "MARKETING", n: { ar: string; en: string; href: string; priority: "MEDIUM" | "HIGH"; key: string; entityType?: string | null; entityId?: string | null }, actorId?: string | null) => {
    const ids = [...new Set(userIds.filter((x): x is string => Boolean(x) && x !== actorId))];
    if (!ids.length) return;
    const users = await prisma.user.findMany({ where: { id: { in: ids }, organizationId, status: "ACTIVE" }, select: { id: true, locale: true } });
    await prisma.notification.createMany({ data: users.map((u) => ({ organizationId, userId: u.id, category, priority: n.priority, title: u.locale === "en" ? n.en : n.ar, href: n.href, entityType: n.entityType ?? null, entityId: n.entityId ?? null, dedupeKey: n.key })), skipDuplicates: true });
  };
  const managers = (org: string) => usersWithAll(org, ["integrations.manage"]);

  subscribe("integration.failed", async (e) => {
    const p = e.payload as { provider: string; code: string };
    await notify(e.organizationId, await managers(e.organizationId), "INTEGRATIONS", { ar: `فشل تكامل ${p.provider}: ${p.code}`, en: `${p.provider} integration failed: ${p.code}`, href: "/app/integrations", priority: "HIGH", key: `integration.failed:${e.entityId}:${ymd(new Date())}`, entityType: e.entityType, entityId: e.entityId }, e.actorId);
  });
  subscribe("integration.degraded", async (e) => {
    const p = e.payload as { provider: string };
    await notify(e.organizationId, await managers(e.organizationId), "INTEGRATIONS", { ar: `تكامل ${p.provider} يعمل بشكل متدهور`, en: `${p.provider} integration is degraded`, href: "/app/integrations", priority: "MEDIUM", key: `integration.degraded:${e.entityId}:${ymd(new Date())}`, entityType: e.entityType, entityId: e.entityId }, e.actorId);
  });
  subscribe("integration.dead_letter", async (e) => {
    const p = e.payload as { provider: string; eventType: string; code: string };
    // one notification per provider per day — a burst of failures must not flood inboxes
    await notify(e.organizationId, await usersWithAll(e.organizationId, ["integrations.logs.view"]), "INTEGRATIONS", { ar: `رسائل فشلت نهائيًا (${p.provider} · ${p.eventType}): ${p.code}`, en: `Dead-lettered deliveries (${p.provider} · ${p.eventType}): ${p.code}`, href: "/app/integrations/logs?view=dead", priority: "HIGH", key: `integration.dead:${p.provider}:${ymd(new Date())}` });
  });
  subscribe("integration.credentials_expiring", async (e) => {
    const p = e.payload as { provider: string; expiresAt: string };
    await notify(e.organizationId, await managers(e.organizationId), "INTEGRATIONS", { ar: `بيانات اعتماد ${p.provider} تنتهي ${p.expiresAt}`, en: `${p.provider} credentials expire ${p.expiresAt}`, href: "/app/integrations", priority: "HIGH", key: `integration.cred:${e.entityId}:${p.expiresAt}` });
  });

  type CampaignP = { number: string; createdById?: string; delivered?: number; failed?: number };
  subscribe("campaign.approved", async (e) => {
    const p = e.payload as CampaignP;
    await notify(e.organizationId, [p.createdById], "MARKETING", { ar: `تمت الموافقة على الحملة ${p.number} — جاهزة للبدء`, en: `Campaign ${p.number} approved — ready to start`, href: `/app/marketing/campaigns/${e.entityId}`, priority: "MEDIUM", key: `campaign.approved:${e.id}` }, e.actorId);
  });
  subscribe("campaign.completed", async (e) => {
    const p = e.payload as CampaignP;
    await notify(e.organizationId, [p.createdById], "MARKETING", { ar: `اكتملت الحملة ${p.number}: ${p.delivered ?? 0} مرسلة، ${p.failed ?? 0} فاشلة`, en: `Campaign ${p.number} completed: ${p.delivered ?? 0} sent, ${p.failed ?? 0} failed`, href: `/app/marketing/campaigns/${e.entityId}`, priority: "MEDIUM", key: `campaign.completed:${e.entityId}` });
  });
  subscribe("campaign.failed", async (e) => {
    const p = e.payload as CampaignP;
    await notify(e.organizationId, [p.createdById, ...(await usersWithAll(e.organizationId, ["marketing.manage"]))], "MARKETING", { ar: `فشلت الحملة ${p.number}: لم تُرسل أي رسالة`, en: `Campaign ${p.number} failed: no message was delivered`, href: `/app/marketing/campaigns/${e.entityId}`, priority: "HIGH", key: `campaign.failed:${e.entityId}` });
  });
  subscribe("whatsapp.message_received", async (e) => {
    const p = e.payload as { matched: string; conversationId: string };
    if (p.matched === "MATCHED") return;
    // unmatched / ambiguous conversations need a person — one reminder per conversation per day
    await notify(e.organizationId, await usersWithAll(e.organizationId, ["whatsapp.send"]), "MARKETING", { ar: "محادثة واتساب جديدة تحتاج ربطًا بالعميل", en: "New WhatsApp conversation needs matching", href: `/app/whatsapp/${p.conversationId}`, priority: "MEDIUM", key: `wa.unmatched:${p.conversationId}:${ymd(new Date())}` });
  });
}

// outbound delivery for CUSTOM connections
registerOutboxHandler("custom.deliver", async (item) => {
  const { event, deliveryId, data } = item.payload as { event: string; deliveryId: string; data: unknown };
  const c = item.connectionId ? await prisma.integrationConnection.findUnique({ where: { id: item.connectionId } }) : null;
  if (!c || c.status === "DISABLED") throw new IntegrationError("NOT_CONNECTED", "connection disabled or missing", false);
  await customWebhook.deliver(c, event, deliveryId, data);
  return { externalReference: deliveryId };
});
