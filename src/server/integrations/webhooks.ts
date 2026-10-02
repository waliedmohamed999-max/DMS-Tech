import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { ZodError, z } from "zod";
import type { IntegrationConnection, Prisma, WebhookStatus } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { systemCtx } from "../context";
import { isAppError } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { hit } from "../rate-limit";
import { createLeadTx, leadCreateSchema } from "../crm/leads";
import { parseWaPayload, processWhatsAppPayload, type WaPayload } from "../whatsapp/service";
import { secretsOf, verifySigned, whatsapp } from "./adapters";
import { recordExecution } from "./registry";
import { sanitizeError } from "./secrets";

/**
 * Inbound webhooks (docs/INTEGRATIONS.md#webhooks) — /api/integrations/webhooks/{connectionId}
 *   size cap → rate limit → connection enabled? → signature (provider-specific, constant time) → schema
 *   → dedupe on (organization, provider, external event id) under an advisory lock → process in ONE transaction.
 * External event id: the provider's delivery id when it sends one (x-dms-delivery), otherwise sha256(raw body)
 * — WhatsApp sends no delivery id, and an identical body is by definition the same delivery.
 * Duplicates of PROCESSED / IGNORED events only bump duplicateCount; FAILED / REJECTED ones may be processed again.
 * Raw bodies and headers are never stored — only a hash and sanitized metadata.
 */

export const MAX_WEBHOOK_BYTES = 256 * 1024;
const PER_MINUTE = 600;

export type WebhookResult = { status: number; body: Record<string, unknown> | string };

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const reply = (status: number, body: Record<string, unknown> | string): WebhookResult => ({ status, body });

async function connectionById(id: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const c = await prisma.integrationConnection.findUnique({ where: { id } });
  return c && (c.provider === "WHATSAPP" || c.provider === "WEBHOOK") ? c : null;
}

/** GET — WhatsApp subscription handshake (hub.verify_token must equal the stored verify token). */
export async function verifySubscription(connectionId: string, params: URLSearchParams): Promise<WebhookResult> {
  const c = await connectionById(connectionId);
  if (!c || c.provider !== "WHATSAPP" || c.status === "DISABLED") return reply(404, { error: "not_found" });
  const s = await secretsOf(c);
  const token = params.get("hub.verify_token") ?? "";
  const ok = params.get("hub.mode") === "subscribe" && !!s.verifyToken && token.length === s.verifyToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(s.verifyToken));
  if (!ok) return reply(403, { error: "verification_failed" });
  return reply(200, params.get("hub.challenge") ?? "");
}

async function record(c: IntegrationConnection, e: { externalEventId: string; eventType: string; status: WebhookStatus; payloadHash: string; signatureValid: boolean; error?: string | null; metadata?: Record<string, unknown> }) {
  // REJECTED rows get a unique synthetic id so a forged / broken delivery can never block the genuine one
  await prisma.webhookEvent.create({ data: { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, ...e, error: e.error ? sanitizeError(e.error) : null, metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined, processedAt: new Date() } });
  const ctx = systemCtx(c.organizationId, { ip: "webhook", userAgent: c.provider });
  await unitOfWork(ctx, async (_tx, uow) => {
    await uow.audit({ action: "webhook.rejected", entityType: "IntegrationConnection", entityId: c.id, after: { provider: c.provider, reason: e.error ?? e.status } });
  });
}

