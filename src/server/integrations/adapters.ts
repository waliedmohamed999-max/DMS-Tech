import { createHmac, timingSafeEqual } from "node:crypto";
import type { IntegrationConnection } from "@/generated/prisma/client";
import { novaStatus } from "./nova";
import { providerDef } from "./providers";
import { resolveAll } from "./secrets";
import { httpJson, IntegrationError } from "./http";
import { S3StorageAdapter } from "../ops/s3";
import { isProduction } from "../system/environment";

/**
 * Provider adapters. Every health check either calls the provider or reports honestly that it cannot.
 * Nothing returns "healthy" from configuration presence alone.
 */

export type Health = { result: "healthy" | "degraded" | "error" | "not_configured"; code?: string; message?: string; details?: Record<string, unknown> };
type Conn = Pick<IntegrationConnection, "id" | "provider" | "status" | "environment" | "config" | "secretRefs">;
const cfg = (c: Conn) => (c.config ?? {}) as Record<string, string>;

export async function secretsOf(c: Conn) {
  return resolveAll((c.secretRefs ?? {}) as Record<string, string>);
}

/** Required non-secret config + secrets present? (presence only — NOT a health signal) */
export async function missingRequirements(c: Conn) {
  const def = providerDef(c.provider);
  const s = await secretsOf(c);
  const missing = [...def.config.filter((f) => f.required && !cfg(c)[f.name]?.toString().trim()).map((f) => f.name), ...def.secrets.filter((f) => f.required && !s[f.name]).map((f) => f.name)];
  return missing;
}

const safeUrl = (raw: string, sandbox: boolean) => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new IntegrationError("CONFIG_INVALID_URL", "invalid URL", false);
  }
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol === "https:") return u;
  if (u.protocol === "http:" && local && (sandbox || !isProduction())) return u;
  throw new IntegrationError("CONFIG_INSECURE_URL", "https required", false);
};

// --- WhatsApp Business Platform (Cloud API) -----------------------------------------------------

async function waToken(c: Conn) {
  const s = await secretsOf(c);
  if (!s.accessToken) throw new IntegrationError("NOT_CONFIGURED", "access token missing or unreadable", false);
  return s.accessToken;
}

export function waBase(c: Conn) {
  const base = (cfg(c).apiBaseUrl || "https://graph.facebook.com").replace(/\/+$/, "");
  const official = /^https:\/\/graph\.facebook\.com$/.test(base);
  // a non-official endpoint is only a local test double: SANDBOX environment and never in production
  if (!official && (c.environment !== "SANDBOX" || isProduction())) throw new IntegrationError("SANDBOX_ENDPOINT_NOT_ALLOWED", "custom API base requires a SANDBOX connection outside production", false);
  safeUrl(base, c.environment === "SANDBOX");
  return `${base}/${cfg(c).apiVersion || "v21.0"}`;
}

