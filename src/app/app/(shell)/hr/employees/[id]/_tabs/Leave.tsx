import { prisma } from "@/server/db";
import { balances } from "@/server/hr/leave";
import { leaveTone } from "@/lib/os/hr-page";
import { adjustBalanceAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";
import type { EmployeeTabCtx } from "./context";

export async function Leave({ tc, employeeId, year, manage }: { tc: EmployeeTabCtx; employeeId: string; year: number; manage: boolean }) {
  const { ctx, locale, t } = tc;
  const [bal, reqs, types] = await Promise.all([
    balances(ctx, employeeId, year),
    prisma.leaveRequest.findMany({ where: { employeeId }, orderBy: { startDate: "desc" }, take: 30, include: { leaveType: { select: { nameAr: true, nameEn: true } } } }),
    prisma.leaveType.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { sortOrder: "asc" } })
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <SectionCard
        title={t("balancesYear", { y: year })}
        action={
          manage ? (
            <ActionForm
              action={adjustBalanceAction}
              trigger={t("a.adjustBalance")}
              triggerClass="os-btn-ghost h-7 px-2 text-xs"
              submitLabel={t("save")}
              fields={[
                { name: "employeeId", label: "", type: "hidden", value: employeeId },
                { name: "leaveTypeId", label: t("f.leaveType"), type: "select", required: true, options: types.map((x) => ({ value: x.id, label: locale === "ar" ? x.nameAr : x.nameEn })) },
                { name: "year", label: t("f.year"), type: "number", value: String(year), required: true },
                { name: "days", label: t("f.days"), type: "number", required: true, hint: t("daysHint") },
                { name: "reason", label: t("f.reason"), type: "textarea", required: true }
              ]}
            />
          ) : undefined
        }
      >
        <ul className="divide-y divide-os-line text-sm">
          {bal.map((b) => (
            <li key={b.type.id} className="flex items-center gap-3 px-4 py-2">
              <span className="flex-1">{locale === "ar" ? b.type.nameAr : b.type.nameEn}</span>
              {b.tracked ? (
                <span className="text-xs text-os-muted tabular">
                  {t("balanceLine", { opening: Number(b.opening) + Number(b.accrual) + Number(b.adjustment), used: Number(b.usage) - Number(b.reversal), remaining: Number(b.remaining) })}
                </span>
              ) : (
                <span className="text-xs text-os-faint">{t("notTracked")}</span>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title={t("requests")}>
        {reqs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noLeave")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {reqs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="flex-1">{locale === "ar" ? l.leaveType.nameAr : l.leaveType.nameEn}</span>
                <span className="text-xs text-os-muted">
                  {fmtDate(l.startDate, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(l.endDate, locale)} · {t("daysN", { n: Number(l.days) })}
                </span>
                <Badge tone={leaveTone(l.status)}>{t(`lstatus.${l.status}` as "lstatus.DRAFT")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
