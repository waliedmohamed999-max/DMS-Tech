import { z } from "zod";
import type { ProjectRole } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { requirePermission, type Ctx } from "../context";
import { notFound, invalid } from "../errors";
import { unitOfWork } from "../events/bus";
import { nextNumber } from "../crm/sequence";
import { addDays } from "../commercial/dates";
import { optId, optText, reqText } from "../crm/normalize";

/**
 * Project templates — a STARTING POINT only. Applying a template copies its milestones and
 * tasks into the project as independent rows; editing a template later never touches projects
 * that already used it (tested). Defaults are created at bootstrap (only missing codes).
 */

type T = [string, string, number, number, [string, string, number?, ProjectRole?][]];
// [titleAr, titleEn, weight, dueOffsetDays, tasks[[titleAr, titleEn, estimateHours, role]]]
const DEFAULTS: { code: string; service: string; nameAr: string; nameEn: string; milestones: T[] }[] = [
  {
    code: "website", service: "web-development", nameAr: "مشروع موقع إلكتروني", nameEn: "Website project",
    milestones: [
      ["الاكتشاف وجمع المتطلبات", "Discovery", 10, 7, [["ورشة عمل المتطلبات مع العميل", "Requirements workshop", 4, "PROJECT_MANAGER"], ["خريطة الموقع والمحتوى المطلوب", "Sitemap & content list", 4, "DESIGNER"]]],
      ["التصميم", "Design", 20, 21, [["تصميم الصفحة الرئيسية", "Home page design", 16, "DESIGNER"], ["تصميم الصفحات الداخلية", "Inner pages design", 24, "DESIGNER"]]],
      ["التطوير", "Development", 35, 49, [["إعداد البيئة ونظام إدارة المحتوى", "Environment & CMS setup", 8, "DEVELOPER"], ["تطوير الواجهات", "Front-end build", 40, "DEVELOPER"], ["النماذج والتكاملات", "Forms & integrations", 12, "DEVELOPER"]]],
      ["الاختبار وضمان الجودة", "QA", 15, 56, [["اختبار المتصفحات والجوال", "Browser & mobile testing", 8, "QA"]]],
      ["مراجعة العميل", "Client review", 10, 63, [["جولة ملاحظات العميل", "Client feedback round", 4, "PROJECT_MANAGER"]]],
      ["الإطلاق", "Launch", 10, 70, [["النشر على الخادم والنطاق", "Production deployment & domain", 4, "DEVELOPER"], ["تسليم وتدريب", "Handover & training", 3, "PROJECT_MANAGER"]]]
    ]
  },
  {
    code: "ecommerce", service: "ecommerce", nameAr: "مشروع متجر إلكتروني", nameEn: "E-commerce store",
    milestones: [
      ["الاكتشاف", "Discovery", 10, 7, [["جمع متطلبات المتجر", "Store requirements", 4, "PROJECT_MANAGER"]]],
      ["إعداد المتجر", "Store setup", 15, 14, [["إعداد المنصة والقالب", "Platform & theme setup", 12, "DEVELOPER"]]],
      ["التصميم", "Design", 15, 24, [["تصميم الهوية داخل المتجر", "Store visual design", 16, "DESIGNER"]]],
      ["الكتالوج والمنتجات", "Catalog & products", 20, 35, [["استيراد بيانات المنتجات", "Product data import", 12, "CONTRIBUTOR"]]],
      ["الدفع والشحن", "Payments & shipping", 20, 42, [["ربط بوابة الدفع", "Payment gateway", 8, "DEVELOPER"], ["ربط شركة الشحن", "Shipping integration", 8, "DEVELOPER"]]],
      ["الاختبار والإطلاق", "QA & launch", 20, 49, [["طلبات تجريبية كاملة", "End-to-end test orders", 6, "QA"], ["الإطلاق", "Go live", 3, "PROJECT_MANAGER"]]]
    ]
  },
  {
    code: "mobile-app", service: "app-development", nameAr: "تطبيق جوال", nameEn: "Mobile application",
    milestones: [
      ["الاكتشاف", "Discovery", 10, 10, [["تحليل المتطلبات والقصص", "Requirements & user stories", 12, "PROJECT_MANAGER"]]],
      ["تجربة وواجهة المستخدم", "UX/UI", 20, 28, [["النماذج الأولية", "Wireframes", 16, "DESIGNER"], ["التصميم النهائي", "Final UI", 32, "DESIGNER"]]],
      ["الخادم والواجهات البرمجية", "Backend & API", 25, 56, [["تصميم قاعدة البيانات والواجهات", "Data model & API", 40, "DEVELOPER"]]],
      ["تطوير التطبيق", "App development", 25, 84, [["تطوير الشاشات", "Screens", 80, "DEVELOPER"]]],
      ["الاختبار", "QA", 10, 98, [["اختبار الأجهزة", "Device testing", 16, "QA"]]],
      ["النشر في المتاجر", "Store release", 10, 105, [["رفع التطبيق للمتاجر", "Store submission", 6, "DEVELOPER"]]]
    ]
  },
  {
    code: "ai-automation", service: "ai-automation", nameAr: "مشروع أتمتة بالذكاء الاصطناعي", nameEn: "AI automation project",
    milestones: [
      ["تحليل العمليات", "Process mapping", 15, 10, [["تحليل العملية الحالية", "Current process analysis", 8, "PROJECT_MANAGER"]]],
      ["تصميم الحل", "Solution design", 20, 20, [["تصميم سير الأتمتة", "Automation flow design", 12, "TECH_LEAD"]]],
      ["البناء", "Build", 35, 40, [["بناء التكاملات", "Build integrations", 32, "DEVELOPER"]]],
      ["الاختبار", "Testing", 15, 50, [["اختبار السيناريوهات", "Scenario testing", 8, "QA"]]],
      ["التشغيل", "Rollout", 15, 56, [["التشغيل والتدريب", "Go-live & training", 6, "PROJECT_MANAGER"]]]
    ]
  },
  {
    code: "marketing-retainer", service: "digital-marketing", nameAr: "تسويق رقمي (اشتراك شهري)", nameEn: "Digital marketing retainer",
    milestones: [
      ["التهيئة", "Onboarding", 15, 7, [["استلام الحسابات والصلاحيات", "Account access & handover", 3, "MARKETING"]]],
      ["الاستراتيجية", "Strategy", 25, 14, [["خطة المحتوى والحملات", "Content & campaign plan", 10, "MARKETING"]]],
      ["حملات الشهر الأول", "Month 1 campaigns", 40, 35, [["إطلاق الحملات", "Launch campaigns", 16, "MARKETING"], ["إنتاج المحتوى", "Content production", 20, "DESIGNER"]]],
      ["التقرير الشهري", "Monthly report", 20, 40, [["تقرير الأداء", "Performance report", 4, "MARKETING"]]]
    ]
  },
  {
    code: "branding", service: "branding-design", nameAr: "مشروع هوية بصرية", nameEn: "Branding project",
    milestones: [
      ["البحث", "Research", 15, 7, [["تحليل المنافسين والسوق", "Market & competitor research", 8, "DESIGNER"]]],
      ["المفاهيم", "Concepts", 30, 17, [["ثلاثة مفاهيم للشعار", "Three logo concepts", 20, "DESIGNER"]]],
      ["التطوير", "Refinement", 30, 27, [["تطوير المفهوم المختار", "Refine chosen concept", 12, "DESIGNER"]]],
      ["دليل الهوية", "Brand guide", 25, 35, [["إعداد دليل الهوية", "Brand guidelines", 12, "DESIGNER"]]]
    ]
  },
  {
    code: "custom-software", service: "custom-software", nameAr: "برمجيات مخصصة", nameEn: "Custom software",
    milestones: [
      ["المتطلبات", "Requirements", 10, 10, [["توثيق المتطلبات", "Requirements specification", 16, "PROJECT_MANAGER"]]],
      ["البنية", "Architecture", 10, 17, [["تصميم البنية التقنية", "Technical architecture", 12, "TECH_LEAD"]]],
      ["الدورة الأولى", "Sprint 1", 25, 31, [["تنفيذ الدورة الأولى", "Sprint 1 build", 60, "DEVELOPER"]]],
      ["الدورة الثانية", "Sprint 2", 25, 45, [["تنفيذ الدورة الثانية", "Sprint 2 build", 60, "DEVELOPER"]]],
      ["اختبار القبول", "UAT", 15, 52, [["اختبار القبول مع العميل", "User acceptance testing", 12, "QA"]]],
      ["النشر", "Deployment", 15, 56, [["النشر للإنتاج", "Production deployment", 6, "DEVELOPER"]]]
    ]
  }
];

