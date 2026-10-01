import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { launchNova, novaStatus } from "@/server/integrations/nova";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

describe("NOVA AI external integration", () => {
  it("is not configured without NOVA_URL and never fakes API / SSO / sync state", () => {
    const s = novaStatus({});
    expect(s).toMatchObject({ configured: false, invalidUrl: false, url: null, launchMode: null, sso: false, api: "not_available", lastSyncAt: null });
  });

  it("accepts https URLs and rejects unsafe or malformed ones", () => {
    expect(novaStatus({ NOVA_URL: "https://nova.dms1t.com/app" })).toMatchObject({ configured: true, host: "nova.dms1t.com", launchMode: "external_link" });
    expect(novaStatus({ NOVA_URL: "javascript:alert(1)" })).toMatchObject({ configured: false, invalidUrl: true });
    expect(novaStatus({ NOVA_URL: "http://nova.example.com" })).toMatchObject({ configured: false, invalidUrl: true });
    expect(novaStatus({ NOVA_URL: "not a url" })).toMatchObject({ configured: false, invalidUrl: true });
  });

  it("launch requires nova.use, audits access and returns the configured URL only", async () => {
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    expect(emp.permissions.has("nova.use")).toBe(true); // every system role can open the external platform
    const env = { NOVA_URL: "https://nova.dms1t.com" };
    expect(await launchNova(emp, env)).toBe("https://nova.dms1t.com/");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "integration.nova_launched" } });
    expect(row.actorId).toBe(emp.userId);

    const noPerm = { ...emp, permissions: new Set([...emp.permissions].filter((p) => p !== "nova.use")) } as typeof emp;
    await expect(launchNova(noPerm, env)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await launchNova(emp, {})).toBeNull(); // not configured → no redirect, no audit row
    expect(await prisma.auditLog.count({ where: { action: "integration.nova_launched" } })).toBe(1);
  });
});
