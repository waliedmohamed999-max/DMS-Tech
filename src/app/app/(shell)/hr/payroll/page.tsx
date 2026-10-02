import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can, canAny } from "@/server/context";
import { listPeriods } from "@/server/hr/payroll";
import { payrollTone } from "@/lib/os/hr-page";
import { createPeriodAction } from "@/lib/os/hr-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Payroll" };

/** Payroll periods — totals only. Employee lines live on the period page behind hr.payroll.view / prepare. */
export default async function PayrollPage() {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "hr.payroll.view", "hr.payroll.prepare", "hr.payroll.approve", "hr.payroll.pay")) return <PermissionDenied permission="hr.payroll.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const periods = await listPeriods(ctx);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="CreditCard"
        title={t("payroll")}
        subtitle={t("payrollSubtitle")}
        actions={
          can(ctx, "hr.payroll.prepare") ? (
            <ActionForm
              action={createPeriodAction}
              trigger={`+ ${t("a.newPeriod")}`}
              submitLabel={t("create")}
              redirect="/app/hr/payroll/:id"
              note={t("newPeriodNote")}
              fields={[
                { name: "name", label: t("f.periodName"), hint: t("periodNameHint") },
                { name: "periodStart", label: t("f.periodStart"), type: "date", required: true },
                { name: "periodEnd", label: t("f.periodEnd"), type: "date", required: true },
                { name: "payDate", label: t("f.payDate"), type: "date", required: true }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        {periods.length === 0 ? (
          <EmptyState icon="CreditCard" title={t("noPeriods")} text={t("noPeriodsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.period")}</th>
                  <th className="hidden md:table-cell">{t("f.payDate")}</th>
                  <th className="text-end">{t("employeesCol")}</th>
                  <th className="hidden text-end md:table-cell">{t("gross")}</th>
                  <th className="text-end">{t("net")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/app/hr/payroll/${p.id}`} className="font-medium hover:text-iris-light">
                        <bdi dir="ltr">{p.name}</bdi>
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        {fmtDate(p.periodStart, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(p.periodEnd, locale)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap text-xs text-os-muted md:table-cell">{fmtDate(p.payDate, locale)}</td>
                    <td className="text-end tabular">{p.employeeCount}</td>
                    <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">{formatMoney(p.grossTotal.toFixed(2), locale, p.currency)}</td>
                    <td className="text-end font-semibold tabular" dir="ltr">{formatMoney(p.netTotal.toFixed(2), locale, p.currency)}</td>
                    <td>
                      <Badge tone={payrollTone(p.status)}>{t(`pstatus.${p.status}` as "pstatus.DRAFT")}</Badge>
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
