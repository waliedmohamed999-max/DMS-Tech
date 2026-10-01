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
| `ceo` | Everything except granting privileged roles directly and integrations. |
| `general_manager` | All business modules; no admin management, no payroll management, no sensitive HR data. |
| `finance_manager` | Invoices, payments, expense approval, reports, payroll; approves quotations. |
| `accountant` | Invoices, payments, reports. |
| `sales_manager` | All CRM except archiving clients (record scope ALL) + all quotation actions incl. approve (not executive) + all contract actions + catalog management. |
| `sales_rep` | CRM on own records only (no archive, no reassign) + own quotations end-to-end (cannot approve) + contract drafts from own accepted quotes (no activate/terminate). |
| `project_manager` | All project actions on own + department projects (`projects.records.team`), approves its projects' timesheets, contract read, tickets; approves leave. |
| `developer` / `designer` / `marketing` | Projects they are members of: tasks create/edit/status, time create/submit, deliverables view. No commercial data. |
| `marketing` | Campaigns, WhatsApp campaigns, leads view/create + CRM activities. |
| `hr_manager` | Employees incl. sensitive data, leave approval, recruitment, payroll view. |
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
| Finance | `finance.invoices.view/manage`, `finance.payments.manage`, `finance.expenses.submit/approve`, `finance.reports.view`, `finance.payroll.view/manage` |
| People | `hr.employees.view/manage/sensitive`, `hr.leave.request/approve`, `hr.recruitment.manage` |
| Marketing / Ops | `marketing.campaigns.manage`, `marketing.whatsapp.send`, `ops.vendors.manage`, `ops.procurement.manage`, `ops.documents.manage` |
| NOVA (external) | `nova.use` — see the NOVA AI link / launch the external platform (all system roles). It grants nothing inside NOVA; NOVA's own login controls that. |

Permissions for unbuilt modules exist now so role design is stable; they grant nothing until the module ships.

## Tested guarantees (`tests/`)

- Employees cannot list users, change settings, read the audit log, view payroll or invoices.
- Sales reps cannot approve quotations.
- Nobody can grant a permission they don't hold; unknown permission keys are rejected; super_admin cannot be edited.
- Requesters cannot approve their own requests; decisions cannot be made twice; rejections need a reason.
- Activity items are hidden from users lacking the item's visibility permission.
- Commercial (`tests/commercial.test.ts`): catalog management needs services.manage; employees see no quotations/contracts/services; reps see only their own; high value / high discount / executive tier require the right approver; self-approval blocked; stale approvals cannot apply; sent and accepted versions are frozen (service + DB); one contract per accepted version; search and KPIs respect scope.
- Projects (`tests/projects.test.ts`): projects only from active contracts (quotation/internal by policy), one live project per contract even concurrently; non-members see nothing, members never see commercial data; only members can be assigned; invalid task transitions / blocked without reason / stale Kanban moves are refused; time validation and DB freeze; timesheets are approved only by that project's manager, once; completion blockers and audited override; sweep idempotent without duplicate notifications; custom-role permission migration idempotent and never broadening.
- CRM (`tests/crm.test.ts`): employees get no CRM data; sales reps cannot see other reps' leads/opportunities/clients in lists, detail, search, KPIs or follow-ups; search terms cannot widen scope; reps cannot reassign; won/lost need their permissions; lost needs a reason; a lead converts exactly once; website leads cannot set internal fields.
