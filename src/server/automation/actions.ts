import { z } from "zod";
import { prisma } from "../db";
import { invalid, conflict } from "../errors";
import type { Ctx } from "../context";
import { isPermission, type Permission } from "../rbac/permissions";
import { usersWithAll } from "../events/subscribers";
import { setLeadFollowUp, updateLead } from "../crm/leads";
import { updateOpportunity } from "../crm/opportunities";
import { logActivity } from "../crm/activities";
import { createTask } from "../projects/work";
import { enqueue } from "../integrations/outbox";
import { addDays, todayIn, ymd } from "../commercial/dates";
import type { EntityKind, Loaded } from "./catalog";

/**
 * Allow-listed automation actions (docs/AUTOMATION.md#actions). Every action reuses an existing service and runs with
 * the rule's run-as user's CURRENT permissions minus AUTOMATION_DENIED_PERMISSIONS — automation can never do more than
 * that person could do by hand, and never anything high-risk.
 */

/** Never executable by automation, whatever the rule says (approvals, money, payroll, contracts, deletions, bulk sends). */
export const HIGH_RISK_ACTIONS = [
  "approve_quotation", "approve_expense", "decide_approval", "pay_invoice", "record_payment", "issue_invoice", "mark_payroll_paid", "approve_payroll",
  "change_salary", "delete_client", "archive_client", "terminate_employee", "send_campaign", "start_campaign", "issue_contract", "activate_contract",
  "terminate_contract", "issue_purchase_order", "grant_role"
] as const;

/** Stripped from the run-as context (defence in depth — no allowed action needs them). */
export const AUTOMATION_DENIED_PERMISSIONS: Permission[] = [
  "approvals.decide", "sales.quotations.approve", "sales.quotations.approve_executive", "sales.quotations.accept", "sales.contracts.activate", "sales.contracts.terminate",
  "finance.invoices.issue", "finance.invoices.cancel", "finance.payments.create", "finance.payments.reverse", "finance.expenses.approve", "finance.expenses.approve_executive", "finance.expenses.pay",
  "hr.payroll.prepare", "hr.payroll.approve", "hr.payroll.pay", "hr.compensation.manage", "hr.bank.view", "hr.bank.manage", "hr.employees.archive", "hr.offers.approve",
  "crm.clients.archive", "whatsapp.campaigns.create", "whatsapp.campaigns.approve", "whatsapp.send", "procurement.orders.issue", "procurement.orders.approve",
  "procurement.requests.approve", "procurement.requests.approve_executive", "integrations.manage", "automation.manage", "system.jobs.manage", "system.events.retry",
  "admin.users.manage", "admin.roles.manage", "admin.roles.grant_privileged", "admin.settings.manage"
];

const text = (max: number) => z.string().trim().min(2).max(max);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notify"),
    to: z.enum(["owner", "permission", "user"]),
    permission: z.string().max(60).optional(),
    userId: z.string().max(40).optional(),
    priority: z.enum(["MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    message: text(200)
  }).strict(),
  z.object({ type: z.literal("activity"), message: text(200), visibility: z.string().max(60).optional() }).strict(),
  z.object({ type: z.literal("follow_up"), inDays: z.number().int().min(0).max(90), title: text(200) }).strict(),
  z.object({ type: z.literal("project_task"), title: text(300), inDays: z.number().int().min(0).max(180), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM") }).strict(),
  z.object({ type: z.literal("assign_owner"), userId: z.string().min(1).max(40) }).strict(),
  z.object({ type: z.literal("outbound_webhook"), connectionId: z.string().min(1).max(40) }).strict()
]);
export type Action = z.infer<typeof actionSchema>;
export const ACTION_TYPES = ["notify", "activity", "follow_up", "project_task", "assign_owner", "outbound_webhook"] as const;

