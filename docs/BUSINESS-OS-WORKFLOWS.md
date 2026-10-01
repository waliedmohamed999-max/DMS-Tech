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

## Planned business flow (Phase 5)

```
Lead ─► Opportunity ─► Quotation ─► (Approval if discount > org.discountApprovalPercent
                                       or total > org.quoteApprovalThreshold)
     ─► Accepted ─► Contract ─► Project ─► Invoice ─► Payment
```
Lead → Opportunity → Quotation → Contract → Project is live (`lead.converted`, `quotation.accepted`, `contract.created`/`contract.activated`). Each remaining arrow will be a service function emitting `quotation.accepted`, `invoice.issued`, `invoice.paid`; deterministic business rules (Phase 9) may subscribe to these events; AI workflows run in the external NOVA AI platform, which could receive selected events only through a real NOVA API ([NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)). The approval engine above is reused unchanged (new handler types `QUOTATION`, `EXPENSE`, `LEAVE`, `PURCHASE_ORDER`, …).
