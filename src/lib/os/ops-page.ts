import "server-only";
import { prisma } from "@/server/db";
import { can, type Ctx } from "@/server/context";
import { clientWhere } from "@/server/crm/scope";
import { projectWhere } from "@/server/projects/access";

type Tone = "neutral" | "iris" | "success" | "warning" | "danger" | "info";
export const requestTone = (s: string): Tone => (s === "APPROVED" || s === "RECEIVED" ? "success" : s === "PENDING_APPROVAL" || s === "SUBMITTED" ? "warning" : s === "REJECTED" ? "danger" : s === "ORDERING" || s === "ORDERED" ? "info" : "neutral");
export const poTone = (s: string): Tone => (s === "RECEIVED" || s === "CLOSED" ? "success" : s === "PENDING_APPROVAL" ? "warning" : s === "CANCELLED" ? "danger" : s === "ISSUED" || s === "PARTIALLY_RECEIVED" ? "info" : s === "APPROVED" ? "iris" : "neutral");
export const assetTone = (s: string): Tone => (s === "IN_STOCK" ? "success" : s === "ASSIGNED" || s === "IN_USE" ? "info" : s === "MAINTENANCE" ? "warning" : s === "LOST" || s === "DAMAGED" ? "danger" : "neutral");
export const ticketTone = (s: string): Tone => (s === "RESOLVED" || s === "CLOSED" ? "success" : s === "NEW" ? "iris" : s === "WAITING_CLIENT" || s === "WAITING_INTERNAL" ? "warning" : s === "CANCELLED" ? "neutral" : "info");
export const priorityTone = (p: string): Tone => (p === "URGENT" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral");
export const slaTone = (s: string): Tone => (s === "breached" ? "danger" : s === "warning" ? "warning" : s === "met" ? "success" : s === "paused" ? "iris" : "neutral");
export const classTone = (c: string): Tone => (c === "RESTRICTED" ? "danger" : c === "CONFIDENTIAL" ? "warning" : c === "PUBLIC_INTERNAL" ? "success" : "neutral");
export const kbTone = (s: string): Tone => (s === "PUBLISHED" ? "success" : s === "REVIEW" ? "warning" : s === "ARCHIVED" ? "neutral" : "iris");

export const label = (x: { name?: string | null; nameAr?: string | null } | null | undefined, locale: string) => (x ? (locale === "ar" && x.nameAr) || x.name || "" : "");
export const userName = (people: { id: string; name: string; nameAr: string | null }[], id: string | null | undefined, locale: string) => {
  const p = people.find((x) => x.id === id);
  return p ? (locale === "ar" && p.nameAr) || p.name : null;
};

export async function opsOptions(ctx: Ctx, locale: string, want: { vendors?: boolean; projects?: boolean; departments?: boolean; employees?: boolean; clients?: boolean; users?: boolean } = {}) {
  const o = ctx.organizationId;
  const [vendors, projects, departments, employees, clients, users] = await Promise.all([
    want.vendors ? prisma.vendor.findMany({ where: { organizationId: o, status: "ACTIVE" }, orderBy: [{ preferred: "desc" }, { name: "asc" }], select: { id: true, name: true, preferred: true } }) : [],
    want.projects ? prisma.project.findMany({ where: { organizationId: o, status: { notIn: ["CANCELLED", "ARCHIVED"] }, ...(await projectWhere(ctx)) }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, name: true } }) : [],
    want.departments ? prisma.department.findMany({ where: { organizationId: o, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }) : [],
    want.employees ? prisma.employee.findMany({ where: { organizationId: o, status: { notIn: ["TERMINATED", "ARCHIVED"] } }, orderBy: { displayName: "asc" }, select: { id: true, number: true, displayName: true, nameAr: true } }) : [],
    want.clients && can(ctx, "crm.clients.view") ? prisma.client.findMany({ where: { organizationId: o, deletedAt: null, ...(await clientWhere(ctx)) }, orderBy: { displayName: "asc" }, take: 300, select: { id: true, displayName: true, nameAr: true } }) : [],
    want.users ? prisma.user.findMany({ where: { organizationId: o, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }) : []
  ]);
  return {
    vendors: vendors.map((v) => ({ value: v.id, label: `${v.preferred ? "★ " : ""}${v.name}` })),
    projects: projects.map((p) => ({ value: p.id, label: `${p.number} · ${p.name}` })),
    departments: departments.map((d) => ({ value: d.id, label: (locale === "ar" && d.nameAr) || d.name })),
    employees: employees.map((e) => ({ value: e.id, label: `${(locale === "ar" && e.nameAr) || e.displayName} · ${e.number}` })),
    clients: clients.map((c) => ({ value: c.id, label: (locale === "ar" && c.nameAr) || c.displayName })),
    users: users.map((u) => ({ value: u.id, label: (locale === "ar" && u.nameAr) || u.name }))
  };
}
