import { z } from "zod";
import { Prisma, type AutomationExecution } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { can, requirePermission, systemCtx, type Ctx } from "../context";
import { conflict, forbidden, invalid, isAppError, notFound } from "../errors";
import { subscribe, unitOfWork, type StoredEvent } from "../events/bus";
import { isPermission, type Permission } from "../rbac/permissions";
import { optText, reqText } from "../crm/normalize";
import { runWithObs } from "../obs/context";
import { log } from "../obs/log";
import { metrics, METRIC } from "../obs/metrics";
import { redactString } from "../obs/redact";
import { ENTITY_TYPES, FIELDS, TRIGGERS, loadEntity, type EntityKind } from "./catalog";
import { evaluate, validateConditions, type Group } from "./conditions";
import { AUTOMATION_DENIED_PERMISSIONS, runAction, validateActions, type Action } from "./actions";

/**
 * Deterministic business rules (docs/AUTOMATION.md). NOT AI: trigger (existing domain event) → validated conditions → allow-listed actions.
 *
 * Guarantees
 *  · IDEMPOTENT: AutomationExecution is unique on (ruleId, domainEventId) — a re-dispatched event never runs a rule twice;
 *    a retried execution skips actions already completed (actionResults) and actions carry their own idempotency keys.
 *  · VERSIONED: every content change writes an immutable AutomationRuleVersion; an execution is pinned to the version current
 *    when it was created (retries use the same snapshot), so history keeps its meaning.
 *  · RECURSION-SAFE: events written by an action carry causationId = the triggering event, the same correlationId and depth+1.
 *    A rule never runs twice in one correlation chain (A → B → A stops), and nothing runs beyond MAX_DEPTH hops.
 *  · SAFE: actions run as the rule's run-as user with their CURRENT permissions minus every high-risk permission.
 *  · ORDERED: rules of one trigger run by priority, then creation time, then id. Two enabled rules that both assign an owner
 *    for the same trigger are rejected (no silent race).
 */
export const MAX_DEPTH = 3;
const RETRY_BASE_MS = 30_000;

// --- rule management -----------------------------------------------------------------------------------

const ruleSchema = z.object({
  name: reqText(3, 120),
  description: optText(500),
  triggerEvent: z.string().max(60),
  conditions: z.unknown().optional(),
  actions: z.unknown(),
  priority: z.coerce.number().int().min(0).max(1000).default(100)
});

const kindOf = (trigger: string): EntityKind => {
  const k = TRIGGERS[trigger];
  if (!k) throw invalid(`UNKNOWN_TRIGGER:${trigger}`);
  return k;
};

async function validated(ctx: Ctx, raw: unknown) {
  const input = ruleSchema.parse(raw);
  const kind = kindOf(input.triggerEvent);
  const conditions = validateConditions(input.conditions, kind);
  const actions = await validateActions(ctx.organizationId, input.actions, kind);
  return { ...input, conditions, actions, kind };
}

export async function createRule(ctx: Ctx, raw: unknown, templateKey?: string) {
  requirePermission(ctx, "automation.manage");
  const v = await validated(ctx, raw);
  return unitOfWork(ctx, async (tx, uow) => {
    // a new rule is always created DISABLED — enabling is a separate, audited step
    const r = await tx.automationRule.create({
      data: { organizationId: ctx.organizationId, name: v.name, description: v.description ?? null, triggerEvent: v.triggerEvent, conditions: v.conditions as Prisma.InputJsonValue, actions: v.actions as Prisma.InputJsonValue, priority: v.priority, enabled: false, templateKey: templateKey ?? null, runAsUserId: ctx.userId, createdById: ctx.userId, updatedById: ctx.userId }
    });
    await tx.automationRuleVersion.create({ data: { ruleId: r.id, version: 1, triggerEvent: r.triggerEvent, conditions: v.conditions as Prisma.InputJsonValue, actions: v.actions as Prisma.InputJsonValue, runAsUserId: ctx.userId, createdById: ctx.userId } });
    await uow.audit({ action: "automation.created", entityType: "AutomationRule", entityId: r.id, after: { name: r.name, trigger: r.triggerEvent, conditions: v.conditions, actions: v.actions, enabled: false, templateKey } });
    return { id: r.id };
  });
}

