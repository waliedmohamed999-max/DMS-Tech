import type { IconName } from "@/components/ui/Icon";
import type { Permission } from "@/server/rbac/permissions";

/**
 * Module registry — drives the sidebar, the "+ Create" menu, command palette
 * navigation and the "planned module" pages. `live: false` modules are shown
 * honestly as planned (with their delivery phase), never as working screens.
 */

export type ModuleDef = {
  key: string;
  href: string;
  icon: IconName;
  label: { ar: string; en: string };
  /** One-line description used by planned pages / palette */
  about: { ar: string; en: string };
  permission?: Permission;
  live: boolean;
  phase: number;
};

export type NavGroup = { key: string; label: { ar: string; en: string }; items: ModuleDef[] };

const m = (key: string, href: string, icon: IconName, ar: string, en: string, aboutAr: string, aboutEn: string, phase: number, live = false, permission?: Permission): ModuleDef => ({
  key, href, icon, label: { ar, en }, about: { ar: aboutAr, en: aboutEn }, phase, live, permission
});
const planned = (key: string, icon: IconName, ar: string, en: string, aboutAr: string, aboutEn: string, phase: number, permission?: Permission) =>
  m(key, `/app/m/${key}`, icon, ar, en, aboutAr, aboutEn, phase, false, permission);

