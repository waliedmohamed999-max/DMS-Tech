# Business OS — Projects & Delivery (Phase 4)

Flow: **active contract → project (commercial snapshot) → template milestones & tasks → team → work (Kanban / My Work) → time → deliverables & client acceptance → completion** — then Phase 5 (finance) may read `project.completed`; no invoice is created here.

> NOVA AI is an external platform. Nothing in this module calls, embeds or imitates it — see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md).

## Routes

| Route | Purpose |
|---|---|
| `/app/projects` | Metrics strip (active, healthy, needs attention, at risk, completed this month, overdue milestones, blocked tasks) · views All / Mine / At risk / Completed · filters · sortable list |
| `/app/projects/new` | Create from an active contract (default) · accepted quotation (policy) · internal (policy). `?contract=` / `?quotation=` preselect |
| `/app/projects/[id]` | Workspace: header (number, client/internal, service, status, health, PM, target, progress) + signals, tabs **Overview · Tasks (board/list + side panel `?task=`) · Milestones · Timeline · Team · Time · Deliverables (+ dependencies) · Activity · Commercial** |
| `/app/projects/templates` | Template list + editor (`projects.templates.manage`) |
| `/app/my-work` | My tasks: overdue · due today · blocked · in review · upcoming, my projects; `?new=task` quick create |
| `/app/timesheets` | Log time, week view, submit per project, timesheets waiting for my approval |
| Contract page | "Create project" (ACTIVE/EXPIRING, no live project, `projects.create`), link to the live project, per-milestone delivery eligibility |
| Quotation page | "Create project" only when policy allows, quote ACCEPTED, no contract and no live project |

## Data model (migration `20261001090000_phase4_projects`, additive)

`Project` · `ProjectMember` · `ProjectMilestone` · `Task` (one subtask level) · `Comment` (polymorphic, `CommentEntity`) · `TimeEntry` · `TimesheetSubmission` · `ProjectDeliverable` · `ProjectDependency` · `ProjectTemplate` / `ProjectTemplateMilestone` / `ProjectTemplateTask` · `JobLease`. `Notification.dedupeKey` + unique `(userId, dedupeKey)`. Organization settings: `projectFromQuotationAllowed` (false), `internalProjectsAllowed` (false), `timesheetMaxDailyMinutes` (720), `projectInactivityDays` (14).

Database guarantees:
- **Partial unique indexes** — one live (non-cancelled) project per contract and per accepted quotation version.
- **CHECKs** — dates ordered (project/milestone/task), progress 0–100, weight 1–100, estimate > 0, minutes 1–1440, CLIENT projects need a client, INTERNAL projects carry no commercial link, COMPLETED ⇒ `completedAt`, BLOCKED ⇒ reason (project, milestone, task), DONE ⇒ `completedAt`, task ≠ own parent, approved time ⇒ approver, rejected time ⇒ reason, accepted deliverable ⇒ decision recorded, resolved dependency ⇒ `resolvedAt`.
- **Triggers** — submitted / approved `TimeEntry` content is immutable and cannot be deleted (`time_entry_freeze`, `time_entry_no_delete_locked`).

Numbers: `PRJ-YYYY-NNNNNN` (yearly) and `TASK-NNNNNN` from the atomic `Sequence` upsert.

## Project creation (`src/server/projects/projects.ts`)

1. **Contract (standard)** — row-locked; must be ACTIVE or EXPIRING (`CONTRACT_NOT_ACTIVE`) and visible in the actor's commercial scope; an existing live project returns `PROJECT_EXISTS:<number>`. Snapshot copied: client, opportunity, quotation + accepted version, service, name, scope, delivery terms, **net budget** and currency. The contract is never modified.
2. **Accepted quotation** — only if `projectFromQuotationAllowed`; otherwise `FORBIDDEN POLICY_PROJECT_REQUIRES_CONTRACT`. If a contract exists for that version → `USE_CONTRACT:<number>` (a contract always wins).
3. **Internal** — only if `internalProjectsAllowed`; no client, no commercial fields (CHECK).

