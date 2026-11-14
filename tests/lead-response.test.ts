import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createLead, updateLead } from "@/server/crm/leads";
import { logActivity, addNote } from "@/server/crm/activities";
import { captureWebsiteLead } from "@/server/crm/website";
import { crmAttention } from "@/server/crm/insights";
import { FIRST_CONTACT_SLA_MINUTES, leadResponseTimes, markFirstContact, uncontactedLeads } from "@/server/crm/response";
import { createRule, setRuleEnabled } from "@/server/automation/engine";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
  process.env.OS_ORG_SLUG = "test-org";
});

const users = async () => ({
  admin: await ctxFor((await makeUser(orgId, "admin@x.test", ["super_admin"])).id),
  manager: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  rep2: await ctxFor((await makeUser(orgId, "rep2@x.test", ["sales_rep"])).id)
});

const MIN = 60_000;
const lead = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
/** Move a lead's creation into the past (JS date → timestamp(3) UTC, the same way the app writes it). */
const age = (id: string, minutes: number, base = Date.now()) => prisma.lead.update({ where: { id }, data: { createdAt: new Date(base - minutes * MIN) } });
const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe("first contact", () => {
  it("is set once by the first call / WhatsApp / email / meeting — notes, tasks and later contacts never move it", async () => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "Fresh lead", phone: "0551230001" });
    expect(l.firstContactedAt).toBeNull();
    expect(l.assignedAt).toBeInstanceOf(Date); // created with an owner
    await addNote(rep, { entityType: "LEAD", entityId: l.id, body: "internal note" });
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "NOTE", title: "Looked at the request" });
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "TASK", title: "Prepare a quote" });
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "FOLLOW_UP", title: "Remind me" });
    expect((await lead(l.id)).firstContactedAt).toBeNull();

    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "WHATSAPP", title: "Sent the welcome template" });
    const first = (await lead(l.id)).firstContactedAt!;
    expect(first).toBeInstanceOf(Date);
    expect(Math.abs(first.getTime() - Date.now())).toBeLessThan(10_000);

    await new Promise((r) => setTimeout(r, 15));
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "CALL", title: "Called back" });
    await updateLead(rep, { id: l.id, stage: "CONTACTED" });
    expect((await lead(l.id)).firstContactedAt!.getTime()).toBe(first.getTime());
  });

  it.each(["CALL", "EMAIL", "MEETING"] as const)("%s counts as a contact", async (type) => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "Typed lead", phone: "0551230002" });
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type, title: "Reached out" });
    expect((await lead(l.id)).firstContactedAt).not.toBeNull();
  });

  it("uses a back-dated activity time, clamped between the lead's creation and now", async () => {
    const { rep } = await users();
    const a = await createLead(rep, { name: "Backdated", phone: "0551230003" });
    await age(a.id, 120);
    const called = new Date(Date.now() - 100 * MIN);
    await logActivity(rep, { entityType: "LEAD", entityId: a.id, type: "CALL", title: "Called earlier", occurredAt: called });
    expect((await lead(a.id)).firstContactedAt!.getTime()).toBe(called.getTime());

    const b = await createLead(rep, { name: "Before creation", phone: "0551230004" });
    await logActivity(rep, { entityType: "LEAD", entityId: b.id, type: "CALL", title: "Impossible time", occurredAt: new Date(Date.now() - 86400000) });
    const lb = await lead(b.id);
    expect(lb.firstContactedAt!.getTime()).toBe(lb.createdAt.getTime());

    const c = await createLead(rep, { name: "Future", phone: "0551230005" });
    await logActivity(rep, { entityType: "LEAD", entityId: c.id, type: "CALL", title: "Future time", occurredAt: new Date(Date.now() + 86400000) });
    expect((await lead(c.id)).firstContactedAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("is set when the stage first leaves NEW, and markFirstContact is idempotent", async () => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "Stage lead", phone: "0551230006" });
    await updateLead(rep, { id: l.id, priority: "HIGH" }); // an ordinary edit is not a contact
    expect((await lead(l.id)).firstContactedAt).toBeNull();
    await updateLead(rep, { id: l.id, stage: "ATTEMPTED" });
    const first = (await lead(l.id)).firstContactedAt!;
    expect(first).toBeInstanceOf(Date);
    expect(await markFirstContact(prisma, orgId, l.id, new Date(first.getTime() - 5 * MIN))).toBe(false);
    expect((await lead(l.id)).firstContactedAt!.getTime()).toBe(first.getTime());
    // a contact on a client timeline never touches a lead
    const other = await createLead(rep, { name: "Untouched", phone: "0551230007" });
    expect(await markFirstContact(prisma, "another-org", other.id)).toBe(false);
    expect((await lead(other.id)).firstContactedAt).toBeNull();
  });

  it("assignedAt follows the owner: null while unassigned, stamped on assignment", async () => {
    const { manager, rep } = await users();
    const r = await captureWebsiteLead({ name: "Web visitor", phone: "0551230008", source: "quote", message: "Need a site", elapsed: 9000 }, { ip: "203.0.113.9", userAgent: "vitest" });
    expect(r.outcome).toBe("created");
    const web = await prisma.lead.findFirstOrThrow({ where: { source: "WEBSITE" } });
    expect(web.ownerId).toBeNull();
    expect(web.assignedAt).toBeNull();
    expect(web.firstContactedAt).toBeNull();
    await updateLead(manager, { id: web.id, ownerId: rep.userId });
    expect((await lead(web.id)).assignedAt).toBeInstanceOf(Date);
    await updateLead(manager, { id: web.id, ownerId: null });
    expect((await lead(web.id)).assignedAt).toBeNull();
  });
});

