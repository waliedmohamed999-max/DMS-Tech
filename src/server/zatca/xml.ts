import { Decimal, type Dec } from "@/lib/commercial/calc";
import { documentXml, el, hashView, invoiceHashOf, type XNode } from "./canonical";
import { DISCOUNT_REASON_CODE, EXEMPTION_CODES, NS, PROFILE_ID, SELLER_ID_SCHEMES, BUYER_ID_SCHEMES, TAX_CURRENCY, transactionCode, type TransactionFlags, type TypeCode, type VatCategory } from "./spec";

/**
 * ZATCA UBL 2.1 document generator ([XML] v1.2, [DD] 2023-05-19). Input is an immutable SNAPSHOT — the generator
 * never reads the database, so the same snapshot + chain always yields byte-identical XML and hash.
 * Amounts are decimal strings (decimal.js; never floats); rounding is "half-up" to 2 decimals ([XML] §10).
 * Element order follows the UBL 2.1 XSD sequences.
 */
export type Address = { street: string; additionalStreet?: string | null; building?: string | null; plot?: string | null; district?: string | null; city: string; postalCode?: string | null; country: string };
export type Party = { registrationName?: string | null; vatNumber?: string | null; otherId?: string | null; otherIdScheme?: string | null; address?: Address | null };
export type Line = { id: string; name: string; quantity: string; unitPrice: string; discount: string; net: string; vatCategory: VatCategory; vatRate: string; vatAmount: string; exemptionCode?: string | null; exemptionReason?: string | null };
export type ZatcaInvoiceInput = {
  kind: "STANDARD" | "SIMPLIFIED";
  typeCode: TypeCode;
  flags?: TransactionFlags;
  number: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ss (AST) — [XML] BR-KSA-70
  currency: string;
  supplyDate?: string | null;
  supplyEndDate?: string | null;
  billingReference?: string | null; // BT-25 — credit / debit notes
  reason?: string | null; // KSA-10 — credit / debit notes
  paymentMeansCode?: string | null; // BT-81 (UNTDID 4461)
  seller: Party;
  buyer: Party;
  lines: Line[];
  totals: { lineExtension: string; taxExclusive: string; taxTotal: string; taxInclusive: string; payable: string };
};
export type Chain = { uuid: string; icv: number; previousHash: string };
export type Issue = { rule: string; field: string; message: string };

const D = (v: string | number) => new Decimal(v);
const money = (v: Dec) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const pct = (v: string) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const isDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const vat15 = (s?: string | null) => !!s && /^3\d{13}3$/.test(s);

/** VAT breakdown per (category, rate) — [XML] §9.6: tax = taxable × rate / 100, half-up to 2 decimals; O → 0. */
export function vatBreakdown(lines: Line[]) {
  const groups = new Map<string, { category: VatCategory; rate: string; taxable: Dec; exemptionCode: string | null; exemptionReason: string | null }>();
  for (const l of lines) {
    const rate = pct(l.vatRate);
    const key = `${l.vatCategory}|${rate}|${l.exemptionCode ?? ""}`;
    const g = groups.get(key) ?? { category: l.vatCategory, rate, taxable: D(0), exemptionCode: l.exemptionCode ?? null, exemptionReason: l.exemptionReason ?? null };
    g.taxable = g.taxable.plus(D(l.net));
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, taxable: money(g.taxable), tax: g.category === "O" ? "0.00" : money(g.taxable.mul(D(g.rate)).div(100)) }));
}

