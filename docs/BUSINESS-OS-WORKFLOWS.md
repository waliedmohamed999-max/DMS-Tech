# Business OS — Workflows

## Implemented (Phase 1)

### Sign-in
1. `/app/login` → `loginAction` → `auth.login()` (rate limit → lookup → lock/disabled checks → Argon2 verify).
2. Success: session row (hash of token) + `httpOnly` cookie, audit `auth.login`. Failure: audited (`auth.login_failed`, `auth.account_locked`, …).
3. Users created by an admin get a temporary password and must change it before using anything (`/app/me`).

### Privileged role grant (approval workflow)
```
Delegated admin assigns Finance Manager ─► UserRole NOT created
        │                                    Approval(type=ROLE_GRANT, requiredPermission=admin.roles.grant_privileged, HIGH)
        │                                    audit approval.requested · event approval.requested
        ▼
Notification to every user holding approvals.decide + admin.roles.grant_privileged (except requester)
Command Center → "Needs your attention" shows it with Approve / Reject
        │
Approve ─► handler ROLE_GRANT applies UserRole in the same transaction
           audit approval.approved + user.role_granted_via_approval
           requester notified · user notified "roles updated" · activity feed entry
Reject  ─► reason required · requester notified · nothing applied
```
Guards: no self-approval, single decision (optimistic lock), requester may withdraw while pending.

### User lifecycle
Create (temp password, roles) → edit profile → change roles → disable (sessions revoked) / enable → reset password (sessions revoked, new temp password). Every step audited; privileged users can only be changed by holders of `admin.roles.grant_privileged`.

### Notifications & activity
Domain events feed both. Notifications are per user (read/unread, deep links, categories). Activity is company-wide, filtered by each item's `visibility` permission.

## Implemented (Phase 2 — CRM)

Details and rules: [CRM.md](CRM.md).

- **Website lead:** public form → `/api/leads` → spam/rate checks → duplicate check → new Lead (or appended to the open duplicate) → notification to owner / CRM-all users.
- **Lead:** create (manual, quick-create, website) → follow-ups & activities → qualify → convert (client + contact + opportunity in one transaction) or mark lost with reason (reopenable).
- **Opportunity:** pipeline Kanban / stage stepper → Won (confirmation, client becomes ACTIVE) or Lost (reason required); reopen needs the matching permission.
- **Client 360:** contacts, deals, aggregated timeline (incl. converted lead history), notes; later-phase tabs labelled with their phase.

### NOVA AI launch (external system)
Sidebar **NOVA AI** → `/app/nova` (status) or topbar **Open NOVA** → `/app/nova/launch` → permission check + audit `integration.nova_launched` → redirect to the external NOVA platform, where the user signs in with NOVA's own login.

## Implemented (Phase 3 — Commercial)

Details: [COMMERCIAL.md](COMMERCIAL.md).

- **Quotation:** opportunity / client → builder (catalog services, packages, custom lines; server-calculated VAT and discounts) → submit → auto-approved within policy, or `Approval(type=QUOTATION)` with a frozen snapshot → approved → PDF → recorded as sent (stored PDF + sha256) → client accepted (optionally opportunity → Won) or rejected (reason) or expired (server sweep) → revision (V2, previous superseded) or duplicate (new number).
- **Contract:** accepted quotation → contract (exact version, copied values) → milestones → internal review → awaiting signature → activated (signed copy received offline) → expiring / expired (sweep) or terminated (reason).
- **Catalog:** services and packages with snapshot semantics; default DMS services seeded at bootstrap; legacy Phase 2 service keys mapped by exact key.

## Implemented (Phase 4 — Delivery)

Details: [PROJECTS.md](PROJECTS.md).

- **Project:** active contract → "Create project" (snapshot of client, scope, terms, budget; template or contract milestones) → PM adds team → ACTIVE → WAITING_CLIENT (needs an open client dependency) / BLOCKED / ON_HOLD (reasons) → complete (blockers checked; override with reason, audited) → `project.completed`. No invoice is created.
- **Work:** tasks assigned to members → My Work → BACKLOG/TODO → IN_PROGRESS (auto-starts the milestone) → REVIEW → DONE; BLOCKED with reason notifies the PM; milestones complete when their tasks are closed; progress/health recomputed on every change and by the sweep.
- **Time:** log time (daily limit) → submit per project → `Approval(type=TIMESHEET)` routed to the PM → approve (locked) / reject with reason (editable again).
- **Deliverables:** draft → ready (PM notified) → delivered → client acceptance recorded by staff (confirmation + note, audited).

## Implemented (Phase 5 — Finance)

Details: [FINANCE.md](FINANCE.md).

- **Billing:** eligible source (due/delivered contract milestone, contract without milestones, accepted quotation without contract, completed project, approved billable time) → explicit "Create invoice" (DRAFT) → edit → issue (number, snapshots, stored PDF) → mark sent (manual) → payments (partial → PAID; overdue by sweep) → collection notes / reminders (manual). Corrections: void (+ replacement draft).
- **Payments:** record against one client's open invoices (fully allocated, idempotent) → invoice balances recomputed → reversal with reason if wrong.
- **Expenses:** create → submit → `Approval(type=EXPENSE)` (executive tier above threshold) → approved / rejected (reason) → paid once.
- **Profitability:** billed (net) − approved project expenses − costed approved time = operational margin estimate.

## Implemented (Phase 6 — People)

Details: [HR.md](HR.md).

