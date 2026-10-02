# Business OS — Operations (Phase 7): Procurement, Purchase Orders, Assets, Documents, Support, Knowledge

The internal operations layer. It covers:

- Buying what the company needs (procurement requests, purchase orders, receipts).
- Tracking what the company owns (assets, assignments, maintenance).
- Keeping files securely (documents and their versions).
- Serving clients and staff (support tickets and SLAs).
- Writing down how things are done (knowledge base).

## Boundaries

- **Procurement is not accounting.** A purchase order never creates a payment, a payable or a ledger entry.
  - Once goods are received, the PO page shows "ready for supplier payment processing".
  - The supplier expense is then recorded through the normal Phase 5 expense flow, linked to the PO and approved as usual.
- **Documents are not a public bucket.** No file is ever under `public/`, and every download goes through an authorised route. Each document inherits the permissions of the record it belongs to.
- **Support channel integrations are not connected.** Email, WhatsApp and website sources are reserved values that cannot be selected. "Client-facing" notes are only a marker for a future portal; nothing is sent outside the OS.
- **Knowledge is internal documentation.** Search is plain text over titles, bodies and tags. There is no AI, no embeddings and no NOVA.

## Routes

| Route | Purpose |
|---|---|
| `/app/operations` | Dashboard with real counts per permission: pending requests, POs awaiting approval, late POs, assets assigned / in maintenance / unreturned, open / urgent tickets, SLA breaches, articles awaiting review, documents updated in the last 7 days. Includes an attention list. |
| `/app/operations/settings` | Procurement approval rules, SLA policies, asset categories |
| `/app/procurement`, `/[id]` | Purchase requests. The detail page shows the stepper, items, routing, documents and linked POs; you can create a PO from it. |
| `/app/procurement/orders`, `/[id]` | Purchase orders. The detail page covers draft editing, submit / approval, issue, receive (partial), close, revise (cancel and replace), cancel, registering assets from received lines, and linking a supplier expense. |
| `/app/procurement/vendors`, `/[id]` | Vendor performance: ops profile, contact persons, deterministic delivery metrics, POs, assets, documents |
| `/app/assets`, `/[id]` | Asset register. The detail page covers assign / return, status changes, maintenance, append-only assignment history and documents. |
| `/app/documents`, `/[id]` | Metadata search over documents you may open (active / awaiting my review / archived), company uploads, versions, review, archive |
| `/app/documents/upload` (POST), `/[id]/versions` (POST), `/[id]/download` (GET) | Multipart upload, new version, and authorised download (`?v=N`, `?inline=1` for PDF / images) |
| `/app/support`, `/tickets/[id]` | Queues (my tickets, unassigned, open, urgent, waiting client, overdue SLA, resolved, created by me). The ticket page shows the SLA panel, conversation (internal / requester-facing), status history, related records, related knowledge and documents. |
| `/app/knowledge`, `/[id]` | Search, article reading (live version only), drafts / review queue, publish history |

Operations data also appears inside earlier modules:

- **Client 360:** a real **Support** tab, and the **Files** tab now holds documents.
- **Project:** **Support** and **Documents** tabs.
- **Employee profile:** **Assets** tab; the **Documents** tab is now real.
- **My HR:** **My assets**.
- **Expense:** shows the linked PO.

## Data model (migration `20261005090000_phase7_operations`, additive)

| Area | Tables / columns |
|---|---|
| Procurement | `ProcurementApprovalRule`, `ProcurementRequest`, `ProcurementRequestItem` |
| Purchase orders | `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseReceipt`, `PurchaseReceiptItem` |
| Vendors | `VendorContact` (new). Phase 5 `Vendor` extended with `procurementCategory`, `preferred`, `rating`, `leadTimeDays`, `contractReference`. |
| Assets | `AssetCategory`, `Asset`, `AssetAssignment`, `AssetMaintenance` |
| Documents | `Document`, `DocumentVersion` |
| Support | `SlaPolicy`, `SupportTicket`, `TicketComment`, `TicketStatusHistory`, `TicketTag` |
| Knowledge | `KnowledgeCategory`, `KnowledgeArticle`, `KnowledgeArticleVersion` |
| Other | `Expense.purchaseOrderId` (optional, set at creation); `NotificationCategory` + `OPERATIONS`, `SUPPORT` |

Numbers come from the concurrency-safe `Sequence`:

| Series | Format |
|---|---|
| Purchase requests, purchase orders (yearly) | `PR-2026-000001`, `PO-2026-000001` |
| Assets, documents, tickets, articles | `AST-`, `DOC-`, `TCK-`, `KB-000001` |

