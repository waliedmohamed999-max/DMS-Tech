/**
 * DEVELOPMENT / DEMO SEED — refuses to run in production.
 *
 * Creates the DMS Tech organization, departments and one demo user per role, then
 * exercises the real services (no direct inserts of approvals/activity) so the data
 * reflects genuine workflows: a delegated admin creates a Finance Manager, which
 * raises a ROLE_GRANT approval for the Super Admin.
 *
 * All demo users share the password printed at the end. Demo emails use the
 * reserved `.test` TLD so they can never collide with real accounts.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { ensureOrganization, ensureSuperAdmin } from "../src/server/bootstrap";
import { hashPassword } from "../src/server/auth/password";
import { registerSubscribers } from "../src/server/events/subscribers";
import { createUser } from "../src/server/admin/users";
import { saveDepartment, setRolePermissions, createRole } from "../src/server/admin/org";
import type { Ctx } from "../src/server/context";
import { isPermission } from "../src/server/rbac/permissions";
import { createLead, qualifyLead, convertLead, markLeadLost, setLeadFollowUp } from "../src/server/crm/leads";
import { moveOpportunityStage, markOpportunityWon, markOpportunityLost } from "../src/server/crm/opportunities";
import { createClient, createContact } from "../src/server/crm/clients";
import { logActivity, addNote } from "../src/server/crm/activities";
import { getDefaultPipeline } from "../src/server/crm/pipeline";
import { captureWebsiteLead } from "../src/server/crm/website";
import { createPackage, updateService } from "../src/server/commercial/catalog";
import { acceptQuotation, createQuotation, markQuotationSent, submitQuotation } from "../src/server/commercial/quotations";
import { activateContract, createContractFromQuotation, sendContractForSignature, updateContract } from "../src/server/commercial/contracts";
import { addDays } from "../src/server/commercial/dates";
import { addProjectMember, changeProjectStatus, createProject } from "../src/server/projects/projects";
import { assignTask, changeTaskStatus } from "../src/server/projects/work";
import { createTimeEntry, submitTimesheet } from "../src/server/projects/time";
import { createDeliverable, createDependency } from "../src/server/projects/delivery";
import { billingCandidates, createInvoiceFromSource } from "../src/server/finance/eligibility";
import { issueInvoice, markInvoiceSent } from "../src/server/finance/invoices";
import { recordPayment } from "../src/server/finance/payments";
import { createExpense, createVendor, submitExpense } from "../src/server/finance/expenses";
import { setCostRate } from "../src/server/finance/costing";
import { decideApproval } from "../src/server/approvals/service";
import { createEmployee } from "../src/server/hr/employees";
import { addCompensation, setBankAccount } from "../src/server/hr/compensation";
import { grantOpeningBalances, saveLeaveType } from "../src/server/hr/leave";
import { createRequest } from "../src/server/ops/procurement";
import { createOrderFromRequest, issueOrder, receiveOrder, submitOrder } from "../src/server/ops/orders";
import { updateVendorOps, addVendorContact } from "../src/server/ops/vendors";
import { assignAsset, createAssetFromPoItem } from "../src/server/ops/assets";
import { addTicketComment, createTicket } from "../src/server/ops/support";
import { createArticle, publishArticle, submitArticleForReview } from "../src/server/ops/knowledge";

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "1") {
  console.error("✖ Demo seed refused: set ALLOW_DEMO_SEED=1 on a non-production machine.");
  process.exit(1);
}

const DEMO_PASSWORD = "DmsDemo2026!";

async function ctxFor(userId: string): Promise<Ctx> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: { include: { permissions: true } } } } }
  });
  const perms = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)).filter(isPermission));
  return { organizationId: u.organizationId, userId: u.id, userName: u.name, roleKeys: u.roles.map((r) => r.role.key), permissions: perms, meta: { ip: "seed", userAgent: "seed" } };
}

async function main() {
  registerSubscribers();
  await import("../src/server/admin/users"); // approval handler

  const org = await ensureOrganization({ slug: "dms-tech", name: "DMS Tech", nameAr: "دي إم إس تك" });
  await prisma.organization.update({
    where: { id: org.id },
    data: { legalName: "DMS Tech", email: "Info@dms1t.com", phone: "+966509095816", city: "Riyadh" }
  });

  const admin = await ensureSuperAdmin(org.id, { email: "admin@dms.test", name: "System Admin", password: DEMO_PASSWORD });
  const adminCtx = await ctxFor(admin.id);

  // departments via the real service (audited)
  const depts: Record<string, string> = {};
  for (const [code, name, nameAr] of [
    ["MGMT", "Management", "الإدارة العليا"],
    ["SALES", "Sales", "المبيعات"],
    ["DELIV", "Delivery", "التنفيذ والتطوير"],
    ["DESIGN", "Design", "التصميم"],
    ["MKT", "Marketing", "التسويق"],
    ["FIN", "Finance", "المالية"],
    ["HR", "People", "الموارد البشرية"]
  ] as const) {
    const existing = await prisma.department.findFirst({ where: { organizationId: org.id, code } });
    depts[code] = existing?.id ?? (await saveDepartment(adminCtx, { code, name, nameAr })).id;
  }

  const roleId = async (key: string) => (await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key } } })).id;

  // one demo user per non-privileged role, created by the super admin through the service
  const people: [string, string, string, string, string, string][] = [
    ["ceo@dms.test", "Waleed Aboelezz", "وليد أبو العز", "Chief Executive Officer", "MGMT", "ceo"],
    ["gm@dms.test", "Sara Alqahtani", "سارة القحطاني", "General Manager", "MGMT", "general_manager"],
    ["sales.manager@dms.test", "Omar Alharbi", "عمر الحربي", "Sales Manager", "SALES", "sales_manager"],
    ["sales@dms.test", "Ahmed Alotaibi", "أحمد العتيبي", "Account Executive", "SALES", "sales_rep"],
    ["pm@dms.test", "Noura Alshehri", "نورة الشهري", "Project Manager", "DELIV", "project_manager"],
    ["dev@dms.test", "Khaled Mansour", "خالد منصور", "Full-Stack Developer", "DELIV", "developer"],
    ["design@dms.test", "Lina Haddad", "لينا حداد", "UX/UI Designer", "DESIGN", "designer"],
    ["marketing@dms.test", "Faisal Alzahrani", "فيصل الزهراني", "Marketing Specialist", "MKT", "marketing"],
    ["accountant@dms.test", "Mona Saleh", "منى صالح", "Accountant", "FIN", "accountant"],
    ["hr@dms.test", "Reem Aldosari", "ريم الدوسري", "HR Manager", "HR", "hr_manager"],
    ["employee@dms.test", "Yousef Ali", "يوسف علي", "Support Specialist", "DELIV", "employee"],
    ["ops@dms.test", "Tamer Fouad", "تامر فؤاد", "Operations Manager", "MGMT", "operations_manager"],
    ["support@dms.test", "Huda Salem", "هدى سالم", "Support Engineer", "DELIV", "support_agent"]
  ];
  const pwHash = await hashPassword(DEMO_PASSWORD);
  for (const [email, name, nameAr, jobTitle, dept, role] of people) {
    if (await prisma.user.findFirst({ where: { organizationId: org.id, email } })) continue;
    const { id } = await createUser(adminCtx, { email, name, nameAr, jobTitle, departmentId: depts[dept], roleIds: [await roleId(role)] });
    // demo convenience: known password, no forced change
    await prisma.user.update({ where: { id }, data: { passwordHash: pwHash, mustChangePassword: false } });
  }

  // delegated IT admin: can manage users but NOT grant privileged roles
  let itRole = await prisma.role.findFirst({ where: { organizationId: org.id, key: "it_admin" } });
  if (!itRole) {
    itRole = await createRole(adminCtx, { key: "it_admin", name: "IT Administrator", nameAr: "مسؤول تقنية المعلومات", description: "Manages accounts; privileged roles need approval" });
    await setRolePermissions(adminCtx, itRole.id, ["dashboard.view", "approvals.view", "admin.users.view", "admin.users.manage", "admin.roles.view", "admin.departments.manage", "admin.audit.view"]);
  }
  let it = await prisma.user.findFirst({ where: { organizationId: org.id, email: "it@dms.test" } });
  if (!it) {
    const { id } = await createUser(adminCtx, { email: "it@dms.test", name: "Hassan Kamal", nameAr: "حسن كمال", jobTitle: "IT Administrator", departmentId: depts.MGMT, roleIds: [itRole.id] });
    await prisma.user.update({ where: { id }, data: { passwordHash: pwHash, mustChangePassword: false } });
    it = await prisma.user.findUniqueOrThrow({ where: { id } });
  }

  // the IT admin hires a finance manager → privileged role becomes a pending approval for the super admin
  if (!(await prisma.user.findFirst({ where: { organizationId: org.id, email: "finance@dms.test" } }))) {
    const itCtx = await ctxFor(it.id);
    const { id } = await createUser(itCtx, {
      email: "finance@dms.test",
      name: "Abdullah Alqarni",
      nameAr: "عبدالله القرني",
      jobTitle: "Finance Manager",
      departmentId: depts.FIN,
      roleIds: [await roleId("employee"), await roleId("finance_manager")]
    });
    await prisma.user.update({ where: { id }, data: { passwordHash: pwHash, mustChangePassword: false } });
  }

  await seedCrm(org.id);
  await seedCommercial(org.id);
  await seedProjects(org.id);
  await seedFinance(org.id);
  await seedHr(org.id);
  await seedOps(org.id);

  console.log("✔ demo data ready");
  console.log(`  sign in at /app/login with admin@dms.test (or any *@dms.test user) / ${DEMO_PASSWORD}`);
}

/**
 * Phase 2 demo CRM data — created through the real services (audit, domain events,
 * system activities, sequences all genuine). Idempotent: skipped once the marker lead exists.
 */
