import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getPeriod, listComponents } from "@/server/hr/payroll";
import { employeeOptions } from "@/server/hr/employees";
import { nameOf, payrollTone } from "@/lib/os/hr-page";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { addAdjustmentAction, calculatePeriodAction, closePayrollAction, payPayrollAction, removeAdjustmentAction, submitPayrollAction, withdrawPayrollAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "Payroll period" };
const FIXED = new Set(["BASE_SALARY", "HOUSING_ALLOWANCE", "TRANSPORT_ALLOWANCE", "OTHER_ALLOWANCE", "UNPAID_LEAVE"]);
const STEPS = ["DRAFT", "REVIEW", "APPROVED", "PAID", "CLOSED"] as const;

/**
 * Payroll period. Lines (per employee) need hr.payroll.view or prepare; an approver / payer without those
 * sees the totals and the workflow only. Every transition is re-validated on the server.
 */
export default async function PayrollPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  let d;
  try {
    d = await getPeriod(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    if (isAppError(e) && e.code === "FORBIDDEN") return <PermissionDenied permission="hr.payroll.view" />;
    throw e;
  }
  const p = d.period;
  const m = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), locale, p.currency);
  const prepare = can(ctx, "hr.payroll.prepare");
  const pending = d.approval?.status === "PENDING";
  const editable = prepare && (p.status === "DRAFT" || p.status === "REVIEW") && !pending;
  const who = (uid: string | null) => (uid ? personName(d.people.find((x) => x.id === uid), locale) : null);
  const [components, emps] = editable ? await Promise.all([listComponents(ctx.organizationId), employeeOptions(ctx)]) : [[], []];
  const stepIdx = STEPS.indexOf(p.status as (typeof STEPS)[number]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/hr/payroll" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {t("payroll")} · <bdi dir="ltr">{p.name}</bdi>
            <Badge tone={payrollTone(p.status)} dot>
              {t(`pstatus.${p.status}` as "pstatus.DRAFT")}
            </Badge>
            {pending && <Badge tone="warning">{t("inApproval")}</Badge>}
          </h1>
          <p className="mt-1 text-xs text-os-muted">
            {fmtDate(p.periodStart, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(p.periodEnd, locale)} · {t("f.payDate")}: {fmtDate(p.payDate, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {editable && <RunButton action={calculatePeriodAction} args={[id]} label={p.status === "DRAFT" ? t("a.calculate") : t("a.recalculate")} className="os-btn-secondary" />}
          {editable && p.status === "REVIEW" && <RunButton action={submitPayrollAction} args={[id]} label={t("a.submitApproval")} className="os-btn-primary" />}
          {prepare && pending && <RunButton action={withdrawPayrollAction} args={[id]} label={t("a.withdraw")} className="os-btn-ghost" />}
          {can(ctx, "hr.payroll.pay") && p.status === "APPROVED" && (
            <ActionForm
              action={payPayrollAction}
              args={[id]}
              trigger={t("a.markPaid")}
              submitLabel={t("a.markPaid")}
              note={t("markPaidNote")}
              confirm={t("markPaidConfirm", { net: m(p.netTotal), n: p.employeeCount })}
              fields={[
                { name: "paidDate", label: t("f.paidDate"), type: "date" },
                { name: "paymentReference", label: t("f.reference"), dir: "ltr" }
              ]}
            />
          )}
          {(prepare || can(ctx, "hr.payroll.pay")) && p.status === "PAID" && <RunButton action={closePayrollAction} args={[id]} label={t("a.closePeriod")} className="os-btn-ghost" confirmText={t("closeConfirm")} />}
        </div>
      </div>

      <ol className="flex flex-wrap gap-1 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full border px-2.5 py-1 ${i < stepIdx ? "border-success/40 text-success" : i === stepIdx ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-faint"}`}>
            {t(`pstatus.${s}` as "pstatus.DRAFT")}
          </li>
        ))}
      </ol>

      {p.rejectionComment && <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{t("rejectedWith", { c: p.rejectionComment })}</p>}
      {pending && d.approval && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          {t("awaitingApproval")}{" "}
          <Link href={`/app/approvals?focus=${d.approval.id}`} className="underline">
            {t("openApproval")}
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-4">
        {(
          [
            ["employeesCol", String(p.employeeCount)],
            ["gross", m(p.grossTotal)],
            ["totalDeductions", m(p.deductionTotal)],
            ["net", m(p.netTotal)]
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t(k)}</p>
            <p className="mt-0.5 text-lg font-semibold tabular" dir="ltr">
              {v}
            </p>
          </div>
        ))}
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-xs text-os-muted sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {t("preparedBy")}: <span className="text-os-text">{who(p.preparedById) ?? "—"}</span>
        </div>
        <div>
          {t("calculatedAt")}: <span className="text-os-text">{p.calculatedAt ? fmtDateTime(p.calculatedAt, locale) : "—"}</span>
        </div>
        <div>
          {t("approvedBy")}: <span className="text-os-text">{who(p.approvedById) ?? "—"}</span>
        </div>
        <div>
          {t("paidBy")}:{" "}
          <span className="text-os-text">
            {who(p.paidById) ?? "—"}
            {p.paymentReference ? ` · ${p.paymentReference}` : ""}
          </span>
        </div>
      </dl>

      {!d.canLines ? (
        <p className="os-card px-4 py-6 text-center text-sm text-os-muted">{t("linesHidden")}</p>
      ) : (
        <>
          <SectionCard
            title={t("adjustments")}
            action={
              editable ? (
                <ActionForm
                  action={addAdjustmentAction}
                  args={[id]}
                  trigger={`+ ${t("a.addAdjustment")}`}
                  triggerClass="os-btn-primary h-8 px-3 text-xs"
                  submitLabel={t("save")}
                  note={t("adjustmentNote")}
                  fields={[
                    { name: "employeeId", label: t("f.employee"), type: "select", required: true, options: emps.map((e) => ({ value: e.id, label: `${nameOf(e, locale)} · ${e.number}` })) },
                    { name: "componentKey", label: t("f.component"), type: "select", required: true, options: components.filter((c) => c.active && !FIXED.has(c.key)).map((c) => ({ value: c.key, label: `${locale === "ar" ? c.nameAr : c.nameEn} (${t(`kind.${c.kind}` as "kind.EARNING")})` })) },
                    { name: "amount", label: t("f.amount"), type: "number", required: true, dir: "ltr", step: "0.01" },
                    { name: "reason", label: t("f.reason"), type: "textarea", required: true },
                    { name: "source", label: t("f.source") }
                  ]}
                />
              ) : undefined
            }
          >
            {(d.adjustments ?? []).length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-os-muted">{t("noAdjustments")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {d.adjustments!.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="font-medium">{nameOf(a.employee, locale)}</span>
                    <Badge tone={a.component.kind === "DEDUCTION" ? "danger" : "success"}>{locale === "ar" ? a.component.nameAr : a.component.nameEn}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-os-muted" dir="auto">
                      {a.reason}
                    </span>
                    <span className="font-semibold tabular" dir="ltr">
                      {a.component.kind === "DEDUCTION" ? "−" : "+"}
                      {m(a.amount)}
                    </span>
                    {editable && <RunButton action={removeAdjustmentAction} args={[a.id]} label="✕" className="os-btn-ghost h-7 px-2 text-xs" confirmText={t("removeConfirm")} />}
                  </li>
                ))}
              </ul>
            )}
            {editable && p.status === "REVIEW" && (d.adjustments ?? []).length > 0 && <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("recalcHint")}</p>}
          </SectionCard>

          <SectionCard title={t("entries")}>
            {(d.entries ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-os-muted">{p.status === "DRAFT" ? t("notCalculated") : t("noEntries")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="os-table">
                  <thead>
                    <tr>
                      <th>{t("f.employee")}</th>
                      <th className="hidden text-end md:table-cell">{t("f.baseSalary")}</th>
                      <th className="hidden text-end lg:table-cell">{t("allowances")}</th>
                      <th className="hidden text-end md:table-cell">{t("bonusesOther")}</th>
                      <th className="text-end">{t("totalDeductions")}</th>
                      <th className="text-end">{t("net")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.entries!.map((e) => {
                      const meta = e.calculationMeta as { prorated?: boolean; activeDays?: number; periodDays?: number };
                      return (
                        <tr key={e.id}>
                          <td className="min-w-[180px]">
                            <span className="font-medium">{(locale === "ar" && e.employeeNameAr) || e.employeeName}</span>
                            <span className="block text-[11px] text-os-faint">
                              <span dir="ltr">{e.employeeNumber}</span>
                              {e.departmentName ? ` · ${(locale === "ar" && e.departmentNameAr) || e.departmentName}` : ""}
                              {meta?.prorated ? ` · ${t("proratedN", { a: meta.activeDays ?? 0, b: meta.periodDays ?? 0 })}` : ""}
                            </span>
                          </td>
                          <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">
                            {m(e.baseSalary)}
                          </td>
                          <td className="hidden text-end text-xs tabular lg:table-cell" dir="ltr">
                            {m(e.housingAllowance.plus(e.transportAllowance).plus(e.otherFixedAllowance))}
                          </td>
                          <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">
                            {m(e.bonuses.plus(e.otherEarnings))}
                          </td>
                          <td className="text-end text-xs tabular" dir="ltr">
                            {m(e.totalDeductions)}
                          </td>
                          <td className="text-end font-semibold tabular" dir="ltr">
                            {m(e.netPay)}
                          </td>
                          <td className="text-end">
                            {can(ctx, "hr.payroll.view") && (
                              <a href={`/app/hr/payroll/entries/${e.id}/payslip?lang=${locale}`} target="_blank" rel="noopener" className="os-btn-ghost h-7 px-2 text-xs">
                                {t("payslip")}
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
      <p className="text-[11px] text-os-faint">{t("payrollFinanceNote")}</p>
    </div>
  );
}
