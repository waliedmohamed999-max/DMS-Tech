import { prisma } from "../db";
import { can, type Ctx } from "../context";
import type { Permission } from "../rbac/permissions";
import { countPendingForMe } from "../approvals/service";
import { crmAttention, crmKpis } from "../crm/insights";
import { crmSearch } from "../crm/search";
import { commercialAttention, commercialKpis } from "../commercial/insights";
import { commercialSearch } from "../commercial/search";
import { sweepIfDue } from "../commercial/sweep";
import { projectAttention, projectKpis } from "../projects/insights";
import { projectSearch } from "../projects/search";
import { sweepProjectsIfDue } from "../projects/sweep";
import { financeAttention, financeKpis } from "../finance/insights";
import { financeSearch } from "../finance/search";
import { sweepFinanceIfDue } from "../finance/sweep";
import { hrAttention, hrDashboard } from "../hr/insights";
import { hrSearch } from "../hr/search";
import { sweepHrIfDue } from "../hr/sweep";
import { opsAttention, opsDashboard } from "../ops/insights";
import { opsSearch } from "../ops/search";
import { integrationsAttention, integrationsSearch } from "../integrations/insights";
import { sweepOpsIfDue } from "../ops/sweep";
import { subscriptionMetrics } from "../subscriptions/subscriptions";
import { orgMonthOf, type OrgMonth } from "../kpi/period";

/**
 * Command Center data. KPIs are provider functions: a provider either returns real
 * numbers (with a comparison period) or declares `planned` with the phase that
 * delivers it. Nothing is hard-coded.
 */

export type Kpi =
  | { key: string; state: "live"; value: number; format: "number" | "currency"; previous?: number | null; href?: string; hint?: string }
  | { key: string; state: "planned"; phase: number; module: string }
  | { key: string; state: "forbidden" };

type Provider = { key: string; permission?: Permission; run(ctx: Ctx, range: Range): Promise<Kpi> };
/** The org-timezone month (see kpi/period.ts): `from`/`to` are instants, `dateFrom`/`dateTo` business dates. */
type Range = OrgMonth;

/** "This month" for the Command Center — one definition, in the organization's timezone. */
export const orgMonthRange = (ctx: Ctx, now = new Date()): Promise<Range> => orgMonthOf(ctx.organizationId, now);

// finance figures are shared by several cards: one computation per range (current / comparison)
type FinKpis = Awaited<ReturnType<typeof financeKpis>>;
const finMemo = new WeakMap<Range, { cur?: Promise<FinKpis>; prev?: Promise<FinKpis> }>();
function fin(ctx: Ctx, r: Range, which: "cur" | "prev"): Promise<FinKpis> {
  let m = finMemo.get(r);
  if (!m) finMemo.set(r, (m = {}));
  // DATE columns → org-local business dates; "today" (overdue) follows the same clock
  return (m[which] ??= which === "cur" ? financeKpis(ctx, { from: r.dateFrom, to: r.dateTo }, r.to) : financeKpis(ctx, { from: r.prevDateFrom, to: r.prevDateTo }, r.to));
}
const FORBIDDEN = (key: string): Kpi => ({ key, state: "forbidden" });