async function seedCrm(orgId: string) {
  if (await prisma.lead.findFirst({ where: { organizationId: orgId, emailNormalized: "nawaf@alnakheel.test" } })) {
    console.log("• CRM demo data already present — skipped");
    return;
  }
  const userId = async (email: string) => (await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } })).id;
  const mgrId = await userId("sales.manager@dms.test");
  const repId = await userId("sales@dms.test");
  const mgr = await ctxFor(mgrId);
  const rep = await ctxFor(repId);
  const day = 86400000;
  const at = (d: number, h = 10) => new Date(new Date(Date.now() + d * day).setHours(h, 0, 0, 0));
  const stages = (await getDefaultPipeline(prisma, orgId)).stages;
  const stage = (key: string) => stages.find((s) => s.key === key)!.id;

  // leads still being worked
  const l1 = await createLead(rep, { name: "Nawaf Alsubaie", companyName: "Alnakheel Trading", email: "nawaf@alnakheel.test", phone: "+966500000101", source: "REFERRAL", interestedService: "ai-automation", budgetMin: "30000", budgetMax: "60000", priority: "HIGH", city: "Riyadh", nextFollowUpAt: at(-2) });
  await logActivity(rep, { entityType: "LEAD", entityId: l1.id, type: "CALL", title: "Intro call — wants WhatsApp + CRM automation" });
  await createLead(rep, { name: "Huda Alghamdi", email: "huda@bloomstore.test", whatsapp: "+966500000102", source: "INSTAGRAM", interestedService: "ecommerce", budgetMax: "25000", nextFollowUpAt: at(0, 15) });
  await createLead(mgr, { name: "Majed Alrashid", companyName: "Rawabi Clinics", phone: "+966500000103", source: "LINKEDIN", interestedService: "app-development", budgetMin: "80000", budgetMax: "150000", priority: "HIGH", ownerId: mgrId, nextFollowUpAt: at(3) });
  await createLead(mgr, { name: "Ali Alyami", email: "ali@yami-logistics.test", source: "GOOGLE_ADS", interestedService: "systems-integration", ownerId: repId, nextFollowUpAt: at(1) });
  const lost = await createLead(rep, { name: "Turki Almutairi", phone: "+966500000105", source: "PHONE", interestedService: "web-development", budgetMax: "5000" });
  await markLeadLost(rep, lost.id, "Budget far below minimum scope");

  // qualified → converted into client + contact + opportunity, then advanced along the pipeline
  const deals: { name: string; company: string; email: string; service: string; value: string; to?: string; outcome?: "won" | "lost"; owner: typeof rep }[] = [
    { name: "Abdulrahman Alsaud", company: "Masar Real Estate", email: "abdulrahman@masar.test", service: "digital-transformation", value: "185000", to: "negotiation", owner: mgr },
    { name: "Reem Alfaisal", company: "Lumen Academy", email: "reem@lumen.test", service: "web-development", value: "42000", to: "proposal", owner: rep },
    { name: "Saad Alqahtani", company: "Qimma Foods", email: "saad@qimma.test", service: "whatsapp-automation", value: "28000", to: "discovery", owner: rep },
    { name: "Dana Alharthy", company: "Sahab Cloud", email: "dana@sahab.test", service: "nova-ai", value: "96000", outcome: "won", owner: mgr },
    { name: "Fahad Alomari", company: "Ward Florist", email: "fahad@ward.test", service: "ecommerce", value: "18000", outcome: "lost", owner: rep },
    { name: "Nora Albassam", company: "Tamkeen HR", email: "nora@tamkeen.test", service: "custom-software", value: "64000", owner: rep }
  ];
  for (const d of deals) {
    const lead = await createLead(d.owner, { name: d.name, companyName: d.company, email: d.email, source: d === deals[0] ? "PARTNER" : "WEBSITE", interestedService: d.service, budgetMax: d.value });
    await qualifyLead(d.owner, lead.id);
    const { opportunityId, clientId } = await convertLead(d.owner, { leadId: lead.id, clientMode: "new", contactMode: "new", estimatedValue: d.value, expectedCloseDate: at(30) });
    if (d.to) await moveOpportunityStage(d.owner, { id: opportunityId, stageId: stage(d.to) });
    if (d.outcome === "won") await markOpportunityWon(mgr, opportunityId);
    if (d.outcome === "lost") await markOpportunityLost(rep, opportunityId, "Chose a cheaper template-based provider");
    if (!d.outcome) await prisma.opportunity.update({ where: { id: opportunityId }, data: { nextFollowUpAt: d === deals[1] ? at(-1) : at(4) } }); // demo dates
    if (d === deals[0]) {
      await logActivity(mgr, { entityType: "OPPORTUNITY", entityId: opportunityId, type: "MEETING", title: "Steering meeting with COO — scope agreed" });
      await addNote(mgr, { entityType: "CLIENT", entityId: clientId, body: "Decision maker is the COO; procurement needs a formal quotation (Phase 3)." });
      await createContact(mgr, { clientId, firstName: "Khalid", lastName: "Alanazi", jobTitle: "Procurement Lead", email: "khalid@masar.test" });
    }
  }

  // a client added directly (no lead)
  await createClient(mgr, { type: "COMPANY", displayName: "Riyadh Health Cluster", email: "it@rhc.test", city: "Riyadh", source: "GOVERNMENT_OPPORTUNITY", ownerId: mgrId });

  // follow-up on the first lead pushed through the service
  await setLeadFollowUp(rep, l1.id, at(-2));

  // public website submission through the same path as /api/leads
  await captureWebsiteLead(
    { name: "Mohammed Alzahrani", phone: "0500000199", email: "mohammed@nahda.test", company: "Nahda Schools", service: "app-development", budget: "30k-100k", message: "We need a parent app with WhatsApp notifications.", source: "quote", locale: "ar", page: "/ar/contact", elapsed: 42000 },
    { ip: "seed", userAgent: "seed" }
  );
  console.log("✔ CRM demo data created");
}

