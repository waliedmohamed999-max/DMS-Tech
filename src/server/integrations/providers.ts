import type { IntegrationProvider } from "@/generated/prisma/client";

/**
 * Provider catalogue (docs/INTEGRATIONS.md#providers). `adapter` says what really exists in this build:
 *   live         real adapter — health check calls the provider; a connection is CONNECTED only after it succeeds
 *   boundary     adapter interface + OAuth / health plumbing; business features are documented as later work
 *   manual       no API adapter — the OS tracks data entered manually (e.g. ad spend) and labels it manual
 *   unsupported  interface only; stays NOT_CONFIGURED until API access / docs exist
 *   external     NOVA: an external platform reached by URL only (never CONNECTED without a documented API)
 */
export type ProviderDef = {
  provider: IntegrationProvider;
  kind: "messaging" | "email" | "calendar" | "storage" | "ads" | "ecommerce" | "platform" | "webhook";
  adapter: "live" | "boundary" | "manual" | "unsupported" | "external";
  config: { name: string; required?: boolean; secret?: false; hint?: string }[];
  secrets: { name: string; required?: boolean }[];
  docsUrl?: string;
  inboundWebhook?: boolean;
};

export const PROVIDERS: ProviderDef[] = [
  {
    provider: "WHATSAPP", kind: "messaging", adapter: "live", inboundWebhook: true,
    config: [{ name: "businessAccountId", required: true }, { name: "phoneNumberId", required: true }, { name: "apiVersion", hint: "v21.0" }, { name: "apiBaseUrl", hint: "https://graph.facebook.com (sandbox: a local test endpoint, non-production only)" }],
    secrets: [{ name: "accessToken", required: true }, { name: "appSecret", required: true }, { name: "verifyToken", required: true }],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api"
  },
  { provider: "WEBHOOK", kind: "webhook", adapter: "live", inboundWebhook: true, config: [{ name: "allowedEvents", hint: "lead.created (empty = all supported events)" }], secrets: [{ name: "signingSecret", required: true }] },
  { provider: "CUSTOM", kind: "webhook", adapter: "live", config: [{ name: "endpointUrl", required: true, hint: "https://… (receives signed JSON)" }, { name: "events", required: true, hint: "lead.created, lead.converted, client.created, opportunity.won, quotation.accepted, invoice.issued, payment.recorded, ticket.created, ticket.resolved, project.completed, campaign.completed — or *" }], secrets: [{ name: "signingSecret", required: true }] },
  { provider: "GOOGLE", kind: "platform", adapter: "boundary", config: [{ name: "clientId", required: true }, { name: "redirectUri", required: true }], secrets: [{ name: "clientSecret", required: true }, { name: "refreshToken", required: true }], docsUrl: "https://developers.google.com/identity/protocols/oauth2" },
  { provider: "GMAIL", kind: "email", adapter: "boundary", config: [{ name: "senderAddress", required: true }], secrets: [{ name: "refreshToken", required: true }], docsUrl: "https://developers.google.com/gmail/api" },
  { provider: "GOOGLE_CALENDAR", kind: "calendar", adapter: "boundary", config: [{ name: "calendarId", required: true }], secrets: [{ name: "refreshToken", required: true }], docsUrl: "https://developers.google.com/calendar" },
  { provider: "GOOGLE_DRIVE", kind: "storage", adapter: "boundary", config: [{ name: "folderId", required: true }], secrets: [{ name: "refreshToken", required: true }], docsUrl: "https://developers.google.com/drive" },
  { provider: "S3", kind: "storage", adapter: "live", config: [{ name: "endpoint", required: true }, { name: "region", required: true }, { name: "bucket", required: true }, { name: "forcePathStyle", hint: "true for MinIO / R2" }], secrets: [{ name: "accessKeyId", required: true }, { name: "secretAccessKey", required: true }] },
  { provider: "META", kind: "ads", adapter: "manual", config: [{ name: "adAccountId" }], secrets: [], docsUrl: "https://developers.facebook.com/docs/marketing-apis" },
  { provider: "GOOGLE_ADS", kind: "ads", adapter: "manual", config: [{ name: "customerId" }], secrets: [], docsUrl: "https://developers.google.com/google-ads/api" },
  { provider: "ZID", kind: "ecommerce", adapter: "unsupported", config: [{ name: "storeId" }], secrets: [] },
  { provider: "SALLA", kind: "ecommerce", adapter: "unsupported", config: [{ name: "storeId" }], secrets: [] },
  { provider: "SHOPIFY", kind: "ecommerce", adapter: "unsupported", config: [{ name: "shopDomain" }], secrets: [] },
  { provider: "NOVA", kind: "platform", adapter: "external", config: [], secrets: [] }
];

export const providerDef = (p: IntegrationProvider) => PROVIDERS.find((x) => x.provider === p)!;
