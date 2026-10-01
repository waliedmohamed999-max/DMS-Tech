import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { login, logout, resolveSession, SESSION_IDLE_MS, hashToken } from "@/server/auth/service";
import { makeUser, PASSWORD, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const ip = () => `10.0.0.${Math.floor(Math.random() * 250)}`;

describe("authentication", () => {
  it("logs in with valid credentials and resolves permissions from roles", async () => {
    await makeUser(orgId, "ceo@x.test", ["ceo"]);
    const r = await login({ email: "CEO@x.test ", password: PASSWORD, ip: ip() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await resolveSession(r.token);
    expect(s?.user.email).toBe("ceo@x.test");
    expect(s?.permissions).toContain("approvals.decide");
    // only the hash of the token is stored
    expect(await prisma.session.findUnique({ where: { id: r.token } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(r.token) } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "auth.login" } })).toBe(1);
  });

  it("rejects a wrong password and unknown emails with the same reason", async () => {
    await makeUser(orgId, "a@x.test", ["employee"]);
    expect(await login({ email: "a@x.test", password: "nope", ip: ip() })).toEqual({ ok: false, reason: "INVALID" });
    expect(await login({ email: "ghost@x.test", password: "nope", ip: ip() })).toEqual({ ok: false, reason: "INVALID" });
  });

  it("locks the account after 5 failures, even for the correct password afterwards", async () => {
    await makeUser(orgId, "b@x.test", ["employee"]);
    for (let i = 0; i < 5; i++) await login({ email: "b@x.test", password: "wrong", ip: ip() });
    expect(await login({ email: "b@x.test", password: PASSWORD, ip: ip() })).toEqual({ ok: false, reason: "LOCKED" });
    expect(await prisma.auditLog.count({ where: { action: "auth.account_locked" } })).toBe(1);
  });

  it("blocks disabled users", async () => {
    await makeUser(orgId, "c@x.test", ["employee"], { status: "DISABLED" });
    expect(await login({ email: "c@x.test", password: PASSWORD, ip: ip() })).toEqual({ ok: false, reason: "DISABLED" });
  });

  it("rate limits brute force per email", async () => {
    await makeUser(orgId, "d@x.test", ["employee"]);
    let last;
    for (let i = 0; i < 11; i++) last = await login({ email: "d@x.test", password: "x", ip: ip() });
    expect(last).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });

  it("logout revokes the session; idle sessions expire", async () => {
    await makeUser(orgId, "e@x.test", ["employee"]);
    const r = await login({ email: "e@x.test", password: PASSWORD, ip: ip() });
    if (!r.ok) throw new Error("login failed");
    await logout(r.token);
    expect(await resolveSession(r.token)).toBeNull();

    const r2 = await login({ email: "e@x.test", password: PASSWORD, ip: ip() });
    if (!r2.ok) throw new Error("login failed");
    await prisma.session.update({ where: { id: hashToken(r2.token) }, data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 1000) } });
    expect(await resolveSession(r2.token)).toBeNull();
  });

  it("disabling a user invalidates existing sessions", async () => {
    const u = await makeUser(orgId, "f@x.test", ["employee"]);
    const r = await login({ email: "f@x.test", password: PASSWORD, ip: ip() });
    if (!r.ok) throw new Error("login failed");
    await prisma.user.update({ where: { id: u.id }, data: { status: "DISABLED" } });
    expect(await resolveSession(r.token)).toBeNull();
  });
});
