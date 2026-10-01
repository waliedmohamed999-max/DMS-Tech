import { requirePermission, type Ctx } from "../context";
import { unitOfWork } from "../events/bus";

/**
 * NOVA AI integration boundary.
 *
 * NOVA AI is a SEPARATE, external DMS Tech platform — it is not built inside the Business OS.
 * NOVA owns AI agents, orchestration, AI workflows/automation and its own users & credentials.
 * The Business OS only launches it and, once NOVA publishes an API/webhook spec, may consume
 * selected data from it (see docs/NOVA-INTEGRATION.md). Nothing here simulates NOVA.
 *
 * Configuration is server-side env only:
 *   NOVA_URL  https URL of the NOVA platform (http allowed for localhost in development)
 *
 * Launch modes, in order of preference once NOVA supports them:
 *   sso → signed launch URL → OAuth/token handoff → NOVA login page → plain link.
 * Only the plain external link exists today. NOVA passwords are never stored or proxied.
 */

export type NovaLaunchMode = "external_link";

export type NovaStatus = {
  /** a valid NOVA_URL is set */
  configured: boolean;
  /** NOVA_URL is set but unusable (not https / malformed) */
  invalidUrl: boolean;
  url: string | null;
  /** origin only, safe to display */
  host: string | null;
  launchMode: NovaLaunchMode | null;
  /** federated login / signed URL — requires a NOVA-side spec; not available */
  sso: false;
  /** data API / webhooks — requires a NOVA-side spec; not available */
  api: "not_available";
  /** last successful data sync; always null until an API integration exists */
  lastSyncAt: null;
};

function parseUrl(raw: string | undefined): { url: URL | null; invalid: boolean } {
  const v = raw?.trim();
  if (!v) return { url: null, invalid: false };
  try {
    const u = new URL(v);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (u.protocol === "http:" && local && process.env.NODE_ENV !== "production")) return { url: u, invalid: false };
  } catch {
    /* fall through */
  }
  return { url: null, invalid: true };
}

export function novaStatus(env: Record<string, string | undefined> = process.env): NovaStatus {
  const { url, invalid } = parseUrl(env.NOVA_URL);
  return {
    configured: Boolean(url),
    invalidUrl: invalid,
    url: url?.toString() ?? null,
    host: url?.host ?? null,
    launchMode: url ? "external_link" : null,
    sso: false,
    api: "not_available",
    lastSyncAt: null
  };
}

/**
 * Resolve where to send the user and record the access in the audit log.
 * Today: the configured NOVA URL. Later this is the single place that would mint a
 * signed launch URL / SSO request — callers don't change.
 */
export async function launchNova(ctx: Ctx, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  requirePermission(ctx, "nova.use");
  const s = novaStatus(env);
  if (!s.url) return null;
  await unitOfWork(ctx, async (_tx, uow) => {
    await uow.audit({ action: "integration.nova_launched", entityType: "Integration", entityId: "nova", after: { host: s.host, mode: s.launchMode } });
  });
  return s.url;
}

/**
 * Future data integration contract. Intentionally has NO implementation: it is written
 * only when NOVA publishes an API/webhook specification. NOVA stays the source of truth;
 * the Business OS would store references / synced snapshots only.
 *
 * Candidate events (not implemented):
 *   Business OS → NOVA: lead.created, client.created, quotation.accepted, project.created
 *   NOVA → Business OS: nova.lead_generated, nova.action_completed, nova.campaign_completed, nova.execution_failed
 */
export interface NovaApiAdapter {
  health(): Promise<{ ok: boolean; checkedAt: Date }>;
  /** push a Business OS domain event to NOVA (outbound) */
  publish(event: { type: string; entityType: string; entityId: string; payload: unknown; occurredAt: Date }): Promise<void>;
  /** verify + parse an inbound NOVA webhook; must reject unsigned payloads */
  parseWebhook(headers: Headers, body: string): Promise<{ type: string; payload: unknown } | null>;
}