### Database guarantees

**CHECK constraints**
- PO lines:
  - quantity > 0;
  - discount ≤ line amount;
  - VAT 0–100;
  - `total = subtotal + tax`;
  - `0 ≤ receivedQuantity ≤ quantity`.
- PO header:
  - `total = subtotal + tax`;
  - issued ⇒ issue date + issuedAt;
  - received ⇒ receivedAt;
  - cancelled ⇒ timestamp + reason;
  - expected delivery ≥ issue date.
- Receipt quantity > 0.
- Request:
  - rejected ⇒ reason;
  - approved and later states ⇒ approvedAt;
  - justification not blank.
- Asset:
  - `ASSIGNED ⇔ assignedEmployeeId`;
  - cost ≥ 0.
- Assignment: returned ⇒ return condition + returner.
- Maintenance: completed ⇒ completion date.
- Document:
  - entity type and id are set together;
  - **PUBLIC_INTERNAL only on unlinked company documents**;
  - archived ⇒ archivedAt;
  - in review ⇒ reviewer.
- Document version: version ≥ 1, size > 0, sha256 format.
- SLA: resolution ≥ response; warn % between 1 and 99.
- Ticket: resolved / closed ⇒ resolvedAt; closed ⇒ closedAt; cancelled ⇒ cancelledAt.
- Article:
  - published ⇒ publishedAt + live version;
  - department / role visibility needs its target.
- Vendor rating is 1–5.

**Partial unique indexes**

| Index | Enforces |
|---|---|
| `AssetAssignment_one_active` | one active assignment per asset |
| `SlaPolicy_one_active_per_priority` | one active SLA policy per priority |
| `Asset_serial_unique` | serial number unique per organization, case-insensitive |
| `VendorContact_one_primary` | one primary contact per vendor |

`DocumentVersion (documentId, versionNumber)` is also unique.

**Triggers**

| Trigger | Error code | Effect |
|---|---|---|
| `po_freeze` | `PO_IMMUTABLE` | Vendor, currency, totals, issue date, terms, number and request link cannot change once issued. Only drafts can be deleted. |
| `po_item_freeze` | `PO_IMMUTABLE` | Lines are frozen once the PO leaves DRAFT (received quantity may only increase). |
| append-only guard on receipts, document versions, knowledge versions, ticket comments, ticket status history | `RECEIPT_IMMUTABLE`, `DOCUMENT_VERSION_IMMUTABLE`, `KNOWLEDGE_VERSION_IMMUTABLE`, `COMMENT_IMMUTABLE`, `HISTORY_IMMUTABLE` | Rows can be added, never changed or deleted |
| `asset_assignment_guard` | `ASSIGNMENT_IMMUTABLE` | Only the return can be recorded, once; rows can never be deleted |

## Procurement

**Request lifecycle:** DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → ORDERING (draft PO) → ORDERED (PO issued) → RECEIVED.
- From review it can also go to REJECTED (reason required). A rejected request can be edited and resubmitted.
- CANCELLED (reason) is possible from draft, rejected, pending or approved, but only when no live PO exists.
- The requester can withdraw a pending request back to draft.
- Request status follows its POs automatically.

**Approval** goes through the **Phase 1 engine** (type `PROCUREMENT`). The tier comes from the first active `ProcurementApprovalRule` (by order) matching amount range, department, project / non-project and category. Defaults are editable; the amounts are company configuration, not policy:

| Order | Rule | Approver |
|---|---|---|
| 10 | Project purchase < 20 000 | Project manager |
| 20 | Small purchase < 5 000 | Line manager |
| 30 | 5 000 – 50 000 | Procurement approver (`procurement.requests.approve`) |
| 40 | ≥ 50 000 | Executive (`procurement.requests.approve_executive`) |

- Manager tiers are routed to that person, who must hold `approvals.decide`.
- If the manager cannot be resolved, or is the requester, the request falls back to procurement approvers. It is never auto-approved.
- The handler re-checks the decider: the routed manager or a procurement approver, and never the requester.

## Purchase orders

**Lifecycle:** DRAFT → PENDING_APPROVAL (Approval `PURCHASE_ORDER`, `procurement.orders.approve`, not the creator) → APPROVED → ISSUED → PARTIALLY_RECEIVED → RECEIVED → CLOSED.

**Approval waiver.** A PO linked to an approved request, in the same currency, whose total is within the approved estimate, is approved without a second approval. The waiver reason is stored and audited.

