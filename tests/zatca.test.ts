import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { createInvoice, issueInvoice, markInvoiceSent, voidInvoice } from "@/server/finance/invoices";
import { processOutbox } from "@/server/integrations/outbox";
import { el, hashView, invoiceHashOf, serialize } from "@/server/zatca/canonical";
import { basicQrFields, decodeTlv, encodeTlv } from "@/server/zatca/qr";
import { FIRST_PREVIOUS_HASH, transactionCode } from "@/server/zatca/spec";
import { buildInvoiceTree, generateDocument, validateInput, type ZatcaInvoiceInput } from "@/server/zatca/xml";
import { httpFatooraClient, normalizeResponse } from "@/server/zatca/fatoora";
import { readKeyRef, requeueDocument, setFatooraClientFactory, snapshotOfInvoice, unlockAfterRestore, zatcaReadiness } from "@/server/zatca/service";
import { createBackup, restoreBackup } from "@/server/system/backup";
import "@/server/zatca/service";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

/** Phase 11 (P11-F) — ZATCA architecture foundation. External calls go to a LOCAL HTTP stub; nothing here claims ZATCA acceptance. */
let orgId: string;
const code = (re: RegExp) => ({ message: expect.stringMatching(re) });
const ENV_KEYS = ["ZATCA_STATUS", "ZATCA_SUPPLY_DATE_POLICY", "APP_ENV"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.ZATCA_STATUS = "REQUIRED";
  process.env.ZATCA_SUPPLY_DATE_POLICY = "ISSUE_DATE";
});
afterEach(() => {
  for (const k of ENV_KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  setFatooraClientFactory(null);
});

// --- local FATOORA stub ---------------------------------------------------------------------------------------------
type Plan = { status: number; body?: unknown; delay?: number };
let plan: Plan[] = [];
let requests: { path: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
let stub: http.Server;
let stubUrl = "";
beforeAll(async () => {
  stub = http.createServer((q, s) => {
    let b = "";
    q.on("data", (c) => (b += c));
    q.on("end", () => {
      requests.push({ path: q.url ?? "", headers: q.headers, body: b });
      const p = plan.shift() ?? { status: 200, body: { status: "CLEARED" } };
      setTimeout(() => {
        if (!s.writableEnded) s.writeHead(p.status, { "content-type": "application/json" }).end(p.body === undefined ? "" : JSON.stringify(p.body));
      }, p.delay ?? 0);
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});
afterAll(async () => {
  stub.closeAllConnections();
  await new Promise<void>((r) => stub.close(() => r()));
});
const useStub = (timeoutMs = 3000) => setFatooraClientFactory((u) => httpFatooraClient({ baseUrl: stubUrl, csid: "TEST-CSID", secret: "test-secret", environment: u.environment as "SANDBOX", timeoutMs }));

// --- fixtures -------------------------------------------------------------------------------------------------------
async function setup(opts: { clientType?: "COMPANY" | "INDIVIDUAL"; unitEnv?: string } = {}) {
  const fm = await ctxFor((await makeUser(orgId, "fm@x.test", ["finance_manager"])).id);
  const sm = await ctxFor((await makeUser(orgId, "sm@x.test", ["sales_manager"])).id);
  await prisma.zatcaPartyProfile.create({ data: { organizationId: orgId, clientId: null, registrationName: "شركة دي ام اس للتقنية", vatNumber: "399999999900003", otherId: "1010010000", otherIdScheme: "CRN", streetName: "King Fahd Road", buildingNumber: "1234", district: "Al Olaya", city: "Riyadh", postalCode: "12211", countryCode: "SA" } });
  const unit = await prisma.zatcaEgsUnit.create({ data: { organizationId: orgId, name: "EGS-1", environment: opts.unitEnv ?? "SANDBOX", functionalityMap: "1000", status: "ACTIVE", csidTokenRef: "env:ZATCA_TEST_CSID", csidSecretRef: "env:ZATCA_TEST_SECRET" } });
  const client = await createClient(sm, { type: opts.clientType ?? "COMPANY", displayName: "Buyer Co", companyName: "Buyer Company LLC", taxNumber: "311111111100003", country: "SA", city: "Jeddah" });
  await prisma.zatcaPartyProfile.create({ data: { organizationId: orgId, clientId: client.id, streetName: "Tahlia Street", buildingNumber: "5678", district: "Al Rawdah", city: "Jeddah", postalCode: "23431", countryCode: "SA" } });
  const draft = async (lines = [{ description: "Website development", quantity: "1", unitPrice: "10000" }]) => (await createInvoice(fm, { clientId: client.id, items: lines })).id;
  return { fm, sm, unit, client, draft };
}

const baseInput = (over: Partial<ZatcaInvoiceInput> = {}): ZatcaInvoiceInput => ({
  kind: "STANDARD",
  typeCode: "388",
  number: "INV-2026-000001",
  issueDate: "2026-10-01",
  issueTime: "10:15:00",
  currency: "SAR",
  supplyDate: "2026-10-01",
  seller: { registrationName: "Seller Co", vatNumber: "399999999900003", otherId: "1010010000", otherIdScheme: "CRN", address: { street: "King Fahd Road", building: "1234", district: "Al Olaya", city: "Riyadh", postalCode: "12211", country: "SA" } },
  buyer: { registrationName: "Buyer Co", vatNumber: "311111111100003", address: { street: "Tahlia", building: "5678", district: "Al Rawdah", city: "Jeddah", postalCode: "23431", country: "SA" } },
  lines: [{ id: "1", name: "Service", quantity: "2.000", unitPrice: "500.00", discount: "100.00", net: "900.00", vatCategory: "S", vatRate: "15.00", vatAmount: "135.00" }],
  totals: { lineExtension: "900.00", taxExclusive: "900.00", taxTotal: "135.00", taxInclusive: "1035.00", payable: "1035.00" },
  ...over
});
const chain = { uuid: "8e6000cf-1a98-4174-b3e7-b5d5954bc10d", icv: 1, previousHash: FIRST_PREVIOUS_HASH };

describe("official fixtures", () => {
  it("first previous-invoice hash is the documented constant (base64 of the SHA-256 hex digest of \"0\")", () => {
    expect(FIRST_PREVIOUS_HASH).toBe(Buffer.from(createHash("sha256").update("0").digest("hex")).toString("base64"));
  });
  it("QR TLV encoding reproduces the worked example of the Detailed Technical Guidelines §6.4 byte for byte", () => {
    const qr = encodeTlv(basicQrFields({ sellerName: "Bobs Basement Records", vatNumber: "100025906700003", timestamp: "2022-04-25T15:30:00Z", totalWithVat: "2100100.99", vatTotal: "315015.15" }));
    expect(qr).toBe("ARVCb2JzIEJhc2VtZW50IFJlY29yZHMCDzEwMDAyNTkwNjcwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoECjIxMDAxMDAuOTkFCTMxNTAxNS4xNQ==");
    expect(decodeTlv(qr).map((t) => [t.tag, t.value.toString("utf8")])[0]).toEqual([1, "Bobs Basement Records"]);
    // Arabic values: length is the UTF-8 BYTE length ([GUIDE] §6.3 common mistakes)
    expect(decodeTlv(encodeTlv([{ tag: 1, value: "شركة" }]))[0].value.length).toBe(8);
    expect(() => encodeTlv([{ tag: 1, value: "x".repeat(256) }])).toThrow(/QR_VALUE_TOO_LONG/);
  });
  it("hash encoding is base64 of the digest bytes (Guidelines §5.2 step 1 example)", () => {
    expect(Buffer.from("a11b6fe587a50f7daffe3a7fb42dcccf32b43ee9b37d9f252d04243e54c11a3f", "hex").toString("base64")).toBe("oRtv5YelD32v/jp/tC3MzzK0PumzfZ8lLQQkPlTBGj8=");
  });
  it("transaction code KSA-2 = NNPNESB", () => {
    expect(transactionCode("STANDARD")).toBe("0100000");
    expect(transactionCode("SIMPLIFIED", { summary: true })).toBe("0200010");
  });
});

describe("canonical XML + hash", () => {
  it("serializes in canonical form: namespace declarations first, sorted attributes, explicit end tags, C14N escaping", () => {
    const t = el("Invoice", { "xmlns:cbc": "b", xmlns: "a", zeta: "1", alpha: 'x"<&\n' }, [el("cbc:Empty"), el("cbc:T", "a<b>&c\r")]);
    expect(serialize(t)).toBe('<Invoice xmlns="a" xmlns:cbc="b" alpha="x&quot;&lt;&amp;&#xA;" zeta="1"><cbc:Empty></cbc:Empty><cbc:T>a&lt;b&gt;&amp;c\n</cbc:T></Invoice>');
  });
  it("is deterministic: the same snapshot + chain always yields identical XML and hash", () => {
    const a = generateDocument(baseInput(), chain, new Date("2026-10-02T00:00:00Z"));
    const b = generateDocument(baseInput(), chain, new Date("2026-10-02T00:00:00Z"));
    expect(a.xml).toBe(b.xml);
    expect(a.invoiceHash).toBe(b.invoiceHash);
    expect(generateDocument(baseInput(), { ...chain, uuid: "8e6000cf-1a98-4174-b3e7-b5d5954bc10e" }, new Date("2026-10-02")).invoiceHash).not.toBe(a.invoiceHash);
    expect(a.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns=')).toBe(true);
    expect(a.xml.slice(a.xml.indexOf("<Invoice"))).not.toMatch(/>\s+</); // no whitespace text nodes inside the document
  });
  it("the hash excludes UBLExtensions, cac:Signature and the QR reference (the stamp / QR can be added later without changing it)", () => {
    const tree = buildInvoiceTree(baseInput(), chain);
    const before = invoiceHashOf(hashView(tree));
    tree.children!.unshift(el("ext:UBLExtensions", [el("ext:UBLExtension", "stamp")]));
    tree.children!.push(el("cac:AdditionalDocumentReference", [el("cbc:ID", "QR"), el("cac:Attachment", [el("cbc:EmbeddedDocumentBinaryObject", { mimeCode: "text/plain" }, "QRDATA")])]), el("cac:Signature", [el("cbc:ID", "x")]));
    expect(invoiceHashOf(hashView(tree))).toBe(before);
  });
  it("carries the mandated KSA elements", () => {
    const { xml } = generateDocument(baseInput(), chain, new Date("2026-10-02"));
    for (const s of ["<cbc:ProfileID>reporting:1.0</cbc:ProfileID>", '<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>', "<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>", "<cbc:ID>ICV</cbc:ID><cbc:UUID>1</cbc:UUID>", `<cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${FIRST_PREVIOUS_HASH}</cbc:EmbeddedDocumentBinaryObject>`, "<cbc:ActualDeliveryDate>2026-10-01</cbc:ActualDeliveryDate>", "<cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>", '<cbc:RoundingAmount currencyID="SAR">1035.00</cbc:RoundingAmount>', '<cbc:TaxInclusiveAmount currencyID="SAR">1035.00</cbc:TaxInclusiveAmount>', '<cac:PartyIdentification><cbc:ID schemeID="CRN">1010010000</cbc:ID>'])
      expect(xml).toContain(s);
    expect(xml.match(/<cac:TaxTotal>/g)).toHaveLength(3); // document (with breakdown) + accounting currency + 1 line
  });
});

describe("validation (no invented data)", () => {
  const rules = (over: Partial<ZatcaInvoiceInput>) => validateInput(baseInput(over), new Date("2026-10-02")).map((i) => i.rule);
  it("accepts a complete standard invoice", () => expect(rules({})).toEqual([]));
  it("refuses missing / malformed required fields", () => {
    expect(rules({ seller: { ...baseInput().seller, vatNumber: "123" } })).toContain("BR-KSA-40");
    expect(rules({ seller: { ...baseInput().seller, address: { ...baseInput().seller.address!, building: "12" } } })).toContain("BR-KSA-37");
    expect(rules({ seller: { ...baseInput().seller, address: { ...baseInput().seller.address!, postalCode: "1234" } } })).toContain("BR-KSA-66");
    expect(rules({ supplyDate: null })).toContain("BR-KSA-15");
    expect(rules({ buyer: { registrationName: "", address: null } })).toEqual(expect.arrayContaining(["BR-KSA-42", "BR-KSA-14", "BR-KSA-10"]));
    expect(rules({ currency: "USD" })).toContain("BR-KSA-EN16931-02/BT-111");
    expect(rules({ issueDate: "2026-12-31" })).toContain("BR-KSA-04");
    expect(rules({ typeCode: "381" })).toEqual(expect.arrayContaining(["BR-KSA-56", "BR-KSA-17"]));
  });
  it("zero-rated / exempt lines need an official VATEX reason code", () => {
    const line = { id: "1", name: "Export service", quantity: "1", unitPrice: "100.00", discount: "0.00", net: "100.00", vatCategory: "Z" as const, vatRate: "0.00", vatAmount: "0.00" };
    const t = { lineExtension: "100.00", taxExclusive: "100.00", taxTotal: "0.00", taxInclusive: "100.00", payable: "100.00" };
    expect(rules({ lines: [line], totals: t })).toContain("BR-KSA-23/24/69");
    expect(rules({ lines: [{ ...line, exemptionCode: "VATEX-SA-29" }], totals: t })).toContain("BR-KSA-23/24/69"); // an E code on a Z line
    expect(rules({ lines: [{ ...line, exemptionCode: "VATEX-SA-33" }], totals: t })).toEqual([]);
  });
  it("financial totals are checked, never adjusted: per-line VAT that rounds differently from the per-category rule is reported", () => {
    // 3 lines of 0.10 at 15 %: each line VAT 0.02 (0.015 half-up) → 0.06, per category 0.30 × 15 % = 0.045 → 0.05
    const l = (id: string) => ({ id, name: "x", quantity: "1", unitPrice: "0.10", discount: "0.00", net: "0.10", vatCategory: "S" as const, vatRate: "15.00", vatAmount: "0.02" });
    const issues = validateInput(baseInput({ lines: [l("1"), l("2"), l("3")], totals: { lineExtension: "0.30", taxExclusive: "0.30", taxTotal: "0.06", taxInclusive: "0.36", payable: "0.36" } }), new Date("2026-10-02"));
    expect(issues.map((i) => i.rule)).toContain("BR-CO-14/§9.6");
    expect(() => generateDocument(baseInput({ lines: [l("1"), l("2"), l("3")], totals: { lineExtension: "0.30", taxExclusive: "0.30", taxTotal: "0.06", taxInclusive: "0.36", payable: "0.36" } }), chain)).toThrow(/ZATCA_VALIDATION/);
  });
});

describe("issue → generate (same transaction, chain)", () => {
  it("generates an immutable document on issue; totals are the invoice's own; the chain links ICV + previous hash", async () => {
    const { fm, unit, draft } = await setup();
    const id1 = await draft([{ description: "Website", quantity: "2", unitPrice: "1000" }, { description: "Hosting", quantity: "1", unitPrice: "500" }] as never);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: id1 } });
    await issueInvoice(fm, id1);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: id1 } });
    expect([inv.subtotal, inv.discountTotal, inv.taxTotal, inv.total].map((d) => d.toFixed(2))).toEqual([before.subtotal, before.discountTotal, before.taxTotal, before.total].map((d) => d.toFixed(2)));
    const d1 = await prisma.zatcaDocument.findFirstOrThrow({ where: { invoiceId: id1 } });
    expect(d1).toMatchObject({ icv: 1, previousHash: FIRST_PREVIOUS_HASH, status: "GENERATED", kind: "STANDARD", environment: "SANDBOX" });
    expect(d1.xml).toContain(`<cbc:TaxInclusiveAmount currencyID="SAR">${inv.total.toFixed(2)}</cbc:TaxInclusiveAmount>`);
    expect(d1.xml).toContain(`<cbc:ID>${inv.number}</cbc:ID>`);
    const id2 = await draft();
    await issueInvoice(fm, id2);
    const d2 = await prisma.zatcaDocument.findFirstOrThrow({ where: { invoiceId: id2 } });
    expect(d2).toMatchObject({ icv: 2, previousHash: d1.invoiceHash });
    expect(await prisma.zatcaEgsUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ invoiceCounter: 2, lastInvoiceHash: d2.invoiceHash });
    expect(await prisma.integrationOutbox.count({ where: { eventType: "zatca.submit" } })).toBe(2);
    // regenerating from the stored snapshot reproduces the stored document exactly
    const snap = await snapshotOfInvoice(prisma, id2);
    expect(generateDocument(snap, { uuid: d2.uuid, icv: d2.icv, previousHash: d2.previousHash }).xml).toBe(d2.xml);
  });

  it("a validation failure aborts the issue: invoice stays DRAFT, no number, chain untouched", async () => {
    const { fm, unit, draft } = await setup();
    await prisma.zatcaPartyProfile.updateMany({ where: { clientId: null }, data: { buildingNumber: null } });
    const id = await draft();
    await expect(issueInvoice(fm, id)).rejects.toMatchObject(code(/ZATCA_VALIDATION/));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DRAFT", number: null });
    expect(await prisma.zatcaEgsUnit.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({ invoiceCounter: 0, lastInvoiceHash: null });
  });

  it("B2C (individual buyer) needs the seller stamp — refused, not faked", async () => {
    const { fm, draft } = await setup({ clientType: "INDIVIDUAL" });
    await expect(issueInvoice(fm, await draft())).rejects.toMatchObject(code(/ZATCA_SIMPLIFIED_NOT_SUPPORTED/));
  });

  it("concurrent issues get gap-free ICVs and a linear hash chain (unit row lock)", async () => {
    const { fm, draft } = await setup();
    const ids = await Promise.all(Array.from({ length: 6 }, () => draft()));
    await Promise.all(ids.map((id) => issueInvoice(fm, id)));
    const docs = await prisma.zatcaDocument.findMany({ orderBy: { icv: "asc" } });
    expect(docs.map((d) => d.icv)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < docs.length; i++) expect(docs[i].previousHash).toBe(docs[i - 1].invoiceHash);
  });

  it("documents are immutable and one live document per invoice is enforced by the database", async () => {
    const { fm, draft } = await setup();
    const id = await draft();
    await issueInvoice(fm, id);
    const d = await prisma.zatcaDocument.findFirstOrThrow({ where: { invoiceId: id } });
    await expect(prisma.zatcaDocument.update({ where: { id: d.id }, data: { xml: d.xml + " " } })).rejects.toThrow(/ZATCA_DOCUMENT_IMMUTABLE/);
    await expect(prisma.zatcaDocument.delete({ where: { id: d.id } })).rejects.toThrow(/ZATCA_DOCUMENT_IMMUTABLE/);
    const { id: _x, createdAt: _c, updatedAt: _u, ...rest } = d;
    await expect(prisma.zatcaDocument.create({ data: { ...rest, icv: 99, uuid: "dup-uuid", invoiceHash: "dup", warnings: undefined, errors: undefined } })).rejects.toThrow(/ZATCA_DOCUMENT_EXISTS|one_live_per_invoice|Unique constraint/);
  });

  it("private keys are references only — the database refuses key material", async () => {
    const { unit } = await setup();
    await expect(prisma.zatcaEgsUnit.update({ where: { id: unit.id }, data: { privateKeyRef: "-----BEGIN EC PRIVATE KEY-----MHQ..." } })).rejects.toThrow(/ZatcaEgsUnit_key_ref_chk/);
    await prisma.zatcaEgsUnit.update({ where: { id: unit.id }, data: { privateKeyRef: "env:ZATCA_TEST_KEY" } });
    expect(() => readKeyRef("env:ZATCA_TEST_KEY", {})).toThrow(/KEY_NOT_AVAILABLE/);
    expect(readKeyRef("env:K", { K: "-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----" })).toContain("BEGIN EC PRIVATE KEY");
    expect(() => readKeyRef("db:123")).toThrow(/KEY_REF_INVALID/);
  });
});

describe("submission state machine (local FATOORA stub — not ZATCA)", () => {
  const issued = async () => {
    const s = await setup();
    const id = await s.draft();
    await issueInvoice(s.fm, id);
    const doc = await prisma.zatcaDocument.findFirstOrThrow({ where: { invoiceId: id } });
    return { ...s, id, doc };
  };
  const tick = (offsetMs = 0) => processOutbox({ organizationId: orgId, now: new Date(Date.now() + offsetMs) });
  beforeEach(() => {
    plan = [];
    requests = [];
  });

  it("clearance 200 → CLEARED; the buyer copy is the cleared XML; delivery is blocked until then; repeats are no-ops", async () => {
    useStub();
    const { fm, id, doc } = await issued();
    await expect(markInvoiceSent(fm, id, { method: "EMAIL_MANUAL", confirm: true })).rejects.toMatchObject(code(/ZATCA_NOT_CLEARED:GENERATED/));
    plan = [{ status: 200, body: { clearanceStatus: "CLEARED", clearedInvoice: Buffer.from("<Invoice>cleared</Invoice>").toString("base64"), validationResults: { warningMessages: [], errorMessages: [] } } }];
    await tick();
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/invoices/clearance/single");
    expect(requests[0].headers).toMatchObject({ "accept-version": "V2", authorization: `Basic ${Buffer.from("TEST-CSID:test-secret").toString("base64")}` });
    expect(JSON.parse(requests[0].body)).toEqual({ invoiceHash: doc.invoiceHash, invoice: Buffer.from(doc.xml).toString("base64") });
    const d = await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d).toMatchObject({ status: "CLEARED", clearedXml: "<Invoice>cleared</Invoice>", submittedVia: "CLEARANCE" });
    await markInvoiceSent(fm, id, { method: "EMAIL_MANUAL", confirm: true });
    await tick(3600_000);
    expect(requests).toHaveLength(1); // never resubmitted
    await expect(voidInvoice(fm, id, { reason: "client asked" })).rejects.toMatchObject(code(/ZATCA_SUBMITTED_NEEDS_CREDIT_NOTE/));
    await expect(prisma.zatcaDocument.update({ where: { id: doc.id }, data: { status: "REJECTED" } })).rejects.toThrow(/ZATCA_DOCUMENT_FINAL/);
  });

  it("400 → REJECTED (final); the invoice cannot be delivered; a correction is a new document", async () => {
    useStub();
    const { fm, id, doc } = await issued();
    plan = [{ status: 400, body: { validationResults: { errorMessages: [{ code: "BR-KSA-37", message: "building number" }] } } }];
    await tick();
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REJECTED", lastErrorCategory: "ZATCA_BUSINESS_RULE", lastErrorCode: "BR-KSA-37" });
    await expect(markInvoiceSent(fm, id, { method: "EMAIL_MANUAL", confirm: true })).rejects.toMatchObject(code(/ZATCA_REJECTED_NEEDS_NEW_DOCUMENT/));
    await tick(3600_000);
    expect(requests).toHaveLength(1);
  });

  it("5xx → retried later with the SAME document; timeout → UNKNOWN → the identical bytes are resubmitted, never regenerated", async () => {
    useStub(300);
    const { doc } = await issued();
    plan = [{ status: 503 }, { status: 200, delay: 1000 }, { status: 200, body: { clearanceStatus: "CLEARED" } }];
    await tick();
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "RETRY_SCHEDULED", lastErrorCategory: "TRANSPORT" });
    await tick(3600_000);
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "UNKNOWN", lastErrorCategory: "UNKNOWN_AFTER_SEND" });
    await tick(7200_000);
    const d = await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d).toMatchObject({ status: "CLEARED", attempts: 3 });
    expect(new Set(requests.map((r) => r.body)).size).toBe(1); // byte-identical submissions
    expect(await prisma.zatcaDocument.count()).toBe(1);
    expect(await prisma.zatcaSubmission.count({ where: { documentId: doc.id } })).toBe(3);
  });

  it("303 (clearance disabled) → the same document goes through reporting", async () => {
    useStub();
    const { doc } = await issued();
    plan = [{ status: 303 }, { status: 200, body: { reportingStatus: "REPORTED" } }];
    await tick();
    await tick(3600_000);
    expect(requests.map((r) => r.path)).toEqual(["/invoices/clearance/single", "/invoices/reporting/single"]);
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REPORTED", submittedVia: "REPORTING" });
  });

  it("401 → AUTH_FAILED, dead letter (no retry storm); after fixing credentials an explicit requeue resubmits the same document", async () => {
    useStub();
    const { fm, doc } = await issued();
    plan = [{ status: 401 }];
    await tick();
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "AUTH_FAILED", lastErrorCategory: "AUTH_OR_CERTIFICATE" });
    expect(await prisma.integrationOutbox.findFirstOrThrow({ where: { idempotencyKey: `zatca:${doc.id}` } })).toMatchObject({ status: "DEAD_LETTER" });
    await tick(3600_000);
    expect(requests).toHaveLength(1);
    await requeueDocument(fm, doc.id);
    plan = [{ status: 200, body: { clearanceStatus: "CLEARED" } }];
    await tick();
    expect(await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "CLEARED" });
  });

  it("environment separation: production credentials are never used from a non-production app; sandbox never counts as production", async () => {
    useStub();
    const { doc } = await issued();
    await prisma.$executeRaw`ALTER TABLE "ZatcaDocument" DISABLE TRIGGER zatca_document_guard`;
    try {
      await prisma.zatcaDocument.update({ where: { id: doc.id }, data: { environment: "PRODUCTION" } });
    } finally {
      await prisma.$executeRaw`ALTER TABLE "ZatcaDocument" ENABLE TRIGGER zatca_document_guard`;
    }
    process.env.APP_ENV = "staging";
    await tick();
    expect(requests).toHaveLength(0);
    expect(await prisma.integrationOutbox.findFirstOrThrow({ where: { idempotencyKey: `zatca:${doc.id}` } })).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "ENVIRONMENT_BLOCKED" });
    const r = await zatcaReadiness({ ZATCA_STATUS: "REQUIRED", ZATCA_SUPPLY_DATE_POLICY: "ISSUE_DATE" });
    expect(r.status).toBe("CODE_READY_EXTERNAL_ONBOARDING_REQUIRED");
    expect(r.missing.map((m) => m.kind)).toContain("EXTERNAL_CREDENTIAL"); // the only unit is SANDBOX
  });

  it("no configured client → ZATCA_NOT_CONFIGURED (nothing pretends to be connected)", async () => {
    setFatooraClientFactory(null);
    const { doc } = await issued();
    await tick();
    expect(await prisma.integrationOutbox.findFirstOrThrow({ where: { idempotencyKey: `zatca:${doc.id}` } })).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "ZATCA_NOT_CONFIGURED" });
  });

  it("response normalization", () => {
    expect(normalizeResponse(200, { status: "CLEARED", warnings: [{ code: "W1" }] }).outcome).toBe("ACCEPTED_WARNINGS");
    expect(normalizeResponse(202, {}).outcome).toBe("ACCEPTED_WARNINGS");
    expect(normalizeResponse(429, {}).outcome).toBe("RETRYABLE");
    expect(normalizeResponse(404, {}).outcome).toBe("AUTH");
  });
});

