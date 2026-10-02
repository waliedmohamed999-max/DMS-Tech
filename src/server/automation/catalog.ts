import { prisma } from "../db";
import { todayIn } from "../commercial/dates";

/**
 * Automation catalog (docs/AUTOMATION.md): which EXISTING domain events can trigger a rule, which entity each one
 * concerns, and the closed list of fields a condition may read. Conditions can only reference these fields —
 * there is no expression language and no code execution.
 */
export type FieldType = "number" | "string" | "enum" | "boolean";
export type FieldDef = { name: string; type: FieldType; options?: readonly string[] };
export type EntityKind = "lead" | "opportunity" | "quotation" | "contract" | "project" | "invoice" | "expense" | "leave" | "employee" | "purchaseOrder" | "ticket" | "campaign" | "integration";

const CLIENT_FIELDS: FieldDef[] = [
  { name: "client.country", type: "string" },
  { name: "client.city", type: "string" },
  { name: "client.status", type: "enum", options: ["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"] }
];
const PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const FIELDS: Record<EntityKind, FieldDef[]> = {
  lead: [
    { name: "lead.source", type: "enum", options: ["WEBSITE", "WHATSAPP", "PHONE", "REFERRAL", "LINKEDIN", "INSTAGRAM", "GOOGLE_ADS", "META_ADS", "TIKTOK", "GOVERNMENT_OPPORTUNITY", "PARTNER", "MANUAL", "OTHER"] },
    { name: "lead.status", type: "enum", options: ["OPEN", "QUALIFIED", "CONVERTED", "LOST", "ARCHIVED"] },
    { name: "lead.priority", type: "enum", options: PRIORITY },
    { name: "lead.country", type: "string" },
    { name: "lead.city", type: "string" },
    { name: "lead.budgetMax", type: "number" },
    { name: "lead.hasOwner", type: "boolean" }
  ],
  opportunity: [
    { name: "opportunity.value", type: "number" },
    { name: "opportunity.probability", type: "number" },
    { name: "opportunity.status", type: "enum", options: ["OPEN", "WON", "LOST", "ARCHIVED"] },
    { name: "opportunity.stage", type: "string" },
    { name: "opportunity.currency", type: "string" },
    { name: "opportunity.daysInStage", type: "number" },
    ...CLIENT_FIELDS
  ],
  quotation: [
    { name: "quotation.status", type: "string" },
    { name: "quotation.total", type: "number" },
    { name: "quotation.currency", type: "string" },
    ...CLIENT_FIELDS
  ],
  contract: [
    { name: "contract.status", type: "string" },
    { name: "contract.value", type: "number" },
    { name: "contract.currency", type: "string" },
    { name: "contract.daysUntilExpiry", type: "number" },
    ...CLIENT_FIELDS
  ],
  project: [
    { name: "project.status", type: "string" },
    { name: "project.health", type: "enum", options: ["HEALTHY", "NEEDS_ATTENTION", "AT_RISK"] },
    { name: "project.progress", type: "number" },
    { name: "project.priority", type: "enum", options: PRIORITY },
    { name: "project.budget", type: "number" },
    { name: "project.daysToTargetEnd", type: "number" },
    ...CLIENT_FIELDS
  ],
  invoice: [
    { name: "invoice.status", type: "string" },
    { name: "invoice.total", type: "number" },
    { name: "invoice.balanceDue", type: "number" },
    { name: "invoice.daysOverdue", type: "number" },
    { name: "invoice.currency", type: "string" },
    ...CLIENT_FIELDS
  ],
  expense: [
    { name: "expense.amount", type: "number" },
    { name: "expense.status", type: "string" },
    { name: "expense.currency", type: "string" }
  ],
  leave: [
    { name: "leave.days", type: "number" },
    { name: "leave.status", type: "string" }
  ],
  employee: [
    { name: "employee.status", type: "string" },
    { name: "employee.country", type: "string" },
    { name: "employee.activeAssets", type: "number" }
  ],
  purchaseOrder: [
    { name: "purchaseOrder.status", type: "string" },
    { name: "purchaseOrder.total", type: "number" },
    { name: "purchaseOrder.daysLate", type: "number" }
  ],
  ticket: [
    { name: "ticket.priority", type: "enum", options: PRIORITY },
    { name: "ticket.status", type: "string" },
    { name: "ticket.category", type: "string" },
    { name: "ticket.assigned", type: "boolean" }
  ],
  campaign: [
    { name: "campaign.channel", type: "string" },
    { name: "campaign.status", type: "string" },
    { name: "campaign.recipients", type: "number" }
  ],
  integration: [
    { name: "integration.provider", type: "string" },
    { name: "integration.status", type: "string" }
  ]
};

