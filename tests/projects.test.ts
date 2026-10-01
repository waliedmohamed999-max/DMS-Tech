import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createClient } from "@/server/crm/clients";
import { createOpportunity } from "@/server/crm/opportunities";
import { acceptQuotation, createQuotation, markQuotationSent, submitQuotation } from "@/server/commercial/quotations";
import { activateContract, createContractFromQuotation, getContract, sendContractForSignature, updateContract } from "@/server/commercial/contracts";
import { addProjectMember, changeProjectStatus, completeProject, createProject, getProject, listProjects } from "@/server/projects/projects";
import { assignTask, changeTaskStatus, createTask, projectBoard, setMilestoneStatus, updateMilestone, updateTask } from "@/server/projects/work";
import { createTimeEntry, submitTimesheet, updateTimeEntry } from "@/server/projects/time";
import { createDeliverable, createDependency, recordClientDecision, setDeliverableStatus, setDependencyStatus } from "@/server/projects/delivery";
import { saveTemplate } from "@/server/projects/templates";
import { sweepProjects } from "@/server/projects/sweep";
import { decideApproval } from "@/server/approvals/service";
import { globalSearch, getKpis } from "@/server/dashboard/service";
import { migrateLegacyPermissions } from "@/server/rbac/migrate";
import { addDays, todayIn } from "@/server/commercial/dates";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";
import "@/server/projects/time";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const users = async () => ({
  pm: await ctxFor((await makeUser(orgId, "pm@x.test", ["project_manager"])).id),
  pm2: await ctxFor((await makeUser(orgId, "pm2@x.test", ["project_manager"])).id),
  dev: await ctxFor((await makeUser(orgId, "dev@x.test", ["developer"])).id),
  designer: await ctxFor((await makeUser(orgId, "des@x.test", ["designer"])).id),
  employee: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id),
  sales: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  ceo: await ctxFor((await makeUser(orgId, "ceo@x.test", ["ceo"])).id)
});
type U = Awaited<ReturnType<typeof users>>;
const today = () => todayIn("Asia/Riyadh");
const svc = (key: string) => prisma.service.findFirstOrThrow({ where: { organizationId: orgId, key } });

/** A real ACTIVE contract built through the Phase 3 services. */
async function acceptedQuote(u: U) {
  const client = await createClient(u.sales, { displayName: "Nakheel Trading" });
  const opp = await createOpportunity(u.sales, { clientId: client.id, title: "Website", serviceId: (await svc("web-development")).id });
  const q = await createQuotation(u.sales, { clientId: client.id, opportunityId: opp.id, items: [{ serviceId: (await svc("web-development")).id, name: "Website", quantity: "1", unitPrice: "20000" }], deliveryTerms: "8 weeks" });
  await submitQuotation(u.sales, q.id);
  await markQuotationSent(u.sales, q.id, { method: "OTHER", confirm: true });
  const v = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q.id } });
  await acceptQuotation(u.sales, q.id, { versionId: v.id, confirm: true, markOpportunityWon: false });
  return { q, client, opp, v };
}
async function activeContract(u: U) {
  const a = await acceptedQuote(u);
  const c = await createContractFromQuotation(u.sales, a.q.id);
  await updateContract(u.sales, c.id, { title: "Website contract", startDate: today().toISOString().slice(0, 10), endDate: addDays(today(), 90).toISOString().slice(0, 10), milestones: [{ title: "Design approval", percentage: 40 }, { title: "Go live", percentage: 60 }] });
  await sendContractForSignature(u.sales, c.id);
  await activateContract(u.sales, c.id, { signedAt: today().toISOString().slice(0, 10), confirm: true });
  return { ...a, contractId: c.id };
}
async function project(u: U, extra: Record<string, unknown> = {}) {
  const c = await activeContract(u);
  const p = await createProject(u.pm, { source: "contract", contractId: c.contractId, ...extra });
  return { ...c, projectId: p.id, number: p.number };
}

