import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IntegrationOutbox, ZatcaDocument, ZatcaEgsUnit } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { requirePermission, systemCtx, type Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { unitOfWork, type Uow } from "../events/bus";
import { enqueue, registerOutboxHandler } from "../integrations/outbox";
import { IntegrationError } from "../integrations/http";
import { resolveSecret } from "../integrations/secrets";
import { appEnv, outboundAllowed } from "../system/environment";
import { log } from "../obs/log";
import { metrics } from "../obs/metrics";
import { Decimal } from "@/lib/commercial/calc";
import { FIRST_PREVIOUS_HASH, TYPE_CODE, type VatCategory } from "./spec";
import { generateDocument, type Address, type ZatcaInvoiceInput } from "./xml";
import { httpFatooraClient, type FatooraClient, type SubmitResult } from "./fatoora";

/**
 * ZATCA lifecycle (Phase 11 — docs/ZATCA.md). Separate from invoice accounting: the Invoice keeps its number, totals
 * and status; ZatcaDocument holds the compliance artefact and its state.
 *
 *   issueInvoice ─(same transaction, invoice row locked)─► generate: EGS unit row locked → ICV = counter + 1,
 *   PIH = hash of the previous document → immutable XML + hash → outbox "zatca.submit" (same transaction)
 *   worker ─► clearance (STANDARD) / reporting (SIMPLIFIED) → CLEARED | REPORTED | REJECTED | AUTH_FAILED | retry
 *
 *   · one live document per invoice (unique partial index + trigger); a rejected document stays in the chain and a
 *     corrected one is a NEW document (new ICV / UUID / hash — [GUIDE] FAQ)
 *   · UNKNOWN (timeout after sending) → the SAME bytes are resubmitted, never regenerated ([GUIDE] FAQ: ZATCA counts a
 *     document once by UUID + hash)
 *   · a standard (B2B) invoice may only be delivered to the buyer once CLEARED ([GUIDE] §4.3.2)
 *   · after a database restore every ACTIVE unit is LOCKED_AFTER_RESTORE (the restored counter / hash may be behind
 *     what ZATCA already received) until an operator reconciles it (scripts/zatca-unit.ts unlock)
 *   · simplified (B2C) documents need the seller's XAdES cryptographic stamp — NOT implemented in this build → refused
 */

export const zatcaRequired = (env: Record<string, string | undefined> = process.env) => ["REQUIRED", "REQUIRED_NOT_READY", "READY"].includes((env.ZATCA_STATUS ?? "").trim().toUpperCase());
const FINAL = new Set(["CLEARED", "REPORTED", "REJECTED"]);
const sandboxLike = (e: string) => (e === "PRODUCTION" ? "PRODUCTION" : "SANDBOX") as "PRODUCTION" | "SANDBOX";

// --- configuration -----------------------------------------------------------------------------------------------------

/** The unit documents are generated on: the organization's ACTIVE unit (a LOCKED unit blocks generation). */
async function unitFor(db: Tx | typeof prisma, organizationId: string) {
  const units = await db.zatcaEgsUnit.findMany({ where: { organizationId, status: { in: ["ACTIVE", "LOCKED_AFTER_RESTORE"] } }, orderBy: { createdAt: "asc" } });
  return units.find((u) => u.status === "ACTIVE") ?? units[0] ?? null;
}

const partyAddress = (p: { streetName: string | null; additionalStreetName: string | null; buildingNumber: string | null; plotIdentification: string | null; district: string | null; city: string | null; postalCode: string | null; countryCode: string } | null, fallbackCity?: string | null, fallbackCountry?: string | null): Address | null =>
  p ? { street: p.streetName ?? "", additionalStreet: p.additionalStreetName, building: p.buildingNumber, plot: p.plotIdentification, district: p.district, city: p.city ?? fallbackCity ?? "", postalCode: p.postalCode, country: p.countryCode || fallbackCountry || "" } : null;

const VAT_OF: Record<string, VatCategory> = { STANDARD: "S", ZERO_RATED: "Z", EXEMPT: "E" };

/** Immutable snapshot of an ISSUED invoice in ZATCA terms. Never invents data: what is missing fails validation. */
export async function snapshotOfInvoice(db: Tx | typeof prisma, invoiceId: string, env: Record<string, string | undefined> = process.env): Promise<ZatcaInvoiceInput> {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: { orderBy: { sortOrder: "asc" } }, client: true } });
  if (!inv.number || !inv.issuedAt) throw conflict("ZATCA_INVOICE_NOT_ISSUED");
  const org = await db.organization.findUniqueOrThrow({ where: { id: inv.organizationId } });
  const [sp, bp] = await Promise.all([
    db.zatcaPartyProfile.findFirst({ where: { organizationId: inv.organizationId, clientId: null } }),
    db.zatcaPartyProfile.findFirst({ where: { organizationId: inv.organizationId, clientId: inv.clientId } })
  ]);
  const issueDate = inv.issueDate.toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(inv.issuedAt);
  // KSA-5 supply date: a business decision (docs/ZATCA.md) — only used when the company configured the policy
  const supplyDate = (env.ZATCA_SUPPLY_DATE_POLICY ?? "").toUpperCase() === "ISSUE_DATE" ? issueDate : null;
  const c = inv.client;
  const dec = (v: { toFixed(n: number): string }) => v.toFixed(2);
  const net = new Decimal(dec(inv.subtotal)).minus(new Decimal(dec(inv.discountTotal))).toFixed(2);
  return {
    kind: c.type === "INDIVIDUAL" ? "SIMPLIFIED" : "STANDARD",
    typeCode: TYPE_CODE.invoice,
    number: inv.number,
    issueDate,
    issueTime: time,
    currency: inv.currency,
    supplyDate,
    seller: {
      registrationName: sp?.registrationName ?? org.legalName ?? org.nameAr ?? org.name,
      vatNumber: sp?.vatNumber ?? org.vatNumber,
      otherId: sp?.otherId ?? org.crNumber,
      otherIdScheme: sp?.otherIdScheme ?? (org.crNumber ? "CRN" : null),
      address: partyAddress(sp, org.city, org.country)
    },
    buyer: {
      registrationName: bp?.registrationName ?? c.companyName ?? c.displayName,
      vatNumber: bp?.vatNumber ?? c.taxNumber,
      otherId: bp?.otherId ?? c.commercialRegistration,
      otherIdScheme: bp?.otherIdScheme ?? (c.commercialRegistration ? "CRN" : null),
      address: partyAddress(bp, c.city, c.country)
    },
    lines: inv.items.map((i, n) => ({
      id: String(n + 1),
      name: i.description,
      quantity: i.quantity.toFixed(3),
      unitPrice: i.unitPrice.toFixed(2),
      discount: i.discountAmount.toFixed(2),
      net: i.subtotal.toFixed(2),
      vatCategory: VAT_OF[i.taxBehavior] ?? "S",
      vatRate: i.taxRate.toFixed(2),
      vatAmount: i.taxAmount.toFixed(2),
      exemptionCode: null // DMS holds no VATEX reason codes: zero-rated / exempt lines fail validation until it does
    })),
    totals: { lineExtension: net, taxExclusive: net, taxTotal: dec(inv.taxTotal), taxInclusive: dec(inv.total), payable: dec(inv.total) }
  };
}

