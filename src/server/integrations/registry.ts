import { z } from "zod";
import type { IntegrationConnection, IntegrationDirection, IntegrationProvider, IntegrationStatus, Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { PROVIDERS, providerDef } from "./providers";
import { putSecret, secretStates, secretStoreAvailable, sanitizeError } from "./secrets";
import { customWebhook, google, missingRequirements, nova, s3, whatsapp, type Health } from "./adapters";
import { IntegrationError } from "./http";
import { novaStatus } from "./nova";
import { enforceLimit } from "../security/limits";
import { isProduction } from "../system/environment";

/**
 * Integration registry (docs/INTEGRATIONS.md). One row per provider ("default") is provisioned by bootstrap
 * as NOT_CONFIGURED. Status rules:
 *   NOT_CONFIGURED  required settings / secrets missing
 *   CONFIGURED      everything entered, never verified (or config changed since the last check)
 *   CONNECTED       the last real health check against the provider succeeded
 *   DEGRADED        provider reachable but reports a degraded state
 *   ERROR           the last check / call failed
 *   DISABLED        switched off by an admin
 * Presence of a URL or token never yields CONNECTED.
 */

export async function ensureRegistry(organizationId: string) {
  await prisma.integrationConnection.createMany({ data: PROVIDERS.map((p) => ({ organizationId, provider: p.provider, name: "default" })), skipDuplicates: true });
}

export async function recordExecution(db: Tx | typeof prisma, e: { organizationId: string; connectionId?: string | null; provider: IntegrationProvider; direction: IntegrationDirection; action: string; ok: boolean; externalReference?: string | null; errorCode?: string | null; error?: unknown; secrets?: (string | null)[]; metadata?: Record<string, unknown>; attempts?: number; outboxId?: string | null; startedAt?: Date }) {
  return db.integrationExecution.create({
    data: {
      organizationId: e.organizationId, connectionId: e.connectionId ?? null, provider: e.provider, direction: e.direction, action: e.action, status: e.ok ? "SUCCEEDED" : "FAILED",
      externalReference: e.externalReference ?? null, errorCode: e.errorCode ?? null, sanitizedError: e.error ? sanitizeError(e.error, e.secrets) : null,
      metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined, attempts: e.attempts ?? 1, outboxId: e.outboxId ?? null, startedAt: e.startedAt ?? new Date(), completedAt: new Date()
    }
  });
}

const view = (ctx: Ctx) => can(ctx, "integrations.view") || can(ctx, "integrations.manage");

/** Redacted connection view: status, config (non-secret), secret STATES — never secret values. */
export async function listConnections(ctx: Ctx) {
  if (!view(ctx)) throw forbidden("integrations.view");
  await ensureRegistry(ctx.organizationId);
  const rows = await prisma.integrationConnection.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const def of PROVIDERS) {
    const c = rows.find((r) => r.provider === def.provider);
    if (!c) continue;
    out.push(await present(c));
  }
  return { connections: out, secretStore: secretStoreAvailable() };
}

async function present(c: IntegrationConnection) {
  const def = providerDef(c.provider);
  const n = c.provider === "NOVA" ? novaStatus() : null;
  // NOVA: URL configuration only — never CONNECTED (no API exists)
  // a stored status never outlives its requirements: an unreadable / removed secret (e.g. a rotated master key) shows NOT_CONFIGURED
  const missing = !n && (def.adapter === "live" || def.adapter === "boundary") && c.status !== "DISABLED" ? await missingRequirements(c) : [];
  const status: IntegrationStatus = n ? (c.status === "DISABLED" ? "DISABLED" : n.invalidUrl ? "ERROR" : n.configured ? "CONFIGURED" : "NOT_CONFIGURED") : missing.length ? "NOT_CONFIGURED" : c.status;
  const cfg = (c.config ?? {}) as Record<string, string>;
  return {
    id: c.id, provider: c.provider, name: c.name, status, environment: c.environment, def,
    config: Object.fromEntries(def.config.map((f) => [f.name, cfg[f.name] ?? ""])),
    secrets: await secretStates((c.secretRefs ?? {}) as Record<string, string>, def.secrets.map((s) => s.name)),
    lastHealthCheckAt: c.lastHealthCheckAt, lastHealthResult: c.lastHealthResult, lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
    lastFailureAt: c.lastFailureAt, lastErrorCode: missing.length ? `MISSING:${missing.join(",")}` : c.lastErrorCode, lastErrorMessage: c.lastErrorMessage, credentialsExpireAt: c.credentialsExpireAt,
    nova: n ? { host: n.host, url: n.url } : null
  };
}

export async function getConnection(ctx: Ctx, id: string) {
  if (!view(ctx)) throw forbidden("integrations.view");
  const c = await prisma.integrationConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("IntegrationConnection");
  return present(c);
}

