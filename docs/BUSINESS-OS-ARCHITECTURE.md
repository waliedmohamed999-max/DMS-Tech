# Business OS — Architecture

## Layers

```
Browser ──► proxy.ts (optimistic gate: session cookie present? → else /app/login)
        ──► src/app/app/**            Server Components (pages) + Server Actions
               │  pageCtx()/requireCtx()   ← src/lib/os/dal.ts (session → Ctx, cached per request)
               │  runAction()             ← src/lib/os/action.ts (session check, error mapping, revalidate)
               ▼
        src/server/<domain>/*.ts      Business logic. Every function takes an explicit Ctx and
               │                      calls requirePermission() itself. No Next.js imports.
               │  unitOfWork(ctx, fn)  ← src/server/events/bus.ts
               ▼
        Prisma (adapter-pg) ──► PostgreSQL
```

- **Why services take `Ctx` explicitly:** permissions cannot be forgotten by a page, the same rules apply to server actions, future REST/API routes, external-system integrations and tests, and tests run without a browser.
- **`unitOfWork`** runs the change, its audit rows and its domain-event rows in one transaction. Subscribers run after commit; failures are recorded on the event (`FAILED` + error) and surfaced in the Command Center.

## Routing

| Path | Purpose |
|---|---|
| `/`, `/en/**` | Public website (unchanged, next-intl locale routing) |
| `/app/login` | Sign-in (own root layout `src/app/app/layout.tsx`) |
| `/app/**` | Authenticated shell `src/app/app/(shell)/layout.tsx` |
| `/app/crm/**` | CRM (Phase 2) — see [CRM.md](CRM.md) |
| `/app/sales/**` | Phase 3 commercial: services, quotations (+ `/pdf`), contracts (+ `/pdf`) — see [COMMERCIAL.md](COMMERCIAL.md) |
| `/app/nova`, `/app/nova/launch` | External NOVA AI platform: integration status page and audited launch redirect — see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md) |
| `/api/leads` | Public website lead capture → CRM `Lead` (rate-limited, whitelisted schema) |
| `/app/m/[module]` | Honest "planned module" page for modules in later phases |

The OS locale comes from the `OS_LOCALE` cookie (Arabic default) — see `src/i18n/request.ts`.

## Data model (Phase 1, implemented)

`Organization` · `User` · `Role` · `RolePermission` · `UserRole` · `Session` · `RateLimit` · `Department` · `AuditLog` (append-only trigger) · `Activity` · `Notification` · `Approval` · `DomainEvent`.

See `prisma/schema.prisma` and `prisma/migrations/*`.

## Data model (Phase 2, implemented)

`Sequence` (readable IDs) · `Client` · `Contact` · `Lead` · `Pipeline` · `PipelineStage` · `Opportunity` · `CrmActivity` · `CrmNote` · `CrmTag` · `CrmEntityTag` · `SavedView`. Additive migration `20261001005124_phase2_crm` with CHECK constraints and a partial unique index (one primary contact per client). Details: [CRM.md](CRM.md).

## Data model (Phase 3, implemented)

`Service` · `ServicePackage` · `ServicePackageItem` · `Quotation` · `QuotationVersion` · `QuotationItem` · `CommercialDocument` · `Contract` · `ContractMilestone`; `Lead.serviceId` / `Opportunity.serviceId`; 5 organization settings. Additive migrations `…_phase3_commercial` + `…_phase3_freeze_reopen` with CHECKs, partial unique indexes (single accepted version / quotation per opportunity / live contract per version) and freeze triggers. Details: [COMMERCIAL.md](COMMERCIAL.md).

## Data model (Phase 4, implemented)

`Project` · `ProjectMember` · `ProjectMilestone` · `Task` · `Comment` · `TimeEntry` · `TimesheetSubmission` · `ProjectDeliverable` · `ProjectDependency` · `ProjectTemplate` (+ milestones, tasks) · `JobLease`; `Notification.dedupeKey`; 4 organization settings. Additive migration `20261001090000_phase4_projects` with CHECKs, partial unique indexes (one live project per contract / accepted version) and time-entry freeze triggers. Details: [PROJECTS.md](PROJECTS.md).

