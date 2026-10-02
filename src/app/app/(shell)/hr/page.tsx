import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { hrDashboard } from "@/server/hr/insights";
import { attendanceToday } from "@/server/hr/attendance";
import { sweepHrIfDue } from "@/server/hr/sweep";
import { employeeWhere } from "@/server/hr/access";
import { attendanceTone, nameOf, payrollTone } from "@/lib/os/hr-page";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";

export const metadata = { title: "People" };

export default async function HrDashboardPage() {
  const { ctx, allowed } = await pageCtx("hr.dashboard.view");
  if (!allowed) return <PermissionDenied permission="hr.dashboard.view" />;
  await sweepHrIfDue(ctx.organizationId);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const [d, today, pending] = await Promise.all([
    hrDashboard(ctx),
    can(ctx, "hr.attendance.view") ? attendanceToday(ctx) : Promise.resolve(null),
    prisma.leaveRequest.findMany({ where: { organizationId: ctx.organizationId, status: "SUBMITTED", employee: await employeeWhere(ctx) }, orderBy: { startDate: "asc" }, take: 8, include: { employee: { select: { id: true, displayName: true, nameAr: true } }, leaveType: { select: { nameAr: true, nameEn: true } } } })
  ]);
  const cells: [string, string | number | null, string, string?][] = [
    ["active", d.active, "/app/hr/employees"],
    ["onLeave", d.onLeave, "/app/hr/leave?status=APPROVED"],
    ["present", today ? `${d.present} / ${today.rows.length}` : d.present, "/app/hr/attendance"],
    ["pendingLeave", d.pendingLeave, "/app/hr/leave?status=SUBMITTED", d.pendingLeave ? "text-warning" : undefined],
    ["openJobs", d.openJobs, "/app/hr/recruitment"],
    ["interviewing", d.interviewing, "/app/hr/recruitment"],
    ["newHires", d.newHires, "/app/hr/employees"],
    ["probation", d.probation, "/app/hr/employees?status=PROBATION", d.probation ? "text-warning" : undefined]
  ];
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Users"
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          can(ctx, "hr.employees.create") ? (
            <Link href="/app/hr/employees?new=1" className="os-btn-primary">
              + {t("newEmployee")}
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-4">
        {cells
          .filter(([, v]) => v !== null)
          .map(([k, v, href, cls]) => (
            <Link key={k} href={href} className="bg-os-surface px-4 py-3 transition hover:bg-os-panel">
              <p className="text-[11.5px] text-os-muted">{t(`k.${k}` as "k.active")}</p>
              <p className={`mt-0.5 text-xl font-semibold tabular ${cls ?? ""}`}>{v}</p>
            </Link>
          ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        {today && (
          <SectionCard title={t("attendanceToday")} action={<Link href="/app/hr/attendance" className="text-xs text-os-muted hover:text-os-text">{t("viewAll")}</Link>}>
            {!today.workingDay && <p className="border-b border-os-line px-4 py-2 text-xs text-os-muted">{today.holiday ? `${t("holiday")}: ${today.holiday.name}` : t("nonWorkingDay")}</p>}
            <ul className="divide-y divide-os-line text-sm">
              {today.rows.slice(0, 10).map((r) => {
                const status = r.record?.status ?? (r.leave ? "ON_LEAVE" : null);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                    <Link href={`/app/hr/employees/${r.id}?tab=attendance`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                      {nameOf(r, locale)}
                    </Link>
                    {status ? <Badge tone={attendanceTone(status)}>{t(`att.${status}` as "att.PRESENT")}</Badge> : <span className="text-xs text-os-faint">{t("noRecord")}</span>}
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}
        <div className="grid content-start gap-5">
          <SectionCard title={t("pendingLeave")} action={<Link href="/app/hr/leave?status=SUBMITTED" className="text-xs text-os-muted hover:text-os-text">{t("viewAll")}</Link>}>
            {pending.length === 0 ? (
              <EmptyState icon="CircleCheck" title={t("nothingPending")} text="" />
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {pending.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate">{nameOf(l.employee, locale)}</span>
                    <span className="text-xs text-os-muted">
                      {locale === "ar" ? l.leaveType.nameAr : l.leaveType.nameEn} · {fmtDate(l.startDate, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(l.endDate, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          {d.payroll !== undefined && (
            <SectionCard title={t("payrollStatus")} action={<Link href="/app/hr/payroll" className="text-xs text-os-muted hover:text-os-text">{t("viewAll")}</Link>}>
              {d.payroll ? (
                <Link href={`/app/hr/payroll/${d.payroll.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-os-panel">
                  <span className="flex-1 font-medium"><bdi dir="ltr">{d.payroll.name}</bdi></span>
                  <span className="text-xs text-os-muted">{t("employeesN", { n: d.payroll.employeeCount })}</span>
                  <Badge tone={payrollTone(d.payroll.status)}>{t(`pstatus.${d.payroll.status}` as "pstatus.DRAFT")}</Badge>
                </Link>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noPayroll")}</p>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