describe("attention: new lead with no first contact after 60 minutes", () => {
  it("appears only after the threshold and disappears once contacted", async () => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "Waiting lead", phone: "0551240001" });
    expect(ids(await crmAttention(rep))).not.toContain(`nfc-${l.id}`);
    await age(l.id, FIRST_CONTACT_SLA_MINUTES - 1);
    expect(ids(await crmAttention(rep))).not.toContain(`nfc-${l.id}`);
    await age(l.id, FIRST_CONTACT_SLA_MINUTES + 1);
    const item = (await crmAttention(rep)).find((a) => a.id === `nfc-${l.id}`)!;
    expect(item).toMatchObject({ category: "lead_no_contact", priority: "HIGH", href: `/app/crm/leads/${l.id}` });
    await logActivity(rep, { entityType: "LEAD", entityId: l.id, type: "CALL", title: "First call" });
    expect(ids(await crmAttention(rep))).not.toContain(`nfc-${l.id}`);
  });

  it("the threshold is evaluated with the JS clock passed in, not the database clock", async () => {
    const { rep } = await users();
    const l = await createLead(rep, { name: "Clock lead", phone: "0551240002" });
    const created = (await lead(l.id)).createdAt.getTime();
    expect(ids(await uncontactedLeads(rep, { now: new Date(created + 59 * MIN) }))).toEqual([]);
    expect(ids(await uncontactedLeads(rep, { now: new Date(created + 61 * MIN) }))).toEqual([`nfc-${l.id}`]);
  });

  it("respects record scope: personal by default, scoped in team mode, unassigned leads for whoever can assign", async () => {
    const { manager, rep, rep2 } = await users();
    const mine = await createLead(rep, { name: "Rep lead", phone: "0551240003" });
    await captureWebsiteLead({ name: "Unassigned web", phone: "0551240004", source: "quote", message: "Need a site", elapsed: 9000 }, { ip: "203.0.113.10", userAgent: "vitest" });
    const web = await prisma.lead.findFirstOrThrow({ where: { source: "WEBSITE" } });
    await age(mine.id, 90);
    await age(web.id, 90);
    const nfc = async (ctx: typeof rep, team?: boolean) => ids(await crmAttention(ctx, { team })).filter((i) => i.startsWith("nfc-")).sort();
    expect(await nfc(rep)).toEqual([`nfc-${mine.id}`]);
    expect(await nfc(rep, true)).toEqual([`nfc-${mine.id}`]);
    expect(await nfc(rep2)).toEqual([]);
    expect(await nfc(rep2, true)).toEqual([]); // OWN scope never widens, and never sees unassigned leads
    expect(await nfc(manager)).toEqual([`nfc-${web.id}`]); // personal: not the rep's lead, but the unassigned one
    expect(await nfc(manager, true)).toEqual([`nfc-${mine.id}`, `nfc-${web.id}`].sort());
  });

  it("ignores leads that are not new/open, and old leads whose contact predates the column", async () => {
    const { rep } = await users();
    const moved = await createLead(rep, { name: "Created contacted", phone: "0551240005", stage: "CONTACTED" });
    const legacy = await createLead(rep, { name: "Legacy contacted", phone: "0551240006" });
    const waiting = await createLead(rep, { name: "Really waiting", phone: "0551240007", priority: "URGENT" });
    for (const l of [moved, legacy, waiting]) await age(l.id, 600);
    // a contact logged before firstContactedAt existed: the activity row is there, the column is NULL
    await prisma.crmActivity.create({ data: { organizationId: orgId, entityType: "LEAD", entityId: legacy.id, type: "CALL", title: "Old call", createdById: rep.userId } });
    const out = await uncontactedLeads(rep);
    expect(ids(out)).toEqual([`nfc-${waiting.id}`]);
    expect(out[0].priority).toBe("URGENT");
  });
});