const PROVIDERS: Provider[] = [
  // Phase 5 — billed / collected / outstanding / spent (company currency; never labelled revenue).
  // financeKpis applies the finance module's own checks: invoice record scope, and payments /
  // expenses only with their view permission + finance.records.all (null → the card is withheld).
  ...(["invoiced", "collected", "receivables", "expenses"] as const).map(
    (key): Provider => ({
      key,
      permission: "dashboard.finance_kpis",
      async run(ctx, r) {
        const [cur, prev] = await Promise.all([fin(ctx, r, "cur"), key === "receivables" ? Promise.resolve(null) : fin(ctx, r, "prev")]);
        const raw = (k: FinKpis) => (key === "invoiced" ? k.invoiced : key === "collected" ? k.collected : key === "receivables" ? k.outstanding : k.expenses);
        const value = raw(cur);
        if (value === null) return FORBIDDEN(key); // not "0": the viewer may not see payments / expenses
        const before = prev ? raw(prev) : null;
        const href = key === "receivables" ? "/app/finance/receivables" : key === "expenses" ? "/app/finance/expenses" : key === "collected" ? "/app/finance/payments" : "/app/finance/invoices";
        return { key, state: "live", value: Number(value), previous: before === null ? null : Number(before), format: "currency", href, hint: key === "receivables" && cur.overdueCount ? `${cur.overdue}` : undefined };
      }
    })
  ),
  {
    // open invoices past their due date (org-local today) with a balance — count; the amount is its own card
    key: "overdueInvoices",
    permission: "dashboard.finance_kpis",
    async run(ctx, r) {
      const k = await fin(ctx, r, "cur");
      return { key: "overdueInvoices", state: "live", value: k.overdueCount, format: "number", href: "/app/finance/receivables", hint: k.overdue };
    }
  },
  {
    key: "overdueAmount",
    permission: "dashboard.finance_kpis",
    async run(ctx, r) {
      const k = await fin(ctx, r, "cur");
      return { key: "overdueAmount", state: "live", value: Number(k.overdue), format: "currency", href: "/app/finance/receivables", hint: String(k.overdueCount) };
    }
  },
  {
    // MRR in the organization's currency only (other currencies are listed on /app/subscriptions, never added in)
    key: "mrr",
    permission: "dashboard.finance_kpis",
    async run(ctx) {
      if (!can(ctx, "subscriptions.view")) return FORBIDDEN("mrr");
      const k = await subscriptionMetrics(ctx);
      return { key: "mrr", state: "live", value: Number(k.mrr), format: "currency", href: "/app/subscriptions", hint: k.otherCurrencies.length ? k.otherCurrencies.map((c) => `${c.mrr} ${c.currency}`).join(" + ") : undefined };
    }
  },
  {
    key: "activeLeads",
    permission: "crm.leads.view",
    async run(ctx, r) {
      const k = await crmKpis(ctx, r.to);
      return { key: "activeLeads", state: "live", value: k.activeLeads ?? 0, format: "number", href: "/app/crm/leads?status=active" };
    }
  },
  {
    key: "openOpps",
    permission: "crm.opportunities.view",
    async run(ctx, r) {
      const k = await crmKpis(ctx, r.to);
      return { key: "openOpps", state: "live", value: k.openOpps ?? 0, format: "number", href: "/app/crm/opportunities?status=OPEN" };
    }
  },
  {
    key: "pipeline",
    permission: "crm.opportunities.view",
    async run(ctx, r) {
      const k = await crmKpis(ctx, r.to);
      return { key: "pipeline", state: "live", value: Number(k.pipelineValue ?? 0), format: "currency", href: "/app/crm/pipeline" };
    }
  },
  {
    key: "wonThisMonth",
    permission: "crm.opportunities.view",
    async run(ctx, r) {
      const k = await crmKpis(ctx, r.to);
      return { key: "wonThisMonth", state: "live", value: Number(k.wonThisMonth ?? 0), previous: Number(k.wonPrevPeriod ?? 0), format: "currency", href: "/app/crm/opportunities?status=WON" };
    }
  },
  {
    key: "overdueFollowUps",
    permission: "crm.leads.view",
    async run(ctx, r) {
      const k = await crmKpis(ctx, r.to);
      return { key: "overdueFollowUps", state: "live", value: k.overdueFollowUps ?? 0, format: "number", href: "/app/crm/follow-ups" };
    }
  },
  {
    key: "activeClients",
    permission: "crm.clients.view",
    async run(ctx) {
      const { clientWhere } = await import("../crm/scope");
      const value = await prisma.client.count({ where: { organizationId: ctx.organizationId, deletedAt: null, status: "ACTIVE", ...(await clientWhere(ctx)) } });
      return { key: "activeClients", state: "live", value, format: "number", href: "/app/crm/clients?status=ACTIVE" };
    }
  },
  {
    key: "quotesAwaiting",
    permission: "sales.quotations.view",
    async run(ctx) {
      const k = await commercialKpis(ctx);
      return { key: "quotesAwaiting", state: "live", value: k.awaiting ?? 0, format: "number", href: "/app/sales/quotations?status=awaiting", hint: k.awaitingValue ?? undefined };
    }
  },
  {
    key: "quotesNeedContract",
    permission: "sales.quotations.view",
    async run(ctx) {
      const k = await commercialKpis(ctx);
      return { key: "quotesNeedContract", state: "live", value: k.acceptedNoContract ?? 0, format: "number", href: "/app/sales/quotations?status=ACCEPTED" };
    }
  },
  {
    key: "activeProjects",
    permission: "projects.view",
    async run(ctx) {
      const k = await projectKpis(ctx);
      return { key: "activeProjects", state: "live", value: k.active, format: "number", href: "/app/projects?status=open" };
    }
  },
  {
    key: "projectsAtRisk",
    permission: "projects.view",
    async run(ctx) {
      const k = await projectKpis(ctx);
      return { key: "projectsAtRisk", state: "live", value: k.atRisk, format: "number", href: "/app/projects?view=at_risk" };
    }
  },
  {
    key: "myUrgentTasks",
    permission: "projects.tasks.view",
    async run(ctx) {
      const k = await projectKpis(ctx);
      return { key: "myUrgentTasks", state: "live", value: k.myUrgent, format: "number", href: "/app/my-work" };
    }
  },
  {
    key: "pendingApprovals",
    permission: "approvals.view",
    async run(ctx) {
      return { key: "pendingApprovals", state: "live", value: await countPendingForMe(ctx), format: "number", href: "/app/approvals" };
    }
  },
  {
    key: "activeEmployees",
    permission: "hr.dashboard.view",
    async run(ctx) {
      const d = await hrDashboard(ctx);
      return { key: "activeEmployees", state: "live", value: d.active, format: "number", href: "/app/hr/employees", hint: d.onLeave ? String(d.onLeave) : undefined };
    }
  },
  {
    key: "openTickets",
    permission: "support.tickets.view",
    async run(ctx) {
      const d = await opsDashboard(ctx);
      return { key: "openTickets", state: "live", value: d.openTickets ?? 0, format: "number", href: "/app/support?view=open", hint: d.slaBreaches ? String(d.slaBreaches) : undefined };
    }
  },
  {
    key: "pendingProcurement",
    permission: "operations.dashboard.view",
    async run(ctx) {
      const d = await opsDashboard(ctx);
      return { key: "pendingProcurement", state: "live", value: (d.pendingRequests ?? 0) + (d.posAwaiting ?? 0), format: "number", href: "/app/operations" };
    }
  },
  {
    key: "team",
    permission: "admin.users.view",
    async run(ctx, r) {
      const [value, previous] = await Promise.all([
        prisma.user.count({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null } }),
        prisma.user.count({ where: { organizationId: ctx.organizationId, deletedAt: null, createdAt: { lt: r.from } } })
      ]);
      return { key: "team", state: "live", value, previous, format: "number", href: "/app/admin/users" };
    }
  },
  {
    key: "auditEvents",
    permission: "admin.audit.view",
    async run(ctx, r) {
      const [value, previous] = await Promise.all([
        prisma.auditLog.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: r.from, lte: r.to } } }),
        prisma.auditLog.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: r.prevFrom, lte: r.prevTo } } })
      ]);
      return { key: "auditEvents", state: "live", value, previous, format: "number", href: "/app/admin/audit" };
    }
  },
  {
    key: "failedEvents",
    permission: "admin.audit.view",
    async run(ctx) {
      const value = await prisma.domainEvent.count({ where: { organizationId: ctx.organizationId, status: "FAILED" } });
      return { key: "failedEvents", state: "live", value, format: "number", href: "/app/admin/audit?action=system" };
    }
  }
];

