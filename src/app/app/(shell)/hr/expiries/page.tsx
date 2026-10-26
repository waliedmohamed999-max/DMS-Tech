import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { EXPIRY_KINDS, FINAL_WARNING_DAYS, listExpiries } from "@/server/hr/expiries";
import { sweepHrIfDue } from "@/server/hr/sweep";
import { expiryTone, nameOf } from "@/lib/os/hr-page";
import { expiryWarningDaysAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Expiry alerts" };

/** Iqama / work visa / passport / employment contract register — what needs renewing before it costs the company a fine. */
export default async function ExpiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("hr.employees.view");
  if (!allowed) return <PermissionDenied permission="hr.employees.view" />;
  await sweepHrIfDue(ctx.organizationId);
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const d = await listExpiries(ctx, sp);
  const left = (days: number) => (days < 0 ? t("exp.overdue", { n: -days }) : days === 0 ? t("exp.today") : t("exp.daysLeft", { n: days }));
  const cells: [string, number, string][] = [
    ["expired", d.counts.expired, "text-danger"],
    ["final", d.counts.final, "text-warning"],
    ["warning", d.counts.warning, "text-info"]
  ];
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="CalendarClock"
        title={t("exp.title")}
        subtitle={t("exp.subtitle")}
        actions={
          can(ctx, "hr.attendance.manage") ? (
            <ActionForm
              action={expiryWarningDaysAction}
              trigger={t("exp.warnSetting", { n: d.warnDays })}
              triggerClass="os-btn-ghost"
              submitLabel={t("save")}
              note={t("exp.warnNote", { final: FINAL_WARNING_DAYS })}
              fields={[{ name: "days", label: t("exp.warnDays"), type: "number", required: true, value: String(d.warnDays) }]}
            />
          ) : undefined
        }
      />
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line">
        {cells.map(([k, n, cls]) => (
          <div key={k} className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t(`exp.kpi.${k}` as "exp.kpi.expired", { n: d.warnDays, final: FINAL_WARNING_DAYS })}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular ${n ? cls : ""}`}>{n}</p>
          </div>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar
          selects={[
            { name: "show", allLabel: t("exp.needAction"), options: [{ value: "all", label: t("exp.showAll") }] },
            { name: "kind", allLabel: t("exp.allKinds"), options: EXPIRY_KINDS.map((k) => ({ value: k, label: t(`exp.kind.${k}` as "exp.kind.IQAMA") })) }
          ]}
        />
        {d.rows.length === 0 ? (
          <EmptyState icon="CircleCheck" title={t("exp.empty")} text={t("exp.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.employee")}</th>
                  <th className="hidden sm:table-cell">{t("exp.col.kind")}</th>
                  {d.numbers && <th className="hidden md:table-cell">{t("exp.col.number")}</th>}
                  <th>{t("exp.col.expiry")}</th>
                  <th className="hidden sm:table-cell">{t("exp.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-[150px]">
                      <Link href={`/app/hr/employees/${r.employee.id}?tab=expiries`} className="font-medium hover:text-iris-light">
                        {nameOf(r.employee, locale)}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{r.employee.number}</span>
                        {r.employee.jobTitle ? ` · ${r.employee.jobTitle}` : ""}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium sm:hidden">{t(`exp.kind.${r.kind}` as "exp.kind.IQAMA")}</span>
                    </td>
                    <td className="hidden whitespace-nowrap text-sm sm:table-cell">{t(`exp.kind.${r.kind}` as "exp.kind.IQAMA")}</td>
                    {d.numbers && (
                      <td className="hidden text-xs text-os-muted md:table-cell">
                        <span dir="ltr">{r.number ?? "—"}</span>
                      </td>
                    )}
                    <td className="whitespace-nowrap text-xs">
                      {fmtDate(r.expiryDate, locale)}
                      <span className="block text-[11px] text-os-faint">{left(r.days)}</span>
                      {/* phones: the status sits under the date instead of in a column off-screen */}
                      <span className="mt-1 block sm:hidden">
                        <Badge tone={expiryTone(r.stage)} dot>
                          {t(`exp.stage.${r.stage}` as "exp.stage.ok")}
                        </Badge>
                      </span>
                    </td>
                    <td className="hidden sm:table-cell">
                      <Badge tone={expiryTone(r.stage)} dot>
                        {t(`exp.stage.${r.stage}` as "exp.stage.ok")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