describe("backup / restore implications", () => {
  it("a locked chain refuses generation; reconciliation checks counter and hash against local documents", async () => {
    const { fm, unit, draft } = await setup();
    await issueInvoice(fm, await draft());
    const d1 = await prisma.zatcaDocument.findFirstOrThrow();
    await prisma.zatcaEgsUnit.update({ where: { id: unit.id }, data: { status: "LOCKED_AFTER_RESTORE", lockedReason: "test" } });
    const id2 = await draft();
    await expect(issueInvoice(fm, id2)).rejects.toMatchObject(code(/ZATCA_CHAIN_LOCKED_AFTER_RESTORE/));
    await expect(unlockAfterRestore(orgId, unit.id, { counter: 0, lastHash: null, reference: "ZATCA portal check" })).rejects.toMatchObject(code(/ZATCA_COUNTER_BEHIND_LOCAL/));
    await expect(unlockAfterRestore(orgId, unit.id, { counter: 1, lastHash: "wrong", reference: "x" })).rejects.toMatchObject(code(/ZATCA_HASH_MISMATCH_FOR_COUNTER/));
    // ZATCA already received ICV 2 (generated after the backup, lost by the restore): continue from there
    await unlockAfterRestore(orgId, unit.id, { counter: 2, lastHash: "hash-of-icv-2-from-zatca", reference: "FATOORA record 2026-10-03" });
    await issueInvoice(fm, id2);
    expect(await prisma.zatcaDocument.findFirstOrThrow({ where: { invoiceId: id2 } })).toMatchObject({ icv: 3, previousHash: "hash-of-icv-2-from-zatca" });
    expect(d1.icv).toBe(1);
  });

  const PG_BIN = path.join(process.cwd(), ".local", "pgtools", "pgsql", "bin");
  it.skipIf(!existsSync(path.join(PG_BIN, process.platform === "win32" ? "pg_dump.exe" : "pg_dump")))("a real restore locks every active chain in the restored database", async () => {
    const { fm, draft } = await setup();
    await issueInvoice(fm, await draft());
    const dir = mkdtempSync(path.join(tmpdir(), "zatca-restore-"));
    const prev = { d: process.env.PG_DUMP_PATH, r: process.env.PG_RESTORE_PATH };
    process.env.PG_DUMP_PATH = path.join(PG_BIN, process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
    process.env.PG_RESTORE_PATH = path.join(PG_BIN, process.platform === "win32" ? "pg_restore.exe" : "pg_restore");
    const url = process.env.DATABASE_URL!;
    const target = `dms_zatca_restore_${randomBytes(3).toString("hex")}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try {
      const b = await createBackup(url, { dir, engine: "pg_dump" });
      await admin.query(`CREATE DATABASE "${target}"`);
      const targetUrl = url.replace(/\/[^/?]+(\?|$)/, `/${target}$1`);
      await restoreBackup(b.file, { targetUrl, confirm: target, migrate: async () => undefined });
      const t = new pg.Client({ connectionString: targetUrl });
      await t.connect();
      const r = await t.query(`SELECT "status", "lockedReason" FROM "ZatcaEgsUnit"`);
      await t.end();
      expect(r.rows[0].status).toBe("LOCKED_AFTER_RESTORE");
      expect(r.rows[0].lockedReason).toMatch(/restored from/);
      expect((await prisma.zatcaEgsUnit.findFirstOrThrow()).status).toBe("ACTIVE"); // the source is untouched
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${target}" WITH (FORCE)`);
      await admin.end();
      process.env.PG_DUMP_PATH = prev.d;
      process.env.PG_RESTORE_PATH = prev.r;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