export const NAV: NavGroup[] = [
  {
    key: "command",
    label: { ar: "مركز القيادة", en: "Command Center" },
    items: [
      m("overview", "/app", "LayoutDashboard", "نظرة عامة", "Overview", "ما يحدث في الشركة الآن", "What is happening right now", 1, true, "dashboard.view"),
      m("my-work", "/app/my-work", "ClipboardList", "مهامي", "My Work", "مهامك ومشاريعك: المتأخر واليوم والمتوقف", "Your tasks and projects: overdue, today, blocked", 4, true, "projects.tasks.view"),
      m("approvals", "/app/approvals", "BadgeCheck", "الموافقات", "Approvals", "صندوق الموافقات المركزي", "Central approval inbox", 1, true, "approvals.view"),
      m("notifications", "/app/notifications", "Inbox", "الإشعارات", "Notifications", "تنبيهاتك مرتبطة بسجلاتها", "Your alerts, deep-linked", 1, true),
      m("activity", "/app/activity", "ChartLine", "النشاط", "Activity", "سجل نشاط الشركة", "Company activity feed", 1, true)
    ]
  },
  {
    key: "sales",
    label: { ar: "المبيعات", en: "Sales" },
    items: [
      m("crm", "/app/crm", "ChartColumn", "نظرة عامة", "Sales overview", "مؤشرات المبيعات والعملاء", "Sales & CRM metrics", 2, true, "crm.leads.view"),
      m("leads", "/app/crm/leads", "Filter", "العملاء المحتملون", "Leads", "استقبال وتأهيل العملاء من الموقع وواتساب والإعلانات", "Capture and qualify leads from web, WhatsApp and ads", 2, true, "crm.leads.view"),
      m("opportunities", "/app/crm/opportunities", "Target", "الفرص", "Opportunities", "الفرص البيعية وقيمتها ومرحلتها", "Deals, value and stage", 2, true, "crm.opportunities.view"),
      m("pipeline", "/app/crm/pipeline", "Columns", "خط المبيعات", "Pipeline", "لوحة كانبان للفرص حسب المرحلة", "Kanban of opportunities by stage", 2, true, "crm.pipeline.view"),
      m("follow-ups", "/app/crm/follow-ups", "CalendarClock", "المتابعات", "Follow-ups", "المتابعات المتأخرة واليوم والقادمة", "Overdue, today and upcoming follow-ups", 2, true, "crm.leads.view"),
      m("clients", "/app/crm/clients", "Building2", "العملاء", "Clients", "ملف العميل الشامل 360°", "360° client view", 2, true, "crm.clients.view"),
      m("contacts", "/app/crm/contacts", "Users", "جهات الاتصال", "Contacts", "الأشخاص لدى العملاء", "People at each client", 2, true, "crm.contacts.view"),
      m("quotations", "/app/sales/quotations", "FileText", "عروض الأسعار", "Quotations", "عروض الأسعار مع الضريبة والموافقات والإصدارات وملف PDF", "Quotations with VAT, approvals, versions and PDF", 3, true, "sales.quotations.view"),
      m("contracts", "/app/sales/contracts", "Handshake", "العقود", "Contracts", "العقود المنبثقة من عروض الأسعار المقبولة ومراحلها", "Contracts from accepted quotations and their milestones", 3, true, "sales.contracts.view")
    ]
  },
  {
    key: "delivery",
    label: { ar: "التنفيذ", en: "Delivery" },
    items: [
      m("projects", "/app/projects", "Layers", "المشاريع", "Projects", "المشاريع والمراحل والمهام ومؤشر صحة المشروع", "Projects, milestones, tasks and health", 4, true, "projects.view"),
      m("timesheets", "/app/timesheets", "Timer", "سجلات الوقت", "Timesheets", "تسجيل الوقت والاعتماد", "Time entries and approvals", 4, true, "projects.time.create"),
      m("project-templates", "/app/projects/templates", "Blocks", "قوالب المشاريع", "Project templates", "مراحل ومهام افتراضية لكل خدمة", "Default milestones and tasks per service", 4, true, "projects.templates.manage"),
      planned("tickets", "LifeBuoy", "تذاكر الدعم", "Support Tickets", "الدعم الفني مع مستويات الخدمة SLA", "Support with SLAs", 7, "support.tickets.view")
    ]
  },
  {
    key: "services",
    label: { ar: "الخدمات", en: "Services" },
    items: [
      m("catalog", "/app/sales/services", "Package", "كتالوج الخدمات", "Service Catalog", "الخدمات والباقات ونماذج التسعير", "Services, packages and pricing models", 3, true, "services.view"),
      planned("subscriptions", "CalendarClock", "الاشتراكات", "Subscriptions", "الاشتراكات الشهرية والسنوية والفوترة المتكررة", "Monthly/annual subscriptions and recurring billing", 8, "finance.invoices.view"),
      // external DMS Tech product — the OS only links to it (docs/NOVA-INTEGRATION.md)
      m("nova", "/app/nova", "Sparkles", "NOVA AI", "NOVA AI", "منصة DMS Tech المستقلة للذكاء الاصطناعي — تُفتح كنظام خارجي متكامل", "DMS Tech's separate AI platform — opened as an integrated external system", 2, true, "nova.use")
    ]
  },
  {
    key: "finance",
    label: { ar: "المالية", en: "Finance" },
    items: [
      m("finance", "/app/finance", "ChartColumn", "النظرة المالية", "Finance overview", "الفوترة والتحصيل والذمم والمصروفات", "Billing, collection, receivables and spending", 5, true, "finance.dashboard.view"),
      m("invoices", "/app/finance/invoices", "FileText", "الفواتير", "Invoices", "الفواتير الضريبية من العقود والمراحل والمشاريع والوقت", "VAT invoices from contracts, milestones, projects and time", 5, true, "finance.invoices.view"),
      m("receivables", "/app/finance/receivables", "CalendarClock", "الذمم المدينة", "Receivables", "أعمار الذمم والتحصيل والمتابعة", "Aging, collection and follow-ups", 5, true, "finance.invoices.view"),
      m("payments", "/app/finance/payments", "CreditCard", "المدفوعات", "Payments", "تسجيل المدفوعات وتوزيعها على الفواتير", "Record payments and allocate them to invoices", 5, true, "finance.payments.view"),
      m("expenses", "/app/finance/expenses", "ShoppingBag", "المصروفات", "Expenses", "المصروفات مع دورة الموافقات والصرف", "Expenses with approval and payment", 5, true, "finance.expenses.create"),
      m("vendors", "/app/finance/vendors", "Handshake", "الموردون", "Vendors", "سجل الموردين", "Vendor directory", 5, true, "finance.vendors.view"),
      m("finance-reports", "/app/finance/reports", "TrendingUp", "التقارير المالية", "Financial Reports", "الفوترة والتحصيل والمصروفات وربحية المشاريع (تشغيلية)", "Billing, collection, spending and project profitability (operational)", 5, true, "finance.reports.view"),
      m("finance-setup", "/app/finance/setup", "SlidersHorizontal", "إعدادات المالية", "Finance setup", "تصنيفات المصروفات وتكلفة الساعة", "Expense categories and hourly cost rates", 5, true, "finance.vendors.manage"),
      planned("payroll", "Briefcase", "الرواتب", "Payroll", "مسيرات الرواتب بصلاحيات مشددة", "Payroll runs with strict permissions", 6, "finance.payroll.view")
    ]
  },
  {
    key: "people",
    label: { ar: "الموظفون", en: "People" },
    items: [
      planned("employees", "Users", "الموظفون", "Employees", "ملفات الموظفين والمستندات", "Employee profiles and documents", 6, "hr.employees.view"),
      planned("leave", "Calendar", "الإجازات", "Leave", "طلبات الإجازة والموافقات", "Leave requests and approvals", 6, "hr.leave.request"),
      planned("recruitment", "GraduationCap", "التوظيف", "Recruitment", "نظام تتبع المتقدمين والمقابلات", "Applicant tracking and interviews", 6, "hr.recruitment.manage")
    ]
  },
  {
    key: "growth",
    label: { ar: "التسويق والتشغيل", en: "Marketing & Ops" },
    items: [
      planned("campaigns", "Megaphone", "الحملات", "Campaigns", "الحملات والعائد على الإنفاق", "Campaigns and ROI", 8, "marketing.campaigns.manage"),
      planned("whatsapp", "MessagesSquare", "مركز واتساب", "WhatsApp Center", "واتساب للأعمال عبر الواجهة الرسمية", "Official WhatsApp Business Platform", 8, "marketing.whatsapp.send"),
      planned("procurement", "Handshake", "المشتريات", "Procurement", "أوامر الشراء ودورة المشتريات (الموردون متاحون في المالية)", "Purchase orders and procurement (vendors live in Finance)", 7, "ops.procurement.manage"),
      planned("documents", "FileSearch", "المستندات", "Documents", "مركز المستندات بالصلاحيات", "Permissioned document center", 7, "ops.documents.manage")
    ]
  },
  {
    key: "admin",
    label: { ar: "الإدارة", en: "Administration" },
    items: [
      m("users", "/app/admin/users", "Users", "المستخدمون", "Users", "الحسابات والأدوار والجلسات", "Accounts, roles and sessions", 1, true, "admin.users.view"),
      m("roles", "/app/admin/roles", "ShieldCheck", "الأدوار والصلاحيات", "Roles & Permissions", "مصفوفة الصلاحيات", "Permission matrix", 1, true, "admin.roles.view"),
      m("departments", "/app/admin/departments", "Network", "الأقسام", "Departments", "الهيكل التنظيمي", "Organization structure", 1, true, "admin.departments.manage"),
      m("settings", "/app/admin/settings", "Settings", "إعدادات الشركة", "Company Settings", "بيانات الشركة والضريبة وحدود الموافقات", "Company data, VAT and approval limits", 1, true, "admin.settings.manage"),
      m("audit", "/app/admin/audit", "FileSearch", "سجل التدقيق", "Audit Log", "سجل غير قابل للتعديل لكل العمليات الحساسة", "Immutable record of sensitive actions", 1, true, "admin.audit.view"),
      planned("integrations", "Plug", "التكاملات", "Integrations", "واتساب وجوجل ومنصات المتاجر والدفع", "WhatsApp, Google, store platforms, payments", 8, "admin.integrations.manage"),
      planned("automation", "Workflow", "قواعد الأعمال", "Business Rules", "قواعد تشغيلية محددة (غير ذكاء اصطناعي): حدث ← شروط ← إجراء. سير العمل والأتمتة بالذكاء الاصطناعي في منصة NOVA", "Deterministic (non-AI) business rules: trigger → conditions → action. AI workflows/automation live in NOVA", 9, "admin.automation.manage")
    ]
  }
];

