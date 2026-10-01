import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { can, requirePermission, type Ctx } from "../context";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { nextNumber } from "../crm/sequence";
import { blankToNull, money, optId, optText, reqText, parseListParams } from "../crm/normalize";

/**
 * Service catalog (Phase 3). Services and packages are the SOURCE for quotation lines;
 * once inserted, a quotation item is an independent historical snapshot (price, name,
 * description, tax) — changing the catalog never changes an existing quotation.
 */

export const PRICING_MODELS = ["FIXED", "HOURLY", "MONTHLY", "ANNUAL", "PER_USER", "PER_UNIT", "CUSTOM"] as const;
export const TAX_BEHAVIORS = ["STANDARD", "ZERO_RATED", "EXEMPT"] as const;

const svcLabel = (s: { code: string; nameEn: string }) => `${s.code} · ${s.nameEn}`;
const activity = (s: { id: string; code: string; nameEn: string }) => ({ entityLabel: svcLabel(s), href: `/app/sales/services?focus=${s.id}`, visibility: "services.view" as const });

// ---------------------------------------------------------------------------
// Default DMS catalog — production-safe, idempotent (only missing keys are created).
// Prices are 0 / CUSTOM on purpose: DMS sets real prices in the catalog; nothing is invented.
// ---------------------------------------------------------------------------

export const DEFAULT_SERVICES: { key: string; nameAr: string; nameEn: string; category: string }[] = [
  { key: "ai-automation", nameAr: "الذكاء الاصطناعي وأتمتة الأعمال", nameEn: "AI & Business Automation", category: "AI & Automation" },
  { key: "whatsapp-automation", nameAr: "أتمتة واتساب", nameEn: "WhatsApp Automation", category: "AI & Automation" },
  { key: "web-development", nameAr: "تصميم وتطوير المواقع", nameEn: "Website Design & Development", category: "Development" },
  { key: "app-development", nameAr: "تطوير تطبيقات الجوال", nameEn: "Mobile Application Development", category: "Development" },
  { key: "ecommerce", nameAr: "تطوير المتاجر الإلكترونية", nameEn: "E-Commerce Store Development", category: "Development" },
  { key: "digital-marketing", nameAr: "التسويق الرقمي", nameEn: "Digital Marketing", category: "Marketing" },
  { key: "branding-design", nameAr: "الهوية والتصميم الجرافيكي", nameEn: "Branding & Graphic Design", category: "Design" },
  { key: "digital-transformation", nameAr: "التحول الرقمي", nameEn: "Digital Transformation", category: "Consulting" },
  { key: "systems-integration", nameAr: "تكامل الأنظمة", nameEn: "System Integration", category: "Development" },
  { key: "ux-ui-design", nameAr: "تصميم تجربة وواجهة المستخدم", nameEn: "UX/UI Design", category: "Design" },
  // A sellable product entry only — NOVA AI is an external platform, not built in the Business OS.
  { key: "nova-ai", nameAr: "NOVA AI", nameEn: "NOVA AI", category: "Products" },
  { key: "custom-software", nameAr: "تطوير البرمجيات المخصصة", nameEn: "Custom Software Development", category: "Development" },
  { key: "support-maintenance", nameAr: "الصيانة والدعم الفني", nameEn: "Maintenance & Support", category: "Support" },
  { key: "consulting", nameAr: "الاستشارات التقنية", nameEn: "Technology Consulting", category: "Consulting" }
];

export async function ensureDefaultServices(organizationId: string) {
  const existing = new Set((await prisma.service.findMany({ where: { organizationId, key: { not: null } }, select: { key: true } })).map((s) => s.key));
  let created = 0;
  for (const d of DEFAULT_SERVICES) {
    if (existing.has(d.key)) continue;
    await prisma.$transaction(async (tx) => {
      const code = await nextNumber(tx, organizationId, "SRV");
      const s = await tx.service.create({ data: { organizationId, code, key: d.key, nameAr: d.nameAr, nameEn: d.nameEn, category: d.category, pricingModel: "CUSTOM", basePrice: "0" } });
      await tx.auditLog.create({ data: { organizationId, action: "service.created", entityType: "Service", entityId: s.id, after: { code, key: d.key, source: "bootstrap" } } });
    });
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const serviceSchema = z.object({
  key: z.preprocess(blankToNull, z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "KEY_FORMAT").max(60).nullable().optional()),
  nameAr: reqText(2, 160),
  nameEn: reqText(2, 160),
  shortDescriptionAr: optText(300),
  shortDescriptionEn: optText(300),
  descriptionAr: optText(4000),
  descriptionEn: optText(4000),
  category: optText(80),
  pricingModel: z.enum(PRICING_MODELS).default("CUSTOM"),
  basePrice: money.transform((v) => v ?? "0"),
  currency: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : "SAR"), z.string().length(3)),
  taxBehavior: z.enum(TAX_BEHAVIORS).default("STANDARD"),
  estimatedDeliveryDays: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(3650).nullable().optional()),
  departmentId: optId,
  quotationDescriptionAr: optText(4000),
  quotationDescriptionEn: optText(4000),
  defaultTermsAr: optText(8000),
  defaultTermsEn: optText(8000),
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).optional()
});