**Totals** are always recalculated on the server:
1. `subtotal = qty × price − discount`
2. VAT is applied per line at the line's rate (company rate by default).
3. Browser totals are ignored.

**After issue:**
- The PO is frozen (service + triggers).
- Corrections use **revise**: the issued PO is cancelled and a linked draft copy is created (only while nothing has been received).
- Cancel works only before any receipt.
- A partially received order can be short-closed with a reason.

**Receipts** (`PurchaseReceipt` + items, condition GOOD / DAMAGED / INCORRECT):
- Partial receipts are allowed; over-receipt is refused (service + CHECK).
- The receipt date can be neither in the future nor before the issue date.
- The PO becomes RECEIVED only when every line is complete.

## Vendors

The Phase 5 `Vendor` table is reused; there is no second vendor table. Editing the ops profile and contacts needs `finance.vendors.manage` and is audited.

**Metrics** (`vendorPerformance`) are deterministic:
- issued orders;
- ordered value per currency;
- on-time / late (received after the expected date, or still open past it);
- average delay of late completed orders;
- receipt lines with issues.

Archived vendors keep every PO, asset and metric, but take no new POs.

## Assets

- **Register.** `AST-` numbers. Assets are created manually, or from a **received** PO line (never more than the units received, under a row lock), inheriting vendor, unit cost and receipt date.
- **Assign** (`assets.assign`): only from IN_STOCK / IN_USE, to an active employee. The partial unique index blocks a second active assignment even under concurrency (`ASSET_ALREADY_ASSIGNED`).
- **Return:** records the condition (good / worn / damaged → DAMAGED). It carries an optional previous-state check (`ASSIGNMENT_STALE`). History rows are append-only.
- **Status changes** (`assets.manage`) follow an explicit map: in stock ↔ in use → lost / damaged / retired → disposed. They are blocked while assigned or in maintenance.
- **Maintenance:** SCHEDULED → IN_PROGRESS (the asset must be returned first; status MAINTENANCE) → COMPLETED / CANCELLED (the previous status is restored).
  - Cost is informational; **no expense is created**.
  - An expense can be linked later, explicitly.
- **Offboarding.** When an employee is TERMINATED, assets are **not** returned automatically. Asset managers get a deduplicated notification, and the Command Center / operations dashboard show "asset not returned" until the return is recorded.

## Documents

**Storage** (`src/server/ops/storage.ts`):
- `DocumentStorageAdapter`; the local driver writes to `.local/storage/documents` (or `DOCUMENT_STORAGE_DIR`). The directory is git-ignored and never served statically.
- Keys are opaque (`<org>/<yyyy>/<uuid>`), validated against a fixed pattern and written with `wx` (never overwritten). They are never sent to the browser.
- **Phase 8:** an S3-compatible driver (`src/server/ops/s3.ts`, `DOCUMENT_STORAGE=s3`) implements the same interface: SigV4 header auth, `put` refuses to overwrite, sha256 stored as object metadata.
  - `DocumentVersion.storageDriver` records where each version lives, so switching drivers never strands old files. Local files are not migrated.
  - The adapter never decides permissions.

**Upload security**
- Allow-list: pdf, png, jpg / jpeg, webp, docx, xlsx, pptx, txt, csv. No HTML, SVG, scripts, archives or executables.
- 10 MB limit (`DOCUMENT_MAX_BYTES`).
- The extension must agree with the declared MIME type, and the content signature (magic bytes / UTF-8 text) must match.
- File names are sanitised.
- `sha256`, mime, size and original name are stored.
- Multipart route handlers check the session and the Origin / Sec-Fetch-Site headers.
- **Virus scanning.** A `DocumentScanner` hook exists, but **no scanner is installed**, so versions are stored as `NOT_SCANNED` and the UI says "not scanned".