/**
 * Phase 3 demo data — catalog prices, a package and quotations in every important state,
 * all through the real services (approval engine, versioning, PDFs, audit, events).
 * Idempotent: skipped once any quotation exists. Demo prices are for local demos only.
 */
async function seedCommercial(orgId: string) {
  if (await prisma.quotation.count({ where: { organizationId: orgId } })) {
    console.log("• commercial demo data already present — skipped");
    return;
  }
  const uid = async (email: string) => (await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } })).id;
  const mgr = await ctxFor(await uid("sales.manager@dms.test"));
  const rep = await ctxFor(await uid("sales@dms.test"));
  const svc = async (key: string) => prisma.service.findFirstOrThrow({ where: { organizationId: orgId, key } });

  const prices: [string, "FIXED" | "MONTHLY" | "HOURLY", string, string, string][] = [
    ["web-development", "FIXED", "25000", "تصميم وتطوير موقع متجاوب بلوحة تحكم، متوافق مع محركات البحث، مع التدريب.", "Responsive website with CMS, SEO-ready, including training."],
    ["ecommerce", "FIXED", "35000", "متجر إلكتروني متكامل مع ربط بوابات الدفع والشحن.", "Complete online store with payment and shipping integrations."],
    ["app-development", "FIXED", "80000", "تطبيق جوال iOS و Android مع لوحة إدارة.", "iOS and Android app with an admin panel."],
    ["ux-ui-design", "FIXED", "12000", "بحث المستخدم، رحلة المستخدم، وتصميم الواجهات.", "User research, journeys and interface design."],
    ["whatsapp-automation", "MONTHLY", "1500", "رسائل وردود آلية عبر واجهة واتساب الرسمية.", "Automated messages and replies via the official WhatsApp API."],
    ["support-maintenance", "MONTHLY", "2500", "دعم فني وصيانة شهرية مع مستوى خدمة.", "Monthly support and maintenance with an SLA."],
    ["consulting", "HOURLY", "450", "ساعات استشارية تقنية.", "Technology consulting hours."],
    ["ai-automation", "FIXED", "40000", "أتمتة العمليات بالذكاء الاصطناعي.", "AI-driven process automation."]
  ];
  for (const [key, pricingModel, basePrice, ar, en] of prices) {
    const s = await svc(key);
    if (s.basePrice.isZero()) await updateService(mgr, { id: s.id, pricingModel, basePrice, quotationDescriptionAr: ar, quotationDescriptionEn: en });
  }
  await createPackage(mgr, {
    nameAr: "باقة إطلاق المتجر الإلكتروني",
    nameEn: "E-Commerce Launch Package",
    descriptionAr: "كل ما يحتاجه المتجر للانطلاق.",
    descriptionEn: "Everything a store needs to launch.",
    defaultPrice: "42000",
    items: [
      { serviceId: (await svc("ecommerce")).id, quantity: 1 },
      { serviceId: (await svc("ux-ui-design")).id, quantity: 1 },
      { serviceId: (await svc("whatsapp-automation")).id, quantity: 3, optional: true }
    ]
  });

  const opp = async (client: string) =>
    prisma.opportunity.findFirstOrThrow({ where: { organizationId: orgId, client: { displayName: client } }, include: { client: true } });
  const line = async (key: string, ar: "ar" | "en", extra: Record<string, string> = {}) => {
    const s = await svc(key);
    return { serviceId: s.id, name: ar === "ar" ? s.nameAr : s.nameEn, description: (ar === "ar" ? s.quotationDescriptionAr : s.quotationDescriptionEn) ?? "", quantity: "1", unitPrice: s.basePrice.toFixed(2), ...extra };
  };
  const terms = "الأسعار غير شاملة لأي رسوم طرف ثالث. تبدأ مدة التنفيذ من تاريخ استلام الدفعة الأولى.";

  // 1. Lumen Academy — within policy → auto-approved → sent
  const lumen = await opp("Lumen Academy");
  const q1 = await createQuotation(rep, { clientId: lumen.clientId, opportunityId: lumen.id, language: "ar", items: [await line("web-development", "ar", { discountType: "PERCENT", discountValue: "5" }), await line("support-maintenance", "ar", { quantity: "6", unit: "شهر" })], paymentTerms: "50% عند التوقيع، 50% عند التسليم", deliveryTerms: "6 أسابيع من تاريخ الدفعة الأولى", termsAndConditions: terms, clientMessage: "يسعدنا تقديم عرضنا لموقع أكاديمية لومن." });
  await submitQuotation(rep, q1.id);
  await markQuotationSent(rep, q1.id, { method: "EMAIL_MANUAL", note: "Sent to reem@lumen.test", confirm: true });

  // 2. Qimma Foods — 25 % discount → pending manager approval
  const qimma = await opp("Qimma Foods");
  const q2 = await createQuotation(rep, { clientId: qimma.clientId, opportunityId: qimma.id, language: "ar", items: [await line("whatsapp-automation", "ar", { quantity: "12", unit: "شهر", discountType: "PERCENT", discountValue: "25" })], paymentTerms: "دفع شهري مقدّم", termsAndConditions: terms });
  await submitQuotation(rep, q2.id);

  // 3. Masar Real Estate — high value → pending approval (manager is the requester, so others approve)
  const masar = await opp("Masar Real Estate");
  const q3 = await createQuotation(mgr, { clientId: masar.clientId, opportunityId: masar.id, language: "en", items: [{ serviceId: (await svc("digital-transformation")).id, name: "Digital Transformation programme", description: "Assessment, roadmap and implementation of core workflows.", quantity: "1", unitPrice: "150000" }, await line("consulting", "en", { quantity: "40", unit: "hour" })], paymentTerms: "30% / 40% / 30% by milestone", deliveryTerms: "16 weeks", termsAndConditions: "Prices exclude third-party licences." });
  await submitQuotation(mgr, q3.id);

  // 4. Sahab Cloud — accepted → contract activated (the deal was already won in the CRM seed)
  const sahab = await opp("Sahab Cloud");
  const q4 = await createQuotation(mgr, { clientId: sahab.clientId, opportunityId: sahab.id, language: "ar", items: [{ serviceId: (await svc("nova-ai")).id, name: "NOVA AI — اشتراك سنوي", description: "تفعيل منصة NOVA AI الخارجية واشتراك سنوي.", quantity: "1", unitPrice: "40000" }], paymentTerms: "سنوي مقدّم", termsAndConditions: terms });
  await submitQuotation(mgr, q4.id);
  await markQuotationSent(mgr, q4.id, { method: "IN_PERSON", confirm: true });
  const v4 = await prisma.quotationVersion.findFirstOrThrow({ where: { quotationId: q4.id } });
  await acceptQuotation(mgr, q4.id, { versionId: v4.id, confirm: true, note: "PO-7781", markOpportunityWon: false });
  const c4 = await createContractFromQuotation(mgr, q4.id);
  const start = new Date();
  await updateContract(mgr, c4.id, {
    title: "اشتراك NOVA AI — سحاب كلاود",
    startDate: start.toISOString().slice(0, 10),
    endDate: addDays(start, 365).toISOString().slice(0, 10),
    milestones: [{ title: "التفعيل والتهيئة", percentage: 100, dueDate: addDays(start, 14).toISOString().slice(0, 10) }]
  });
  await sendContractForSignature(mgr, c4.id);
  await activateContract(mgr, c4.id, { signedAt: start.toISOString().slice(0, 10), confirm: true });

  // 5. Tamkeen HR — draft
  const tamkeen = await opp("Tamkeen HR");
  await createQuotation(rep, { clientId: tamkeen.clientId, opportunityId: tamkeen.id, language: "ar", items: [await line("ux-ui-design", "ar"), { name: "تكامل مع نظام الموارد البشرية الحالي", quantity: "1", unitPrice: "18000" }] });
  console.log("✔ commercial demo data created");
}

