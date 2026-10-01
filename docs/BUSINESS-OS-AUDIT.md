# DMS Tech Business OS — Repository Audit (Phase 0)

_Audit date: 2026-10-01 · Scope: `E:\xampp\htdocs\DMS Tech`_

## 1. What exists today

| Area | Finding |
|---|---|
| Framework | **Next.js 16.3.4** (App Router, Turbopack), React 19.2, TypeScript 6 (strict). `proxy.ts` replaces middleware (Next 16 convention). |
| Styling | Tailwind CSS 4 (`@theme` tokens in `src/app/globals.css`). Public design follows the Specify design system (iris `#624de3`, obsidian `#151718`, Inter + IBM Plex Sans Arabic + Fira Code). |
| i18n / RTL | `next-intl` 4 with `[locale]` routing (`ar` default, unprefixed; `en` under `/en`). `dir` set per locale in `src/app/[locale]/layout.tsx`. Messages in `src/messages/{ar,en}.json`. |
| Routes | Public only: `/`, `/services`, `/services/[slug]`, `/nova-ai`, `/about`, `/clients`, `/careers`, `/blog`, `/blog/[slug]`, `/contact`, `/quote`, `sitemap.xml`, `robots.txt`. |
| API | One route: `POST /api/leads` (zod validation, honeypot, in-memory rate limit). Persists to Supabase **only if** env vars are set; otherwise logs. |
| Database | **None in use.** `supabase/migrations/0001_init.sql` is a draft (leads + content tables) that was never applied. No ORM. |
| Auth | **None.** No users, sessions, roles. |
| Content layer | Typed bilingual content in `src/content/*` read through `src/lib/content.ts` (repository pattern — designed for later DB swap). |
| Services data | 8 services in `src/content/services.ts` (text only; no pricing, SKUs, or delivery metadata). |
| NOVA AI | **Marketing only** (hero animation, product page). NOVA AI is a **separate external DMS Tech platform** — it is integrated (linked/launched), never rebuilt here. See [NOVA-INTEGRATION.md](NOVA-INTEGRATION.md). |
| UI components | Public-site components only (Header, Footer, LeadForm, carousels, Icon registry over lucide-react, BrandIcon over simple-icons). No table, dialog, form-field, or data components. |
| Tests | None. No test runner configured. |
| Deployment | Not deployed from this repo yet. Target implied by sibling projects: Vercel + managed Postgres (Supabase). |
| Sibling conventions | Other projects on this machine use **Prisma 7 + `@prisma/adapter-pg` + PostgreSQL**, generated client in `src/generated/prisma`. Adopted here for consistency. |

## 2. Reusable pieces

- `src/components/ui/Icon.tsx` — central icon registry (string → component). Reused by the OS navigation.
- Design tokens in `globals.css` — the OS adds a dark-first token layer (`os-*`) on top instead of a second system.
- `src/i18n/*` + message files — the OS reuses next-intl with a cookie-selected locale (no URL prefix under `/app`).
- `zod` (already installed) for all server-side validation.
- `src/lib/leads.ts` schema — will be migrated into the CRM `Lead` model in Phase 2 (website form → CRM inbox).

## 3. Risks

| Risk | Mitigation |
|---|---|
| No database or migrations exist; every OS module depends on one. | Phase 1 introduces Prisma + PostgreSQL with versioned migrations. Local dev/test DB via `embedded-postgres` (real Postgres binaries, no Docker). |
| `[locale]` dynamic segment could swallow `/app/*`. | OS lives in a static `src/app/app/` segment (static beats dynamic) with its own root layout; `proxy.ts` routes `/app` before the locale middleware. |
| Public site must not break. | OS code is isolated under `src/app/app`, `src/server`, `src/components/os`. Public pages untouched; build verifies all 45 public pages still render. |
| Sensitive data (payroll, bank) in later phases. | Permission catalog includes dedicated `*.sensitive` permissions from day one; enforcement is server-side in the service layer, not in UI. |
| In-memory rate limit on `/api/leads` is per-instance. | OS login uses a DB-backed limiter (works on serverless). Public limiter to be moved in Phase 10. |
| Supabase draft SQL diverges from the new schema. | Marked superseded; Prisma migrations are the single source of truth. |

## 4. Missing infrastructure (to build)

Database + ORM · migrations · seed (dev-only) · authentication · sessions · RBAC · audit log · domain events · notifications · activity feed · approvals · OS shell (sidebar, topbar, command palette) · data-table / form / dialog primitives · test runner (Vitest) with DB-backed integration tests · docs.

## 5. Architecture decisions

1. **Separate internal app at `/app`** with its own root layout, dark-first theme and cookie-based locale (`OS_LOCALE`, Arabic default).
2. **Layering:** `src/server/<domain>/*.ts` holds all business logic as plain functions that take an explicit `Ctx` (actor, organization, permissions). Server Actions and Route Handlers are thin adapters. This makes permission checks unavoidable and unit/integration-testable without a browser.
3. **Database sessions** (random 256-bit token in an `httpOnly` cookie, only its SHA-256 hash stored) → revocable, auditable, no JWT secret rotation problem.
4. **Password hashing:** Argon2id (`@node-rs/argon2`).
5. **RBAC:** permission catalog defined in code (`src/server/rbac/permissions.ts`, typed keys); roles and role→permission grants stored in DB so admins can customise; enforced by `requirePermission(ctx, key)` inside every service.
6. **Multi-tenancy prep:** every business table carries `organizationId` (single org today). All service queries are scoped by `ctx.organizationId`. No per-tenant routing yet (documented in ARCHITECTURE).
7. **Domain events:** `DomainEvent` table (outbox). `publish()` persists the event in the same transaction as the change, then in-process subscribers (notifications, activity, later automations) run after commit and record their outcome.
8. **Audit log:** append-only table; a Postgres trigger rejects `UPDATE`/`DELETE`.
9. **No fake data:** KPIs are provider functions. Providers whose module is not built yet return `{ state: "planned", phase }` and the UI says so.

## 6. Migration plan

- Phase 1 migration creates only Phase 1 tables (org, users, roles, sessions, departments, settings, audit, activity, notifications, approvals, domain events, rate limits).
- Later phases add their own migrations; no destructive changes to Phase 1 tables are planned.
- Seed (`npm run db:seed`) is **refused when `NODE_ENV=production`** or when `ALLOW_DEMO_SEED` is not set.

## 7. Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Audit, architecture, schema plan | ✅ this document + ARCHITECTURE |
| 1 | Auth, RBAC, shell, navigation, command center, approvals inbox, activity, notifications, audit, users/roles/departments/settings admin | ✅ Done |
| 2 | CRM: clients, contacts, leads (incl. website form), opportunities, pipeline | ✅ Done — [CRM.md](CRM.md) |
| 3 | Service catalog, packages, quotations + PDF, approval rules, contracts | Planned |
| 4 | Projects, tasks, milestones, timesheets, health engine | Planned |
| 5 | Invoices, payments, expenses, finance reports | Planned |
| 6 | Employees, leave, payroll, recruitment | Planned |
| 7 | Vendors, procurement, support tickets, documents | Planned |
| 8 | Marketing, WhatsApp Business Platform, integrations | Planned — integration required |
| 9 | Deterministic (non-AI) business rules; NOVA AI **data** integration (API/webhooks) only once NOVA publishes a spec. No AI engine/agents/tools are built in the OS — NOVA AI is an external platform ([NOVA-INTEGRATION.md](NOVA-INTEGRATION.md)); its launch link already exists | Planned — depends on NOVA spec |
| 10 | Security hardening, performance, E2E tests, production readiness | Planned |
