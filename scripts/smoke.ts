/**
 * Production-safe smoke suite (Phase 9 — docs/DEPLOYMENT-RUNBOOK.md#smoke). READ-ONLY: no business data is written.
 * (A real sign-in creates one session row and an audit entry, exactly like a person signing in.)
 *
 *   BASE_URL=https://dms.example npm run smoke
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… BASE_URL=… npm run smoke    # + authenticated checks with a LOW-privilege account
 */
import "dotenv/config";

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const results: { check: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push({ check: name, ok, detail });
const get = (p: string, init: RequestInit = {}) => fetch(base + p, { redirect: "manual", ...init });

async function login(email: string, password: string) {
  const page = await get("/app/login");
  const html = await page.text();
  // replay the form exactly as a browser without JavaScript would (React's hidden server-action fields)
  const fd = new FormData();
  const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const [tag] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (!name?.startsWith("$ACTION")) continue;
    fd.append(unescape(name), unescape(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
  }
  fd.append("email", email);
  fd.append("password", password);
  fd.append("next", "/app");
  const r = await get("/app/login", { method: "POST", body: fd, headers: { origin: base } });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return cookie.includes("dms_os=") ? cookie : null;
}

async function main() {
  const h = await get("/api/health");
  const hj = (await h.json().catch(() => ({}))) as { status?: string; version?: string };
  check("health", h.status === 200 && hj.status === "ok", `v${hj.version ?? "?"}`);

  const r = await get("/api/ready");
  const rj = (await r.json().catch(() => ({}))) as { ready?: boolean; checks?: { name: string; status: string }[] };
  check("ready", r.status === 200 && rj.ready === true, (rj.checks ?? []).filter((c) => c.status !== "ok").map((c) => `${c.name}:${c.status}`).join(", ") || "all ok");

  const home = await get("/");
  check("public_site", home.status === 200 || (home.status >= 300 && home.status < 400), String(home.status));
  const csp = home.headers.get("content-security-policy") ?? "";
  check("security_headers", Boolean(csp.includes("frame-ancestors 'none'") && home.headers.get("x-content-type-options") === "nosniff"), csp ? "csp present" : "csp missing");
  if (base.startsWith("https://")) check("hsts", Boolean(home.headers.get("strict-transport-security")), home.headers.get("strict-transport-security") ?? "missing");

  const lp = await get("/app/login");
  check("login_page", lp.status === 200, String(lp.status));
  const app = await get("/app");
  check("auth_required", app.status >= 300 && app.status < 400 && (app.headers.get("location") ?? "").includes("/app/login"), app.headers.get("location") ?? String(app.status));
  const up = await get("/app/documents/upload", { method: "POST", headers: { origin: "https://evil.example" } });
  check("upload_requires_session", up.status === 401 || (up.status >= 300 && up.status < 400), String(up.status));

  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    const cookie = await login(process.env.SMOKE_EMAIL, process.env.SMOKE_PASSWORD);
    check("login", Boolean(cookie), cookie ? "session issued" : "no session cookie");
    if (cookie) {
      const dash = await get("/app", { headers: { cookie } });
      check("dashboard", dash.status === 200, String(dash.status));
      const sys = await get("/app/admin/system-health", { headers: { cookie } });
      const t = await sys.text();
      check("permission_denial", /requires the system\.health\.view permission|system\.health\.view/.test(t) || sys.status === 403, "low-privilege user sees access denied");
      const doc = await get("/app/documents/doesnotexist123/download", { headers: { cookie } });
      check("document_authorization", doc.status === 404 || doc.status === 403, String(doc.status));
      check("worker_status", (rj.checks ?? []).some((c) => c.name === "worker"), (rj.checks ?? []).find((c) => c.name === "worker")?.status ?? "absent");
    }
  }
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "✔" : "✖"} ${x.check}${x.detail ? ` — ${x.detail}` : ""}`);
  console.log(`smoke: ${results.length - failed.length}/${results.length} passed against ${base}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("smoke crashed:", (e as Error).message);
  process.exitCode = 1;
});
