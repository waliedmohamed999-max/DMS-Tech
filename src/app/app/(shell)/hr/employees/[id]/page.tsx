import Link from "next/link";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { todayIn } from "@/server/commercial/dates";
import { EMPLOYEE_TRANSITIONS, getEmployee } from "@/server/hr/employees";
import { compensationHistory } from "@/server/hr/compensation";
import { employeeTone, hrOptions, nameOf } from "@/lib/os/hr-page";
import { formatMoney } from "@/lib/commercial/calc";
import { employeeStatusAction, updateEmployeeAction } from "@/lib/os/hr-actions";
import { Badge, PermissionDenied } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";
import { EmployeeAccount } from "@/components/hr/EmployeeAccount";
import { ID_T, type EmployeeTabCtx } from "./_tabs/context";
import { Overview } from "./_tabs/Overview";
import { Employment } from "./_tabs/Employment";
import { Expiries } from "./_tabs/Expiries";
import { Attendance } from "./_tabs/Attendance";
import { Leave } from "./_tabs/Leave";
import { Compensation } from "./_tabs/Compensation";
import { Payroll } from "./_tabs/Payroll";
import { Performance } from "./_tabs/Performance";
import { Assets } from "./_tabs/Assets";
import { Activity } from "./_tabs/Activity";

