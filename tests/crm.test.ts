import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createLead, listLeads, qualifyLead, markLeadLost, convertLead, getLead, archiveLead, updateLead } from "@/server/crm/leads";
import { moveOpportunityStage, markOpportunityLost, markOpportunityWon, getOpportunity, pipelineBoard } from "@/server/crm/opportunities";
import { createClient, createContact, listClients, getClient360 } from "@/server/crm/clients";
import { captureWebsiteLead } from "@/server/crm/website";
import { crmAttention, crmKpis, followUps } from "@/server/crm/insights";
import { globalSearch, getKpis } from "@/server/dashboard/service";
import { nextNumber } from "@/server/crm/sequence";
import { normPhone } from "@/server/crm/normalize";
import { hit } from "@/server/rate-limit";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  process.env.OS_ORG_SLUG = "test-org";
});

const users = async () => ({
  manager: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  rep2: await ctxFor((await makeUser(orgId, "rep2@x.test", ["sales_rep"])).id),
  employee: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id)
});

const stage = (key: string) => prisma.pipelineStage.findFirstOrThrow({ where: { key, pipeline: { organizationId: orgId } } });

async function qualifiedLead(ctx: Awaited<ReturnType<typeof users>>["rep"], extra: Record<string, unknown> = {}) {
  const l = await createLead(ctx, { name: "Ahmed Alotaibi", companyName: "Nakheel Store", email: "Ahmed@Nakheel.SA ", phone: "0551234567", interestedService: "ecommerce", budgetMin: "20000", budgetMax: "45000.50", ...extra });
  await qualifyLead(ctx, l.id);
  return l;
}