// --- generation ----------------------------------------------------------------------------------------------------------

/**
 * Called by issueInvoice INSIDE its transaction (invoice row already locked). No-op when ZATCA is not required or no
 * unit is set up (the production issuing gate decides whether that is allowed). Validation failures abort the issue.
 */
export async function generateForIssuedInvoiceTx(tx: Tx, uow: Uow, ctx: Ctx, invoiceId: string, now = new Date()) {
  if (!zatcaRequired()) return null;
  const candidate = await unitFor(tx, ctx.organizationId);
  if (!candidate) return null;
  // chain lock: one generator per unit at a time (ICV / PIH must be gap-free and linear)
  await tx.$queryRaw`SELECT id FROM "ZatcaEgsUnit" WHERE id = ${candidate.id} FOR UPDATE`;
  const unit = await tx.zatcaEgsUnit.findUniqueOrThrow({ where: { id: candidate.id } });
  if (unit.status === "LOCKED_AFTER_RESTORE") throw conflict("ZATCA_CHAIN_LOCKED_AFTER_RESTORE");
  if (unit.status !== "ACTIVE") throw conflict(`ZATCA_UNIT_NOT_ACTIVE:${unit.status}`);
  const input = await snapshotOfInvoice(tx, invoiceId);
  if (input.kind === "SIMPLIFIED") throw conflict("ZATCA_SIMPLIFIED_NOT_SUPPORTED"); // seller stamp not implemented
  if (unit.functionalityMap[0] !== "1") throw conflict("ZATCA_UNIT_NOT_ENABLED_FOR_STANDARD");
  const chain = { uuid: randomUUID(), icv: unit.invoiceCounter + 1, previousHash: unit.lastInvoiceHash ?? FIRST_PREVIOUS_HASH };
  let doc;
  try {
    doc = generateDocument(input, chain, now);
  } catch (e) {
    const issues = (e as { issues?: unknown[] }).issues;
    if (issues) throw invalid("ZATCA_VALIDATION", { issues });
    throw e;
  }
  const row = await tx.zatcaDocument.create({
    data: { organizationId: ctx.organizationId, invoiceId, egsUnitId: unit.id, kind: input.kind, typeCode: input.typeCode, environment: unit.environment, icv: chain.icv, uuid: chain.uuid, previousHash: chain.previousHash, invoiceHash: doc.invoiceHash, xml: doc.xml, issueDate: input.issueDate, issueTime: input.issueTime }
  });
  const moved = await tx.zatcaEgsUnit.updateMany({ where: { id: unit.id, invoiceCounter: unit.invoiceCounter }, data: { invoiceCounter: chain.icv, lastInvoiceHash: doc.invoiceHash } });
  if (moved.count !== 1) throw conflict("ZATCA_CHAIN_CONCURRENT_UPDATE");
  await enqueue(tx, ctx.organizationId, { provider: "ZATCA", eventType: "zatca.submit", idempotencyKey: `zatca:${row.id}`, entityType: "ZatcaDocument", entityId: row.id, payload: { documentId: row.id }, maxAttempts: 12 });
  await uow.audit({ action: "zatca.document_generated", entityType: "Invoice", entityId: invoiceId, after: { documentId: row.id, kind: input.kind, typeCode: input.typeCode, icv: chain.icv, uuid: chain.uuid, invoiceHash: doc.invoiceHash, environment: unit.environment } });
  uow.emit({ type: "zatca.document_generated", entityType: "Invoice", entityId: invoiceId, payload: { invoiceId, documentId: row.id, icv: chain.icv } });
  return row;
}

