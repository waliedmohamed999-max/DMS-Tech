/**
 * Phase 12 (P12-03 / P12-04) — managed PostgreSQL verification. READ-ONLY. Run against the hosted staging database:
 *   npx tsx scripts/hosted/verify-db.ts [--json out.json]
 * Uses DATABASE_URL (the APPLICATION role). Never prints credentials. Encryption at rest cannot be observed from SQL:
 * it is reported from DB_ENCRYPTION_AT_REST (provider evidence) and is BLOCKED_EXTERNAL without it.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import pg from "pg";

type Status = "PASS" | "WARN" | "BLOCKED_EXTERNAL" | "BLOCKED_CODE";
const out: { key: string; status: Status; detail: string }[] = [];
const add = (key: string, status: Status, detail: string) => {
  out.push({ key, status, detail });
  console.log(`${status.padEnd(16)} ${key.padEnd(24)} ${detail}`);
};

/** triggers / constraints / indexes the application relies on (Phases 1–11) */
const EXPECTED_TRIGGERS = ["zatca_document_guard", "zatca_submission_append_only", "document_scan_guard", "document_version_immutable", "deployment_marker_immutable"];
const EXPECTED_CONSTRAINTS = ["EmployeeBankAccount_iban_present_chk", "EmployeeBankAccount_last4_chk", "ZatcaEgsUnit_key_ref_chk", "DocumentVersionScan_status_chk", "ZatcaDocument_status_chk"];
const EXPECTED_INDEXES = ["ZatcaDocument_one_live_per_invoice", "ZatcaPartyProfile_one_seller"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode") ?? "(none)";
  add("connection_sslmode", sslmode === "verify-full" ? "PASS" : sslmode === "require" || sslmode === "verify-ca" ? "WARN" : "BLOCKED_CODE", `sslmode=${sslmode}${sslmode === "verify-full" ? "" : " — use verify-full with the provider CA so the server certificate is checked"}`);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const q = async <T = Record<string, unknown>>(sql: string) => (await c.query(sql)).rows as T[];
    const [v] = await q<{ v: string; n: string }>("select version() as v, current_setting('server_version_num') as n");
    add("server_version", Number(v.n) >= 150000 ? "PASS" : "WARN", v.v.split(",")[0]);
    const [ssl] = await q<{ ssl: boolean; version: string | null; cipher: string | null }>("select ssl, version, cipher from pg_stat_ssl where pid = pg_backend_pid()");
    add("tls_in_use", ssl?.ssl ? "PASS" : "BLOCKED_CODE", ssl?.ssl ? `${ssl.version} ${ssl.cipher}` : "this connection is NOT encrypted");
    const [role] = await q<{ rolname: string; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; rolreplication: boolean; rolconnlimit: number }>("select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolconnlimit from pg_roles where rolname = current_user");
    const powers = (["rolsuper", "rolcreaterole", "rolbypassrls", "rolreplication"] as const).filter((k) => role[k]);
    add("app_role", powers.length ? "BLOCKED_CODE" : "PASS", `${role.rolname}${powers.length ? ` has ${powers.join(", ")} — use a dedicated non-superuser application role` : " (no superuser / createrole / bypassrls / replication)"}${role.rolcreatedb ? "; can CREATE DATABASE (acceptable only if the provider requires it)" : ""}`);
    const [lim] = await q<{ max: string; used: string; reserved: string }>("select current_setting('max_connections') as max, (select count(*) from pg_stat_activity)::text as used, current_setting('superuser_reserved_connections') as reserved");
    add("connection_limits", "PASS", `max_connections=${lim.max}, in use=${lim.used}, reserved=${lim.reserved}, role limit=${role.rolconnlimit < 0 ? "none" : role.rolconnlimit} — size the app pool (web instances × pool + worker) below this`);
    const [m] = await q<{ n: string; failed: string }>(`select count(*)::text as n, count(*) filter (where finished_at is null or rolled_back_at is not null)::text as failed from "_prisma_migrations"`);
    add("migrations", m.failed === "0" ? "PASS" : "BLOCKED_CODE", `${m.n} applied, ${m.failed} unfinished / rolled back`);
    const trig = (await q<{ tgname: string }>("select tgname from pg_trigger where not tgisinternal")).map((r) => r.tgname);
    const missingT = EXPECTED_TRIGGERS.filter((t) => !trig.includes(t));
    add("guard_triggers", missingT.length ? "BLOCKED_CODE" : "PASS", missingT.length ? `missing: ${missingT.join(", ")}` : `${EXPECTED_TRIGGERS.length} expected guards present (${trig.length} triggers total)`);
    const cons = (await q<{ conname: string }>("select conname from pg_constraint where contype = 'c'")).map((r) => r.conname);
    const missingC = EXPECTED_CONSTRAINTS.filter((x) => !cons.includes(x));
    add("check_constraints", missingC.length ? "BLOCKED_CODE" : "PASS", missingC.length ? `missing: ${missingC.join(", ")}` : `${EXPECTED_CONSTRAINTS.length} expected checks present`);
    const idx = (await q<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'")).map((r) => r.indexname);
    const missingI = EXPECTED_INDEXES.filter((x) => !idx.includes(x));
    add("partial_indexes", missingI.length ? "BLOCKED_CODE" : "PASS", missingI.length ? `missing: ${missingI.join(", ")}` : "expected partial unique indexes present");
    const [marker] = await q<{ environment: string }>(`select environment from "DeploymentMarker" where id = 1`).catch(() => []);
    add("environment_marker", marker ? (marker.environment === (process.env.APP_ENV ?? "") ? "PASS" : "BLOCKED_CODE") : "WARN", marker ? `marker=${marker.environment}, APP_ENV=${process.env.APP_ENV ?? "(unset)"}` : "no marker yet (written by os:bootstrap)");
    const [iban] = await q<{ plain: string }>(`select count(*)::text as plain from "EmployeeBankAccount" where iban is not null`);
    add("iban_encrypted_storage", iban.plain === "0" ? "PASS" : "BLOCKED_CODE", iban.plain === "0" ? "no plaintext IBAN rows" : `${iban.plain} plaintext IBAN row(s) — run hr:encrypt-iban`);
    // the audit trail must not be truncatable / deletable by the application role
    const [audit] = await q<{ del: boolean; trunc: boolean }>(`select has_table_privilege(current_user, '"AuditLog"', 'DELETE') as del, has_table_privilege(current_user, '"AuditLog"', 'TRUNCATE') as trunc`);
    add("audit_protection", audit.trunc ? "WARN" : "PASS", `application role: DELETE=${audit.del}, TRUNCATE=${audit.trunc}${audit.trunc ? " — revoke TRUNCATE on AuditLog from the app role (GO-LIVE.md)" : ""}`);
  } finally {
    await c.end();
  }
  const drift = spawnSync("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code", { shell: true, encoding: "utf8" });
  add("schema_drift", drift.status === 0 ? "PASS" : drift.status === 2 ? "BLOCKED_CODE" : "WARN", drift.status === 0 ? "database matches prisma/schema.prisma" : drift.status === 2 ? "schema differs" : "could not compute");
  const ear = process.env.DB_ENCRYPTION_AT_REST?.trim();
  add("encryption_at_rest", ear && !ear.startsWith("<") ? "PASS" : "BLOCKED_EXTERNAL", ear && !ear.startsWith("<") ? `provider evidence: ${ear}` : "not observable from SQL — record the provider setting / evidence in DB_ENCRYPTION_AT_REST");
  const pitr = process.env.DB_PITR_EVIDENCE?.trim();
  add("backups_pitr", pitr ? "PASS" : "BLOCKED_EXTERNAL", pitr ? `provider evidence: ${pitr}` : "provider automated backups / PITR not evidenced (DB_PITR_EVIDENCE)");
  const i = process.argv.indexOf("--json");
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
  if (out.some((o) => o.status === "BLOCKED_CODE")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String((e as Error).message).replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://[redacted]"));
  process.exitCode = 1;
});
