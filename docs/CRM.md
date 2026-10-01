# Business OS — CRM & Sales Pipeline (Phase 2)

Lead capture → qualification → conversion → opportunity pipeline → won/lost, with a Client 360 profile.
Everything below is implemented in `src/server/crm/*` (services), `src/lib/os/crm-actions.ts` (server actions)
and `src/app/app/(shell)/crm/**` (pages). Quotations and contracts are **Phase 3** and appear only as "planned".

## Routes

| Path | Page |
|---|---|
| `/app/crm` | Overview: KPIs, lead sources, opportunities by stage, pipeline value by stage, attention list (period 7/30/90 days) |
| `/app/crm/leads`, `/app/crm/leads/[id]` | Lead list (filters, sort, saved views, pagination) and record (overview / activity / notes) |
| `/app/crm/opportunities`, `/app/crm/opportunities/[id]` | Opportunity list and record (stage stepper, activity, notes, quotations + contracts tabs — Phase 3) |
| `/app/crm/pipeline` | Kanban over DB stages (drag & drop on desktop, "Move to" menu on mobile) |
| `/app/crm/follow-ups` | Overdue / today / upcoming, mine or all, call & WhatsApp shortcuts |
| `/app/crm/clients`, `/app/crm/clients/[id]` | Client list and Client 360 (overview, contacts, sales, quotations, contracts, activity, notes; files = planned; projects/finance/support tabs labelled with their phase) |
| `/app/crm/contacts` | Contacts across clients |

Quick create: `?new=1` on the leads / clients / contacts / opportunities pages opens the create form (used by the Create menu and Command Center).

## Data model

Migration `prisma/migrations/20261001005124_phase2_crm` (additive only — no Phase 1 table changed).

| Model | Notes |
|---|---|
| `Sequence` | Per-org counters for readable IDs. `LEAD-000001`, `OPP-000001`, `CLI-000001` via one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the caller's transaction — concurrency-safe (tested with 25 parallel transactions). |
| `Client` | `type` COMPANY/INDIVIDUAL, `status` PROSPECT/ACTIVE/INACTIVE/ARCHIVED, owner, normalized email/phone, tax/CR numbers, soft delete. |
| `Contact` | Belongs to a client (optional). Partial unique index `Contact_one_primary_per_client` = at most one primary contact per client. |
| `Lead` | `status` OPEN/QUALIFIED/CONVERTED/LOST/ARCHIVED + sales `stage`, source, service category, budget min/max (`Decimal(14,2)`), owner, next follow-up, `captureMeta` (form, UTM, referrer, page, IP), `duplicateOfId`, conversion links. |
| `Pipeline`, `PipelineStage` | Stages live in the DB (default: new, contacted, qualified, discovery, proposal, negotiation, won, lost) with default probability and `isWonStage` / `isLostStage`. Created idempotently by `ensureDefaultPipeline` at bootstrap. |
| `Opportunity` | Client, primary contact, `sourceLeadId` (**unique** — a lead converts at most once), value `Decimal(14,2)` + currency, probability, stage, status OPEN/WON/LOST/ARCHIVED, won/lost timestamps, lost reason, `stageChangedAt`, `lastActivityAt`. |
| `CrmActivity` | Timeline entries (call, email, WhatsApp, meeting, note, task, follow-up, status change, system). `isSystem` marks entries written by services; `clientId` lets a client timeline aggregate its leads/opportunities. |
| `CrmNote` | Author-editable notes, soft delete. |
| `CrmTag`, `CrmEntityTag` | Tags on any CRM entity. |
| `SavedView` | Per-user saved list filters (whitelisted params, max 12 per module). |

DB-level guarantees (raw SQL in the migration): probability 0–100, value ≥ 0, budgets non-negative and min ≤ max, a LOST opportunity must have a lost reason, stage probability 0–100.

Money: every amount is `Decimal(14,2)` with a `currency` column. **Totals (KPIs, charts, pipeline column sums) are SAR only** — opportunities in another currency are counted but not summed, and the UI says so. There is no FX conversion in Phase 2.

## Permissions

