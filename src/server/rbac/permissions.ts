/**
 * Permission catalog — the single source of truth for every permission key.
 *
 * Keys are typed so a typo is a compile error. Roles and their grants live in the DB
 * (admins can customise them) but can only reference keys from this catalog.
 * Permissions for modules that are not built yet are included so role design is
 * stable across phases; holding them grants nothing until the module exists.
 */
export const PERMISSIONS = {
  // Command center
  "dashboard.view": { group: "command", phase: 1 },
  "dashboard.finance_kpis": { group: "command", phase: 5 },
  "approvals.view": { group: "command", phase: 1 },
  "approvals.decide": { group: "command", phase: 1 },
  "activity.view_all": { group: "command", phase: 1 },

  // Administration
  "admin.users.view": { group: "admin", phase: 1 },
  "admin.users.manage": { group: "admin", phase: 1 },
  "admin.roles.view": { group: "admin", phase: 1 },
  "admin.roles.manage": { group: "admin", phase: 1 },
  /** Grant privileged roles (Super Admin, CEO, Finance Manager, HR Manager) without a second approver */
  "admin.roles.grant_privileged": { group: "admin", phase: 1 },
  "admin.departments.manage": { group: "admin", phase: 1 },
  "admin.settings.manage": { group: "admin", phase: 1 },
  "admin.audit.view": { group: "admin", phase: 1 },
  "admin.integrations.manage": { group: "admin", phase: 8 },
  "admin.automation.manage": { group: "admin", phase: 9 },

  // CRM (Phase 2)
  "crm.clients.view": { group: "crm", phase: 2 },
  "crm.clients.create": { group: "crm", phase: 2 },
  "crm.clients.edit": { group: "crm", phase: 2 },
  "crm.clients.archive": { group: "crm", phase: 2 },
  "crm.contacts.view": { group: "crm", phase: 2 },
  "crm.contacts.create": { group: "crm", phase: 2 },
  "crm.contacts.edit": { group: "crm", phase: 2 },
  "crm.leads.view": { group: "crm", phase: 2 },
  "crm.leads.create": { group: "crm", phase: 2 },
  "crm.leads.edit": { group: "crm", phase: 2 },
  "crm.leads.convert": { group: "crm", phase: 2 },
  "crm.leads.assign": { group: "crm", phase: 2 },
  "crm.leads.archive": { group: "crm", phase: 2 },
  "crm.opportunities.view": { group: "crm", phase: 2 },
  "crm.opportunities.create": { group: "crm", phase: 2 },
  "crm.opportunities.edit": { group: "crm", phase: 2 },
  "crm.opportunities.move_stage": { group: "crm", phase: 2 },
  "crm.opportunities.assign": { group: "crm", phase: 2 },
  "crm.opportunities.mark_won": { group: "crm", phase: 2 },
  "crm.opportunities.mark_lost": { group: "crm", phase: 2 },
  "crm.pipeline.view": { group: "crm", phase: 2 },
  "crm.activities.view": { group: "crm", phase: 2 },
  "crm.activities.create": { group: "crm", phase: 2 },
  /** Record scope: without either scope permission a user only sees CRM records they own or created */
  "crm.records.team": { group: "crm", phase: 2 },
  "crm.records.all": { group: "crm", phase: 2 },

  // Sales (Phase 3) — record scope reuses crm.records.team / crm.records.all
  "services.view": { group: "sales", phase: 3 },
  "services.manage": { group: "sales", phase: 3 },
  "sales.quotations.view": { group: "sales", phase: 3 },
  "sales.quotations.create": { group: "sales", phase: 3 },
  "sales.quotations.edit": { group: "sales", phase: 3 },
  "sales.quotations.submit": { group: "sales", phase: 3 },
  "sales.quotations.approve": { group: "sales", phase: 3 },
  /** Required approver tier for quotations at/above the executive threshold */
  "sales.quotations.approve_executive": { group: "sales", phase: 3 },
  "sales.quotations.send": { group: "sales", phase: 3 },
  /** Record the client's acceptance */
  "sales.quotations.accept": { group: "sales", phase: 3 },
  /** Record the client's rejection */
  "sales.quotations.reject": { group: "sales", phase: 3 },
  "sales.quotations.cancel": { group: "sales", phase: 3 },
  "sales.contracts.view": { group: "sales", phase: 3 },
  "sales.contracts.create": { group: "sales", phase: 3 },
  "sales.contracts.edit": { group: "sales", phase: 3 },
  "sales.contracts.activate": { group: "sales", phase: 3 },
  "sales.contracts.terminate": { group: "sales", phase: 3 },

  // Delivery
  "projects.view": { group: "delivery", phase: 4 },
  "projects.create": { group: "delivery", phase: 4 },
  "projects.edit": { group: "delivery", phase: 4 },
  "projects.archive": { group: "delivery", phase: 4 },
  "projects.manage_team": { group: "delivery", phase: 4 },
  "projects.change_status": { group: "delivery", phase: 4 },
  "projects.complete": { group: "delivery", phase: 4 },
  "projects.templates.manage": { group: "delivery", phase: 4 },
  /** Record scope for projects: department projects / every project (default: member, PM or creator) */
  "projects.records.team": { group: "delivery", phase: 4 },
  "projects.records.all": { group: "delivery", phase: 4 },
  "projects.milestones.view": { group: "delivery", phase: 4 },
  "projects.milestones.manage": { group: "delivery", phase: 4 },
  "projects.tasks.view": { group: "delivery", phase: 4 },
  "projects.tasks.create": { group: "delivery", phase: 4 },
  "projects.tasks.edit": { group: "delivery", phase: 4 },
  "projects.tasks.assign": { group: "delivery", phase: 4 },
  "projects.tasks.change_status": { group: "delivery", phase: 4 },
  "projects.time.view": { group: "delivery", phase: 4 },
  "projects.time.create": { group: "delivery", phase: 4 },
  "projects.time.submit": { group: "delivery", phase: 4 },
  "projects.time.approve": { group: "delivery", phase: 4 },
  "projects.deliverables.view": { group: "delivery", phase: 4 },
  "projects.deliverables.manage": { group: "delivery", phase: 4 },
  "support.tickets.view": { group: "delivery", phase: 7 },
  "support.tickets.manage": { group: "delivery", phase: 7 },

  // Finance
  "finance.dashboard.view": { group: "finance", phase: 5 },
  /** Finance record scope: every invoice/payment/expense (otherwise: own expenses; invoices of clients/projects in scope) */
  "finance.records.all": { group: "finance", phase: 5 },
  "finance.invoices.view": { group: "finance", phase: 5 },
  "finance.invoices.create": { group: "finance", phase: 5 },
  "finance.invoices.edit": { group: "finance", phase: 5 },
  "finance.invoices.issue": { group: "finance", phase: 5 },
  "finance.invoices.send": { group: "finance", phase: 5 },
  "finance.invoices.cancel": { group: "finance", phase: 5 },
  /** Manual collection notes, reminders and follow-up dates on invoices */
  "finance.collections.manage": { group: "finance", phase: 5 },
  "finance.payments.view": { group: "finance", phase: 5 },
  "finance.payments.create": { group: "finance", phase: 5 },
  "finance.payments.reverse": { group: "finance", phase: 5 },
  "finance.expenses.view": { group: "finance", phase: 5 },
  "finance.expenses.create": { group: "finance", phase: 5 },
  "finance.expenses.submit": { group: "finance", phase: 5 },
  "finance.expenses.approve": { group: "finance", phase: 5 },
  /** Expenses at/above org.expenseApprovalThreshold */
  "finance.expenses.approve_executive": { group: "finance", phase: 5 },
  "finance.expenses.pay": { group: "finance", phase: 5 },
  "finance.vendors.view": { group: "finance", phase: 5 },
  "finance.vendors.manage": { group: "finance", phase: 5 },
  "finance.profitability.view": { group: "finance", phase: 5 },
  "finance.cost_rates.view": { group: "finance", phase: 5 },
  "finance.cost_rates.manage": { group: "finance", phase: 5 },
  "finance.reports.view": { group: "finance", phase: 5 },
  "finance.payroll.view": { group: "finance", phase: 6 },
  "finance.payroll.manage": { group: "finance", phase: 6 },

  // People
  "hr.employees.view": { group: "people", phase: 6 },
  "hr.employees.manage": { group: "people", phase: 6 },
  /** Salary, bank details, private HR documents */
  "hr.employees.sensitive": { group: "people", phase: 6 },
  "hr.leave.request": { group: "people", phase: 6 },
  "hr.leave.approve": { group: "people", phase: 6 },
  "hr.recruitment.manage": { group: "people", phase: 6 },

  // Marketing & operations
  "marketing.campaigns.manage": { group: "marketing", phase: 8 },
  "marketing.whatsapp.send": { group: "marketing", phase: 8 },
  "ops.vendors.manage": { group: "operations", phase: 7 },
  "ops.procurement.manage": { group: "operations", phase: 7 },
  "ops.documents.manage": { group: "operations", phase: 7 },

  // NOVA AI — external DMS Tech platform; this only gates the launch link / integration page
  "nova.use": { group: "nova", phase: 2 }
} as const satisfies Record<string, { group: PermissionGroup; phase: number }>;