export async function ensureDefaultProjectTemplates(organizationId: string) {
  const have = new Set((await prisma.projectTemplate.findMany({ where: { organizationId }, select: { code: true } })).map((t) => t.code));
  let created = 0;
  for (const d of DEFAULTS) {
    if (have.has(d.code)) continue;
    const service = await prisma.service.findFirst({ where: { organizationId, key: d.service }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      const t = await tx.projectTemplate.create({ data: { organizationId, code: d.code, nameAr: d.nameAr, nameEn: d.nameEn, serviceId: service?.id ?? null } });
      let n = 0;
      for (const [titleAr, titleEn, weight, offsetDays, tasks] of d.milestones) {
        const m = await tx.projectTemplateMilestone.create({ data: { templateId: t.id, key: `m${n}`, titleAr, titleEn, weight, offsetDays, sortOrder: n++ } });
        let k = 0;
        for (const [ar, en, hours, role] of tasks) await tx.projectTemplateTask.create({ data: { templateId: t.id, milestoneId: m.id, titleAr: ar, titleEn: en, estimateMinutes: hours ? hours * 60 : null, role: role ?? null, sortOrder: k++ } });
      }
      await tx.auditLog.create({ data: { organizationId, action: "project_template.created", entityType: "ProjectTemplate", entityId: t.id, after: { code: d.code, source: "bootstrap" } } });
    });
    created++;
  }
  return created;
}