## Data model (Phase 5, implemented)

`Invoice` · `InvoiceItem` · `InvoiceTimeEntry` · `InvoiceCollectionNote` · `Payment` · `PaymentAllocation` · `Expense` · `ExpenseCategory` · `Vendor` · `UserCostRate`; `CommercialDocument.invoiceId` (`INVOICE_PDF`); 6 organization settings. Additive migration `20261002090000_phase5_finance` with balance/lifecycle CHECKs, partial unique indexes for billing deduplication, and freeze / append-only triggers on invoices, lines, payments, allocations and expenses. Details: [FINANCE.md](FINANCE.md).

## Data model (Phase 6, implemented)

`Employee` · `EmployeeCompensation` · `EmployeeBankAccount` · `AttendancePolicy` · `CompanyHoliday` · `AttendanceRecord` · `LeaveType` · `LeaveLedgerEntry` · `LeaveRequest` · `PayrollComponent` · `PayrollPeriod` · `PayrollEntry` · `PayrollAdjustment` · `JobOpening` · `Candidate` · `Application` · `Interview` · `CandidateEvaluation` · `Offer` · `PerformanceReview` · `PerformanceGoal`; `Department.active`. Additive migration `20261003090000_phase6_people` with CHECKs, partial unique indexes (one open compensation / bank row, one candidate per email, one live offer per application), a manager-cycle trigger, effective-history guards, an append-only leave ledger and payroll freeze triggers. Sensitive data is protected by separate tables + server-side permission checks and masking (not by a single `EmployeeSensitive` table as first proposed). Details: [HR.md](HR.md).

## Data model (Phase 7, implemented)

`ProcurementApprovalRule` · `ProcurementRequest` (+ items) · `PurchaseOrder` (+ items) · `PurchaseReceipt` (+ items) · `VendorContact` (+ Phase 5 `Vendor` ops columns) · `AssetCategory` · `Asset` · `AssetAssignment` · `AssetMaintenance` · `Document` · `DocumentVersion` · `SlaPolicy` · `SupportTicket` · `TicketComment` · `TicketStatusHistory` · `TicketTag` · `KnowledgeCategory` · `KnowledgeArticle` · `KnowledgeArticleVersion`; `Expense.purchaseOrderId`; notification categories OPERATIONS / SUPPORT. Additive migration `20261005090000_phase7_operations` with CHECKs (PO arithmetic, received ≤ ordered, lifecycle timestamps, classification rules), partial unique indexes (one active asset assignment, one active SLA policy per priority, serial per org), PO freeze triggers and append-only guards (receipts, versions, comments, history, assignments). Files live behind `DocumentStorageAdapter` (local private directory; S3 not configured). Details: [OPERATIONS.md](OPERATIONS.md).

## Data model (Phase 8, implemented)

`IntegrationConnection` (+ `IntegrationSecret` AES-GCM, `IntegrationExecution`) · `WebhookEvent` (unique per provider event id) · `IntegrationOutbox` (unique idempotency key, retry / dead letter) · `WhatsAppConversation` · `WhatsAppMessage` (unique provider message id) · `WhatsAppTemplate` · `ContactConsent` (append-only) · `MarketingCampaign` · `CampaignAudience` · `CampaignRecipient` (frozen snapshot) · `CampaignMessage` (one per recipient × version) · `CampaignSpend` (MANUAL / PROVIDER_SYNCED) · `AttributionTouch` (one immutable FIRST per lead); `Organization.campaignApprovalThreshold`; `DocumentVersion.storageDriver`; notification categories INTEGRATIONS / MARKETING.

