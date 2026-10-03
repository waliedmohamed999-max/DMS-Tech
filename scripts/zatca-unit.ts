/**
 * ZATCA operator CLI (Phase 11 — docs/ZATCA.md). Configuration and reconciliation only; nothing here talks to ZATCA.
 *
 *   npm run zatca:unit -- status
 *   npm run zatca:unit -- create --name EGS-1 --env SANDBOX|SIMULATION|PRODUCTION [--map 1000] --csid-ref env:ZATCA_CSID --secret-ref env:ZATCA_SECRET [--key-ref file:/etc/dms/zatca-key.pem] [--cert cert.pem]
 *   npm run zatca:unit -- activate --unit <id> --confirm "<production CSID reference>"
 *   npm run zatca:unit -- seller --json seller.json             (national address / identifiers of the company)
 *   npm run zatca:unit -- buyer --client <clientId> --json buyer.json
 *   npm run zatca:unit -- unlock --unit <id> --counter <last ICV accepted by ZATCA> --last-hash <its hash> --reference "<evidence>"
 *
 * Secrets are REFERENCES (env:VAR / enc:id; keys env:VAR or file:/path) — never values. Everything is audited.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { prisma } from "../src/server/db";
import { systemCtx } from "../src/server/context";
import { unitOfWork } from "../src/server/events/bus";
import { unlockAfterRestore, zatcaReadiness } from "../src/server/zatca/service";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i > 0 ? args[i + 1] : undefined;
};
const PROFILE_FIELDS = ["registrationName", "vatNumber", "otherId", "otherIdScheme", "streetName", "additionalStreetName", "buildingNumber", "plotIdentification", "district", "city", "postalCode", "countryCode"] as const;

async function org() {
  const o = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  return o;
}

async function main() {
  const o = await org();
  const audit = (action: string, entityType: string, entityId: string | null, after: Record<string, unknown>) =>
    unitOfWork(systemCtx(o.id, { ip: "cli", userAgent: "zatca-unit" }), (_tx, uow) => uow.audit({ action, entityType, entityId, after }));
  if (cmd === "status") {
    const units = await prisma.zatcaEgsUnit.findMany({ select: { id: true, name: true, environment: true, functionalityMap: true, status: true, invoiceCounter: true, certificateExpiresAt: true, lockedReason: true } });
    const docs = await prisma.zatcaDocument.groupBy({ by: ["environment", "status"], _count: true });
    console.log(JSON.stringify({ readiness: await zatcaReadiness(), units, documents: docs }, null, 2));
    return;
  }
  if (cmd === "create") {
    const env = (opt("env") ?? "").toUpperCase();
    if (!["SANDBOX", "SIMULATION", "PRODUCTION"].includes(env)) throw new Error("--env SANDBOX | SIMULATION | PRODUCTION");
    let certificatePem: string | null = null;
    let certificateExpiresAt: Date | null = null;
    if (opt("cert")) {
      certificatePem = readFileSync(opt("cert")!, "utf8");
      certificateExpiresAt = new Date(new X509Certificate(certificatePem).validTo);
    }
    const u = await prisma.zatcaEgsUnit.create({ data: { organizationId: o.id, name: opt("name") ?? "EGS-1", environment: env, functionalityMap: opt("map") ?? "1000", csidTokenRef: opt("csid-ref") ?? null, csidSecretRef: opt("secret-ref") ?? null, privateKeyRef: opt("key-ref") ?? null, certificatePem, certificateExpiresAt } });
    await audit("zatca.unit_created", "ZatcaEgsUnit", u.id, { name: u.name, environment: env, functionalityMap: u.functionalityMap });
    console.log(JSON.stringify({ ok: true, id: u.id, status: u.status, next: "activate after onboarding (production CSID installed)" }));
    return;
  }
  if (cmd === "activate") {
    const id = opt("unit")!;
    const ref = opt("confirm");
    if (!ref) throw new Error('--confirm "<evidence of the onboarded CSID>" is required');
    const u = await prisma.zatcaEgsUnit.update({ where: { id }, data: { status: "ACTIVE" } });
    await audit("zatca.unit_activated", "ZatcaEgsUnit", id, { environment: u.environment, reference: ref });
    console.log(JSON.stringify({ ok: true, id, status: u.status }));
    return;
  }
  if (cmd === "seller" || cmd === "buyer") {
    const raw = JSON.parse(readFileSync(opt("json")!, "utf8")) as Record<string, unknown>;
    const data = Object.fromEntries(PROFILE_FIELDS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k] === null ? null : String(raw[k])]));
    const clientId = cmd === "buyer" ? opt("client")! : null;
    if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, organizationId: o.id } }))) throw new Error("unknown client");
    const existing = await prisma.zatcaPartyProfile.findFirst({ where: { organizationId: o.id, clientId } });
    const row = existing ? await prisma.zatcaPartyProfile.update({ where: { id: existing.id }, data }) : await prisma.zatcaPartyProfile.create({ data: { organizationId: o.id, clientId, ...data } });
    await audit("zatca.party_profile_saved", "ZatcaPartyProfile", row.id, { party: cmd, clientId, fields: Object.keys(data) });
    console.log(JSON.stringify({ ok: true, id: row.id }));
    return;
  }
  if (cmd === "unlock") {
    await unlockAfterRestore(o.id, opt("unit")!, { counter: Number(opt("counter")), lastHash: opt("last-hash") ?? null, reference: opt("reference") ?? "" });
    console.log(JSON.stringify({ ok: true }));
    return;
  }
  console.log("usage: status | create | activate | seller | buyer | unlock (see the header of scripts/zatca-unit.ts)");
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