export const whatsapp = {
  async health(c: Conn): Promise<Health> {
    const s = { accessToken: await waToken(c) };
    const r = await httpJson<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(`${waBase(c)}/${encodeURIComponent(cfg(c).phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, { headers: { authorization: `Bearer ${s.accessToken}` } });
    const q = r.body.quality_rating;
    return { result: q === "RED" ? "degraded" : "healthy", details: { phone: r.body.display_phone_number, name: r.body.verified_name, quality: q ?? null } };
  },
  async send(c: Conn, message: Record<string, unknown>) {
    const s = { accessToken: await waToken(c) };
    const r = await httpJson<{ messages?: { id: string }[] }>(`${waBase(c)}/${encodeURIComponent(cfg(c).phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${s.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message })
    });
    const id = r.body.messages?.[0]?.id;
    if (!id) throw new IntegrationError("PROVIDER_BAD_RESPONSE", "no message id returned", true);
    return id;
  },
  async templates(c: Conn) {
    const s = { accessToken: await waToken(c) };
    const r = await httpJson<{ data?: { id: string; name: string; language: string; category?: string; status?: string; components?: unknown }[] }>(`${waBase(c)}/${encodeURIComponent(cfg(c).businessAccountId)}/message_templates?limit=200`, { headers: { authorization: `Bearer ${s.accessToken}` } });
    return r.body.data ?? [];
  },
  /** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(appSecret, raw body) — constant-time compare */
  verify(appSecret: string | null, rawBody: Buffer, header: string | null) {
    if (!appSecret || !header?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", appSecret).update(rawBody).digest();
    const got = Buffer.from(header.slice(7), "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  }
};

// --- signed generic webhooks (inbound WEBHOOK / outbound CUSTOM) ----------------------------------

export const SIGNATURE_TOLERANCE_S = 300;
export const signPayload = (secret: string, ts: number, body: string | Buffer) => createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");

/** X-DMS-Signature: t=<unix seconds>,v1=<hex> — rejects stale timestamps (replay window) */
export function verifySigned(secret: string | null, rawBody: Buffer, header: string | null, now = Date.now()) {
  if (!secret || !header) return { ok: false, reason: "SIGNATURE_MISSING" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || !parts.v1) return { ok: false, reason: "SIGNATURE_MALFORMED" };
  if (Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_S) return { ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" };
  const expected = Buffer.from(signPayload(secret, ts, rawBody), "hex");
  const got = Buffer.from(parts.v1, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, reason: "SIGNATURE_INVALID" };
  return { ok: true, ts };
}

export const customWebhook = {
  async deliver(c: Conn, event: string, deliveryId: string, data: unknown) {
    const s = await secretsOf(c);
    // never deliver unsigned
    if (!s.signingSecret) throw new IntegrationError("NOT_CONFIGURED", "signing secret missing or unreadable", false);
    const url = safeUrl(cfg(c).endpointUrl, c.environment === "SANDBOX");
    const body = JSON.stringify({ id: deliveryId, event, occurredAt: new Date().toISOString(), data });
    const ts = Math.floor(Date.now() / 1000);
    await httpJson(url.toString(), { method: "POST", headers: { "content-type": "application/json", "x-dms-event": event, "x-dms-delivery": deliveryId, "x-dms-signature": `t=${ts},v1=${signPayload(s.signingSecret, ts, body)}` }, body });
  },
  /** health = a signed ping must be accepted (2xx) by the endpoint */
  async health(c: Conn): Promise<Health> {
    await customWebhook.deliver(c, "ping", `ping-${Date.now()}`, { ping: true });
    return { result: "healthy" };
  }
};

// --- Google (OAuth boundary: token refresh + profile checks; Gmail send) ----------------------------

async function googleAccessToken(client: { clientId?: string; clientSecret?: string | null }, refreshToken: string | null) {
  if (!client.clientId || !client.clientSecret || !refreshToken) throw new IntegrationError("NOT_CONFIGURED", "Google OAuth client / refresh token missing", false);
  const r = await httpJson<{ access_token?: string; expires_in?: number }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString()
  });
  if (!r.body.access_token) throw new IntegrationError("AUTH_FAILED", "no access token", false);
  return r.body.access_token;
}

export const google = {
  async health(c: Conn, googleClient: Conn | null): Promise<Health> {
    const own = await secretsOf(c);
    const base = googleClient ? await secretsOf(googleClient) : {};
    const clientId = googleClient ? cfg(googleClient).clientId : cfg(c).clientId;
    const token = await googleAccessToken({ clientId, clientSecret: base.clientSecret ?? own.clientSecret }, own.refreshToken);
    const checks: Record<string, string> = {
      GOOGLE: "https://www.googleapis.com/oauth2/v3/userinfo",
      GMAIL: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      GOOGLE_CALENDAR: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg(c).calendarId || "primary")}`,
      GOOGLE_DRIVE: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cfg(c).folderId || "root")}?fields=id,name`
    };
    await httpJson(checks[c.provider], { headers: { authorization: `Bearer ${token}` } });
    return { result: "healthy" };
  },
  /** Gmail send (RFC 822, base64url). Used by the outbox for "email.send" when a Gmail connection is CONNECTED. */
  async sendMail(c: Conn, googleClient: Conn, mail: { to: string; subject: string; text: string }) {
    const own = await secretsOf(c);
    const base = await secretsOf(googleClient);
    const token = await googleAccessToken({ clientId: cfg(googleClient).clientId, clientSecret: base.clientSecret }, own.refreshToken);
    const raw = [`From: ${cfg(c).senderAddress}`, `To: ${mail.to}`, `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString("base64")}?=`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", mail.text].join("\r\n");
    const r = await httpJson<{ id?: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }) });
    return r.body.id ?? null;
  }
};

// --- S3 -------------------------------------------------------------------------------------------

export const s3 = {
  async health(c: Conn): Promise<Health> {
    const s = await secretsOf(c);
    const a = new S3StorageAdapter({ endpoint: safeUrl(cfg(c).endpoint, c.environment === "SANDBOX").toString(), region: cfg(c).region, bucket: cfg(c).bucket, accessKeyId: s.accessKeyId!, secretAccessKey: s.secretAccessKey!, forcePathStyle: cfg(c).forcePathStyle !== "false" });
    const status = await a.ping();
    if (status === 200) return { result: "healthy" };
    throw new IntegrationError(status === 403 ? "AUTH_FAILED" : status === 404 ? "BUCKET_NOT_FOUND" : "PROVIDER_REJECTED", `HTTP ${status}`, status >= 500);
  }
};

// --- NOVA (external platform — URL only, no API) -----------------------------------------------------

/**
 * Future NOVA data adapter — INTERFACE ONLY. Nothing implements it until NOVA publishes an API / webhook
 * contract (docs/NOVA-INTEGRATION.md). Candidate events: Business OS → NOVA (lead.created, client.created,
 * quotation.accepted, project.created); NOVA → Business OS (nova.lead_generated, nova.execution_completed,
 * nova.execution_failed).
 */
export interface NovaApiAdapter {
  pushEvent(event: "lead.created" | "client.created" | "quotation.accepted" | "project.created", data: unknown): Promise<void>;
  handleInbound(event: "nova.lead_generated" | "nova.execution_completed" | "nova.execution_failed", data: unknown): Promise<void>;
}

/** E-commerce sync — INTERFACE ONLY (Zid / Salla / Shopify). No adapter is registered without API access. */
export interface CommerceAdapter {
  listOrders(since: Date): Promise<unknown[]>;
  listCustomers(since: Date): Promise<unknown[]>;
  listProducts(): Promise<unknown[]>;
}

export const nova = {
  health(): Health {
    const s = novaStatus();
    if (s.invalidUrl) return { result: "error", code: "INVALID_URL", message: "NOVA_URL is not a valid https URL" };
    // URL configured ≠ connected: there is no NOVA API to verify against
    return s.configured ? { result: "not_configured", code: "URL_ONLY", details: { host: s.host } } : { result: "not_configured" };
  }
};
