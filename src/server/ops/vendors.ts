import { z } from "zod";
import { prisma } from "../db";
import { can, type Ctx } from "../context";
import { forbidden, invalid, notFound } from "../errors";
import { unitOfWork } from "../events/bus";
import { optEmail, optText, reqText } from "../crm/normalize";
import { D, r2 } from "./shared";

/**
 * Vendor operations — the Phase 5 Vendor table is reused (no second vendor table). Phase 7 adds an
 * operational profile, contact persons and deterministic delivery metrics (no scoring model).
 */

const canSeeVendors = (ctx: Ctx) => can(ctx, "finance.vendors.view") || can(ctx, "procurement.orders.view");
const canManageVendors = (ctx: Ctx) => can(ctx, "finance.vendors.manage");

const opsSchema = z.object({
  procurementCategory: optText(80),
  preferred: z.boolean().default(false),
  rating: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(5).nullable()),
  leadTimeDays: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(3650).nullable()),
  contractReference: optText(120)
});

export async function updateVendorOps(ctx: Ctx, vendorId: string, raw: unknown) {
  if (!canManageVendors(ctx)) throw forbidden("finance.vendors.manage");
  const input = opsSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    const v = await tx.vendor.findFirst({ where: { id: vendorId, organizationId: ctx.organizationId } });
    if (!v) throw notFound("Vendor");
    const data = { procurementCategory: input.procurementCategory ?? null, preferred: input.preferred, rating: input.rating, leadTimeDays: input.leadTimeDays, contractReference: input.contractReference ?? null };
    await tx.vendor.update({ where: { id: vendorId }, data });
    await uow.audit({ action: "vendor.ops_updated", entityType: "Vendor", entityId: vendorId, before: { procurementCategory: v.procurementCategory, preferred: v.preferred, rating: v.rating, leadTimeDays: v.leadTimeDays, contractReference: v.contractReference }, after: data });
  });
}

const contactSchema = z.object({ name: reqText(2, 120), role: optText(80), email: optEmail, phone: optText(30), isPrimary: z.boolean().default(false) });

export async function addVendorContact(ctx: Ctx, vendorId: string, raw: unknown) {
  if (!canManageVendors(ctx)) throw forbidden("finance.vendors.manage");
  const input = contactSchema.parse(raw);
  return unitOfWork(ctx, async (tx, uow) => {
    if (!(await tx.vendor.findFirst({ where: { id: vendorId, organizationId: ctx.organizationId } }))) throw notFound("Vendor");
    if (input.isPrimary) await tx.vendorContact.updateMany({ where: { vendorId, isPrimary: true }, data: { isPrimary: false } });
    const c = await tx.vendorContact.create({ data: { organizationId: ctx.organizationId, vendorId, name: input.name, role: input.role ?? null, email: input.email ?? null, phone: input.phone ?? null, isPrimary: input.isPrimary } });
    await uow.audit({ action: "vendor.contact_added", entityType: "Vendor", entityId: vendorId, after: { contactId: c.id, name: c.name, role: c.role } });
    return { id: c.id };
  });
}

export async function removeVendorContact(ctx: Ctx, contactId: string) {
  if (!canManageVendors(ctx)) throw forbidden("finance.vendors.manage");
  return unitOfWork(ctx, async (tx, uow) => {
    const c = await tx.vendorContact.findFirst({ where: { id: contactId, organizationId: ctx.organizationId } });
    if (!c) throw invalid("UNKNOWN_CONTACT");
    await tx.vendorContact.delete({ where: { id: contactId } });
    await uow.audit({ action: "vendor.contact_removed", entityType: "Vendor", entityId: c.vendorId, before: { contactId, name: c.name } });
  });
}

/**
 * Deterministic delivery metrics from purchase orders and receipts:
 * orders (issued, not cancelled), ordered value, late deliveries (completed after the expected date, or still open past it),
 * average delay in days over completed late orders, receipt lines with issues (damaged / incorrect).
 */