/**
 * Phase 4 demo delivery — a project built through the real services from its own contract
 * (Lumen Academy). CTR for Sahab Cloud is deliberately left without a project so the
 * "create project from contract" flow can be tried by hand.
 */
async function seedProjects(orgId: string) {
  if (await prisma.project.count({ where: { organizationId: orgId } })) {
    console.log("• project demo data already present — skipped");
    return;
  }
  const uid = async (email: string) => (await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } })).id;
  const mgr = await ctxFor(await uid("sales.manager@dms.test"));
  const q1 = await prisma.quotation.findFirst({ where: { organizationId: orgId, client: { displayName: "Lumen Academy" }, status: "SENT" }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } });
  if (!q1) {
    console.log("• Lumen Academy quotation is no longer SENT — project demo skipped");
    return;
  }
  // commercial hand-off: accepted → contract → active (Phase 3 services)
  await acceptQuotation(mgr, q1.id, { versionId: q1.versions[0].id, confirm: true, note: "Signed PDF received by email", markOpportunityWon: true });
  const c = await createContractFromQuotation(mgr, q1.id);
  const start = addDays(new Date(), -21);
  const d = (n: number) => addDays(start, n).toISOString().slice(0, 10);
  await updateContract(mgr, c.id, {
    title: "موقع أكاديمية لومن",
    startDate: d(0),
    endDate: d(180),
    milestones: [
      { title: "الدفعة الأولى — التوقيع", percentage: 50, dueDate: d(0) },
      { title: "الدفعة الثانية — الإطلاق", percentage: 50, dueDate: d(42) }
    ]
  });
  await sendContractForSignature(mgr, c.id);
  await activateContract(mgr, c.id, { signedAt: d(0), confirm: true });

  // delivery: the PM creates the project from the active contract with the service template
  const pmId = await uid("pm@dms.test");
  const devId = await uid("dev@dms.test");
  const designId = await uid("design@dms.test");
  const pm = await ctxFor(pmId);
  const dev = await ctxFor(devId);
  const design = await ctxFor(designId);
  const { id: projectId } = await createProject(pm, { source: "contract", contractId: c.id, milestoneSource: "template", startDate: d(0), targetEndDate: d(42), priority: "HIGH" });
  await addProjectMember(pm, projectId, { userId: devId, role: "DEVELOPER", allocationPercent: 60 });
  await addProjectMember(pm, projectId, { userId: designId, role: "DESIGNER", allocationPercent: 40 });
  await changeProjectStatus(pm, projectId, { to: "ACTIVE" });

  const tasks = await prisma.task.findMany({ where: { projectId }, orderBy: [{ milestone: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { milestone: true } });
  const first = tasks.filter((t) => t.milestone?.sortOrder === 0);
  const second = tasks.filter((t) => t.milestone?.sortOrder === 1);
  // discovery work is done, design is under way
  for (const t of first) {
    await assignTask(pm, t.id, designId);
    await changeTaskStatus(design, t.id, { to: "IN_PROGRESS" });
    await changeTaskStatus(design, t.id, { to: "DONE" });
  }
  if (second[0]) {
    await assignTask(pm, second[0].id, designId);
    await changeTaskStatus(design, second[0].id, { to: "IN_PROGRESS" });
  }
  if (second[1]) {
    await assignTask(pm, second[1].id, devId);
    await changeTaskStatus(dev, second[1].id, { to: "TODO" });
    await changeTaskStatus(dev, second[1].id, { to: "BLOCKED", reason: "بانتظار ملفات الهوية من العميل" });
  }
  for (const t of tasks.slice(first.length + 2, first.length + 5)) await assignTask(pm, t.id, devId);

  // time: the designer logged and submitted last week (approval routed to the PM)
  for (const [i, t] of first.entries()) await createTimeEntry(design, { projectId, taskId: t.id, date: d(2 + i), minutes: 180 + i * 30, description: "Workshop and research notes" });
  await submitTimesheet(design, projectId);
  if (second[0]) await createTimeEntry(design, { projectId, taskId: second[0].id, date: d(20), minutes: 240, description: "Homepage wireframes" });

  // what the client still owes, and the first deliverable
  await createDependency(pm, projectId, { title: "ملفات الهوية البصرية (الشعار والخطوط)", type: "BRAND_ASSETS", ownerSide: "CLIENT", critical: true, dueDate: d(18) });
  await createDependency(pm, projectId, { title: "محتوى صفحات البرامج", type: "CONTENT", ownerSide: "CLIENT", dueDate: d(30) });
  const ms = await prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  await createDeliverable(pm, projectId, { name: "تصاميم الواجهات (Figma)", milestoneId: ms[1]?.id ?? null, ownerId: designId, dueDate: d(28), clientApprovalRequired: true });
  console.log("✔ project demo data created");
}

/**
 * Phase 5 demo finance — through the real services: the Lumen contract's first milestone (due) is
 * invoiced, issued and half paid; a hosting vendor + an approved project expense; a cost rate for
 * the developer. Nothing is created automatically in the product — this only exercises the flows.
 */
async function seedFinance(orgId: string) {
  if (await prisma.invoice.count({ where: { organizationId: orgId } })) {
    console.log("• finance demo data already present — skipped");
    return;
  }
  const uid = async (email: string) => (await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } })).id;
  const acc = await ctxFor(await uid("accountant@dms.test"));
  const dev = await ctxFor(await uid("dev@dms.test"));
  // placeholder IBAN for the demo — real bank details are entered in Company Settings
  await prisma.organization.update({ where: { id: orgId }, data: { invoicePaymentInstructions: ["بنك الرياض — آيبان SA00 0000 0000 0000 0000 0000 — المستفيد: DMS Tech", "Riyad Bank — IBAN SA00 0000 0000 0000 0000 0000 — Beneficiary: DMS Tech"].join("\n") } });
  const milestone = (await billingCandidates(prisma, acc)).find((c) => c.type === "CONTRACT_MILESTONE" && c.eligible);
  if (milestone) {
    const { id } = await createInvoiceFromSource(acc, { type: "CONTRACT_MILESTONE", id: milestone.id });
    await issueInvoice(acc, id);
    await markInvoiceSent(acc, id, { method: "EMAIL_MANUAL", note: "Sent to finance@lumen.test", confirm: true });
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const half = inv.total.div(2).toFixed(2);
    await recordPayment(acc, { clientId: inv.clientId, amount: half, paymentDate: new Date().toISOString().slice(0, 10), method: "BANK_TRANSFER", reference: "TRX-48213", idempotencyKey: "seed-payment-0001", allocations: [{ invoiceId: id, amount: half }] });
  }
  const vendor = await createVendor(acc, { name: "Amazon Web Services", category: "Cloud", email: "billing@aws.test", paymentTerms: "Monthly card charge" });
  const project = await prisma.project.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const cloud = await prisma.expenseCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "cloud" } });
  const e = await createExpense(dev, { categoryId: cloud.id, vendorId: vendor.id, projectId: project?.id ?? null, date: new Date().toISOString().slice(0, 10), amount: "420", taxAmount: "63", description: "Staging server — Lumen website" });
  const s = await submitExpense(dev, e.id);
  await decideApproval(acc, { approvalId: s.approvalId, decision: "APPROVED" });
  const finance = await prisma.user.findFirst({ where: { organizationId: orgId, email: "ceo@dms.test" } });
  if (finance) await setCostRate(await ctxFor(finance.id), { userId: dev.userId, hourlyCost: "95", effectiveFrom: "2026-01-01" });
  console.log("✔ finance demo data created");
}