export type PermissionGroup = "command" | "admin" | "crm" | "sales" | "delivery" | "finance" | "people" | "marketing" | "operations" | "nova";
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (k: string): k is Permission => k in PERMISSIONS;

/** Roles that can only be granted by someone holding `admin.roles.grant_privileged`, otherwise via approval. */
export const PRIVILEGED_ROLE_KEYS = ["super_admin", "ceo", "finance_manager", "hr_manager"] as const;

type RoleDef = { key: string; name: { ar: string; en: string }; permissions: Permission[] | "*" };

const view = (...p: Permission[]) => p;
const CRM_FULL = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p.startsWith("crm."));
const QUOTES_OWN: Permission[] = ["services.view", "sales.quotations.view", "sales.quotations.create", "sales.quotations.edit", "sales.quotations.submit", "sales.quotations.send", "sales.quotations.accept", "sales.quotations.reject", "sales.quotations.cancel"];
/** Assigned work: what a delivery contributor needs on projects they belong to (scope = own). */
const PROJECT_CONTRIBUTOR: Permission[] = [
  "projects.view", "projects.milestones.view", "projects.tasks.view", "projects.tasks.create", "projects.tasks.edit", "projects.tasks.change_status",
  "projects.time.view", "projects.time.create", "projects.time.submit", "projects.deliverables.view"
];
const PROJECT_MANAGE: Permission[] = [
  ...PROJECT_CONTRIBUTOR, "projects.create", "projects.edit", "projects.archive", "projects.manage_team", "projects.change_status", "projects.complete",
  "projects.templates.manage", "projects.milestones.manage", "projects.tasks.assign", "projects.time.approve", "projects.deliverables.manage"
];
const PROJECT_READ: Permission[] = ["projects.view", "projects.milestones.view", "projects.tasks.view", "projects.deliverables.view"];
const CONTRACTS_FULL: Permission[] = ["sales.contracts.view", "sales.contracts.create", "sales.contracts.edit", "sales.contracts.activate", "sales.contracts.terminate"];
// own expense claims: create + submit (visibility = own records without finance.expenses.view)
const everyone: Permission[] = ["dashboard.view", "approvals.view", "hr.leave.request", "finance.expenses.create", "finance.expenses.submit", "nova.use"];
const FIN_INVOICING: Permission[] = ["finance.invoices.view", "finance.invoices.create", "finance.invoices.edit", "finance.invoices.issue", "finance.invoices.send", "finance.invoices.cancel", "finance.collections.manage"];
/** Day-to-day finance operations (accountant): billing, receipts, expense processing, vendors — no reversals, no margins, no cost rates */
const FIN_OPS: Permission[] = [
  "dashboard.finance_kpis", "finance.dashboard.view", "finance.records.all", ...FIN_INVOICING, "finance.payments.view", "finance.payments.create",
  "finance.expenses.view", "finance.expenses.approve", "finance.expenses.pay", "finance.vendors.view", "finance.vendors.manage", "finance.reports.view"
];

