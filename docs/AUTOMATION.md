# Business rules — deterministic automation (Phase 9)

A rule is **Trigger → Conditions → Actions**. It is not AI: there is no LLM, no agent, no free-form code and no
autonomous decision. NOVA remains an external platform (see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)).

Code: `src/server/automation/` (`catalog.ts`, `conditions.ts`, `actions.ts`, `engine.ts`). UI: `/app/automation`.

## Model

| Table | Purpose |
|---|---|
| `AutomationRule` | name, description, `enabled`, `triggerEvent`, `conditions` (JSON tree), `actions` (JSON list), `scope` (ORGANIZATION), `priority`, `version`, `runAsUserId`, created/updated by + at |
| `AutomationRuleVersion` | immutable snapshot per version (trigger, conditions, actions, run-as user). DB trigger `RULE_VERSION_IMMUTABLE` |
| `AutomationExecution` | rule + version + domain event + entity, status `PENDING / RUNNING / SUCCEEDED / FAILED / SKIPPED / DEAD_LETTER / DISMISSED`, attempts, the evaluated input, per-action results, error, timings |

## Triggers

Only **existing** domain events — there is no parallel event system. The catalog (`TRIGGERS`) maps each trigger to the
entity it concerns:

| Entity | Triggers |
|---|---|
| Lead | `lead.created`, `lead.assigned`, `lead.converted` |
| Opportunity | `opportunity.created`, `opportunity.stage_changed`, `opportunity.won`, `opportunity.lost` |
| Quotation | `quotation.accepted`, `quotation.expiring`, `quotation.rejected_by_client` |
| Contract | `contract.expiring`, `contract.expired` |
| Project | `project.at_risk`, `project.completed`, `project.started` |
| Invoice | `invoice.issued`, `invoice.overdue`, `invoice.due_soon`, `invoice.paid` |
| Expense | `expense.submitted`, `expense.approved` |
| Leave / employee | `leave.approved`, `employee.terminated` |
| Purchase order | `purchase_order.overdue`, `purchase_order.issued` |
| Ticket | `ticket.created`, `ticket.sla_warning`, `ticket.sla_breached` |
| Campaign | `campaign.completed`, `campaign.failed` |
| Integration | `integration.failed`, `integration.dead_letter` |

## Conditions

```json
{ "all": [ { "field": "invoice.balanceDue", "op": "gt", "value": 0 },
           { "any": [ { "field": "client.country", "op": "eq", "value": "SA" },
                      { "field": "invoice.daysOverdue", "op": "gte", "value": 30 } ] } ] }
```

- Groups: `all` (AND) and `any` (OR), nested at most 3 levels, at most 20 leaves. An empty `{ "all": [] }` always matches.
- Fields: only the catalog fields of the trigger's entity (e.g. `invoice.balanceDue`, `invoice.daysOverdue`,
  `project.health`, `opportunity.value`, `client.country`, `expense.amount`, `contract.daysUntilExpiry`,
  `employee.activeAssets`). Unknown fields, unknown keys, wrong value types and unknown enum options are rejected
  when the rule is saved (`CONDITION_INVALID:*`).
- Operators by type: number `eq neq gt gte lt lte is_set is_empty`; string `eq neq in not_in contains is_set is_empty`;
  enum `eq neq in not_in is_set is_empty`; boolean `eq neq`.
- Values are read from the **current database state** of the record when the execution runs (not from the event
  payload); the values used are stored on the execution (`input`) for audit.
- A missing value never satisfies a comparison (except `is_empty`, `neq`, `not_in`).

## Actions

| Action | What it does | Reuses |
|---|---|---|
| `notify` | Notification (category AUTOMATION) to the record owner, every holder of a permission, or one user; MEDIUM / HIGH / URGENT (HIGH and URGENT appear in the Command Center attention list) | notification store, dedupe key per execution + action |
| `activity` | Activity-feed entry (optional visibility permission) | activity feed, deterministic id |
| `follow_up` | Lead / opportunity: sets the follow-up date; other records: FOLLOW_UP entry on the client's CRM timeline | `setLeadFollowUp`, `updateOpportunity`, `logActivity` |
| `project_task` | Task in the project (project triggers only) | `createTask` (membership / closed-project rules apply) |
| `assign_owner` | Lead / opportunity owner | `updateLead`, `updateOpportunity` (assign permissions apply) |
| `outbound_webhook` | Signed delivery to a CONNECTED outbound (CUSTOM) connection | integration outbox (`automation:<execution>:<i>` idempotency key) |

