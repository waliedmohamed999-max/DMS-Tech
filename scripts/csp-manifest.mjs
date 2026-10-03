/**
 * Phase 11 — public-site CSP manifest (runs after `next build`, see package.json "postbuild").
 *
 * The public website is statically generated, so its HTML cannot carry a per-request nonce. Instead every inline
 * <script> body and every inline style (style="" attribute values and <style> bodies) in each prerendered page is
 * hashed (sha256) at build time. src/proxy.ts then sends, per page, a CSP that allows exactly those hashes —
 * no 'unsafe-inline'. Inline styles are allowed by hash via 'unsafe-hashes' (CSP3), i.e. only these exact values.
 *
 * Output: .next/csp-public.json  { buildId, generatedAt, routes: { "/ar/about": { s: [...], y: [...] } }, notFound, styleUnion }
 * The proxy refuses a manifest whose buildId differs from .next/BUILD_ID (stale manifest = strict CSP, never a weaker one).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".next");
const appDir = path.join(root, "server", "app");
if (!existsSync(appDir)) {
  console.error(`csp-manifest: ${appDir} not found — run next build first`);
  process.exit(1);
}
const h = (s) => `sha256-${createHash("sha256").update(s, "utf8").digest("base64")}`;
// HTML attribute values are entity-encoded; the browser hashes the decoded value
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function scan(html) {
  const s = new Set();
  const y = new Set();
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/(ld\+)?json"/.test(m[1])) continue; // data blocks are never executed
    s.add(h(m[2]));
  }
  for (const m of html.matchAll(/\sstyle="([^"]*)"/g)) y.add(h(decode(m[1])));
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) y.add(h(m[1]));
  return { s: [...s].sort(), y: [...y].sort() };
}

const routes = {};
const styleUnion = new Set();
let maxLen = 0;
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (path.relative(appDir, p) === "app") continue; // /app (Business OS) is dynamic and uses a nonce
      walk(p);
    } else if (p.endsWith(".html")) {
      const rel = "/" + path.relative(appDir, p).replace(/\\/g, "/").replace(/\.html$/, "");
      const entry = scan(readFileSync(p, "utf8"));
      entry.y.forEach((x) => styleUnion.add(x));
      routes[rel] = entry;
      maxLen = Math.max(maxLen, entry.s.join(" ").length + entry.y.join(" ").length);
    }
  }
};
walk(appDir);

const buildId = readFileSync(path.join(root, "BUILD_ID"), "utf8").trim();
const notFound = routes["/_not-found"] ?? { s: [], y: [] };
const out = { buildId, generatedAt: new Date().toISOString(), routes, notFound, styleUnion: [...styleUnion].sort() };
writeFileSync(path.join(root, "csp-public.json"), JSON.stringify(out));
console.log(JSON.stringify({ ok: true, buildId, pages: Object.keys(routes).length, distinctStyleHashes: styleUnion.size, maxHashBytesPerPage: maxLen }));
