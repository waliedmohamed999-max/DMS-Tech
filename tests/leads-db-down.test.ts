import { afterEach, describe, expect, it, vi } from "vitest";

// the route imports server-only modules; under vitest there is no React server condition
vi.mock("server-only", () => ({}));
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { setMailTransportForTests } from "@/server/notify/mailer";
import { POST } from "@/app/api/leads/route";

/** Production incident 2026-10-16: the database was paused and every website request failed with a 500. */
describe("website form when the database is down", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setMailTransportForTests(null);
  });

  const post = (body: unknown, ip = "203.0.113.9") =>
    POST(new NextRequest("http://localhost/api/leads", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
  const lead = { name: "سارة", phone: "0550000003", service: "ecommerce", source: "offer", locale: "ar", offer: "pkg:store-launch", details: { hasStore: "نعم — زد" }, elapsed: 5000 };

  it("still e-mails the request and tells the visitor it was sent", async () => {
    const outbox: string[] = [];
    setMailTransportForTests(async (_from, _to, message) => void outbox.push(message));
    const down = () => Promise.reject(new Error("Can't reach database server"));
    vi.spyOn(prisma, "$queryRaw").mockImplementation(down as never);
    vi.spyOn(prisma, "$transaction").mockImplementation(down as never);
    const res = await post(lead);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(outbox).toHaveLength(1);
  });

  it("keeps the per-visitor limit while the database is down", async () => {
    setMailTransportForTests(async () => {});
    const down = () => Promise.reject(new Error("Can't reach database server"));
    vi.spyOn(prisma, "$queryRaw").mockImplementation(down as never);
    vi.spyOn(prisma, "$transaction").mockImplementation(down as never);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post({ ...lead, phone: `055000010${i}` }, "198.51.100.7")).status);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