describe("response time per owner", () => {
  it("returns the median minutes from creation to first contact for the period, within scope", async () => {
    const { manager, rep, rep2 } = await users();
    const now = Date.now();
    const mk = async (ctx: typeof rep, n: number, ageMin: number, respondedAfter: number | null) => {
      const l = await createLead(ctx, { name: `RT ${n}`, phone: `05512500${String(n).padStart(2, "0")}` });
      const createdAt = new Date(now - ageMin * MIN);
      await prisma.lead.update({ where: { id: l.id }, data: { createdAt, firstContactedAt: respondedAfter == null ? null : new Date(createdAt.getTime() + respondedAfter * MIN) } });
    };
    await mk(rep, 1, 500, 4);
    await mk(rep, 2, 400, 10);
    await mk(rep, 3, 300, 90);
    await mk(rep, 4, 200, null); // not contacted yet: counted, not in the median
    await mk(rep2, 5, 300, 5);
    await mk(rep2, 6, 200, 20);
    await mk(rep, 7, 40 * 24 * 60, 1); // outside a 30-day period

    const all = await leadResponseTimes(manager, 30, new Date(now));
    const of = (id: string) => all.byOwner.find((r) => r.ownerId === id)!;
    expect(of(rep.userId)).toMatchObject({ leads: 4, contacted: 3, withinSla: 2, medianMinutes: 10 });
    expect(of(rep2.userId)).toMatchObject({ leads: 2, contacted: 2, withinSla: 2, medianMinutes: 12.5 });
    expect(all.overall).toMatchObject({ leads: 6, contacted: 5, withinSla: 4, medianMinutes: 10 });
    expect(all.byOwner.map((r) => r.ownerId)).toEqual([rep2.userId, rep.userId]); // slowest first
    expect(all.slaMinutes).toBe(60);

    const wide = await leadResponseTimes(manager, 90, new Date(now));
    expect(wide.byOwner.find((r) => r.ownerId === rep.userId)).toMatchObject({ leads: 5, contacted: 4, medianMinutes: 7 });

    // OWN scope: a rep only sees their own numbers
    const own = await leadResponseTimes(rep2, 30, new Date(now));
    expect(own.byOwner.map((r) => r.ownerId)).toEqual([rep2.userId]);
    expect(own.overall).toMatchObject({ leads: 2, medianMinutes: 12.5 });
  });

  it("is empty-safe and permission-checked", async () => {
    const { manager } = await users();
    const emp = await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id);
    expect(await leadResponseTimes(manager, 7)).toMatchObject({ byOwner: [], overall: { leads: 0, contacted: 0, medianMinutes: null } });
    await expect(leadResponseTimes(emp, 7)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("automation: assign_owner round-robin", () => {
  const webLead = async (n: number) => {
    await captureWebsiteLead({ name: `Web ${n}`, phone: `05512600${String(n).padStart(2, "0")}`, source: "quote", message: "Need a site", elapsed: 9000 }, { ip: `203.0.113.${20 + n}`, userAgent: "vitest" });
    return prisma.lead.findFirstOrThrow({ where: { name: `Web ${n}` } });
  };
  const rule = async (ctx: Awaited<ReturnType<typeof users>>["admin"], actions: unknown) => {
    const { id } = await createRule(ctx, { name: "Rotate new leads", triggerEvent: "lead.created", conditions: { all: [{ field: "lead.hasOwner", op: "eq", value: false }] }, actions });
    await setRuleEnabled(ctx, id, true);
    return id;
  };

  it("rotates new unassigned leads across the listed users in order", async () => {
    const u = await users();
    const pool = [u.rep.userId, u.rep2.userId, u.manager.userId];
    const id = await rule(u.admin, [{ type: "assign_owner", userIds: pool }]);
    const owners: (string | null)[] = [];
    for (let n = 1; n <= 7; n++) owners.push((await webLead(n)).ownerId);
    expect(owners).toEqual([pool[0], pool[1], pool[2], pool[0], pool[1], pool[2], pool[0]]);
    expect(await prisma.automationExecution.count({ where: { ruleId: id, status: "SUCCEEDED" } })).toBe(7);
    expect((await prisma.lead.findFirstOrThrow({ where: { name: "Web 1" } })).assignedAt).toBeInstanceOf(Date);
    // a lead that already has an owner does not match the rule and does not consume a turn
    await createLead(u.manager, { name: "Manual lead", phone: "0551260099" });
    expect((await webLead(8)).ownerId).toBe(pool[1]);
  });

  it("skips users who became inactive", async () => {
    const u = await users();
    const pool = [u.rep.userId, u.rep2.userId];
    await rule(u.admin, [{ type: "assign_owner", userIds: pool }]);
    await prisma.user.update({ where: { id: u.rep.userId }, data: { status: "DISABLED" } });
    expect([(await webLead(1)).ownerId, (await webLead(2)).ownerId]).toEqual([u.rep2.userId, u.rep2.userId]);
  });

  it("single userId behaves as before", async () => {
    const u = await users();
    await rule(u.admin, [{ type: "assign_owner", userId: u.rep.userId }]);
    expect([(await webLead(1)).ownerId, (await webLead(2)).ownerId]).toEqual([u.rep.userId, u.rep.userId]);
    expect(await prisma.sequence.count({ where: { key: { startsWith: "RR:" } } })).toBe(0);
  });

  it("validates the list when the rule is saved", async () => {
    const u = await users();
    const bad = (action: unknown) => createRule(u.admin, { name: "Bad rotation", triggerEvent: "lead.created", actions: [action] });
    const code = (re: RegExp) => ({ code: "VALIDATION", message: expect.stringMatching(re) });
    await expect(bad({ type: "assign_owner" })).rejects.toMatchObject(code(/ACTION_INVALID:assign_owner/));
    await expect(bad({ type: "assign_owner", userId: u.rep.userId, userIds: [u.rep.userId, u.rep2.userId] })).rejects.toMatchObject(code(/ACTION_INVALID:assign_owner/));
    await expect(bad({ type: "assign_owner", userIds: [u.rep.userId] })).rejects.toMatchObject(code(/ACTION_INVALID:assign_owner/));
    await expect(bad({ type: "assign_owner", userIds: [u.rep.userId, u.rep.userId] })).rejects.toMatchObject(code(/assign_owner\.duplicate/));
    await expect(bad({ type: "assign_owner", userIds: [u.rep.userId, "no-such-user"] })).rejects.toMatchObject(code(/assign_owner\.user/));
  });
});
