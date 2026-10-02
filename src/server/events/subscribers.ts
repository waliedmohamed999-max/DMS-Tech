import { prisma } from "../db";
import { subscribe } from "./bus";
import type { Permission } from "../rbac/permissions";
import { registerIntegrationSubscribers } from "../integrations/subscribers";
import { registerAutomationSubscriber } from "../automation/engine";
import { registerSystemSubscribers } from "../system/alerts";

/**
 * Built-in subscribers. Imported once by src/server/index.ts so they are registered
 * wherever services run (server actions, route handlers, tests).
 */

let registered = false;

export function registerSubscribers() {
  if (registered) return;
  registered = true;

  // Activity feed: any event that carries an `activity` descriptor
  subscribe("*", async (e) => {
    if (!e.activity) return;
    await prisma.activity.create({
      data: {
        organizationId: e.organizationId,
        actorId: e.actorId,
        verb: e.type,
        entityType: e.entityType ?? "System",
        entityId: e.entityId,
        entityLabel: e.activity.entityLabel,
        href: e.activity.href,
        visibility: e.activity.visibility ?? null,
        meta: (e.payload ?? {}) as object
      }
    });
  }, "activity-feed");

  // Approval requested → notify every eligible approver (except the requester)
  subscribe("approval.requested", async (e) => {
    const p = e.payload as { approvalId: string; title: string; requiredPermission: Permission; priority?: string; assigneeId?: string | null };
    const approvers = await usersWithAll(e.organizationId, ["approvals.decide", p.requiredPermission]);
    // routed requests (e.g. a timesheet to its project manager) notify the assignee only
    const targets = approvers.filter((id) => id !== e.actorId && (!p.assigneeId || id === p.assigneeId));
    if (!targets.length) return;
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        organizationId: e.organizationId,
        userId,
        category: "APPROVAL" as const,
        priority: (p.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM",
        title: p.title,
        href: `/app/approvals?focus=${p.approvalId}`,
        entityType: "Approval",
        entityId: p.approvalId
      }))
    });
  });

  // Approval decided → notify the requester
  subscribe("approval.decided", async (e) => {
    const p = e.payload as { approvalId: string; title: string; status: string; requestedById: string };
    if (p.requestedById === e.actorId) return;
    await prisma.notification.create({
      data: {
        organizationId: e.organizationId,
        userId: p.requestedById,
        category: "APPROVAL",
        priority: "MEDIUM",
        title: p.title,
        body: p.status,
        href: `/app/approvals?focus=${p.approvalId}`,
        entityType: "Approval",
        entityId: p.approvalId
      }
    });
  });

  // New website lead → owner if assigned, otherwise everyone who sees all CRM leads (sales managers)
  subscribe("website.lead_received", async (e) => {
    const p = e.payload as { leadId: string; number: string; name: string; ownerId: string | null; duplicate: boolean };
    const targets = p.ownerId ? [p.ownerId] : await usersWithAll(e.organizationId, ["crm.leads.view", "crm.records.all"]);
    if (!targets.length) return;
    const users = await prisma.user.findMany({ where: { id: { in: targets } }, select: { id: true, locale: true } });
    await prisma.notification.createMany({
      data: users.map((u) => ({
        organizationId: e.organizationId,
        userId: u.id,
        category: "SALES" as const,
        priority: "HIGH" as const,
        title: p.duplicate
          ? u.locale === "en" ? `Website resubmission: ${p.name}` : `طلب متكرر من الموقع: ${p.name}`
          : u.locale === "en" ? `New website lead: ${p.name}` : `عميل محتمل جديد من الموقع: ${p.name}`,
        body: p.number,
        href: `/app/crm/leads/${p.leadId}`,
        entityType: "Lead",
        entityId: p.leadId
      }))
    });
  });

  // Lead / opportunity assigned to someone else → notify the new owner
  for (const type of ["lead.assigned", "opportunity.assigned"] as const) {
    subscribe(type, async (e) => {
      const p = e.payload as { ownerId: string | null; number: string; name?: string; title?: string };
      if (!p.ownerId || p.ownerId === e.actorId) return;
      const u = await prisma.user.findUnique({ where: { id: p.ownerId }, select: { locale: true } });
      const label = p.name ?? p.title ?? "";
      const isLead = type === "lead.assigned";
      await prisma.notification.create({
        data: {
          organizationId: e.organizationId,
          userId: p.ownerId,
          category: "SALES",
          title: u?.locale === "en" ? `${isLead ? "Lead" : "Opportunity"} assigned to you: ${label}` : `${isLead ? "تم إسناد عميل محتمل إليك" : "تم إسناد فرصة إليك"}: ${label}`,
          body: p.number,
          href: isLead ? `/app/crm/leads/${e.entityId}` : `/app/crm/opportunities/${e.entityId}`,
          entityType: isLead ? "Lead" : "Opportunity",
          entityId: e.entityId
        }
      });
    });
  }

  // Commercial (Phase 3): tell the record owner; never notify the person who did it
  const COMMERCIAL: Record<string, { ar: (p: Record<string, string>) => string; en: (p: Record<string, string>) => string; priority: "MEDIUM" | "HIGH"; contract?: boolean }> = {
    "quotation.approved": { ar: (p) => `تم اعتماد عرض السعر ${p.number} V${p.version}`, en: (p) => `Quotation ${p.number} V${p.version} approved`, priority: "MEDIUM" },
    "quotation.rejected": { ar: (p) => `رُفض اعتماد عرض السعر ${p.number} V${p.version}`, en: (p) => `Approval rejected for ${p.number} V${p.version}`, priority: "HIGH" },
    "quotation.expiring": { ar: (p) => `عرض السعر ${p.number} ينتهي في ${p.validUntil}`, en: (p) => `Quotation ${p.number} expires on ${p.validUntil}`, priority: "HIGH" },
    "quotation.expired": { ar: (p) => `انتهت صلاحية عرض السعر ${p.number} V${p.version}`, en: (p) => `Quotation ${p.number} V${p.version} expired`, priority: "MEDIUM" },
    "quotation.accepted": { ar: (p) => `قبل العميل ${p.number} V${p.version} — أنشئ العقد`, en: (p) => `${p.number} V${p.version} accepted — create the contract`, priority: "HIGH" },
    "contract.expiring": { ar: (p) => `العقد ${p.number} ينتهي في ${p.endDate}`, en: (p) => `Contract ${p.number} ends on ${p.endDate}`, priority: "HIGH", contract: true },
    "contract.expired": { ar: (p) => `انتهى العقد ${p.number}`, en: (p) => `Contract ${p.number} expired`, priority: "MEDIUM", contract: true }
  };
  for (const [type, cfg] of Object.entries(COMMERCIAL)) {
    subscribe(type, async (e) => {
      const p = (e.payload ?? {}) as Record<string, string>;
      if (!p.ownerId || p.ownerId === e.actorId) return;
      // the approval engine already notifies the requester (approval.decided) — no duplicate
      if ((type === "quotation.approved" || type === "quotation.rejected") && p.requesterId === p.ownerId) return;
      const u = await prisma.user.findUnique({ where: { id: p.ownerId }, select: { locale: true, status: true } });
      if (!u || u.status !== "ACTIVE") return;
      await prisma.notification.create({
        data: {
          organizationId: e.organizationId,
          userId: p.ownerId,
          category: "SALES",
          priority: cfg.priority,
          title: u.locale === "en" ? cfg.en(p) : cfg.ar(p),
          body: p.comment ?? null,
          href: cfg.contract ? `/app/sales/contracts/${e.entityId}` : `/app/sales/quotations/${e.entityId}`,
          entityType: cfg.contract ? "Contract" : "Quotation",
          entityId: e.entityId
        }
      });
    });
  }

  // Delivery (Phase 4). Every notification carries a dedupeKey (unique per user): reminders are
  // keyed by entity (sent once ever), event-driven ones by event id (a retried subscriber cannot duplicate).
  type D = { to: (p: Record<string, string>) => (string | null | undefined)[]; ar: (p: Record<string, string>) => string; en: (p: Record<string, string>) => string; href: (p: Record<string, string>, id: string) => string; category: "TASK" | "PROJECT"; priority: "MEDIUM" | "HIGH"; key?: (p: Record<string, string>, id: string) => string };
  const DELIVERY: Record<string, D> = {
    "project.member_added": { to: (p) => [p.userId], ar: (p) => `أُضفت إلى المشروع ${p.number} · ${p.name}`, en: (p) => `You were added to ${p.number} · ${p.name}`, href: (_p, id) => `/app/projects/${id}`, category: "PROJECT", priority: "MEDIUM" },
    "task.assigned": { to: (p) => [p.assigneeId], ar: (p) => `أُسندت إليك المهمة ${p.number} · ${p.title}`, en: (p) => `Task ${p.number} assigned to you: ${p.title}`, href: (p, id) => `/app/projects/${p.projectId}?tab=tasks&task=${id}`, category: "TASK", priority: "MEDIUM" },
    "task.blocked": { to: (p) => [p.ownerId], ar: (p) => `مهمة متوقفة ${p.number}: ${p.reason ?? ""}`, en: (p) => `Task ${p.number} blocked: ${p.reason ?? ""}`, href: (p, id) => `/app/projects/${p.projectId}?tab=tasks&task=${id}`, category: "TASK", priority: "HIGH" },
    "task.overdue": { to: (p) => [p.assigneeId ?? p.ownerId], ar: (p) => `المهمة ${p.number} متأخرة (${p.dueDate})`, en: (p) => `Task ${p.number} is overdue (${p.dueDate})`, href: (p, id) => `/app/projects/${p.projectId}?tab=tasks&task=${id}`, category: "TASK", priority: "HIGH", key: (p) => `task.overdue:${p.taskId}` },
    "task.due_soon": { to: (p) => [p.assigneeId], ar: (p) => `المهمة ${p.number} مستحقة ${p.dueDate}`, en: (p) => `Task ${p.number} is due ${p.dueDate}`, href: (p, id) => `/app/projects/${p.projectId}?tab=tasks&task=${id}`, category: "TASK", priority: "MEDIUM", key: (p) => `task.due_soon:${p.taskId}` },
    "milestone.overdue": { to: (p) => [p.ownerId], ar: (p) => `مرحلة متأخرة في ${p.number}: ${p.title}`, en: (p) => `Milestone overdue in ${p.number}: ${p.title}`, href: (p) => `/app/projects/${p.projectId}?tab=milestones`, category: "PROJECT", priority: "HIGH", key: (_p, id) => `milestone.overdue:${id}` },
    "dependency.overdue": { to: (p) => [p.ownerId], ar: (p) => `اعتمادية متأخرة في ${p.number}: ${p.title}`, en: (p) => `Dependency overdue in ${p.number}: ${p.title}`, href: (p) => `/app/projects/${p.projectId}?tab=deliverables`, category: "PROJECT", priority: "HIGH", key: (_p, id) => `dependency.overdue:${id}` },
    "deliverable.ready": { to: (p) => [p.ownerId], ar: (p) => `مخرج جاهز للمراجعة: ${p.name}`, en: (p) => `Deliverable ready for review: ${p.name}`, href: (p) => `/app/projects/${p.projectId}?tab=deliverables`, category: "PROJECT", priority: "MEDIUM" },
    "project.at_risk": { to: (p) => [p.ownerId], ar: (p) => `المشروع ${p.number} في خطر`, en: (p) => `Project ${p.number} is at risk`, href: (_p, id) => `/app/projects/${id}`, category: "PROJECT", priority: "HIGH" }
  };
  for (const [type, d] of Object.entries(DELIVERY)) {
    subscribe(type, async (e) => {
      const p = (e.payload ?? {}) as Record<string, string>;
      const ids = [...new Set(d.to(p).filter((x): x is string => Boolean(x) && x !== e.actorId))];
      if (!ids.length) return;
      const users = await prisma.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, locale: true } });
      const id = e.entityId ?? "";
      await prisma.notification.createMany({
        data: users.map((u) => ({
          organizationId: e.organizationId,
          userId: u.id,
          category: d.category,
          priority: d.priority,
          title: u.locale === "en" ? d.en(p) : d.ar(p),
          href: d.href(p, id),
          entityType: e.entityType ?? null,
          entityId: id || null,
          dedupeKey: d.key ? d.key(p, id) : `${type}:${e.id}`
        })),
        skipDuplicates: true
      });
    });
  }

  // Finance (Phase 5). Recipients are resolved per event; reminders are keyed by entity (once ever),
  // event-driven ones by event id. The actor is never notified of their own action.
  type F = { to: (p: Record<string, string>, orgId: string) => Promise<(string | null | undefined)[]>; ar: (p: Record<string, string>) => string; en: (p: Record<string, string>) => string; href: (p: Record<string, string>, id: string) => string; priority: "MEDIUM" | "HIGH"; key?: (p: Record<string, string>, id: string) => string };
  const collectors = (orgId: string) => usersWithAll(orgId, ["finance.records.all", "finance.collections.manage"]);
  const payers = (orgId: string) => usersWithAll(orgId, ["finance.records.all", "finance.expenses.pay"]);
  const billers = (orgId: string) => usersWithAll(orgId, ["finance.records.all", "finance.invoices.create"]);
  const ownerOr = async (p: Record<string, string>, orgId: string, fallback: (o: string) => Promise<string[]>) => (p.ownerId ? [p.ownerId] : fallback(orgId));
  const FINANCE: Record<string, F> = {
    "invoice.overdue": { to: (p, o) => ownerOr(p, o, collectors), ar: (p) => `فاتورة متأخرة ${p.number} — المتبقي ${p.balance} ${p.currency}`, en: (p) => `Invoice ${p.number} is overdue — ${p.balance} ${p.currency} outstanding`, href: (_p, id) => `/app/finance/invoices/${id}`, priority: "HIGH", key: (_p, id) => `invoice.overdue:${id}` },
    "invoice.due_soon": { to: (p, o) => ownerOr(p, o, collectors), ar: (p) => `الفاتورة ${p.number} تستحق ${p.dueDate}`, en: (p) => `Invoice ${p.number} is due ${p.dueDate}`, href: (_p, id) => `/app/finance/invoices/${id}`, priority: "MEDIUM", key: (_p, id) => `invoice.due_soon:${id}` },
    "invoice.paid": { to: async (p) => [p.ownerId], ar: (p) => `تم سداد الفاتورة ${p.number} بالكامل`, en: (p) => `Invoice ${p.number} fully paid`, href: (_p, id) => `/app/finance/invoices/${id}`, priority: "MEDIUM" },
    "payment.recorded": { to: async (p) => (p.owners ? p.owners.split(",") : []), ar: (p) => `تم تسجيل دفعة ${p.number} من ${p.clientName}: ${p.amount} ${p.currency}`, en: (p) => `Payment ${p.number} from ${p.clientName}: ${p.amount} ${p.currency}`, href: (_p, id) => `/app/finance/payments/${id}`, priority: "MEDIUM" },
    "expense.approved": { to: async (p) => [p.submittedById], ar: (p) => `تم اعتماد المصروف ${p.number}`, en: (p) => `Expense ${p.number} approved`, href: (_p, id) => `/app/finance/expenses/${id}`, priority: "MEDIUM" },
    "expense.rejected": { to: async (p) => [p.submittedById], ar: (p) => `رُفض المصروف ${p.number}: ${p.reason ?? ""}`, en: (p) => `Expense ${p.number} rejected: ${p.reason ?? ""}`, href: (_p, id) => `/app/finance/expenses/${id}`, priority: "HIGH" },
    "expense.paid": { to: async (p) => [p.submittedById], ar: (p) => `تم صرف المصروف ${p.number}`, en: (p) => `Expense ${p.number} paid`, href: (_p, id) => `/app/finance/expenses/${id}`, priority: "MEDIUM" },
    "expense.payment_due": { to: (_p, o) => payers(o), ar: (p) => `مصروف معتمد بانتظار الصرف: ${p.number} (${p.total} ${p.currency})`, en: (p) => `Approved expense awaiting payment: ${p.number} (${p.total} ${p.currency})`, href: (_p, id) => `/app/finance/expenses/${id}`, priority: "MEDIUM", key: (_p, id) => `expense.payment_due:${id}` },
    "project.billing_ready": { to: (_p, o) => billers(o), ar: (p) => `مشروع مكتمل جاهز للفوترة: ${p.ref} · ${p.label}`, en: (p) => `Completed project ready for billing: ${p.ref} · ${p.label}`, href: (_p, id) => `/app/finance/invoices/new?type=PROJECT&id=${id}`, priority: "HIGH", key: (_p, id) => `billing_ready:${id}` },
    "contract_milestone.billing_ready": { to: (_p, o) => billers(o), ar: (p) => `مرحلة عقد جاهزة للفوترة: ${p.ref} · ${p.label}`, en: (p) => `Contract milestone ready for billing: ${p.ref} · ${p.label}`, href: (_p, id) => `/app/finance/invoices/new?type=CONTRACT_MILESTONE&id=${id}`, priority: "HIGH", key: (_p, id) => `billing_ready:${id}` }
  };
  for (const [type, f] of Object.entries(FINANCE)) {
    subscribe(type, async (e) => {
      const p = (e.payload ?? {}) as Record<string, string>;
      const ids = [...new Set((await f.to(p, e.organizationId)).filter((x): x is string => Boolean(x) && x !== e.actorId))];
      if (!ids.length) return;
      const users = await prisma.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, locale: true } });
      const id = e.entityId ?? "";
      await prisma.notification.createMany({
        data: users.map((u) => ({
          organizationId: e.organizationId,
          userId: u.id,
          category: "INVOICE" as const,
          priority: f.priority,
          title: u.locale === "en" ? f.en(p) : f.ar(p),
          href: f.href(p, id),
          entityType: e.entityType ?? null,
          entityId: id || null,
          dedupeKey: f.key ? f.key(p, id) : `${type}:${e.id}`
        })),
        skipDuplicates: true
      });
    });
  }

  // People (Phase 6): private, so titles never contain salary figures; dedupe keys as in Phases 4–5.
  type H = { to: (p: Record<string, string>) => (string | null | undefined)[]; ar: (p: Record<string, string>) => string; en: (p: Record<string, string>) => string; href: (p: Record<string, string>, id: string) => string; priority: "MEDIUM" | "HIGH"; key?: (p: Record<string, string>, id: string) => string };
  const PEOPLE: Record<string, H> = {
    "leave.approved": { to: (p) => [p.userId], ar: (p) => `تمت الموافقة على إجازتك (${p.start} → ${p.end})`, en: (p) => `Your leave was approved (${p.start} → ${p.end})`, href: () => "/app/my-hr?tab=leave", priority: "MEDIUM" },
    "leave.rejected": { to: (p) => [p.userId], ar: (p) => `رُفض طلب إجازتك: ${p.reason ?? ""}`, en: (p) => `Your leave request was rejected: ${p.reason ?? ""}`, href: () => "/app/my-hr?tab=leave", priority: "HIGH" },
    "leave.starting": { to: (p) => [p.userId, p.managerUserId], ar: (p) => `إجازة تبدأ ${p.start}: ${p.name}`, en: (p) => `Leave starts ${p.start}: ${p.name}`, href: () => "/app/my-team", priority: "MEDIUM", key: (_p, id) => `leave.starting:${id}` },
    "attendance.missing": { to: (p) => [p.userId], ar: (p) => `لا يوجد تسجيل حضور ليوم ${p.date} — يحتاج تصحيحًا`, en: (p) => `No attendance recorded for ${p.date} — correction required`, href: () => "/app/my-hr?tab=attendance", priority: "MEDIUM", key: (p, id) => `attendance.missing:${id}:${p.date}` },
    "payroll.approved": { to: (p) => [p.preparedById, p.submittedById], ar: (p) => `اعتُمد مسير الرواتب ${p.name}`, en: (p) => `Payroll ${p.name} approved`, href: (_p, id) => `/app/hr/payroll/${id}`, priority: "MEDIUM" },
    "interview.scheduled": { to: (p) => (p.interviewers ?? "").split(","), ar: (p) => `مقابلة مجدولة: ${p.name} — ${p.job}`, en: (p) => `Interview scheduled: ${p.name} — ${p.job}`, href: (p) => `/app/my-hr?tab=interviews`, priority: "MEDIUM" },
    "candidate.stage_changed": { to: (p) => [p.ownerId], ar: (p) => `انتقل المرشح ${p.name} إلى ${p.to}`, en: (p) => `Candidate ${p.name} moved to ${p.to}`, href: (p) => `/app/hr/recruitment/candidates/${p.candidateId}`, priority: "MEDIUM" },
    "offer.accepted": { to: (p) => [p.ownerId], ar: (p) => `قبل ${p.name} العرض ${p.number} — حوّله إلى موظف`, en: (p) => `${p.name} accepted offer ${p.number} — convert to employee`, href: () => "/app/hr/recruitment", priority: "HIGH" },
    "offer.expiring": { to: (p) => [p.ownerId], ar: (p) => `العرض ${p.number} ينتهي ${p.expiresAt}`, en: (p) => `Offer ${p.number} expires ${p.expiresAt}`, href: () => "/app/hr/recruitment", priority: "MEDIUM", key: (_p, id) => `offer.expiring:${id}` },
    "performance.review_due": { to: (p) => [p.reviewerId], ar: (p) => `مراجعة أداء مستحقة ${p.due}: ${p.name}`, en: (p) => `Performance review due ${p.due}: ${p.name}`, href: (p) => `/app/hr/employees/${p.employeeId}?tab=performance`, priority: "MEDIUM", key: (_p, id) => `review.due:${id}` },
    "performance.review_completed": { to: (p) => [p.userId], ar: (p) => `اكتملت مراجعة أدائك (${p.period})`, en: (p) => `Your performance review is complete (${p.period})`, href: () => "/app/my-hr?tab=performance", priority: "MEDIUM" }
  };
  for (const [type, h] of Object.entries(PEOPLE)) {
    subscribe(type, async (e) => {
      const p = (e.payload ?? {}) as Record<string, string>;
      const ids = [...new Set(h.to(p).filter((x): x is string => Boolean(x) && x !== e.actorId))];
      if (!ids.length) return;
      const users = await prisma.user.findMany({ where: { id: { in: ids }, organizationId: e.organizationId, status: "ACTIVE" }, select: { id: true, locale: true } });
      const id = e.entityId ?? "";
      await prisma.notification.createMany({
        data: users.map((u) => ({ organizationId: e.organizationId, userId: u.id, category: "HR" as const, priority: h.priority, title: u.locale === "en" ? h.en(p) : h.ar(p), href: h.href(p, id), entityType: e.entityType ?? null, entityId: id || null, dedupeKey: h.key ? h.key(p, id) : `${type}:${e.id}` })),
        skipDuplicates: true
      });
    });
  }
  // payroll paid → "payslip available" to every employee of the period that has an account (one per entry)
  subscribe("payroll.paid", async (e) => {
    const entries = await prisma.payrollEntry.findMany({ where: { periodId: e.entityId ?? "" }, select: { id: true, employee: { select: { user: { select: { id: true, locale: true, status: true } } } } } });
    const p = (e.payload ?? {}) as Record<string, string>;
    const rows = entries.filter((x) => x.employee.user?.status === "ACTIVE").map((x) => ({ organizationId: e.organizationId, userId: x.employee.user!.id, category: "HR" as const, priority: "MEDIUM" as const, title: x.employee.user!.locale === "en" ? `Your payslip for ${p.name} is available` : `قسيمة راتبك لفترة ${p.name} متاحة`, href: "/app/my-hr?tab=payslips", entityType: "PayrollEntry", entityId: x.id, dedupeKey: `payslip:${x.id}` }));
    if (rows.length) await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  });

  // Operations (Phase 7): procurement, assets, support, knowledge, documents — recipients may be role holders (async)
  type O = {
    to: (p: Record<string, string>, orgId: string) => Promise<(string | null | undefined)[]> | (string | null | undefined)[];
    ar: (p: Record<string, string>) => string;
    en: (p: Record<string, string>) => string;
    href: (p: Record<string, string>, id: string) => string;
    category: "OPERATIONS" | "SUPPORT";
    priority: (p: Record<string, string>) => "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    key?: (p: Record<string, string>, id: string) => string;
    when?: (p: Record<string, string>) => boolean;
  };
  const M = () => "MEDIUM" as const;
  const OPS: Record<string, O> = {
    "procurement.approved": { to: (p) => [p.requesterId], ar: (p) => `تم اعتماد طلب الشراء ${p.number}`, en: (p) => `Purchase request ${p.number} approved`, href: (_p, id) => `/app/procurement/${id}`, category: "OPERATIONS", priority: M },
    "procurement.rejected": { to: (p) => [p.requesterId], ar: (p) => `رُفض طلب الشراء ${p.number}: ${p.reason}`, en: (p) => `Purchase request ${p.number} rejected: ${p.reason}`, href: (_p, id) => `/app/procurement/${id}`, category: "OPERATIONS", priority: () => "HIGH" },
    "purchase_order.approved": { to: (p) => [p.createdById], ar: (p) => `تم اعتماد أمر الشراء ${p.number}`, en: (p) => `Purchase order ${p.number} approved`, href: (_p, id) => `/app/procurement/orders/${id}`, category: "OPERATIONS", priority: M },
    "purchase_order.overdue": { to: async (p, org) => [p.createdById, ...(await usersWithAll(org, ["procurement.orders.receive"]))], ar: (p) => `تأخر توريد أمر الشراء ${p.number} (${p.vendor}) — المتوقع ${p.expected}`, en: (p) => `PO ${p.number} (${p.vendor}) is overdue — expected ${p.expected}`, href: (_p, id) => `/app/procurement/orders/${id}`, category: "OPERATIONS", priority: () => "HIGH", key: (_p, id) => `po.overdue:${id}` },
    "asset.assigned": { to: (p) => [p.userId], ar: (p) => `تم تسليمك الأصل ${p.number} · ${p.name}`, en: (p) => `Asset assigned to you: ${p.number} · ${p.name}`, href: () => "/app/my-hr?tab=assets", category: "OPERATIONS", priority: M },
    "asset.warranty_expiring": { to: (_p, org) => usersWithAll(org, ["assets.manage"]), ar: (p) => `ضمان الأصل ${p.number} ينتهي ${p.warrantyEnd}`, en: (p) => `Warranty of ${p.number} ends ${p.warrantyEnd}`, href: (_p, id) => `/app/assets/${id}`, category: "OPERATIONS", priority: M, key: (_p, id) => `asset.warranty:${id}` },
    "asset.maintenance_due": { to: (_p, org) => usersWithAll(org, ["assets.maintenance"]), ar: (p) => `صيانة مستحقة للأصل ${p.number} (${p.scheduled})`, en: (p) => `Maintenance due for ${p.number} (${p.scheduled})`, href: (p) => `/app/assets/${p.assetId}`, category: "OPERATIONS", priority: M, key: (p) => `asset.maintenance:${p.maintenanceId}` },
    "ticket.created": { to: (_p, org) => usersWithAll(org, ["support.tickets.manage"]), when: (p) => p.priority === "URGENT", ar: (p) => `تذكرة عاجلة ${p.number}: ${p.subject}`, en: (p) => `Urgent ticket ${p.number}: ${p.subject}`, href: (_p, id) => `/app/support/tickets/${id}`, category: "SUPPORT", priority: () => "URGENT", key: (_p, id) => `ticket.urgent:${id}` },
    "ticket.assigned": { to: (p) => [p.assigneeId], ar: (p) => `أُسندت إليك التذكرة ${p.number}: ${p.subject}`, en: (p) => `Ticket ${p.number} assigned to you: ${p.subject}`, href: (_p, id) => `/app/support/tickets/${id}`, category: "SUPPORT", priority: (p) => (p.priority === "URGENT" ? "URGENT" : "MEDIUM") },
    "ticket.sla_warning": { to: async (p, org) => (p.assigneeId ? [p.assigneeId] : await usersWithAll(org, ["support.tickets.manage"])), ar: (p) => `اقتراب تجاوز SLA (${p.kind === "response" ? "الاستجابة" : "الحل"}) للتذكرة ${p.number}`, en: (p) => `SLA ${p.kind} nearly due on ${p.number}`, href: (_p, id) => `/app/support/tickets/${id}`, category: "SUPPORT", priority: () => "HIGH", key: (p, id) => `sla.warn:${id}:${p.kind}` },
    "ticket.sla_breached": { to: async (p, org) => [p.assigneeId, ...(await usersWithAll(org, ["support.tickets.manage"]))], ar: (p) => `تم تجاوز SLA (${p.kind === "response" ? "الاستجابة" : "الحل"}) للتذكرة ${p.number}`, en: (p) => `SLA ${p.kind} breached on ${p.number}`, href: (_p, id) => `/app/support/tickets/${id}`, category: "SUPPORT", priority: () => "URGENT", key: (p, id) => `sla.breach:${id}:${p.kind}` },
    "ticket.resolved": { to: (p) => [p.createdById], ar: (p) => `تم حل التذكرة ${p.number}`, en: (p) => `Ticket ${p.number} resolved`, href: (_p, id) => `/app/support/tickets/${id}`, category: "SUPPORT", priority: M },
    "knowledge.review_requested": { to: (_p, org) => usersWithAll(org, ["knowledge.review"]), ar: (p) => `مقال معرفة بانتظار المراجعة: ${p.number}`, en: (p) => `Knowledge article awaiting review: ${p.number}`, href: (_p, id) => `/app/knowledge/${id}`, category: "OPERATIONS", priority: () => "LOW" },
    "knowledge.review_reminder": { to: (_p, org) => usersWithAll(org, ["knowledge.review"]), ar: (p) => `تذكير: المقال ${p.number} ينتظر المراجعة منذ أيام`, en: (p) => `Reminder: ${p.number} has been waiting for review`, href: (_p, id) => `/app/knowledge/${id}`, category: "OPERATIONS", priority: M, key: (_p, id) => `kb.reminder:${id}` },
    "knowledge.published": { to: (p) => [p.authorId], ar: (p) => `نُشر المقال ${p.number} (الإصدار ${p.version})`, en: (p) => `Article ${p.number} published (v${p.version})`, href: (_p, id) => `/app/knowledge/${id}`, category: "OPERATIONS", priority: () => "LOW" },
    "document.version_created": { to: (p) => [p.reviewerId], when: (p) => Boolean(p.reviewerId), ar: (p) => `مستند بانتظار مراجعتك: ${p.number} · ${p.title}`, en: (p) => `Document awaiting your review: ${p.number} · ${p.title}`, href: (_p, id) => `/app/documents/${id}`, category: "OPERATIONS", priority: M, key: (_p, id) => `doc.review:${id}` }
  };
  for (const [type, h] of Object.entries(OPS)) {
    subscribe(type, async (e) => {
      const p = Object.fromEntries(Object.entries((e.payload ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]));
      if (h.when && !h.when(p)) return;
      const ids = [...new Set((await h.to(p, e.organizationId)).filter((x): x is string => Boolean(x) && x !== e.actorId))];
      if (!ids.length) return;
      const users = await prisma.user.findMany({ where: { id: { in: ids }, organizationId: e.organizationId, status: "ACTIVE" }, select: { id: true, locale: true } });
      const id = e.entityId ?? "";
      await prisma.notification.createMany({
        data: users.map((u) => ({ organizationId: e.organizationId, userId: u.id, category: h.category, priority: h.priority(p), title: u.locale === "en" ? h.en(p) : h.ar(p), href: h.href(p, id), entityType: e.entityType ?? null, entityId: id || null, dedupeKey: h.key ? h.key(p, id) : `${type}:${e.id}` })),
        skipDuplicates: true
      });
    });
  }
  // offboarding: a terminated employee who still holds assets → asset managers (never auto-returned)
  subscribe("employee.terminated", async (e) => {
    const held = await prisma.assetAssignment.findMany({ where: { employeeId: e.entityId ?? "", returnedAt: null }, select: { asset: { select: { number: true } } } });
    if (!held.length) return;
    const emp = await prisma.employee.findUnique({ where: { id: e.entityId ?? "" }, select: { displayName: true, number: true } });
    const users = await prisma.user.findMany({ where: { id: { in: await usersWithAll(e.organizationId, ["assets.assign"]) } }, select: { id: true, locale: true } });
    const list = held.map((h) => h.asset.number).join(", ");
    await prisma.notification.createMany({
      data: users.map((u) => ({ organizationId: e.organizationId, userId: u.id, category: "OPERATIONS" as const, priority: "HIGH" as const, title: u.locale === "en" ? `Asset return required: ${emp?.displayName} (${emp?.number}) holds ${list}` : `مطلوب استرجاع أصول: ${emp?.displayName} (${emp?.number}) لديه ${list}`, href: `/app/hr/employees/${e.entityId}?tab=assets`, entityType: "Employee", entityId: e.entityId ?? null, dedupeKey: `asset.return:${e.entityId}` })),
      skipDuplicates: true
    });
  });

  // Role granted → tell the user
  subscribe("user.roles_changed", async (e) => {
    const p = e.payload as { userId: string; added: string[] };
    if (!p.added?.length || p.userId === e.actorId) return;
    const u = await prisma.user.findUnique({ where: { id: p.userId }, select: { locale: true } });
    await prisma.notification.create({
      data: {
        organizationId: e.organizationId,
        userId: p.userId,
        category: "SYSTEM",
        title: u?.locale === "en" ? "Your roles were updated" : "تم تحديث أدوارك وصلاحياتك",
        body: p.added.join(", "),
        href: "/app/me"
      }
    });
  });

  // Phase 8: outbound webhooks + integration / marketing notifications
  registerIntegrationSubscribers();

  // Phase 9: deterministic business rules (named "automation" handler) + system alert notifications
  registerAutomationSubscriber();
  registerSystemSubscribers();
}

/** Active users in the org whose roles grant all given permissions. */
export async function usersWithAll(organizationId: string, perms: Permission[]): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, roles: { select: { role: { select: { permissions: { select: { permission: true } } } } } } }
  });
  return users
    .filter((u) => {
      const set = new Set(u.roles.flatMap((r) => r.role.permissions.map((x) => x.permission)));
      return perms.every((p) => set.has(p));
    })
    .map((u) => u.id);
}