Migrations `20261006090000_phase8_integrations` and `20261006091000_phase8_recipient_snapshot` are additive. They add:
- CHECKs;
- the partial unique index `AttributionTouch_one_first`;
- append-only triggers for attribution and consent;
- `campaign_freeze` and `campaign_recipient_guard`;
- a back-fill of FIRST touches from Phase 2 capture metadata.

## Data model (Phase 9, implemented)

`AutomationRule` · `AutomationRuleVersion` (immutable, trigger `RULE_VERSION_IMMUTABLE`) · `AutomationExecution`
(unique `(ruleId, domainEventId)`) · `SystemJob` (job registry + heartbeats) · `BackupRecord`; `DomainEvent` gains
attempts / handlersDone / dismissal / `correlationId`, `causationId`, `depth` and the statuses PROCESSING, DEAD_LETTER,
DISMISSED; notification category AUTOMATION. Migration `20261007090000_phase9_reliability` (additive, CHECKs).
Details: [AUTOMATION.md](AUTOMATION.md), [OBSERVABILITY.md](OBSERVABILITY.md).

## Target schema (later phases — proposed)

All tables below carry `organizationId`, `createdAt`, `updatedAt`; soft delete (`deletedAt`) where history references them. Money is `Decimal(14,2)` + `currency`.

| Phase | Models | Key relations |
|---|---|---|
| 2 CRM | **Implemented** (see above). `Attachment` deferred to Phase 7 documents; lead source is an enum, not a table | Lead → (convert) Opportunity + Client/Contact; Opportunity → Client, Stage, owner User; public `/api/leads` writes `Lead` |
| 3 Sales | **Implemented** (see above) | Quotation → Client, Opportunity, items → Service; approvals via `Approval(type=QUOTATION)` using org thresholds; Contract → Quotation |
| 4 Delivery | **Implemented** (see above). Task-to-task dependencies and file attachments deferred | Project → Client, Contract/Quotation version, Service (snapshot); health engine = deterministic rules over milestones/tasks/dependencies/time/activity |
| 5 Finance | **Implemented** (see above). `Subscription` / recurring billing, credit notes and receipts deferred | Invoice → Client, Contract (+ milestone), Quotation version, Project, time entries; Payment → allocations → Invoices; Expense → Category, Vendor, Project, Department, User; approvals via `Approval(type=EXPENSE)` |
| 6 People | **Implemented** (see above). Document uploads, statutory payroll files and calendar sync deferred | Employee → User (optional 1–1), Department, manager Employee; payroll entries snapshot compensation; offers via `Approval(type=OFFER)`, leave via `LEAVE`, payroll via `PAYROLL` |
| 7 Ops | **Implemented** (see above). Supplier payables / GL, client portal, channel integrations, OCR and antivirus deferred | Document → (entityType, entityId) with access resolved from the linked record + classification; tickets → Client / Contact / Project / Service; PO → Vendor, Request, Project; Asset → PO line, Vendor, Employee |
| 8 Growth | **Implemented** (see above). Ads API spend sync, email campaigns, media storage and commerce adapters deferred | WhatsApp via official Business Platform only; outbox + signed webhooks for all external I/O |
| 9 Rules & NOVA data | **Rules implemented** (see above). `AutomationRule`, `AutomationExecution` for deterministic, non-AI business rules only. NOVA data sync tables (e.g. external references, sync cursors) **only** once NOVA publishes an API/webhook spec | rules subscribe to `DomainEvent` types. **No** `AIConversation`/`AIAction`/agent/LLM models — NOVA AI is an external system (see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)) |

## Multi-tenancy decision

`organizationId` is present on every business table and every query is scoped by `ctx.organizationId`. There is **no** tenant routing, per-tenant settings UI or row-level-security policy yet: a single organization (`dms-tech`) is bootstrapped. Adding workspaces later requires an org switcher and membership table (`User` is currently org-scoped by `@@unique([organizationId, email])`). This keeps today simple without blocking SaaS later.

## External systems