const COMMERCIAL_FIELDS = ["basePrice", "pricingModel", "taxBehavior", "currency"] as const;

async function assertDepartment(ctx: Ctx, departmentId?: string | null) {
  if (!departmentId) return;
  const d = await prisma.department.findFirst({ where: { id: departmentId, organizationId: ctx.organizationId, deletedAt: null } });
  if (!d) throw invalid("UNKNOWN_DEPARTMENT");
}

export async function createService(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "services.manage");
  const input = serviceSchema.parse(raw);
  await assertDepartment(ctx, input.departmentId);
  return unitOfWork(ctx, async (tx, uow) => {
    if (input.key && (await tx.service.findFirst({ where: { organizationId: ctx.organizationId, key: input.key } }))) throw conflict("SERVICE_KEY_TAKEN");
    const code = await nextNumber(tx, ctx.organizationId, "SRV");
    const s = await tx.service.create({ data: { ...input, active: input.active ?? true, organizationId: ctx.organizationId, code, createdById: ctx.userId || null } });
    await uow.audit({ action: "service.created", entityType: "Service", entityId: s.id, after: s });
    uow.emit({ type: "service.created", entityType: "Service", entityId: s.id, payload: { code, nameEn: s.nameEn }, activity: activity(s) });
    return s;
  });
}

export async function updateService(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "services.manage");
  const input = serviceSchema.partial().extend({ id: z.string().min(1) }).parse(raw);
  const { id, ...data } = input;
  await assertDepartment(ctx, data.departmentId);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.service.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!before) throw notFound("Service");
    if (data.key && data.key !== before.key && (await tx.service.findFirst({ where: { organizationId: ctx.organizationId, key: data.key } }))) throw conflict("SERVICE_KEY_TAKEN");
    const after = await tx.service.update({ where: { id }, data: { ...data, ...(data.active === true ? { archivedAt: null } : data.active === false ? { archivedAt: before.archivedAt ?? new Date() } : {}) } });
    const priceChanged = COMMERCIAL_FIELDS.some((k) => String(before[k]) !== String(after[k]));
    await uow.audit({ action: "service.updated", entityType: "Service", entityId: id, before, after });
    uow.emit({ type: "service.updated", entityType: "Service", entityId: id, payload: { fields: Object.keys(data), priceChanged }, activity: activity(after) });
    return after;
  });
}

export async function archiveService(ctx: Ctx, id: string) {
  requirePermission(ctx, "services.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.service.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!before) throw notFound("Service");
    if (before.archivedAt) return before;
    const after = await tx.service.update({ where: { id }, data: { active: false, archivedAt: new Date() } });
    await uow.audit({ action: "service.archived", entityType: "Service", entityId: id, before: { active: before.active }, after: { active: false } });
    uow.emit({ type: "service.updated", entityType: "Service", entityId: id, payload: { archived: true } });
    return after;
  });
}

export const SERVICES_PAGE_SIZE = 30;
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  category: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listServices(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "services.view");
  const f = parseListParams(listSchema, raw);
  const where: Prisma.ServiceWhereInput = {
    organizationId: ctx.organizationId,
    ...(f.status === "active" ? { active: true } : f.status === "archived" ? { active: false } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.q ? { OR: [{ nameAr: { contains: f.q } }, { nameEn: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q.toUpperCase() } }, { key: { contains: f.q.toLowerCase() } }] } : {})
  };
  const [items, total, categories] = await Promise.all([
    prisma.service.findMany({ where, orderBy: [{ active: "desc" }, { code: "asc" }], skip: (f.page - 1) * SERVICES_PAGE_SIZE, take: SERVICES_PAGE_SIZE, include: { department: { select: { name: true, nameAr: true } }, _count: { select: { quotationItems: true } } } }),
    prisma.service.count({ where }),
    prisma.service.findMany({ where: { organizationId: ctx.organizationId, category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } })
  ]);
  return { items, total, page: f.page, pageSize: SERVICES_PAGE_SIZE, categories: categories.map((c) => c.category!) };
}

/**
 * Lightweight service choices (id + names) for CRM forms and the quotation builder.
 * Prices are only included for users who may see the catalog.
 */