/** Which entity kinds an action can act on. */
const ACTION_KINDS: Partial<Record<Action["type"], EntityKind[]>> = {
  follow_up: ["lead", "opportunity", "quotation", "contract", "project", "invoice", "ticket"],
  project_task: ["project"],
  assign_owner: ["lead", "opportunity"]
};

export async function validateActions(organizationId: string, raw: unknown, kind: EntityKind): Promise<Action[]> {
  if (!Array.isArray(raw) || raw.length === 0) throw invalid("ACTIONS_REQUIRED");
  if (raw.length > 5) throw invalid("ACTIONS_TOO_MANY");
  const out: Action[] = [];
  for (const a of raw) {
    const type = (a as { type?: unknown })?.type;
    if (typeof type === "string" && (HIGH_RISK_ACTIONS as readonly string[]).includes(type)) throw invalid(`HIGH_RISK_ACTION:${type}`);
    if (typeof type !== "string" || !(ACTION_TYPES as readonly string[]).includes(type)) throw invalid(`UNKNOWN_ACTION:${String(type)}`);
    const p = actionSchema.safeParse(a);
    if (!p.success) throw invalid(`ACTION_INVALID:${type}`);
    const act = p.data;
    const kinds = ACTION_KINDS[act.type];
    if (kinds && !kinds.includes(kind)) throw invalid(`ACTION_NOT_FOR_TRIGGER:${act.type}`);
    if (act.type === "notify") {
      if (act.to === "permission" && (!act.permission || !isPermission(act.permission))) throw invalid("ACTION_INVALID:notify.permission");
      if (act.to === "user" && !(await activeUser(organizationId, act.userId))) throw invalid("ACTION_INVALID:notify.user");
    }
    if (act.type === "activity" && act.visibility && !isPermission(act.visibility)) throw invalid("ACTION_INVALID:activity.visibility");
    if (act.type === "assign_owner" && !(await activeUser(organizationId, act.userId))) throw invalid("ACTION_INVALID:assign_owner.user");
    if (act.type === "outbound_webhook") {
      const c = await prisma.integrationConnection.findFirst({ where: { id: act.connectionId, organizationId, provider: "CUSTOM" } });
      if (!c) throw invalid("ACTION_INVALID:outbound_webhook.connection");
    }
    out.push(act);
  }
  return out;
}

const activeUser = (organizationId: string, id?: string) => (id ? prisma.user.findFirst({ where: { id, organizationId, status: "ACTIVE", deletedAt: null }, select: { id: true } }) : null);

export type ActionContext = { executionId: string; ruleName: string; eventType: string; entityType: string | null; entityId: string | null; kind: EntityKind; entity: Loaded; runAs: Ctx };
export type ActionOutcome = { ref?: string | null; skipped?: string };