| Key | Grants |
|---|---|
| `crm.leads.view/create/edit/convert/assign/archive` | Leads; `edit` also covers qualify / mark lost / reopen; `convert` additionally needs `crm.opportunities.create` (+ `crm.clients.create` / `crm.contacts.create` when creating those) |
| `crm.opportunities.view/create/edit/move_stage/assign/mark_won/mark_lost` | Opportunities. Moving into Won/Lost — or reopening out of them — needs the matching `mark_*` key |
| `crm.clients.view/create/edit/archive`, `crm.contacts.view/create/edit` | Clients & contacts. Archiving a client with open opportunities is refused |
| `crm.pipeline.view` | Kanban board |
| `crm.activities.view/create` | Timelines, logging activities, notes, tags |
| `crm.records.team`, `crm.records.all` | Record scope (below) |

Role grants: **sales_manager** — all CRM except `crm.clients.archive` (scope ALL). **sales_rep** — all CRM except archive/assign and the `crm.records.*` keys (scope OWN, cannot reassign). **finance_manager / accountant / project_manager** — clients & contacts view, scope ALL. **marketing** — leads view/create + activities (scope OWN). **employee** — no CRM access. Super admin / CEO / GM inherit everything per Phase 1.

### Record scope (ALL / TEAM / OWN)

- `crm.records.all` → every record in the organization.
- `crm.records.team` → records owned by anyone in my department, plus records I created.
- neither → records I own or created.
- Clients are visible when owned/created in scope **or** linked to an opportunity in scope.
- Scope is applied inside every list / get / search / KPI / chart / follow-up query in `src/server/crm/*` — never only in the UI. A record outside scope returns NOT_FOUND (no existence leak).
- Scope fragments are always wrapped in `AND: [...]` so a search `OR` can never overwrite them (regression-tested).
- **Limitation:** unassigned records (e.g. fresh website leads) are visible only to ALL scope. TEAM is department-based; there is no separate "sales team" entity yet.

## Lead lifecycle

```
OPEN ──qualify──► QUALIFIED ──convert──► CONVERTED   (terminal)
  │                   │
  └──mark lost (reason ≥ 3 chars)──► LOST ──reopen──► OPEN
OPEN / QUALIFIED / LOST ──archive──► ARCHIVED
```
Invalid transitions return `LEAD_INVALID_TRANSITION`. Each transition locks the row (`SELECT … FOR UPDATE`), writes a STATUS_CHANGE system activity, an audit row and a domain event in one transaction.

### Conversion (one transaction)

`convertLead` requires status QUALIFIED. Inside one `unitOfWork`:
1. lock the lead; refuse if already CONVERTED (`LEAD_ALREADY_CONVERTED`);
2. client — create a new one (`CLI-…`, status PROSPECT, data copied from the lead) **or** link an existing, non-archived client;
3. contact — create from the lead (primary if the client has none), link an existing contact of that client, or none;
4. opportunity — `OPP-…`, `sourceLeadId` = lead, stage = chosen open stage (default "qualified"), value = entered value, else lead budget max, else min, else 0;
5. lead → CONVERTED with links; the lead's activities and notes get the client id so they appear on the Client 360 timeline;
6. audits `client.created`, `contact.created`, `opportunity.created`, `lead.converted` + matching events.

Any failure rolls back everything. The unique `Opportunity.sourceLeadId` is a second guard against double conversion under concurrency (tested).

## Pipeline rules

- Stages come from the DB; the board shows OPEN deals plus WON/LOST from the last 30 days.
- A drop calls the server (`moveOpportunityStage`): permission, stage-in-pipeline check, row lock, update, audit `opportunity.stage_changed`, event, system activity — then the board re-fetches. Nothing is moved optimistically.
- Open stage → status OPEN, probability = stage default.
- Won stage → `mark_won`, confirmation in the UI, status WON, `wonAt`, probability 100, client PROSPECT → ACTIVE, extra event `opportunity.won`.
- Lost stage → `mark_lost` and a reason (UI dialog; server rejects < 3 chars with `LOST_REASON_REQUIRED`), status LOST, probability 0, event `opportunity.lost`.
- Leaving Won/Lost (reopen) requires the matching `mark_*` permission and clears the outcome fields.

## Website lead flow

`POST /api/leads` (public site quote/contact/hero/CTA forms) → `captureWebsiteLead` (`src/server/crm/website.ts`):