/** Trigger → entity. Only events that already exist (Phases 1–8); no parallel event infrastructure. */
export const TRIGGERS: Record<string, EntityKind> = {
  "lead.created": "lead", "lead.assigned": "lead", "lead.converted": "lead",
  "opportunity.created": "opportunity", "opportunity.stage_changed": "opportunity", "opportunity.won": "opportunity", "opportunity.lost": "opportunity",
  "quotation.accepted": "quotation", "quotation.expiring": "quotation", "quotation.rejected_by_client": "quotation",
  "contract.expiring": "contract", "contract.expired": "contract",
  "project.at_risk": "project", "project.completed": "project", "project.started": "project",
  "invoice.issued": "invoice", "invoice.overdue": "invoice", "invoice.due_soon": "invoice", "invoice.paid": "invoice",
  "expense.submitted": "expense", "expense.approved": "expense",
  "leave.approved": "leave",
  "employee.terminated": "employee",
  "purchase_order.overdue": "purchaseOrder", "purchase_order.issued": "purchaseOrder",
  "ticket.created": "ticket", "ticket.sla_warning": "ticket", "ticket.sla_breached": "ticket",
  "campaign.completed": "campaign", "campaign.failed": "campaign",
  "integration.failed": "integration", "integration.dead_letter": "integration"
};

/** DomainEvent.entityType → kind (events of one trigger always carry the same entity type). */
export const ENTITY_TYPES: Record<string, EntityKind> = {
  Lead: "lead", Opportunity: "opportunity", Quotation: "quotation", Contract: "contract", Project: "project", Invoice: "invoice",
  Expense: "expense", LeaveRequest: "leave", Employee: "employee", PurchaseOrder: "purchaseOrder", SupportTicket: "ticket",
  MarketingCampaign: "campaign", IntegrationConnection: "integration", IntegrationOutbox: "integration"
};

/** Which CRM / delivery records an action may attach to (follow-ups, tasks). */
export type Loaded = {
  values: Record<string, string | number | boolean | null>;
  label: string;
  href: string | null;
  ownerUserId: string | null;
  clientId: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
};

const n = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d.toString()));
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
const clientVals = (c: { country: string | null; city: string | null; status: string } | null | undefined) => ({ "client.country": c?.country ?? null, "client.city": c?.city ?? null, "client.status": c?.status ?? null });
const CLIENT_SEL = { select: { country: true, city: true, status: true } } as const;

/**
 * Load the CURRENT state of the event's entity (conditions are evaluated against the database, not the event payload).
 * Returns null when the entity no longer exists (execution is SKIPPED with ENTITY_NOT_FOUND).
 */