/** Execute one action. Throws on failure (recorded by the engine). Idempotent where the target allows it. */
export async function runAction(a: Action, x: ActionContext, index: number): Promise<ActionOutcome> {
  const org = x.runAs.organizationId;
  switch (a.type) {
    case "notify": {
      const ids =
        a.to === "owner" ? [x.entity.ownerUserId] : a.to === "user" ? [a.userId] : await usersWithAll(org, [a.permission as Permission]);
      const users = await prisma.user.findMany({ where: { id: { in: ids.filter((v): v is string => Boolean(v)) }, organizationId: org, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!users.length) return { skipped: "NO_RECIPIENTS" };
      // the recipient sees the rule's message + the record label; opening it is still permission-checked by the page
      await prisma.notification.createMany({
        data: users.map((u) => ({ organizationId: org, userId: u.id, category: "AUTOMATION" as const, priority: a.priority, title: `${a.message} — ${x.entity.label}`.slice(0, 300), body: x.ruleName, href: x.entity.href, entityType: x.entityType, entityId: x.entityId, dedupeKey: `auto:${x.executionId}:${index}` })),
        skipDuplicates: true
      });
      return { ref: `${users.length} recipient(s)` };
    }
    case "activity": {
      await prisma.activity.createMany({
        data: [{ id: `auto-${x.executionId}-${index}`, organizationId: org, actorId: null, verb: "automation.action", entityType: x.entityType ?? "System", entityId: x.entityId, entityLabel: `${a.message} — ${x.entity.label}`.slice(0, 300), href: x.entity.href, visibility: a.visibility ?? null, meta: { rule: x.ruleName, event: x.eventType } }],
        skipDuplicates: true
      });
      return { ref: `auto-${x.executionId}-${index}` };
    }
    case "follow_up": {
      const tz = (await prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { timezone: true } })).timezone;
      const due = addDays(todayIn(tz), a.inDays);
      if (x.kind === "lead" && x.entity.leadId) {
        await setLeadFollowUp(x.runAs, x.entity.leadId, due);
        return { ref: `lead follow-up ${ymd(due)}` };
      }
      if (x.kind === "opportunity" && x.entity.opportunityId) {
        await updateOpportunity(x.runAs, { id: x.entity.opportunityId, nextFollowUpAt: due });
        return { ref: `opportunity follow-up ${ymd(due)}` };
      }
      if (!x.entity.clientId) return { skipped: "NO_CLIENT" };
      // other records: a FOLLOW_UP entry on the client's CRM timeline (crm.activities.create + client visibility of the run-as user)
      const act = await logActivity(x.runAs, { entityType: "CLIENT", entityId: x.entity.clientId, type: "FOLLOW_UP", title: `${a.title} (${x.entity.label}) — ${ymd(due)}`.slice(0, 200) });
      return { ref: act.id };
    }
    case "project_task": {
      if (!x.entity.projectId) return { skipped: "NOT_A_PROJECT" };
      const tz = (await prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { timezone: true } })).timezone;
      // idempotency guard for retries: one task per execution + action (title carries the execution marker)
      const marker = `[auto:${x.executionId.slice(-8)}:${index}]`;
      const existing = await prisma.task.findFirst({ where: { projectId: x.entity.projectId, title: { endsWith: marker } }, select: { id: true } });
      if (existing) return { ref: existing.id };
      const t = await createTask(x.runAs, { projectId: x.entity.projectId, title: `${a.title} ${marker}`.slice(0, 300), priority: a.priority, dueDate: addDays(todayIn(tz), a.inDays) });
      return { ref: (t as { id: string }).id };
    }
    case "assign_owner": {
      if (x.entity.ownerUserId === a.userId) return { skipped: "ALREADY_OWNER" };
      if (x.kind === "lead" && x.entity.leadId) await updateLead(x.runAs, { id: x.entity.leadId, ownerId: a.userId });
      else if (x.kind === "opportunity" && x.entity.opportunityId) await updateOpportunity(x.runAs, { id: x.entity.opportunityId, ownerId: a.userId });
      else return { skipped: "NOT_ASSIGNABLE" };
      return { ref: a.userId };
    }
    case "outbound_webhook": {
      const c = await prisma.integrationConnection.findFirst({ where: { id: a.connectionId, organizationId: org, provider: "CUSTOM" } });
      if (!c) throw conflict("CONNECTION_MISSING");
      if (!["CONNECTED", "DEGRADED"].includes(c.status)) return { skipped: `CONNECTION_${c.status}` };
      const row = await prisma.$transaction((tx) =>
        enqueue(tx, org, { provider: "CUSTOM", connectionId: c.id, eventType: "custom.deliver", idempotencyKey: `automation:${x.executionId}:${index}`, entityType: x.entityType ?? undefined, entityId: x.entityId ?? undefined, payload: { event: `automation.${x.eventType}`, deliveryId: `${x.executionId}-${index}`, data: { rule: x.ruleName, event: x.eventType, entityType: x.entityType, entityId: x.entityId, label: x.entity.label } } })
      );
      return { ref: row.id };
    }
  }
}
