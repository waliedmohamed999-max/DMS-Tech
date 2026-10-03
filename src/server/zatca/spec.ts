/**
 * ZATCA e-invoicing constants — every value is taken from an OFFICIAL document (versions in docs/ZATCA.md):
 *   [XML]  Electronic Invoice XML Implementation Standard v1.2 (2023-05-19)
 *   [DD]   Electronic Invoice Data Dictionary (2023-05-19)
 *   [SEC]  Electronic Invoice Security Features Implementation Standards v1.2 (2023-05-19)
 *   [GUIDE] E-invoicing Detailed Technical Guidelines v2 (Nov 2022)
 *   [PORTAL] Developer Portal User Manual v2 (June 2022)
 *   [UBL]  OASIS UBL 2.1 (the schema the XML standard mandates, [XML] §12)
 */

/** [XML] §12 — UBL 2.1 namespaces. */
export const NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
} as const;

/** [XML] BR-KSA-EN16931-01 */
export const PROFILE_ID = "reporting:1.0";
/** [XML] BR-KSA-EN16931-02 — VAT accounting currency */
export const TAX_CURRENCY = "SAR";

/** [XML] BR-KSA-26 / [DD] KSA-13 — previous invoice hash of the FIRST document: base64(SHA-256("0")). */
export const FIRST_PREVIOUS_HASH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

/** [XML] §11.2.1 — invoice type code (BT-3) */
export const TYPE_CODE = { invoice: "388", debitNote: "383", creditNote: "381" } as const;
export type TypeCode = (typeof TYPE_CODE)[keyof typeof TYPE_CODE];

/** [XML] BR-KSA-06 — KSA-2 "NNPNESB": NN 01 standard / 02 simplified, then 3rd-party, nominal, export, summary, self-billed flags. */
export type TransactionFlags = { thirdParty?: boolean; nominal?: boolean; exports?: boolean; summary?: boolean; selfBilled?: boolean };
export function transactionCode(kind: "STANDARD" | "SIMPLIFIED", f: TransactionFlags = {}) {
  const b = (x?: boolean) => (x ? "1" : "0");
  return `${kind === "STANDARD" ? "01" : "02"}${b(f.thirdParty)}${b(f.nominal)}${b(f.exports)}${b(f.summary)}${b(f.selfBilled)}`;
}

/** [XML] §11.2.4 — VAT categories and their exemption / exception reason codes (BT-121). */
export const VAT_CATEGORY = { standard: "S", zero: "Z", exempt: "E", outOfScope: "O" } as const;
export type VatCategory = "S" | "Z" | "E" | "O";
export const EXEMPTION_CODES: Record<Exclude<VatCategory, "S">, readonly string[]> = {
  E: ["VATEX-SA-29", "VATEX-SA-29-7", "VATEX-SA-30"],
  Z: ["VATEX-SA-32", "VATEX-SA-33", "VATEX-SA-34-1", "VATEX-SA-34-2", "VATEX-SA-34-3", "VATEX-SA-34-4", "VATEX-SA-34-5", "VATEX-SA-35", "VATEX-SA-36", "VATEX-SA-EDU", "VATEX-SA-HEA", "VATEX-SA-MLTRY"],
  O: ["VATEX-SA-OOS"]
};

/** [XML] BR-KSA-08 (seller) and BR-KSA-14 (buyer) identification schemes, in the mandated order of preference. */
export const SELLER_ID_SCHEMES = ["CRN", "MOM", "MLS", "700", "SAG", "OTH"] as const;
export const BUYER_ID_SCHEMES = ["TIN", "CRN", "MOM", "MLS", "700", "SAG", "NAT", "GCC", "IQA", "PAS", "OTH"] as const;

/** [XML] §9.3 example — line discount as an allowance with reason code 95 ("Discount", UNTDID 5189). */
export const DISCOUNT_REASON_CODE = "95";

/** [PORTAL] §4.2.4 — documented API paths (base URL comes from configuration, never guessed). */
export const API_PATH = { reporting: "/invoices/reporting/single", clearance: "/invoices/clearance/single" } as const;