export const metadata = { title: "Employee" };
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"];

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  let d;
  try {
    d = await getEmployee(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    if (isAppError(e) && e.code === "FORBIDDEN") return <PermissionDenied permission="hr.employees.view" />;
    throw e;
  }
  const e = d.employee;
  const c = d.can;
  const tabs = (
    [
      ["overview", true],
      ["employment", true],
      ["expiries", d.rel.hr || d.rel.self],
      ["attendance", c.attendance],
      ["leave", c.leave],
      ["compensation", c.compensation || c.bank],
      ["payroll", c.payroll],
      ["performance", c.performance],
      ["assets", can(ctx, "assets.view") || d.rel.self],
      ["documents", d.rel.hr || d.rel.self],
      ["activity", d.rel.hr || d.rel.self]
    ] as [string, boolean][]
  ).filter(([, ok]) => ok).map(([k]) => k);
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : "overview";
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, currency: true } });
  const today = todayIn(org.timezone);
  const opts = c.edit ? await hrOptions(ctx, locale) : null;
  const it = ID_T[locale === "en" ? "en" : "ar"];
  const ageOf = (b: Date) => {
    const n = today.getUTCFullYear() - b.getUTCFullYear() - (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate()) ? 1 : 0);
    return n;
  };
  const comp = tab === "compensation" && c.compensation ? await compensationHistory(ctx, id) : [];
  const m = (v: { toFixed(n: number): string } | string, cur = org.currency) => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, cur);
  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="grid grid-cols-[130px_1fr] gap-2 py-1">
      <dt className="text-os-muted">{k}</dt>
      <dd dir="auto">{v ?? "—"}</dd>
    </div>
  );
  const tc: EmployeeTabCtx = { ctx, id, d, e, c, locale, t, today, org, it, ageOf, comp, m, row };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href={can(ctx, "hr.employees.view") ? "/app/hr/employees" : "/app/my-team"} className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {e.number}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {nameOf(e, locale)}
            <Badge tone={employeeTone(e.status)} dot>
              {t(`status.${e.status}` as "status.ACTIVE")}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{e.jobTitle ?? "—"}</span>
            {e.department && <span>{(locale === "ar" && e.department.nameAr) || e.department.name}</span>}
            {e.manager && (
              <span>
                {t("f.manager")}: <Link href={`/app/hr/employees/${e.manager.id}`} className="hover:text-iris-light">{nameOf(e.manager, locale)}</Link>
              </span>
            )}
            {d.rel.self && <Badge tone="iris">{t("you")}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.edit && opts && (
            <ActionForm
              action={updateEmployeeAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("save")}
              fields={[
                { name: "firstName", label: t("f.firstName"), value: e.firstName, required: true },
                { name: "lastName", label: t("f.lastName"), value: e.lastName, required: true },
                { name: "nameAr", label: t("f.nameAr"), value: e.nameAr ?? "", dir: "rtl" },
                { name: "jobTitle", label: t("f.jobTitle"), value: e.jobTitle ?? "" },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: e.departmentId ?? "" },
                { name: "managerId", label: t("f.manager"), type: "select", options: opts.employees.filter((o) => o.value !== id), value: e.managerId ?? "" },
                { name: "employmentType", label: t("f.employmentType"), type: "select", required: true, value: e.employmentType, options: TYPES.map((x) => ({ value: x, label: t(`type.${x}` as "type.FULL_TIME") })) },
                { name: "probationEndDate", label: t("f.probationEnd"), type: "date", value: e.probationEndDate?.toISOString().slice(0, 10) ?? "" },
                { name: "workEmail", label: t("f.workEmail"), type: "email", value: e.workEmail ?? "" },
                { name: "workPhone", label: t("f.workPhone"), value: e.workPhone ?? "", dir: "ltr" },
                { name: "city", label: t("f.city"), value: e.city ?? "" },
                { name: "workLocation", label: t("f.workLocation"), value: e.workLocation ?? "" },
                { name: "gender", label: it.gender, type: "select", value: e.gender ?? "", options: [{ value: "MALE", label: it.MALE }, { value: "FEMALE", label: it.FEMALE }] },
                ...(d.personalVisible
                  ? [
                      { name: "birthDate", label: it.birthDate, type: "date" as const, value: e.birthDate?.toISOString().slice(0, 10) ?? "" },
                      { name: "nationalId", label: it.nationalId, value: e.nationalId ?? "", dir: "ltr" as const },
                      { name: "personalEmail", label: t("f.personalEmail"), type: "email" as const, value: e.personalEmail ?? "" },
                      { name: "personalPhone", label: t("f.personalPhone"), value: e.personalPhone ?? "", dir: "ltr" as const },
                      { name: "nationality", label: t("f.nationality"), value: e.nationality ?? "" },
                      { name: "emergencyContactName", label: t("f.emergencyName"), value: e.emergencyContactName ?? "" },
                      { name: "emergencyContactPhone", label: t("f.emergencyPhone"), value: e.emergencyContactPhone ?? "", dir: "ltr" as const }
                    ]
                  : [])
              ]}
            />
          )}
          {c.edit && !d.rel.self && EMPLOYEE_TRANSITIONS[e.status].length > 0 && (
            <ActionForm
              action={employeeStatusAction}
              args={[id]}
              trigger={t("a.changeStatus")}
              triggerClass="os-btn-ghost"
              submitLabel={t("save")}
              note={t("statusNote")}
              fields={[
                { name: "to", label: t("f.status"), type: "select", required: true, options: EMPLOYEE_TRANSITIONS[e.status].filter((s) => s !== "ARCHIVED" || c.archive).map((s) => ({ value: s, label: t(`status.${s}` as "status.ACTIVE") })) },
                { name: "terminationDate", label: t("f.terminationDate"), type: "date" },
                { name: "reason", label: t("f.reason"), type: "textarea" }
              ]}
            />
          )}
          {c.edit && (can(ctx, "admin.users.manage") || can(ctx, "admin.users.view")) && (
            <EmployeeAccount
              locale={locale === "en" ? "en" : "ar"}
              employeeId={id}
              linked={Boolean(e.userId)}
              canCreate={can(ctx, "admin.users.manage")}
              canLink={can(ctx, "admin.users.view")}
              roles={can(ctx, "admin.users.manage") ? (await prisma.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } })).map((r) => ({ value: r.id, label: (locale === "ar" && r.nameAr) || r.name })) : []}
              users={opts?.users ?? []}
            />
          )}
        </div>
      </div>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {tabs.map((k) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`tabs.${k}` as "tabs.overview")}
            {["compensation", "payroll"].includes(k) && <span className="ms-1 text-[10px] text-os-faint">🔒</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview tc={tc} />}

      {tab === "employment" && <Employment tc={tc} />}

      {tab === "expiries" && <Expiries tc={tc} />}

      {tab === "attendance" && <Attendance tc={tc} employeeId={id} month={sp.month} manage={c.attendanceManage && !d.rel.self} />}

      {tab === "leave" && (
        <Leave tc={tc} employeeId={id} year={today.getUTCFullYear()} manage={can(ctx, "hr.leave.manage") && d.rel.hr && !d.rel.self} />
      )}

      {tab === "compensation" && <Compensation tc={tc} />}

      {tab === "payroll" && <Payroll tc={tc} />}

      {tab === "performance" && <Performance tc={tc} employeeId={id} manage={c.performanceManage && !d.rel.self} />}

      {tab === "documents" && <DocumentsPanel ctx={ctx} entity={{ type: "EMPLOYEE", id }} title={t("tabs.documents")} />}

      {tab === "assets" && <Assets tc={tc} />}

      {tab === "activity" && <Activity tc={tc} />}
    </div>
  );
}