async function lockRule(ctx: Ctx, tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "AutomationRule" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
  const r = await tx.automationRule.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) throw notFound("AutomationRule");
  return r;
}

/** Edits create a new immutable version (the editor becomes the run-as user). Running executions keep their version. */
export async function updateRule(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "automation.manage");
  const v = await validated(ctx, raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await lockRule(ctx, tx, id);
    // canonical comparison: PostgreSQL jsonb does not keep key order
    const contentChanged = r.triggerEvent !== v.triggerEvent || canonical(r.conditions) !== canonical(v.conditions) || canonical(r.actions) !== canonical(v.actions) || r.runAsUserId !== ctx.userId;
    const version = contentChanged ? r.version + 1 : r.version;
    if (r.enabled) await assertNoConflict(tx, ctx, id, v.triggerEvent, v.actions);
    await tx.automationRule.update({ where: { id }, data: { name: v.name, description: v.description ?? null, priority: v.priority, triggerEvent: v.triggerEvent, conditions: v.conditions as Prisma.InputJsonValue, actions: v.actions as Prisma.InputJsonValue, version, runAsUserId: ctx.userId, updatedById: ctx.userId } });
    if (contentChanged) await tx.automationRuleVersion.create({ data: { ruleId: id, version, triggerEvent: v.triggerEvent, conditions: v.conditions as Prisma.InputJsonValue, actions: v.actions as Prisma.InputJsonValue, runAsUserId: ctx.userId, createdById: ctx.userId } });
    await uow.audit({ action: "automation.updated", entityType: "AutomationRule", entityId: id, before: { version: r.version, trigger: r.triggerEvent, conditions: r.conditions, actions: r.actions }, after: { version, trigger: v.triggerEvent, conditions: v.conditions, actions: v.actions, newVersion: contentChanged } });
    return { version };
  });
}

const canonical = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

/** Deterministic-order guarantee: two enabled rules on one trigger may not both assign an owner. */
async function assertNoConflict(tx: Tx, ctx: Ctx, id: string, trigger: string, actions: Action[]) {
  if (!actions.some((a) => a.type === "assign_owner")) return;
  const others = await tx.automationRule.findMany({ where: { organizationId: ctx.organizationId, triggerEvent: trigger, enabled: true, id: { not: id } }, select: { name: true, actions: true } });
  const clash = others.find((o) => (o.actions as Action[]).some((a) => a.type === "assign_owner"));
  if (clash) throw conflict(`RULE_CONFLICT:${clash.name}`);
}

export async function setRuleEnabled(ctx: Ctx, id: string, enabled: boolean) {
  requirePermission(ctx, "automation.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await lockRule(ctx, tx, id);
    if (r.enabled === enabled) return;
    if (enabled) {
      // re-validate against today's catalog / users / connections before switching on
      await validateActions(ctx.organizationId, r.actions, kindOf(r.triggerEvent));
      validateConditions(r.conditions, kindOf(r.triggerEvent));
      await assertNoConflict(tx, ctx, id, r.triggerEvent, r.actions as Action[]);
      const runAs = await prisma.user.findFirst({ where: { id: r.runAsUserId, status: "ACTIVE", deletedAt: null } });
      if (!runAs) throw conflict("RUN_AS_USER_INACTIVE");
    }
    await tx.automationRule.update({ where: { id }, data: { enabled, updatedById: ctx.userId } });
    await uow.audit({ action: enabled ? "automation.enabled" : "automation.disabled", entityType: "AutomationRule", entityId: id, before: { enabled: r.enabled }, after: { enabled, version: r.version } });
  });
}

// --- templates (always created disabled) ------------------------------------------------------------------