/** System roles seeded into every organization. */
export const SYSTEM_ROLES: RoleDef[] = [
  { key: "super_admin", name: { ar: "مدير النظام", en: "Super Admin" }, permissions: "*" },
  {
    key: "ceo",
    name: { ar: "الرئيس التنفيذي", en: "CEO" },
    permissions: ALL_PERMISSIONS.filter((p) => !["admin.roles.grant_privileged", "admin.integrations.manage"].includes(p))
  },
  {
    key: "general_manager",
    name: { ar: "المدير العام", en: "General Manager" },
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("admin.") && p !== "finance.payroll.manage" && p !== "hr.employees.sensitive").concat(
      "admin.users.view",
      "admin.audit.view"
    )
  },
  {
    key: "finance_manager",
    name: { ar: "المدير المالي", en: "Finance Manager" },
    permissions: [
      ...everyone,
      "dashboard.finance_kpis", "approvals.decide", "activity.view_all",
      ...FIN_OPS, "finance.payments.reverse", "finance.expenses.approve_executive", "finance.profitability.view", "finance.cost_rates.view", "finance.cost_rates.manage",
      "finance.payroll.view", "finance.payroll.manage",
      "services.view", "sales.quotations.view", "sales.quotations.approve", "sales.contracts.view", "crm.clients.view", "crm.contacts.view", "crm.records.all", ...PROJECT_READ, "projects.records.all", "projects.time.view",
      "ops.vendors.manage", "ops.procurement.manage"
    ]
  },
  { key: "accountant", name: { ar: "محاسب", en: "Accountant" }, permissions: [...everyone, "approvals.decide", ...FIN_OPS, "crm.clients.view", "crm.contacts.view", "crm.records.all", "services.view", "sales.quotations.view", "sales.contracts.view", ...PROJECT_READ, "projects.records.all", "projects.time.view"] },
  {
    key: "sales_manager",
    name: { ar: "مدير المبيعات", en: "Sales Manager" },
    permissions: [
      ...everyone, "approvals.decide",
      ...CRM_FULL.filter((p) => p !== "crm.clients.archive"),
      ...QUOTES_OWN, "services.manage", "sales.quotations.approve", ...CONTRACTS_FULL,
      "finance.invoices.view", ...PROJECT_READ
    ]
  },
  {
    key: "sales_rep",
    name: { ar: "مندوب مبيعات", en: "Sales Representative" },
    // own records only (no crm.records.* scope), cannot reassign
    permissions: [
      ...everyone, ...CRM_FULL.filter((p) => !["crm.clients.archive", "crm.leads.assign", "crm.leads.archive", "crm.opportunities.assign", "crm.records.all", "crm.records.team"].includes(p)),
      // own quotations end-to-end, no approvals; contracts: draft from own accepted quotes, no activation/termination
      ...QUOTES_OWN, "sales.contracts.view", "sales.contracts.create", "sales.contracts.edit", "projects.view"
    ]
  },
  {
    key: "project_manager",
    name: { ar: "مدير مشاريع", en: "Project Manager" },
    // manages assigned + department projects; contract read access (record scope) for the commercial hand-off
    permissions: [...everyone, "approvals.decide", ...PROJECT_MANAGE, "projects.records.team", "crm.clients.view", "crm.contacts.view", "crm.records.all", "support.tickets.view", "support.tickets.manage", "hr.leave.approve", "services.view", "sales.contracts.view", "finance.invoices.view"]
  },
  { key: "developer", name: { ar: "مطوّر", en: "Developer" }, permissions: [...everyone, ...PROJECT_CONTRIBUTOR, ...view("support.tickets.view")] },
  { key: "designer", name: { ar: "مصمم", en: "Designer" }, permissions: [...everyone, ...PROJECT_CONTRIBUTOR] },
  { key: "marketing", name: { ar: "تسويق", en: "Marketing" }, permissions: [...everyone, "marketing.campaigns.manage", "marketing.whatsapp.send", "crm.leads.view", "crm.leads.create", "crm.activities.view", "crm.activities.create", "services.view", ...PROJECT_CONTRIBUTOR] },
  {
    key: "hr_manager",
    name: { ar: "مدير الموارد البشرية", en: "HR Manager" },
    permissions: [...everyone, "approvals.decide", "hr.employees.view", "hr.employees.manage", "hr.employees.sensitive", "hr.leave.approve", "hr.recruitment.manage", "finance.payroll.view", "admin.departments.manage"]
  },
  // own assigned tasks/projects only (project scope = membership)
  { key: "employee", name: { ar: "موظف", en: "Employee" }, permissions: [...everyone, "projects.view", "projects.milestones.view", "projects.tasks.view", "projects.tasks.change_status", "projects.time.view", "projects.time.create", "projects.time.submit", "projects.deliverables.view"] }
];