describe("leads", () => {
  it("1. creates a lead with normalized fields, readable number, audit + event", async () => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "  Sara   Ali ", email: "SARA@Example.com", phone: "+966 55 123 4567", budgetMin: "1,500", budgetMax: "3000.5" });
    const db = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(db.number).toBe("LEAD-000001");
    expect(db.name).toBe("Sara Ali");
    expect(db.emailNormalized).toBe("sara@example.com");
    expect(db.phoneNormalized).toBe("966551234567");
    expect(db.budgetMin?.toString()).toBe("1500");
    expect(db.budgetMax?.toString()).toBe("3000.5");
    expect(db.ownerId).toBe(rep.userId);
    expect(await prisma.auditLog.count({ where: { action: "lead.created", entityId: l.id } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "lead.created", entityId: l.id, status: "PROCESSED" } })).toBe(1);
  });

  it("2. an employee without CRM permissions cannot read or create CRM data", async () => {
    const { employee } = await users();
    await expect(listLeads(employee, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createLead(employee, { name: "x", email: "x@x.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listClients(employee, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("3. sales rep can create leads but cannot assign them to others; validation rejects bad input", async () => {
    const { rep, rep2 } = await users();
    await expect(createLead(rep, { name: "Lead", email: "a@b.test", ownerId: rep2.userId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createLead(rep, { name: "No contact" })).rejects.toThrow();
    await expect(createLead(rep, { name: "Bad budget", email: "a@b.test", budgetMin: "10", budgetMax: "5" })).rejects.toThrow();
    await expect(createLead(rep, { name: "Float", email: "a@b.test", budgetMin: "10.123" })).rejects.toThrow();
  });

  it("OWN scope: reps only see their own leads; managers see all", async () => {
    const { rep, rep2, manager } = await users();
    const a = await createLead(rep, { name: "Mine", email: "m@x.test" });
    await createLead(rep2, { name: "Theirs", email: "t@x.test" });
    expect((await listLeads(rep, {})).items.map((x) => x.id)).toEqual([a.id]);
    expect((await listLeads(manager, {})).total).toBe(2);
    await expect(getLead(rep2, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lost requires a reason; archived leads cannot be edited", async () => {
    const { rep, manager } = await users();
    const l = await createLead(rep, { name: "Xavier", email: "x@x.test" });
    await expect(markLeadLost(rep, l.id, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await markLeadLost(rep, l.id, "Budget too low");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).lostReason).toBe("Budget too low");
    await archiveLead(manager, l.id);
    await expect(updateLead(manager, { id: l.id, name: "Yasser" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("conversion", () => {
  it("4. converts a qualified lead into client + contact + opportunity atomically", async () => {
    const { rep } = await users();
    const l = await qualifiedLead(rep);
    const r = await convertLead(rep, { leadId: l.id, clientMode: "new", contactMode: "new" });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    const client = await prisma.client.findUniqueOrThrow({ where: { id: r.clientId } });
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: r.contactId! } });
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: r.opportunityId }, include: { stage: true } });
    expect(lead.status).toBe("CONVERTED");
    expect(lead.convertedAt).not.toBeNull();
    expect(lead.convertedClientId).toBe(client.id);
    expect(client.displayName).toBe("Nakheel Store");
    expect(client.number).toBe("CLI-000001");
    expect(contact.isPrimary).toBe(true);
    expect(contact.clientId).toBe(client.id);
    expect(opp.sourceLeadId).toBe(l.id);
    expect(opp.estimatedValue.toString()).toBe("45000.5");
    expect(opp.stage.key).toBe("qualified");
    expect(opp.serviceCategory).toBe("ecommerce");
    for (const type of ["lead.converted", "client.created", "contact.created", "opportunity.created"])
      expect(await prisma.domainEvent.count({ where: { type } }), type).toBe(1);
    for (const action of ["lead.converted", "client.created", "contact.created", "opportunity.created"])
      expect(await prisma.auditLog.count({ where: { action } }), action).toBe(1);
  });

  it("4b. converts onto an existing client", async () => {
    const { rep } = await users();
    const c = await createClient(rep, { displayName: "Existing Co" });
    const l = await qualifiedLead(rep);
    const r = await convertLead(rep, { leadId: l.id, clientMode: "existing", clientId: c.id, contactMode: "new" });
    expect(r.clientId).toBe(c.id);
    expect(await prisma.client.count()).toBe(1);
  });

  it("5. a lead cannot be converted twice; unqualified leads cannot be converted", async () => {
    const { rep } = await users();
    const l = await qualifiedLead(rep);
    await convertLead(rep, { leadId: l.id, clientMode: "new" });
    await expect(convertLead(rep, { leadId: l.id, clientMode: "new" })).rejects.toMatchObject({ code: "CONFLICT" });
    const open = await createLead(rep, { name: "Open", email: "o@x.test" });
    await expect(convertLead(rep, { leadId: open.id, clientMode: "new" })).rejects.toMatchObject({ code: "CONFLICT" });
    // concurrent double conversion → exactly one wins
    const l2 = await qualifiedLead(rep, { email: "two@x.test" });
    const res = await Promise.allSettled([convertLead(rep, { leadId: l2.id, clientMode: "new" }), convertLead(rep, { leadId: l2.id, clientMode: "new" })]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.opportunity.count({ where: { sourceLeadId: l2.id } })).toBe(1);
  });

  it("6. a failure mid-conversion rolls back client, contact and lead state", async () => {
    const { rep } = await users();
    const l = await qualifiedLead(rep);
    // simulate a racing writer that already created an opportunity for this lead (unique sourceLeadId)
    const c = await createClient(rep, { displayName: "Racer" });
    const s = await stage("new");
    await prisma.opportunity.create({ data: { organizationId: orgId, number: "OPP-RACE", clientId: c.id, sourceLeadId: l.id, title: "race", pipelineId: s.pipelineId, stageId: s.id } });
    const clientsBefore = await prisma.client.count();
    await expect(convertLead(rep, { leadId: l.id, clientMode: "new", contactMode: "new" })).rejects.toThrow();
    expect(await prisma.client.count()).toBe(clientsBefore);
    expect(await prisma.contact.count()).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("QUALIFIED");
    expect(await prisma.auditLog.count({ where: { action: "lead.converted" } })).toBe(0);
  });
});

describe("pipeline", () => {
  async function opp() {
    const u = await users();
    const l = await qualifiedLead(u.rep);
    const r = await convertLead(u.rep, { leadId: l.id, clientMode: "new" });
    return { ...u, oppId: r.opportunityId, clientId: r.clientId };
  }

  it("7. stage change persists with probability, audit, event and timeline", async () => {
    const { rep, oppId } = await opp();
    const proposal = await stage("proposal");
    await moveOpportunityStage(rep, { id: oppId, stageId: proposal.id });
    const o = await getOpportunity(rep, oppId);
    expect(o.stageId).toBe(proposal.id);
    expect(o.probability).toBe(proposal.defaultProbability);
    expect(await prisma.auditLog.count({ where: { action: "opportunity.stage_changed" } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "opportunity.stage_changed" } })).toBe(1);
    expect(await prisma.crmActivity.count({ where: { entityId: oppId, type: "STATUS_CHANGE" } })).toBe(1);
    const board = await pipelineBoard(rep);
    expect(board.stages.find((s) => s.id === proposal.id)?.items.map((i) => i.id)).toContain(oppId);
  });

  it("8. moving to Won sets status, wonAt, probability 100, activates client and emits opportunity.won", async () => {
    const { rep, oppId, clientId } = await opp();
    await markOpportunityWon(rep, oppId);
    const o = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(o.status).toBe("WON");
    expect(o.wonAt).not.toBeNull();
    expect(o.probability).toBe(100);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).status).toBe("ACTIVE");
    expect(await prisma.domainEvent.count({ where: { type: "opportunity.won", status: "PROCESSED" } })).toBe(1);
  });

  it("9. moving to Lost requires a reason (service and DB constraint)", async () => {
    const { rep, oppId } = await opp();
    const lost = await stage("lost");
    await expect(moveOpportunityStage(rep, { id: oppId, stageId: lost.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(prisma.opportunity.update({ where: { id: oppId }, data: { status: "LOST" } })).rejects.toThrow();
    await markOpportunityLost(rep, oppId, "Chose a competitor");
    const o = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(o.status).toBe("LOST");
    expect(o.lostAt).not.toBeNull();
    expect(o.lostReason).toBe("Chose a competitor");
    expect(await prisma.domainEvent.count({ where: { type: "opportunity.lost" } })).toBe(1);
  });

  it("won / lost / reopen each require their own permission", async () => {
    const { rep, oppId } = await opp();
    const without = (p: string) => ({ ...rep, permissions: new Set([...rep.permissions].filter((x) => x !== p)) }) as typeof rep;
    await expect(markOpportunityWon(without("crm.opportunities.mark_won"), oppId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markOpportunityLost(without("crm.opportunities.mark_lost"), oppId, "Too expensive")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await markOpportunityWon(rep, oppId);
    const open = await stage("proposal");
    await expect(moveOpportunityStage(without("crm.opportunities.mark_won"), { id: oppId, stageId: open.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId } })).status).toBe("WON");
  });

  it("other reps cannot move someone else's opportunity", async () => {
    const { rep2, oppId } = await opp();
    const s = await stage("proposal");
    await expect(moveOpportunityStage(rep2, { id: oppId, stageId: s.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("website capture", () => {
  const form = (o: Record<string, unknown> = {}) => ({ name: "Visitor One", email: "visitor@example.com", phone: "0501112223", company: "V Co", service: "web-development", budget: "10k-30k", message: "Need a site", source: "quote", locale: "ar", utm: { utm_source: "google", utm_campaign: "brand" }, referrer: "https://google.com", elapsed: 9000, ...o });

  it("10. a valid website submission creates a WEBSITE lead, notifies sales managers, emits events", async () => {
    const { manager, rep } = await users();
    const r = await captureWebsiteLead(form(), { ip: "1.2.3.4", userAgent: "test" });
    expect(r.outcome).toBe("created");
    const l = await prisma.lead.findFirstOrThrow({ where: { source: "WEBSITE" } });
    expect(l.interestedService).toBe("web-development");
    expect(l.budgetMin?.toString()).toBe("10000");
    expect(l.budgetMax?.toString()).toBe("30000");
    expect(l.ownerId).toBeNull();
    expect((l.captureMeta as { utm: Record<string, string> }).utm.utm_source).toBe("google");
    expect(await prisma.domainEvent.count({ where: { type: "website.lead_received", status: "PROCESSED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: manager.userId, category: "SALES" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: rep.userId } })).toBe(0);
    // audit actor is the system (null), never a fake user
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.created" } })).actorId).toBeNull();
  });

  it("10b. duplicate of an open lead appends activity instead of creating a new lead", async () => {
    await users();
    await captureWebsiteLead(form());
    const r = await captureWebsiteLead(form({ email: "other@example.com", phone: "+966 50 111 2223", message: "Second message" }));
    expect(r.outcome).toBe("appended");
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.crmActivity.count({ where: { title: "website.resubmission" } })).toBe(1);
  });

  it("10c. returning visitor whose old lead was lost gets a new lead linked as duplicate candidate", async () => {
    const { manager } = await users();
    await captureWebsiteLead(form());
    const first = await prisma.lead.findFirstOrThrow();
    await markLeadLost(manager, first.id, "No budget");
    await captureWebsiteLead(form());
    const second = await prisma.lead.findFirstOrThrow({ where: { NOT: { id: first.id } } });
    expect(second.duplicateOfId).toBe(first.id);
  });

  it("11. spam is dropped silently and rate limiting blocks bursts", async () => {
    await users();
    expect((await captureWebsiteLead(form({ elapsed: 200 }))).outcome).toBe("spam");
    expect((await captureWebsiteLead(form({ message: "http://a.io http://b.io http://c.io" }))).outcome).toBe("spam");
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "website.lead_rejected_spam" } })).toBe(2);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await hit("web-lead:ip:9.9.9.9", 5, 600000));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("public schema refuses internal fields and requires a contact channel", async () => {
    await users();
    await expect(captureWebsiteLead({ name: "x", source: "quote" })).rejects.toThrow();
    await captureWebsiteLead({ ...form(), ownerId: "someone", status: "WON", priority: "URGENT" });
    const l = await prisma.lead.findFirstOrThrow();
    expect(l.ownerId).toBeNull();
    expect(l.priority).toBe("MEDIUM");
  });
});

describe("search, metrics, identifiers", () => {
  it("12. global search returns CRM entities only within permission and scope", async () => {
    const { rep, rep2, employee, manager } = await users();
    await createLead(rep, { name: "Zamzam Trading", email: "z@z.test" });
    await createClient(rep, { displayName: "Zamzam Holding" });
    expect((await globalSearch(rep, "Zamzam")).map((r) => r.type).sort()).toEqual(["client", "lead"]);
    expect(await globalSearch(rep2, "Zamzam")).toEqual([]);
    expect((await globalSearch(employee, "Zamzam")).filter((r) => ["lead", "client", "opportunity", "contact"].includes(r.type))).toEqual([]);
    expect((await globalSearch(manager, "Zamzam")).length).toBe(2);
  });

  it("scope cannot be widened by search terms in any CRM query", async () => {
    const { rep, rep2 } = await users();
    await createLead(rep, { name: "Secret Lead", email: "s@x.test", nextFollowUpAt: new Date(Date.now() - 60000) });
    const c = await createClient(rep, { displayName: "Secret Client" });
    expect((await listLeads(rep2, { q: "Secret" })).total).toBe(0);
    expect((await listClients(rep2, { q: "Secret" })).total).toBe(0);
    expect((await crmKpis(rep2)).activeLeads).toBe(0);
    expect((await followUps(rep2, { who: "all" })).overdue).toHaveLength(0);
    await expect(getClient360(rep2, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("13. audit entries exist for client/contact create and lead update/assign", async () => {
    const { manager, rep } = await users();
    const c = await createClient(manager, { displayName: "Audit Co" });
    await createContact(manager, { clientId: c.id, firstName: "Mona", isPrimary: true });
    const l = await createLead(manager, { name: "Lama", email: "l@x.test" });
    await updateLead(manager, { id: l.id, ownerId: rep.userId, priority: "HIGH" });
    for (const action of ["client.created", "contact.created", "lead.updated", "lead.assigned"]) expect(await prisma.auditLog.count({ where: { action } }), action).toBeGreaterThan(0);
    const upd = await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.updated" } });
    expect((upd.before as { priority: string }).priority).toBe("MEDIUM");
    expect((upd.after as { priority: string }).priority).toBe("HIGH");
    expect(await prisma.notification.count({ where: { userId: rep.userId, category: "SALES" } })).toBe(1);
    const view = await getClient360(manager, c.id);
    expect(view.client.contacts[0].isPrimary).toBe(true);
  });

  it("14. pagination, filters and follow-up buckets return correct data", async () => {
    const { manager } = await users();
    for (let i = 0; i < 30; i++) await createLead(manager, { name: `Lead ${i}`, email: `l${i}@x.test`, source: i % 2 ? "WEBSITE" : "REFERRAL", priority: i < 3 ? "URGENT" : "LOW" });
    const p1 = await listLeads(manager, { page: 1 });
    const p2 = await listLeads(manager, { page: 2 });
    expect(p1.items).toHaveLength(25);
    expect(p2.items).toHaveLength(5);
    expect(new Set([...p1.items, ...p2.items].map((x) => x.id)).size).toBe(30);
    expect((await listLeads(manager, { source: "WEBSITE" })).total).toBe(15);
    expect((await listLeads(manager, { priority: "URGENT" })).total).toBe(3);
    expect((await listLeads(manager, { q: "lead 1" })).total).toBe(11); // Lead 1, Lead 10..19
    const l = await createLead(manager, { name: "Due", email: "d@x.test", nextFollowUpAt: new Date(Date.now() - 3600000) });
    expect((await listLeads(manager, { followUp: "overdue" })).items.map((x) => x.id)).toEqual([l.id]);
    const f = await followUps(manager);
    expect(f.overdue.map((x) => x.id)).toContain(l.id);
    const k = await crmKpis(manager);
    expect(k.activeLeads).toBe(31);
    expect(k.overdueFollowUps).toBe(1);
    const dash = await getKpis(manager);
    expect(dash.find((x) => x.key === "activeLeads")).toMatchObject({ state: "live", value: 31 });
  });

  it("malformed list URL params fall back to defaults instead of throwing", async () => {
    const { manager } = await users();
    await createLead(manager, { name: "Param test", email: "p@x.test" });
    const r = await listLeads(manager, { dir: "desc?tab=overview", sort: "bogus", page: "-4", source: "NOPE", q: "param" });
    expect(r.page).toBe(1);
    expect(r.total).toBe(1); // valid filters still apply
  });

  it("attention: overdue follow-ups are personal by default, scoped in team mode", async () => {
    const { manager, rep, rep2 } = await users();
    const l = await createLead(rep, { name: "Overdue rep lead", email: "o@x.test", nextFollowUpAt: new Date(Date.now() - 3600000) });
    const ids = (a: { id: string }[]) => a.map((x) => x.id);
    expect(ids(await crmAttention(rep))).toContain(`lfu-${l.id}`);
    expect(ids(await crmAttention(manager))).not.toContain(`lfu-${l.id}`);
    expect(ids(await crmAttention(manager, { team: true }))).toContain(`lfu-${l.id}`);
    expect(ids(await crmAttention(rep2, { team: true }))).not.toContain(`lfu-${l.id}`); // OWN scope never widens
  });

  it("15. concurrent identifier generation never duplicates", async () => {
    const nums = await Promise.all(Array.from({ length: 25 }, () => prisma.$transaction((tx) => nextNumber(tx, orgId, "LEAD"))));
    expect(new Set(nums).size).toBe(25);
    const { rep } = await users();
    const leads = await Promise.all(Array.from({ length: 10 }, (_, i) => createLead(rep, { name: `C${i}`, email: `c${i}@x.test` })));
    expect(new Set(leads.map((l) => l.number)).size).toBe(10);
  });

  it("phone normalization handles Saudi formats", () => {
    expect(normPhone("0551234567")).toBe("966551234567");
    expect(normPhone("+966 55 123 4567")).toBe("966551234567");
    expect(normPhone("00966551234567")).toBe("966551234567");
    expect(normPhone("551234567")).toBe("966551234567");
    expect(normPhone("12")).toBeNull();
  });
});