// --- submission (outbox worker) ----------------------------------------------------------------------------------------

let clientOverride: ((unit: ZatcaEgsUnit) => FatooraClient | null) | null = null;
/** tests: inject a client factory (a local HTTP stub) — null restores configuration */
export const setFatooraClientFactory = (f: typeof clientOverride) => (clientOverride = f);

/** The configured client for a unit, or a reason why there is none. Secrets are resolved here only, never logged. */
export async function clientForUnit(unit: ZatcaEgsUnit, env: Record<string, string | undefined> = process.env): Promise<FatooraClient | { missing: string[] }> {
  if (clientOverride) return clientOverride(unit) ?? { missing: ["test factory returned no client"] };
  const missing: string[] = [];
  const baseUrl = unit.environment === "PRODUCTION" ? env.ZATCA_API_BASE_URL : env.ZATCA_SANDBOX_API_BASE_URL ?? env.ZATCA_API_BASE_URL;
  if (!baseUrl) missing.push(unit.environment === "PRODUCTION" ? "ZATCA_API_BASE_URL" : "ZATCA_SANDBOX_API_BASE_URL");
  const csid = await resolveSecret(unit.csidTokenRef, env);
  const secret = await resolveSecret(unit.csidSecretRef, env);
  if (!csid) missing.push("CSID (csidTokenRef)");
  if (!secret) missing.push("CSID secret (csidSecretRef)");
  if (missing.length) return { missing };
  return httpFatooraClient({ baseUrl: baseUrl!, csid: csid!, secret: secret!, environment: unit.environment as FatooraClient["environment"] });
}