**Run-as.** Actions run with the **current** permissions of the user who last saved the rule (`runAsUserId`)
**minus** every high-risk permission (`AUTOMATION_DENIED_PERMISSIONS`: approvals, payments, payroll, compensation,
bank data, contract activation / termination, invoice issue / cancel, campaign creation / approval / sending, PO
issue / approval, integration / rule / user / role management). An inactive run-as user stops the rule
(`RUN_AS_USER_INACTIVE` → dead letter until someone re-saves the rule or reactivates the user).

**High-risk actions are not automatable** — `approve_quotation`, `approve_expense`, `decide_approval`, `pay_invoice`,
`record_payment`, `issue_invoice`, `mark_payroll_paid`, `approve_payroll`, `change_salary`, `delete_client`,
`archive_client`, `terminate_employee`, `send_campaign`, `start_campaign`, `issue_contract`, `activate_contract`,
`terminate_contract`, `issue_purchase_order`, `grant_role` are rejected with `HIGH_RISK_ACTION`. Creating an approval
request from automation is **not offered** in this build (it would bypass the requester's own context).

## Execution

```
domain event committed → dispatcher → "automation" handler
  for each ENABLED rule of the trigger (priority ↑, createdAt ↑, id ↑):
    INSERT AutomationExecution (ruleId, domainEventId) ON CONFLICT DO NOTHING      ← idempotency
    claim (PENDING|FAILED → RUNNING, conditional update)                         ← multi-worker safe
    load entity → evaluate conditions → SKIPPED (CONDITIONS_NOT_MET) | run actions in order
    first failing action stops the run → FAILED (retry with backoff 30 s · 2^n) | DEAD_LETTER
```

- **Idempotency.** `@@unique([ruleId, domainEventId])`: a re-dispatched or redelivered event never runs a rule
  twice. A retried execution skips actions already completed (`actionResults`); notification / activity / outbox /
  task actions carry their own idempotency keys. A retry may re-run an action that crashed half-way only where the
  target is itself idempotent (follow-up dates, owner assignment).
- **Versioning.** Every change of trigger, conditions, actions or run-as user creates a new immutable version; renames
  / description / order do not. Executions are pinned to the version that was current when they were created
  (retries use the same snapshot); history keeps its meaning.
- **Recursion.** Events written by an action carry `causationId` = the triggering event, the same `correlationId` and
  `depth + 1`. A rule never runs twice in one correlation chain (`RECURSION_CYCLE`: A → B → A stops at the second A),
  and nothing runs at depth ≥ `MAX_DEPTH` = 3 (`RECURSION_DEPTH`). Both cases are recorded as SKIPPED executions.
- **Conflicts.** Rules of one trigger run in a deterministic order (priority, then creation time, then id). Two enabled
  rules that both assign an owner on the same trigger are rejected (`RULE_CONFLICT`) — the system never lets two owner
  assignments race.
- **Retries / dead letters.** The worker (`system:automation`) retries due executions and recovers runs stuck in
  RUNNING > 10 min. Non-retryable failures (forbidden, validation, not found, inactive run-as user) and exhausted
  attempts become DEAD_LETTER and notify holders of `automation.executions.retry` (`automation.execution_failed`).
  Operators retry (one more attempt, audited `automation.execution_retried`) or dismiss with a reason (audited).

## Templates (always created disabled)

| Template | Trigger → action | Relation to built-in logic |
|---|---|---|
| Invoice overdue → notify finance | `invoice.overdue`, balance > 0 → notify `finance.collections.manage` | The built-in finance notification (owner / collectors) stays canonical; the template only adds recipients |
| Project at risk → notify PM | `project.at_risk` → URGENT notify owner | Adds an attention item on top of the existing at-risk notification |
| Contract expiring → follow-up | `contract.expiring`, ≤ 30 days → FOLLOW_UP on the client timeline | New behaviour (no built-in follow-up) |
| Terminated employee with assets → notify operations | `employee.terminated`, active assets > 0 → notify `assets.assign` | The Phase 7 offboarding notice stays canonical |
| Ticket SLA breached → notify support manager | `ticket.sla_breached` → URGENT notify `support.tickets.manage` | Adds escalation to support managers |

**Ownership:** sweeps and subscribers from Phases 2–8 remain the canonical mechanism for their notifications; they were
not migrated into rules (no behaviour change, no double ownership). Rules add organization-specific routing on top.

## Permissions

| Key | Grants |
|---|---|
| `automation.view` | Rules list and definitions |
| `automation.manage` | Create / edit / enable / disable rules, create from templates |
| `automation.executions.view` | Execution history |
| `automation.executions.retry` | Retry / dismiss failed executions; receives failure notifications |

Super Admin and CEO hold all four; the General Manager none. The former placeholder `admin.automation.manage` is
migrated automatically to the four keys.

## Audit

`automation.created`, `automation.updated` (before / after definition), `automation.enabled`, `automation.disabled`,
`automation.execution_retried`, `automation.execution_dismissed`.
