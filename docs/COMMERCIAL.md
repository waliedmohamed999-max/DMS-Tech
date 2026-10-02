# Business OS — Commercial (Phase 3): Services, Quotations, Approvals, Contracts

Flow: **Opportunity → service / package selection → quotation draft → (internal review) → (approval) → sent → client accepted / rejected → contract** → project (Phase 4, see [PROJECTS.md](PROJECTS.md)). The contract page shows the live project and per-milestone delivery eligibility (read-only).
Services: `src/server/commercial/*` · PDF: `src/server/pdf/*` · actions: `src/lib/os/sales-actions.ts` · pages: `src/app/app/(shell)/sales/**`.

> **NOVA AI is an external, existing DMS Tech system and is not implemented by the Business OS.** "NOVA AI" in the catalog is only a sellable product entry. See [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md).

## Routes

| Path | Purpose |
|---|---|
| `/app/sales/services` | Service catalog + packages (`?new=1` opens the create form) |
| `/app/sales/quotations` | List: search, status / approval / validity / owner filters, sort, pagination |
| `/app/sales/quotations/new` | Builder (`?opportunity=` or `?client=` pre-fill) |
| `/app/sales/quotations/[id]` | Record (`?v=N` older version): overview, approval history, versions, activity |
| `/app/sales/quotations/[id]/edit` | Builder for the current DRAFT version only |
| `/app/sales/quotations/[id]/pdf` | PDF (`?v=N`, `&download=1`) |
| `/app/sales/contracts`, `/app/sales/contracts/[id]`, `…/pdf` | Contracts |

Also: Quotations + Contracts tabs on `/app/crm/opportunities/[id]` and `/app/crm/clients/[id]`, quotation snapshot cards in `/app/approvals`, commercial KPIs/attention on `/app`, sales metrics on `/app/crm`, global search (services, quotations, contracts), Create menu (Quotation, Service).

## Data model (migrations `…_phase3_commercial`, `…_phase3_freeze_reopen`)

