// LOCAL STAGING REHEARSAL — generates .local/staging/staging.env once (fresh random secrets, never the development
// ones, never committed). Refuses to overwrite an existing file.
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = ".local/staging/staging.env";
if (existsSync(file)) {
  console.error("refused: .local/staging/staging.env already exists");
  process.exit(1);
}
const p = (x) => path.resolve(x).replace(/\\/g, "/");
const pw = randomBytes(24).toString("base64url");
const admin = randomBytes(24).toString("base64url");
const key = () => randomBytes(32).toString("base64");
const tls = p(".local/staging/tls");
const lines = [
  `# LOCAL STAGING REHEARSAL — generated ${new Date().toISOString()} — never commit, never reuse`,
  "NODE_ENV=production",
  "APP_ENV=staging",
  "NEXT_PUBLIC_SITE_URL=https://staging.127.0.0.1.nip.io:8443",
  `STAGING_PG_ADMIN_PASSWORD=${admin}`,
  `STAGING_PG_APP_PASSWORD=${pw}`,
  `DATABASE_URL=postgresql://dms_app:${pw}@localhost:54330/dms_os_staging?sslmode=verify-full&sslrootcert=${tls}/ca.crt`,
  `VERIFY_DATABASE_URL=postgresql://dms_admin:${admin}@localhost:54330/postgres?sslmode=verify-full&sslrootcert=${tls}/ca.crt`,
  `INTEGRATION_MASTER_KEY=${key()}`,
  `HR_FIELD_KEY=${key()}`,
  "HR_FIELD_KEY_VERSION=1",
  "DOCUMENT_STORAGE=local",
  `DOCUMENT_STORAGE_DIR=${p(".local/staging/documents")}`,
  "STORAGE_BACKUP_POLICY=local rehearsal volume - storage:backup nightly to BACKUP_DIR (production: S3 versioning required)",
  `BACKUP_DIR=${p(".local/staging/backups")}`,
  "BACKUP_KEEP_DAILY=7",
  "BACKUP_KEEP_WEEKLY=4",
  "BACKUP_KEEP_MONTHLY=12",
  "BACKUP_MAX_AGE_HOURS=26",
  `PG_DUMP_PATH=${p(".local/pgtools/pgsql/bin/pg_dump.exe")}`,
  `PG_RESTORE_PATH=${p(".local/pgtools/pgsql/bin/pg_restore.exe")}`,
  "REQUIRE_WORKER=1",
  "RETENTION_DRY_RUN=1",
  `LOG_DIR=${p(".local/staging/logs")}`,
  `NODE_EXTRA_CA_CERTS=${tls}/ca.crt`,
  "OS_ORG_SLUG=dms-tech",
  "ZATCA_STATUS=NOT_CONFIGURED",
  "ANTIVIRUS_DECISION=NOT_SCANNED_ACCEPTED"
];
writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`written ${file} (${lines.length} lines)`);