export const TEMPLATES: { key: string; name: { en: string; ar: string }; description: { en: string; ar: string }; rule: { triggerEvent: string; conditions: Group; actions: Action[] } }[] = [
  {
    key: "invoice_overdue_finance",
    name: { en: "Invoice overdue → notify finance", ar: "فاتورة متأخرة ← إشعار المالية" },
    description: { en: "Adds collectors to the built-in overdue notice (which already reaches the invoice owner).", ar: "يضيف فريق التحصيل إلى الإشعار المدمج (الذي يصل لصاحب الفاتورة مسبقًا)." },
    rule: { triggerEvent: "invoice.overdue", conditions: { all: [{ field: "invoice.balanceDue", op: "gt", value: 0 }] }, actions: [{ type: "notify", to: "permission", permission: "finance.collections.manage", priority: "HIGH", message: "Invoice overdue" }] }
  },
  {
    key: "project_at_risk_pm",
    name: { en: "Project at risk → notify PM", ar: "مشروع في خطر ← إشعار مدير المشروع" },
    description: { en: "Urgent attention item for the project manager.", ar: "عنصر انتباه عاجل لمدير المشروع." },
    rule: { triggerEvent: "project.at_risk", conditions: { all: [{ field: "project.health", op: "eq", value: "AT_RISK" }] }, actions: [{ type: "notify", to: "owner", priority: "URGENT", message: "Project at risk" }] }
  },
  {
    key: "contract_expiring_followup",
    name: { en: "Contract expiring → renewal follow-up", ar: "عقد ينتهي ← متابعة تجديد" },
    description: { en: "Adds a renewal follow-up to the client's CRM timeline.", ar: "يضيف متابعة تجديد إلى سجل العميل في CRM." },
    rule: { triggerEvent: "contract.expiring", conditions: { all: [{ field: "contract.daysUntilExpiry", op: "lte", value: 30 }] }, actions: [{ type: "follow_up", inDays: 0, title: "Renewal follow-up" }] }
  },
  {
    key: "terminated_with_assets_ops",
    name: { en: "Employee terminated with assets → notify operations", ar: "إنهاء خدمة موظف لديه أصول ← إشعار العمليات" },
    description: { en: "Only when the employee still holds assets.", ar: "فقط إذا كان الموظف ما زال يحمل أصولًا." },
    rule: { triggerEvent: "employee.terminated", conditions: { all: [{ field: "employee.activeAssets", op: "gt", value: 0 }] }, actions: [{ type: "notify", to: "permission", permission: "assets.assign", priority: "HIGH", message: "Terminated employee still holds assets" }] }
  },
  {
    key: "ticket_sla_breached_manager",
    name: { en: "Ticket SLA breached → notify support manager", ar: "تجاوز SLA للتذكرة ← إشعار مدير الدعم" },
    description: { en: "Escalates every breach to support managers.", ar: "يصعّد كل تجاوز لمديري الدعم." },
    rule: { triggerEvent: "ticket.sla_breached", conditions: { all: [] }, actions: [{ type: "notify", to: "permission", permission: "support.tickets.manage", priority: "URGENT", message: "SLA breached" }] }
  }
];

export async function createFromTemplate(ctx: Ctx, key: string, locale: "ar" | "en" = "en") {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw invalid("UNKNOWN_TEMPLATE");
  return createRule(ctx, { name: t.name[locale], description: t.description[locale], ...t.rule }, key);
}

// --- reads ------------------------------------------------------------------------------------------------

const VIEW_EXEC = (ctx: Ctx) => {
  if (!can(ctx, "automation.executions.view") && !can(ctx, "automation.view")) throw forbidden("automation.executions.view");
};