/** Live KPIs the viewer may see. Cards a finer finance / subscription check withholds are left out, not zeroed. */
export async function getKpis(ctx: Ctx, now = new Date()): Promise<Kpi[]> {
  const range = await orgMonthRange(ctx, now);
  const all = await Promise.all(PROVIDERS.filter((p) => !p.permission || can(ctx, p.permission)).map((p) => p.run(ctx, range)));
  return all.filter((k) => k.state !== "forbidden");
}

export type AttentionItem = {
  id: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  category: string;
  title: string;
  owner?: string | null;
  dueAt?: Date | null;
  entity: { type: string; id: string };
  href: string;
  actions: ("approve" | "reject" | "open")[];
};

const RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

/** "Needs your attention": pending approvals you can decide, failed automations, locked accounts, urgent unread notifications. */
export async function getAttention(ctx: Ctx): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  if (can(ctx, "approvals.decide")) {
    const approvals = await prisma.approval.findMany({
      where: { organizationId: ctx.organizationId, status: "PENDING", requiredPermission: { in: [...ctx.permissions] }, requestedById: { not: ctx.userId }, OR: [{ assigneeId: null }, { assigneeId: ctx.userId }] },
      orderBy: { createdAt: "asc" },
      take: 10,
      include: { requestedBy: { select: { name: true } } }
    });
    for (const a of approvals)
      items.push({ id: `apv-${a.id}`, priority: a.priority, category: "approval", title: a.title, owner: a.requestedBy.name, dueAt: a.dueAt, entity: { type: "Approval", id: a.id }, href: `/app/approvals?focus=${a.id}`, actions: ["approve", "reject", "open"] });
  }

  if (can(ctx, "admin.audit.view")) {
    const failed = await prisma.domainEvent.findMany({ where: { organizationId: ctx.organizationId, status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 5 });
    for (const e of failed)
      items.push({ id: `evt-${e.id}`, priority: "HIGH", category: "system", title: e.type, owner: null, dueAt: null, entity: { type: "DomainEvent", id: e.id }, href: `/app/admin/audit`, actions: ["open"] });
  }

  if (can(ctx, "admin.users.manage")) {
    const locked = await prisma.user.findMany({ where: { organizationId: ctx.organizationId, lockedUntil: { gt: new Date() }, deletedAt: null }, take: 5, select: { id: true, name: true, lockedUntil: true } });
    for (const u of locked)
      items.push({ id: `lock-${u.id}`, priority: "MEDIUM", category: "security", title: u.name, owner: null, dueAt: u.lockedUntil, entity: { type: "User", id: u.id }, href: `/app/admin/users/${u.id}`, actions: ["open"] });
  }

  if (can(ctx, "sales.quotations.view") || can(ctx, "sales.contracts.view")) {
    await sweepIfDue(ctx.organizationId); // server-side expiry evaluation (throttled)
    for (const c of await commercialAttention(ctx))
      items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: c.owner ?? null, dueAt: c.dueAt ?? null, entity: { type: "Commercial", id: c.id }, href: c.href, actions: ["open"] });
  }

  if (can(ctx, "projects.view")) {
    await sweepProjectsIfDue(ctx.organizationId); // date-based delivery signals (throttled, leased)
    for (const c of await projectAttention(ctx))
      items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: c.owner ?? null, dueAt: c.dueAt ?? null, entity: { type: "Project", id: c.id }, href: c.href, actions: ["open"] });
  }

  if (can(ctx, "finance.invoices.view") || can(ctx, "finance.expenses.pay")) {
    await sweepFinanceIfDue(ctx.organizationId); // overdue / due-soon / billing readiness (throttled, leased)
    for (const c of await financeAttention(ctx))
      items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: c.owner ?? null, dueAt: c.dueAt ?? null, entity: { type: "Finance", id: c.id }, href: c.href, actions: ["open"] });
  }

  {
    await sweepHrIfDue(ctx.organizationId); // missing attendance, leave starting, reviews due, offers expiring (throttled, leased)
    for (const c of await hrAttention(ctx))
      items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: null, dueAt: c.dueAt ?? null, entity: { type: "HR", id: c.id }, href: c.href, actions: ["open"] });
  }

  {
    await sweepOpsIfDue(ctx.organizationId); // PO overdue, warranty, maintenance due, SLA warning / breach, KB reminders (throttled, leased)
    for (const c of await opsAttention(ctx))
      items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: null, dueAt: c.dueAt ?? null, entity: { type: "Operations", id: c.id }, href: c.href, actions: ["open"] });
  }

  for (const c of await integrationsAttention(ctx))
    items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: null, dueAt: c.dueAt ?? null, entity: { type: "Integrations", id: c.id }, href: c.href, actions: ["open"] });

  for (const c of await crmAttention(ctx))
    items.push({ id: c.id, priority: c.priority, category: c.category, title: c.title, owner: c.owner ?? null, dueAt: c.dueAt ?? null, entity: { type: "CRM", id: c.id }, href: c.href, actions: ["open"] });

  const urgent = await prisma.notification.findMany({ where: { userId: ctx.userId, readAt: null, priority: { in: ["URGENT", "HIGH"] }, category: { not: "APPROVAL" } }, take: 5, orderBy: { createdAt: "desc" } });
  for (const n of urgent)
    items.push({ id: `ntf-${n.id}`, priority: n.priority, category: n.category.toLowerCase(), title: n.title, owner: null, dueAt: null, entity: { type: n.entityType ?? "Notification", id: n.entityId ?? n.id }, href: n.href ?? "/app/notifications", actions: ["open"] });

  return items.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
}