/**
 * Phase 6 demo people data through the real HR services: one employee record per demo user (linked to
 * the account), a reporting line, effective-dated compensation and a demo annual-leave balance.
 * Salaries are illustrative demo numbers. Skipped once any employee exists.
 */
async function seedHr(orgId: string) {
  if (await prisma.employee.count({ where: { organizationId: orgId } })) {
    console.log("• HR demo data already present — skipped");
    return;
  }
  const user = async (email: string) => prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } });
  const hr = await ctxFor((await user("hr@dms.test")).id);
  const ceo = await ctxFor((await user("ceo@dms.test")).id);
  // email, manager email, join date, base, housing, transport
  const plan: [string, string | null, string, number, number, number][] = [
    ["ceo@dms.test", null, "2023-01-01", 40000, 10000, 2000],
    ["gm@dms.test", "ceo@dms.test", "2023-03-01", 30000, 7500, 1500],
    ["finance@dms.test", "gm@dms.test", "2024-02-01", 22000, 5500, 1000],
    ["hr@dms.test", "gm@dms.test", "2024-01-15", 18000, 4500, 1000],
    ["sales.manager@dms.test", "gm@dms.test", "2023-06-01", 20000, 5000, 1000],
    ["pm@dms.test", "gm@dms.test", "2023-09-01", 19000, 4750, 1000],
    ["sales@dms.test", "sales.manager@dms.test", "2024-05-01", 11000, 2750, 800],
    ["dev@dms.test", "pm@dms.test", "2024-03-01", 15000, 3750, 800],
    ["design@dms.test", "pm@dms.test", "2024-08-01", 12000, 3000, 800],
    ["employee@dms.test", "pm@dms.test", "2025-01-05", 8000, 2000, 600],
    ["marketing@dms.test", "gm@dms.test", "2024-10-01", 10000, 2500, 600],
    ["accountant@dms.test", "finance@dms.test", "2024-04-01", 10500, 2625, 600]
  ];
  const ids: Record<string, string> = {};
  for (const [email, mgr, joinDate, base, housing, transport] of plan) {
    const u = await user(email);
    const [firstName, ...rest] = u.name.split(" ");
    const { id } = await createEmployee(hr, { userId: u.id, firstName, lastName: rest.join(" ") || "-", nameAr: u.nameAr, jobTitle: u.jobTitle, departmentId: u.departmentId, managerId: mgr ? ids[mgr] : null, joinDate, workEmail: u.email, city: "Riyadh" });
    ids[email] = id;
    // HR never records its own salary — the CEO does
    await addCompensation(email === "hr@dms.test" ? ceo : hr, id, { baseSalary: base, housingAllowance: housing, transportAllowance: transport, currency: "SAR", effectiveFrom: joinDate, notes: "Demo data" });
  }
  // documented example IBAN (not a real account)
  await setBankAccount(hr, ids["employee@dms.test"], { bankName: "Demo Bank", accountName: "Yousef Ali", iban: "SA0380000000608010167519", effectiveFrom: "2025-01-05" });
  // annual leave balance is a company setting — 21 days here is demo configuration, not a legal rule
  const annual = await prisma.leaveType.findFirst({ where: { organizationId: orgId, key: "annual" } });
  if (annual) await saveLeaveType(hr, { id: annual.id, nameAr: annual.nameAr, nameEn: annual.nameEn, paid: true, requiresApproval: true, requiresAttachment: false, defaultBalanceDays: 21, active: true });
  await grantOpeningBalances(hr, new Date().getUTCFullYear());
  console.log("✔ HR demo data created");
}

