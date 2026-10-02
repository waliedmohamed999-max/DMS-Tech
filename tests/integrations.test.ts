import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db";
import { decideApproval } from "@/server/approvals/service";
import { createLead } from "@/server/crm/leads";
import { createClient } from "@/server/crm/clients";
import { createOpportunity } from "@/server/crm/opportunities";
import { acceptQuotation, createQuotation, markQuotationSent, submitQuotation } from "@/server/commercial/quotations";
import { activateContract, createContractFromQuotation, sendContractForSignature, updateContract } from "@/server/commercial/contracts";
import { createInvoiceFromSource } from "@/server/finance/eligibility";
import { issueInvoice } from "@/server/finance/invoices";
import { recordPayment } from "@/server/finance/payments";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { captureWebsiteLead as saveLead } from "@/server/crm/website";
import { configureConnection, listConnections, setConnectionDisabled, testConnection } from "@/server/integrations/registry";
import { decrypt, sanitizeError } from "@/server/integrations/secrets";
import { signPayload, nova } from "@/server/integrations/adapters";
import { dismissOutbox, getOutboxItem, listIntegrationLogs, processOutbox, retryOutbox } from "@/server/integrations/outbox";
import { receiveWebhook, verifySubscription } from "@/server/integrations/webhooks";
import { integrationsTick } from "@/server/integrations/worker";
import { createLeadFromConversation, createTicketFromConversation, currentConsent, getConversation, linkConversation, sendReply, setConsent, syncTemplates } from "@/server/whatsapp/service";
import { addSpend, cancelCampaign, campaignTick, createCampaign, getCampaign, marketingDashboard, setAudience, startCampaign, submitCampaign, updateCampaign } from "@/server/marketing/campaigns";
import { campaignFunnel, recordFirstTouch } from "@/server/marketing/attribution";
import { createDocument, downloadDocument } from "@/server/ops/documents";
import { LocalStorageForTests, setDocumentStorage } from "@/server/ops/storage";
import { S3StorageAdapter } from "@/server/ops/s3";
import { ctxFor, makeUser, resetDb, roleId, setupOrg } from "./helpers";
import "@/server/marketing/campaigns";
import "@/server/integrations/worker";

/**
 * Phase 8 — integrations, webhooks, outbox, WhatsApp, campaigns, consent, attribution, S3, NOVA boundary.
 * The WhatsApp provider is a LOCAL Graph-compatible test server reached through a SANDBOX connection
 * (allowed outside production only) — nothing here talks to Meta and nothing is faked as "connected" without a real HTTP check.
 */

let orgId: string;
let server: Server;
let base = "";
let storageDir: string;
const graph = { sends: [] as { to: string; body: Record<string, unknown> }[], failFor: new Map<string, number>(), healthStatus: 200, n: 0, lastAuth: "" };

beforeAll(async () => {
  process.env.INTEGRATION_MASTER_KEY = randomBytes(32).toString("base64");
  storageDir = mkdtempSync(path.join(tmpdir(), "dms-int-"));
  setDocumentStorage(new LocalStorageForTests(storageDir));
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      graph.lastAuth = String(req.headers.authorization ?? "");
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "GET" && url.pathname === "/v21.0/ph1") {
        // an auth failure echoes the token — the OS must never store it
        if (graph.healthStatus !== 200) return json(graph.healthStatus, { error: { message: `Invalid OAuth access token ${req.headers.authorization}` } });
        return json(200, { display_phone_number: "+966 55 000 0000", verified_name: "DMS Test", quality_rating: "GREEN" });
      }
      if (req.method === "GET" && url.pathname === "/v21.0/waba1/message_templates")
        return json(200, { data: [{ id: "t1", name: "promo_offer", language: "ar", category: "MARKETING", status: "APPROVED" }, { id: "t2", name: "draft_offer", language: "ar", category: "MARKETING", status: "PENDING" }] });
      if (req.method === "POST" && url.pathname === "/v21.0/ph1/messages") {
        const body = JSON.parse(raw) as { to: string };
        const fail = graph.failFor.get(body.to);
        if (fail) return json(fail, { error: { message: "rejected" } });
        graph.sends.push({ to: body.to, body });
        return json(200, { messages: [{ id: `wamid.${++graph.n}` }] });
      }
      json(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  setDocumentStorage(null);
  rmSync(storageDir, { recursive: true, force: true });
  await new Promise((r) => server.close(r));
});
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  process.env.OS_ORG_SLUG = "test-org";
  graph.sends = [];
  graph.failFor.clear();
  graph.healthStatus = 200;
});

const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const TOKEN = "EAAtestSECRETtoken0123456789";
const APP_SECRET = "app-secret-xyz";
const today = () => todayIn("Asia/Riyadh");
const d = (n: number) => ymd(addDays(today(), n))!;

const users = async () => ({
  admin: await ctxFor((await makeUser(orgId, "admin@x.test", ["super_admin"])).id),
  ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id),
  mk: await ctxFor((await makeUser(orgId, "mk@x.test", ["marketing"])).id),
  sm: await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id),
  agent: await ctxFor((await makeUser(orgId, "agent@x.test", ["support_agent"])).id),
  fm: await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id),
  emp: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id)
});
type U = Awaited<ReturnType<typeof users>>;
const conn = (provider: "WHATSAPP" | "WEBHOOK" | "CUSTOM" | "NOVA" | "META" | "S3") => prisma.integrationConnection.findFirstOrThrow({ where: { organizationId: orgId, provider } });

async function connectWhatsApp(u: U) {
  await listConnections(u.admin); // provisions the registry
  const c = await conn("WHATSAPP");
  await configureConnection(u.admin, c.id, { environment: "SANDBOX", config: { businessAccountId: "waba1", phoneNumberId: "ph1", apiVersion: "v21.0", apiBaseUrl: base }, secrets: { accessToken: TOKEN, appSecret: APP_SECRET, verifyToken: "verify-me" } });
  const t = await testConnection(u.admin, c.id);
  expect(t.status).toBe("CONNECTED");
  await syncTemplates(u.admin);
  return c.id;
}