export async function listRules(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "automation.view");
  const { view } = z.object({ view: z.enum(["all", "enabled", "disabled"]).default("all") }).parse(raw ?? {});
  const rows = await prisma.automationRule.findMany({
    where: { organizationId: ctx.organizationId, ...(view === "enabled" ? { enabled: true } : view === "disabled" ? { enabled: false } : {}) },
    orderBy: [{ triggerEvent: "asc" }, { priority: "asc" }, { createdAt: "asc" }]
  });
  const stats = await prisma.automationExecution.groupBy({ by: ["ruleId", "status"], where: { organizationId: ctx.organizationId, ruleId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  return rows.map((r) => ({ ...r, stats: Object.fromEntries(stats.filter((s) => s.ruleId === r.id).map((s) => [s.status, s._count._all])) as Record<string, number> }));
}

export async function getRule(ctx: Ctx, id: string) {
  requirePermission(ctx, "automation.view");
  const r = await prisma.automationRule.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!r) throw notFound("AutomationRule");
  const [executions, runAs] = await Promise.all([
    can(ctx, "automation.executions.view") ? prisma.automationExecution.findMany({ where: { ruleId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { ruleVersion: { select: { version: true } } } }) : [],
    prisma.user.findUnique({ where: { id: r.runAsUserId }, select: { id: true, name: true, nameAr: true, status: true } })
  ]);
  return { rule: r, executions, runAs, fields: FIELDS[TRIGGERS[r.triggerEvent] ?? "lead"] };
}

export async function listExecutions(ctx: Ctx, raw: unknown) {
  VIEW_EXEC(ctx);
  const { view } = z.object({ view: z.enum(["all", "failed", "skipped", "succeeded"]).default("all") }).parse(raw ?? {});
  const status = view === "failed" ? { in: ["FAILED", "DEAD_LETTER"] as const } : view === "skipped" ? { equals: "SKIPPED" as const } : view === "succeeded" ? { equals: "SUCCEEDED" as const } : undefined;
  return prisma.automationExecution.findMany({ where: { organizationId: ctx.organizationId, ...(status ? { status: status as never } : {}) }, orderBy: { createdAt: "desc" }, take: 100, include: { rule: { select: { name: true } }, ruleVersion: { select: { version: true } } } });
}

// --- execution ----------------------------------------------------------------------------------------------

export function registerAutomationSubscriber() {
  subscribe("*", onEvent, "automation");
}

/** Domain-event handler: create one execution per matching enabled rule (idempotent), then run it. */
export async function onEvent(e: StoredEvent) {
  if (!TRIGGERS[e.type]) return;
  const rules = await prisma.automationRule.findMany({ where: { organizationId: e.organizationId, triggerEvent: e.type, enabled: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  for (const r of rules) {
    const ver = await prisma.automationRuleVersion.findUniqueOrThrow({ where: { ruleId_version: { ruleId: r.id, version: r.version } } });
    let skip: string | null = null;
    if (e.depth >= MAX_DEPTH) skip = "RECURSION_DEPTH";
    else if (e.correlationId && (await prisma.automationExecution.findFirst({ where: { ruleId: r.id, correlationId: e.correlationId, domainEventId: { not: e.id } }, select: { id: true } }))) skip = "RECURSION_CYCLE";
    const created = await prisma.automationExecution.createMany({
      data: [{ organizationId: e.organizationId, ruleId: r.id, ruleVersionId: ver.id, domainEventId: e.id, eventType: e.type, entityType: e.entityType ?? null, entityId: e.entityId ?? null, correlationId: e.correlationId, depth: e.depth, ...(skip ? { status: "SKIPPED" as const, skipReason: skip, completedAt: new Date() } : {}) }],
      skipDuplicates: true
    });
    if (!created.count) continue; // already executed for this event (redelivery) — never twice
    if (skip) {
      log.warn("automation_skipped", { rule: r.id, event: e.id, reason: skip, depth: e.depth });
      continue;
    }
    const x = await prisma.automationExecution.findUniqueOrThrow({ where: { ruleId_domainEventId: { ruleId: r.id, domainEventId: e.id } } });
    await processExecution(x.id);
  }
}

const NON_RETRYABLE = (e: unknown) => isAppError(e) && ["FORBIDDEN", "VALIDATION", "NOT_FOUND", "UNAUTHENTICATED"].includes(e.code);

/** Load a run-as context: the user's CURRENT permissions minus every high-risk permission. */
async function runAsCtx(userId: string, trace: Ctx["trace"]): Promise<Ctx | null> {
  const u = await prisma.user.findFirst({ where: { id: userId, status: "ACTIVE", deletedAt: null }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  if (!u) return null;
  const perms = new Set<Permission>();
  for (const r of u.roles) for (const p of r.role.permissions) if (isPermission(p.permission) && !AUTOMATION_DENIED_PERMISSIONS.includes(p.permission)) perms.add(p.permission);
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: perms, meta: { ip: "automation", userAgent: "automation-engine" }, trace };
}

type ActionResult = { i: number; type: string; status: "done" | "skipped" | "failed"; ref?: string | null; reason?: string; error?: string };

/**
 * Run one execution (claimed with a conditional update — safe with several workers).
 * Completed actions are never repeated on retry; the first failing action stops the run.
 */
export async function processExecution(id: string, now = new Date()): Promise<AutomationExecution["status"] | null> {
  const claim = await prisma.automationExecution.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } }, data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } } });
  if (claim.count !== 1) return null;
  const x = await prisma.automationExecution.findUniqueOrThrow({ where: { id }, include: { ruleVersion: true, rule: { select: { name: true } } } });
  const finish = (data: Prisma.AutomationExecutionUpdateInput) => prisma.automationExecution.update({ where: { id }, data: { completedAt: new Date(), ...data } });
  return runWithObs({ module: "automation", operation: x.eventType, correlationId: x.correlationId ?? undefined, organizationId: x.organizationId }, async () => {
    const kind = x.entityType ? ENTITY_TYPES[x.entityType] : undefined;
    if (!kind || kind !== TRIGGERS[x.eventType] || !x.entityId) {
      await finish({ status: "SKIPPED", skipReason: "ENTITY_MISMATCH" });
      return "SKIPPED" as const;
    }
    const entity = await loadEntity(x.organizationId, kind, x.entityId);
    if (!entity) {
      await finish({ status: "SKIPPED", skipReason: "ENTITY_NOT_FOUND" });
      return "SKIPPED" as const;
    }
    const matched = evaluate(x.ruleVersion.conditions as Group, entity.values);
    if (!matched) {
      await finish({ status: "SKIPPED", skipReason: "CONDITIONS_NOT_MET", conditionResult: false, input: entity.values as Prisma.InputJsonValue });
      metrics.count(METRIC.automationRun, { result: "skipped" });
      return "SKIPPED" as const;
    }
    const event = await prisma.domainEvent.findUnique({ where: { id: x.domainEventId }, select: { id: true, correlationId: true, depth: true } });
    const trace = { correlationId: event?.correlationId ?? x.correlationId ?? x.domainEventId, causationId: x.domainEventId, depth: (event?.depth ?? x.depth) + 1 };
    const runAs = await runAsCtx(x.ruleVersion.runAsUserId, trace);
    const results: ActionResult[] = Array.isArray(x.actionResults) ? (x.actionResults as ActionResult[]) : [];
    const done = new Set(results.filter((r) => r.status !== "failed").map((r) => r.i));
    const next: ActionResult[] = results.filter((r) => r.status !== "failed");
    let failure: unknown = null;
    let failedType = "";
    if (!runAs) failure = conflict("RUN_AS_USER_INACTIVE");
    else {
      const actions = x.ruleVersion.actions as Action[];
      for (const [i, a] of actions.entries()) {
        if (done.has(i)) continue;
        try {
          const out = await runAction(a, { executionId: id, ruleName: x.rule.name, eventType: x.eventType, entityType: x.entityType, entityId: x.entityId, kind, entity, runAs }, i);
          next.push({ i, type: a.type, status: out.skipped ? "skipped" : "done", ref: out.ref ?? null, reason: out.skipped });
        } catch (e) {
          failure = e;
          failedType = a.type;
          next.push({ i, type: a.type, status: "failed", error: redactString(String((e as Error)?.message ?? e)).slice(0, 500) });
          break;
        }
      }
    }
    const input = entity.values as Prisma.InputJsonValue;
    if (!failure) {
      await finish({ status: "SUCCEEDED", conditionResult: true, input, actionResults: next as Prisma.InputJsonValue, error: null });
      metrics.count(METRIC.automationRun, { result: "ok" });
      return "SUCCEEDED" as const;
    }
    const message = redactString(String((failure as Error)?.message ?? failure)).slice(0, 1000);
    const dead = NON_RETRYABLE(failure) || x.attempts >= x.maxAttempts || message.startsWith("RUN_AS_USER_INACTIVE");
    await finish({ status: dead ? "DEAD_LETTER" : "FAILED", conditionResult: true, input, actionResults: next as Prisma.InputJsonValue, error: `${failedType ? `${failedType}: ` : ""}${message}`, nextAttemptAt: new Date(Date.now() + RETRY_BASE_MS * 2 ** Math.max(0, x.attempts - 1)) });
    metrics.count(METRIC.automationFailure, { dead: String(dead) });
    log.warn("automation_failed", { execution: id, rule: x.ruleId, dead, error: message });
    if (dead) {
      await unitOfWork(systemCtx(x.organizationId, { ip: "system", userAgent: "automation-engine" }), async (_tx, uow) => {
        uow.emit({ type: "automation.execution_failed", entityType: "AutomationExecution", entityId: id, payload: { executionId: id, ruleId: x.ruleId, rule: x.rule.name, code: message.slice(0, 80) } });
      });
    }
    return dead ? ("DEAD_LETTER" as const) : ("FAILED" as const);
  });
}

