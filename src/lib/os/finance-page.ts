import "server-only";
import { getLocale } from "next-intl/server";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/context";

/** Data for the invoice draft editor: clients, their contacts, catalog services, VAT. */
export async function editorData(ctx: Ctx) {
  const locale = await getLocale();
  const [org, clients, contacts, services] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { vatRate: true } }),
    prisma.client.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, number: true } }),
    prisma.contact.findMany({ where: { organizationId: ctx.organizationId, clientId: { not: null }, deletedAt: null }, orderBy: { firstName: "asc" }, select: { id: true, clientId: true, firstName: true, lastName: true } }),
    prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameAr: true, nameEn: true, basePrice: true } })
  ]);
  const contactsByClient: Record<string, { id: string; label: string }[]> = {};
  for (const c of contacts) (contactsByClient[c.clientId!] ??= []).push({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() });
  return {
    vatRate: org.vatRate.toFixed(2).replace(/\.00$/, ""),
    clients: clients.map((c) => ({ id: c.id, label: `${c.displayName} · ${c.number}` })),
    contactsByClient,
    services: services.map((s) => ({ id: s.id, label: locale === "ar" ? s.nameAr : s.nameEn, nameAr: s.nameAr, nameEn: s.nameEn, price: s.basePrice.toFixed(2) }))
  };
}

/** Options for the expense form: active categories, active vendors, projects the user may attach costs to. */
export async function expenseFormData(ctx: Ctx) {
  const locale = await getLocale();
  const { listCategories, vendorOptions } = await import("@/server/finance/expenses");
  const { projectWhere } = await import("@/server/projects/access");
  const all = ctx.permissions.has("finance.records.all");
  const [org, cats, vendors, projects] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { vatRate: true, timezone: true } }),
    listCategories(ctx),
    vendorOptions(ctx),
    prisma.project.findMany({ where: { organizationId: ctx.organizationId, status: { notIn: ["CANCELLED", "ARCHIVED"] }, ...(all ? {} : ctx.permissions.has("projects.view") ? await projectWhere(ctx) : { id: "__none__" }) }, orderBy: { number: "desc" }, take: 200, select: { id: true, number: true, name: true } })
  ]);
  const { todayIn } = await import("@/server/commercial/dates");
  return {
    today: todayIn(org.timezone).toISOString().slice(0, 10),
    vatRate: org.vatRate.toFixed(2).replace(/\.00$/, ""),
    categories: cats.map((c) => ({ id: c.id, label: locale === "ar" ? c.nameAr : c.nameEn })),
    vendors: vendors.map((v) => ({ id: v.id, label: `${v.name} · ${v.number}` })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.number} · ${p.name}` }))
  };
}
