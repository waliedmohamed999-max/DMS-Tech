import { API_PATH } from "./spec";

/**
 * FATOORA platform adapter boundary (clearance / reporting). Only what the PUBLIC official documents specify is
 * implemented ([PORTAL] §3 + §4.2.4, [GUIDE] §4, [SEC] §5):
 *   POST {base}/invoices/clearance/single | /invoices/reporting/single
 *   Authorization: Basic base64(<CSID>:<secret>)   ·   Accept-Version: V2   ·   Accept-Language
 *   body { "invoiceHash": "<base64>", "invoice": "<base64 XML>" }
 *   200 OK · 202 accepted with warnings · 303 clearance disabled → use reporting · 400 rejected · 5xx service error
 * The base URL is configuration (ZATCA_API_BASE_URL) — never a guessed default. Onboarding (compliance CSID,
 * compliance checks, production CSID) endpoints are documented only in the Swagger files of the REGISTERED developer
 * portal; they are therefore NOT implemented here (docs/ZATCA.md — external onboarding).
 *
 * Outcome categories (the state machine reacts to these, never to raw HTTP):
 *   ACCEPTED            200 — cleared / reported
 *   ACCEPTED_WARNINGS   202 — accepted; do NOT resubmit ([GUIDE] FAQ)
 *   CLEARANCE_DISABLED  303 — submit the SAME document through reporting
 *   REJECTED            400 — ZATCA business-rule / validation failure: a corrected document needs a NEW ICV/UUID/hash
 *   AUTH                401 / 403 — CSID / secret problem; no retry until fixed
 *   RETRYABLE           429 / 5xx / connection refused before sending — retry the SAME document later
 *   UNKNOWN             timeout / connection lost after sending — the request may have been processed: resubmit the
 *                       SAME bytes only (ZATCA counts a document once per UUID + hash — [GUIDE] FAQ "submit the same
 *                       invoice twice"), never regenerate
 */
export type Outcome = "ACCEPTED" | "ACCEPTED_WARNINGS" | "CLEARANCE_DISABLED" | "REJECTED" | "AUTH" | "RETRYABLE" | "UNKNOWN";
export type Message = { code?: string; category?: string; message?: string; status?: string };
export type SubmitResult = { outcome: Outcome; httpStatus: number | null; platformStatus: string | null; clearedXml: string | null; warnings: Message[]; errors: Message[]; durationMs: number };
export type SubmitRequest = { invoiceHash: string; xml: string; uuid: string };

export interface FatooraClient {
  readonly environment: "SANDBOX" | "SIMULATION" | "PRODUCTION";
  clear(req: SubmitRequest): Promise<SubmitResult>;
  report(req: SubmitRequest): Promise<SubmitResult>;
}

const asList = (v: unknown): Message[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => x as Message) : []);
/** Accepts the documented shape ({status, warnings, errors}) and the nested validationResults shape. */
export function normalizeResponse(httpStatus: number, body: unknown, durationMs = 0): SubmitResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const vr = (b.validationResults ?? {}) as Record<string, unknown>;
  const warnings = [...asList(b.warnings), ...asList(vr.warningMessages)];
  const errors = [...asList(b.errors), ...asList(vr.errorMessages)];
  const platformStatus = String(b.clearanceStatus ?? b.reportingStatus ?? b.status ?? vr.status ?? "") || null;
  const cleared = typeof b.clearedInvoice === "string" ? Buffer.from(b.clearedInvoice, "base64").toString("utf8") : null;
  const base = { httpStatus, platformStatus, clearedXml: cleared, warnings, errors, durationMs };
  if (httpStatus === 200) return { ...base, outcome: warnings.length ? "ACCEPTED_WARNINGS" : "ACCEPTED" };
  if (httpStatus === 202) return { ...base, outcome: "ACCEPTED_WARNINGS" };
  if (httpStatus === 303) return { ...base, outcome: "CLEARANCE_DISABLED" };
  if (httpStatus === 400) return { ...base, outcome: "REJECTED" };
  if (httpStatus === 401 || httpStatus === 403) return { ...base, outcome: "AUTH" };
  if (httpStatus === 429 || httpStatus >= 500) return { ...base, outcome: "RETRYABLE" };
  // any other 4xx: the request itself is wrong — not retryable, not a ZATCA verdict on the document
  return { ...base, outcome: "AUTH", errors: [...errors, { code: `HTTP_${httpStatus}`, message: "unexpected response" }] };
}

export type HttpClientConfig = { baseUrl: string; csid: string; secret: string; environment: FatooraClient["environment"]; language?: "en" | "ar"; timeoutMs?: number; fetchImpl?: typeof fetch };

export function httpFatooraClient(cfg: HttpClientConfig): FatooraClient {
  if (!/^https:\/\//.test(cfg.baseUrl) && cfg.environment === "PRODUCTION") throw new Error("ZATCA_API_BASE_URL must be https");
  const f = cfg.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${cfg.csid}:${cfg.secret}`).toString("base64")}`;
  async function post(path: string, req: SubmitRequest): Promise<SubmitResult> {
    const t0 = Date.now();
    let sent = false;
    try {
      const res = await f(cfg.baseUrl.replace(/\/+$/, "") + path, {
        method: "POST",
        redirect: "manual", // 303 is an instruction for us, not a redirect to follow
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
        headers: { authorization: auth, "accept-version": "V2", "accept-language": cfg.language ?? "en", "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ invoiceHash: req.invoiceHash, invoice: Buffer.from(req.xml, "utf8").toString("base64") })
      });
      sent = true;
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return normalizeResponse(res.status, body, Date.now() - t0);
    } catch (e) {
      const name = (e as Error)?.name;
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
      // refused / DNS failure: nothing reached ZATCA → plain retry. Timeout / reset after connecting: outcome unknown.
      const neverSent = !sent && /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CERT|UNABLE_TO_VERIFY/.test(code);
      return { outcome: neverSent ? "RETRYABLE" : "UNKNOWN", httpStatus: null, platformStatus: null, clearedXml: null, warnings: [], errors: [{ code: name === "TimeoutError" ? "TIMEOUT" : code || name || "NETWORK" }], durationMs: Date.now() - t0 };
    }
  }
  return { environment: cfg.environment, clear: (r) => post(API_PATH.clearance, r), report: (r) => post(API_PATH.reporting, r) };
}
