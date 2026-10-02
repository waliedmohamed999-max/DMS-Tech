import type { Tx } from "../db";

/**
 * Concurrency-safe readable numbers. A single atomic UPSERT ... RETURNING increments the
 * per-organization counter, so concurrent transactions serialise on that row and can
 * never produce the same value (unlike count()+1). Gaps are possible on rollback, by design.
 */
async function bump(tx: Tx, organizationId: string, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("organizationId", "key", "value") VALUES (${organizationId}, ${key}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

const pad = (n: number) => String(n).padStart(6, "0");

/** LEAD-000001 / OPP-000001 / CLI-000001 / SRV-000001 / PKG-000001 / TASK-000001 */
export async function nextNumber(tx: Tx, organizationId: string, key: "LEAD" | "OPP" | "CLI" | "SRV" | "PKG" | "TASK" | "VEN" | "EMP" | "JOB" | "CAN" | "OFR" | "AST" | "DOC" | "TCK" | "KB" | "CMP"): Promise<string> {
  return `${key}-${pad(await bump(tx, organizationId, key))}`;
}

/** Yearly series: Q-2026-000001 (quotations), CTR-2026-000001 (contracts), PRJ-2026-000001 (projects), INV- / PAY- / EXP- (finance). Counter restarts each year. */
export async function nextYearlyNumber(tx: Tx, organizationId: string, prefix: "Q" | "CTR" | "PRJ" | "INV" | "PAY" | "EXP" | "PR" | "PO", year: number): Promise<string> {
  return `${prefix}-${year}-${pad(await bump(tx, organizationId, `${prefix}-${year}`))}`;
}
