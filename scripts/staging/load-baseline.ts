/**
 * STAGING performance BASELINE (Phase 10) — measures, does not set targets. Through the HTTPS proxy (2 instances),
 * authenticated as a Super Admin (sees every module), fixed concurrency. Output: p50 / p95 / max / error rate.
 *   node scripts/staging/with-env.mjs . NODE_EXTRA_CA_CERTS=.local/staging/tls/ca.crt ADMIN_PASSWORD=… npx tsx scripts/staging/load-baseline.ts
 */
import { writeFileSync } from "node:fs";

const B = process.env.LOAD_BASE ?? "https://staging.127.0.0.1.nip.io:8443";
const N = Number(process.env.LOAD_N ?? 200);
const C = Number(process.env.LOAD_C ?? 10);

async function login(email: string, password: string) {
  const t0 = performance.now();
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
  return { ms: performance.now() - t0, status: r.status, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
};

async function bench(name: string, path: string, cookie: string) {
  const times: number[] = [];
  let errors = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: C }, async () => {
      while (next < N) {
        next++;
        const s = performance.now();
        try {
          const r = await fetch(B + path, { headers: { cookie }, redirect: "manual" });
          await r.arrayBuffer();
          if (r.status !== 200) errors++;
        } catch {
          errors++;
        }
        times.push(performance.now() - s);
      }
    })
  );
  const secs = (performance.now() - t0) / 1000;
  return { name, path, requests: times.length, concurrency: C, p50: pct(times, 50), p95: pct(times, 95), max: Math.round(Math.max(...times)), errorRate: +(errors / times.length).toFixed(4), rps: +(times.length / secs).toFixed(1) };
}

async function main() {
  // login: sequential (the per-account limiter is a security control, not a bottleneck to load-test)
  const logins: number[] = [];
  let cookie = "";
  for (let i = 0; i < 5; i++) {
    const l = await login("ops.lead@dmstech.sa", process.env.ADMIN_PASSWORD!);
    if (l.status !== 303 && l.status !== 302 && l.status !== 307) throw new Error(`login failed: ${l.status}`);
    logins.push(l.ms);
    cookie = l.cookie;
  }
  const rows: unknown[] = [{ name: "login (form POST, scrypt/argon hash)", requests: logins.length, concurrency: 1, p50: pct(logins, 50), p95: pct(logins, 95), max: Math.round(Math.max(...logins)), errorRate: 0 }];
  // warm-up (first render of each route compiles nothing in production, but primes connections)
  for (const p of ["/app", "/app/crm/leads", "/app/projects", "/app/finance/invoices"]) await fetch(B + p, { headers: { cookie } }).then((r) => r.arrayBuffer());
  for (const [name, path] of [
    ["dashboard", "/app"],
    ["CRM leads list", "/app/crm/leads"],
    ["CRM search (leads ?q=)", "/app/crm/leads?q=Lead"],
    ["projects list", "/app/projects"],
    ["finance invoices list", "/app/finance/invoices"],
    ["finance receivables", "/app/finance/receivables"],
    ["HR employees list", "/app/hr/employees"],
    ["health (public)", "/api/health"]
  ]) rows.push(await bench(name, path, cookie));
  const out = { measuredAt: new Date().toISOString(), base: B, topology: "local rehearsal: 2 × next start behind HTTPS proxy, TLS PostgreSQL on the same machine", rows };
  writeFileSync(".local/staging/timings/load-baseline.json", JSON.stringify(out, null, 2));
  console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