const configureSchema = z.object({
  environment: z.enum(["PRODUCTION", "SANDBOX"]).default("PRODUCTION"),
  config: z.record(z.string(), z.string().max(500)).default({}),
  /** empty string = keep the stored secret; "env:VAR" = environment reference; anything else is encrypted */
  secrets: z.record(z.string(), z.string().max(4096)).default({})
});

export async function configureConnection(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "integrations.manage");
  const input = configureSchema.parse(raw);
  // Phase 10: APP_ENV decides (staging runs a production build but is allowed — and expected — to use SANDBOX connections)
  if (input.environment === "SANDBOX" && isProduction()) throw invalid("SANDBOX_NOT_ALLOWED_IN_PRODUCTION");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    const def = providerDef(c.provider);
    if (def.adapter === "unsupported" || def.adapter === "external") throw conflict(`PROVIDER_NOT_CONFIGURABLE:${def.adapter}`);
    const allowedCfg = new Set(def.config.map((f) => f.name));
    const allowedSec = new Set(def.secrets.map((f) => f.name));
    const config = { ...((c.config ?? {}) as Record<string, string>) };
    for (const [k, v] of Object.entries(input.config)) if (allowedCfg.has(k)) config[k] = v.trim();
    const refs = { ...((c.secretRefs ?? {}) as Record<string, string>) };
    const changedSecrets: string[] = [];
    for (const [k, v] of Object.entries(input.secrets)) {
      if (!allowedSec.has(k) || !v.trim()) continue;
      refs[k] = await putSecret(tx, ctx.organizationId, c.id, k, v);
      changedSecrets.push(k);
    }
    const next = { ...c, config, secretRefs: refs, environment: input.environment };
    // secrets written in this transaction are not visible to the resolver yet — they are present by construction
    const missing = (await missingRequirements(next)).filter((n) => !changedSecrets.includes(n));
    // manual-tracking providers have no API to verify: their reference settings never make them "configured"
    const status: IntegrationStatus = c.status === "DISABLED" ? "DISABLED" : def.adapter === "manual" || missing.length ? "NOT_CONFIGURED" : "CONFIGURED";
    await tx.integrationConnection.update({ where: { id }, data: { config, secretRefs: refs, environment: input.environment, status, lastHealthResult: null, lastErrorCode: missing.length ? `MISSING:${missing.join(",")}` : null, lastErrorMessage: null, updatedById: ctx.userId || null } });
    // audit: names only — never values
    await uow.audit({ action: "integration.configured", entityType: "IntegrationConnection", entityId: id, before: { status: c.status, environment: c.environment }, after: { status, environment: input.environment, configKeys: Object.keys(input.config).filter((k) => allowedCfg.has(k)), secretsChanged: changedSecrets, missing } });
    return { status, missing };
  });
}