/**
 * Phase 7 demo operations data through the real services: an IT purchase request → approval → PO (approved by
 * finance) → issued → received → two registered laptops (one assigned), a client support ticket and a published
 * support article. Amounts are illustrative. Skipped once any procurement request exists.
 */
async function seedOps(orgId: string) {
  if (await prisma.procurementRequest.count({ where: { organizationId: orgId } })) {
    console.log("• operations demo data already present — skipped");
    return;
  }
  const c = async (email: string) => ctxFor((await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, email } })).id);
  const [ops, acc, fin, dev, support] = await Promise.all([c("ops@dms.test"), c("accountant@dms.test"), c("finance@dms.test"), c("dev@dms.test"), c("support@dms.test")]);
  const vendor = await createVendor(acc, { name: "Jarir Business Solutions", category: "IT hardware", email: "b2b@jarir.test", paymentTerms: "30 days" });
  await updateVendorOps(acc, vendor.id, { procurementCategory: "IT hardware", preferred: true, rating: 4, leadTimeDays: 5 });
  await addVendorContact(acc, vendor.id, { name: "Fahad Al-Qahtani", role: "Account manager", email: "fahad@jarir.test", phone: "+966500000201", isPrimary: true });
  const req = await createRequest(dev, { title: "Laptops for two new developers", businessJustification: "Two developers join the delivery team next month.", category: "IT", items: [{ description: "Lenovo ThinkPad T14 Gen 5", quantity: "2", estimatedUnitPrice: "5200", assetExpected: true }], submit: true });
  const r = await prisma.procurementRequest.findUniqueOrThrow({ where: { id: req.id } });
  await decideApproval(ops, { approvalId: r.approvalId!, decision: "APPROVED", comment: "Approved for Q4 onboarding" });
  const po = await createOrderFromRequest(ops, req.id, { vendorId: vendor.id, expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) });
  const sub = await submitOrder(ops, po.id);
  if (sub.status === "PENDING_APPROVAL") await decideApproval(fin, { approvalId: (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).approvalId!, decision: "APPROVED" });
  await issueOrder(ops, po.id);
  const item = await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
  await receiveOrder(ops, po.id, { lines: [{ poItemId: item.id, quantity: "2" }], notes: "Delivered to the Riyadh office" });
  const laptop = await prisma.assetCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "laptop" } });
  const warranty = new Date(Date.now() + 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const a1 = await createAssetFromPoItem(ops, item.id, { categoryId: laptop.id, serialNumber: "PF-4T14-0001", manufacturer: "Lenovo", model: "T14 Gen 5", warrantyEndDate: warranty, location: "Riyadh HQ" });
  await createAssetFromPoItem(ops, item.id, { categoryId: laptop.id, serialNumber: "PF-4T14-0002", manufacturer: "Lenovo", model: "T14 Gen 5", warrantyEndDate: warranty, location: "Riyadh HQ" });
  const devEmp = await prisma.employee.findFirst({ where: { organizationId: orgId, userId: dev.userId } });
  if (devEmp) await assignAsset(ops, a1.id, { employeeId: devEmp.id, condition: "New, sealed box" });
  const client = await prisma.client.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const t = await createTicket(support, { subject: "Booking form returns an error", description: "The clinic reports that the online booking form shows an error after choosing a time slot.", category: "BUG", priority: "HIGH", source: "PHONE", clientId: client?.id ?? null, tags: "booking,website" });
  await addTicketComment(support, t.id, { body: "We are reproducing the issue on staging.", visibility: "CLIENT_FACING" });
  const kbCat = await prisma.knowledgeCategory.findFirstOrThrow({ where: { organizationId: orgId, key: "support" } });
  const art = await createArticle(support, {
    titleAr: "التعامل مع أخطاء نموذج الحجز", titleEn: "Handling booking form errors",
    bodyAr: "1. اطلب من العميل لقطة شاشة ووقت حدوث الخطأ.\n2. تحقق من سجلات الخادم للفترة نفسها.\n3. أعد إنتاج المشكلة على بيئة الاختبار قبل أي تعديل.",
    bodyEn: "1. Ask the client for a screenshot and the time of the error.\n2. Check the server logs for that time window.\n3. Reproduce on staging before changing anything.",
    categoryId: kbCat.id, visibility: "SUPPORT_ONLY", tags: "bug,booking,website"
  });
  await submitArticleForReview(support, art.id);
  await publishArticle(ops, art.id);
  console.log("✔ operations demo data created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
