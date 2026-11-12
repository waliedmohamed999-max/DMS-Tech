import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientIp", () => {
  afterEach(() => void delete process.env.TRUSTED_PROXY_HOPS);

  it("defaults to the first X-Forwarded-For entry (edge overwrites the header)", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("with TRUSTED_PROXY_HOPS takes the entry the outermost trusted proxy appended", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    process.env.TRUSTED_PROXY_HOPS = "5";
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("falls back to X-Real-IP, then null", () => {
    expect(clientIp(h({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(h({ "x-forwarded-for": " , " }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });
});
