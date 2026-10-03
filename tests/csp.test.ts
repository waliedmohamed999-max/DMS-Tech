import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicCsp, publicRouteKey, type PublicCspManifest } from "@/lib/csp/public";
import { osCsp } from "@/lib/os/csp";

/** Phase 11 (P11-A) — CSP without 'unsafe-inline' for the public site; /app nonce policy must not regress. */
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
const sha = (s: string) => `sha256-${createHash("sha256").update(s, "utf8").digest("base64")}`;

describe("public CSP (static pages: build-time hashes)", () => {
  const entry = { s: [sha("self.__next_f.push([0])")], y: [sha("color:transparent")] };
  const csp = publicCsp({ entry });

  it("allows exactly the hashed inline scripts — no unsafe-inline / unsafe-eval / nonce", () => {
    expect(directive(csp, "script-src")).toBe(`script-src 'self' '${entry.s[0]}'`);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
  it("allows inline styles only by exact hash ('unsafe-hashes' + sha256), never wholesale", () => {
    expect(directive(csp, "style-src")).toBe(`style-src 'self' 'unsafe-hashes' '${entry.y[0]}'`);
  });
  it("keeps every other directive strict and adds no third-party origins", () => {
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-src 'none'", "connect-src 'self'"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/https:\/\/(?!\*\.supabase\.co)/);
  });
  it("a page without inline styles gets style-src 'self' only", () => {
    expect(directive(publicCsp({ entry: { s: [], y: [] } }), "style-src")).toBe("style-src 'self'");
  });
});

describe("public CSP (dynamic pages / unknown paths: nonce)", () => {
  it("uses the request nonce plus the static 404 hashes and the site-wide style hashes", () => {
    const csp = publicCsp({ nonce: "bm9uY2U=", notFound: { s: [sha("nf")], y: [sha("a:b")] }, styleUnion: [sha("color:transparent")] });
    expect(directive(csp, "script-src")).toBe(`script-src 'self' 'nonce-bm9uY2U=' '${sha("nf")}'`);
    expect(directive(csp, "style-src")).toContain(sha("color:transparent"));
    expect(directive(csp, "style-src")).toContain(sha("a:b"));
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
  it("without a manifest (missing / stale build) the policy stays STRICT — it never falls back to unsafe-inline", () => {
    const csp = publicCsp({ nonce: "x" });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-x'");
    expect(directive(csp, "style-src")).toBe("style-src 'self'");
  });
  it("development is the only mode with unsafe-inline / unsafe-eval", () => {
    expect(publicCsp({ dev: true })).toMatch(/'unsafe-eval'/);
  });
});

describe("public route keys (localePrefix as-needed)", () => {
  it.each([
    ["/", "/ar"],
    ["/about", "/ar/about"],
    ["/services/ecommerce/", "/ar/services/ecommerce"],
    ["/en", "/en"],
    ["/en/blog/zid-salla-shopify", "/en/blog/zid-salla-shopify"],
    ["/ar/about", "/ar/about"]
  ])("%s → %s", (input, key) => expect(publicRouteKey(input)).toBe(key));
});

describe("/app CSP does not regress", () => {
  it("per-request nonce + strict-dynamic, no unsafe-inline scripts (login uses the same policy)", () => {
    const script = directive(osCsp("n0nce==", false), "script-src");
    expect(script).toBe("script-src 'self' 'nonce-n0nce==' 'strict-dynamic'");
  });
});

describe("manifest generator (scripts/csp-manifest.mjs)", () => {
  it("hashes inline scripts, decoded style attributes and <style> bodies per prerendered page; skips /app and JSON data", () => {
    const root = mkdtempSync(path.join(tmpdir(), "csp-"));
    const app = path.join(root, "server", "app");
    mkdirSync(path.join(app, "en"), { recursive: true });
    mkdirSync(path.join(app, "app"), { recursive: true });
    writeFileSync(path.join(root, "BUILD_ID"), "build-1");
    writeFileSync(
      path.join(app, "en", "about.html"),
      `<html><head><style>.a{color:red}</style><script src="/_next/x.js"></script></head><body>` +
        `<div style="background:url(&quot;x.png&quot;)">x</div><script>self.__next_f.push([1,"a"])</script>` +
        `<script type="application/ld+json">{"@type":"Org"}</script></body></html>`
    );
    writeFileSync(path.join(app, "_not-found.html"), `<script>nf()</script>`);
    writeFileSync(path.join(app, "app", "ignored.html"), `<script>never()</script>`);
    execFileSync(process.execPath, ["scripts/csp-manifest.mjs", root], { encoding: "utf8" });
    const m = JSON.parse(readFileSync(path.join(root, "csp-public.json"), "utf8")) as PublicCspManifest;
    expect(m.buildId).toBe("build-1");
    expect(m.routes["/en/about"].s).toEqual([sha('self.__next_f.push([1,"a"])')]); // ld+json and external scripts not hashed
    expect(m.routes["/en/about"].y).toEqual([sha('background:url("x.png")'), sha(".a{color:red}")].sort());
    expect(m.notFound.s).toEqual([sha("nf()")]);
    expect(Object.keys(m.routes)).not.toContain("/app/ignored");
  });
});
