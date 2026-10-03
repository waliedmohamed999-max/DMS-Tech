import { conflict } from "../errors";
import { appEnv } from "../system/environment";

/**
 * ZATCA (Saudi e-invoicing / FATOORA) — ARCHITECTURAL BOUNDARY ONLY (Phase 10 — docs/ZATCA-DECISION.md).
 *
 * This build does NOT generate ZATCA-compliant e-invoices: no UBL 2.1 XML, no cryptographic stamp, no QR code,
 * no clearance / reporting API. Nothing here pretends otherwise. A real implementation plugs in behind
 * `TaxInvoiceComplianceAdapter` once the company's obligations are confirmed by its tax advisor and the official
 * ZATCA technical specification for its wave is in hand.
 *
 * Status (ZATCA_STATUS, decided by the company — not guessed by the software):
 *   NOT_CONFIGURED      no decision recorded (default)                                  → production issuing BLOCKED
 *   NOT_REQUIRED        decision recorded (ZATCA_DECISION_REF) that this use needs no e-invoicing integration
 *   REQUIRED_NOT_READY  required, no compliant adapter yet                                → production issuing BLOCKED
 *   READY               only when a real adapter is registered (none exists in this build)
 */
export type ComplianceStatus = "NOT_CONFIGURED" | "NOT_REQUIRED" | "REQUIRED_NOT_READY" | "READY";

export interface TaxInvoiceComplianceAdapter {
  readonly name: string;
  /** Build the compliant artefacts (XML, hash chain, cryptographic stamp, QR) for an issued invoice. */
  prepare(invoiceId: string): Promise<{ qrPayload: string; xml: string; hash: string }>;
  /** Clearance (B2B) / reporting (B2C) with the authority; returns the authority's reference. */
  submit(invoiceId: string): Promise<{ status: "CLEARED" | "REPORTED" | "REJECTED"; reference: string | null; messages: string[] }>;
}

let adapter: TaxInvoiceComplianceAdapter | null = null;
/** Register a real, verified adapter (none in this build). */
export const registerComplianceAdapter = (a: TaxInvoiceComplianceAdapter | null) => (adapter = a);

export function complianceStatus(env: Record<string, string | undefined> = process.env): { status: ComplianceStatus; reason: string; decisionRef: string | null; adapter: string | null } {
  const raw = (env.ZATCA_STATUS ?? "NOT_CONFIGURED").trim().toUpperCase();
  const decisionRef = env.ZATCA_DECISION_REF?.trim() || null;
  if (raw === "NOT_REQUIRED") {
    if (!decisionRef) return { status: "NOT_CONFIGURED", reason: "NOT_REQUIRED needs ZATCA_DECISION_REF (the documented, approved decision)", decisionRef, adapter: null };
    return { status: "NOT_REQUIRED", reason: "decision recorded", decisionRef, adapter: null };
  }
  if (raw === "READY") {
    // READY is a fact about installed software, not a setting
    if (!adapter) return { status: "REQUIRED_NOT_READY", reason: "ZATCA_STATUS=READY but no compliance adapter is installed", decisionRef, adapter: null };
    return { status: "READY", reason: "adapter installed", decisionRef, adapter: adapter.name };
  }
  if (raw === "REQUIRED_NOT_READY" || raw === "REQUIRED") return { status: "REQUIRED_NOT_READY", reason: "e-invoicing required — readiness is decided by the ZATCA lifecycle (zatcaReadiness)", decisionRef, adapter: null };
  return { status: "NOT_CONFIGURED", reason: "no ZATCA decision recorded", decisionRef, adapter: null };
}

/**
 * Production gate before an invoice gets its number (tests / development / staging are not gated).
 * Phase 11: when e-invoicing is REQUIRED, issuing is allowed only once the ZATCA lifecycle is READY (onboarded
 * PRODUCTION unit, credentials, seller data, policies) — see src/server/zatca/service.ts zatcaReadiness().
 */
export async function assertInvoiceIssuingAllowed() {
  if (appEnv() !== "production") return;
  const s = complianceStatus();
  if (s.status === "NOT_REQUIRED") return;
  if (s.status === "NOT_CONFIGURED") throw conflict("ZATCA_NOT_READY:NOT_CONFIGURED");
  const { zatcaReadiness } = await import("../zatca/service");
  const r = await zatcaReadiness();
  if (r.status !== "READY") throw conflict(`ZATCA_NOT_READY:${r.status}`);
}