export async function loadEntity(organizationId: string, kind: EntityKind, id: string): Promise<Loaded | null> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const o = organizationId;
  switch (kind) {
    case "lead": {
      const x = await prisma.lead.findFirst({ where: { id, organizationId: o }, select: { number: true, name: true, source: true, status: true, priority: true, country: true, city: true, budgetMax: true, ownerId: true, convertedClientId: true } });
      if (!x) return null;
      return { label: `${x.number} · ${x.name}`, href: `/app/crm/leads/${id}`, ownerUserId: x.ownerId, clientId: x.convertedClientId, leadId: id, values: { "lead.source": x.source, "lead.status": x.status, "lead.priority": x.priority, "lead.country": x.country, "lead.city": x.city, "lead.budgetMax": n(x.budgetMax), "lead.hasOwner": Boolean(x.ownerId) } };
    }
    case "opportunity": {
      const x = await prisma.opportunity.findFirst({ where: { id, organizationId: o }, select: { number: true, title: true, estimatedValue: true, probability: true, status: true, currency: true, stageChangedAt: true, ownerId: true, clientId: true, stage: { select: { key: true } }, client: CLIENT_SEL } });
      if (!x) return null;
      return { label: `${x.number} · ${x.title}`, href: `/app/crm/opportunities/${id}`, ownerUserId: x.ownerId, clientId: x.clientId, opportunityId: id, values: { "opportunity.value": n(x.estimatedValue), "opportunity.probability": x.probability, "opportunity.status": x.status, "opportunity.stage": x.stage.key, "opportunity.currency": x.currency, "opportunity.daysInStage": daysBetween(new Date(), x.stageChangedAt), ...clientVals(x.client) } };
    }
    case "quotation": {
      const x = await prisma.quotation.findFirst({ where: { id, organizationId: o }, select: { number: true, status: true, ownerId: true, clientId: true, opportunityId: true, currentVersion: { select: { total: true, currency: true } }, client: CLIENT_SEL } });
      if (!x) return null;
      return { label: x.number, href: `/app/sales/quotations/${id}`, ownerUserId: x.ownerId, clientId: x.clientId, opportunityId: x.opportunityId, values: { "quotation.status": x.status, "quotation.total": n(x.currentVersion?.total), "quotation.currency": x.currentVersion?.currency ?? null, ...clientVals(x.client) } };
    }
    case "contract": {
      const x = await prisma.contract.findFirst({ where: { id, organizationId: o }, select: { number: true, status: true, contractValue: true, currency: true, endDate: true, ownerId: true, clientId: true, client: CLIENT_SEL } });
      if (!x) return null;
      return { label: x.number, href: `/app/sales/contracts/${id}`, ownerUserId: x.ownerId, clientId: x.clientId, values: { "contract.status": x.status, "contract.value": n(x.contractValue), "contract.currency": x.currency, "contract.daysUntilExpiry": x.endDate ? daysBetween(x.endDate, today) : null, ...clientVals(x.client) } };
    }
    case "project": {
      const x = await prisma.project.findFirst({ where: { id, organizationId: o }, select: { number: true, name: true, status: true, health: true, progress: true, priority: true, budgetAmount: true, targetEndDate: true, projectManagerId: true, clientId: true, client: CLIENT_SEL } });
      if (!x) return null;
      return { label: `${x.number} · ${x.name}`, href: `/app/projects/${id}`, ownerUserId: x.projectManagerId, clientId: x.clientId, projectId: id, values: { "project.status": x.status, "project.health": x.health, "project.progress": x.progress, "project.priority": x.priority, "project.budget": n(x.budgetAmount), "project.daysToTargetEnd": x.targetEndDate ? daysBetween(x.targetEndDate, today) : null, ...clientVals(x.client) } };
    }
    case "invoice": {
      const x = await prisma.invoice.findFirst({ where: { id, organizationId: o }, select: { number: true, status: true, total: true, balanceDue: true, dueDate: true, currency: true, createdById: true, clientId: true, client: CLIENT_SEL } });
      if (!x) return null;
      return { label: x.number ?? "draft", href: `/app/finance/invoices/${id}`, ownerUserId: x.createdById, clientId: x.clientId, values: { "invoice.status": x.status, "invoice.total": n(x.total), "invoice.balanceDue": n(x.balanceDue), "invoice.daysOverdue": Math.max(0, daysBetween(today, x.dueDate)), "invoice.currency": x.currency, ...clientVals(x.client) } };
    }
    case "expense": {
      const x = await prisma.expense.findFirst({ where: { id, organizationId: o }, select: { number: true, status: true, total: true, currency: true, submittedById: true } });
      if (!x) return null;
      return { label: x.number, href: `/app/finance/expenses/${id}`, ownerUserId: x.submittedById, clientId: null, values: { "expense.amount": n(x.total), "expense.status": x.status, "expense.currency": x.currency } };
    }
    case "leave": {
      const x = await prisma.leaveRequest.findFirst({ where: { id, organizationId: o }, select: { days: true, status: true, employee: { select: { userId: true, displayName: true } } } });
      if (!x) return null;
      // HR privacy: the label carries no reason or balance
      return { label: x.employee.displayName, href: "/app/my-team", ownerUserId: x.employee.userId, clientId: null, values: { "leave.days": n(x.days), "leave.status": x.status } };
    }
    case "employee": {
      const x = await prisma.employee.findFirst({ where: { id, organizationId: o }, select: { number: true, displayName: true, status: true, country: true, userId: true } });
      if (!x) return null;
      const assets = await prisma.assetAssignment.count({ where: { employeeId: id, returnedAt: null } });
      return { label: `${x.number} · ${x.displayName}`, href: `/app/hr/employees/${id}`, ownerUserId: x.userId, clientId: null, values: { "employee.status": x.status, "employee.country": x.country, "employee.activeAssets": assets } };
    }
    case "purchaseOrder": {
      const x = await prisma.purchaseOrder.findFirst({ where: { id, organizationId: o }, select: { number: true, status: true, total: true, expectedDeliveryDate: true, createdById: true } });
      if (!x) return null;
      return { label: x.number ?? "PO", href: `/app/procurement/orders/${id}`, ownerUserId: x.createdById, clientId: null, values: { "purchaseOrder.status": x.status, "purchaseOrder.total": n(x.total), "purchaseOrder.daysLate": x.expectedDeliveryDate ? Math.max(0, daysBetween(today, x.expectedDeliveryDate)) : 0 } };
    }
    case "ticket": {
      const x = await prisma.supportTicket.findFirst({ where: { id, organizationId: o }, select: { number: true, subject: true, priority: true, status: true, category: true, assignedToId: true, clientId: true } });
      if (!x) return null;
      return { label: `${x.number} · ${x.subject}`, href: `/app/support/tickets/${id}`, ownerUserId: x.assignedToId, clientId: x.clientId, values: { "ticket.priority": x.priority, "ticket.status": x.status, "ticket.category": x.category, "ticket.assigned": Boolean(x.assignedToId) } };
    }
    case "campaign": {
      const x = await prisma.marketingCampaign.findFirst({ where: { id, organizationId: o }, select: { number: true, name: true, channel: true, status: true, recipientCount: true, ownerId: true } });
      if (!x) return null;
      return { label: `${x.number} · ${x.name}`, href: `/app/marketing/campaigns/${id}`, ownerUserId: x.ownerId, clientId: null, values: { "campaign.channel": x.channel, "campaign.status": x.status, "campaign.recipients": x.recipientCount } };
    }
    case "integration": {
      const conn = await prisma.integrationConnection.findFirst({ where: { id, organizationId: o }, select: { provider: true, status: true } });
      const ob = conn ? null : await prisma.integrationOutbox.findFirst({ where: { id, organizationId: o }, select: { provider: true, status: true } });
      const x = conn ?? ob;
      if (!x) return null;
      return { label: x.provider, href: "/app/integrations", ownerUserId: null, clientId: null, values: { "integration.provider": x.provider, "integration.status": x.status } };
    }
  }
}
