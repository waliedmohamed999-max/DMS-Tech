# DMS Tech on cPanel (CloudLinux Node.js Selector + Phusion Passenger)

Production runbook for **https://dmstech.sa** on the shared cPanel account `dmstechc`.
It covers the website and the Business OS (`/app`) — one Next.js 16 application.

- Docker / VM deployments stay as documented in [PRODUCTION-ARCHITECTURE.md](PRODUCTION-ARCHITECTURE.md) and [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md).
- This guide works **without SSH**.

There are two ways to deploy:

- **Recommended: [GitHub Actions Prebuilt Deployment](#10-github-actions-prebuilt-deployment).** GitHub builds a release and you upload it. The server does not need to run "Run NPM Install" or `next build`.
- **Fallback: build on the server (§3–§6).** Git pull, Run NPM Install, then `cpanel:build`. Use it only if the server can install and build reliably.

---

## 1. How it works

| Piece | What it does |
| --- | --- |
| `app.js` (repository root) | Passenger startup file. Starts the **already built** Next.js app through the Next.js custom-server API (`next({ dev: false })`) and listens on the socket Passenger provides (`listen('passenger')`). It never starts a daemon or child process. Outside Passenger it listens on `PORT` (default 3000) and `HOST` (default 127.0.0.1). |
| `npm run cpanel:check` | Read-only pre-flight. Checks Node.js, the installed packages and the variable **names** (never their values). |
| `npm run cpanel:build` | Runs the check, then: build metadata, `prisma generate`, `next build`, the public CSP manifest, and an output check. It never starts the server and never touches the database. |
| `npm run db:migrate:deploy` | `prisma migrate deploy`: applies pending migrations and nothing else. Never resets data. Only run it on purpose ([§6](#6-database-migrations)). |
| `src/instrumentation.ts` | At startup, refuses to serve if production configuration is invalid. Missing keys are logged by name as `startup_refused` in the Passenger log. |

**Why not `output: "standalone"`?** The build runs in place on the server, so the full `node_modules` is already there. Standalone would also break things the app depends on: `src/proxy.ts` reads `.next/csp-public.json` and `.next/BUILD_ID` from the working directory, and the operational scripts (worker, backups, bootstrap) need the full tree. The custom server runs the normal `.next` build and behaves the same as `next start`. This was verified with identical responses for redirects, 404s, static assets, headers, API routes and server actions.

**CloudLinux `node_modules` link.** Turbopack, the default bundler in Next.js 16, refuses a `node_modules` symlink that points outside the project:

```
Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

That is exactly how the Node.js Selector lays out an application. `next.config.mjs` detects this layout and sets `turbopack.root` and `outputFileTracingRoot` to the nearest common parent, `/home/dmstechc`. In any other layout this setting is not applied. Both layouts were verified with a build and a runtime test.

**No TypeScript runtime in the build.** The build path is plain Node.js (`scripts/build-info.mjs`, `scripts/csp-manifest.mjs`, `scripts/deploy-cpanel.mjs`). `tsx` is only used by operational scripts (worker, `os:bootstrap`, backups), and it is installed as a regular dependency.

---

## 2. Prerequisites (outside this repository)

1. **PostgreSQL database.** The app uses PostgreSQL only; MySQL/MariaDB will not work. Use either a PostgreSQL database created in cPanel (if your host offers it) or a managed PostgreSQL service. Have the `postgresql://…` connection string ready. A remote database needs TLS (`?sslmode=require`).
2. **Private data directory** outside `public_html` and outside the repository, for uploaded documents. In File Manager, create:
   - `/home/dmstechc/dms-data/documents`
   - `/home/dmstechc/dms-data/backups` (optional)
3. **Two different 32-byte keys** (base64). Generate each one on any trusted machine with `openssl rand -base64 32`:
   - `HR_FIELD_KEY` (required)
   - `INTEGRATION_MASTER_KEY` (recommended)

   Keep a copy of both outside the server. **If `HR_FIELD_KEY` is lost, the encrypted employee bank data cannot be recovered.**
4. **Memory for the build.** `next build` runs on the account. `cpanel:build` caps build workers at 2 (`NEXT_BUILD_CPUS`). If the build is "Killed", ask the host to raise the account's LVE memory limit (≥ 2 GB recommended for the build).

---

## 3. cPanel application settings

cPanel → **Setup Node.js App** → **Create Application** (or edit the existing one):

| Field | Value |
| --- | --- |
| Node.js version | **20.20.2** |
| Application mode | **Production** |
| Application root | **repositories/DMS-Tech** |
| Application URL | **dmstech.sa** (empty path) |
| Application startup file | **app.js** |
| Passenger log file | **/home/dmstechc/logs/dms-tech-passenger.log** |

The repository is cloned by cPanel → **Git™ Version Control** to `/home/dmstechc/repositories/DMS-Tech`.
CloudLinux keeps packages in `/home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib/node_modules`, and `node_modules` in the application root is a link to that folder. **Never upload or commit a real `node_modules` folder into the application root.**

### Environment variables

Add these under **Environment variables** in the same screen, then **Save**. The full list with descriptions is in [`.env.example`](../.env.example).

**Required:**

| Name | Value | When it is used |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://dmstech.sa` | **Build time** and runtime. It is compiled into the bundles, so changing it needs a rebuild. |
| `APP_ENV` | `production` | runtime |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require` | runtime and migrations (secret) |
| `HR_FIELD_KEY` | base64, 32 bytes | runtime (secret) |
| `DOCUMENT_STORAGE` | `local` (or `s3`) | runtime |
| `DOCUMENT_STORAGE_DIR` | `/home/dmstechc/dms-data/documents` | runtime, when `local` |

- With `DOCUMENT_STORAGE=s3`, also set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. In that case `DOCUMENT_STORAGE_DIR` is not needed.
- `NODE_ENV=production` is set by "Application mode: Production".

**Recommended:**
- `INTEGRATION_MASTER_KEY`: must be different from `HR_FIELD_KEY`.
- `SENTRY_DSN` or `ERROR_REPORT_WEBHOOK_URL`: error reporting.
- `LOG_LEVEL=info`

**Never set in production:**
- `ALLOW_DEMO_SEED`
- `OS_LOCAL_PROD_TEST`
- `TEST_DATABASE_URL`

**Public variables.** The only public (`NEXT_PUBLIC_*`) variable is `NEXT_PUBLIC_SITE_URL`. Never give a secret a `NEXT_PUBLIC_` name: it would be sent to every browser.

**Fallback if "Run JS Script" does not see the variables.** `cpanel:check` prints which names it can see. If the build reports `NEXT_PUBLIC_SITE_URL is not set` even though it is configured, create the file `/home/dmstechc/repositories/DMS-Tech/.env.production` in File Manager with this line:

```
NEXT_PUBLIC_SITE_URL=https://dmstech.sa
```

Next.js reads that file during the build. The file is git-ignored. Do not put secrets in it.

---

## 4. Deployment sequence (every release)

1. **Git™ Version Control** → *Manage* → **Pull or Deploy** → **Update from Remote**. This pulls `main`.
2. **Setup Node.js App** → open the application → **Stop App**. The build replaces `.next`, so stopping avoids serving a half-written build.
3. **Run NPM Install.** It installs from `package-lock.json` and runs `prisma generate` automatically (`postinstall`).
4. **Check the environment variables** (§3). They must be in place **before** the build.
5. **Run JS Script** → `cpanel:check`. It must end with `✔ cpanel:check passed`.
6. **Run JS Script** → `cpanel:build`. It must end with `✔ Build ready.`
7. **Only if the release adds migrations** (and always on the first deployment), take a database backup, then **Run JS Script** → `db:migrate:deploy` (§6).
8. **First deployment only:** create the organization and the first Super Admin (§7).
9. **Start App** (or **Restart**).
10. Open **https://dmstech.sa/api/health**. Expect `{"status":"ok", …, "environment":"production"}`.
11. Open **https://dmstech.sa/api/ready**. `"ready": true` means the database, migrations, configuration and storage are all OK.
12. Open **https://dmstech.sa** and **https://dmstech.sa/app/login**.
13. If anything fails, read `/home/dmstechc/logs/dms-tech-passenger.log` (§8).

A release that changes neither `package.json` nor `package-lock.json` can skip step 3. Steps 5–6 are always required: there is no runtime compilation.

---

## 5. What the build needs

- **Build-time variables:** only `NEXT_PUBLIC_SITE_URL`.
- **No database access during the build.** `next build` imports `src/server/db.ts`, which requires `DATABASE_URL` to be *set* but does not connect. If no `DATABASE_URL` is visible to the build, `cpanel:build` uses an unreachable placeholder, the same rule as the Dockerfile. This was verified: the build succeeds with no database running.
- **Type checking:** `next build` type-checks the application using `tsconfig.build.json`, which excludes `tests/`. The tests need `vitest`, a development-only package. Developers still run `npm run typecheck` for everything.

---

## 6. Database migrations

**On the first deployment** to an empty database, `db:migrate:deploy` creates the whole schema. Then follow §7.

**On later releases:**
1. Check whether the release adds migrations (new folders under `prisma/migrations/`). After a build, `.build-info.json` lists the migrations shipped with it.
2. If it does, take a backup in the cPanel *PostgreSQL Databases* / phpPgAdmin export, or through your provider's snapshot.
3. Then run `db:migrate:deploy`.

`db:migrate:deploy` runs `prisma migrate deploy`: it only applies pending migrations, in order. It never resets, drops or reseeds. Never run `db:migrate` (`prisma migrate dev`) or `db:seed` on production; `db:seed` refuses without `ALLOW_DEMO_SEED` anyway.

Check the result with **/api/ready**: the `migrations` check is `ok` when the database matches the build.

---

## 7. First Super Admin (first deployment only)

1. Temporarily add these environment variables:
   - `OS_ADMIN_EMAIL`: a real, named person's address (not a shared mailbox)
   - `OS_ADMIN_NAME`
   - `OS_ADMIN_PASSWORD`: a strong password
2. **Run JS Script** → `os:bootstrap`. It is idempotent: it creates the organization, the system roles and that Super Admin, and never creates demo data.
3. **Remove `OS_ADMIN_PASSWORD`** (and the other two variables) from the environment variables, then restart the application.
4. Sign in at `/app/login`.

To add a second named Super Admin, and for recovery, use `npm run admin:provision -- --email … --name "…"` ([GO-LIVE.md](GO-LIVE.md#administrators)). It needs a terminal (cPanel → *Terminal* or SSH), because it takes arguments and prints a one-time password.

---

## 8. Troubleshooting

### "We're sorry, but something went wrong" (Passenger)

Read `/home/dmstechc/logs/dms-tech-passenger.log`. The app logs one JSON line per event:

| Log line | Cause | Fix |
| --- | --- | --- |
| `startup_refused` … `NO_PRODUCTION_BUILD` | `cpanel:build` has not completed | Run `cpanel:build`, then restart |
| `config_issue` + `startup_refused` … `Startup refused: invalid production configuration (KEY:CODE, …)` | Required variables are missing or invalid. Only names are logged. | Fix the named variables (§3), then restart |
| `startup_refused` … `NEXT_NOT_INSTALLED` | The NPM install did not complete | See "Install fails" below |
| `startup_failed` | Any other startup error. The message and stack trace are in the log, never in the browser. | Read the error |
| `csp_manifest_missing` (warning) | The build was made with `next build` instead of `cpanel:build` | Rebuild with `cpanel:build` |

Visitors only ever see Passenger's generic page or a plain `Internal Server Error`. Stack traces stay in the log.

### Install fails (`Run NPM Install`)

- **`Cannot read properties of null (reading 'edgesOut')`.** npm's dependency tree crashed on a stale or partial `node_modules`. Earlier lockfiles were written by npm 11, while Node 20.20.2 ships npm 10.8.2. The lockfile is now written by npm 10.8.2. To recover:
  1. **Stop App**.
  2. In File Manager, delete the folder `/home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib/node_modules`.
  3. If `/home/dmstechc/repositories/DMS-Tech/node_modules` is a **real folder** rather than a link, delete it as well.
  4. Run **Run NPM Install** again.
- **`prisma generate` / `Cannot find module 'dotenv/config'`.** This was fixed in this release. Everything that `prisma generate` and `next build` need is a regular dependency, so production-mode installs (which skip devDependencies) work.
- **`tsx: command not found` during the build.** This was fixed in this release: the build no longer uses `tsx`.
- **`cpanel:check` lists missing packages.** The install stopped partway. Use the recovery steps above.

### Build fails

- **"Killed" / exit 137.** The account hit its memory limit. Ask the host for more LVE memory, or set `NEXT_BUILD_CPUS=1` and run the build again.
- **TypeScript errors.** The code on `main` does not compile. Fix it in the repository; the build will not skip type errors.

### `/api/ready` is not ready

The response lists each check by name. Common failures:

- `database`: wrong `DATABASE_URL`, or the database is not reachable.
- `migrations`: pending migrations; run `db:migrate:deploy`.
- `document_storage`: the folder is missing or not writable.
- `demo_accounts`: demo users exist in a production database.
- `environment`: the database belongs to a different deployment.

### Optional: background worker (automation, retries, scheduled sweeps)

The app works without the worker. To run it, use cPanel → **Cron Jobs**, every 5 minutes:

```
cd /home/dmstechc/repositories/DMS-Tech && set -a && . /home/dmstechc/dms-data/worker.env && set +a && /home/dmstechc/nodevenv/repositories/DMS-Tech/20/bin/npm run worker >> /home/dmstechc/logs/dms-tech-worker.log 2>&1
```

Cron jobs do not get the Node.js app's environment variables. `worker.env` must therefore repeat at least these variables as `KEY=value` lines: `NODE_ENV=production`, `APP_ENV`, `DATABASE_URL`, `HR_FIELD_KEY`, `DOCUMENT_STORAGE`, `DOCUMENT_STORAGE_DIR` and `INTEGRATION_MASTER_KEY`. Keep the file outside `public_html` with permissions `600`.

Set `REQUIRE_WORKER=1` only once the cron job is running. After that, `/api/ready` reports a stale worker.

---

## 9. Security notes

- No secrets live in the repository:
  - `.env`, `.env.*` (except `.env.example`), logs, keys and dumps are git-ignored.
  - `.env.example` contains variable names only.
- `/api/health` returns only `status`, `time`, `version`, the short commit, `environment` and `uptimeSeconds`. It does no I/O.
- `/api/ready` returns check names and statuses. It never returns connection strings, file paths or stack traces.
- Production startup refuses development-only flags and missing keys (`src/server/system/config.ts`).
- `app.js` forces `NODE_ENV=production` and logs a warning if it was set to anything else. The development server can never run here.
- Server Actions keep Next.js' Origin/Host check. Passenger forwards the original `Host`, so `https://dmstech.sa` works as-is.

---

## 10. GitHub Actions Prebuilt Deployment

The workflow [`.github/workflows/cpanel-build.yml`](../.github/workflows/cpanel-build.yml) builds the release on Linux with Node.js 20.20.2, the same version as the server.

**When it runs:** on manual dispatch (*Run workflow*) and on every push to `main` or `deploy/**`. It **only builds**. It never deploys, never connects to the production database, and uses no repository secrets.

**What it does, in order:**
1. `npm ci`
2. `prisma generate`
3. `typecheck`
4. `lint`
5. `npm run cpanel:build`, with `NEXT_PUBLIC_SITE_URL=https://dmstech.sa` and `GIT_COMMIT=<sha>`
6. `npm prune --omit=dev`
7. `npm run cpanel:package`
8. **Rehearsal of the release:**
   - Extract it into a clean CloudLinux-style layout, with `node_modules` as a symlink into a virtual environment.
   - Run `cpanel:verify`.
   - Against a throwaway PostgreSQL: `cpanel:migrate`, then `cpanel:bootstrap`.
   - Start `app.js` both directly and under an emulated Passenger.
   - HTTP smoke test: pages, static assets, `public/`, `/api/health`, `/api/ready` (must be ready), sign-in, 404, and security headers.

### What the artifact contains

The artifact is `dms-tech-cpanel-production-<commit sha>`, kept for 90 days. Download it from the workflow run, then unzip it. Inside:

| File | Extract into | Contents |
| --- | --- | --- |
| `dms-tech-app-<version>-<sha7>.tar.gz` | the **application root**, `/home/dmstechc/repositories/DMS-Tech` | See the list below. |
| `dms-tech-node_modules-<version>-<sha7>.tar.gz` | the **virtual environment**, `/home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib` (it creates `node_modules/`) | Production dependencies for Linux x64. Includes the native `@node-rs/argon2`, `@swc/core` and `sharp`, plus Prisma's migration engines for `rhel-openssl-1.1.x`, `rhel-openssl-3.0.x` and `debian-openssl-3.0.x`. |
| `DEPLOY_MANIFEST.json` | — (keep it) | Version, commit, build time, Next.js build id, migration list, and the sha256 and size of each archive. |
| `SHA256SUMS` | — | Archive checksums. |
| `CPANEL_DEPLOYMENT.md` | — | This runbook. |

The application archive contains:
- `app.js`
- `.next/` (without cache or traces)
- `.build-info.json`
- `package.json`, `package-lock.json`
- `next.config.mjs`, `security-headers.mjs`, `tsconfig.json`, `prisma.config.ts`
- `public/`, `assets/` (PDF fonts and logo), `prisma/` (schema and migrations)
- `src/` and `scripts/`. These are needed for `next.config.mjs` (next-intl), and for the operational scripts (migrate, bootstrap, worker), which run from source.

**Why two archives.** The CloudLinux Node.js Selector does not allow a real `node_modules` folder in the application root. `node_modules` there must stay the Selector's symlink into the virtual environment, so the dependencies are extracted into the virtual environment itself.

**Sensitive files.** `npm run cpanel:package` lists both archives and **fails the workflow** if either contains any of these:
- `.env` / `.env.*` (templates excepted)
- keys or certificates
- logs, dumps, backups or temporary files
- SQL outside the migrations
- `.git` or `.local`
- private-key blocks inside sources

User documents are never in the release: they live in `DOCUMENT_STORAGE_DIR`, outside the application root.

### Build-time and runtime variables

- **Build:** only `NEXT_PUBLIC_SITE_URL` (`https://dmstech.sa`) and `GIT_COMMIT`. Both are set in the workflow and neither is secret.
  - `DATABASE_URL` is not provided; the build never connects to a database.
  - `src/server/system/config.ts` is enforced only when the **server starts**, not during the build.
- **Runtime:** every other variable stays in **cPanel → Setup Node.js App → Environment variables**, exactly as in §3. The release does not contain or replace any of them.
- **Database connection:** use Supabase's **Session pooler** connection string (with `?sslmode=require`) as `DATABASE_URL`. Prisma migrations require a session-mode connection.

### Installing a release (cPanel only, no SSH)

**First time only:**
- In File Manager, open *Settings* and enable **Show Hidden Files**, so that `.next` is visible.
- Create `/home/dmstechc/dms-releases/` to keep every release you upload. These folders are your rollback copies.

1. **Build.** In GitHub, open *Actions* → **cPanel prebuilt release** → *Run workflow* on `main`. Or use the run that the push to `main` started.
2. **Confirm the build succeeded.** Every step must be green, including "Rehearse first deployment". The run summary shows the manifest.
3. **Download** the artifact `dms-tech-cpanel-production-<sha>` and unzip it on your computer.
   - Optional: check the files against `SHA256SUMS` (Windows: `certutil -hashfile <file> SHA256`).
4. **Upload** both `.tar.gz` files and `DEPLOY_MANIFEST.json` to `/home/dmstechc/dms-releases/<version>-<sha7>/`.
5. **Stop the application:** Setup Node.js App → **Stop App**.
6. **Back up the current release** in File Manager. These are renames, so nothing is lost:
   - In the application root, rename `.next` to `.next.prev`, and `.build-info.json` to `.build-info.json.prev`.
   - In `/home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib/`, rename `node_modules` to `node_modules.prev`.
   - **First switch from a server-built installation:** also compress the application root without `node_modules` (*Compress* → Zip) into `/home/dmstechc/dms-releases/backup-<date>.zip`.
7. **Extract the application archive.** Select `dms-tech-app-….tar.gz` → *Extract* → `/home/dmstechc/repositories/DMS-Tech`.
   - This creates a fresh `.next` and overwrites the application files with the release's.
   - It does not touch the `node_modules` symlink, `.git`, any `.env*` file, or the document storage.
8. **Extract the dependencies.** Select `dms-tech-node_modules-….tar.gz` → *Extract* → `/home/dmstechc/nodevenv/repositories/DMS-Tech/20/lib`. The result must be `…/20/lib/node_modules/`.
   - Do **not** click **Run NPM Install** afterwards.
   - Do **not** run `cpanel:build`.
9. **Do not delete or change environment variables.** They are not part of the release.
10. **Do not touch** `/home/dmstechc/dms-data/` (document storage).
11. **Verify:** Setup Node.js App → *Run JS Script* → `cpanel:verify`. It must end with `✔ release verified`.
    - It checks that the files match the build, that the dependencies match the lockfile, and that the native modules load **on this server**.
    - A `sharp` warning means image optimisation is not available on this server's glibc. Pages still work.
12. **Migrations, only if the release adds them.** Compare `migrations` in `DEPLOY_MANIFEST.json` with the previous release's manifest. If there are new ones:
    1. Take a Supabase backup (Dashboard → Database → Backups, or confirm PITR is on).
    2. Run JS Script → `cpanel:migrate`. This runs `prisma migrate deploy`: it only applies pending migrations and never resets.
13. **Start the application:** **Start App** (or **Restart**).
14. **Check the health endpoints:**
    - `https://dmstech.sa/api/health`: `commit` must equal the first 12 characters of `commit` in the manifest.
    - `https://dmstech.sa/api/ready`: must return `"ready": true`.
    - Then check `https://dmstech.sa` and `/app/login`.
15. **Clean up** after a day of normal operation: delete `.next.prev`, `.build-info.json.prev` and `node_modules.prev`. Keep the release folder in `dms-releases/` for rollback.

**Very first deployment to an empty database:** after step 12 (`cpanel:migrate` is required here), create the organization and first Super Admin as in §7. Use the script `cpanel:bootstrap` instead of `os:bootstrap`, because it does not depend on `node_modules/.bin`.

**Git and the application root.** The application root is also the cPanel Git clone. With prebuilt releases, **stop using "Update from Remote"**: the release already carries the matching sources. If you pull anyway, Git may report local changes after a release is extracted.

A cleaner long-term setup is to point the Node.js application at a dedicated folder, such as `/home/dmstechc/apps/dms-tech`, that is not a Git clone. That is a later infrastructure change, not required now.

**If you change the Node.js version in the Selector,** the virtual environment path changes (`…/20/` → `…/22/`). Extract the dependencies archive again into the new path and run `cpanel:verify`.

### Rollback

Every release folder in `dms-releases/` is tied to a commit, a version and a build time (`DEPLOY_MANIFEST.json`, `.build-info.json`, and `/api/health`).

**Fast rollback, using the renamed copies from step 6:**
1. **Stop App**.
2. Rename `.next` to `.next.failed` and `.next.prev` to `.next`. Do the same for `.build-info.json`.
3. In the virtual environment, rename `node_modules` to `node_modules.failed` and `node_modules.prev` to `node_modules`.
4. Re-extract the **previous** release's application archive from `dms-releases/<previous>/`. This restores the matching `src/`, `scripts/`, `prisma/` and the rest.
5. Run JS Script → `cpanel:verify`.
6. **Start App**, then check `/api/health`. It must show the previous commit.

**Rollback to any older release:**
1. **Stop App**.
2. Move `.next` aside.
3. Extract that release's two archives from `dms-releases/<release>/` (steps 7–8).
4. Run `cpanel:verify`, then **Start App**.

**Database.** Migrations are forward-only. Rolling back the code is safe when the failed release added **no** migrations.

If it did add migrations, the older code may not match the newer schema. In that case, do not roll back the code alone. Choose one of these explicitly:
- Fix forward with a new release.
- Restore the Supabase backup taken in step 12. Data written since that backup is lost.

Never run `db:migrate` (`migrate dev`), `db:seed` or any reset against production.