**NOVA AI** is a separate DMS Tech platform, not a Business OS module. The only coupling is `src/server/integrations/nova.ts` (config, audited launch, and a `NovaApiAdapter` interface with no implementation). Future data exchange (`lead.created` → NOVA, `nova.lead_generated` → CRM, …) is built only against a real NOVA API/webhook spec. Details: [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md).

## Domain events

Event type naming: `<entity>.<past-tense verb>` — e.g. `user.created`, `approval.requested`, `approval.decided`, `lead.created`, `lead.converted`, `opportunity.stage_changed`, `opportunity.won`, `website.lead_received` (full CRM list in [CRM.md](CRM.md)); `quotation.accepted`, `contract.activated`, `project.created`, `task.blocked`, `project.completed` (full list in [PROJECTS.md](PROJECTS.md)); later `invoice.paid`. Services running without a user (website capture) use `systemCtx` — the actor is stored as `null`. Payloads are sanitized (password hashes / tokens redacted). Subscribers live in `src/server/events/subscribers.ts`.

## Security notes

- Session token: 256-bit random, cookie `__Host-dms_os` (prod), `httpOnly`, `secure`, `sameSite=lax`; DB stores SHA-256 only. 12 h absolute, 2 h idle, revocable, revoked on disable / password reset / password change (other sessions).
- Passwords: Argon2id (m=19 MiB, t=2). Policy ≥10 chars, letters + digits. Temporary passwords force change on first login (pages and actions blocked until changed).
- Login: DB-backed rate limits (30/15 min per IP, 10/15 min per email), lockout after 5 failures for 15 min, constant-time path for unknown emails, every outcome audited.
- Server Actions are treated as public endpoints: every one resolves the session and every service re-checks permissions. Next.js validates the `Origin` header for actions (CSRF).
- Escalation guards: cannot grant permissions you don't hold; super_admin immutable; privileged roles need `admin.roles.grant_privileged` or an approval; no self-approval; no self-disable.
- Audit log: DB trigger rejects UPDATE/DELETE. In production, also revoke `TRUNCATE` on `AuditLog` from the application role (tests use TRUNCATE on the test DB only).
- `/app/**` responses: `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- CRM record scope (ALL/TEAM/OWN) is enforced in every CRM query; scope fragments are `AND`-wrapped so search `OR` clauses cannot widen them. Out-of-scope records return NOT_FOUND.
- Public `/api/leads`: 16 KB body cap, 5 requests / 10 min per IP, whitelisted fields only, honeypot + timing + link/markup spam checks, no internal IDs in responses.
- List pages ignore malformed URL params (fall back to defaults) instead of erroring.
- Commercial integrity is enforced twice: services check state/permission/scope; the database freezes sent/accepted quotation content and active contract terms (triggers), and partial unique indexes make double acceptance / double contracts impossible under concurrency. Totals are computed server-side with decimal arithmetic; browser totals are ignored.
- Finance: finance visibility never follows from CRM or project access (`finance.records.all` or explicit client/project scope with `finance.invoices.view`); cost, margin and cost rates need their own permissions. Issued invoices, payments and allocations are immutable in the database; balances are recomputed under row locks; billing sources are deduplicated by partial unique indexes; payment forms carry an idempotency key. Upstream quotation / contract / project records are only read.
- Delivery: project visibility (ALL/TEAM/OWN + membership) is AND-wrapped into every project/task/milestone/time query; commercial fields are stripped without `sales.contracts.view`/`sales.quotations.view`. Kanban moves are optimistic (`from` status → `TASK_STALE`); daily time limits and timesheet submit use Postgres advisory locks; submitted/approved time is frozen by trigger. Scheduled sweeps take a `JobLease` (one instance at a time) and notifications carry a unique `dedupeKey`.
- PDFs are generated in-process (pdfkit + bundled OFL fonts + bidi layout), no headless browser; sent PDFs are stored append-only with their sha256.
