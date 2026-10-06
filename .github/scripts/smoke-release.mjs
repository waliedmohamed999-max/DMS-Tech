// CI only: HTTP smoke test of an extracted release started with app.js against a throwaway CI database.
// Usage: node smoke-release.mjs <base-url> [--full]   (--full: readiness + sign-in with SMOKE_EMAIL / SMOKE_PASSWORD)
const [base] = process.argv.slice(2);
const full = process.argv.includes("--full");
const results = [];
const leak = (b) => /\/home\/runner|node_modules|at \w+ \(|postgresql:\/\/|-----BEGIN/.test(b);
async function check(name, url, opts, test) {
  try {
    const r = await fetch(base + url, { redirect: "manual", ...opts });
    const body = await r.text();
    const v = test(r, body);
    results.push([v === true ? "PASS" : "FAIL", name, r.status, v === true ? "" : v]);
    return { r, body };
  } catch (e) {
    results.push(["FAIL", name, "-", e.message]);
    return {};
  }
}

const home = await check("GET / (ar homepage)", "/", {}, (r, b) => (r.status === 200 && /<html/.test(b)) || `status ${r.status}`);
await check("GET /en", "/en", {}, (r) => r.status === 200 || `status ${r.status}`);
await check("GET /about", "/about", {}, (r) => r.status === 200 || `status ${r.status}`);
await check("GET /ar → / (default locale)", "/ar", {}, (r) => (r.status === 307 && r.headers.get("location") === "/") || `status ${r.status} ${r.headers.get("location")}`);
const asset = home.body?.match(/\/_next\/static\/[^"'\s)]+\.(?:js|css)/)?.[0];
await check(`static asset ${asset}`, asset ?? "/_next/static/none.js", {}, (r) => (r.status === 200 && /immutable/.test(r.headers.get("cache-control") ?? "")) || `status ${r.status}`);
await check("public/images/logo.png", "/images/logo.png", {}, (r) => (r.status === 200 && /image\/png/.test(r.headers.get("content-type") ?? "")) || `status ${r.status}`);
await check("GET /api/health", "/api/health", {}, (r, b) => (r.status === 200 && JSON.parse(b).status === "ok" && !leak(b)) || b);
await check("GET /app/login", "/app/login", {}, (r) => r.status === 200 || `status ${r.status}`);
await check("GET /app → sign-in redirect", "/app", {}, (r) => [302, 303, 307].includes(r.status) || `status ${r.status}`);
await check("POST /api/leads {} → 4xx, no leak", "/api/leads", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}" }, (r, b) => (r.status >= 400 && r.status < 500 && !leak(b)) || `status ${r.status}`);
await check("unknown page → 404, no leak", "/no-such-page", {}, (r, b) => (r.status === 404 && !leak(b)) || `status ${r.status}`);
await check("headers: CSP + HSTS, no x-powered-by", "/", {}, (r) => (Boolean(r.headers.get("content-security-policy")) && Boolean(r.headers.get("strict-transport-security")) && !r.headers.get("x-powered-by")) || "missing header");

if (full) {
  await check("GET /api/ready → ready", "/api/ready", {}, (r, b) => {
    const j = JSON.parse(b);
    return (r.status === 200 && j.ready === true && !leak(b)) || `${r.status} ${JSON.stringify(j.checks)}`;
  });
  // sign in through the login Server Action (progressive-enhancement form post, as a browser without JS would)
  const html = await (await fetch(`${base}/app/login`)).text();
  const form = html.match(/<form[^>]*>([\s\S]*?)<\/form>/)?.[1] ?? "";
  const fd = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    if (name) fd.append(name, (m[0].match(/value="([^"]*)"/)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  fd.append("email", process.env.SMOKE_EMAIL ?? "");
  fd.append("password", process.env.SMOKE_PASSWORD ?? "");
  await check("sign-in (Server Action, argon2, session)", "/app/login", { method: "POST", body: fd, headers: { origin: base } }, (r) => {
    const cookies = r.headers.getSetCookie().map((c) => c.split("=")[0]);
    return (r.status === 303 && cookies.includes("__Host-dms_os")) || `status ${r.status} location ${r.headers.get("location")} cookies ${cookies.join(",")}`;
  });
}

for (const r of results) console.log(r.join(" | "));
const failedCount = results.filter((r) => r[0] === "FAIL").length;
console.log(failedCount ? `✖ ${failedCount} failed` : `✔ ${results.length} checks passed`);
process.exit(failedCount ? 1 : 0);