const waBody = (messages: { from: string; id: string; text?: string; ts?: number }[] = [], statuses: { id: string; status: string; to?: string }[] = []) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: messages.map((m) => ({ wa_id: m.from, profile: { name: "Sender" } })), messages: messages.map((m) => ({ from: m.from, id: m.id, timestamp: String(m.ts ?? Math.floor(Date.now() / 1000)), type: "text", text: { body: m.text ?? "hello" } })), statuses: statuses.map((s) => ({ id: s.id, status: s.status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: s.to })) } }] }]
  });
const waPost = (connId: string, body: string, secret = APP_SECRET) =>
  receiveWebhook(connId, Buffer.from(body), new Headers({ "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` }));
const signedPost = (connId: string, secret: string, payload: unknown, deliveryId?: string, ts = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify(payload);
  return receiveWebhook(connId, Buffer.from(body), new Headers({ "x-dms-signature": `t=${ts},v1=${signPayload(secret, ts, body)}`, ...(deliveryId ? { "x-dms-delivery": deliveryId } : {}) }));
};

/** Ready-to-start WhatsApp campaign over leads with the given phones (all opted in unless listed in optOut). */
async function campaignOver(u: U, phones: string[], opts: { optOut?: string[]; noConsent?: string[] } = {}) {
  for (const [i, p] of phones.entries()) {
    await createLead(u.mk, { name: `Lead ${i + 1}`, whatsapp: p, source: "WEBSITE" });
    const status = opts.optOut?.includes(p) ? "OPTED_OUT" : opts.noConsent?.includes(p) ? null : "OPTED_IN";
    if (status) await setConsent(u.mk, { address: p, status, source: "website_form" });
  }
  const tpl = await prisma.whatsAppTemplate.findFirstOrThrow({ where: { organizationId: orgId, name: "promo_offer" } });
  const c = await createCampaign(u.mk, { name: "Spring offer", channel: "WHATSAPP", templateId: tpl.id, templateParams: "{{name}}|20%", sendRatePerMinute: "100" });
  await setAudience(u.mk, c.id, { kind: "leads" });
  return c.id;
}
const runAll = async () => {
  await campaignTick();
  await processOutbox({ organizationId: orgId });
  await campaignTick();
};

describe("integration registry & secrets", () => {
  it("1. every provider starts NOT_CONFIGURED; manual / unsupported stay so; an unconfigured test is honest", async () => {
    const u = await users();
    const { connections } = await listConnections(u.admin);
    expect(connections.length).toBe(14);
    expect(connections.every((c) => c.status === "NOT_CONFIGURED")).toBe(true);
    const meta = await conn("META");
    await configureConnection(u.admin, meta.id, { config: { adAccountId: "act_123" } });
    expect((await conn("META")).status).toBe("NOT_CONFIGURED"); // manual tracking: a reference id is not a connection
    await expect(configureConnection(u.admin, (await conn("NOVA")).id, { config: {} })).rejects.toMatchObject(code(/^PROVIDER_NOT_CONFIGURABLE/));
    const wa = await conn("WHATSAPP");
    const r = await testConnection(u.admin, wa.id);
    expect(r).toMatchObject({ status: "NOT_CONFIGURED", result: "not_configured" });
    // all secrets present but never verified → CONFIGURED, not CONNECTED
    await configureConnection(u.admin, wa.id, { environment: "SANDBOX", config: { businessAccountId: "waba1", phoneNumberId: "ph1", apiBaseUrl: base }, secrets: { accessToken: TOKEN, appSecret: APP_SECRET, verifyToken: "verify-1" } });
    expect((await conn("WHATSAPP")).status).toBe("CONFIGURED");
    // a non-official API base on a PRODUCTION connection is refused at check time
    await configureConnection(u.admin, wa.id, { environment: "PRODUCTION" });
    const bad = await testConnection(u.admin, wa.id);
    expect(bad).toMatchObject({ status: "ERROR", code: "SANDBOX_ENDPOINT_NOT_ALLOWED" });
  });

  it("2. secrets are encrypted at rest, never returned by the API and never written to audit", async () => {
    const u = await users();
    const id = await connectWhatsApp(u);
    const view = JSON.stringify(await listConnections(u.admin));
    expect(view).not.toContain(TOKEN);
    expect(view).not.toContain(APP_SECRET);
    const w = (await listConnections(u.admin)).connections.find((c) => c.provider === "WHATSAPP")!;
    expect(w.secrets).toEqual({ accessToken: "stored", appSecret: "stored", verifyToken: "stored" });
    const row = await prisma.integrationSecret.findFirstOrThrow({ where: { connectionId: id, name: "accessToken" } });
    expect(row.ciphertext).not.toContain(TOKEN);
    expect(decrypt(row, Buffer.from(process.env.INTEGRATION_MASTER_KEY!, "base64"))).toBe(TOKEN);
    expect(JSON.stringify((await prisma.integrationConnection.findUniqueOrThrow({ where: { id } })).secretRefs)).not.toContain(TOKEN);
    const audits = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId: orgId } }));
    expect(audits).not.toContain(TOKEN);
    expect(audits).toContain("secretsChanged");
    // an empty secret keeps the stored one; env: references are stored as references only
    await configureConnection(u.admin, id, { environment: "SANDBOX", secrets: { accessToken: "", appSecret: "env:DMS_TEST_APP_SECRET" } });
    const states = (await listConnections(u.admin)).connections.find((c) => c.provider === "WHATSAPP")!.secrets;
    expect(states).toMatchObject({ accessToken: "stored", appSecret: "env_missing" });
    // without a master key nothing can be stored in clear
    const key = process.env.INTEGRATION_MASTER_KEY;
    delete process.env.INTEGRATION_MASTER_KEY;
    await expect(configureConnection(u.admin, id, { environment: "SANDBOX", secrets: { accessToken: "plain" } })).rejects.toMatchObject(code(/SECRET_STORE_NOT_CONFIGURED/));
    process.env.INTEGRATION_MASTER_KEY = key;
  });

  it("3. configure / test / disable are permission-enforced", async () => {
    const u = await users();
    await listConnections(u.admin);
    const wa = await conn("WHATSAPP");
    for (const who of [u.mk, u.emp, u.agent, u.ceo]) await expect(configureConnection(who, wa.id, { config: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const who of [u.mk, u.emp, u.agent]) await expect(testConnection(who, wa.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listConnections(u.emp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setConnectionDisabled(u.mk, wa.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testConnection(u.ceo, wa.id)).status).toBe("NOT_CONFIGURED"); // CEO may test, not configure
  });

  it("4. provider errors are sanitized before they are stored or shown", async () => {
    const u = await users();
    const id = await connectWhatsApp(u);
    graph.healthStatus = 401;
    const r = await testConnection(u.admin, id);
    expect(r).toMatchObject({ status: "ERROR", code: "AUTH_FAILED" });
    const ex = await prisma.integrationExecution.findFirstOrThrow({ where: { connectionId: id, status: "FAILED" }, orderBy: { startedAt: "desc" } });
    expect(ex.sanitizedError ?? "").not.toContain(TOKEN);
    const c = await prisma.integrationConnection.findUniqueOrThrow({ where: { id } });
    expect(c.lastErrorMessage ?? "").not.toContain(TOKEN);
    expect(sanitizeError(`Authorization: Bearer ${TOKEN} access_token=${TOKEN} ya29.abcdefghijk`)).not.toMatch(/EAAtest|ya29\.abc/);
    expect(JSON.stringify(await listIntegrationLogs(u.admin, { view: "failed" }))).not.toContain(TOKEN);
  });
});

describe("webhooks", () => {
  async function inbound(u: U) {
    await listConnections(u.admin);
    const c = await conn("WEBHOOK");
    await configureConnection(u.admin, c.id, { secrets: { signingSecret: "whsec_test_1" } });
    return c.id;
  }
  const leadEvent = (id: string, phone = "+966551110001") => ({ id, event: "lead.created", data: { name: "Webhook Lead", phone, source: "OTHER", utm: { utm_source: "landing", utm_campaign: "spring" } } });

  it("5. a valid signed event is processed once, creates the lead with its first touch, and proves the connection", async () => {
    const u = await users();
    const id = await inbound(u);
    expect((await conn("WEBHOOK")).status).toBe("CONFIGURED");
    const r = await signedPost(id, "whsec_test_1", leadEvent("evt-1"), "evt-1");
    expect(r.status).toBe(200);
    const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId: orgId, name: "Webhook Lead" } });
    const first = await prisma.attributionTouch.findFirstOrThrow({ where: { leadId: lead.id, touchType: "FIRST" } });
    expect(first).toMatchObject({ source: "landing", utmCampaign: "spring" });
    expect((await conn("WEBHOOK")).status).toBe("CONNECTED");
    const ev = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: orgId, externalEventId: "evt-1" } });
    expect(ev).toMatchObject({ status: "PROCESSED", signatureValid: true });
    expect(JSON.stringify(ev)).not.toContain("Webhook Lead"); // raw payload is never stored
    // unsupported events are verified but ignored
    expect((await signedPost(id, "whsec_test_1", { id: "evt-2", event: "something.else", data: {} }, "evt-2")).status).toBe(200);
    expect((await prisma.webhookEvent.findFirstOrThrow({ where: { externalEventId: "evt-2" } })).status).toBe("IGNORED");
  });

  it("6. invalid / missing / stale signatures and disabled connections are rejected without side effects", async () => {
    const u = await users();
    const id = await inbound(u);
    expect((await signedPost(id, "wrong-secret", leadEvent("evt-x"), "evt-x")).status).toBe(401);
    expect((await signedPost(id, "whsec_test_1", leadEvent("evt-y"), "evt-y", Math.floor(Date.now() / 1000) - 3600)).status).toBe(401);
    expect((await receiveWebhook(id, Buffer.from(JSON.stringify(leadEvent("evt-z"))), new Headers())).status).toBe(401);
    expect((await receiveWebhook(id, Buffer.alloc(300 * 1024), new Headers())).status).toBe(413);
    expect((await receiveWebhook("nope_not_a_connection", Buffer.from("{}"), new Headers())).status).toBe(404);
    expect(await prisma.lead.count({ where: { organizationId: orgId } })).toBe(0);
    const rejected = await prisma.webhookEvent.findMany({ where: { organizationId: orgId, status: "REJECTED" } });
    expect(rejected.length).toBe(3);
    expect(rejected.every((r) => !r.signatureValid)).toBe(true);
    // the genuine delivery of a previously forged id still works (rejections never claim the event id)
    expect((await signedPost(id, "whsec_test_1", leadEvent("evt-x"), "evt-x")).status).toBe(200);
    await setConnectionDisabled(u.admin, id, true);
    expect((await signedPost(id, "whsec_test_1", leadEvent("evt-d"), "evt-d")).status).toBe(403);
    // WhatsApp handshake: only the stored verify token is accepted
    const wa = await connectWhatsApp(u);
    expect((await verifySubscription(wa, new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" }))).body).toBe("42");
    expect((await verifySubscription(wa, new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "42" }))).status).toBe(403);
    expect((await waPost(wa, waBody([{ from: "966551110009", id: "wamid.forged" }]), "not-the-app-secret")).status).toBe(401);
    expect(await prisma.whatsAppMessage.count()).toBe(0);
  });

  it("7. duplicate deliveries (sequential and concurrent) never repeat the action", async () => {
    const u = await users();
    const id = await inbound(u);
    const [a, b] = await Promise.all([signedPost(id, "whsec_test_1", leadEvent("evt-dup"), "evt-dup"), signedPost(id, "whsec_test_1", leadEvent("evt-dup"), "evt-dup")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const c = await signedPost(id, "whsec_test_1", leadEvent("evt-dup"), "evt-dup");
    expect(c.body).toMatchObject({ duplicate: true });
    expect(await prisma.lead.count({ where: { organizationId: orgId } })).toBe(1);
    expect((await prisma.webhookEvent.findFirstOrThrow({ where: { externalEventId: "evt-dup" } })).duplicateCount).toBe(2);
    expect(await prisma.auditLog.count({ where: { organizationId: orgId, action: "webhook.replayed" } })).toBe(2);
  });
});

describe("outbox", () => {
  async function conversation(u: U) {
    const wa = await connectWhatsApp(u);
    await waPost(wa, waBody([{ from: "966551230001", id: "wamid.in1", text: "Hi, I need a website" }]));
    return prisma.whatsAppConversation.findFirstOrThrow({ where: { organizationId: orgId } });
  }

  it("8–9. a provider failure keeps the business record and the queued job; the retry later delivers exactly once", async () => {
    const u = await users();
    const c = await conversation(u);
    graph.failFor.set("966551230001", 503);
    const { id: messageId } = await sendReply(u.agent, c.id, { body: "Thanks — we will call you" });
    const r1 = await processOutbox({ organizationId: orgId });
    expect(r1).toMatchObject({ retrying: 1, succeeded: 0 });
    const ob = await prisma.integrationOutbox.findFirstOrThrow({ where: { organizationId: orgId, eventType: "whatsapp.send" } });
    expect(ob).toMatchObject({ status: "FAILED", attempts: 1, lastErrorCode: "PROVIDER_UNAVAILABLE" });
    expect(ob.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: messageId } })).status).toBe("QUEUED"); // not rolled back, not lost
    expect((await processOutbox({ organizationId: orgId })).succeeded).toBe(0); // not due yet
    graph.failFor.clear();
    const r2 = await processOutbox({ organizationId: orgId, now: new Date(Date.now() + 60 * 60_000) });
    expect(r2.succeeded).toBe(1);
    const m = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(m).toMatchObject({ status: "SENT" });
    expect(m.providerMessageId).toMatch(/^wamid\./);
    expect(graph.sends.length).toBe(1);
    // nothing left: running again delivers nothing new
    await processOutbox({ organizationId: orgId, now: new Date(Date.now() + 2 * 3600_000) });
    expect(graph.sends.length).toBe(1);
    expect(graph.lastAuth).toBe(`Bearer ${TOKEN}`); // the real token was used for the call…
    expect(JSON.stringify(await prisma.integrationExecution.findMany())).not.toContain(TOKEN); // …and stored nowhere
  });

  it("10. a permanent rejection goes to the dead letter; operators can retry or dismiss (audited)", async () => {
    const u = await users();
    const c = await conversation(u);
    graph.failFor.set("966551230001", 400);
    const { id: messageId } = await sendReply(u.agent, c.id, { body: "hello" });
    expect((await processOutbox({ organizationId: orgId })).dead).toBe(1);
    const ob = await prisma.integrationOutbox.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(ob.status).toBe("DEAD_LETTER");
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: messageId } })).status).toBe("FAILED");
    expect(await prisma.domainEvent.count({ where: { organizationId: orgId, type: "integration.dead_letter" } })).toBe(1);
    await expect(retryOutbox(u.mk, ob.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await retryOutbox(u.admin, ob.id);
    expect((await prisma.integrationOutbox.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe("PENDING");
    await processOutbox({ organizationId: orgId });
    await dismissOutbox(u.admin, ob.id, { reason: "number invalid" });
    expect((await prisma.integrationOutbox.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe("DISMISSED");
    await expect(retryOutbox(u.admin, ob.id)).rejects.toMatchObject(code(/OUTBOX_NOT_RETRYABLE/));
    expect(await prisma.auditLog.count({ where: { organizationId: orgId, action: { in: ["integration.retry_requested", "integration.dismissed"] } } })).toBe(2);
  });
});

describe("WhatsApp", () => {
  it("11. inbound processing is idempotent on provider ids (same message twice = one row)", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    const body = waBody([{ from: "966551230002", id: "wamid.same" }]);
    await waPost(wa, body);
    await waPost(wa, body); // identical delivery → duplicate event
    await waPost(wa, waBody([{ from: "966551230002", id: "wamid.same", ts: 1 }])); // different envelope, same message id
    expect(await prisma.whatsAppMessage.count({ where: { organizationId: orgId } })).toBe(1);
    expect(await prisma.whatsAppConversation.count({ where: { organizationId: orgId } })).toBe(1);
    expect(await prisma.supportTicket.count({ where: { organizationId: orgId } })).toBe(0); // never auto-created
    expect(await prisma.lead.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it("12–13. a single CRM match is linked; several matches stay AMBIGUOUS until an operator links one", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    const one = await createLead(u.mk, { name: "Single Match", whatsapp: "0551230003", source: "WEBSITE" });
    await waPost(wa, waBody([{ from: "966551230003", id: "wamid.m1" }]));
    const m = await prisma.whatsAppConversation.findFirstOrThrow({ where: { waId: "966551230003" } });
    expect(m).toMatchObject({ matchState: "MATCHED", leadId: one.id });
    // same phone on a lead AND an unrelated client → ambiguous, nothing linked or merged
    const lead2 = await createLead(u.mk, { name: "Lead Twin", phone: "0551230004", source: "PHONE" });
    const client = await createClient(u.sm, { displayName: "Twin Trading", phone: "+966551230004" });
    await waPost(wa, waBody([{ from: "966551230004", id: "wamid.m2" }]));
    const a = await prisma.whatsAppConversation.findFirstOrThrow({ where: { waId: "966551230004" } });
    expect(a).toMatchObject({ matchState: "AMBIGUOUS", leadId: null, clientId: null, contactId: null });
    expect((a.candidates as { id: string }[]).map((x) => x.id).sort()).toEqual([client.id, lead2.id].sort());
    expect(await prisma.lead.count({ where: { id: lead2.id } })).toBe(1);
    // the agent can't see leads → can't link to one
    await expect(linkConversation(u.agent, a.id, { type: "lead", targetId: lead2.id })).rejects.toMatchObject(code(/UNKNOWN_LEAD/));
    await linkConversation(u.sm, a.id, { type: "client", targetId: client.id });
    expect(await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ matchState: "MATCHED", clientId: client.id });
    expect(await prisma.auditLog.count({ where: { action: "whatsapp.conversation_linked" } })).toBe(1);
  });

  it("14. an operator creates a lead from an unknown sender (source WhatsApp, first touch recorded)", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    await waPost(wa, waBody([{ from: "966551230005", id: "wamid.l1", text: "Price for an app?" }]));
    const c = await prisma.whatsAppConversation.findFirstOrThrow({ where: { waId: "966551230005" } });
    expect(c.matchState).toBe("UNMATCHED");
    await expect(createLeadFromConversation(u.agent, c.id, { name: "App Prospect" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { id } = await createLeadFromConversation(u.mk, c.id, { name: "App Prospect" });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(lead).toMatchObject({ source: "WHATSAPP", whatsappNormalized: "966551230005" });
    expect(await prisma.attributionTouch.findFirstOrThrow({ where: { leadId: id, touchType: "FIRST" } })).toMatchObject({ source: "whatsapp" });
    expect(await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ leadId: id, matchState: "MATCHED" });
    await expect(createLeadFromConversation(u.mk, c.id, { name: "Again" })).rejects.toMatchObject(code(/CONVERSATION_ALREADY_HAS_LEAD/));
  });

  it("15. an operator turns a conversation into a support ticket — once", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    await waPost(wa, waBody([{ from: "966551230006", id: "wamid.t1", text: "The site is down!" }]));
    const c = await prisma.whatsAppConversation.findFirstOrThrow({ where: { waId: "966551230006" } });
    const { id } = await createTicketFromConversation(u.agent, c.id, { subject: "Website down", priority: "HIGH" });
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.description).toContain("The site is down!");
    await expect(createTicketFromConversation(u.agent, c.id, { subject: "Again" })).rejects.toMatchObject(code(/CONVERSATION_ALREADY_HAS_TICKET/));
    expect((await getConversation(u.agent, c.id)).ticket?.id).toBe(id);
    // free text outside the 24-hour window is refused — a template is required
    await prisma.whatsAppConversation.update({ where: { id: c.id }, data: { lastInboundAt: new Date(Date.now() - 25 * 3600_000) } });
    await expect(sendReply(u.agent, c.id, { body: "hello?" })).rejects.toMatchObject(code(/TEMPLATE_REQUIRED_OUTSIDE_WINDOW/));
  });
});

describe("campaigns", () => {
  it("16. the recipient snapshot and the message are frozen once the campaign starts", async () => {
    const u = await users();
    await connectWhatsApp(u);
    const id = await campaignOver(u, ["0551000001", "0551000002"]);
    await submitCampaign(u.mk, id);
    await startCampaign(u.mk, id);
    const c = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ status: "RUNNING", recipientCount: 2 });
    await expect(prisma.campaignRecipient.create({ data: { campaignId: id, phone: "966559999999" } })).rejects.toThrow(/RECIPIENTS_IMMUTABLE/);
    const r = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: id } });
    await expect(prisma.campaignRecipient.delete({ where: { id: r.id } })).rejects.toThrow(/RECIPIENTS_IMMUTABLE/);
    await expect(prisma.campaignRecipient.update({ where: { id: r.id }, data: { phone: "966558888888" } })).rejects.toThrow(/RECIPIENTS_IMMUTABLE/);
    await expect(prisma.marketingCampaign.update({ where: { id }, data: { templateParams: ["changed"] } })).rejects.toThrow(/CAMPAIGN_IMMUTABLE/);
    await expect(updateCampaign(u.mk, id, { templateParams: "changed" })).rejects.toMatchObject(code(/CAMPAIGN_NOT_EDITABLE/));
    await expect(setAudience(u.mk, id, { kind: "clients" })).rejects.toMatchObject(code(/CAMPAIGN_NOT_EDITABLE/));
    // a new lead created after the start is not added
    await createLead(u.mk, { name: "Late Lead", whatsapp: "0551000003", source: "WEBSITE" });
    await setConsent(u.mk, { address: "0551000003", status: "OPTED_IN", source: "form" });
    await runAll();
    expect(await prisma.campaignRecipient.count({ where: { campaignId: id } })).toBe(2);
    expect(graph.sends.map((s) => s.to).sort()).toEqual(["966551000001", "966551000002"]);
    expect(((graph.sends[0].body.template as { components: { parameters: { text: string }[] }[] }).components[0].parameters[0].text)).toMatch(/^Lead /);
  });

  it("17. opted-out and non-consenting contacts are skipped (recorded with a reason); opt-out after start wins; STOP opts out", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    const id = await campaignOver(u, ["0551000011", "0551000012", "0551000013", "0551000014"], { optOut: ["0551000012"], noConsent: ["0551000013"] });
    await submitCampaign(u.mk, id);
    await startCampaign(u.mk, id);
    const rec = await prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { phone: "asc" } });
    expect(rec.map((r) => [r.phone, r.status, r.skipReason])).toEqual([
      ["966551000011", "PENDING", null], ["966551000012", "SKIPPED", "OPTED_OUT"], ["966551000013", "SKIPPED", "NO_OPT_IN"], ["966551000014", "PENDING", null]
    ]);
    expect(await prisma.auditLog.count({ where: { action: "campaign.recipient_skipped" } })).toBe(1);
    // opts out by keyword after the snapshot
    await waPost(wa, waBody([{ from: "966551000014", id: "wamid.stop", text: "STOP" }]));
    expect(await currentConsent(prisma, orgId, "WHATSAPP", "966551000014")).toBe("OPTED_OUT");
    await runAll();
    expect(graph.sends.map((s) => s.to)).toEqual(["966551000011"]);
    expect((await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: id, phone: "966551000014" } })).skipReason).toBe("OPTED_OUT_AFTER_SNAPSHOT");
    // re-enabling needs a recorded reason; consent history is append-only
    await expect(setConsent(u.mk, { address: "0551000014", status: "OPTED_IN", source: "call" })).rejects.toMatchObject(code(/REOPT_IN_REASON_REQUIRED/));
    await setConsent(u.mk, { address: "0551000014", status: "OPTED_IN", source: "call", note: "Customer asked by phone to receive offers again" });
    const row = await prisma.contactConsent.findFirstOrThrow({ where: { address: "966551000014" } });
    await expect(prisma.contactConsent.update({ where: { id: row.id }, data: { status: "OPTED_IN" } })).rejects.toThrow(/CONSENT_IMMUTABLE/);
    await expect(prisma.contactConsent.delete({ where: { id: row.id } })).rejects.toThrow(/CONSENT_IMMUTABLE/);
  });

  it("18. repeated / concurrent worker runs never send a recipient twice", async () => {
    const u = await users();
    await connectWhatsApp(u);
    const id = await campaignOver(u, ["0551000021", "0551000022", "0551000023"]);
    await submitCampaign(u.mk, id);
    await startCampaign(u.mk, id);
    await Promise.all([campaignTick(), campaignTick(), campaignTick()]);
    await Promise.all([processOutbox({ organizationId: orgId }), processOutbox({ organizationId: orgId })]);
    await Promise.all([integrationsTick(new Date(), orgId), campaignTick()]);
    await processOutbox({ organizationId: orgId, now: new Date(Date.now() + 2 * 3600_000) });
    expect(graph.sends.length).toBe(3);
    expect(new Set(graph.sends.map((s) => s.to)).size).toBe(3);
    expect(await prisma.campaignMessage.count({ where: { campaignId: id } })).toBe(3);
    expect(await prisma.integrationOutbox.count({ where: { organizationId: orgId, eventType: "whatsapp.send" } })).toBe(3);
    await campaignTick();
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
    // delivery receipts update the recipient (real provider data only)
    const r = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: id, phone: "966551000021" } });
    const wa = (await conn("WHATSAPP")).id;
    await waPost(wa, waBody([], [{ id: r.providerMessageId!, status: "read" }]));
    expect((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("READ");
    await waPost(wa, waBody([{ from: "966551000021", id: "wamid.reply", text: "Interested" }]));
    expect((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REPLIED");
  });

  it("19. over the threshold a campaign needs approval bound to its version; an edit makes the approval stale", async () => {
    const u = await users();
    await connectWhatsApp(u);
    await prisma.organization.update({ where: { id: orgId }, data: { campaignApprovalThreshold: 1 } });
    const id = await campaignOver(u, ["0551000031", "0551000032"]);
    await submitCampaign(u.mk, id);
    let c = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("DRAFT");
    const first = c.approvalId!;
    expect(await prisma.approval.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ type: "CAMPAIGN", status: "PENDING", requiredPermission: "whatsapp.campaigns.approve" });
    await expect(startCampaign(u.mk, id)).rejects.toMatchObject(code(/CAMPAIGN_NOT_READY/));
    await expect(decideApproval(u.mk, { approvalId: first, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" }); // requester / no approve permission
    // editing the message withdraws the pending approval
    await updateCampaign(u.mk, id, { templateParams: "{{name}}|25%" });
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: first } })).status).toBe("CANCELLED");
    await expect(decideApproval(u.sm, { approvalId: first, decision: "APPROVED" })).rejects.toThrow();
    await submitCampaign(u.mk, id);
    c = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } });
    await decideApproval(u.sm, { approvalId: c.approvalId!, decision: "APPROVED" });
    c = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ status: "READY", approvedVersion: c.version });
    // a change after approval → back to draft, approval stale, cannot start
    await updateCampaign(u.mk, id, { templateParams: "{{name}}|30%" });
    c = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("DRAFT");
    expect(c.approvedVersion).not.toBe(c.version);
    expect((await getCampaign(u.mk, id)).approvalStale).toBe(true);
    await expect(startCampaign(u.mk, id)).rejects.toMatchObject(code(/CAMPAIGN_NOT_READY/));
    expect(await prisma.auditLog.count({ where: { action: "campaign.approval_stale" } })).toBeGreaterThan(0);
    // descriptive fields never invalidate an approval
    await submitCampaign(u.mk, id);
    await decideApproval(u.sm, { approvalId: (await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } })).approvalId!, decision: "APPROVED" });
    await updateCampaign(u.mk, id, { name: "Spring offer (renamed)", budget: "1500" });
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("READY");
    await startCampaign(u.mk, id);
  });

  it("20. a provider failure fails only that recipient — the campaign keeps its sent messages and completes", async () => {
    const u = await users();
    await connectWhatsApp(u);
    const id = await campaignOver(u, ["0551000041", "0551000042", "0551000043"]);
    await submitCampaign(u.mk, id);
    await startCampaign(u.mk, id);
    graph.failFor.set("966551000042", 400);
    await runAll();
    const rec = Object.fromEntries((await prisma.campaignRecipient.findMany({ where: { campaignId: id } })).map((r) => [r.phone, r.status]));
    expect(rec).toEqual({ "966551000041": "SENT", "966551000042": "FAILED", "966551000043": "SENT" });
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
    // connection down while running: nothing is queued, nothing fails, the campaign waits
    const id2 = await campaignOver(u, ["0551000044"]);
    await submitCampaign(u.mk, id2);
    await startCampaign(u.mk, id2);
    await prisma.integrationConnection.update({ where: { id: (await conn("WHATSAPP")).id }, data: { status: "ERROR" } });
    await runAll();
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: id2 } })).status).toBe("RUNNING");
    expect((await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: id2 } })).status).toBe("PENDING");
    await cancelCampaign(u.mk, id2);
    expect((await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: id2 } })).skipReason).toBe("CAMPAIGN_CANCELLED");
  });
});

