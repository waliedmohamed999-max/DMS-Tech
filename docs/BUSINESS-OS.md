# DMS Tech Business OS

Internal operating platform for DMS Tech, served at **`/app`** next to the public website.

> **NOVA AI is not part of this codebase.** It is a separate DMS Tech platform that the Business OS links to (`/app/nova`, topbar "Open NOVA"). The OS never implements AI agents, orchestration, AI workflows or LLM infrastructure — see [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md).

| Document | Contents |
|---|---|
| [BUSINESS-OS-AUDIT.md](BUSINESS-OS-AUDIT.md) | Repository audit, risks, decisions, phase plan |
| [BUSINESS-OS-ARCHITECTURE.md](BUSINESS-OS-ARCHITECTURE.md) | Layers, routing, data model, target schema, multi-tenancy, security |
| [BUSINESS-OS-PERMISSIONS.md](BUSINESS-OS-PERMISSIONS.md) | Permission catalog, roles, enforcement, tested guarantees |
| [BUSINESS-OS-WORKFLOWS.md](BUSINESS-OS-WORKFLOWS.md) | Implemented and planned workflows |
| [BUSINESS-OS-DEPLOYMENT.md](BUSINESS-OS-DEPLOYMENT.md) | Local dev, demo accounts, production rollout |
| [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md) | NOVA AI is an **external** DMS Tech platform: system boundary, launch/access model, future API/webhook contract |
| [COMMERCIAL.md](COMMERCIAL.md) | Phase 3: service catalog, quotations (versions, approvals, VAT, PDF), contracts, permissions, limitations |
| [PROJECTS.md](PROJECTS.md) | Phase 4: projects, templates, milestones, tasks/Kanban, My Work, teams & access, timesheets, deliverables, client dependencies, health engine, completion |
| [CRM.md](CRM.md) | Phase 2: CRM data model, permissions & scope, lead conversion, pipeline rules, website lead flow, limitations |

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit & architecture | Done |
| 1 | Auth, RBAC, shell, command center, approvals, notifications, activity, audit, users/roles/departments/settings | **Done** (see report in conversation / commit) |
| 2 | CRM: leads, clients, contacts, opportunities, DB pipeline + Kanban, conversion, activities/notes, follow-ups, website lead capture, CRM KPIs/attention/search | **Done** — see [CRM.md](CRM.md) |
| 3 | Service catalog & packages, quotations (versioning, approval engine reuse, VAT, PDF AR/EN), contracts & milestones, commercial KPIs/search/notifications | **Done** — see [COMMERCIAL.md](COMMERCIAL.md) |
| 4 | Project delivery: projects from active contracts (commercial snapshot), templates, weighted milestones, tasks + persistent Kanban, My Work, project teams (ALL/TEAM/OWN scope), timesheets via the approval engine, deliverables + internal client acceptance, client dependencies, deterministic health engine, guarded completion, lease-guarded sweep | **Done** — see [PROJECTS.md](PROJECTS.md) |
| 5–10 | Finance → People → Ops → Growth → Business rules + NOVA data integration (when NOVA publishes a spec) → Hardening | Planned — shown in the app as "planned" modules with their phase, never as fake screens |

## Code map

```
prisma/schema.prisma, prisma/migrations/   database
prisma/seed.ts                             demo seed (dev only)
scripts/bootstrap.ts, scripts/local-db.mjs production bootstrap · local Postgres
src/server/                                business logic (Ctx-based, permission-checked)
  auth/ rbac/ approvals/ admin/ dashboard/ events/ feed.ts bootstrap.ts
  crm/                                     leads, opportunities, clients, pipeline, activities, website capture, insights, search
  commercial/                              catalog, quotations, contracts, sweep, insights, search, legacy migration
  projects/                                projects, work (milestones/tasks), time, delivery, engine (progress/health), templates, access, sweep, insights, search
  jobs/lease.ts                            DB lease for multi-instance scheduled jobs
  pdf/                                     PDF engine (bidi text layout, documents)
  integrations/nova.ts                     external NOVA AI adapter (status + audited launch; API interface only)
src/lib/os/                                DAL, action wrapper, server actions, module registry
src/app/app/                               /app routes (login + (shell))
src/components/os/                         OS UI (shell, tables, forms)
src/components/crm/                        CRM forms, pipeline board, timelines, charts
src/lib/crm/services.ts                    legacy Phase 2 category keys (labels for unmapped values)
src/lib/commercial/calc.ts                 decimal commercial arithmetic (server-authoritative)
src/components/projects/                   workspace widgets, Kanban board, quick create, template editor
src/components/sales/                      quotation builder, record actions, contract panels, catalog forms
assets/fonts, assets/brand                 bundled PDF fonts (OFL) and print logo
tests/                                     Vitest unit + DB integration tests
```