export const resolveRolePermissions = (def: RoleDef): Permission[] => (def.permissions === "*" ? ALL_PERMISSIONS : [...new Set(def.permissions)]);

/**
 * Renamed / split permission keys. System roles are re-synced from SYSTEM_ROLES by bootstrap;
 * CUSTOM roles are migrated with this map by migrateLegacyPermissions (src/server/rbac/migrate.ts):
 * the old key is replaced by the listed keys — never by anything broader than its documented meaning
 * (no record-scope keys, no approval rights that the old key did not express).
 */
export const PERMISSION_RENAMES: Record<string, Permission[]> = {
  // Phase 3
  "sales.services.manage": ["services.view", "services.manage"],
  "sales.contracts.manage": ["sales.contracts.view", "sales.contracts.create", "sales.contracts.edit", "sales.contracts.activate", "sales.contracts.terminate"],
  // Phase 4
  "projects.manage": [
    "projects.view", "projects.create", "projects.edit", "projects.archive", "projects.manage_team", "projects.change_status", "projects.complete",
    "projects.milestones.view", "projects.milestones.manage", "projects.deliverables.view", "projects.deliverables.manage"
  ],
  "tasks.view": ["projects.tasks.view"],
  "tasks.manage": ["projects.tasks.view", "projects.tasks.create", "projects.tasks.edit", "projects.tasks.change_status"],
  // Phase 5 (finance.expenses.submit keeps its key and gains create — submitting needs a draft)
  "finance.invoices.manage": ["finance.invoices.view", "finance.invoices.create", "finance.invoices.edit", "finance.invoices.issue", "finance.invoices.send", "finance.invoices.cancel"],
  "finance.payments.manage": ["finance.payments.view", "finance.payments.create"]
};

/** Keys added next to an existing key on custom roles (the old key stays). Never broader than its meaning. */
export const PERMISSION_COMPANIONS: Record<string, Permission[]> = {
  "finance.expenses.submit": ["finance.expenses.create"]
};