/** Business-rule pre-validation of the SNAPSHOT (subset of [XML] §13 that the generator can check offline). */
export function validateInput(x: ZatcaInvoiceInput, now = new Date()): Issue[] {
  const out: Issue[] = [];
  const add = (rule: string, field: string, message: string) => out.push({ rule, field, message });
  const standard = x.kind === "STANDARD";
  if (!x.number?.trim()) add("BR-02", "number", "invoice number required");
  if (!isDate(x.issueDate)) add("BR-KSA-F-01", "issueDate", "YYYY-MM-DD");
  else if (x.issueDate > now.toISOString().slice(0, 10) && Date.parse(`${x.issueDate}T00:00:00+03:00`) > now.getTime()) add("BR-KSA-04", "issueDate", "issue date in the future");
  if (!/^\d{2}:\d{2}:\d{2}Z?$/.test(x.issueTime)) add("BR-KSA-70", "issueTime", "hh:mm:ss");
  if (x.currency !== TAX_CURRENCY) add("BR-KSA-EN16931-02/BT-111", "currency", "only SAR invoices are supported (a foreign-currency invoice needs the VAT total in SAR and an exchange rate, which this system does not hold)");
  // seller ([XML] BR-KSA-08/09/37/39/40/66)
  const s = x.seller;
  if (!s.registrationName?.trim()) add("BT-27", "seller.registrationName", "seller legal name required");
  if (!vat15(s.vatNumber)) add("BR-KSA-40", "seller.vatNumber", "15 digits, first and last digit 3");
  if (s.otherId && (!s.otherIdScheme || !(SELLER_ID_SCHEMES as readonly string[]).includes(s.otherIdScheme))) add("BR-KSA-08", "seller.otherIdScheme", `one of ${SELLER_ID_SCHEMES.join(", ")}`);
  if (s.otherId && !/^[A-Za-z0-9]+$/.test(s.otherId)) add("BR-KSA-08", "seller.otherId", "alphanumeric only");
  if (!s.otherId) add("BR-KSA-08", "seller.otherId", "seller identification (e.g. commercial registration, scheme CRN) required");
  const sa = s.address;
  if (!sa) add("BR-KSA-09", "seller.address", "national address required");
  else {
    if (!sa.street?.trim()) add("BR-KSA-09", "seller.address.street", "required");
    if (!/^\d{4}$/.test(sa.building ?? "")) add("BR-KSA-37", "seller.address.building", "4 digits");
    if (!/^\d{5}$/.test(sa.postalCode ?? "")) add("BR-KSA-66", "seller.address.postalCode", "5 digits");
    if (!sa.city?.trim()) add("BR-KSA-09", "seller.address.city", "required");
    if (!sa.district?.trim()) add("BR-KSA-09", "seller.address.district", "required");
    if (!/^[A-Z]{2}$/.test(sa.country ?? "")) add("BR-KSA-09", "seller.address.country", "ISO 3166 alpha-2");
  }
  // buyer
  const b = x.buyer;
  if (standard && !b.registrationName?.trim()) add("BR-KSA-42", "buyer.registrationName", "buyer name required on tax invoices");
  if (b.vatNumber && !vat15(b.vatNumber) && !x.flags?.exports) add("BR-KSA-44", "buyer.vatNumber", "15 digits, first and last digit 3");
  if (x.flags?.exports && b.vatNumber) add("BR-KSA-46", "buyer.vatNumber", "must not exist on export invoices");
  if (standard && !b.vatNumber && !b.otherId) add("BR-KSA-14", "buyer.otherId", "buyer identification required when the buyer has no VAT number");
  if (b.otherId && (!b.otherIdScheme || !(BUYER_ID_SCHEMES as readonly string[]).includes(b.otherIdScheme))) add("BR-KSA-14", "buyer.otherIdScheme", `one of ${BUYER_ID_SCHEMES.join(", ")}`);
  if (standard) {
    const ba = b.address;
    if (!ba) add("BR-KSA-10", "buyer.address", "buyer address required on tax invoices");
    else {
      if (!ba.street?.trim()) add("BR-KSA-10", "buyer.address.street", "required");
      if (!ba.city?.trim()) add("BR-KSA-10", "buyer.address.city", "required");
      if (!/^[A-Z]{2}$/.test(ba.country ?? "")) add("BR-KSA-10", "buyer.address.country", "ISO 3166 alpha-2");
      if (ba.country === "SA") {
        if (!ba.building?.trim()) add("BR-KSA-63", "buyer.address.building", "required for SA buyers");
        if (!/^\d{5}$/.test(ba.postalCode ?? "")) add("BR-KSA-67", "buyer.address.postalCode", "5 digits for SA buyers");
        if (!ba.district?.trim()) add("BR-KSA-63", "buyer.address.district", "required for SA buyers");
      }
    }
  }
  // dates / references
  if (standard && x.typeCode === "388" && !isDate(x.supplyDate)) add("BR-KSA-15", "supplyDate", "supply date (KSA-5) required on tax invoices");
  if (x.supplyEndDate && (!x.supplyDate || x.supplyEndDate < x.supplyDate)) add("BR-KSA-35/36", "supplyEndDate", "needs a supply date and must not precede it");
  if ((x.typeCode === "381" || x.typeCode === "383") && !x.billingReference) add("BR-KSA-56", "billingReference", "credit / debit notes must reference the original invoice");
  if ((x.typeCode === "381" || x.typeCode === "383") && !x.reason?.trim()) add("BR-KSA-17", "reason", "credit / debit notes need the reason (KSA-10)");
  if (x.reason && !x.paymentMeansCode) add("BR-KSA-16/BT-81", "paymentMeansCode", "the note reason (KSA-10) is carried in PaymentMeans, which needs a payment means code (UNTDID 4461)");
  if (x.paymentMeansCode && !/^[0-9A-Z]{1,3}$/.test(x.paymentMeansCode)) add("BR-KSA-16", "paymentMeansCode", "UNTDID 4461 code");
  if (x.kind === "SIMPLIFIED" && (x.flags?.exports || x.flags?.selfBilled)) add("BR-KSA-31", "flags", "simplified documents accept only third-party, nominal and summary flags");
  if (x.flags?.exports && x.flags?.selfBilled) add("BR-KSA-07", "flags", "self-billing is not allowed for exports");
  // lines + totals ([XML] §9, BR-KSA-DEC, BR-KSA-EN16931-11, BR-CO-*)
  if (!x.lines.length) add("BR-16", "lines", "at least one invoice line");
  let sumNet = D(0);
  for (const l of x.lines) {
    const f = `lines[${l.id}]`;
    if (!l.name?.trim()) add("BT-153", `${f}.name`, "item name required");
    if (!(["S", "Z", "E", "O"] as string[]).includes(l.vatCategory)) add("BR-KSA-18", `${f}.vatCategory`, "S, Z, E or O");
    if (l.vatCategory === "S" && !D(l.vatRate).gt(0)) add("BR-S-05", `${f}.vatRate`, "standard rated lines need a rate above zero");
    if (l.vatCategory !== "S" && !D(l.vatRate).isZero()) add("BR-Z/E/O-05", `${f}.vatRate`, "zero / exempt / out-of-scope lines carry rate 0");
    if (l.vatCategory !== "S" && (!l.exemptionCode || !EXEMPTION_CODES[l.vatCategory as "Z" | "E" | "O"].includes(l.exemptionCode))) add("BR-KSA-23/24/69", `${f}.exemptionCode`, `a VATEX-SA reason code for category ${l.vatCategory} is required`);
    const gross = D(l.quantity).mul(D(l.unitPrice)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (!gross.minus(D(l.discount)).eq(D(l.net))) add("BR-KSA-EN16931-11", `${f}.net`, `net ${l.net} ≠ quantity × price − allowance (${money(gross.minus(D(l.discount)))})`);
    const expectedVat = l.vatCategory === "O" ? D(0) : D(l.net).mul(D(l.vatRate)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (!expectedVat.eq(D(l.vatAmount))) add("BR-KSA-DEC-03/KSA-11", `${f}.vatAmount`, `line VAT ${l.vatAmount} ≠ ${money(expectedVat)}`);
    if (D(l.discount).isNegative() || D(l.quantity).lte(0)) add("BR-27/BR-41", f, "positive quantity, non-negative allowance");
    sumNet = sumNet.plus(D(l.net));
  }
  const bd = vatBreakdown(x.lines);
  const vatTotal = bd.reduce((a, g) => a.plus(D(g.tax)), D(0));
  const t = x.totals;
  if (!sumNet.eq(D(t.lineExtension))) add("BR-CO-10", "totals.lineExtension", `≠ Σ line net (${money(sumNet)})`);
  if (!D(t.taxExclusive).eq(D(t.lineExtension))) add("BR-CO-13", "totals.taxExclusive", "no document-level allowances / charges: must equal the line total");
  if (!vatTotal.eq(D(t.taxTotal))) add("BR-CO-14/§9.6", "totals.taxTotal", `invoice VAT ${t.taxTotal} ≠ Σ VAT per category (${money(vatTotal)}) — the per-line VAT of this invoice rounds differently from the official per-category calculation`);
  if (!D(t.taxInclusive).eq(D(t.taxExclusive).plus(D(t.taxTotal)))) add("BR-CO-15", "totals.taxInclusive", "≠ tax exclusive + VAT");
  if (!D(t.payable).eq(D(t.taxInclusive))) add("BR-CO-16", "totals.payable", "≠ total with VAT (no prepayment / rounding supported)");
  return out;
}

const amt = (name: string, v: string, currency: string) => el(name, { currencyID: currency }, money(D(v)));
function postal(a: Address) {
  return el("cac:PostalAddress", [
    el("cbc:StreetName", a.street),
    a.additionalStreet ? el("cbc:AdditionalStreetName", a.additionalStreet) : null,
    a.building ? el("cbc:BuildingNumber", a.building) : null,
    a.plot ? el("cbc:PlotIdentification", a.plot) : null,
    a.district ? el("cbc:CitySubdivisionName", a.district) : null,
    el("cbc:CityName", a.city),
    a.postalCode ? el("cbc:PostalZone", a.postalCode) : null,
    el("cac:Country", [el("cbc:IdentificationCode", a.country)])
  ]);
}
const taxScheme = () => el("cac:TaxScheme", [el("cbc:ID", "VAT")]);
function party(p: Party) {
  return el("cac:Party", [
    p.otherId ? el("cac:PartyIdentification", [el("cbc:ID", { schemeID: p.otherIdScheme ?? "OTH" }, p.otherId)]) : null,
    p.address ? postal(p.address) : null,
    p.vatNumber ? el("cac:PartyTaxScheme", [el("cbc:CompanyID", p.vatNumber), taxScheme()]) : null,
    p.registrationName ? el("cac:PartyLegalEntity", [el("cbc:RegistrationName", p.registrationName)]) : null
  ]);
}
const taxCategory = (name: string, g: { category: string; rate: string; exemptionCode?: string | null; exemptionReason?: string | null }) =>
  el(name, [el("cbc:ID", g.category), el("cbc:Percent", g.rate), g.exemptionCode ? el("cbc:TaxExemptionReasonCode", g.exemptionCode) : null, g.exemptionCode ? el("cbc:TaxExemptionReason", g.exemptionReason || g.exemptionCode) : null, taxScheme()]);

/** Build the document tree. Validation is the caller's job (validateInput) — this only refuses structurally impossible input. */
export function buildInvoiceTree(x: ZatcaInvoiceInput, chain: Chain): XNode {
  if (!/^[A-Za-z0-9-]+$/.test(chain.uuid)) throw new Error("BR-KSA-03: UUID may contain letters, digits and dashes only");
  if (!Number.isInteger(chain.icv) || chain.icv < 1) throw new Error("BR-KSA-33/34: ICV must be a positive integer");
  const cur = x.currency;
  const bd = vatBreakdown(x.lines);
  const vatTotal = money(bd.reduce((a, g) => a.plus(D(g.tax)), D(0)));
  return el("Invoice", { xmlns: NS.invoice, "xmlns:cac": NS.cac, "xmlns:cbc": NS.cbc, "xmlns:ext": NS.ext }, [
    el("cbc:ProfileID", PROFILE_ID),
    el("cbc:ID", x.number),
    el("cbc:UUID", chain.uuid),
    el("cbc:IssueDate", x.issueDate),
    el("cbc:IssueTime", x.issueTime),
    el("cbc:InvoiceTypeCode", { name: transactionCode(x.kind, x.flags) }, x.typeCode),
    el("cbc:DocumentCurrencyCode", cur),
    el("cbc:TaxCurrencyCode", TAX_CURRENCY),
    x.billingReference ? el("cac:BillingReference", [el("cac:InvoiceDocumentReference", [el("cbc:ID", x.billingReference)])]) : null,
    el("cac:AdditionalDocumentReference", [el("cbc:ID", "ICV"), el("cbc:UUID", String(chain.icv))]),
    el("cac:AdditionalDocumentReference", [el("cbc:ID", "PIH"), el("cac:Attachment", [el("cbc:EmbeddedDocumentBinaryObject", { mimeCode: "text/plain" }, chain.previousHash)])]),
    el("cac:AccountingSupplierParty", [party(x.seller)]),
    el("cac:AccountingCustomerParty", [party(x.buyer)]),
    x.supplyDate ? el("cac:Delivery", [el("cbc:ActualDeliveryDate", x.supplyDate), x.supplyEndDate ? el("cbc:LatestDeliveryDate", x.supplyEndDate) : null]) : null,
    x.paymentMeansCode ? el("cac:PaymentMeans", [el("cbc:PaymentMeansCode", x.paymentMeansCode), x.reason ? el("cbc:InstructionNote", x.reason) : null]) : null,
    // [XML] BR-KSA-EN16931-08/09: one TaxTotal with the breakdown, one without (VAT in accounting currency, SAR)
    el("cac:TaxTotal", [amt("cbc:TaxAmount", vatTotal, cur), ...bd.map((g) => el("cac:TaxSubtotal", [amt("cbc:TaxableAmount", g.taxable, cur), amt("cbc:TaxAmount", g.tax, cur), taxCategory("cac:TaxCategory", g)]))]),
    el("cac:TaxTotal", [amt("cbc:TaxAmount", vatTotal, TAX_CURRENCY)]),
    el("cac:LegalMonetaryTotal", [
      amt("cbc:LineExtensionAmount", x.totals.lineExtension, cur),
      amt("cbc:TaxExclusiveAmount", x.totals.taxExclusive, cur),
      amt("cbc:TaxInclusiveAmount", x.totals.taxInclusive, cur),
      amt("cbc:PayableAmount", x.totals.payable, cur)
    ]),
    ...x.lines.map((l) =>
      el("cac:InvoiceLine", [
        el("cbc:ID", l.id),
        el("cbc:InvoicedQuantity", D(l.quantity).toFixed()),
        amt("cbc:LineExtensionAmount", l.net, cur),
        D(l.discount).gt(0) ? el("cac:AllowanceCharge", [el("cbc:ChargeIndicator", "false"), el("cbc:AllowanceChargeReasonCode", DISCOUNT_REASON_CODE), el("cbc:AllowanceChargeReason", "Discount"), amt("cbc:Amount", l.discount, cur)]) : null,
        el("cac:TaxTotal", [amt("cbc:TaxAmount", l.vatAmount, cur), amt("cbc:RoundingAmount", money(D(l.net).plus(D(l.vatAmount))), cur)]),
        el("cac:Item", [el("cbc:Name", l.name), taxCategory("cac:ClassifiedTaxCategory", { category: l.vatCategory, rate: pct(l.vatRate) })]),
        el("cac:Price", [el("cbc:PriceAmount", { currencyID: cur }, D(l.unitPrice).toFixed()), el("cbc:BaseQuantity", "1")])
      ])
    )
  ]);
}

/** Generate the immutable artefact: stored XML, canonical hash input, invoice hash. Throws ZATCA_VALIDATION on rule failures. */
export function generateDocument(x: ZatcaInvoiceInput, chain: Chain, now = new Date()) {
  const issues = validateInput(x, now);
  if (issues.length) throw Object.assign(new Error(`ZATCA_VALIDATION:${[...new Set(issues.map((i) => i.rule))].join(",")}`), { issues });
  const tree = buildInvoiceTree(x, chain);
  const canonical = hashView(tree);
  return { xml: documentXml(tree), canonical, invoiceHash: invoiceHashOf(canonical) };
}