async function logSubmission(documentId: string, attempt: number, endpoint: string, r: SubmitResult) {
  await prisma.zatcaSubmission.create({ data: { documentId, attempt, endpoint, httpStatus: r.httpStatus, outcome: r.outcome, errorCodes: [...r.errors, ...r.warnings].map((m) => m.code ?? m.category ?? "?").slice(0, 50), durationMs: r.durationMs } });
}

/** Outbox handler "zatca.submit". Throws IntegrationError to let the outbox schedule retries / dead-letter. */
export async function submitDocument(item: Pick<IntegrationOutbox, "payload">) {
  const id = String((item.payload as { documentId?: string }).documentId ?? "");
  const doc = await prisma.zatcaDocument.findUnique({ where: { id }, include: { egsUnit: true } });
  if (!doc) throw new IntegrationError("ZATCA_DOCUMENT_MISSING", id, false);
  if (FINAL.has(doc.status)) return { externalReference: doc.uuid }; // already decided — idempotent no-op
  // sandbox / simulation results can never be production compliance — and production is never called from staging
  if (!outboundAllowed(sandboxLike(doc.environment))) throw new IntegrationError("ENVIRONMENT_BLOCKED", `${appEnv()} may not submit to ZATCA ${doc.environment}`, false);
  const client = await clientForUnit(doc.egsUnit);
  if ("missing" in client) throw new IntegrationError("ZATCA_NOT_CONFIGURED", `missing: ${client.missing.join(", ")}`, false);
  // claim: only one submission in flight per document (a SUBMITTING left by a crashed worker is treated as UNKNOWN)
  const stale = new Date(Date.now() - 10 * 60_000);
  const claimed = await prisma.zatcaDocument.updateMany({
    where: { id, OR: [{ status: { in: ["GENERATED", "RETRY_SCHEDULED", "UNKNOWN", "AUTH_FAILED"] } }, { status: "SUBMITTING", lastSubmittedAt: { lt: stale } }] },
    data: { status: "SUBMITTING", attempts: { increment: 1 }, lastSubmittedAt: new Date() }
  });
  if (claimed.count !== 1) return;
  const via = doc.kind === "STANDARD" && doc.submittedVia !== "REPORTING" ? "CLEARANCE" : "REPORTING";
  const req = { invoiceHash: doc.invoiceHash, xml: doc.xml, uuid: doc.uuid };
  const r = via === "CLEARANCE" ? await client.clear(req) : await client.report(req);
  await logSubmission(id, doc.attempts + 1, via, r);
  metrics.count("zatca_submission", { outcome: r.outcome, via });
  log.info("zatca_submission", { documentId: id, via, outcome: r.outcome, httpStatus: r.httpStatus, ms: r.durationMs, environment: doc.environment });
  return applyOutcome(doc, via, r);
}

