import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { todayIn } from "@/server/commercial/dates";
import { listHolidays, policyOf } from "@/server/hr/attendance";
import { listLeaveTypes } from "@/server/hr/leave";
import { listComponents } from "@/server/hr/payroll";
import { addHolidayAction, grantOpeningAction, removeHolidayAction, saveLeaveTypeAction, savePolicyAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "HR settings" };

/**
 * Company-configurable HR rules. Nothing statutory is hard-coded: working week, grace, leave balances,
 * unpaid-leave deduction and proration are all explicit settings here (every change audited).
 */
export default async function HrSettingsPage() {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "hr.attendance.manage", "hr.leave.manage", "hr.payroll.prepare")) return <PermissionDenied permission="hr.attendance.manage" />;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const year = today.getUTCFullYear();
  const [policy, holidays, types, components] = await Promise.all([policyOf(prisma, ctx.organizationId), listHolidays(ctx.organizationId, new Date(Date.UTC(year - 1, 0, 1))), listLeaveTypes(ctx.organizationId, true), listComponents(ctx.organizationId)]);
  const att = can(ctx, "hr.attendance.manage");
  const policyEdit = att && can(ctx, "hr.records.all");
  const leave = can(ctx, "hr.leave.manage");
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d))) }));
  const yes = (b: boolean) => (b ? t("yes") : t("no"));
  const typeFields = (x?: (typeof types)[number]) => [
    { name: "id", label: "id", type: "hidden" as const, value: x?.id ?? "" },
    { name: "nameAr", label: t("f.nameAr"), required: true, value: x?.nameAr ?? "", dir: "rtl" as const },
    { name: "nameEn", label: t("f.nameEn"), required: true, value: x?.nameEn ?? "", dir: "ltr" as const },
    { name: "defaultBalanceDays", label: t("f.defaultBalance"), type: "number" as const, value: x?.defaultBalanceDays?.toString() ?? "", hint: t("defaultBalanceHint") },
    { name: "paid", label: t("f.paid"), type: "checkbox" as const, value: x?.paid ?? true },
    { name: "requiresApproval", label: t("f.requiresApproval"), type: "checkbox" as const, value: x?.requiresApproval ?? true },
    { name: "requiresAttachment", label: t("f.requiresAttachment"), type: "checkbox" as const, value: x?.requiresAttachment ?? false },
    { name: "active", label: t("f.active"), type: "checkbox" as const, value: x?.active ?? true }
  ];

  return (
    <div className="grid gap-5">
      <PageHeader icon="SlidersHorizontal" title={t("settings")} subtitle={t("settingsSubtitle")} />
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("policy")}
          action={
            policyEdit ? (
              <ActionForm
                action={savePolicyAction}
                trigger={t("a.edit")}
                triggerClass="os-btn-ghost h-7 px-2 text-xs"
                submitLabel={t("save")}
                note={t("policyNote")}
                fields={[
                  { name: "workdayStart", label: t("f.workdayStart"), type: "time", required: true, value: policy.workdayStart },
                  { name: "workdayEnd", label: t("f.workdayEnd"), type: "time", required: true, value: policy.workdayEnd },
                  { name: "graceMinutes", label: t("f.grace"), type: "number", required: true, value: String(policy.graceMinutes) },
                  { name: "dailyExpectedMinutes", label: t("f.dailyMinutes"), type: "number", required: true, value: String(policy.dailyExpectedMinutes) },
                  { name: "workingDays", label: t("f.workingDays"), type: "multiselect", required: true, value: policy.workingDays.map(String), options: days },
                  { name: "leaveMarksAttendance", label: t("f.leaveMarksAttendance"), type: "checkbox", value: policy.leaveMarksAttendance },
                  { name: "leaveRequiresHrApproval", label: t("f.leaveRequiresHr"), type: "checkbox", value: policy.leaveRequiresHrApproval },
                  { name: "payrollProrate", label: t("f.prorate"), type: "checkbox", value: policy.payrollProrate },
                  { name: "payrollDeductUnpaidLeave", label: t("f.deductUnpaid"), type: "checkbox", value: policy.payrollDeductUnpaidLeave }
                ]}
              />
            ) : undefined
          }
        >
          <dl className="grid gap-1 p-4 text-sm">
            {(
              [
                [t("f.workday"), <span key="w" dir="ltr">{policy.workdayStart} – {policy.workdayEnd}</span>],
                [t("f.grace"), t("minutesN", { n: policy.graceMinutes })],
                [t("f.dailyMinutes"), t("minutesN", { n: policy.dailyExpectedMinutes })],
                [t("f.workingDays"), policy.workingDays.map((d) => days[d]?.label).join("، ")],
                [t("f.leaveMarksAttendance"), yes(policy.leaveMarksAttendance)],
                [t("f.leaveRequiresHr"), yes(policy.leaveRequiresHrApproval)],
                [t("f.prorate"), yes(policy.payrollProrate)],
                [t("f.deductUnpaid"), yes(policy.payrollDeductUnpaidLeave)]
              ] as [string, React.ReactNode][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <dt className="text-os-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("noStatutory")}</p>
        </SectionCard>

        <SectionCard
          title={t("holidays")}
          action={
            att ? (
              <ActionForm
                action={addHolidayAction}
                trigger={`+ ${t("a.addHoliday")}`}
                triggerClass="os-btn-ghost h-7 px-2 text-xs"
                submitLabel={t("save")}
                fields={[
                  { name: "date", label: t("f.date"), type: "date", required: true },
                  { name: "name", label: t("f.nameEn"), required: true, dir: "ltr" },
                  { name: "nameAr", label: t("f.nameAr"), dir: "rtl" },
                  { name: "location", label: t("f.workLocation") }
                ]}
              />
            ) : undefined
          }
        >
          <ul className="divide-y divide-os-line text-sm">
            {holidays.length === 0 && <li className="px-4 py-5 text-center text-xs text-os-faint">{t("noHolidays")}</li>}
            {holidays.map((h) => (
              <li key={h.id} className={`flex items-center gap-3 px-4 py-2 ${h.date < today ? "text-os-muted" : ""}`}>
                <span className="w-32 shrink-0 text-xs">{fmtDate(h.date, locale, { dateStyle: "medium", timeZone: "UTC" })}</span>
                <span className="flex-1">{(locale === "ar" && h.nameAr) || h.name}</span>
                {att && h.date >= today && <RunButton action={removeHolidayAction} args={[h.id]} label="✕" className="os-btn-ghost h-7 px-2 text-xs" confirmText={t("removeConfirm")} />}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title={t("leaveTypes")}
          action={
            leave ? (
              <span className="flex gap-1">
                {can(ctx, "hr.records.all") && <RunButton action={grantOpeningAction} args={[year]} label={t("a.grantOpening", { y: year })} className="os-btn-ghost h-7 px-2 text-xs" confirmText={t("grantConfirm", { y: year })} />}
                <ActionForm action={saveLeaveTypeAction} trigger={`+ ${t("a.newLeaveType")}`} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("save")} fields={typeFields().filter((f) => f.name !== "id")} />
              </span>
            ) : undefined
          }
        >
          <ul className="divide-y divide-os-line text-sm">
            {types.map((x) => (
              <li key={x.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${x.active ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">{locale === "ar" ? x.nameAr : x.nameEn}</span>
                <Badge tone={x.paid ? "success" : "warning"}>{x.paid ? t("paid") : t("unpaid")}</Badge>
                <span className="text-xs text-os-muted">{x.defaultBalanceDays ? t("daysPerYear", { n: Number(x.defaultBalanceDays) }) : t("notTracked")}</span>
                {!x.requiresApproval && <Badge tone="info">{t("autoApproved")}</Badge>}
                {leave && <ActionForm action={saveLeaveTypeAction} trigger={t("a.edit")} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("save")} fields={typeFields(x)} />}
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("leaveTypesNote")}</p>
        </SectionCard>

        <SectionCard title={t("payrollComponents")}>
          <ul className="divide-y divide-os-line text-sm">
            {components.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1">{locale === "ar" ? c.nameAr : c.nameEn}</span>
                <span className="text-[11px] text-os-faint" dir="ltr">{c.key}</span>
                <Badge tone={c.kind === "DEDUCTION" ? "danger" : "success"}>{t(`kind.${c.kind}` as "kind.EARNING")}</Badge>
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">
            {t("componentsNote")}{" "}
            {can(ctx, "admin.departments.manage") && (
              <Link href="/app/admin/departments" className="text-iris-light hover:underline">
                {t("manageDepartments")}
              </Link>
            )}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
