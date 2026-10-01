# DMS Tech

**Bilingual company website and Business OS** for DMS Tech — AI, automation, and digital growth.

The public website presents services and captures enquiries. The internal dashboard manages customers, sales, contracts, project delivery, and team access.

| Area | Route | Languages |
| --- | --- | --- |
| Website | `/` · `/en` | Arabic (default, RTL) and English |
| Dashboard | `/app` | Arabic and English |
| Dashboard login | `/app/login` | Email and password |

## Dashboard access

Use these credentials with the local demo database:

| Field | Value |
| --- | --- |
| Login URL | http://localhost:3000/app/login |
| Email | `admin@dms.test` |
| Password | `DmsDemo2026!` |
| Role | Super Admin |

These credentials are for development only. On a new database, run the demo seed first. Seeding does not reset an existing account's password. For production, create a separate administrator with `npm run os:bootstrap`; see the [deployment guide](docs/BUSINESS-OS-DEPLOYMENT.md).

## Technology

| Layer | Tools |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4, Lucide, Simple Icons |
| Localization | next-intl, Arabic RTL and English |
| Database | PostgreSQL, Prisma 7 |
| Authentication | Argon2 password hashing, server-side sessions, role-based permissions |
| Quality | ESLint, TypeScript, Vitest |

The visual identity uses DMS gold `#d4a03a`, dark navy, rounded cards, and pill buttons.

## Local setup

Run commands from the repository root. Examples use PowerShell.

### 1. Install and configure

```powershell
npm install
# First setup only: preserve .env if it already exists.
Copy-Item .env.example .env
```

Configure `.env` for the bundled local PostgreSQL server:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=postgresql://dms:dms_local_only@localhost:54329/dms_os
TEST_DATABASE_URL=postgresql://dms:dms_local_only@localhost:54329/dms_os_test
ALLOW_DEMO_SEED=1
```

Use `.env` so Next.js, Prisma, and command-line scripts read the same configuration. Local environment files are excluded from version control.

### 2. Start PostgreSQL

In a separate terminal, leave this command running:

```powershell
npm run db:local
```

It starts PostgreSQL on port `54329`, creates development and test databases, and persists data in `.local/pg`. Docker is not required.

### 3. Initialize and run

```powershell
npm run db:deploy
npm run db:seed
npm run dev
```

Open the [website](http://localhost:3000) or [dashboard login](http://localhost:3000/app/login). The seed creates demo accounts and sample business data. It refuses to run in production or without `ALLOW_DEMO_SEED=1`.

## Dashboard features

| Module | Implemented scope |
| --- | --- |
| Administration | Users, roles, departments, settings, audit log |
| Workspace | Dashboard, approvals, notifications, activity |
| CRM | Leads, clients, contacts, opportunities, sales pipeline, follow-ups |
| Commercial | Services, packages, quotations, approvals, bilingual PDFs, contracts |
| Projects | Templates, milestones, tasks, Kanban, teams, timesheets, deliverables, dependencies |
| NOVA AI | External platform link configured with `NOVA_URL` |

Finance, People, Operations, and Growth are planned modules. See the [Business OS overview](docs/BUSINESS-OS.md) for status. NOVA AI runs as a separate platform; this repository provides its launch integration.

## Public routes

Routes below use the default Arabic locale; add `/en` for English pages.

| Route | Purpose |
| --- | --- |
| `/` | Company homepage |
| `/services` · `/services/[slug]` | Service directory and service details |
| `/nova-ai` | NOVA AI product page |
| `/about` | Company, values, and delivery process |
| `/clients` | Industries and platforms |
| `/careers` | Open positions |
| `/blog` · `/blog/[slug]` | Articles |
| `/contact` · `/quote` | Contact and quotation requests |
| `POST /api/leads` | Website enquiry intake into the CRM |

Use `/quote?service=<slug>` to preselect a service. Website enquiries are stored in the Business OS PostgreSQL database through the CRM service layer. The former Supabase lead-storage configuration is no longer used.

## Project structure

```text
src/
  app/[locale]/       Public website pages
  app/app/            Business OS routes and login
  app/api/leads/      Public enquiry endpoint
  components/         Website and dashboard components
  content/            Bilingual website content
  messages/           Arabic and English UI translations
  i18n/               Locale configuration
  proxy.ts            Locale routing and dashboard session gate
  lib/                Content access, server actions, shared utilities
  server/             Auth, permissions, CRM, commercial, project services
prisma/               Database schema, migrations, demo seed
scripts/              Local database, bootstrap, maintenance commands
tests/                Unit and database integration tests
docs/                 Architecture, workflows, deployment guides
public/               Public static assets
assets/               PDF fonts and brand assets
```

## Editing website content

| Content | Location |
| --- | --- |
| Services, industries, articles, jobs | `src/content/*.ts` |
| Contact details, social links, announcement | `src/content/site.ts` |
| UI labels and headings | `src/messages/ar.json` · `src/messages/en.json` |
| Lucide icon registry | `src/components/ui/Icon.tsx` |
| Website images | `public/images/` |

Content fields contain Arabic and English versions. Public pages access content through `src/lib/content.ts`.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run Vitest against the dedicated test database |
| `npm run db:local` | Start local PostgreSQL |
| `npm run db:migrate` | Create and apply development migrations |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:seed` | Populate development demo data |
| `npm run os:bootstrap` | Initialize the organization and first administrator |
| `npm run commercial:sweep` | Process commercial maintenance jobs |
| `npm run projects:sweep` | Process project maintenance jobs |

Before running database tests, apply migrations to the dedicated test database in a separate PowerShell terminal:

```powershell
$env:DATABASE_URL = 'postgresql://dms:dms_local_only@localhost:54329/dms_os_test'
npm run db:deploy
Remove-Item Env:DATABASE_URL
npm test
```

Tests require `TEST_DATABASE_URL` and can modify test data. Use a dedicated test database only.

## Documentation

- [Business OS overview](docs/BUSINESS-OS.md)
- [Architecture](docs/BUSINESS-OS-ARCHITECTURE.md)
- [Roles and permissions](docs/BUSINESS-OS-PERMISSIONS.md)
- [Business workflows](docs/BUSINESS-OS-WORKFLOWS.md)
- [CRM](docs/CRM.md)
- [Commercial workflows](docs/COMMERCIAL.md)
- [Project delivery](docs/PROJECTS.md)
- [NOVA integration](docs/NOVA-INTEGRATION.md)
- [Development and production deployment](docs/BUSINESS-OS-DEPLOYMENT.md)