Structure: template (explicit or auto-picked by service), contract milestones (operational copies linked by `contractMilestoneId`, weights from percentages) or empty. The PM is added as `PROJECT_MANAGER` member. Audited `project.created`, event `project.created`, CRM timeline entry on the opportunity/client.

## Templates (`templates.ts`)

Seven defaults are ensured at bootstrap (website, e-commerce, mobile app, AI automation, marketing retainer, branding, custom software), bilingual, with weights, day offsets, task estimates and roles. Applying a template **copies** milestones/tasks into the project (snapshot) — editing a template later never changes running projects. Saving a template replaces its structure (audited `project_template.created/updated`).

## Milestones & progress (`work.ts`, `engine.ts`)

`NOT_STARTED → IN_PROGRESS ⇄ BLOCKED (reason) → COMPLETED` (+ CANCELLED). Completing requires no open tasks (`MILESTONE_HAS_OPEN_TASKS`). Starting work on a task auto-starts its not-started milestone (conditional update, audited with `auto: true`). Due-date changes are audited (`milestone.due_date_changed`).

**Progress** = Σ weight of completed milestones + for every open milestone `weight × done / live tasks`, divided by the total weight of non-cancelled milestones; without milestones, done / live tasks. Stored on the project and recomputed on every change.

## Tasks & Kanban

`BACKLOG → TODO / IN_PROGRESS / CANCELLED`, `TODO → BACKLOG / IN_PROGRESS / BLOCKED / CANCELLED`, `IN_PROGRESS → TODO / REVIEW / BLOCKED / DONE / CANCELLED`, `REVIEW → IN_PROGRESS / DONE / BLOCKED`, `BLOCKED → TODO / IN_PROGRESS`, `DONE → IN_PROGRESS`, `CANCELLED → BACKLOG`. BLOCKED needs a reason; DONE needs subtasks closed. The board persists column and order server-side (`sortOrder` normalised per column); every move sends the `from` status, so a stale board gets `TASK_STALE` instead of overwriting. Assignees must be project members (`ASSIGNEE_NOT_MEMBER`); only the manager (PM / `records.all` / `records.team` in department) reassigns; assignees and managers change status. Starting an overdue task keeps `startDate ≤ dueDate`. Comments: author or manager may edit/delete; no file uploads (secure Files module is future work — links in descriptions meanwhile).

## Team & access (`access.ts`)

Project roles (`PROJECT_MANAGER`, `TECH_LEAD`, `DEVELOPER`, `DESIGNER`, `MARKETING`, `QA`, `ACCOUNT_MANAGER`, `CONTRIBUTOR`, `OBSERVER`) describe delivery work only — **they are not RBAC** and grant no permission. Visibility (`projectWhere`, AND-wrapped so filters never widen it):