async function applyOutcome(doc: ZatcaDocument, via: "CLEARANCE" | "REPORTING", r: SubmitResult) {
  const ctx = systemCtx(doc.organizationId, { ip: "system", userAgent: "zatca-worker" });
  const set = (data: Record<string, unknown>) => prisma.zatcaDocument.update({ where: { id: doc.id }, data: { submittedVia: via, warnings: r.warnings.length ? (r.warnings as object[]) : undefined, errors: r.errors.length ? (r.errors as object[]) : undefined, lastErrorCategory: null, lastErrorCode: null, ...data } });
  switch (r.outcome) {
    case "ACCEPTED":
    case "ACCEPTED_WARNINGS": {
      const status = via === "CLEARANCE" ? "CLEARED" : "REPORTED";
      await unitOfWork(ctx, async (tx, uow) => {
        await tx.zatcaDocument.update({ where: { id: doc.id }, data: { status, submittedVia: via, clearedXml: r.clearedXml, finalizedAt: new Date(), warnings: r.warnings.length ? (r.warnings as object[]) : undefined, lastErrorCategory: null, lastErrorCode: null } });
        await uow.audit({ action: `zatca.document_${status.toLowerCase()}`, entityType: "Invoice", entityId: doc.invoiceId, after: { documentId: doc.id, icv: doc.icv, warnings: r.warnings.length, environment: doc.environment } });
        uow.emit({ type: `zatca.document_${status.toLowerCase()}`, entityType: "Invoice", entityId: doc.invoiceId, payload: { invoiceId: doc.invoiceId, documentId: doc.id, warnings: r.warnings.length } });
      });
      return { externalReference: doc.uuid };
    }
    case "REJECTED":
      await unitOfWork(ctx, async (tx, uow) => {
        await tx.zatcaDocument.update({ where: { id: doc.id }, data: { status: "REJECTED", submittedVia: via, errors: r.errors as object[], finalizedAt: new Date(), lastErrorCategory: "ZATCA_BUSINESS_RULE", lastErrorCode: r.errors[0]?.code ?? "REJECTED" } });
        await uow.audit({ action: "zatca.document_rejected", entityType: "Invoice", entityId: doc.invoiceId, after: { documentId: doc.id, icv: doc.icv, errors: r.errors.map((e) => e.code).slice(0, 20) } });
        uow.emit({ type: "zatca.document_rejected", entityType: "Invoice", entityId: doc.invoiceId, payload: { invoiceId: doc.invoiceId, documentId: doc.id }, activity: { href: `/app/finance/invoices/${doc.invoiceId}`, visibility: "finance.invoices.view" } });
      });
      return { externalReference: doc.uuid }; // delivered; the verdict is final — correction = a new document
    case "CLEARANCE_DISABLED":
      await set({ status: "RETRY_SCHEDULED", submittedVia: "REPORTING", lastErrorCategory: "CLEARANCE_DISABLED", lastErrorCode: "HTTP_303" });
      throw new IntegrationError("ZATCA_CLEARANCE_DISABLED", "clearance disabled by ZATCA (303) — the same document goes to reporting", true, 303);
    case "AUTH":
      await set({ status: "AUTH_FAILED", lastErrorCategory: "AUTH_OR_CERTIFICATE", lastErrorCode: r.httpStatus ? `HTTP_${r.httpStatus}` : "AUTH" });
      throw new IntegrationError("AUTH_FAILED", `ZATCA authentication / certificate failure (HTTP ${r.httpStatus})`, false, r.httpStatus ?? undefined);
    case "UNKNOWN":
      await set({ status: "UNKNOWN", lastErrorCategory: "UNKNOWN_AFTER_SEND", lastErrorCode: r.errors[0]?.code ?? "TIMEOUT" });
      throw new IntegrationError("ZATCA_OUTCOME_UNKNOWN", "no answer after sending — the identical document will be resubmitted", true);
    default:
      await set({ status: "RETRY_SCHEDULED", lastErrorCategory: "TRANSPORT", lastErrorCode: r.httpStatus ? `HTTP_${r.httpStatus}` : r.errors[0]?.code ?? "NETWORK" });
      throw new IntegrationError("ZATCA_RETRYABLE", `transport failure (${r.httpStatus ?? r.errors[0]?.code})`, true, r.httpStatus ?? undefined);
  }
}

registerOutboxHandler("zatca.submit", submitDocument);

// --- reads / guards / operations -----------------------------------------------------------------------------------------

export async function zatcaDocumentsFor(ctx: Ctx, invoiceId: string) {
  requirePermission(ctx, "finance.invoices.view");
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!inv) throw notFound("Invoice");
  return prisma.zatcaDocument.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, typeCode: true, environment: true, icv: true, uuid: true, invoiceHash: true, status: true, submittedVia: true, attempts: true, lastErrorCategory: true, lastErrorCode: true, warnings: true, errors: true, createdAt: true, finalizedAt: true } });
}