export const ALL_MODULES = NAV.flatMap((g) => g.items);
export const findModule = (key: string) => ALL_MODULES.find((x) => x.key === key);

/** "+ Create" menu. Items whose module is not live are listed as planned. */
export const CREATE_ITEMS: { key: string; icon: IconName; label: { ar: string; en: string }; href?: string; module: string; permission?: Permission }[] = [
  { key: "lead", icon: "Filter", label: { ar: "عميل محتمل", en: "Lead" }, href: "/app/crm/leads?new=1", module: "leads", permission: "crm.leads.create" },
  { key: "client", icon: "Building2", label: { ar: "عميل", en: "Client" }, href: "/app/crm/clients?new=1", module: "clients", permission: "crm.clients.create" },
  { key: "contact", icon: "Users", label: { ar: "جهة اتصال", en: "Contact" }, href: "/app/crm/contacts?new=1", module: "contacts", permission: "crm.contacts.create" },
  { key: "opportunity", icon: "Target", label: { ar: "فرصة", en: "Opportunity" }, href: "/app/crm/opportunities?new=1", module: "opportunities", permission: "crm.opportunities.create" },
  { key: "quotation", icon: "FileText", label: { ar: "عرض سعر", en: "Quotation" }, href: "/app/sales/quotations/new", module: "quotations", permission: "sales.quotations.create" },
  { key: "service", icon: "Package", label: { ar: "خدمة", en: "Service" }, href: "/app/sales/services?new=1", module: "catalog", permission: "services.manage" },
  { key: "invoice", icon: "FileText", label: { ar: "فاتورة", en: "Invoice" }, href: "/app/finance/invoices/new", module: "invoices", permission: "finance.invoices.create" },
  { key: "payment", icon: "CreditCard", label: { ar: "دفعة", en: "Payment" }, href: "/app/finance/payments?new=1", module: "payments", permission: "finance.payments.create" },
  { key: "project", icon: "Layers", label: { ar: "مشروع", en: "Project" }, href: "/app/projects/new", module: "projects", permission: "projects.create" },
  { key: "task", icon: "CircleCheck", label: { ar: "مهمة", en: "Task" }, href: "/app/my-work?new=task", module: "my-work", permission: "projects.tasks.create" },
  { key: "milestone", icon: "Target", label: { ar: "مرحلة", en: "Milestone" }, href: "/app/projects?new=milestone", module: "projects", permission: "projects.milestones.manage" },
  { key: "expense", icon: "ShoppingBag", label: { ar: "مصروف", en: "Expense" }, href: "/app/finance/expenses?new=1", module: "expenses", permission: "finance.expenses.create" },
  { key: "vendor", icon: "Handshake", label: { ar: "مورد", en: "Vendor" }, href: "/app/finance/vendors?new=1", module: "vendors", permission: "finance.vendors.manage" },
  { key: "employee", icon: "Users", label: { ar: "موظف", en: "Employee" }, module: "employees" },
  { key: "candidate", icon: "GraduationCap", label: { ar: "مرشح", en: "Candidate" }, module: "recruitment" },
  { key: "user", icon: "Users", label: { ar: "مستخدم", en: "User" }, href: "/app/admin/users?new=1", module: "users", permission: "admin.users.manage" },
  { key: "department", icon: "Network", label: { ar: "قسم", en: "Department" }, href: "/app/admin/departments?new=1", module: "departments", permission: "admin.departments.manage" }
];
