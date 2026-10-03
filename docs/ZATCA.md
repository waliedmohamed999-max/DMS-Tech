# ZATCA e-invoicing (FATOORA) — architecture foundation (Phase 11)

**Status: `ZATCA_CODE_READY / EXTERNAL_ONBOARDING_REQUIRED` for standard (B2B) tax invoices.**

The application can produce standard invoices and track their compliance state. What is still missing comes from
outside the code:
* ZATCA onboarding: an OTP from the FATOORA portal, then CSIDs.
* The company's identifiers and national address.
* The company's decisions (see below).
* A real sandbox / production run against ZATCA.

Nothing in this build has been accepted by ZATCA, and nothing claims it has. Simplified (B2C) documents, credit notes
and debit notes are **not** supported yet (see *Not implemented*).

The business decision of whether e-invoicing applies, and from which wave, is recorded in
[ZATCA-DECISION.md](ZATCA-DECISION.md).

## Official sources used (and only these)

| Ref | Document | Version / date | Source |
|---|---|---|---|
| [XML] | Electronic Invoice XML Implementation Standard | v1.2, 2023-05-19 | zatca.gov.sa → E-Invoicing → Systems Developers → E-Invoice specifications |
| [DD] | Electronic Invoice Data Dictionary | 2023-05-19 (vF) | same page |
| [SEC] | Electronic Invoice Security Features Implementation Standards | v1.2, 2023-05-19 | zatca.gov.sa → Systems Developers → Security requirements |
| [GUIDE] | E-invoicing Detailed Technical Guidelines | Version 2, Nov 2022 | zatca.gov.sa → E-Invoicing → Guidelines |
| [PORTAL] | Developer Portal User Manual | Version 2, June 2022 | zatca.gov.sa → Compliance and Enablement Toolbox |
| [UBL] | OASIS UBL 2.1 schemas | — | mandated by [XML] §12 |

These documents were downloaded on 2026-10-03 for reading only. They are **not** stored in the repository.

The following were **not** available without registration or acceptance of terms, so nothing in the code is based on
them:
* The Swagger API specifications. They are in the Integration Sandbox and require a registered Developer Portal account.
* The official Java SDK, including its CLI manual and sample documents. Downloading it requires accepting ZATCA's terms
  of use, which is the company's decision.

### Points where the official documents disagree (no position taken in code)

| Topic | [SEC] v1.2 §4.1 | [GUIDE] v2 §6.2 worked example |
|---|---|---|
| QR tag 6 (invoice hash) | "length of hash (SHA256) is 32 bytes" | encodes the 44-character base64 text |
| Signing key curve | certificate profile "Key length: P-256" | openssl example uses `secp256k1`; [PORTAL] says the SDK uses secp256k1 |

These matter only for simplified invoices (seller-side stamp and QR), which are not implemented. Resolve them with the
official SDK before implementing that path.

## What is implemented

| Area | Implementation | Source |
|---|---|---|
| Lifecycle, separate from accounting | `ZatcaDocument` per invoice. The invoice keeps its number, totals and status; nothing in finance is recalculated. | — |
| Document types | Standard tax invoice `388`, transaction code `0100000` (KSA-2 `NNPNESB`) | [XML] §11.2.1, BR-KSA-06 |
| Clearance vs reporting | STANDARD → clearance; 303 (clearance disabled) → the same document through reporting | [GUIDE] §4.3, [PORTAL] FAQ |
| XML | Deterministic UBL 2.1 built from an immutable snapshot. Includes ProfileID `reporting:1.0`, UUID, IssueDate / IssueTime, ICV and PIH references, seller / buyer identification and national address, supply date, VAT breakdown per category with exemption codes, two TaxTotals (document + SAR), line allowances (code 95), line VAT (KSA-11) and line total with VAT (KSA-12). | [XML] §9–§13, [DD] |
| Arithmetic | decimal.js strings, half-up to 2 decimals. VAT per category = taxable × rate / 100. A mismatch with the invoice's own totals is a validation error; amounts are never adjusted. | [XML] §9.6, §10 |
| Validation before generation | Offline subset of BR / BR-KSA rules: VAT number format, building number (4 digits), postal code (5 digits), buyer name / identification / address, supply date, VATEX codes per category, BR-CO total equations, note references. A failure aborts the issue and the invoice stays a draft. | [XML] §13 |
| Hash | The document is serialized directly in C14N form (no whitespace nodes, canonical attribute order and escaping). Hash = base64(SHA-256) over the document without UBLExtensions, Signature and the QR reference. | [XML] BR-KSA-26, [GUIDE] §5.2 |
| Chain | ICV (gap-free per EGS unit) and PIH (first = documented constant). The unit row is locked, and a compare-and-set update rejects concurrent chain changes. Rejected documents stay in the chain. | [XML] BR-KSA-26/33/34, [GUIDE] §4.3 |
| Submission | Existing outbox (`zatca.submit`). POST `/invoices/clearance/single` or `/invoices/reporting/single` with Basic `CSID:secret`, `Accept-Version: V2`, body `{invoiceHash, invoice}` | [PORTAL] §3, FAQ 4.2.4 |
| Failure classification | ACCEPTED, ACCEPTED_WARNINGS (not resubmitted), REJECTED (final; a correction is a new document), AUTH (dead letter until requeued), RETRYABLE (same document later), UNKNOWN (timeout after sending → the **identical bytes** are resubmitted, because ZATCA counts a document once per UUID + hash) | [GUIDE] FAQ |
| State machine | DB trigger: generated artefact immutable; CLEARED / REPORTED / REJECTED final; no deletes. One live document per invoice (unique partial index). Submission is claimed per document, and a stale claim is treated as UNKNOWN. | — |
| Delivery rule | `markInvoiceSent` is refused until the standard document is CLEARED. A rejected one needs a new document. | [GUIDE] §4.3.2 |
| Void after submission | Refused (`ZATCA_SUBMITTED_NEEDS_CREDIT_NOTE`) | [XML] §5.2 |
| Environments | Units are SANDBOX / SIMULATION / PRODUCTION. Staging cannot use production; production cannot call sandbox. A sandbox result never makes readiness READY. | [PORTAL] §2.3.8 |
| Secrets | DB holds references only (`env:` / `enc:` for the CSID and secret, `env:` / `file:` for keys). A DB CHECK refuses key material in the column. | [SEC] Req. 8 |
| Backup / restore | `restoreBackup` locks every ACTIVE unit (`LOCKED_AFTER_RESTORE`), because the restored counter / hash may be behind what ZATCA already received. `zatca:unit unlock` reconciles with checks. Backup verification checks chain contiguity. | — |
| QR (TLV) | Encoder / decoder; reproduces the official worked example of [GUIDE] §6.4 byte for byte | [SEC] §4.1, [GUIDE] §6 |

