import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { payrollTone } from "@/lib/os/hr-page";
import { Badge, SectionCard } from "@/components/os/ui";
import type { EmployeeTabCtx } from "./context";

export async function Payroll({ tc }: { tc: EmployeeTabCtx }) {
  const { ctx, id, d, locale, t, m } = tc;
  return (
    <SectionCard title={t("tabs.payroll")}>
      <ul className="divide-y divide-os-line text-sm">
        {(await prisma.payrollEntry.findMany({ where: { employeeId: id, ...(d.rel.self && !can(ctx, "hr.payroll.view") ? { period: { status: { in: ["PAID", "CLOSED"] } } } : {}) }, orderBy: { period: { periodStart: "desc" } }, include: { period: { select: { id: true, name: true, status: true } } } })).map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="font-medium"><bdi dir="ltr">{x.period.name}</bdi></span>
            <Badge tone={payrollTone(x.period.status)}>{t(`pstatus.${x.period.status}` as "pstatus.DRAFT")}</Badge>
            <span className="flex-1" />
            <span className="text-xs text-os-muted">{t("gross")} <span dir="ltr">{m(x.grossPay, x.currency)}</span></span>
            <span className="text-sm font-semibold" dir="ltr">{m(x.netPay, x.currency)}</span>
            {["PAID", "CLOSED"].includes(x.period.status) || can(ctx, "hr.payroll.view") ? (
              <a href={`/app/hr/payroll/entries/${x.id}/payslip?lang=${locale}`} target="_blank" rel="noopener" className="os-btn-ghost h-7 px-2 text-xs">
                {t("payslip")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