async function lock(tx: Tx, ctx: Ctx, id: string) {
  await tx.$queryRaw`SELECT id FROM "IntegrationConnection" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const c = await tx.integrationConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("IntegrationConnection");
  return c;
}

/** Real health check by provider. */
export async function runHealth(c: IntegrationConnection): Promise<Health> {
  const def = providerDef(c.provider);
  if (def.adapter === "external") return nova.health();
  if (def.adapter === "unsupported") return { result: "not_configured", code: "ADAPTER_UNAVAILABLE", message: "No adapter in this build" };
  if (def.adapter === "manual") return { result: "not_configured", code: "MANUAL_TRACKING_ONLY", message: "No API adapter — data is entered manually" };
  const missing = await missingRequirements(c);
  if (missing.length) return { result: "not_configured", code: `MISSING:${missing.join(",")}` };
  switch (c.provider) {
    case "WHATSAPP":
      return whatsapp.health(c);
    case "CUSTOM":
      return customWebhook.health(c);
    case "WEBHOOK":
      // inbound only: proven by a verified signed delivery, which sets lastSuccessfulSyncAt
      return c.lastSuccessfulSyncAt ? { result: "healthy", details: { lastVerifiedDelivery: c.lastSuccessfulSyncAt } } : { result: "not_configured", code: "AWAITING_FIRST_SIGNED_DELIVERY" };
    case "S3":
      return s3.health(c);
    case "GOOGLE":
    case "GMAIL":
    case "GOOGLE_CALENDAR":
    case "GOOGLE_DRIVE": {
      const client = c.provider === "GOOGLE" ? null : await prisma.integrationConnection.findFirst({ where: { organizationId: c.organizationId, provider: "GOOGLE" } });
      return google.health(c, client);
    }
    default:
      return { result: "not_configured", code: "ADAPTER_UNAVAILABLE" };
  }
}

const STATUS_OF: Record<Health["result"], IntegrationStatus> = { healthy: "CONNECTED", degraded: "DEGRADED", error: "ERROR", not_configured: "NOT_CONFIGURED" };

/** Apply a health result to the connection (status, timestamps, events) — used by the test action and the worker. */
export async function applyHealth(tx: Tx, uow: Uow, c: IntegrationConnection, h: Health, startedAt: Date) {
  let status = STATUS_OF[h.result];
  // a fully configured connection that cannot be verified stays CONFIGURED (never CONNECTED)
  if (status === "NOT_CONFIGURED" && c.status !== "NOT_CONFIGURED" && !h.code?.startsWith("MISSING")) status = c.provider === "NOVA" ? "NOT_CONFIGURED" : "CONFIGURED";
  const now = new Date();
  await tx.integrationConnection.update({
    where: { id: c.id },
    data: { status, lastHealthCheckAt: now, lastHealthResult: h.result, ...(h.result === "error" ? { lastFailureAt: now, lastErrorCode: h.code ?? "ERROR", lastErrorMessage: h.message ? sanitizeError(h.message) : null } : { lastErrorCode: h.code ?? null, lastErrorMessage: null }) }
  });
  await recordExecution(tx, { organizationId: c.organizationId, connectionId: c.id, provider: c.provider, direction: "OUTBOUND", action: "health_check", ok: h.result === "healthy" || h.result === "degraded", errorCode: h.code ?? null, error: h.message, metadata: { result: h.result }, startedAt });
  if (status !== c.status) {
    const type = status === "CONNECTED" ? "integration.connected" : status === "DEGRADED" ? "integration.degraded" : status === "ERROR" ? "integration.failed" : null;
    if (type) uow.emit({ type, entityType: "IntegrationConnection", entityId: c.id, payload: { connectionId: c.id, provider: c.provider, code: h.code ?? "" } });
  }
  return status;
}

export async function healthToResult(c: IntegrationConnection): Promise<Health> {
  try {
    return await runHealth(c);
  } catch (e) {
    const err = e as IntegrationError;
    return { result: "error", code: err.code ?? "ERROR", message: sanitizeError(err.message) };
  }
}

export async function testConnection(ctx: Ctx, id: string) {
  requirePermission(ctx, "integrations.test");
  await enforceLimit("integrationTest", ctx.userId);
  const c = await prisma.integrationConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw notFound("IntegrationConnection");
  if (c.status === "DISABLED") throw conflict("INTEGRATION_DISABLED");
  const started = new Date();
  // the provider call happens OUTSIDE any database transaction
  const h = await healthToResult(c);
  return unitOfWork(ctx, async (tx, uow) => {
    const fresh = await lock(tx, ctx, id);
    const status = await applyHealth(tx, uow, fresh, h, started);
    await uow.audit({ action: "integration.tested", entityType: "IntegrationConnection", entityId: id, before: { status: fresh.status }, after: { status, result: h.result, code: h.code ?? null } });
    return { status, result: h.result, code: h.code ?? null };
  });
}

export async function setConnectionDisabled(ctx: Ctx, id: string, disabled: boolean) {
  requirePermission(ctx, "integrations.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await lock(tx, ctx, id);
    let status: IntegrationStatus;
    if (disabled) status = "DISABLED";
    else status = providerDef(c.provider).adapter === "manual" || (await missingRequirements(c)).length ? "NOT_CONFIGURED" : "CONFIGURED";
    await tx.integrationConnection.update({ where: { id }, data: { status, disabledAt: disabled ? new Date() : null, updatedById: ctx.userId || null } });
    await uow.audit({ action: disabled ? "integration.disabled" : "integration.enabled", entityType: "IntegrationConnection", entityId: id, before: { status: c.status }, after: { status } });
  });
}

/** The enabled connection of a provider (for business features), or null. */
export async function connectionFor(organizationId: string, provider: IntegrationProvider) {
  const c = await prisma.integrationConnection.findFirst({ where: { organizationId, provider, status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" } });
  // effective status: missing requirements (unreadable secret, removed env var) mean NOT_CONFIGURED for business features too
  if (c && c.status !== "NOT_CONFIGURED" && (await missingRequirements(c)).length) return { ...c, status: "NOT_CONFIGURED" as IntegrationStatus };
  return c;
}

/** Called by the outbox when a provider rejects credentials — the connection is no longer connected. */
export async function markConnectionFailed(tx: Tx, uow: Uow, connectionId: string, code: string, message: string) {
  const c = await tx.integrationConnection.findUnique({ where: { id: connectionId } });
  if (!c || c.status === "DISABLED") return;
  await tx.integrationConnection.update({ where: { id: connectionId }, data: { status: "ERROR", lastFailureAt: new Date(), lastErrorCode: code, lastErrorMessage: sanitizeError(message) } });
  if (c.status !== "ERROR") uow.emit({ type: "integration.failed", entityType: "IntegrationConnection", entityId: connectionId, payload: { connectionId, provider: c.provider, code } });
}