- **Employee:** HR creates the record (optionally linked to a user) → manager / department → effective-dated compensation and bank account (masked) → status changes (termination needs date + reason, reports reassigned first) → optional explicit system account.
- **Attendance:** self check-in / out (late by policy) or HR manual record / audited correction → sweep marks missing working days.
- **Leave:** request (working days, balance incl. pending) → `Approval(type=LEAVE)` to the direct manager (fallback HR; optional HR second stage) → approved (ledger usage + ON_LEAVE attendance) / rejected (reason) → cancel (reversal).
- **Payroll:** period → calculate (compensation snapshot, proration, adjustments) → bonuses / deductions with reasons → recalculate → submit → `Approval(type=PAYROLL)` (not the preparer, not anyone paid in it) → mark paid by finance (totals) → payslips → close.
- **Hiring:** job (open) → candidate + application → stages → interviews (stored schedule) → evaluations (human) → offer → `Approval(type=OFFER)` → given → accepted (recorded) → convert to employee once (no automatic account).

## Implemented (Phase 7 — Operations)

Details: [OPERATIONS.md](OPERATIONS.md).

- **Procurement:** request (items, justification) → submit → rule-based `Approval(type=PROCUREMENT)` (line manager / project manager / procurement / executive) → approved → PO (from the request; waived approval when covered, else `Approval(type=PURCHASE_ORDER)`) → issue (frozen) → partial / full receipts → close; corrections by cancel-and-replace. No payment or payable is created; the supplier expense goes through the Phase 5 expense approval, linked to the PO.
- **Assets:** register (manual or from received PO units) → assign → return (condition) → maintenance (asset out of service) → retire / dispose; terminated employees holding assets raise an attention item and notification.
- **Documents:** upload (validated, hashed, private storage) on a record → optional reviewer → new versions (immutable) → archive; downloads re-authorised and hash-checked.
- **Support:** ticket (manual channels) → assign / take → work (internal notes, requester-facing notes) → resolve (resolution note) → close; SLA warning / breach by the sweep.
- **Knowledge:** draft → review → publish (immutable version) → revise (live version stays) → republish / archive.

## Implemented (Phase 8 — Integrations & marketing)

Details: [INTEGRATIONS.md](INTEGRATIONS.md), [MARKETING.md](MARKETING.md).

- **Connect a provider:** configure (settings plus write-only secrets) → CONFIGURED → test (real provider call) → CONNECTED / DEGRADED / ERROR. Disable / enable is audited; the worker re-checks health every 30 minutes.
- **Inbound webhook:** signature → schema → dedupe (advisory lock) → process in one transaction → PROCESSED / IGNORED. Duplicates only bump a counter; FAILED events are reprocessed on redelivery.
- **Outbound work:** business transaction enqueues (idempotency key) → worker claims (SKIP LOCKED) → provider call outside the transaction → SUCCEEDED / retry with backoff / DEAD_LETTER → operator retry or dismiss.
- **WhatsApp inbox:** inbound message → conversation (MATCHED / AMBIGUOUS / UNMATCHED; never merged) → operator links, creates a lead (source WhatsApp, campaign-attributed if it replied), creates a ticket (once) or adds a CRM note → reply (free text inside 24 h, else an approved template) through the outbox.
- **Campaign:** draft → audience → submit (approval over the threshold, bound to the version) → ready → start (consent-filtered, frozen recipient snapshot) → worker sends at the rate limit → receipts / replies → completed. An edit after approval makes it stale.
- **Attribution:** lead creation writes the immutable FIRST touch; later contacts append TOUCH rows; the funnel follows lead → opportunity → quotation / contract → issued invoice (billed) → allocation (collected).

## Implemented (Phase 9 — Business rules & operations)

Details: [AUTOMATION.md](AUTOMATION.md), [OBSERVABILITY.md](OBSERVABILITY.md), [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

- **Rule:** create (always disabled) → review → enable (audited, conflict check) → event → execution (idempotent per rule + event) → conditions → actions as the run-as user (minus high-risk permissions) → SUCCEEDED / SKIPPED / FAILED (retry) / DEAD_LETTER (operator retry or dismiss with reason). Edits create a new version.
- **Failed event:** handler fails → FAILED (successful handlers recorded) → automatic retries with backoff → DEAD_LETTER after 5 → operator retry / dismiss (audited).
- **Backup:** `db:backup` → `db:verify-backup` (real restore into a temp database) → alerts on staleness / failure → restore runbook (operator, never a button).
- **Deploy:** backup → preflight → migrate → bootstrap → start → verify + smoke.

## Business flow

```
Lead ─► Opportunity ─► Quotation ─► (Approval if discount > org.discountApprovalPercent
                                       or total > org.quoteApprovalThreshold)
     ─► Accepted ─► Contract ─► Project ─► Invoice ─► Payment
```
Lead → Opportunity → Quotation → Contract → Project → Invoice → Payment is live (billing is always an explicit finance action) (`lead.converted`, `quotation.accepted`, `contract.created`/`contract.activated`). Each remaining arrow will be a service function emitting `quotation.accepted`, `invoice.issued`, `invoice.paid`; deterministic business rules (Phase 9) may subscribe to these events; AI workflows run in the external NOVA AI platform, which could receive selected events only through a real NOVA API ([NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)). The approval engine above is reused unchanged (new handler types `QUOTATION`, `EXPENSE`, `LEAVE`, `PURCHASE_ORDER`, …).