describe("attribution & reporting", () => {
  it("21. the first touch is preserved; later contacts are appended; attribution history is immutable", async () => {
    const u = await users();
    const camp = await createCampaign(u.mk, { name: "Google search", channel: "GOOGLE", utmCampaign: "brand-2026" });
    const lead = await saveLead({ name: "Utm Visitor", email: "visitor@client.test", phone: "0551000051", service: "web-development", message: "Need a site", elapsed: 9000, utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "brand-2026" } }, { ip: "1.1.1.1", userAgent: "test" });
    expect(lead).toBeTruthy();
    const l = await prisma.lead.findFirstOrThrow({ where: { organizationId: orgId, emailNormalized: "visitor@client.test" } });
    const first = await prisma.attributionTouch.findFirstOrThrow({ where: { leadId: l.id, touchType: "FIRST" } });
    expect(first).toMatchObject({ source: "google", medium: "cpc", campaignId: camp.id });
    // resubmission from another campaign: new TOUCH, first touch unchanged
    const other = await createCampaign(u.mk, { name: "Meta retargeting", channel: "META", utmCampaign: "retarget" });
    await saveLead({ name: "Utm Visitor", email: "visitor@client.test", phone: "0551000051", service: "web-development", message: "Following up", elapsed: 9000, utm: { utm_source: "facebook", utm_campaign: "retarget" } }, { ip: "1.1.1.1", userAgent: "test" });
    const touches = await prisma.attributionTouch.findMany({ where: { leadId: l.id }, orderBy: { occurredAt: "asc" } });
    expect(touches.map((t) => [t.touchType, t.campaignId])).toEqual([["FIRST", camp.id], ["TOUCH", other.id]]);
    await recordFirstTouch(prisma as never, null, orgId, l.id, { source: "overwrite-attempt" });
    expect((await prisma.attributionTouch.findFirstOrThrow({ where: { leadId: l.id, touchType: "FIRST" } })).source).toBe("google");
    await expect(prisma.attributionTouch.update({ where: { id: first.id }, data: { source: "x" } })).rejects.toThrow(/ATTRIBUTION_IMMUTABLE/);
    await expect(prisma.attributionTouch.create({ data: { organizationId: orgId, leadId: l.id, touchType: "FIRST", source: "dup" } })).rejects.toThrow();
    expect((await campaignFunnel(orgId, [camp.id, other.id], "first"))[camp.id].leads).toBe(1);
    expect((await campaignFunnel(orgId, [camp.id, other.id], "last"))[other.id].leads).toBe(1);
    expect((await campaignFunnel(orgId, [camp.id, other.id], "last"))[camp.id].leads).toBe(0);
  });

  it("22. billed (issued invoices) and collected (payment allocations) are separate, traceable figures", async () => {
    const u = await users();
    const camp = await createCampaign(u.mk, { name: "LinkedIn B2B", channel: "LINKEDIN", utmCampaign: "b2b" });
    const lead = await prisma.lead.findFirstOrThrow({ where: { id: (await createLead(u.mk, { name: "B2B Lead", email: "b2b@client.test", source: "LINKEDIN" })).id } });
    // link the lead to the campaign through a (new) explicit touch — first touch was "linkedin" without utm
    expect((await campaignFunnel(orgId, [camp.id], "first"))[camp.id].leads).toBe(0);
    const svc = await prisma.service.findFirstOrThrow({ where: { organizationId: orgId, key: "web-development" } });
    const client = await createClient(u.sm, { displayName: "B2B Holding" });
    const opp = await createOpportunity(u.sm, { clientId: client.id, title: "Portal", serviceId: svc.id });
    await prisma.opportunity.update({ where: { id: opp.id }, data: { sourceLeadId: lead.id } });
    await prisma.attributionTouch.create({ data: { organizationId: orgId, leadId: lead.id, touchType: "TOUCH", source: "linkedin", utmCampaign: "b2b", campaignId: camp.id } });
    const q = await createQuotation(u.sm, { clientId: client.id, opportunityId: opp.id, items: [{ serviceId: svc.id, name: "Portal", quantity: "1", unitPrice: "20000" }] });
    await submitQuotation(u.sm, q.id);
    await markQuotationSent(u.sm, q.id, { method: "OTHER", confirm: true });
    const v = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q.id } });
    await acceptQuotation(u.sm, q.id, { versionId: v.id, confirm: true, markOpportunityWon: false });
    const ct = await createContractFromQuotation(u.sm, q.id);
    await updateContract(u.sm, ct.id, { title: "Portal contract", startDate: d(0), endDate: d(90), milestones: [] });
    await sendContractForSignature(u.sm, ct.id);
    await activateContract(u.sm, ct.id, { signedAt: d(0), confirm: true });
    const { id: invId } = await createInvoiceFromSource(u.fm, { type: "CONTRACT", id: ct.id });
    await issueInvoice(u.fm, invId);
    await recordPayment(u.fm, { clientId: client.id, amount: "5000", paymentDate: d(0), method: "BANK_TRANSFER", allocations: [{ invoiceId: invId, amount: "5000" }] });
    const last = (await campaignFunnel(orgId, [camp.id], "last"))[camp.id];
    expect(last).toMatchObject({ leads: 1, opportunities: 1, billed: "23000.00", collected: "5000.00" });
    expect(last).not.toHaveProperty("revenue");
    await addSpend(u.mk, camp.id, { date: d(0), amount: "1000" });
    await expect(addSpend(u.mk, camp.id, { date: d(0), amount: "10", currency: "USD" })).rejects.toMatchObject(code(/CURRENCY_MISMATCH/));
    const dash = await marketingDashboard(u.mk, { days: 30 });
    expect(dash.campaigns.find((c) => c.id === camp.id)).toBeUndefined(); // DRAFT campaigns are not "performing"
    const det = await getCampaign(u.mk, camp.id);
    expect(det.spend).toEqual({ manual: "1000.00", synced: "0.00" });
    expect(det.funnelLast).toMatchObject({ billed: "23000.00", collected: "5000.00" });
  });

  it("23. integration logs need integrations.logs.view and never expose payloads", async () => {
    const u = await users();
    const wa = await connectWhatsApp(u);
    await waPost(wa, waBody([{ from: "966551230070", id: "wamid.x" }]));
    const c = await prisma.whatsAppConversation.findFirstOrThrow({ where: { organizationId: orgId } });
    await sendReply(u.agent, c.id, { body: "private text for the customer" });
    for (const who of [u.mk, u.agent, u.emp, u.sm]) await expect(listIntegrationLogs(who, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const logs = await listIntegrationLogs(u.admin, { view: "retrying" });
    expect(logs.retrying!.length).toBe(1);
    expect(JSON.stringify(logs)).not.toContain("private text");
    expect([...logs.retrying![0].payloadKeys].sort()).toEqual(["message", "messageId"]);
    const item = await getOutboxItem(u.admin, logs.retrying![0].id);
    expect(JSON.stringify(item)).not.toContain("private text");
    await expect(getOutboxItem(u.mk, logs.retrying![0].id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("documents & storage", () => {
  it("24. a former owner of an entity-linked document cannot download it after losing access to the record", async () => {
    const u = await users();
    const repUser = await makeUser(orgId, "rep@x.test", ["sales_rep"]);
    let rep = await ctxFor(repUser.id);
    // the manager creates the client and assigns it to the rep — the rep's access comes only from ownership
    const client = await createClient(u.sm, { displayName: "Rep Client" });
    await prisma.client.update({ where: { id: client.id }, data: { ownerId: repUser.id } });
    const doc = await createDocument(rep, { title: "Signed NDA", entityType: "CLIENT", entityId: client.id, classification: "CONFIDENTIAL" }, { name: "nda.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n% nda\n%%EOF\n") });
    expect((await downloadDocument(rep, doc.id)).data.length).toBeGreaterThan(0);
    // reassigned to another owner → the rep's "own records" scope no longer covers the client
    await prisma.client.update({ where: { id: client.id }, data: { ownerId: u.sm.userId } });
    await expect(downloadDocument(rep, doc.id)).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
    // role removed entirely
    await prisma.client.update({ where: { id: client.id }, data: { ownerId: repUser.id } });
    expect((await downloadDocument(rep, doc.id)).data.length).toBeGreaterThan(0);
    await prisma.userRole.deleteMany({ where: { userId: repUser.id } });
    await prisma.userRole.create({ data: { userId: repUser.id, roleId: await roleId(orgId, "employee") } });
    rep = await ctxFor(repUser.id);
    await expect(downloadDocument(rep, doc.id)).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
  });

  it("25. S3 adapter contract: SigV4 signed, never overwrites, checksum, get / exists / remove", async () => {
    const store = new Map<string, { body: Buffer; sha: string | null }>();
    const seen: { method: string; url: string; auth: string }[] = [];
    const fake = (async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      seen.push({ method: init?.method ?? "GET", url: url.pathname, auth: headers.get("authorization") ?? "" });
      const key = url.pathname;
      const m = init?.method ?? "GET";
      if (m === "HEAD") return store.has(key) ? new Response(null, { status: 200, headers: { "x-amz-meta-sha256": store.get(key)!.sha ?? "" } }) : new Response(null, { status: url.pathname === "/docs-bucket" ? 200 : 404 });
      if (m === "PUT") {
        store.set(key, { body: Buffer.from(init!.body as Uint8Array), sha: headers.get("x-amz-meta-sha256") });
        return new Response(null, { status: 200 });
      }
      if (m === "GET") return store.has(key) ? new Response(new Uint8Array(store.get(key)!.body), { status: 200 }) : new Response(null, { status: 404 });
      if (m === "DELETE") return store.delete(key), new Response(null, { status: 204 });
      return new Response(null, { status: 400 });
    }) as typeof fetch;
    const s3 = new S3StorageAdapter({ endpoint: "https://s3.example.test", region: "me-central-1", bucket: "docs-bucket", accessKeyId: "AKIATEST", secretAccessKey: "s3-secret", forcePathStyle: true }, fake);
    const data = Buffer.from("%PDF-1.4 contract");
    await s3.put("org/doc/v1.pdf", data);
    expect(seen.every((r) => r.auth.startsWith("AWS4-HMAC-SHA256 Credential=AKIATEST/") && r.auth.includes("Signature="))).toBe(true);
    expect(seen.some((r) => r.auth.includes("s3-secret"))).toBe(false);
    expect(await s3.exists("org/doc/v1.pdf")).toBe(true);
    expect((await s3.get("org/doc/v1.pdf")).equals(data)).toBe(true);
    expect(await s3.checksum("org/doc/v1.pdf")).toBe(createHash("sha256").update(data).digest("hex"));
    await expect(s3.put("org/doc/v1.pdf", Buffer.from("other"))).rejects.toThrow(/already exists/);
    expect((await s3.get("org/doc/v1.pdf")).equals(data)).toBe(true);
    expect(await s3.exists("missing.pdf")).toBe(false);
    await s3.remove("org/doc/v1.pdf");
    expect(await s3.exists("org/doc/v1.pdf")).toBe(false);
    expect(await s3.ping()).toBe(200);
    // the same signing input always yields the same signature (deterministic SigV4)
    const url = new URL("https://s3.example.test/docs-bucket/a.pdf");
    const now = new Date("2026-10-01T00:00:00Z");
    expect(s3.sign("GET", url, {}, "", now).authorization).toBe(s3.sign("GET", url, {}, "", now).authorization);
  });
});

describe("NOVA boundary", () => {
  it("26. NOVA stays an external link: URL configuration is never reported as connected", async () => {
    const u = await users();
    const prev = process.env.NOVA_URL;
    process.env.NOVA_URL = "https://nova.example.test";
    try {
      const h = await nova.health();
      expect(h.result).not.toBe("healthy");
      const n = (await listConnections(u.admin)).connections.find((c) => c.provider === "NOVA")!;
      expect(n.status).toBe("CONFIGURED");
      const t = await testConnection(u.admin, n.id);
      expect(t.status).not.toBe("CONNECTED");
      expect((await listConnections(u.admin)).connections.find((c) => c.provider === "NOVA")!.status).toBe("CONFIGURED");
      process.env.NOVA_URL = "not a url";
      expect((await listConnections(u.admin)).connections.find((c) => c.provider === "NOVA")!.status).toBe("ERROR");
    } finally {
      if (prev === undefined) delete process.env.NOVA_URL;
      else process.env.NOVA_URL = prev;
    }
  });
});

describe("secret loss", () => {
  it("27. an unreadable secret (rotated master key) never shows CONNECTED and nothing is sent without credentials", async () => {
    const u = await users();
    const id = await connectWhatsApp(u);
    const key = process.env.INTEGRATION_MASTER_KEY;
    process.env.INTEGRATION_MASTER_KEY = randomBytes(32).toString("base64");
    try {
      const w = (await listConnections(u.admin)).connections.find((c) => c.provider === "WHATSAPP")!;
      expect(w.status).toBe("NOT_CONFIGURED");
      expect(w.secrets.accessToken).toBe("missing");
      await waPost(id, waBody([{ from: "966551230099", id: "wamid.k1" }]));
      const conv = await prisma.whatsAppConversation.findFirst({ where: { organizationId: orgId } });
      expect(conv).toBeNull(); // app secret unreadable → signature cannot be verified → rejected
      const sent = graph.sends.length;
      expect((await testConnection(u.admin, id)).status).toBe("NOT_CONFIGURED");
      expect(graph.sends.length).toBe(sent);
    } finally {
      process.env.INTEGRATION_MASTER_KEY = key;
    }
  });
});