/** Global search across entities that exist today; each group is permission-gated. */
export async function globalSearch(ctx: Ctx, q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const results: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
  if (can(ctx, "admin.users.view")) {
    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term } }, { email: { contains: term, mode: "insensitive" } }] },
      take: 6,
      select: { id: true, name: true, email: true }
    });
    results.push(...users.map((u) => ({ type: "user", id: u.id, title: u.name, subtitle: u.email, href: `/app/admin/users/${u.id}` })));
  }
  if (can(ctx, "approvals.view")) {
    const approvals = await prisma.approval.findMany({
      where: { organizationId: ctx.organizationId, title: { contains: term, mode: "insensitive" }, OR: [{ requestedById: ctx.userId }, { requiredPermission: { in: [...ctx.permissions] } }] },
      take: 5,
      select: { id: true, title: true, status: true }
    });
    results.push(...approvals.map((a) => ({ type: "approval", id: a.id, title: a.title, subtitle: a.status, href: `/app/approvals?focus=${a.id}` })));
  }
  const depts = await prisma.department.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term } }, { code: { contains: term, mode: "insensitive" } }] },
    take: 4,
    select: { id: true, name: true, code: true }
  });
  results.push(...depts.map((d) => ({ type: "department", id: d.id, title: d.name, subtitle: d.code, href: "/app/admin/departments" })));
  results.unshift(...(await crmSearch(ctx, term)), ...(await commercialSearch(ctx, term)), ...(await projectSearch(ctx, term)), ...(await financeSearch(ctx, term)), ...(await hrSearch(ctx, term)), ...(await opsSearch(ctx, term)), ...(await integrationsSearch(ctx, term)));
  return results;
}