/** Worker: retry due executions and recover runs stuck in RUNNING (crashed worker). */
export async function automationTick(now = new Date()) {
  const stuck = await prisma.automationExecution.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "FAILED", error: "RECOVERED_FROM_STUCK_RUN", nextAttemptAt: now } });
  const due = await prisma.automationExecution.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: 50, select: { id: true } });
  const out = { recovered: stuck.count, processed: 0, succeeded: 0, failed: 0 };
  for (const { id } of due) {
    const s = await processExecution(id, now);
    if (!s) continue;
    out.processed++;
    if (s === "SUCCEEDED") out.succeeded++;
    if (s === "FAILED" || s === "DEAD_LETTER") out.failed++;
  }
  return out;
}

// --- operator recovery --------------------------------------------------------------------------------------

export async function retryExecution(ctx: Ctx, id: string) {
  requirePermission(ctx, "automation.executions.retry");
  await unitOfWork(ctx, async (tx, uow) => {
    const x = await tx.automationExecution.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!x) throw notFound("AutomationExecution");
    // one more attempt; actions already completed stay completed (no duplicate effects)
    const r = await tx.automationExecution.updateMany({ where: { id, status: { in: ["FAILED", "DEAD_LETTER"] } }, data: { status: "PENDING", nextAttemptAt: new Date(), maxAttempts: Math.min(20, x.attempts + 1) } });
    if (r.count !== 1) throw conflict("EXECUTION_NOT_RETRYABLE");
    await uow.audit({ action: "automation.execution_retried", entityType: "AutomationExecution", entityId: id, before: { status: x.status, attempts: x.attempts } });
  });
  return { status: await processExecution(id) };
}

export async function dismissExecution(ctx: Ctx, id: string, raw: unknown) {
  requirePermission(ctx, "automation.executions.retry");
  const { reason } = z.object({ reason: reqText(3, 500) }).parse(raw ?? {});
  return unitOfWork(ctx, async (tx, uow) => {
    const r = await tx.automationExecution.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["FAILED", "DEAD_LETTER"] } }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissedById: ctx.userId, dismissReason: reason } });
    if (r.count !== 1) throw conflict("EXECUTION_NOT_DISMISSIBLE");
    await uow.audit({ action: "automation.execution_dismissed", entityType: "AutomationExecution", entityId: id, after: { reason } });
  });
}