**Download**
- Every request re-authorises.
- The stored hash is re-verified; a mismatch returns 409 and is audited as `document.integrity_failed`.
- Responses carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`, and are `attachment` by default (inline only for PDF / images on request).
- Confidential / restricted downloads are audited (`document.downloaded`).

**Versions.** Each upload is a new immutable `DocumentVersion` (row lock + unique version number). Older versions stay downloadable.

**Access.** The linked record's own security plus a classification tier. There is no broad bypass permission:

| Level | Meaning | Allows |
|---|---|---|
| 1 | can see the record | INTERNAL |
| 2 | manages the record | CONFIDENTIAL |
| 3 | sensitive tier of the record | RESTRICTED |

Per record type:
- **Employee:** HR with view → 1; personal-data rights → 2; compensation / payroll rights → 3; the employee themself → 2. Line managers get nothing.
- **Invoice:** finance view in scope → 1; `finance.records.all` → 2; plus issue → 3.
- **Expense:** owner / finance → 1; finance view → 2; approver → 3.
- **Contract:** contract view in scope → 1; edit → 2; activate → 3.
- **Project:** member → 1; manager → 2; manager with commercial access → 3.
- Clients, quotations, vendors, requests, POs, assets and tickets follow the same pattern.

Rules for unlinked (company) documents and filing:
- Unlinked company documents: PUBLIC_INTERNAL is visible to every employee, INTERNAL needs `documents.view`, and higher tiers need `documents.manage`. Creating one needs `documents.manage`.
- The uploader keeps access **only to unlinked (company) documents**. For entity-linked documents the record's own authorization is authoritative.
  - A former owner who loses access to the record (reassigned, role removed) can no longer see, version or download the document.
  - This is a Phase 8 correction. Before it, uploader ownership overrode the record check, so it could outlive the record access. Regression test: `tests/integrations.test.ts` #24.
- You can only file a document on a record you can see, at a classification you could read. Upload forms only offer allowed tiers.
- Unauthorised access returns "not found", which leaks nothing.

**Search** covers metadata only (title, description, number, tags). Candidates are filtered through the same resolver, so restricted documents never appear in lists or global search.

**Review.** An optional reviewer is set at upload (status IN_REVIEW), notified, and approves. Self-review is blocked.

## Support

**Statuses:** NEW → OPEN / IN_PROGRESS / WAITING_CLIENT / WAITING_INTERNAL → RESOLVED → CLOSED, with CANCELLED. Transitions are explicit (`TICKET_TRANSITIONS`), with stale-state checks.
- Resolving needs a resolution note (stored as a requester-facing note).
- Cancelling and re-opening need a reason.

**Assignment:** assign, reassign and take ownership, all audited. The previous-state check stops two agents taking the same ticket. The assignee must be on the support team.

**SLA** (`SlaPolicy` per priority, editable):
- Due times are **elapsed time** from creation. There is no business-hours calendar (documented limitation).
- Changing priority recalculates due times.
- WAITING_CLIENT pauses the resolution clock only when the policy says so; paused minutes extend the due time.
- **First response** = the first requester-facing note, or the first note by staff other than the creator. Internal notes by the creator do not count.

Defaults:

| Priority | First response | Resolution |
|---|---|---|
| Urgent | 30 min | 4 h |
| High | 1 h | 8 h |
| Medium | 4 h | 24 h |
| Low | 8 h | 72 h |

**Visibility:**
- `support.tickets.manage` → all tickets.
- Otherwise → tickets I created or am assigned, plus (with `support.tickets.view`) tickets of projects I manage.
- Requesters who are not support staff see only requester-facing notes.
- The Client 360 / project tabs apply the ticket scope **and** the record scope. Project membership alone never reveals client tickets.

## Knowledge base

**Workflow:** DRAFT → REVIEW → PUBLISHED, then ARCHIVED.
- Reviewers (`knowledge.review`) can send an article back with a comment.
- Publishers (`knowledge.publish`) publish from REVIEW. An author cannot self-publish without `knowledge.manage`.

**Versioning.** Each publish creates an immutable `KnowledgeArticleVersion`, which becomes the live version. Readers only ever see the live version. Editing a published article changes the working copy (back to DRAFT) while the previous version stays live until the revision is published.

**Visibility:** ALL_EMPLOYEES · DEPARTMENT · ROLE_RESTRICTED (role keys) · SUPPORT_ONLY.

**Ticket integration.** Agents can search the knowledge base manually from the ticket. "Related articles" are published articles tagged with the ticket's category (e.g. `access`, `bug`) or tags. This matching is deterministic.

## Permissions (Phase 7)

**Permission keys**

| Area | Keys |
|---|---|
| Dashboard & settings | `operations.dashboard.view`, `operations.settings.manage` |
| Requests | `procurement.requests.view` (all), `.create`, `.approve`, `.approve_executive` |
| Orders | `procurement.orders.view`, `.create`, `.approve`, `.issue`, `.receive`, `.cancel` |
| Assets | `assets.view`, `.manage`, `.assign`, `.maintenance` |
| Documents | `documents.view` (opens the center only), `.create`, `.version`, `.archive`, `.manage` (company confidential / restricted) |
| Support | `support.tickets.view`, `.create`, `.assign`, `.manage` (all tickets), `support.sla.manage` |
| Knowledge | `knowledge.view`, `.create`, `.review`, `.publish`, `.manage` |

**Migrated keys** (custom roles are migrated automatically; approval rights are never implied):

| Old key | New keys |
|---|---|
| `ops.procurement.manage` | request / order operational keys (no approval) |
| `ops.documents.manage` | `documents.view/create/version/archive` |
| `ops.vendors.manage` | `finance.vendors.view/manage` |

`support.tickets.manage` now also implies `view`, `create` and `assign`.

**Role defaults**

| Role | Operations access |
|---|---|
| Everyone | `procurement.requests.create`, `support.tickets.create`, `knowledge.view`, `documents.view/create` (own requests, own tickets, attachments on records they can see) |
| `operations_manager` (new) | every operations key except the executive procurement tier, plus vendors (finance), client / contact read, project read |
| `support_agent` (new) | tickets (view / create / assign), knowledge create, documents, client / contact read |
| `finance_manager` | requests view / approve / **executive**, PO view / approve, dashboard, assets view, documents |
| `accountant` | request and PO view, documents |
| `hr_manager` | assets view / assign, documents incl. archive |
| `project_manager` | tickets view / assign (own projects; `manage` removed so client tickets are not exposed), PO view, documents |
| `developer` | assigned tickets, documents create |
| `ceo` / `general_manager` | full operational visibility (all keys) |

## Audit, events, notifications, sweep

**Audit.** Every mutation is audited:

| Area | Actions |
|---|---|
| Procurement | `procurement.created/submitted/routed/approved/rejected/withdrawn/cancelled/status_changed` |
| Purchase orders | `po.created/updated/submitted/approved/rejected/issued/received/cancelled/revised/closed` |
| Vendors | `vendor.ops_updated`, `vendor.contact_added/removed` |
| Assets | `asset.created/updated/assigned/returned/status_changed/retired/maintenance_*` |
| Documents | `document.created/version_uploaded/updated/reviewed/archived/downloaded/integrity_failed` |
| Tickets | `ticket.created/assigned/status_changed/priority_changed/first_response/commented/resolved/closed`, `ticket.sla_warning/sla_breached` |
| Knowledge | `knowledge.created/updated/review_requested/returned/published/archived` |
| Settings | `procurement.rule_changed`, `sla.policy_changed`, `asset.category_changed` |

**Events** (DomainEvent):

| Area | Events |
|---|---|
| Procurement | `procurement.requested/approved/rejected` |
| Purchase orders | `purchase_order.approved/issued/received/overdue` |
| Assets | `asset.assigned/returned/warranty_expiring/maintenance_due` |
| Tickets | `ticket.created/assigned/first_response/sla_warning/sla_breached/resolved/closed` |
| Knowledge | `knowledge.review_requested/review_reminder/published` |
| Documents | `document.version_created` |

**Activity feed.** Non-sensitive events appear: request raised, PO issued, ticket created, article published.

**Notifications.** Categories OPERATIONS / SUPPORT, language-aware, with dedupe keys. Recipients:

| Event | Recipient |
|---|---|
| Request approved / rejected | requester |
| PO approved | creator |
| PO overdue | creator + receivers |
| Asset assigned | holder |
| Warranty expiring / maintenance due | asset managers / maintainers |
| Asset return required | asset assigners |
| Urgent ticket | support managers |
| Ticket assigned | assignee |
| SLA warning / breach | assignee (+ managers on breach) |
| Ticket resolved | creator |
| Article awaiting review / reminder | reviewers |
| Article published | author |
| Document awaiting review | reviewer |

**Sweep** (`npm run operations:sweep`):
- Also triggered at most every 5 minutes from the Command Center, `/app/operations` and `/app/support`.
- Guarded by `JobLease` `sweep:ops:{org}`; every signal is claimed once with a conditional update.
- Signals:
  - PO overdue;
  - warranty within the category's alert window;
  - maintenance due;
  - SLA response / resolution warning and breach;
  - articles waiting in review for more than 3 days.

## Phase 8 boundary

Not built:
- general ledger, bank reconciliation, full accounting / supplier payables;
- external client portal;
- email / WhatsApp / website ticket channels;
- calendar or storage cloud integrations (Phase 8 added the S3 driver and the integration registry);
- antivirus scanning (hook only);
- OCR / full-text document search;
- business-hours SLA calendar;
- NOVA internals, autonomous AI.