describe("project creation", () => {
  it("1. creates a project from an active contract with a commercial snapshot and the service template", async () => {
    const u = await users();
    const { projectId, number, contractId, v } = await project(u);
    expect(number).toMatch(/^PRJ-\d{4}-000001$/);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { members: true, milestones: true, tasks: true, template: true } });
    expect(p.contractId).toBe(contractId);
    expect(p.quotationVersionId).toBe(v.id);
    expect(p.budgetAmount?.toFixed(2)).toBe("20000.00"); // net, excl. VAT
    expect(p.deliveryTerms).toBe("8 weeks");
    expect(p.template?.code).toBe("website");
    expect(p.members.map((m) => [m.userId, m.role])).toEqual([[u.pm.userId, "PROJECT_MANAGER"]]);
    expect(p.milestones).toHaveLength(6);
    expect(p.tasks.length).toBeGreaterThan(5);
    expect(p.tasks[0].number).toMatch(/^TASK-\d{6}$/);
    expect(await prisma.domainEvent.count({ where: { type: "project.created" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "project.created" } })).toBe(1);
    // a contract that is not active cannot start delivery
    const a2 = await acceptedQuote(u);
    const draftContract = await createContractFromQuotation(u.sales, a2.q.id);
    await expect(createProject(u.pm, { source: "contract", contractId: draftContract.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("2. creates from an accepted quotation only when the company policy allows it, and prefers the contract", async () => {
    const u = await users();
    const { q } = await acceptedQuote(u);
    await expect(createProject(u.pm, { source: "quotation", quotationId: q.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.organization.update({ where: { id: orgId }, data: { projectFromQuotationAllowed: true } });
    const p = await createProject(u.ceo, { source: "quotation", quotationId: q.id, milestoneSource: "none" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).contractId).toBeNull();
    const other = await acceptedQuote(u);
    await createContractFromQuotation(u.sales, other.q.id);
    await expect(createProject(u.ceo, { source: "quotation", quotationId: other.q.id })).rejects.toMatchObject({ message: expect.stringMatching(/^USE_CONTRACT/) });
    // internal projects need their own policy flag
    await expect(createProject(u.pm, { source: "internal", name: "DMS website redesign" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.organization.update({ where: { id: orgId }, data: { internalProjectsAllowed: true } });
    const internal = await createProject(u.pm, { source: "internal", name: "DMS website redesign", milestoneSource: "none" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: internal.id } })).type).toBe("INTERNAL");
  });

  it("3. duplicate project creation from one contract is prevented (also concurrently)", async () => {
    const u = await users();
    const c = await activeContract(u);
    const res = await Promise.allSettled([createProject(u.pm, { source: "contract", contractId: c.contractId }), createProject(u.ceo, { source: "contract", contractId: c.contractId })]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(createProject(u.pm, { source: "contract", contractId: c.contractId })).rejects.toMatchObject({ message: expect.stringMatching(/^PROJECT_EXISTS/) });
    expect(await prisma.project.count()).toBe(1);
  });
});

describe("visibility", () => {
  it("4–6. members see the project, never its commercial data; outsiders do not see it at all", async () => {
    const u = await users();
    const { projectId, number, contractId } = await project(u);
    await addProjectMember(u.pm, projectId, { userId: u.dev.userId, role: "DEVELOPER" });
    const asDev = await getProject(u.dev, projectId);
    expect(asDev.project.name).toBeTruthy();
    expect(asDev.commercial).toBeNull();
    expect(asDev.project).not.toHaveProperty("budgetAmount");
    expect(asDev.project).not.toHaveProperty("contractId");
    await expect(getContract(u.dev, contractId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getProject(u.pm, projectId)).commercial?.budgetAmount).toBe("20000.00");
    await expect(getProject(u.designer, projectId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getProject(u.employee, projectId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listProjects(u.designer, {})).total).toBe(0);
    // sales sees status of their client's project
    expect((await listProjects(u.sales, {})).total).toBe(1);
    // 26. search respects scope
    const hit = async (ctx: typeof u.dev) => (await globalSearch(ctx, number)).some((r) => r.type === "project");
    expect(await hit(u.dev)).toBe(true);
    expect(await hit(u.designer)).toBe(false);
    expect(await hit(u.employee)).toBe(false);
  });
});

describe("templates", () => {
  it("7–8. a template creates snapshot milestones/tasks; editing the template later never changes the project", async () => {
    const u = await users();
    const { projectId } = await project(u);
    const tpl = await prisma.projectTemplate.findFirstOrThrow({ where: { organizationId: orgId, code: "website" }, include: { milestones: { include: { tasks: true } } } });
    const before = await prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, select: { title: true, weight: true } });
    expect(before.map((m) => m.title)).toEqual(tpl.milestones.sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.titleAr));
    await saveTemplate(u.pm, { id: tpl.id, code: "website", nameAr: "قالب", nameEn: "Template", milestones: [{ titleAr: "مرحلة جديدة", titleEn: "New", weight: 50, offsetDays: 3, tasks: [] }] });
    const after = await prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, select: { title: true, weight: true } });
    expect(after).toEqual(before);
    expect(await prisma.task.count({ where: { projectId } })).toBeGreaterThan(5);
  });
});

describe("tasks", () => {
  async function setup() {
    const u = await users();
    const p = await project(u, { milestoneSource: "none" });
    await addProjectMember(u.pm, p.projectId, { userId: u.dev.userId, role: "DEVELOPER" });
    const t = await createTask(u.pm, { projectId: p.projectId, title: "Build header", assigneeId: u.dev.userId });
    return { u, ...p, taskId: t.id };
  }

  it("9. assignment persists, notifies the assignee and only members can be assigned", async () => {
    const { u, projectId, taskId } = await setup();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).assigneeId).toBe(u.dev.userId);
    expect(await prisma.notification.count({ where: { userId: u.dev.userId, entityId: taskId } })).toBe(1);
    await expect(assignTask(u.pm, taskId, u.designer.userId)).rejects.toMatchObject({ message: expect.stringMatching(/^ASSIGNEE_NOT_MEMBER/) });
    await expect(assignTask(u.dev, taskId, u.pm.userId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTask(u.designer, { projectId, title: "Sneaky" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("10–12. invalid transitions are refused, BLOCKED needs a reason, Kanban moves persist and stale moves fail", async () => {
    const { u, projectId, taskId } = await setup();
    await expect(changeTaskStatus(u.dev, taskId, { to: "DONE" })).rejects.toMatchObject({ message: expect.stringMatching(/^TASK_INVALID_TRANSITION/) });
    await expect(changeTaskStatus(u.dev, taskId, { to: "BLOCKED" })).rejects.toMatchObject({ message: expect.stringMatching(/^BLOCKED_REASON_REQUIRED/) });
    await expect(prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED" } })).rejects.toThrow();
    await changeTaskStatus(u.dev, taskId, { to: "IN_PROGRESS", from: "TODO", position: 0 });
    const board = await projectBoard(u.dev, projectId);
    expect(board.find((c) => c.status === "IN_PROGRESS")!.items.map((i) => i.id)).toEqual([taskId]);
    await expect(changeTaskStatus(u.dev, taskId, { to: "REVIEW", from: "TODO" })).rejects.toMatchObject({ message: expect.stringMatching(/^TASK_STALE/) });
    await changeTaskStatus(u.dev, taskId, { to: "BLOCKED", reason: "Waiting for API keys" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).blockedReason).toBe("Waiting for API keys");
    expect(await prisma.notification.count({ where: { userId: u.pm.userId, title: { contains: "Waiting for API keys" } } })).toBe(1);
    await changeTaskStatus(u.pm, taskId, { to: "IN_PROGRESS" });
    await changeTaskStatus(u.dev, taskId, { to: "DONE" });
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect([t.status, t.blockedReason, Boolean(t.completedAt)]).toEqual(["DONE", null, true]);
    expect(await prisma.domainEvent.count({ where: { type: { in: ["task.started", "task.blocked", "task.completed"] } } })).toBe(3);
  });

  it("starting an already-overdue task keeps its dates valid", async () => {
    const { u, projectId } = await setup();
    const due = new Date(Date.UTC(2020, 0, 10));
    const late = await createTask(u.pm, { projectId, title: "Late task", assigneeId: u.dev.userId, dueDate: "2020-01-10" });
    await changeTaskStatus(u.dev, late.id, { to: "IN_PROGRESS" });
    const t = await prisma.task.findUniqueOrThrow({ where: { id: late.id } });
    expect([t.status, t.startDate?.getTime()]).toEqual(["IN_PROGRESS", due.getTime()]);
  });
});

describe("progress & health", () => {
  it("13. completing weighted milestones drives project progress", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "contract" }); // 40 % + 60 %
    const ms = await prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
    expect(ms.map((m) => m.weight)).toEqual([40, 60]);
    expect(ms[0].contractMilestoneId).toBeTruthy();
    await setMilestoneStatus(u.pm, ms[0].id, { to: "COMPLETED" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).progress).toBe(40);
    // in-progress milestone contributes its task completion share
    const t1 = await createTask(u.pm, { projectId, title: "Task A", milestoneId: ms[1].id });
    await createTask(u.pm, { projectId, title: "Task B", milestoneId: ms[1].id });
    // starting a task auto-starts its not-started milestone (audited); finished tasks count toward progress
    await changeTaskStatus(u.pm, t1.id, { to: "IN_PROGRESS" });
    expect((await prisma.projectMilestone.findUniqueOrThrow({ where: { id: ms[1].id } })).status).toBe("IN_PROGRESS");
    expect(await prisma.auditLog.count({ where: { action: "milestone.status_changed", entityId: ms[1].id } })).toBe(1);
    await changeTaskStatus(u.pm, t1.id, { to: "DONE" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).progress).toBe(70);
  });

  it("14–16. overdue milestones and client dependencies change health, with explained reasons", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "contract" });
    await changeProjectStatus(u.pm, projectId, { to: "ACTIVE" });
    let p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.health).toBe("HEALTHY");
    const m = await prisma.projectMilestone.findFirstOrThrow({ where: { projectId } });
    await updateMilestone(u.pm, m.id, { dueDate: addDays(today(), -10) });
    p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.health).toBe("AT_RISK");
    const reasons = p.healthReasons as { code: string; severity: string; cause: string; params: { days: number } }[];
    expect(reasons[0]).toMatchObject({ code: "MILESTONE_OVERDUE", severity: "risk", cause: "internal", params: { days: 10 } });
    expect(await prisma.domainEvent.count({ where: { type: "project.at_risk" } })).toBe(1);
    await updateMilestone(u.pm, m.id, { dueDate: addDays(today(), 20) });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).health).toBe("HEALTHY");
    // client dependency: WAITING_CLIENT only with an open client dependency; overdue → client-caused reason
    await expect(changeProjectStatus(u.pm, projectId, { to: "WAITING_CLIENT" })).rejects.toMatchObject({ message: expect.stringMatching(/^NO_OPEN_CLIENT_DEPENDENCY/) });
    const d = await createDependency(u.pm, projectId, { title: "Payment gateway credentials", ownerSide: "CLIENT", type: "CREDENTIALS", critical: true, dueDate: addDays(today(), -3) });
    await changeProjectStatus(u.pm, projectId, { to: "WAITING_CLIENT" });
    p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.clientDependencyStatus).toBe("OVERDUE");
    expect((p.healthReasons as { code: string; cause: string }[]).find((r) => r.code === "CLIENT_DEPENDENCY_OVERDUE")).toMatchObject({ cause: "client" });
    await setDependencyStatus(u.pm, d.id, { to: "RESOLVED", note: "Received" });
    p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect([p.clientDependencyStatus, p.health]).toEqual(["NONE", "HEALTHY"]);
    expect(await prisma.domainEvent.count({ where: { type: "dependency.resolved" } })).toBe(1);
  });
});

