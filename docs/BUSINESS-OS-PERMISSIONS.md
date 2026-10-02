# Business OS — Permissions

Source of truth: `src/server/rbac/permissions.ts` (typed catalog + system roles).
Roles and grants are stored per organization and editable in **Administration → Roles & Permissions**; system-role grants are re-synced from code by `npm run os:bootstrap`.

## Enforcement

1. `requirePermission(ctx, key)` at the top of every service function (server-side, cannot be bypassed by the UI).
2. Pages call `pageCtx(key)` and render *Permission denied* when missing.
3. Navigation, Create menu and KPIs are filtered by the same permissions (convenience only — not the security boundary).

## System roles

| Role | Highlights |
|---|---|
| `super_admin` | Everything. Immutable. Only role with `admin.roles.grant_privileged`. |
| `ceo` | Everything except granting privileged roles directly, integrations and employee bank details (`hr.bank.*`). |
| `general_manager` | All business modules; no admin management, no payroll preparation / payment, no compensation management, no sensitive HR or bank data. |
| `finance_manager` | All finance incl. payment reversal, executive expense approval, profitability and cost rates; approves and marks payroll paid from period totals (`hr.payroll.approve/pay`, no employee lines); approves quotations. |
| `accountant` | Invoicing, payments (no reversal), expense approval (normal tier) and payment, vendors, finance dashboard/reports — no margins or cost rates. |
| `sales_manager` | All CRM except archiving clients (record scope ALL) + all quotation actions incl. approve (not executive) + all contract actions + catalog management. |
| `sales_rep` | CRM on own records only (no archive, no reassign) + own quotations end-to-end (cannot approve) + contract drafts from own accepted quotes (no activate/terminate). |
| `project_manager` | All project actions on own + department projects (`projects.records.team`), approves its projects' timesheets, contract read, tickets; approves direct reports' leave. |
| `developer` / `designer` / `marketing` | Projects they are members of: tasks create/edit/status, time create/submit, deliverables view. No commercial data. |
| `marketing` | Campaigns (create / run / spend / consent), marketing reports, WhatsApp inbox + replies + campaign creation (no approval), leads view/create + CRM activities. |
| `hr_manager` | All People permissions (employees incl. sensitive data, compensation, bank, attendance, leave, payroll preparation, recruitment, offers, performance) except payroll approval and payment; departments. |
| `operations_manager` | Procurement (requests + orders incl. approval, not the executive tier), assets, documents, support (all tickets, SLA), knowledge (publish / manage), vendors, client / contact read. |
| `support_agent` | Tickets assigned / created / taken, knowledge authoring, documents on tickets, client / contact read. |
| `line_manager` | Everyone's permissions + approve direct reports' leave, view their attendance, manage their performance reviews. No salary or bank data. |
| `employee` | Dashboard, own approvals, leave request, expense submission; on projects they belong to: view, status of own tasks, own time. |

Privileged roles (grant requires approval unless the actor holds `admin.roles.grant_privileged`): `super_admin`, `ceo`, `finance_manager`, `hr_manager`.

## Catalog

