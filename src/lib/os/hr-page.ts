import "server-only";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/context";
import { employeeOptions } from "@/server/hr/employees";

type Tone = "neutral" | "iris" | "success" | "warning" | "danger" | "info";
export const employeeTone = (s: string): Tone => (s === "ACTIVE" ? "success" : s === "PROBATION" ? "info" : s === "ON_LEAVE" ? "iris" : s === "SUSPENDED" ? "warning" : s === "TERMINATED" ? "danger" : "neutral");
export const leaveTone = (s: string): Tone => (s === "APPROVED" ? "success" : s === "SUBMITTED" ? "warning" : s === "REJECTED" ? "danger" : "neutral");
export const attendanceTone = (s: string): Tone => (s === "PRESENT" || s === "REMOTE" ? "success" : s === "LATE" || s === "HALF_DAY" ? "warning" : s === "ABSENT" || s === "MISSING" ? "danger" : s === "ON_LEAVE" || s === "HOLIDAY" ? "iris" : "neutral");
export const payrollTone = (s: string): Tone => (s === "PAID" || s === "CLOSED" ? "success" : s === "APPROVED" ? "info" : s === "REVIEW" ? "warning" : "neutral");
export const stageTone = (s: string): Tone => (s === "HIRED" ? "success" : s === "REJECTED" ? "danger" : s === "OFFER" ? "iris" : ["INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW"].includes(s) ? "info" : "neutral");
export const offerTone = (s: string): Tone => (s === "ACCEPTED" ? "success" : s === "REJECTED" || s === "WITHDRAWN" ? "danger" : s === "PENDING_APPROVAL" ? "warning" : s === "APPROVED" || s === "SENT" ? "info" : "neutral");
export const nameOf = (e: { displayName: string; nameAr: string | null }, locale: string) => (locale === "ar" && e.nameAr) || e.displayName;

export async function hrOptions(ctx: Ctx, locale: string) {
  const [depts, emps, users] = await Promise.all([
    prisma.department.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
    employeeOptions(ctx),
    prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, email: true } })
  ]);
  return {
    departments: depts.map((d) => ({ value: d.id, label: (locale === "ar" && d.nameAr) || d.name })),
    employees: emps.map((e) => ({ value: e.id, label: `${nameOf(e, locale)} · ${e.number}` })),
    users: users.map((u) => ({ value: u.id, label: `${(locale === "ar" && u.nameAr) || u.name} · ${u.email}` }))
  };
}
export const jobTone = (s: string): Tone => (s === "OPEN" ? "success" : s === "ON_HOLD" ? "warning" : s === "CANCELLED" ? "danger" : "neutral");
