/**
 * Rollback drill probe: as Super Admin against the PREVIOUS release (BASE), open the pages that read Phase 10 data.
 * Reports HTTP status per page — the drill documents what breaks, it does not "fix" the old release.
 */
import "dotenv/config";
import { prisma } from "../../src/server/db";

const B = process.env.BASE!;

async function login(email: string, password: string) {
  const html = await (await fetch(`${B}/app/login`)).text();
  const fd = new FormData();
  const un = (v: string) => v.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const [tag] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name?.startsWith("$ACTION")) fd.append(un(name), un(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
  }
  fd.append("email", email);
  fd.append("password", password);
  fd.append("next", "/app");
  const r = await fetch(`${B}/app/login`, { method: "POST", body: fd, redirect: "manual", headers: { origin: B } });
  return { status: r.status, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function main() {
  const emp = await prisma.employeeBankAccount.findFirst({ where: { ibanCiphertext: { not: null } }, select: { employeeId: true } });
  const l = await login("ops.lead@dmstech.sa", process.env.ADMIN_PASSWORD!);
  console.log(`admin login on previous release: ${l.status}`);
  const pages = ["/app", "/app/crm/leads", "/app/finance/invoices", "/app/projects", "/app/hr/employees", "/app/admin/system-health", ...(emp ? [`/app/hr/employees/${emp.employeeId}`, `/app/hr/employees/${emp.employeeId}?tab=compensation`] : [])];
  for (const p of pages) {
    const r = await fetch(B + p, { headers: { cookie: l.cookie }, redirect: "manual" });
    const body = await r.text();
    // streamed pages keep HTTP 200 and render the error boundary; the RSC payload then carries an error digest
    const broken = r.status >= 500 || /\\"digest\\":\\"|"digest":"/.test(body);
    console.log(`${broken ? "BROKEN" : "ok    "} ${r.status} ${p}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