/**
 * Copy a template into a project (inside the creating transaction). Returns created milestone ids.
 * Snapshot: titles are copied in the project language; due dates = start + offset.
 */
export async function applyTemplateTx(tx: Tx, input: { organizationId: string; projectId: string; templateId: string; start: Date; language: "ar" | "en"; createdById: string | null }) {
  const t = await tx.projectTemplate.findFirst({ where: { id: input.templateId, organizationId: input.organizationId }, include: { milestones: { orderBy: { sortOrder: "asc" } }, tasks: { orderBy: { sortOrder: "asc" } } } });
  if (!t) throw notFound("ProjectTemplate");
  const map = new Map<string, string>();
  for (const m of t.milestones) {
    const pm = await tx.projectMilestone.create({
      data: { projectId: input.projectId, title: input.language === "ar" ? m.titleAr : m.titleEn, weight: m.weight, dueDate: addDays(input.start, m.offsetDays), sortOrder: m.sortOrder }
    });
    map.set(m.id, pm.id);
  }
  let order = 0;
  for (const task of t.tasks) {
    const milestoneId = task.milestoneId ? (map.get(task.milestoneId) ?? null) : null;
    const due = task.milestoneId ? t.milestones.find((m) => m.id === task.milestoneId) : null;
    await tx.task.create({
      data: {
        organizationId: input.organizationId,
        number: await nextNumber(tx, input.organizationId, "TASK"),
        projectId: input.projectId,
        milestoneId,
        title: input.language === "ar" ? task.titleAr : task.titleEn,
        status: "TODO",
        estimateMinutes: task.estimateMinutes,
        dueDate: due ? addDays(input.start, due.offsetDays) : null,
        sortOrder: order++,
        createdById: input.createdById
      }
    });
  }
  return { milestones: t.milestones.length, tasks: t.tasks.length };
}