## Not implemented (and why)

| Item | Reason | Kind |
|---|---|---|
| Simplified (B2C) invoices and the seller XAdES cryptographic stamp, QR tags 6–9 | The exact XAdES template, signed-properties serialization and tag-6 encoding come from the official SDK samples (not public), and the official documents disagree (above). Refused with `ZATCA_SIMPLIFIED_NOT_SUPPORTED`. | CODE (needs SDK) |
| Credit / debit notes (381 / 383) | The XML generator supports them (billing reference, reason, payment means), but the finance domain has no credit-note entity. Adding one is a finance feature, which is out of scope for this phase. | CODE / BUSINESS |
| Onboarding API (compliance CSID, compliance checks, production CSID) and CSR generation | Endpoints are documented only in the registered Swagger. The OTP is only available from the FATOORA portal ([GUIDE] FAQ). CSR fields are specified in [SEC] Table 1; generate the CSR with the official SDK. | EXTERNAL |
| Zero-rated / exempt lines | DMS stores no VATEX reason code per line, so such invoices fail validation until it does | DATA / CODE |
| Foreign-currency invoices | They need the VAT total in SAR and an exchange rate (BT-111), which the system does not hold. Refused. | CODE |
| PDF/A-3 with embedded XML | XML submission only ([GUIDE] §4.3). The buyer copy of a cleared standard invoice is the cleared XML ZATCA returns. | — |

## Required before production (outside the code)

1. **Decision**: `ZATCA_STATUS=REQUIRED` (or `NOT_REQUIRED` with `ZATCA_DECISION_REF`), confirmed by the tax advisor.
2. **Supply date policy**: `ZATCA_SUPPLY_DATE_POLICY=ISSUE_DATE` only if the advisor confirms that the issue date is the
   supply date (KSA-5) for this business. Otherwise standard invoices fail validation.
3. **Company data**: run `npm run zatca:unit -- seller --json seller.json` with the registration name, VAT number, CR
   (scheme CRN), and national address (street, 4-digit building number, district, city, 5-digit postal code).
4. **Buyer data**: national address and identifiers for each SA business client, using `zatca:unit -- buyer`.
5. **Onboarding** (FATOORA portal + official SDK):
   1. Get an OTP from the portal.
   2. Generate a CSR.
   3. Request a compliance CSID.
   4. Run the compliance checks.
   5. Request the production CSID.

   Store the CSID and secret in the secret manager, then:

   ```
   npm run zatca:unit -- create --env PRODUCTION --csid-ref env:ZATCA_CSID --secret-ref env:ZATCA_SECRET --cert prod-csid.pem
   npm run zatca:unit -- activate
   ```
6. **Endpoint**: `ZATCA_API_BASE_URL`, the production base URL from ZATCA (no default in code).
   `ZATCA_SANDBOX_API_BASE_URL` for sandbox units.
7. **Sandbox run**:
   1. Issue test invoices with a SANDBOX unit and check CLEARED in `npm run zatca:unit -- status`.
   2. Validate a sample with the official SDK (`npm run zatca:sdk-validate`).
   3. Confirm the request body fields against the registered Swagger.
8. `npm run go-live:check` → `zatca` PASS.

## Tests

`tests/zatca.test.ts` has 28 tests:
* Official fixtures: first PIH constant, QR worked example, hash encoding example, KSA-2 codes.
* Canonical serialization, deterministic output, hash exclusions, mandated elements.
* Validation rules (required fields, VATEX codes, rounding mismatch reported rather than adjusted).
* Issue integration: totals unchanged, chain, regeneration from the snapshot is byte-identical.
* Validation aborts the issue; B2C refused; six concurrent issues give a gap-free ICV chain.
* DB immutability, one live document, key references only.
* Submission against a local HTTP stub, which is not ZATCA: 200 / 400 / 503 → retry / timeout → UNKNOWN → identical
  resubmission / 303 → reporting / 401 → dead letter → requeue.
* Environment separation, not-configured handling.
* Restore lock and reconciliation, including a real `pg_dump` → `pg_restore` that locks the restored chain.