export async function vendorPerformance(organizationId: string, vendorIds?: string[], today = new Date()) {
  const pos = await prisma.purchaseOrder.findMany({
    where: { organizationId, ...(vendorIds ? { vendorId: { in: vendorIds } } : {}), status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] } },
    select: { vendorId: true, total: true, currency: true, expectedDeliveryDate: true, receivedAt: true, status: true, receipts: { select: { receivedAt: true, items: { select: { condition: true } } } } }
  });
  const out = new Map<string, { orders: number; ordered: Record<string, string>; late: number; avgDelayDays: number | null; issues: number; onTime: number }>();
  const acc = new Map<string, { delays: number[]; ordered: Map<string, ReturnType<typeof D>> }>();
  for (const p of pos) {
    const o = out.get(p.vendorId) ?? { orders: 0, ordered: {}, late: 0, avgDelayDays: null, issues: 0, onTime: 0 };
    const a = acc.get(p.vendorId) ?? { delays: [] as number[], ordered: new Map<string, ReturnType<typeof D>>() };
    o.orders++;
    a.ordered.set(p.currency, (a.ordered.get(p.currency) ?? D(0)).plus(D(p.total)));
    o.issues += p.receipts.reduce((s, r) => s + r.items.filter((i) => i.condition !== "GOOD").length, 0);
    if (p.expectedDeliveryDate) {
      const done = p.status === "RECEIVED" || p.status === "CLOSED";
      const lastReceipt = p.receipts.map((r) => r.receivedAt).sort((x, y) => y.getTime() - x.getTime())[0];
      if (done && lastReceipt) {
        const delay = Math.round((lastReceipt.getTime() - p.expectedDeliveryDate.getTime()) / 86_400_000);
        if (delay > 0) {
          o.late++;
          a.delays.push(delay);
        } else o.onTime++;
      } else if (!done && p.expectedDeliveryDate < today) o.late++;
    }
    out.set(p.vendorId, o);
    acc.set(p.vendorId, a);
  }
  for (const [id, o] of out) {
    const a = acc.get(id)!;
    o.avgDelayDays = a.delays.length ? Math.round((a.delays.reduce((s, x) => s + x, 0) / a.delays.length) * 10) / 10 : null;
    o.ordered = Object.fromEntries([...a.ordered].map(([c, v]) => [c, r2(v).toFixed(2)]));
  }
  return out;
}

export async function listVendorsOps(ctx: Ctx, q?: string) {
  if (!canSeeVendors(ctx)) throw forbidden("procurement.orders.view");
  const vendors = await prisma.vendor.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { number: { contains: q.toUpperCase() } }] } : {}) },
    orderBy: [{ preferred: "desc" }, { name: "asc" }],
    take: 200,
    select: { id: true, number: true, name: true, procurementCategory: true, preferred: true, rating: true, leadTimeDays: true }
  });
  const perf = await vendorPerformance(ctx.organizationId, vendors.map((v) => v.id));
  return vendors.map((v) => ({ ...v, perf: perf.get(v.id) ?? null }));
}

export async function getVendorOps(ctx: Ctx, id: string) {
  if (!canSeeVendors(ctx)) throw forbidden("procurement.orders.view");
  const v = await prisma.vendor.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, status: true, total: true, currency: true, issueDate: true, expectedDeliveryDate: true, receivedAt: true } },
      assets: { where: { archivedAt: null }, take: 30, select: { id: true, number: true, name: true, status: true } }
    }
  });
  if (!v) throw notFound("Vendor");
  const perf = (await vendorPerformance(ctx.organizationId, [id])).get(id) ?? null;
  return { vendor: v, perf, canManage: canManageVendors(ctx) };
}

export const vendorOptions = (organizationId: string) => prisma.vendor.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: [{ preferred: "desc" }, { name: "asc" }], select: { id: true, name: true, number: true, preferred: true } });
