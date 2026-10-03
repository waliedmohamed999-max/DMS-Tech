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
| [FINANCE.md](FINANCE.md) | Phase 5: billing eligibility, invoices (lifecycle, VAT snapshot, PDF), payments & allocation, receivables / aging, collections, expenses & approval, vendors, cost rates, profitability, permissions |
| [HR.md](HR.md) | Phase 6: employees & reporting line, protected compensation / masked bank details, attendance & policy, holidays, leave ledger & approval, payroll (calculation, approval, payment, payslips), recruitment ATS & hire conversion, performance, self-service, permissions |
| [OPERATIONS.md](OPERATIONS.md) | Phase 7: procurement requests + configurable approval routing, purchase orders (freeze, receipts, revise), vendor performance, assets & assignment history, maintenance, secure documents & versions with record-inherited access, support tickets + SLA, knowledge base, permissions |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Phase 8: integration registry & honest status, encrypted secrets, signed inbound webhooks (dedupe / replay), transactional outbox (retry, dead letter), outbound webhooks, WhatsApp Business Platform (inbox, safe matching, explicit lead / ticket creation, templates), worker, S3 storage, logs |
| [MARKETING.md](MARKETING.md) | Phase 8: campaigns (versioned approval, frozen recipient snapshot, rate-limited sending), audience, consent history, deterministic first / last-touch attribution, billed vs collected, spend, marketing dashboard |
| [AUTOMATION.md](AUTOMATION.md) | Phase 9: deterministic business rules — triggers, validated conditions, allow-listed actions, idempotency, versioning, recursion protection, templates |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Phase 9: structured logging + redaction, error model, metrics, job registry / heartbeats, domain-event recovery, dead letters, health / readiness, alerts |
| [SECURITY.md](SECURITY.md) | Phase 9: session review, security headers, CSRF, rate limits, secret rotation, production protections |
| [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) | Phase 9: RPO / RTO targets, backups + verification, restore runbook, storage backup, scenarios |
| [DATA-CLASSIFICATION.md](DATA-CLASSIFICATION.md) | Phase 9: sensitive-data inventory and retention policy |
| [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) | Phase 9: deploy flow, migration safety, smoke suite, rollback |
| [GO-LIVE.md](GO-LIVE.md) | Phase 9: production checklist |
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
| 5 | Finance: invoices from contracts / milestones / quotations / projects / approved time (dedup by DB), frozen issued invoices + stored PDF, payments with full allocation + reversal, AR aging + manual collections, expenses through the approval engine, vendors, cost rates, project & client profitability, finance dashboard / reports / CSV, lease-guarded sweep | **Done** — see [FINANCE.md](FINANCE.md) |
| 6 | People: employees (separate from users) + manager hierarchy, effective-dated compensation and masked bank details, attendance (self check-in, policy, holidays, corrections), leave (ledger, balances, manager → HR approval), payroll (snapshot calculation, adjustments, approval, payment, AR/EN payslips), recruitment (jobs, candidates, pipeline, interviews, evaluations, offers via approval, hire conversion), lightweight performance, My HR, My Team, lease-guarded sweep | **Done** — see [HR.md](HR.md) |
| 7 | Operations: procurement requests (rule-based approval via the engine), purchase orders (server totals, approval / waiver, issue freeze, partial receipts, cancel-and-replace), vendor contacts + delivery metrics, assets (PO-sourced, append-only assignments, maintenance, offboarding signal), secure document storage + immutable versions + record-inherited access, support tickets with elapsed-time SLA, knowledge base with versioned publishing, operations dashboard, lease-guarded sweep | **Done** — see [OPERATIONS.md](OPERATIONS.md) |
| 8 | Integrations & growth: integration registry (honest statuses, no simulated connections), AES-GCM secret store, signed + deduplicated inbound webhooks, transactional outbox with retry / dead letter, outbound signed webhooks, official WhatsApp Business Platform inbox (safe matching, explicit lead / ticket / note), campaigns with versioned approval and immutable recipient snapshot, consent history, first / last-touch attribution, marketing dashboard, S3 document storage, entity-document owner correction, integrations worker | **Done** — see [INTEGRATIONS.md](INTEGRATIONS.md), [MARKETING.md](MARKETING.md) |
| 9 | Business rules + production hardening: DB-backed deterministic rules (idempotent, versioned, recursion-safe, high-risk actions blocked), unified worker with job registry / heartbeats / stuck-job recovery, domain-event retry + dead letters, health / readiness, structured redacted logging, standard error model, metrics, system-health dashboard, alerts, verified backups + restore runbook, storage verification, config validation, security headers / CSRF / rate-limit review, retention, demo-data protection | **Done** — see [AUTOMATION.md](AUTOMATION.md), [OBSERVABILITY.md](OBSERVABILITY.md), [SECURITY.md](SECURITY.md), [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md), [GO-LIVE.md](GO-LIVE.md) |
| 10 | Staging & go-live readiness (no new business features): APP_ENV + immutable environment markers + outbound cross-wiring guard, IBAN field encryption (AES-256-GCM, separate key), nonce CSP for `/app`, request correlation end to end, Sentry / webhook error reporters + file log sink, fail-fast startup, ZATCA issuing gate (decision-driven, no fake compliance), admin / smoke-account provisioning, `go-live:check`, deploy units (systemd / nginx), staging rehearsal (TLS DB, HTTPS, 2 web + 2 workers) with E2E, restore and rollback drills, performance baseline | **Release candidate 1.0.0-rc.1; go-live BLOCKED on infrastructure / decisions** — see [STAGING.md](STAGING.md), [GO-LIVE.md](GO-LIVE.md), [ENVIRONMENTS.md](ENVIRONMENTS.md), [ZATCA-DECISION.md](ZATCA-DECISION.md) |
| 11 | Code closure & external-ready (no new business features): public-site CSP without `'unsafe-inline'` (build-time hash manifest + nonce for dynamic pages), automatic offboarding (account disabled + sessions revoked on the effective date, idempotent, Super-Admin guard), malware-scanning boundary (clamd / HTTP adapters, PENDING/CLEAN/INFECTED/FAILED/NOT_CONFIGURED, fail-safe policy), error-tracking production boundary (release/build/correlation tags, redaction, bounded retrying delivery), HTTP→HTTPS verification (HTTP_BASE_URL), ZATCA architecture foundation (deterministic UBL XML, hash chain, clearance/reporting state machine, restore lock — standard B2B invoices), `release:verify` | **Code ready; external onboarding / infrastructure / decisions remain** — see [ZATCA.md](ZATCA.md), [STAGING.md](STAGING.md), [GO-LIVE.md](GO-LIVE.md) |
| 10 | NOVA data integration (only when NOVA publishes an API / webhook spec), further hardening (ZATCA, scanner, error-tracking adapter) | Planned |

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
  ops/                                     procurement, orders, vendors (ops), assets, documents + storage, support (SLA), knowledge, insights, sweep, search
  hr/                                      employees, compensation, attendance, leave, payroll, recruitment, performance, access (scope + masking), insights, sweep, search
  finance/                                 invoices, eligibility, payments, expenses (+ vendors, categories), costing, insights, sweep, search, export, access
  jobs/lease.ts                            DB lease for multi-instance scheduled jobs
  pdf/                                     PDF engine (bidi text layout, documents)
  integrations/                            nova.ts (external NOVA link, API interface only), registry, secrets, adapters, http, webhooks, outbox, worker, subscribers, insights
  automation/                              deterministic business rules: catalog, conditions, actions, engine
  system/                                  health / readiness, config, build info, job registry, event recovery, alerts, retention, backup, worker, overview
  obs/                                     structured logger, redaction, error model / reporter, metrics, request context
  security/                                CSRF origin guard, per-actor limits
  whatsapp/                                WhatsApp Business Platform: inbound processing, matching, consent, replies, templates
  marketing/                               campaigns (approval, snapshot, sending, dashboard), attribution (first / last touch, funnel)
src/lib/os/                                DAL, action wrapper, server actions, module registry
src/app/app/                               /app routes (login + (shell))
src/components/os/                         OS UI (shell, tables, forms)
src/components/crm/                        CRM forms, pipeline board, timelines, charts
src/lib/crm/services.ts                    legacy Phase 2 category keys (labels for unmapped values)
src/lib/commercial/calc.ts                 decimal commercial arithmetic (server-authoritative)
src/components/ops/                        line-item editor, receipt form, secure upload form, comment box, documents panel, ticket cards
src/components/hr/                         generic HR action forms, reveal IBAN, check-in/out, stage select
src/components/finance/                    invoice editor, finance widgets, client/project finance tabs
src/components/projects/                   workspace widgets, Kanban board, quick create, template editor
src/components/sales/                      quotation builder, record actions, contract panels, catalog forms
assets/fonts, assets/brand                 bundled PDF fonts (OFL) and print logo
tests/                                     Vitest unit + DB integration tests
```
