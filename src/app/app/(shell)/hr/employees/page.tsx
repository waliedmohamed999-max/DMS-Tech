import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listEmployees } from "@/server/hr/employees";
import { employeeTone, hrOptions, nameOf } from "@/lib/os/hr-page";
import { createEmployeeAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Employees" };
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"];

/** Directory: identity, role and reporting line only — never salary, bank or personal contact data. */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("hr.employees.view");
  if (!allowed) return <PermissionDenied permission="hr.employees.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const [data, opts] = await Promise.all([listEmployees(ctx, sp), hrOptions(ctx, locale)]);
  const canCreate = can(ctx, "hr.employees.create");
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Network"
        title={t("employees")}
        subtitle={t("employeesSubtitle")}
        actions={
          canCreate ? (
            <ActionForm
              action={createEmployeeAction}
              trigger={`+ ${t("newEmployee")}`}
              submitLabel={t("create")}
              redirect="/app/hr/employees/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/hr/employees"
              note={t("newEmployeeNote")}
              fields={[
                { name: "firstName", label: t("f.firstName"), required: true },
                { name: "lastName", label: t("f.lastName"), required: true },
                { name: "nameAr", label: t("f.nameAr"), dir: "rtl" },
                { name: "jobTitle", label: t("f.jobTitle") },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments },
                { name: "managerId", label: t("f.manager"), type: "select", options: opts.employees },
                { name: "employmentType", label: t("f.employmentType"), type: "select", required: true, value: "FULL_TIME", options: TYPES.map((x) => ({ value: x, label: t(`type.${x}` as "type.FULL_TIME") })) },
                { name: "joinDate", label: t("f.joinDate"), type: "date", required: true },
                { name: "probationEndDate", label: t("f.probationEnd"), type: "date" },
                { name: "workEmail", label: t("f.workEmail"), type: "email" },
                { name: "workPhone", label: t("f.workPhone"), dir: "ltr" },
                { name: "city", label: t("f.city") },
                { name: "userId", label: t("f.linkUser"), type: "select", options: opts.users, hint: t("linkUserHint") }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchEmployees") }}
          selects={[
            { name: "status", allLabel: t("currentStaff"), options: ["ACTIVE", "PROBATION", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED"].map((s) => ({ value: s, label: t(`status.${s}` as "status.ACTIVE") })) },
            { name: "department", allLabel: `${t("f.department")}: ${t("all")}`, options: opts.departments },
            { name: "type", allLabel: `${t("f.employmentType")}: ${t("all")}`, options: TYPES.map((x) => ({ value: x, label: t(`type.${x}` as "type.FULL_TIME") })) }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Users" title={t("noEmployees")} text={t("noEmployeesText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.employee")}</th>
                  <th className="hidden md:table-cell">{t("f.department")}</th>
                  <th className="hidden lg:table-cell">{t("f.manager")}</th>
                  <th className="hidden md:table-cell">{t("f.joinDate")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/hr/employees/${e.id}`} className="font-medium hover:text-iris-light">
                        {nameOf(e, locale)}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{e.number}</span>
                        {e.jobTitle ? ` · ${e.jobTitle}` : ""} · {t(`type.${e.employmentType}` as "type.FULL_TIME")}
                        {!e.userId && ` · ${t("noAccount")}`}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{e.department ? (locale === "ar" && e.department.nameAr) || e.department.name : "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{e.manager ? nameOf(e.manager, locale) : "—"}</td>
                    <td className="hidden whitespace-nowrap text-xs text-os-muted md:table-cell">{fmtDate(e.joinDate, locale)}</td>
                    <td>
                      <Badge tone={employeeTone(e.status)}>{t(`status.${e.status}` as "status.ACTIVE")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/hr/employees" params={sp} />
      </div>
    </div>
  );
}