| Scope | Sees |
|---|---|
| `projects.records.all` | every project |
| `projects.records.team` | own + projects of their department (project department or PM's department) |
| default (OWN) | projects they manage, created, or are an active member of |
| sales (`crm.opportunities.view` + `crm.clients.view`) | projects of clients in their CRM scope (read) |

**Operational vs commercial**: the Commercial tab, budget, contract and quotation ids are returned only with `sales.contracts.view` or `sales.quotations.view`; members without it see the delivery data and "Commercial details are restricted". Out-of-scope projects return NOT_FOUND.

## Timesheets (`time.ts`)

Manual entries (timer intentionally not built): 1–1440 minutes, not in the future, per-person daily limit `timesheetMaxDailyMinutes` checked under a Postgres advisory lock (`TIME_DAILY_LIMIT`). Submit per project → `TimesheetSubmission` + `Approval(type=TIMESHEET)` through the **Phase 1 engine**, routed to the project manager via `assigneeId` (only that person is notified and sees it as "mine"; required permission `projects.time.approve`; the handler re-checks that the decider manages the project). Approve → entries APPROVED; reject (reason) → entries REJECTED with the reason, editable again; withdraw / cancel → DRAFT. Corrections of approved time: `reopenApprovedEntry` by a manager (not own entries), with reason, audited. The DB freezes submitted/approved entries.

## Deliverables & client dependencies (`delivery.ts`)

Deliverables: `DRAFT → IN_PROGRESS → READY → DELIVERED → ACCEPTED / REJECTED` (+ rework). **Client acceptance is recorded internally** by staff (`recordClientDecision`, explicit confirmation, note) — audited `deliverable.client_accepted/client_rejected` with `recordedById` and `method: manual_record`. There is no client portal or e-signature.

Dependencies (`CONTENT`, `BRAND_ASSETS`, `ACCESS`, `CREDENTIALS`, `DATA`, `APPROVAL`, `FEEDBACK`, `OTHER`; owner side CLIENT / INTERNAL / THIRD_PARTY; critical flag; due date). The project stores `clientDependencyStatus` (NONE / WAITING / OVERDUE). `WAITING_CLIENT` status requires an open client dependency (`NO_OPEN_CLIENT_DEPENDENCY`). Resolving emits `dependency.resolved` with the waiting days.

## Health engine (deterministic, explained)

`computeHealth` returns `HEALTHY / NEEDS_ATTENTION / AT_RISK` plus reasons `{code, severity, cause (internal|client|blocked|schedule), params}` stored on the project and shown in the workspace:

| Code | Rule | Severity |
|---|---|---|
| `MILESTONE_OVERDUE` | open milestone past due | risk if > 7 days late |
| `MILESTONE_BLOCKED` | blocked milestone | attention |
| `TASKS_BLOCKED` | blocked tasks | risk if ≥ 3 |
| `CRITICAL_TASKS_OVERDUE` | HIGH/URGENT tasks overdue | risk if ≥ 3 |
| `TASKS_OVERDUE` | ≥ 3 other overdue tasks | attention |
| `CLIENT_DEPENDENCY_OVERDUE` / `DEPENDENCY_OVERDUE` | open dependency past due | risk if critical and > 7 days |
| `DEPENDENCY_WAITING_LONG` | no due date, waiting > 14 days | attention |
| `TARGET_DATE_PASSED` | open project past target | risk |
| `TARGET_DATE_NEAR` | ≤ 7 days left and progress < 80 % | risk if progress < 50 % |
| `ESTIMATE_OVERRUN` | logged > 1.2 × estimated | attention |
| `NO_RECENT_ACTIVITY` | idle > `projectInactivityDays` | attention |

Client-caused delays are labelled as such, so the team is not blamed for waiting on the client. `project.at_risk` is emitted once per at-risk period (`atRiskNotifiedAt`).

## Status & completion

`DRAFT/PLANNING → ACTIVE ⇄ WAITING_CLIENT / BLOCKED / AT_RISK / ON_HOLD → COMPLETED → ARCHIVED` (+ CANCELLED). Reasons required for BLOCKED, ON_HOLD, CANCELLED and reopening a completed project. Completion is a separate action (`projects.complete`) from ACTIVE / AT_RISK / WAITING_CLIENT: blockers = required milestones not completed, required deliverables not accepted, blocked tasks, open critical dependencies. Completing with blockers needs an **override reason (≥ 10 chars)** and is audited `project.completed_override` with the blocker list. Emits `project.completed` (with `override` and `contractId`). **No invoice, no contract change.**

## Contract ↔ project boundary

Project milestones may link to contract milestones. The contract page shows per contract milestone "Delivered — eligible" when every linked project milestone is completed (`contractMilestoneEligibility`). This is information only: the commercial/financial status of the contract milestone is changed by Sales/Finance — delivery never mutates contracts or quotations.

## Permissions

| Key | Purpose |
|---|---|
| `projects.view` · `create` · `edit` · `archive` · `manage_team` · `change_status` · `complete` · `templates.manage` | project lifecycle |
| `projects.records.team` / `projects.records.all` | visibility scope |
| `projects.milestones.view/manage` | milestones |
| `projects.tasks.view/create/edit/assign/change_status` | tasks |
| `projects.time.view/create/submit/approve` | time |
| `projects.deliverables.view/manage` | deliverables |

Defaults: **project_manager** everything + `records.team` · **developer/designer/marketing** contributor (view, tasks create/edit/status, time create/submit, deliverables view) · **employee** view + task status on own tasks + time · **finance_manager** read + `records.all` + time view · **sales_manager** read · **sales_rep** `projects.view` (client-scope read) · CEO/GM everything. Legacy `projects.manage`, `tasks.view`, `tasks.manage` were replaced — see migration below.

### Custom-role permission migration

`migrateLegacyPermissions` (run by bootstrap, idempotent) maps renamed keys on **custom roles only** (system roles are re-synced from code): `sales.services.manage → services.view + services.manage`, `sales.contracts.manage → sales.contracts.view/create/edit/activate/terminate`, `projects.manage → projects.* lifecycle + milestones + deliverables`, `tasks.view → projects.tasks.view`, `tasks.manage → projects.tasks.view/create/edit/change_status`. Each changed role is audited `rbac.permissions_migrated` (before/after). Nothing broader than the old key is granted (e.g. `tasks.manage` does not become `assign` or `records.*`). No manual step is needed in production.

## Events, audit, notifications, jobs

Events: `project.created/started/status_changed/cancelled/completed/at_risk/member_added/member_removed`, `milestone.created/status_changed/completed/overdue`, `task.created/assigned/status_changed/started/blocked/completed/commented/overdue/due_soon`, `time.submitted/approved/rejected`, `deliverable.created/ready/delivered`, `dependency.created/resolved/overdue`. Audit uses the same names plus `project.updated/manager_changed/dates_changed/completed_override`, `milestone.due_date_changed`, `task.reassigned/archived`, `time.*`, `deliverable.client_accepted/client_rejected`, `project_template.*`.

Notifications (actor never notified): member added → member; task assigned → assignee; task blocked → PM; task overdue / due soon → assignee; milestone overdue → PM; dependency overdue → PM; deliverable ready → PM; project at risk → PM; timesheet → assigned PM only. Each has a `dedupeKey` (entity-based for reminders) written with `skipDuplicates`, so retries and concurrent sweeps never duplicate.

Sweep (`sweep.ts`): `npm run projects:sweep` (scheduler, e.g. every 15 min) and lazily from project pages / Command Center (throttled 5 min per process). Guarded by a DB lease (`JobLease`, 10 min TTL) so only one instance runs it; reminders are claimed with conditional updates (`overdueNotifiedAt IS NULL`…) so a reminder fires once. The commercial sweep now uses the same lease.

## Command Center, attention, search, quick create

KPIs: active projects, projects at risk, my urgent tasks (live). A Projects panel shows the counts and the at-risk / needs-attention projects. Attention: overdue milestones, blocked high-priority tasks, overdue client/other dependencies, idle projects, projects past/near target at risk, deliverables ready for review — all scoped. Global search: projects, tasks, milestones within scope. Create menu: Project, Task (My Work), Milestone (managed projects).

## Known limitations

- No timer, no file attachments (secure Files module later), no client portal / e-signature for deliverable acceptance (recorded by staff).
- Timeline is a read-only CSS bar view (no drag scheduling, no task dependencies graph).
- Workload is per project (open tasks + remaining estimate), not a cross-company capacity planner.
- Sweep reminders run lazily + via `projects:sweep`; without a scheduler they fire on the next project page view.
- Template editing replaces the template structure (templates are not versioned; projects keep their snapshot).

## Finance hand-off (Phase 5)

Finance reads `project.completed`, contract-milestone eligibility and approved billable `TimeEntry` rows ([FINANCE.md](FINANCE.md)); it never changes project or contract state. The workspace has a **Finance** tab (billing status / sources / expenses / margin — each gated by its own finance permission; membership grants nothing). An approved time entry that is on a live invoice cannot be reopened for correction (`TIME_ENTRY_BILLED`) until the invoice is cancelled or voided.