| Model | Notes |
|---|---|
| `Service` | `code` SRV-000001, stable `key` (slug), names/descriptions AR+EN, category, `pricingModel` (FIXED, HOURLY, MONTHLY, ANNUAL, PER_USER, PER_UNIT, CUSTOM), `basePrice` Decimal(14,2), currency, `taxBehavior` (STANDARD / ZERO_RATED / EXEMPT), delivery days, department, quotation texts, default terms, `active` / `archivedAt` |
| `ServicePackage`, `ServicePackageItem` | `code` PKG-000001, price, items = service × quantity (optional flag, order) |
| `Quotation` | One proposal: `number` Q-YYYY-NNNNNN, client, contact, opportunity, `ownerId` (sales owner), `status` (mirror of the current version), `currentVersionId`, `acceptedVersionId`, `duplicatedFromId` |
| `QuotationVersion` | `versionNumber`, status, language, currency, issue/valid dates (DATE), `vatRate` snapshot, subtotal / discountTotal / taxTotal / total, terms, internal notes, client message, `contentHash`, approval fields, sent/viewed/accepted/rejected/expired/cancelled/superseded metadata, `revisedFromId` |
| `QuotationItem` | Historical snapshot line: serviceId/packageId (nullable), name, description, unit, quantity Decimal(12,3), unitPrice, `catalogUnitPrice`, discount type/value, gross, discount amount, net subtotal, tax behaviour/rate/amount, total |
| `CommercialDocument` | Append-only stored artifact (the PDF of a sent version): bytes, sha256, language |
| `Contract`, `ContractMilestone` | `number` CTR-YYYY-NNNNNN, links to client/contact/opportunity/quotation/**exact version**, status, dates, copied commercial values, payment terms, scope, terms, owner, signing/activation/termination metadata; milestones = commercial commitments (amount or %), not tasks |
| `Organization` (+5 columns) | `quoteExecutiveApprovalThreshold`, `quoteCustomPricingRequiresApproval`, `quoteValidityDays`, `quoteExpiryWarningDays`, `contractExpiryWarningDays` |
| `Lead.serviceId`, `Opportunity.serviceId` | Catalog link (see migration below) |

Database-enforced rules: quantity > 0, prices ≥ 0, percent discount ≤ 100, discount ≤ line, line/total identities, `total = subtotal − discount + tax`, valid-until ≥ issue date, VAT 0–100, contract dates, terminated ⇒ reason; partial unique indexes — **one ACCEPTED version per quotation**, **one ACCEPTED quotation per opportunity**, **one non-cancelled contract per accepted version**, one sent PDF per version+language; triggers — **version commercial columns and items frozen outside DRAFT**, final quotation states never move, **contract commercial terms frozen once ACTIVE/closed**, CommercialDocument append-only.

Numbering: `Sequence` atomic UPSERT (no count()+1): SRV / PKG global counters, Q-YYYY and CTR-YYYY yearly counters (organization timezone).

## Service catalog & price snapshot

- 14 default DMS services are created at bootstrap (`ensureDefaultServices`, idempotent: only missing `key`s). They start as **CUSTOM / price 0 — DMS sets real prices**; nothing is invented. (The dev demo seed sets illustrative prices locally.)
- Inserting a service/package into a quotation copies its name, quotation text, price and tax behaviour into the **QuotationItem**. Quotations never read prices from the catalog afterwards — a price change next month leaves existing quotations untouched (tested).
- A package is inserted as one priced line whose description lists its services (optional ones marked).
- `catalogUnitPrice` keeps the catalog price at save time to show (and approve) price overrides.

## Phase 2 → Phase 3 service migration

1. Migration adds nullable `serviceId` to Lead/Opportunity; legacy `interestedService` / `serviceCategory` stay untouched.
2. `backfillLegacyServiceIds` (bootstrap, idempotent) maps rows whose legacy key **exactly equals** `Service.key`. Nothing is guessed: other values (e.g. `other`) stay unmapped with the legacy value preserved; `unmappedLegacyServices()` reports them.
3. New CRM records store `serviceId`; the stable key is mirrored into the legacy column for continuity. Website capture maps the form's service slug to the catalog service with the same key.
4. Future: drop the legacy columns after the unmapped values are reviewed.

Local result: all 12 existing leads mapped; no unmapped values.

## Pricing, discounts, VAT (`src/lib/commercial/calc.ts`)

Decimal arithmetic (decimal.js, ROUND_HALF_UP, 2 dp per line); the same module powers the builder preview, but **only the server's result is stored** — totals sent by a browser are ignored (tested).

```
gross = round2(qty × unitPrice) · discount = PERCENT round2(gross × v/100) | FIXED v (≤ gross)
net = gross − discount · tax = round2(net × rate/100) · line total = net + tax
subtotal = Σ gross · discountTotal = Σ discount · taxTotal = Σ tax · total = subtotal − discountTotal + taxTotal
```
VAT rate = **organization setting** (Phase 1 `vatRate`) for STANDARD lines, 0 for ZERO_RATED / EXEMPT; the rate is snapshotted on the version. Discounts are per line (percentage or fixed); quotation-level discounts are intentionally not supported to keep VAT allocation exact.

## Quotation lifecycle (server-enforced)

| From | Allowed to |
|---|---|
| DRAFT | INTERNAL_REVIEW, PENDING_APPROVAL / APPROVED (submit), CANCELLED |
| INTERNAL_REVIEW | DRAFT, PENDING_APPROVAL / APPROVED (submit), CANCELLED |
| PENDING_APPROVAL | APPROVED (approver), DRAFT (approval rejected or withdrawn), CANCELLED |
| APPROVED | SENT, DRAFT (reopen — invalidates the approval), CANCELLED |
| SENT | VIEWED, ACCEPTED, REJECTED (client), EXPIRED (system), SUPERSEDED (revision), CANCELLED |
| VIEWED | ACCEPTED, REJECTED, EXPIRED, SUPERSEDED, CANCELLED |
| ACCEPTED · REJECTED · EXPIRED · CANCELLED · SUPERSEDED | final (revision allowed from REJECTED / EXPIRED, never from ACCEPTED) |

Editing: DRAFT only. PENDING_APPROVAL → "withdraw" first; APPROVED → "reopen" (approval invalidated, audited); SENT/VIEWED/REJECTED/EXPIRED → **revision**; ACCEPTED → immutable (use Duplicate). Enforced by the service **and** by DB triggers.

### Versioning: revision vs duplicate

- **Revision** = same number, new version (V2): the previous version is never modified; a SENT/VIEWED one becomes SUPERSEDED (so it can no longer be accepted). Lines are copied as snapshots; VAT uses the current organization rate (new offer). Concurrency: quotation row lock + unique (quotationId, versionNumber).
- **Duplicate** = a separate proposal: new number, V1 DRAFT, `duplicatedFromId` set.

### Immutability & the sent artifact

On "mark as sent" the exact PDF of that version is generated from DB data and stored in `CommercialDocument` (sha256 in the audit row and response header `X-Content-SHA256`). Later downloads of a sent version return those exact bytes (`X-Document-Source: stored-sent-artifact`). Unsent versions render on demand with a DRAFT watermark when not approved.

## Approvals (Phase 1 engine reused — no second system)

On submit, rules from **organization settings** decide:

| Rule | Setting | Approver permission |
|---|---|---|
| total > threshold | `quoteApprovalThreshold` | `sales.quotations.approve` |
| total ≥ executive threshold | `quoteExecutiveApprovalThreshold` (optional) | `sales.quotations.approve_executive` |
| max(document, line) discount % > limit | `discountApprovalPercent` | `sales.quotations.approve` |
| custom / non-catalog / overridden price | `quoteCustomPricingRequiresApproval` (off by default) | `sales.quotations.approve` |
| currency ≠ company currency | — (thresholds cannot be compared without FX) | `sales.quotations.approve` |

No rule → APPROVED immediately (audited as `quotation.approved {auto: true}`). Otherwise `Approval(type=QUOTATION)` is created with a **snapshot payload** (number, version, client, opportunity, owner, totals, discount %, VAT, reasons, `contentHash`). The approver sees that snapshot in `/app/approvals`; approving re-checks status, approval id, current version and the recomputed content hash — a stale approval cannot apply (`STALE_APPROVAL`). Self-approval is blocked by the engine; rejection requires a comment and returns the quote to DRAFT with the comment; withdrawing cancels the approval (`onCancelled` hook added to the engine).

## Sending & client response

- No email integration exists → **no email is sent**. The user downloads the PDF, delivers it, and records "sent" with method (email/WhatsApp manually, in person, other) and an explicit confirmation. Event `quotation.sent`.
- "Client viewed" can be recorded manually (no public viewer — see limitations).
- **Acceptance** (manual record, not a digital signature): requires confirmation and the current version id; validity checked in the organization timezone; DB guarantees a single accepted version / quotation per opportunity. Audit stores who recorded it, when, which version, note, content hash.
- If requested and allowed (`crm.opportunities.mark_won`), an OPEN opportunity is moved to Won in the same transaction and its value set to the accepted **net** amount (excl. VAT) — audited. A WON/LOST opportunity is left untouched.
- Client rejection requires a reason.

## Expiry (server-side)

`sweepCommercial` (lazy, throttled 5 min per process on commercial pages and the Command Center, plus `npm run commercial:sweep` for a scheduler): SENT/VIEWED past `validUntil` → EXPIRED; one-time `quotation.expiring` within `quoteExpiryWarningDays`; ACTIVE contracts within `contractExpiryWarningDays` → EXPIRING; past `endDate` → EXPIRED. Acceptance also checks validity itself, so an expired quote can never be accepted even before the sweep runs.

## Contracts

Created only from an ACCEPTED quotation (`sales.contracts.create`), linked to the **exact accepted version**; values (currency, subtotal, discount, VAT, total), payment terms, scope (generated from the lines + delivery terms) and terms are copied — never recalculated from the catalog. Lifecycle: DRAFT ⇄ INTERNAL_REVIEW → AWAITING_SIGNATURE (start date required) → ACTIVE (`sales.contracts.activate`, signed date + confirmation that a signed copy was received offline) → EXPIRING / EXPIRED (system) · ACTIVE/EXPIRING → TERMINATED (`sales.contracts.terminate`, reason) · pre-active → CANCELLED (reason). Terms and milestones editable only in DRAFT / INTERNAL_REVIEW; milestone sum ≤ contract value and ≤ 100 %. Milestone delivery status can be tracked while the contract is in force. The contract PDF is a document for signature outside the system and states that it is not an electronic signature.

## Permissions & scope

| Key | Purpose |
|---|---|
| `services.view` / `services.manage` | catalog read / create, edit, archive services & packages (replaces `sales.services.manage`; custom roles migrated automatically by bootstrap) |
| `sales.quotations.view/create/edit/submit/send/accept/reject/cancel` | lifecycle actions (accept/reject = record the client's answer) |
| `sales.quotations.approve` / `sales.quotations.approve_executive` | approver tiers (+ `approvals.decide`) |
| `sales.contracts.view/create/edit/activate/terminate` | contracts (replaces `sales.contracts.manage`; custom roles migrated automatically, audited `rbac.permissions_migrated`) |

Record scope reuses the CRM keys: `crm.records.all` (everything), `crm.records.team` (department), otherwise own (owner or creator) — applied in every list, detail, search, KPI, metric and tab query. Defaults: **CEO/GM** everything incl. executive approval · **sales_manager** all quotation actions + approve, all contract actions, services.manage · **sales_rep** own quotations end-to-end (no approval), contracts view/create/edit (no activate/terminate) · **finance_manager** view + approve quotations, view contracts · **accountant** view quotations & contracts · **project_manager** view contracts & services · **marketing** services.view · **employee** nothing.

## Audit & events

Audit: `service.created/updated/archived`, `service.package_created/updated`, `quotation.created/updated/review_requested/reopened/submitted/approved/rejected/withdrawn/sent/viewed/accepted/client_rejected/expired/cancelled/revised`, `contract.created/updated/review_requested/returned_to_draft/sent_for_signature/activated/expiring/expired/terminated/cancelled/milestone_updated`, `opportunity.updated` (value from acceptance), plus the engine's `approval.*`. Commercial changes store before/after (totals, items, status, version, hash).
Events: `service.created/updated`, `quotation.created/updated/submitted/approved/rejected/sent/viewed/accepted/rejected_by_client/expired/expiring/cancelled/revised`, `contract.created/updated/activated/expiring/expired/terminated/cancelled`. No project/invoice records are created.
CRM timeline: every quotation/contract step is written to the opportunity (or client) timeline.

## Notifications

Approval requested → eligible approvers; approval decided → requester (Phase 1); quotation approved / approval rejected → owner when the owner is not the requester; quotation expiring / expired → owner; quotation accepted → owner ("create the contract"); contract expiring / expired → owner. The actor is never notified of their own action.

## Command Center & metrics

KPIs: quotes awaiting client response (with value) and accepted quotes without a contract; attention: quotes expiring soon, accepted quotes needing a contract, contracts ending soon, plus pending approvals (Phase 1). `/app/crm` shows created / approved / sent / accepted quotation values, acceptance rate and average discount for the chosen period — **by event date, quotation totals incl. VAT in the company currency; explicitly not revenue**.

## Known limitations

- No email sending, no public client viewer/acceptance page, no e-signature (manual records; public token page left as future work to keep Phase 3 stable).
- No FX: non-company currencies always need approval and are excluded from sums.
- Line discounts only (no document-level discount).
- Signed contract upload / attachments arrive with documents (Phase 7).
- PDF text engine: own bidi layout over pdfkit (fonts bundled); justified text and hyphenation are not supported.
- Expiry runs lazily + via the scheduled script; without a scheduler, expiry happens on the next commercial page view (acceptance is protected regardless).
- Prisma's query engine issues parallel queries on one transaction for some nested writes, which prints a `pg` deprecation warning; harmless today, tracked for the pg 9 upgrade.

## Project hand-off (Phase 4)

An ACTIVE / EXPIRING contract is the standard source of a project; an accepted quotation only when `projectFromQuotationAllowed` is on and no contract exists. Delivery never changes quotation or contract state: contract milestones only show "Delivered — eligible" when their linked project milestones are completed. The commercial sweep now runs under the shared `JobLease`. Billing (Phase 5) reads the accepted version, the contract and its milestones and never modifies them — see [FINANCE.md](FINANCE.md). Not built: payroll (Phase 6), NOVA AI internals (external).