describe("timesheets", () => {
  async function setup() {
    const u = await users();
    const p = await project(u, { milestoneSource: "none" });
    await addProjectMember(u.pm, p.projectId, { userId: u.dev.userId, role: "DEVELOPER" });
    return { u, ...p };
  }

  it("17–18. invalid time is refused; submitted time cannot be edited", async () => {
    const { u, projectId } = await setup();
    const d = today();
    for (const minutes of [0, -30, 2000]) await expect(createTimeEntry(u.dev, { projectId, date: d, minutes })).rejects.toMatchObject({ message: expect.stringMatching(/^TIME_MINUTES_INVALID/) });
    await expect(createTimeEntry(u.dev, { projectId, date: addDays(d, 2), minutes: 60 })).rejects.toMatchObject({ message: expect.stringMatching(/^TIME_IN_FUTURE/) });
    await createTimeEntry(u.dev, { projectId, date: d, minutes: 600 });
    await expect(createTimeEntry(u.dev, { projectId, date: d, minutes: 180 })).rejects.toMatchObject({ message: expect.stringMatching(/^TIME_DAILY_LIMIT/) });
    await expect(createTimeEntry(u.designer, { projectId, date: d, minutes: 60 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const e = await prisma.timeEntry.findFirstOrThrow({ where: { userId: u.dev.userId } });
    await submitTimesheet(u.dev, projectId);
    await expect(updateTimeEntry(u.dev, e.id, { minutes: 30 })).rejects.toMatchObject({ message: expect.stringMatching(/^TIME_ENTRY_LOCKED/) });
    await expect(prisma.timeEntry.update({ where: { id: e.id }, data: { minutes: 30 } })).rejects.toThrow(/TIME_ENTRY_LOCKED/);
  });

  it("19–20. only the project's manager approves (routed, not broadcast) and a double approval is impossible", async () => {
    const { u, projectId } = await setup();
    await createTimeEntry(u.dev, { projectId, date: today(), minutes: 240, description: "Header" });
    const { approvalId } = await submitTimesheet(u.dev, projectId);
    const ap = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
    expect(ap.assigneeId).toBe(u.pm.userId);
    expect(await prisma.notification.count({ where: { entityId: approvalId } })).toBe(1); // PM only, not every manager
    await expect(decideApproval(u.dev, { approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(u.pm2, { approvalId, decision: "APPROVED" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const res = await Promise.allSettled([decideApproval(u.pm, { approvalId, decision: "APPROVED" }), decideApproval(u.ceo, { approvalId, decision: "APPROVED" })]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const e = await prisma.timeEntry.findFirstOrThrow({ where: { userId: u.dev.userId } });
    expect(e.status).toBe("APPROVED");
    expect(await prisma.domainEvent.count({ where: { type: "time.approved" } })).toBe(1);
  });

  it("time rejection needs a reason and returns entries for correction", async () => {
    const { u, projectId } = await setup();
    await createTimeEntry(u.dev, { projectId, date: today(), minutes: 120 });
    const { approvalId } = await submitTimesheet(u.dev, projectId);
    await expect(decideApproval(u.pm, { approvalId, decision: "REJECTED" })).rejects.toMatchObject({ code: "VALIDATION" });
    await decideApproval(u.pm, { approvalId, decision: "REJECTED", comment: "Split per task" });
    const e = await prisma.timeEntry.findFirstOrThrow({ where: { userId: u.dev.userId } });
    expect([e.status, e.rejectionReason]).toEqual(["REJECTED", "Split per task"]);
    await updateTimeEntry(u.dev, e.id, { minutes: 90 });
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("DRAFT");
  });
});

describe("deliverables & completion", () => {
  it("21–22. deliverable lifecycle with an audited internal client acceptance", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "none" });
    const d = await createDeliverable(u.pm, projectId, { name: "Home page design", clientApprovalRequired: true });
    await expect(setDeliverableStatus(u.pm, d.id, { to: "DELIVERED" })).rejects.toMatchObject({ message: expect.stringMatching(/^DELIVERABLE_INVALID_TRANSITION/) });
    for (const to of ["IN_PROGRESS", "READY", "DELIVERED"] as const) await setDeliverableStatus(u.pm, d.id, { to });
    await recordClientDecision(u.pm, d.id, { decision: "ACCEPTED", note: "Approved by email", confirm: true });
    const row = await prisma.projectDeliverable.findUniqueOrThrow({ where: { id: d.id } });
    expect([row.status, row.clientApprovalStatus, row.clientDecisionById]).toEqual(["ACCEPTED", "APPROVED", u.pm.userId]);
    expect(await prisma.auditLog.findFirst({ where: { action: "deliverable.client_accepted", entityId: d.id } })).toMatchObject({ actorId: u.pm.userId, after: expect.objectContaining({ deliverable: "Home page design", method: "manual_record" }) });
    expect(await prisma.domainEvent.count({ where: { type: { in: ["deliverable.created", "deliverable.delivered", "deliverable.accepted"] } } })).toBe(3);
  });

  it("23–25. completion is blocked by requirements, override needs a reason, completion emits project.completed", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "contract" });
    await expect(completeProject(u.pm, projectId)).rejects.toMatchObject({ message: expect.stringMatching(/^PROJECT_INVALID_TRANSITION/) }); // still PLANNING
    await changeProjectStatus(u.pm, projectId, { to: "ACTIVE" });
    await expect(completeProject(u.pm, projectId)).rejects.toMatchObject({ message: expect.stringMatching(/^PROJECT_NOT_COMPLETABLE/) });
    await expect(completeProject(u.pm, projectId, { overrideReason: "ok" })).rejects.toMatchObject({ message: expect.stringMatching(/^PROJECT_NOT_COMPLETABLE/) });
    await expect(completeProject(u.dev, projectId, { overrideReason: "Client asked to close the project" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await completeProject(u.pm, projectId, { overrideReason: "Client signed off the remaining scope by letter" });
    const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(p.status).toBe("COMPLETED");
    expect(p.completionOverride).toContain("signed off");
    expect(await prisma.auditLog.count({ where: { action: "project.completed_override" } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "project.completed" } })).toBe(1);
    // no finance side effects: completion creates no other records (invoices are Phase 5)
    expect(await prisma.domainEvent.count({ where: { type: { startsWith: "invoice" } } })).toBe(0);
  });

  it("completes cleanly when every requirement is met", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "contract" });
    await changeProjectStatus(u.pm, projectId, { to: "ACTIVE" });
    for (const m of await prisma.projectMilestone.findMany({ where: { projectId } })) await setMilestoneStatus(u.pm, m.id, { to: "COMPLETED" });
    await completeProject(u.pm, projectId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).progress).toBe(100);
    expect(await prisma.auditLog.count({ where: { action: "project.completed" } })).toBe(1);
  });
});

describe("command center, sweep, notifications", () => {
  it("27. command center project metrics come from the database", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "contract" });
    await changeProjectStatus(u.pm, projectId, { to: "ACTIVE" });
    const m = await prisma.projectMilestone.findFirstOrThrow({ where: { projectId } });
    await updateMilestone(u.pm, m.id, { dueDate: addDays(today(), -9) });
    const k = await getKpis(u.pm);
    expect(k.find((x) => x.key === "activeProjects")).toMatchObject({ state: "live", value: 1 });
    expect(k.find((x) => x.key === "projectsAtRisk")).toMatchObject({ state: "live", value: 1 });
    const kd = await getKpis(u.designer);
    expect(kd.find((x) => x.key === "activeProjects")).toMatchObject({ value: 0 });
  });

  it("28–29. the sweep is idempotent and never duplicates notifications", async () => {
    const u = await users();
    const { projectId } = await project(u, { milestoneSource: "none" });
    await addProjectMember(u.pm, projectId, { userId: u.dev.userId, role: "DEVELOPER" });
    await changeProjectStatus(u.pm, projectId, { to: "ACTIVE" });
    const t = await createTask(u.pm, { projectId, title: "Late task", assigneeId: u.dev.userId });
    await updateTask(u.pm, t.id, { dueDate: addDays(today(), -2) });
    const first = await sweepProjects(orgId);
    expect(first).toMatchObject({ tasksOverdue: 1 });
    const [second, third] = await Promise.all([sweepProjects(orgId), sweepProjects(orgId)]); // concurrent runners
    for (const r of [second, third]) expect("skipped" in r ? 0 : r.tasksOverdue).toBe(0);
    expect(await prisma.notification.count({ where: { userId: u.dev.userId, dedupeKey: `task.overdue:${t.id}` } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { type: "task.overdue" } })).toBe(1);
  });
});

describe("custom role permission migration", () => {
  it("30. renamed permissions on custom roles are mapped once, audited, and never broadened", async () => {
    const role = await prisma.role.create({ data: { organizationId: orgId, key: "ops_lead", name: "Ops lead", permissions: { create: [{ permission: "sales.contracts.manage" }, { permission: "tasks.manage" }, { permission: "dashboard.view" }] } } });
    const first = await migrateLegacyPermissions(orgId);
    expect(first).toHaveLength(1);
    const perms = (await prisma.rolePermission.findMany({ where: { roleId: role.id } })).map((p) => p.permission).sort();
    expect(perms).toContain("sales.contracts.activate");
    expect(perms).toContain("projects.tasks.change_status");
    expect(perms).not.toContain("sales.contracts.manage");
    expect(perms).not.toContain("tasks.manage");
    expect(perms.some((p) => p.includes("records"))).toBe(false); // no scope broadening
    expect(perms).not.toContain("projects.tasks.assign");
    expect(await migrateLegacyPermissions(orgId)).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: "rbac.permissions_migrated", entityId: role.id } })).toBe(1);
  });
});