/** POST — verify, dedupe, process. Never throws: the route maps the result to an HTTP response. */
export async function receiveWebhook(connectionId: string, rawBody: Buffer, headers: Headers): Promise<WebhookResult> {
  if (rawBody.length > MAX_WEBHOOK_BYTES) return reply(413, { error: "too_large" });
  const c = await connectionById(connectionId);
  if (!c) return reply(404, { error: "not_found" });
  if (!(await hit(`webhook:${c.id}`, PER_MINUTE, 60_000))) return reply(429, { error: "rate_limited" });
  if (c.status === "DISABLED") return reply(403, { error: "disabled" });
  const hash = sha256(rawBody);
  const s = await secretsOf(c);

  // 1. signature
  let sigOk = false;
  let reason = "SIGNATURE_INVALID";
  if (c.provider === "WHATSAPP") {
    sigOk = whatsapp.verify(s.appSecret ?? null, rawBody, headers.get("x-hub-signature-256"));
    if (!s.appSecret) reason = "NOT_CONFIGURED";
  } else {
    const v = verifySigned(s.signingSecret ?? null, rawBody, headers.get("x-dms-signature"));
    sigOk = v.ok;
    reason = s.signingSecret ? (v.reason ?? reason) : "NOT_CONFIGURED";
  }
  if (!sigOk) {
    await record(c, { externalEventId: `rejected:${randomUUID()}`, eventType: "unknown", status: "REJECTED", payloadHash: hash, signatureValid: false, error: reason });
    return reply(401, { error: "invalid_signature" });
  }

  // 2. schema
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    await record(c, { externalEventId: `rejected:${randomUUID()}`, eventType: "unknown", status: "REJECTED", payloadHash: hash, signatureValid: true, error: "BAD_JSON" });
    return reply(400, { error: "bad_json" });
  }
  const parsed = c.provider === "WHATSAPP" ? parseWaPayload(body) : genericEvent.safeParse(body);
  if (!parsed.success) {
    await record(c, { externalEventId: `rejected:${randomUUID()}`, eventType: "unknown", status: "REJECTED", payloadHash: hash, signatureValid: true, error: "SCHEMA_INVALID", metadata: { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) } });
    return reply(400, { error: "schema_invalid" });
  }
  const externalEventId = (c.provider === "WEBHOOK" ? headers.get("x-dms-delivery") ?? (parsed.data as GenericEvent).id : null)?.slice(0, 200) || `sha256:${hash}`;
  const eventType = c.provider === "WHATSAPP" ? "whatsapp.notification" : (parsed.data as GenericEvent).event;

  // 3. dedupe + process (one transaction, serialized per event id)
  const ctx = systemCtx(c.organizationId, { ip: "webhook", userAgent: c.provider });
  const started = new Date();
  try {
    const out = await unitOfWork(ctx, async (tx, uow) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`webhook:${c.organizationId}:${c.provider}:${externalEventId}`}))::text AS locked`;
      const existing = await tx.webhookEvent.findUnique({ where: { organizationId_provider_externalEventId: { organizationId: c.organizationId, provider: c.provider, externalEventId } } });
      if (existing && (existing.status === "PROCESSED" || existing.status === "IGNORED")) {
        await tx.webhookEvent.update({ where: { id: existing.id }, data: { duplicateCount: { increment: 1 } } });
        await uow.audit({ action: "webhook.replayed", entityType: "WebhookEvent", entityId: existing.id, after: { provider: c.provider, duplicateCount: existing.duplicateCount + 1 } });
        return { duplicate: true, eventId: existing.id };
      }
      const result: Record<string, unknown> & { ignored?: boolean } =
        c.provider === "WHATSAPP" ? await whatsAppResult(tx, uow, c, parsed.data as WaPayload) : await processGeneric(tx, uow, c, parsed.data as GenericEvent);
      const status: WebhookStatus = result.ignored ? "IGNORED" : "PROCESSED";
      const data = { eventType, status, payloadHash: hash, signatureValid: true, error: null, metadata: result as Prisma.InputJsonValue, processedAt: new Date() };
      const ev = existing
        ? await tx.webhookEvent.update({ where: { id: existing.id }, data })
        : await tx.webhookEvent.create({ data: { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, externalEventId, ...data } });
      // a verified signed delivery is the proof that an inbound WEBHOOK connection works
      if (c.provider === "WEBHOOK") await tx.integrationConnection.update({ where: { id: c.id }, data: { lastSuccessfulSyncAt: new Date(), ...(c.status === "CONFIGURED" || c.status === "ERROR" ? { status: "CONNECTED", lastHealthResult: "healthy", lastErrorCode: null, lastErrorMessage: null } : {}) } });
      await recordExecution(tx, { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, direction: "INBOUND", action: eventType, ok: true, externalReference: externalEventId.slice(0, 120), metadata: result, startedAt: started });
      await uow.audit({ action: "webhook.received", entityType: "WebhookEvent", entityId: ev.id, after: { provider: c.provider, eventType, status, retried: Boolean(existing) } });
      return { duplicate: false, eventId: ev.id };
    });
    return reply(200, { ok: true, duplicate: out.duplicate });
  } catch (e) {
    const permanent = e instanceof ZodError || (isAppError(e) && (e.code === "VALIDATION" || e.code === "CONFLICT"));
    const msg = e instanceof ZodError ? `SCHEMA_INVALID:${e.issues.map((i) => i.path.join(".")).join(",")}` : (e as Error)?.message ?? String(e);
    await prisma.webhookEvent.upsert({
      where: { organizationId_provider_externalEventId: { organizationId: c.organizationId, provider: c.provider, externalEventId } },
      create: { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, externalEventId, eventType, status: permanent ? "REJECTED" : "FAILED", payloadHash: hash, signatureValid: true, error: sanitizeError(msg) },
      update: { status: permanent ? "REJECTED" : "FAILED", error: sanitizeError(msg) }
    });
    await recordExecution(prisma, { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, direction: "INBOUND", action: eventType, ok: false, errorCode: permanent ? "REJECTED" : "PROCESSING_FAILED", error: msg, startedAt: started });
    // 5xx → the provider retries (transient); 422 → do not retry a payload we will never accept
    return reply(permanent ? 422 : 500, { error: permanent ? "unprocessable" : "processing_failed" });
  }
}

// --- generic signed webhook (inbound WEBHOOK connection) ------------------------------------------

const genericEvent = z.object({ id: z.string().max(200).optional(), event: z.string().min(1).max(80), data: z.record(z.string(), z.unknown()).default({}) });
type GenericEvent = z.infer<typeof genericEvent>;

/** Supported inbound events. Anything else is recorded as IGNORED (verified, but nothing to do). */
async function processGeneric(tx: Tx, uow: Uow, c: IntegrationConnection, e: GenericEvent): Promise<Record<string, unknown> & { ignored?: boolean }> {
  const allowed = String(((c.config ?? {}) as Record<string, string>).allowedEvents ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(e.event)) return { ignored: true, event: e.event, reason: "EVENT_NOT_ALLOWED" };
  if (e.event === "lead.created") {
    const ctx = systemCtx(c.organizationId, { ip: "webhook", userAgent: "WEBHOOK" });
    const d = e.data as Record<string, unknown>;
    const input = leadCreateSchema.parse({ ...d, source: d.source ?? "OTHER", ownerId: undefined, serviceId: undefined, stage: undefined });
    const utm = (d.utm ?? {}) as Record<string, string>;
    const lead = await createLeadTx(tx, uow, ctx, input, { captureMeta: { channel: "webhook", connection: c.name, utm: typeof utm === "object" ? utm : {} } });
    return { action: "lead.created", leadId: lead.id, number: lead.number };
  }
  return { ignored: true, event: e.event };
}

async function whatsAppResult(tx: Tx, uow: Uow, c: IntegrationConnection, p: WaPayload) {
  const st = await processWhatsAppPayload(tx, uow, c, p);
  return { ...st, ignored: st.messages + st.duplicates + st.statuses + st.templates === 0 };
}
