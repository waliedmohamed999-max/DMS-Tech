import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listLeaveRequests, listLeaveTypes } from "@/server/hr/leave";
import { hrOptions, leaveTone, nameOf } from "@/lib/os/hr-page";
import { cancelLeaveAction, createLeaveAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Leave" };
const STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "DRAFT"];

/** Leave requests in scope: own, direct reports, and (hr.leave.view) department / company. Decisions happen in Approvals. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "hr.leave.view") && !can(ctx, "hr.leave.approve")) return <PermissionDenied permission="hr.leave.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const scope = sp.scope === "mine" || sp.scope === "team" ? sp.scope : can(ctx, "hr.leave.view") ? "all" : "team";
  const manage = can(ctx, "hr.leave.manage");
  const [data, types, opts] = await Promise.all([listLeaveRequests(ctx, { ...sp, scope }), listLeaveTypes(ctx.organizationId), manage ? hrOptions(ctx, locale) : Promise.resolve(null)]);
  const scopes = (can(ctx, "hr.leave.view") ? ["all", "team", "mine"] : ["team", "mine"]) as string[];

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Calendar"
        title={t("leave")}
        subtitle={t("leaveSubtitle")}
        actions={
          manage && opts ? (
            <ActionForm
              action={createLeaveAction}
              trigger={`+ ${t("a.leaveOnBehalf")}`}
              submitLabel={t("a.submit")}
              note={t("onBehalfNote")}
              fields={[
                { name: "employeeId", label: t("f.employee"), type: "select", required: true, options: opts.employees },
                { name: "leaveTypeId", label: t("f.leaveType"), type: "select", required: true, options: types.map((x) => ({ value: x.id, label: locale === "ar" ? x.nameAr : x.nameEn })) },
                { name: "startDate", label: t("f.startDate"), type: "date", required: true },
                { name: "endDate", label: t("f.endDate"), type: "date", required: true },
                { name: "reason", label: t("f.reason"), type: "textarea" }
              ]}
            />
          ) : undefined
        }
      />
      <nav className="flex gap-1">
        {scopes.map((s) => (
          <Link key={s} href={`?scope=${s}${sp.status ? `&status=${sp.status}` : ""}`} className={`rounded-full border px-3 py-1 text-xs ${scope === s ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t(`scope.${s}` as "scope.all")}
          </Link>
        ))}
      </nav>
      <div className="os-card overflow-hidden">
        <FilterBar selects={[{ name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: STATUSES.map((s) => ({ value: s, label: t(`lstatus.${s}` as "lstatus.DRAFT") })) }]} />
        {data.items.length === 0 ? (
          <EmptyState icon="Calendar" title={t("noLeave")} text={t("noLeaveText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.employee")}</th>
                  <th>{t("f.leaveType")}</th>
                  <th>{t("f.dates")}</th>
                  <th className="text-end">{t("f.days")}</th>
                  <th>{t("f.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => {
                  const own = l.employeeId === data.meId;
                  const reportOf = l.employee.managerId === data.meId;
                  return (
                    <tr key={l.id}>
                      <td className="min-w-[160px]">
                        <Link href={`/app/hr/employees/${l.employee.id}?tab=leave`} className="font-medium hover:text-iris-light">
                          {nameOf(l.employee, locale)}
                        </Link>
                        {own && <span className="ms-1 text-[10px] text-iris-light">{t("you")}</span>}
                        {l.reason && <span className="block max-w-[260px] truncate text-[11px] text-os-faint" dir="auto">{l.reason}</span>}
                      </td>
                      <td className="text-xs">
                        {locale === "ar" ? l.leaveType.nameAr : l.leaveType.nameEn}
                        {!l.leaveType.paid && <span className="ms-1 text-[10px] text-warning">{t("unpaid")}</span>}
                      </td>
                      <td className="whitespace-nowrap text-xs text-os-muted">
                        {fmtDate(l.startDate, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(l.endDate, locale)}
                      </td>
                      <td className="text-end tabular">{Number(l.days)}</td>
                      <td>
                        <Badge tone={leaveTone(l.status)}>{t(`lstatus.${l.status}` as "lstatus.DRAFT")}</Badge>
                        {l.status === "SUBMITTED" && l.stage === "HR" && <span className="ms-1 text-[10px] text-os-faint">{t("hrStage")}</span>}
                      </td>
                      <td className="whitespace-nowrap text-end">
                        {l.status === "SUBMITTED" && l.approvalId && !own && (reportOf || manage) && (
                          <Link href={`/app/approvals?focus=${l.approvalId}`} className="os-btn-secondary h-7 px-2 text-xs">
                            {t("a.review")}
                          </Link>
                        )}
                        {(own || manage) && (l.status === "SUBMITTED" || l.status === "DRAFT" || l.status === "APPROVED") && (
                          <ActionForm
                            action={cancelLeaveAction}
                            args={[l.id]}
                            positional
                            trigger={t("a.cancel")}
                            triggerClass="os-btn-ghost h-7 px-2 text-xs"
                            submitLabel={t("a.cancelLeave")}
                            danger
                            fields={[{ name: "reason", label: t("f.reason"), type: "textarea" }]}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/hr/leave" params={{ ...sp, scope }} />
      </div>
    </div>
  );
}