export async function serviceChoices(ctx: Ctx) {
  if (!can(ctx, "services.view") && !can(ctx, "crm.leads.create") && !can(ctx, "crm.opportunities.create") && !can(ctx, "crm.leads.edit")) throw forbidden("services.view");
  const rows = await prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: [{ category: "asc" }, { nameEn: "asc" }] });
  const priced = can(ctx, "services.view");
  return rows.map((s) => ({
    id: s.id,
    key: s.key,
    code: s.code,
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    category: s.category,
    ...(priced
      ? {
          pricingModel: s.pricingModel,
          basePrice: s.basePrice.toFixed(2),
          currency: s.currency,
          taxBehavior: s.taxBehavior,
          quotationDescriptionAr: s.quotationDescriptionAr ?? s.shortDescriptionAr,
          quotationDescriptionEn: s.quotationDescriptionEn ?? s.shortDescriptionEn,
          defaultTermsAr: s.defaultTermsAr,
          defaultTermsEn: s.defaultTermsEn
        }
      : {})
  }));
}

/** Resolve a service id for CRM records (must be an active service of this organization). */
export async function resolveServiceId(ctx: Ctx, serviceId: string | null | undefined) {
  if (!serviceId) return null;
  const s = await prisma.service.findFirst({ where: { id: serviceId, organizationId: ctx.organizationId }, select: { id: true, key: true, active: true } });
  if (!s) throw invalid("UNKNOWN_SERVICE");
  return s;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const packageSchema = z.object({
  nameAr: reqText(2, 160),
  nameEn: reqText(2, 160),
  descriptionAr: optText(4000),
  descriptionEn: optText(4000),
  defaultPrice: money.transform((v) => v ?? "0"),
  currency: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : "SAR"), z.string().length(3)),
  taxBehavior: z.enum(TAX_BEHAVIORS).default("STANDARD"),
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).optional(),
  items: z
    .array(z.object({ serviceId: z.string().min(1), quantity: z.coerce.number().positive().max(100000), optional: z.boolean().default(false) }))
    .min(1, "PACKAGE_NEEDS_ITEMS")
    .max(40)
});

async function checkPackageItems(ctx: Ctx, items: { serviceId: string }[]) {
  const ids = [...new Set(items.map((i) => i.serviceId))];
  if (ids.length !== items.length) throw invalid("PACKAGE_DUPLICATE_SERVICE");
  const found = await prisma.service.count({ where: { organizationId: ctx.organizationId, id: { in: ids } } });
  if (found !== ids.length) throw invalid("UNKNOWN_SERVICE");
}

export async function createPackage(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "services.manage");
  const { items, ...input } = packageSchema.parse(raw);
  await checkPackageItems(ctx, items);
  return unitOfWork(ctx, async (tx, uow) => {
    const code = await nextNumber(tx, ctx.organizationId, "PKG");
    const p = await tx.servicePackage.create({
      data: { ...input, active: input.active ?? true, organizationId: ctx.organizationId, code, createdById: ctx.userId || null, items: { create: items.map((i, n) => ({ serviceId: i.serviceId, quantity: String(i.quantity), optional: i.optional, sortOrder: n })) } },
      include: { items: true }
    });
    await uow.audit({ action: "service.package_created", entityType: "ServicePackage", entityId: p.id, after: p });
    uow.emit({ type: "service.created", entityType: "ServicePackage", entityId: p.id, payload: { code, package: true } });
    return p;
  });
}

export async function updatePackage(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "services.manage");
  const { id, items, ...input } = packageSchema.extend({ id: z.string().min(1) }).parse(raw);
  await checkPackageItems(ctx, items);
  return unitOfWork(ctx, async (tx, uow) => {
    const before = await tx.servicePackage.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { items: true } });
    if (!before) throw notFound("ServicePackage");
    await tx.servicePackageItem.deleteMany({ where: { packageId: id } });
    const after = await tx.servicePackage.update({
      where: { id },
      data: { ...input, ...(input.active === true ? { archivedAt: null } : input.active === false ? { archivedAt: before.archivedAt ?? new Date() } : {}), items: { create: items.map((i, n) => ({ serviceId: i.serviceId, quantity: String(i.quantity), optional: i.optional, sortOrder: n })) } },
      include: { items: true }
    });
    await uow.audit({ action: "service.package_updated", entityType: "ServicePackage", entityId: id, before, after });
    uow.emit({ type: "service.updated", entityType: "ServicePackage", entityId: id, payload: { package: true } });
    return after;
  });
}

export async function listPackages(ctx: Ctx, opts: { includeArchived?: boolean } = {}) {
  requirePermission(ctx, "services.view");
  return prisma.servicePackage.findMany({
    where: { organizationId: ctx.organizationId, ...(opts.includeArchived ? {} : { active: true }) },
    orderBy: { code: "asc" },
    include: { items: { orderBy: { sortOrder: "asc" }, include: { service: { select: { id: true, code: true, nameAr: true, nameEn: true, basePrice: true } } } } }
  });
}
