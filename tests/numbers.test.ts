import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { convertLead, createLead, markLeadLost, qualifyLead, reopenLead } from "@/server/crm/leads";
import { campaignReport, crmKpis, crmOverview, pipelineSummary } from "@/server/crm/insights";
import { createProject } from "@/server/projects/projects";
import { projectKpis } from "@/server/projects/insights";
import { startOfMonthIn } from "@/server/kpi/period";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  process.env.OS_ORG_SLUG = "test-org";
});
const manager = async () => ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id);
const webLead = (ctx: Awaited<ReturnType<typeof manager>>, n: number) => createLead(ctx, { name: `Web ${n}`, email: `w${n}@x.test`, source: "WEBSITE" });

describe("qualifiedAt", () => {
  it("1. is stamped once on first qualification and survives lost → reopened → qualified", async () => {
    const mgr = await manager();
    const l = await webLead(mgr, 1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).qualifiedAt).toBeNull();
    await qualifyLead(mgr, l.id);
    const first = (await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).qualifiedAt;
    expect(first).toBeInstanceOf(Date);
    await markLeadLost(mgr, l.id, "no budget this year");
    await reopenLead(mgr, l.id);
    await qualifyLead(mgr, l.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).qualifiedAt).toEqual(first);
  });

  it("2. conversion stamps it for a lead qualified before the column existed", async () => {
    const mgr = await manager();
    const l = await webLead(mgr, 1);
    await qualifyLead(mgr, l.id);
    await prisma.lead.update({ where: { id: l.id }, data: { qualifiedAt: null } }); // legacy row
    await convertLead(mgr, { leadId: l.id, clientMode: "new", client: { type: "COMPANY", displayName: "Web Co" }, opportunity: { title: "Site", estimatedValue: "1000" } });
    const db = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(db.status).toBe("CONVERTED");
    expect(db.qualifiedAt).toBeInstanceOf(Date);
  });

  it("3. campaign report and overview keep counting a qualified lead that was later lost; legacy rows use the status", async () => {
    const mgr = await manager();
    const [a, b, c, d] = [await webLead(mgr, 1), await webLead(mgr, 2), await webLead(mgr, 3), await webLead(mgr, 4)];
    await qualifyLead(mgr, a.id);
    await markLeadLost(mgr, a.id, "went with a competitor"); // qualified, then lost → still qualified
    await qualifyLead(mgr, b.id);
    await prisma.lead.update({ where: { id: b.id }, data: { qualifiedAt: null } }); // legacy qualified row → status rule
    await markLeadLost(mgr, c.id, "never answered the phone"); // lost without qualifying
    void d; // open
    const r = await campaignReport(mgr, 30);
    expect(r.byCampaign.find((x) => x.key === "direct")).toMatchObject({ leads: 4, qualified: 2 });
    expect(r.byOffer[0]).toMatchObject({ leads: 4, qualified: 2 });
    const o = await crmOverview(mgr, 30);
    expect([o.newLeads, o.qualified, o.lost]).toEqual([4, 2, 2]);
  });
});

describe("base currency", () => {
  const opp = async (ctx: Awaited<ReturnType<typeof manager>>, currency: string, estimatedValue: string) => {
    const client = await prisma.client.findFirst({ where: { organizationId: orgId } }) ?? (await prisma.client.create({ data: { organizationId: orgId, number: "CL-1", type: "COMPANY", displayName: "Acme" } }));
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { key: "qualified", pipeline: { organizationId: orgId } } });
    const n = await prisma.opportunity.count();
    return prisma.opportunity.create({ data: { organizationId: orgId, number: `OPP-${n + 1}`, title: `Deal ${n + 1}`, clientId: client.id, pipelineId: stage.pipelineId, stageId: stage.id, currency, estimatedValue, ownerId: ctx.userId } });
  };

  it("4. CRM money totals follow Organization.currency (SAR orgs unchanged)", async () => {
    const mgr = await manager();
    await opp(mgr, "SAR", "1000");
    await opp(mgr, "USD", "250");
    expect(Number((await crmKpis(mgr, new Date())).pipelineValue)).toBe(1000);
    expect((await pipelineSummary(mgr)).find((s) => s.key === "qualified")).toMatchObject({ count: 2, value: expect.stringMatching(/^1000(\.0+)?$/) });
    await prisma.organization.update({ where: { id: orgId }, data: { currency: "USD" } });
    expect(Number((await crmKpis(mgr, new Date(Date.now() + 1))).pipelineValue)).toBe(250);
    expect(Number((await pipelineSummary(mgr)).find((s) => s.key === "qualified")!.value)).toBe(250);
    expect(Number((await crmOverview(mgr, 30)).byStage.find((s) => s.key === "qualified")!.value)).toBe(250);
  });
});

describe("projects month", () => {
  it("5. 'completed this month' starts at local midnight of the 1st in the org timezone", async () => {
    const pm = await ctxFor((await makeUser(orgId, "pm@x.test", ["project_manager"])).id);
    await prisma.organization.update({ where: { id: orgId }, data: { internalProjectsAllowed: true } });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
    const from = startOfMonthIn(org.timezone);
    const inMonth = await createProject(pm, { source: "internal", name: "Finished on the 1st, 00:01 local", milestoneSource: "none" });
    const before = await createProject(pm, { source: "internal", name: "Finished last month, 23:59 local", milestoneSource: "none" });
    // 00:01 local on the 1st is still the previous day in UTC for Asia/Riyadh — it belongs to this month
    await prisma.project.update({ where: { id: inMonth.id }, data: { status: "COMPLETED", completedAt: new Date(from.getTime() + 60_000) } });
    await prisma.project.update({ where: { id: before.id }, data: { status: "COMPLETED", completedAt: new Date(from.getTime() - 60_000) } });
    const k = await projectKpis(pm);
    expect(k.completed).toBe(1);
    expect(k.monthStart).toEqual(from);
  });
});
