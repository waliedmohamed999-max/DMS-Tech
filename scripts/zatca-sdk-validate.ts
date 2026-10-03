/**
 * OPTIONAL: validate generated documents with ZATCA's OFFICIAL SDK (Compliance and Enablement Toolbox, Java).
 * The SDK is NOT part of this repository: it is downloaded by the company from zatca.gov.sa after accepting ZATCA's
 * terms of use (a decision for the company, not for this software). Point ZATCA_SDK_HOME at the unpacked SDK.
 *
 *   ZATCA_SDK_HOME=/opt/zatca-sdk ZATCA_SDK_VALIDATE_CMD="<validation command from the SDK's CLI manual, with {file}>"
 *     npm run zatca:sdk-validate -- [--invoice <invoiceId> | --document <zatcaDocumentId> | --file x.xml]
 *
 * The SDK's command-line syntax is documented only in the "ZATCA E-Invoice Java SDK (CLI) Manual" that ships INSIDE the
 * SDK download (Developer Portal manual §2.3.6) — so it is configuration here, not hard-coded. The Developer Portal
 * manual states the SDK JAR runs on JDK >= 11 and < 15. Exit code and output are passed through; without the SDK the
 * script reports NOT_AVAILABLE and exits 2 — it never reports a pass it did not observe.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../src/server/db";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const home = process.env.ZATCA_SDK_HOME;
  if (!home || !existsSync(home)) {
    console.log(JSON.stringify({ status: "NOT_AVAILABLE", reason: "ZATCA_SDK_HOME not set — download the official SDK from zatca.gov.sa (terms of use apply)" }));
    process.exitCode = 2;
    return;
  }
  let xml: string;
  if (opt("file")) xml = readFileSync(opt("file")!, "utf8");
  else {
    const doc = opt("document")
      ? await prisma.zatcaDocument.findUniqueOrThrow({ where: { id: opt("document")! } })
      : await prisma.zatcaDocument.findFirstOrThrow({ where: opt("invoice") ? { invoiceId: opt("invoice") } : {}, orderBy: { createdAt: "desc" } });
    xml = doc.xml;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "zatca-sdk-"));
  try {
    const file = path.join(dir, "invoice.xml");
    writeFileSync(file, xml);
    const template = process.env.ZATCA_SDK_VALIDATE_CMD;
    if (!template || !template.includes("{file}")) {
      console.log(JSON.stringify({ status: "NOT_AVAILABLE", reason: "set ZATCA_SDK_VALIDATE_CMD to the validation command from the SDK's CLI manual, using {file} for the XML path" }));
      process.exitCode = 2;
      return;
    }
    const r = spawnSync(template.replace("{file}", JSON.stringify(file)), { encoding: "utf8", shell: true, cwd: home });
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    console.log(JSON.stringify({ status: r.status === 0 ? "SDK_EXIT_0" : "SDK_REPORTED_FAILURE", exitCode: r.status }));
    process.exitCode = r.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
