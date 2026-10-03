import { describe, expect, it } from "vitest";
import { probeTransport } from "@/server/system/golive";

/** Phase 11 (P11-E) — HTTP→HTTPS verification. The edge is simulated by a routing table of responses. */
type Route = { status: number; headers?: Record<string, string> } | "down";
function edge(routes: Record<string, Route>) {
  const seen: string[] = [];
  const f = (async (url: string) => {
    seen.push(url);
    const r = routes[url] ?? routes[url.replace(/\?.*$/, "")];
    if (!r || r === "down") throw new TypeError("fetch failed");
    return new Response(null, { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, seen };
}
const HSTS = { "strict-transport-security": "max-age=31536000; includeSubDomains" };
const healthy = (site: string) => ({ [`${site}/api/health`]: { status: 200 }, [site]: { status: 200, headers: HSTS }, [`${site}/app/login`]: { status: 200, headers: HSTS } });
const level = async (env: Record<string, string>, routes: Record<string, Route>, key = "http_redirect") => (await probeTransport(env, edge(routes).f)).find((r) => r.key === key)!;

describe("production defaults (site on 443, http on 80)", () => {
  const site = "https://os.example.sa";
  it("301 to the same host with path + query preserved → PASS", async () => {
    const r = await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 301, headers: { location: "https://os.example.sa/app/login?probe=redirect-check" } } });
    expect(r.level).toBe("PASS");
  });
  it("308 is accepted; 302 / 307 (temporary) is a WARN", async () => {
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 308, headers: { location: "https://os.example.sa/app/login?probe=redirect-check" } } })).level).toBe("PASS");
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 302, headers: { location: "https://os.example.sa/app/login?probe=redirect-check" } } })).level).toBe("WARN");
  });
  it("http served without a redirect, a redirect to http, or to another host is a BLOCK / WARN — never PASS", async () => {
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 200 } })).level).toBe("BLOCK");
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 301, headers: { location: "http://os.example.sa/app/login" } } })).level).toBe("BLOCK");
    const other = await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 301, headers: { location: "https://evil.example/app/login?probe=redirect-check" } } });
    expect(other.level).toBe("WARN");
    expect(other.detail).toMatch(/expected os\.example\.sa/);
    const lost = await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 301, headers: { location: "https://os.example.sa/" } } });
    expect(lost.detail).toMatch(/path \/ query not preserved/);
  });
  it("downgrade: the https target bouncing back to http is detected", async () => {
    const r = await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": { status: 301, headers: { location: "https://os.example.sa/app/login?probe=redirect-check" } }, "https://os.example.sa/app/login": { status: 301, headers: { location: "http://os.example.sa/app/login" } } });
    expect(r.level).not.toBe("PASS");
    expect(r.detail).toMatch(/downgrade/);
  });
  it("http port closed is a WARN (never PASS by skipping)", async () => {
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), "http://os.example.sa/app/login": "down" })).level).toBe("WARN");
  });
  it("HSTS: missing → BLOCK, short max-age → WARN, ≥ 180 days → PASS", async () => {
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), [site]: { status: 200 } }, "hsts")).level).toBe("BLOCK");
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, { ...healthy(site), [site]: { status: 200, headers: { "strict-transport-security": "max-age=300" } } }, "hsts")).level).toBe("WARN");
    expect((await level({ NEXT_PUBLIC_SITE_URL: site }, healthy(site), "hsts")).level).toBe("PASS");
  });
  it("a non-https site URL is a BLOCK", async () => {
    expect((await probeTransport({ NEXT_PUBLIC_SITE_URL: "http://os.example.sa" }, edge({}).f))[0]).toMatchObject({ key: "https_health", level: "BLOCK" });
  });
});

describe("staging on custom ports (HTTP_BASE_URL)", () => {
  const site = "https://staging.127.0.0.1.nip.io:8443";
  it("without HTTP_BASE_URL the http origin is not guessed (port 8443 is TLS) → WARN asking for it", async () => {
    const { f, seen } = edge(healthy(site));
    const r = (await probeTransport({ NEXT_PUBLIC_SITE_URL: site }, f)).find((x) => x.key === "http_redirect")!;
    expect(r.level).toBe("WARN");
    expect(r.detail).toMatch(/HTTP_BASE_URL/);
    expect(seen.some((u) => u.startsWith("http://staging.127.0.0.1.nip.io:8443"))).toBe(false); // the old false probe
  });
  it("with HTTP_BASE_URL the redirect to the https port is verified → PASS", async () => {
    const r = await level({ NEXT_PUBLIC_SITE_URL: site, HTTP_BASE_URL: "http://staging.127.0.0.1.nip.io:8080" }, { ...healthy(site), "http://staging.127.0.0.1.nip.io:8080/app/login": { status: 301, headers: { location: "https://staging.127.0.0.1.nip.io:8443/app/login?probe=redirect-check" } } });
    expect(r.level).toBe("PASS");
  });
  it("an explicit HTTP_BASE_URL that is unreachable is a BLOCK", async () => {
    expect((await level({ NEXT_PUBLIC_SITE_URL: site, HTTP_BASE_URL: "http://staging.127.0.0.1.nip.io:8080" }, { ...healthy(site), "http://staging.127.0.0.1.nip.io:8080/app/login": "down" })).level).toBe("BLOCK");
  });
  it("redirecting to the wrong port is not accepted", async () => {
    const r = await level({ NEXT_PUBLIC_SITE_URL: site, HTTP_BASE_URL: "http://staging.127.0.0.1.nip.io:8080" }, { ...healthy(site), "http://staging.127.0.0.1.nip.io:8080/app/login": { status: 301, headers: { location: "https://staging.127.0.0.1.nip.io/app/login?probe=redirect-check" } } });
    expect(r.level).not.toBe("PASS");
  });
});