| Group | Keys |
|---|---|
| Command | `dashboard.view`, `dashboard.finance_kpis`, `approvals.view`, `approvals.decide`, `activity.view_all` |
| Admin | `admin.users.view`, `admin.users.manage`, `admin.roles.view`, `admin.roles.manage`, `admin.roles.grant_privileged`, `admin.departments.manage`, `admin.settings.manage`, `admin.audit.view`, `admin.integrations.manage`, `admin.automation.manage` |
| CRM | `crm.leads.view/create/edit/convert/assign/archive`, `crm.opportunities.view/create/edit/move_stage/assign/mark_won/mark_lost`, `crm.clients.view/create/edit/archive`, `crm.contacts.view/create/edit`, `crm.pipeline.view`, `crm.activities.view/create`, scope `crm.records.team`, `crm.records.all` — see [CRM.md](CRM.md#permissions) |
| Sales (Phase 3) | `services.view`, `services.manage`, `sales.quotations.view/create/edit/submit/approve/approve_executive/send/accept/reject/cancel`, `sales.contracts.view/create/edit/activate/terminate` — scope via `crm.records.*`; see [COMMERCIAL.md](COMMERCIAL.md#permissions--scope). Renamed: `sales.services.manage` → `services.manage`, `sales.contracts.manage` → `sales.contracts.create/edit/activate/terminate` (bootstrap re-syncs system roles; custom roles are migrated automatically and audited — see [PROJECTS.md](PROJECTS.md#custom-role-permission-migration)) |
| Delivery (Phase 4) | `projects.view/create/edit/archive/manage_team/change_status/complete/templates.manage`, scope `projects.records.team/all`, `projects.milestones.view/manage`, `projects.tasks.view/create/edit/assign/change_status`, `projects.time.view/create/submit/approve`, `projects.deliverables.view/manage`, `support.tickets.view/manage` — see [PROJECTS.md](PROJECTS.md#permissions). Replaced: `projects.manage`, `tasks.view`, `tasks.manage` (custom roles migrated automatically, audited `rbac.permissions_migrated`) |
| Finance (Phase 5) | `finance.dashboard.view`, `finance.records.all`, `finance.invoices.view/create/edit/issue/send/cancel`, `finance.collections.manage`, `finance.payments.view/create/reverse`, `finance.expenses.view/create/submit/approve/approve_executive/pay`, `finance.vendors.view/manage`, `finance.profitability.view`, `finance.cost_rates.view/manage`, `finance.reports.view`; payroll moved to `hr.payroll.*` in Phase 6 — see [FINANCE.md](FINANCE.md#permissions--scopes). Replaced: `finance.invoices.manage`, `finance.payments.manage` (custom roles migrated automatically) |
| People (Phase 6) | `hr.dashboard.view`, scope `hr.records.department/all`, `hr.employees.view/create/edit/archive/sensitive`, `hr.compensation.view/manage`, `hr.bank.view/manage`, `hr.attendance.view/manage/self`, `hr.leave.view/request/approve/manage`, `hr.payroll.view/prepare/approve/pay`, `hr.recruitment.view/manage`, `hr.offers.approve`, `hr.performance.view/manage` — see [HR.md](HR.md#permissions-phase-6). Replaced: `finance.payroll.view/manage`, `hr.employees.manage` (custom roles migrated automatically) |
| Operations (Phase 7) | `operations.dashboard.view`, `operations.settings.manage`, `procurement.requests.view/create/approve/approve_executive`, `procurement.orders.view/create/approve/issue/receive/cancel`, `assets.view/manage/assign/maintenance`, `documents.view/create/version/archive/manage`, `support.tickets.view/create/assign/manage`, `support.sla.manage`, `knowledge.view/create/review/publish/manage` — see [OPERATIONS.md](OPERATIONS.md#permissions-phase-7). Replaced: `ops.procurement.manage`, `ops.documents.manage`, `ops.vendors.manage` (custom roles migrated automatically) |
| Integrations (Phase 8) | `integrations.view/manage/test/logs.view` — see [INTEGRATIONS.md](INTEGRATIONS.md#permissions). Replaced: `admin.integrations.manage` |
| Marketing & WhatsApp (Phase 8) | `marketing.view/manage/reports.view`, `whatsapp.view/send/manage`, `whatsapp.campaigns.create/approve` — see [MARKETING.md](MARKETING.md#permissions). Replaced: `marketing.campaigns.manage`, `marketing.whatsapp.send` (custom roles migrated automatically) |
| Business rules (Phase 9) | `automation.view/manage`, `automation.executions.view/retry` — see [AUTOMATION.md](AUTOMATION.md#permissions). Replaced: `admin.automation.manage` (custom roles migrated automatically) |
| System operations (Phase 9) | `system.health.view`, `system.jobs.manage`, `system.events.retry`, `system.backups.view` — Super Admin only by default (the CEO gets `system.health.view` + all `automation.*`; the General Manager none) |
| NOVA (external) | `nova.use` — see the NOVA AI link / launch the external platform (all system roles). It grants nothing inside NOVA; NOVA's own login controls that. |

Permissions for unbuilt modules exist now so role design is stable; they grant nothing until the module ships.

## Tested guarantees (`tests/`)

- Employees cannot list users, change settings, read the audit log, view payroll or invoices.
- Sales reps cannot approve quotations.
- Nobody can grant a permission they don't hold; unknown permission keys are rejected; super_admin cannot be edited.
- Requesters cannot approve their own requests; decisions cannot be made twice; rejections need a reason.
- Activity items are hidden from users lacking the item's visibility permission.
- Commercial (`tests/commercial.test.ts`): catalog management needs services.manage; employees see no quotations/contracts/services; reps see only their own; high value / high discount / executive tier require the right approver; self-approval blocked; stale approvals cannot apply; sent and accepted versions are frozen (service + DB); one contract per accepted version; search and KPIs respect scope.
- Finance (`tests/finance.test.ts`): each billing source is invoiced once (also concurrently); approved billable time only, never twice; issued invoices immutable (service + DB); VAT snapshot survives a VAT change; partial / full / multi-invoice payments; overpayment and duplicate submissions refused; reversal recalculates; only authorised users record payments; expenses through the approval engine with tiering, no self-approval, reason on rejection, paid once; vendors archived not deleted; members / CRM users never see cost, margin or cost rates; search and CSV export respect permissions; sweep idempotent with deduplicated notifications.
- Projects (`tests/projects.test.ts`): projects only from active contracts (quotation/internal by policy), one live project per contract even concurrently; non-members see nothing, members never see commercial data; only members can be assigned; invalid task transitions / blocked without reason / stale Kanban moves are refused; time validation and DB freeze; timesheets are approved only by that project's manager, once; completion blockers and audited override; sweep idempotent without duplicate notifications; custom-role permission migration idempotent and never broadening.
- Operations (`tests/ops.test.ts`): procurement routing through the engine (line manager / executive tiers), self and unrelated approval blocked, double decision once; PO server totals, approval waiver only when covered, issue once, issued PO frozen (service + DB), cancel-and-replace; partial receipt, over-receipt refused (service + CHECK + concurrency), receipts immutable; vendor history and metrics kept after archive; assets never exceed received units, one active assignment under concurrency (+ DB), append-only history, terminated-employee signal, maintenance lifecycle without auto-expense; documents: type / content validation, record-inherited access (HR salary file, expense receipt), unauthorised / guessed ids not found, immutable versions, hash mismatch detected, no search leaks, concurrent versions numbered; tickets: SLA due dates, reserved channels, transitions, take-ownership race, first response, resolution, sweep idempotent with deduplicated notifications; Client 360 support scope; knowledge visibility + versioned publishing; dashboard counts, global search scope.
- People (`tests/hr.test.ts`): employee numbering and no-cycle hierarchy (service + DB trigger); managers see their reports but never salary or bank; employees cannot see others' records; personal data and IBAN masked server-side, reveal audited; compensation / bank history immutable (DB); attendance self check-in once, corrections audited, no future records; leave balance, overlap, working-day count, manager routing, no self-approval, cancellation reversal; payroll snapshot calculation, adjustments with reason, stale submit refused, preparer and paid employees cannot approve, paid once, frozen after approval (DB), payslips only for the employee after payment; finance sees totals only; recruitment duplicate candidate, stage transitions, offer approval by another user, conversion exactly once without a user account; sweep idempotent; permission migration.
- CRM (`tests/crm.test.ts`): employees get no CRM data; sales reps cannot see other reps' leads/opportunities/clients in lists, detail, search, KPIs or follow-ups; search terms cannot widen scope; reps cannot reassign; won/lost need their permissions; lost needs a reason; a lead converts exactly once; website leads cannot set internal fields.