/** [GUIDE] §4.3.2: a standard document is valid only once cleared — it may not be handed to the buyer before. */
export async function assertDeliverableTx(tx: Tx, invoiceId: string) {
  const live = await tx.zatcaDocument.findFirst({ where: { invoiceId, status: { not: "REJECTED" } } });
  const rejected = !live && (await tx.zatcaDocument.count({ where: { invoiceId } })) > 0;
  if (rejected) throw conflict("ZATCA_REJECTED_NEEDS_NEW_DOCUMENT");
  if (live && live.kind === "STANDARD" && live.status !== "CLEARED") throw conflict(`ZATCA_NOT_CLEARED:${live.status}`);
}

/** A cleared / reported invoice is corrected by a credit note (not supported in this build), never voided in place. */
export async function assertNotLockedByZatcaTx(tx: Tx, invoiceId: string) {
  const done = await tx.zatcaDocument.count({ where: { invoiceId, status: { in: ["CLEARED", "REPORTED", "SUBMITTING", "UNKNOWN"] } } });
  if (done) throw conflict("ZATCA_SUBMITTED_NEEDS_CREDIT_NOTE");
}

/** Re-queue after an AUTH_FAILED / dead-lettered submission once credentials are fixed. Same document, same bytes. */
export async function requeueDocument(ctx: Ctx, documentId: string) {
  requirePermission(ctx, "finance.invoices.issue");
  return unitOfWork(ctx, async (tx, uow) => {
    const d = await tx.zatcaDocument.findFirst({ where: { id: documentId, organizationId: ctx.organizationId } });
    if (!d) throw notFound("ZatcaDocument");
    if (FINAL.has(d.status)) throw conflict(`ZATCA_DOCUMENT_FINAL:${d.status}`);
    if (d.status === "SUBMITTING") throw conflict("ZATCA_SUBMISSION_IN_PROGRESS");
    const n = await tx.integrationOutbox.count({ where: { organizationId: ctx.organizationId, idempotencyKey: { startsWith: `zatca:${d.id}` } } });
    await tx.zatcaDocument.update({ where: { id: d.id }, data: { status: "RETRY_SCHEDULED" } });
    await enqueue(tx, ctx.organizationId, { provider: "ZATCA", eventType: "zatca.submit", idempotencyKey: `zatca:${d.id}:${n + 1}`, entityType: "ZatcaDocument", entityId: d.id, payload: { documentId: d.id }, maxAttempts: 12 });
    await uow.audit({ action: "zatca.document_requeued", entityType: "Invoice", entityId: d.invoiceId, after: { documentId: d.id, previousStatus: d.status } });
    return { id: d.id };
  });
}

/** Operator reconciliation after a restore (scripts/zatca-unit.ts). Counter / hash come from the ZATCA-side record. */
export async function unlockAfterRestore(organizationId: string, unitId: string, input: { counter: number; lastHash: string | null; reference: string }) {
  if (!input.reference?.trim()) throw invalid("REFERENCE_REQUIRED");
  return unitOfWork(systemCtx(organizationId, { ip: "cli", userAgent: "zatca-unit" }), async (tx, uow) => {
    await tx.$queryRaw`SELECT id FROM "ZatcaEgsUnit" WHERE id = ${unitId} FOR UPDATE`;
    const u = await tx.zatcaEgsUnit.findFirst({ where: { id: unitId, organizationId } });
    if (!u) throw notFound("ZatcaEgsUnit");
    if (u.status !== "LOCKED_AFTER_RESTORE") throw conflict(`ZATCA_UNIT_NOT_LOCKED:${u.status}`);
    const maxLocal = (await tx.zatcaDocument.aggregate({ where: { egsUnitId: unitId }, _max: { icv: true } }))._max.icv ?? 0;
    if (input.counter < maxLocal) throw conflict(`ZATCA_COUNTER_BEHIND_LOCAL:${maxLocal}`);
    const local = await tx.zatcaDocument.findFirst({ where: { egsUnitId: unitId, icv: input.counter } });
    if (local && local.invoiceHash !== input.lastHash) throw conflict("ZATCA_HASH_MISMATCH_FOR_COUNTER");
    if (input.counter > 0 && !input.lastHash) throw invalid("LAST_HASH_REQUIRED");
    await tx.zatcaEgsUnit.update({ where: { id: unitId }, data: { status: "ACTIVE", invoiceCounter: input.counter, lastInvoiceHash: input.lastHash, lockedReason: null } });
    await uow.audit({ action: "zatca.unit_unlocked_after_restore", entityType: "ZatcaEgsUnit", entityId: unitId, before: { counter: u.invoiceCounter, lastHash: u.lastInvoiceHash }, after: { counter: input.counter, lastHash: input.lastHash, reference: input.reference } });
  });
}