1. Body capped at 16 KB (413), DB-backed rate limit **5 submissions / 10 min per IP** (429).
2. Strict whitelist schema — visitors cannot set owner, status, priority or any internal field. Internal IDs are never returned.
3. Spam heuristics (visitor still sees success; an audit row `website.lead_rejected_spam` records the reason): honeypot field filled, submitted < 1.5 s after render (only when the form sends `elapsed`), > 2 links, HTML/script markup.
4. Website service slugs map to the CRM service category (unknown → `other`); budget options map to SAR min/max.
5. Attribution stored in `captureMeta`: form, UTM params, referrer, page, IP, user agent.
6. Duplicate policy (nothing is dropped or merged automatically):
   - same normalized email / phone / WhatsApp as an **OPEN or QUALIFIED** lead → no new lead; the submission is appended to that lead as a system activity (`website.resubmission`), its follow-up is set to now if empty, audit `website.lead_appended`;
   - matches only a converted / lost / archived lead → a **new** lead with `duplicateOfId` pointing to the latest match;
   - no match → new lead (source WEBSITE, unassigned, follow-up now).
7. Event `website.lead_received` → notification (category SALES, priority HIGH) to the lead owner, or — when unassigned — to every user holding both `crm.leads.view` and `crm.records.all`.

Phone normalization: Saudi formats (`05…`, `5…`, `+966…`, `00966…`) → `9665…`.

## Activities, notes, follow-ups, attention

- System activities are written by services (created, converted, stage changes, resubmissions); user activities via "Log activity". Logging an activity updates `lastActivityAt`.
- Notes: only the author can edit/delete (soft delete).
- Follow-ups page buckets: overdue (< now), today, upcoming (the 7 days after today).
- Attention rules (deterministic, `crmAttention`): overdue lead follow-ups, overdue opportunity follow-ups, opportunities stalled > 14 days in a stage, high-value deals (≥ org quote approval threshold) with no activity for 7 days. Overdue follow-ups are personal on the Command Center and scoped (team) on `/app/crm`.

## Command Center & search

Live KPIs: active leads, open opportunities, pipeline value (SAR), won this month (vs same period last month), overdue follow-ups, active clients — each respects permissions and scope. The pipeline panel shows open deals by stage. Global search (Ctrl K) returns leads, opportunities, clients and contacts within scope (number, name, company, email, normalized phone).

## Domain events & audit

Events: `lead.created`, `lead.updated`, `lead.assigned`, `lead.qualified`, `lead.lost`, `lead.reopened`, `lead.archived`, `lead.converted`, `client.created`, `client.updated`, `contact.created`, `contact.updated`, `opportunity.created`, `opportunity.updated`, `opportunity.assigned`, `opportunity.stage_changed`, `opportunity.won`, `opportunity.lost`, `website.lead_received`.
Audit actions additionally include `client.archived`, `opportunity.archived`, `crm.activity_logged`, `crm.note_added/updated/deleted`, `crm.tags_changed`, `website.lead_appended`, `website.lead_rejected_spam`. The Phase 1 append-only audit trigger applies unchanged.

## Service categories (replaced in Phase 3)

**Done in Phase 3:** the DB `Service` catalog replaces the static list. Leads and opportunities now carry `serviceId` (forms pick from the catalog; website slugs resolve by `Service.key`). The legacy string columns are kept for history and unmapped values (e.g. `other`), mapped only on an exact key match — see [COMMERCIAL.md](COMMERCIAL.md#phase-2--phase-3-service-migration).

## Demo data

`ALLOW_DEMO_SEED=1 npm run db:seed` adds (idempotently, through the real services) 12 leads in every status, 6 conversions with opportunities across stages incl. one won and one lost, an extra contact, a directly created client and one website submission. Existing users, roles and the demo password are untouched.

## Known limitations

- SAR-only totals (no FX).
- TEAM scope = department; unassigned leads visible to ALL scope only.
- No lead Kanban (leads use list + status); no bulk actions or CSV import/export yet.
- No file attachments (Client 360 "Files" tab is planned for Phase 7 documents).
- Website rate limit is per IP; shared NAT users share the 5/10 min budget.
- The quick (single-field) hero/CTA form does not send `elapsed`, so the timing heuristic doesn't apply to it; the rate limit and honeypot still do.