export async function listTemplates(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  requirePermission(ctx, "projects.view");
  return prisma.projectTemplate.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { nameEn: "asc" },
    include: { service: { select: { id: true, nameAr: true, nameEn: true } }, milestones: { orderBy: { sortOrder: "asc" }, include: { tasks: { orderBy: { sortOrder: "asc" } } } } }
  });
}

const templateSchema = z.object({
  id: optId,
  code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  nameAr: reqText(2, 160),
  nameEn: reqText(2, 160),
  descriptionAr: optText(2000),
  descriptionEn: optText(2000),
  serviceId: optId,
  active: z.boolean().default(true),
  milestones: z
    .array(
      z.object({
        titleAr: reqText(2, 200),
        titleEn: reqText(2, 200),
        weight: z.coerce.number().int().min(1).max(100),
        offsetDays: z.coerce.number().int().min(0).max(1000),
        tasks: z.array(z.object({ titleAr: reqText(2, 200), titleEn: reqText(2, 200), estimateHours: z.coerce.number().min(0).max(1000).optional(), role: z.enum(["PROJECT_MANAGER", "TECH_LEAD", "DEVELOPER", "DESIGNER", "MARKETING", "QA", "ACCOUNT_MANAGER", "CONTRIBUTOR", "OBSERVER"]).optional() })).max(40)
      })
    )
    .min(1)
    .max(30)
});

/** Create or fully replace a template's structure. Running projects are unaffected (snapshots). */
export async function saveTemplate(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "projects.templates.manage");
  const input = templateSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    let t;
    if (input.id) {
      const before = await tx.projectTemplate.findFirst({ where: { id: input.id, organizationId: ctx.organizationId } });
      if (!before) throw notFound("ProjectTemplate");
      await tx.projectTemplateMilestone.deleteMany({ where: { templateId: input.id } });
      await tx.projectTemplateTask.deleteMany({ where: { templateId: input.id } });
      t = await tx.projectTemplate.update({ where: { id: input.id }, data: { code: input.code, nameAr: input.nameAr, nameEn: input.nameEn, descriptionAr: input.descriptionAr ?? null, descriptionEn: input.descriptionEn ?? null, serviceId: input.serviceId ?? null, active: input.active } });
    } else {
      if (await tx.projectTemplate.findFirst({ where: { organizationId: ctx.organizationId, code: input.code } })) throw invalid("TEMPLATE_CODE_TAKEN");
      t = await tx.projectTemplate.create({ data: { organizationId: ctx.organizationId, code: input.code, nameAr: input.nameAr, nameEn: input.nameEn, descriptionAr: input.descriptionAr ?? null, descriptionEn: input.descriptionEn ?? null, serviceId: input.serviceId ?? null, active: input.active } });
    }
    let n = 0;
    for (const m of input.milestones) {
      const row = await tx.projectTemplateMilestone.create({ data: { templateId: t.id, key: `m${n}`, titleAr: m.titleAr, titleEn: m.titleEn, weight: m.weight, offsetDays: m.offsetDays, sortOrder: n++ } });
      let k = 0;
      for (const task of m.tasks) await tx.projectTemplateTask.create({ data: { templateId: t.id, milestoneId: row.id, titleAr: task.titleAr, titleEn: task.titleEn, estimateMinutes: task.estimateHours ? Math.round(task.estimateHours * 60) : null, role: task.role ?? null, sortOrder: k++ } });
    }
    await uow.audit({ action: input.id ? "project_template.updated" : "project_template.created", entityType: "ProjectTemplate", entityId: t.id, after: { code: t.code, milestones: input.milestones.length } });
    return { id: t.id };
  });
}