// --- readiness (go-live / release:verify) ------------------------------------------------------------------------------

export type ZatcaReadiness = { status: "NOT_REQUIRED" | "NOT_CONFIGURED" | "CODE_READY_EXTERNAL_ONBOARDING_REQUIRED" | "READY"; missing: { item: string; kind: "EXTERNAL_CREDENTIAL" | "INFRASTRUCTURE" | "BUSINESS_DECISION" | "CODE" | "DATA" }[] };

export async function zatcaReadiness(env: Record<string, string | undefined> = process.env, db: typeof prisma = prisma): Promise<ZatcaReadiness> {
  const raw = (env.ZATCA_STATUS ?? "NOT_CONFIGURED").trim().toUpperCase();
  if (raw === "NOT_REQUIRED" && env.ZATCA_DECISION_REF?.trim()) return { status: "NOT_REQUIRED", missing: [] };
  if (!zatcaRequired(env)) return { status: "NOT_CONFIGURED", missing: [{ item: "ZATCA_STATUS decision (REQUIRED or NOT_REQUIRED + ZATCA_DECISION_REF)", kind: "BUSINESS_DECISION" }] };
  const missing: ZatcaReadiness["missing"] = [];
  const units = await db.zatcaEgsUnit.findMany({ where: { environment: "PRODUCTION", status: { in: ["ACTIVE", "LOCKED_AFTER_RESTORE"] } } });
  if (!units.length) missing.push({ item: "EGS unit onboarded in PRODUCTION (FATOORA portal OTP → CSR → compliance CSID → compliance checks → production CSID)", kind: "EXTERNAL_CREDENTIAL" });
  for (const u of units) {
    if (u.status === "LOCKED_AFTER_RESTORE") missing.push({ item: `unit ${u.name} locked after restore — reconcile counter / hash`, kind: "DATA" });
    const c = await clientForUnit(u, env);
    if ("missing" in c) for (const m of c.missing) missing.push({ item: m, kind: m.startsWith("ZATCA_") ? "INFRASTRUCTURE" : "EXTERNAL_CREDENTIAL" });
    if (u.functionalityMap[1] === "1") missing.push({ item: "simplified (B2C) documents need the seller XAdES stamp — not implemented (needs the official SDK reference)", kind: "CODE" });
  }
  if ((env.ZATCA_SUPPLY_DATE_POLICY ?? "").toUpperCase() !== "ISSUE_DATE") missing.push({ item: "supply date (KSA-5) policy — ZATCA_SUPPLY_DATE_POLICY=ISSUE_DATE only if the tax advisor confirms it", kind: "BUSINESS_DECISION" });
  const seller = await db.zatcaPartyProfile.findFirst({ where: { clientId: null } });
  if (!seller?.buildingNumber || !seller.postalCode || !seller.district || !seller.streetName) missing.push({ item: "seller national address (street, building no., district, postal code)", kind: "DATA" });
  return { status: missing.length ? "CODE_READY_EXTERNAL_ONBOARDING_REQUIRED" : "READY", missing };
}

/** Load a PEM from a key reference (env:VAR or file:/path). Private keys are never read from the database. */
export function readKeyRef(ref: string, env: Record<string, string | undefined> = process.env) {
  const m = /^(env|file):(.+)$/.exec(ref);
  if (!m) throw new Error("KEY_REF_INVALID");
  const v = m[1] === "env" ? env[m[2]] : readFileSync(m[2], "utf8");
  if (!v || !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) throw new Error("KEY_NOT_AVAILABLE");
  return v;
}
