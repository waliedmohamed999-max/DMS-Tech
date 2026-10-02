import Link from "next/link";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";
import { employeeAssets } from "@/server/ops/assets";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { todayIn } from "@/server/commercial/dates";
import { employeeActivity, getEmployee } from "@/server/hr/employees";
import { bankAccounts, compensationHistory } from "@/server/hr/compensation";
import { attendanceMonth } from "@/server/hr/attendance";
import { balances } from "@/server/hr/leave";
import { employeePerformance } from "@/server/hr/performance";
import { attendanceTone, employeeTone, hrOptions, leaveTone, nameOf, payrollTone } from "@/lib/os/hr-page";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import {
  addCompensationAction, adjustBalanceAction, createAccountAction, createGoalAction, createReviewAction, employeeStatusAction, recordAttendanceAction, revealIbanAction, setBankAction, updateEmployeeAction, updateGoalAction, updateReviewAction
} from "@/lib/os/hr-actions";
import { Badge, EmptyState, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RevealIban } from "@/components/hr/Forms";

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
  const comp = tab === "compensation" && c.compensation ? await compensationHistory(ctx, id) : [];
  const m = (v: { toFixed(n: number): string } | string, cur = org.currency) => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, cur);
  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="grid grid-cols-[130px_1fr] gap-2 py-1">
      <dt className="text-os-muted">{k}</dt>
      <dd dir="auto">{v ?? "—"}</dd>
    </div>
  );

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
                ...(d.personalVisible
                  ? [
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
          {c.edit && !d.rel.self && (
            <ActionForm
              action={employeeStatusAction}
              args={[id]}
              trigger={t("a.changeStatus")}
              triggerClass="os-btn-ghost"
              submitLabel={t("save")}
              note={t("statusNote")}
              fields={[
                { name: "to", label: t("f.status"), type: "select", required: true, options: ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED"].filter((s) => s !== e.status).map((s) => ({ value: s, label: t(`status.${s}` as "status.ACTIVE") })) },
                { name: "terminationDate", label: t("f.terminationDate"), type: "date" },
                { name: "reason", label: t("f.reason"), type: "textarea" }
              ]}
            />
          )}
          {c.edit && !e.userId && can(ctx, "admin.users.manage") && (
            <ActionForm
              action={createAccountAction}
              args={[id]}
              positional
              trigger={t("a.createAccount")}
              triggerClass="os-btn-secondary"
              submitLabel={t("create")}
              note={t("createAccountNote")}
              fields={[{ name: "roleIds", label: t("f.roles"), type: "multiselect", required: true, options: (await prisma.role.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } })).map((r) => ({ value: r.id, label: (locale === "ar" && r.nameAr) || r.name })) }]}
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

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("contact")}>
            <dl className="p-4 text-sm">
              {row(t("f.workEmail"), e.workEmail && <span dir="ltr">{e.workEmail}</span>)}
              {row(t("f.workPhone"), e.workPhone && <span dir="ltr">{e.workPhone}</span>)}
              {row(t("f.personalEmail"), e.personalEmail && <span dir="ltr">{e.personalEmail}</span>)}
              {row(t("f.personalPhone"), e.personalPhone && <span dir="ltr">{e.personalPhone}</span>)}
              {row(t("f.emergency"), e.emergencyContactName ? `${e.emergencyContactName} · ${e.emergencyContactPhone ?? ""}` : null)}
            </dl>
            {!d.personalVisible && <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("maskedNote")}</p>}
          </SectionCard>
          <SectionCard title={t("team")}>
            <dl className="p-4 text-sm">
              {row(t("f.manager"), e.manager ? nameOf(e.manager, locale) : null)}
              {row(t("f.account"), e.user ? <span dir="ltr">{e.user.email}</span> : t("noAccount"))}
            </dl>
            <p className="border-t border-os-line px-4 py-2 text-xs font-semibold">{t("directReports", { n: e.reports.length })}</p>
            <ul className="divide-y divide-os-line text-sm">
              {e.reports.map((r) => (
                <li key={r.id} className="px-4 py-2">
                  <Link href={`/app/hr/employees/${r.id}`} className="hover:text-iris-light">
                    {nameOf(r, locale)}
                  </Link>
                  <span className="ms-2 text-xs text-os-faint">{r.jobTitle}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}

      {tab === "employment" && (
        <SectionCard title={t("tabs.employment")}>
          <dl className="grid p-4 text-sm sm:grid-cols-2 sm:gap-x-8">
            {row(t("f.employmentType"), t(`type.${e.employmentType}` as "type.FULL_TIME"))}
            {row(t("f.joinDate"), fmtDate(e.joinDate, locale))}
            {row(t("f.probationEnd"), e.probationEndDate ? fmtDate(e.probationEndDate, locale) : null)}
            {row(t("f.terminationDate"), e.terminationDate ? fmtDate(e.terminationDate, locale) : null)}
            {e.terminationReason && row(t("f.reason"), e.terminationReason)}
            {row(t("f.workLocation"), e.workLocation)}
            {row(t("f.city"), [e.city, e.country].filter(Boolean).join(", "))}
            {row(t("f.nationality"), e.nationality)}
          </dl>
        </SectionCard>
      )}

      {tab === "attendance" && <AttendanceTab employeeId={id} month={sp.month} manage={c.attendanceManage && !d.rel.self} />}

      {tab === "leave" && (
        <LeaveTab employeeId={id} year={today.getUTCFullYear()} manage={can(ctx, "hr.leave.manage") && d.rel.hr && !d.rel.self} />
      )}

      {tab === "compensation" && (
        <div className="grid gap-5">
          {c.compensation && (
            <SectionCard
              title={t("compensation")}
              action={
                c.compensationManage && !d.rel.self ? (
                  <ActionForm
                    action={addCompensationAction}
                    args={[id]}
                    trigger={`+ ${t("a.newCompensation")}`}
                    triggerClass="os-btn-primary h-8 px-3 text-xs"
                    submitLabel={t("save")}
                    note={t("compensationNote")}
                    fields={[
                      { name: "baseSalary", label: t("f.baseSalary"), type: "number", required: true },
                      { name: "housingAllowance", label: t("f.housing"), type: "number" },
                      { name: "transportAllowance", label: t("f.transport"), type: "number" },
                      { name: "otherFixedAllowance", label: t("f.otherAllowance"), type: "number" },
                      { name: "currency", label: t("f.currency"), value: org.currency, required: true },
                      { name: "effectiveFrom", label: t("f.effectiveFrom"), type: "date", required: true },
                      { name: "notes", label: t("f.notes"), type: "textarea" }
                    ]}
                  />
                ) : undefined
              }
            >
              {comp.length === 0 ? (
                <EmptyState icon="Briefcase" title={t("noCompensation")} text="" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="os-table">
                    <thead>
                      <tr>
                        <th>{t("f.effectiveFrom")}</th>
                        <th className="text-end">{t("f.baseSalary")}</th>
                        <th className="text-end">{t("f.housing")}</th>
                        <th className="text-end">{t("f.transport")}</th>
                        <th className="text-end">{t("f.otherAllowance")}</th>
                        <th className="text-end">{t("monthlyTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.map((r) => (
                        <tr key={r.id} className={r.effectiveTo ? "text-os-muted" : ""}>
                          <td className="whitespace-nowrap text-xs">
                            {fmtDate(r.effectiveFrom, locale)} {locale === "ar" ? "←" : "→"} {r.effectiveTo ? fmtDate(r.effectiveTo, locale) : <Badge tone="success">{t("current")}</Badge>}
                          </td>
                          <td className="text-end text-xs tabular" dir="ltr">{m(r.baseSalary, r.currency)}</td>
                          <td className="text-end text-xs tabular" dir="ltr">{m(r.housingAllowance, r.currency)}</td>
                          <td className="text-end text-xs tabular" dir="ltr">{m(r.transportAllowance, r.currency)}</td>
                          <td className="text-end text-xs tabular" dir="ltr">{m(r.otherFixedAllowance, r.currency)}</td>
                          <td className="text-end text-sm font-semibold tabular" dir="ltr">{m(r.baseSalary.plus(r.housingAllowance).plus(r.transportAllowance).plus(r.otherFixedAllowance), r.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("compHistoryNote")}</p>
            </SectionCard>
          )}
          {c.bank && (
            <SectionCard
              title={t("bank")}
              action={
                c.bankManage && !d.rel.self ? (
                  <ActionForm
                    action={setBankAction}
                    args={[id]}
                    trigger={`+ ${t("a.newBank")}`}
                    triggerClass="os-btn-secondary h-8 px-3 text-xs"
                    submitLabel={t("save")}
                    fields={[
                      { name: "bankName", label: t("f.bankName"), required: true },
                      { name: "accountName", label: t("f.accountName"), required: true },
                      { name: "iban", label: "IBAN", required: true, dir: "ltr" },
                      { name: "effectiveFrom", label: t("f.effectiveFrom"), type: "date", required: true }
                    ]}
                  />
                ) : undefined
              }
            >
              <ul className="divide-y divide-os-line text-sm">
                {(await bankAccounts(ctx, id)).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="font-medium">{b.bankName}</span>
                    <span className="text-xs text-os-muted">{b.accountName}</span>
                    {c.bankManage && !d.rel.self ? <RevealIban action={revealIbanAction} id={b.id} masked={b.iban} label={t("a.reveal")} /> : <span className="font-mono text-xs" dir="ltr">{b.iban}</span>}
                    <span className="flex-1" />
                    <span className="text-xs text-os-faint">{fmtDate(b.effectiveFrom, locale)}{b.effectiveTo ? ` ${locale === "ar" ? "←" : "→"} ${fmtDate(b.effectiveTo, locale)}` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("bankNote")}</p>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "payroll" && (
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
      )}

      {tab === "performance" && <PerformanceTab employeeId={id} manage={c.performanceManage && !d.rel.self} />}

      {tab === "documents" && <DocumentsPanel ctx={ctx} entity={{ type: "EMPLOYEE", id }} title={t("tabs.documents")} />}

      {tab === "assets" && <AssetsTab />}

      {tab === "activity" && (
        <SectionCard title={t("tabs.activity")}>
          <ul className="divide-y divide-os-line text-sm">
            {(await employeeActivity(ctx, id)).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="font-medium">{t.has(`audit.${a.action.replace(/\./g, "_")}`) ? t(`audit.${a.action.replace(/\./g, "_")}` as "audit.employee_created") : a.action}</span>
                <span className="text-xs text-os-muted">{personName(a.actor, locale) ?? t("system")}</span>
                <span className="flex-1" />
                <span className="text-xs text-os-faint">{fmtDateTime(a.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );

  async function AttendanceTab({ employeeId, month, manage }: { employeeId: string; month?: string; manage: boolean }) {
    const mm = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.toISOString().slice(0, 7);
    const a = await attendanceMonth(ctx, employeeId, mm);
    const [y, mo] = mm.split("-").map(Number);
    const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    const days = Array.from({ length: a.to.getUTCDate() }, (_, i) => new Date(Date.UTC(y, mo - 1, i + 1)));
    const rec = new Map(a.records.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const hol = new Set(a.holidays.map((h) => h.date.toISOString().slice(0, 10)));
    return (
      <SectionCard
        title={new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(a.from)}
        action={
          <span className="flex flex-wrap items-center gap-1">
            <Link href={`?tab=attendance&month=${prev}`} className="os-btn-ghost h-7 px-2 text-xs">‹</Link>
            <Link href={`?tab=attendance&month=${next}`} className="os-btn-ghost h-7 px-2 text-xs">›</Link>
            {manage && (
              <ActionForm
                action={recordAttendanceAction}
                trigger={t("a.recordAttendance")}
                triggerClass="os-btn-primary h-7 px-2 text-xs"
                submitLabel={t("save")}
                note={t("correctionNote")}
                fields={[
                  { name: "employeeId", label: "", type: "hidden", value: employeeId },
                  { name: "date", label: t("f.date"), type: "date", required: true, value: today.toISOString().slice(0, 10) },
                  { name: "status", label: t("f.status"), type: "select", required: true, value: "PRESENT", options: ["PRESENT", "LATE", "REMOTE", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "MISSING"].map((s) => ({ value: s, label: t(`att.${s}` as "att.PRESENT") })) },
                  { name: "checkIn", label: t("f.checkIn"), type: "time" },
                  { name: "checkOut", label: t("f.checkOut"), type: "time" },
                  { name: "notes", label: t("f.notes"), type: "textarea" }
                ]}
              />
            )}
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-px bg-os-line text-center text-[11px]">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={`h${i}`} className="bg-os-panel py-1 text-os-muted">
              {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i)))}
            </div>
          ))}
          {Array.from({ length: a.from.getUTCDay() }, (_, i) => (
            <div key={`pad${i}`} className="bg-os-surface/40" />
          ))}
          {days.map((d0) => {
            const k = d0.toISOString().slice(0, 10);
            const r = rec.get(k);
            const working = a.workingDays.includes(k);
            return (
              <div key={k} className={`min-h-[54px] bg-os-surface px-1 py-1.5 ${!working ? "opacity-50" : ""}`} title={r?.notes ?? undefined}>
                <p className="text-os-faint">{d0.getUTCDate()}</p>
                {r ? <Badge tone={attendanceTone(r.status)}>{t(`att.${r.status}` as "att.PRESENT")}</Badge> : hol.has(k) ? <span className="text-iris-light">{t("holiday")}</span> : null}
                {r?.workMinutes ? <p className="mt-0.5 tabular text-os-muted" dir="ltr">{Math.floor(r.workMinutes / 60)}:{String(r.workMinutes % 60).padStart(2, "0")}</p> : null}
              </div>
            );
          })}
        </div>
        <p className="border-t border-os-line px-4 py-2 text-xs text-os-muted">
          {t("attTotals", { present: a.totals.present, late: a.totals.late, absent: a.totals.absent, missing: a.totals.missing, hours: Math.round(a.totals.minutes / 6) / 10 })}
        </p>
      </SectionCard>
    );
  }

  async function LeaveTab({ employeeId, year, manage }: { employeeId: string; year: number; manage: boolean }) {
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

  async function AssetsTab() {
    const rows = await employeeAssets(ctx, id);
    const to = await getTranslations("os.ops");
    const open = rows.filter((r) => !r.returnedAt);
    return (
      <SectionCard title={`${to("assets")} · ${to("openN", { n: open.length })}`}>
        {["TERMINATED", "ARCHIVED"].includes(e.status) && open.length > 0 && <p className="border-b border-os-line bg-danger/10 px-4 py-2 text-xs text-danger">{to("returnRequired")}</p>}
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{to("noAssignments")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/app/assets/${r.asset.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                  <span className="text-[11px] text-os-faint" dir="ltr">{r.asset.number}</span> {r.asset.name}
                </Link>
                {!r.returnedAt ? <Badge tone="info">{to("current")}</Badge> : <span className="text-[11px] text-os-faint">{to("returnedOn")} {fmtDate(r.returnedAt, locale)}</span>}
                <span className="text-[11px] text-os-faint">{fmtDate(r.assignedAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    );
  }

  async function PerformanceTab({ employeeId, manage }: { employeeId: string; manage: boolean }) {
    const p = await employeePerformance(ctx, employeeId);
    const reviewer = (uid: string) => personName(p.reviewers.find((r) => r.id === uid), locale);
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title={t("reviews")}
          action={
            manage ? (
              <ActionForm
                action={createReviewAction}
                trigger={`+ ${t("a.newReview")}`}
                triggerClass="os-btn-primary h-8 px-3 text-xs"
                submitLabel={t("create")}
                fields={[
                  { name: "employeeId", label: "", type: "hidden", value: employeeId },
                  { name: "periodLabel", label: t("f.periodLabel"), required: true, value: `${today.getUTCFullYear()}-H${today.getUTCMonth() < 6 ? 1 : 2}` },
                  { name: "periodStart", label: t("f.periodStart"), type: "date", required: true },
                  { name: "periodEnd", label: t("f.periodEnd"), type: "date", required: true },
                  { name: "dueDate", label: t("f.dueDate"), type: "date" }
                ]}
              />
            ) : undefined
          }
        >
          {p.reviews.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noReviews")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {p.reviews.map((r) => (
                <li key={r.id} className="grid gap-1 px-4 py-2.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.periodLabel}</span>
                    <Badge tone={r.status === "COMPLETED" || r.status === "ACKNOWLEDGED" ? "success" : "warning"}>{t(`rstatus.${r.status}` as "rstatus.DRAFT")}</Badge>
                    {r.rating && <span className="text-xs text-gold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>}
                    <span className="flex-1" />
                    <span className="text-xs text-os-faint">{reviewer(r.reviewerId)}{r.dueDate ? ` · ${t("due")} ${fmtDate(r.dueDate, locale)}` : ""}</span>
                  </p>
                  {r.summary && <p className="whitespace-pre-line text-xs text-os-muted" dir="auto">{r.summary}</p>}
                  {manage && (r.status === "DRAFT" || r.status === "IN_REVIEW") && (
                    <ActionForm
                      action={updateReviewAction}
                      args={[r.id]}
                      trigger={t("a.completeReview")}
                      triggerClass="os-btn-ghost h-7 justify-self-start px-2 text-xs"
                      submitLabel={t("save")}
                      fields={[
                        { name: "status", label: t("f.status"), type: "select", required: true, value: "COMPLETED", options: [{ value: "IN_REVIEW", label: t("rstatus.IN_REVIEW") }, { value: "COMPLETED", label: t("rstatus.COMPLETED") }] },
                        { name: "rating", label: t("f.rating"), type: "select", options: ["1", "2", "3", "4", "5"].map((x) => ({ value: x, label: "★".repeat(Number(x)) })) },
                        { name: "summary", label: t("f.summary"), type: "textarea", value: r.summary ?? "" }
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title={t("goals")}
          action={
            manage || p.can.self ? (
              <ActionForm
                action={createGoalAction}
                trigger={`+ ${t("a.newGoal")}`}
                triggerClass="os-btn-secondary h-8 px-3 text-xs"
                submitLabel={t("create")}
                fields={[
                  { name: "employeeId", label: "", type: "hidden", value: employeeId },
                  { name: "title", label: t("f.title"), required: true },
                  { name: "weight", label: t("f.weight"), type: "number", value: "0" },
                  { name: "dueDate", label: t("f.dueDate"), type: "date" },
                  { name: "description", label: t("f.description"), type: "textarea" }
                ]}
              />
            ) : undefined
          }
        >
          {p.goals.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noGoals")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {p.goals.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    {g.title}
                    {g.weight ? <span className="ms-1 text-xs text-os-faint">{g.weight}%</span> : null}
                  </span>
                  <Badge tone={g.status === "ACHIEVED" ? "success" : g.status === "MISSED" ? "danger" : "neutral"}>{t(`gstatus.${g.status}` as "gstatus.NOT_STARTED")}</Badge>
                  {(manage || p.can.self) && !["ACHIEVED", "MISSED", "CANCELLED"].includes(g.status) && (
                    <ActionForm
                      action={updateGoalAction}
                      args={[g.id]}
                      trigger={t("a.update")}
                      triggerClass="os-btn-ghost h-7 px-2 text-xs"
                      submitLabel={t("save")}
                      fields={[
                        { name: "status", label: t("f.status"), type: "select", required: true, value: g.status, options: (manage ? ["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "MISSED", "CANCELLED"] : ["NOT_STARTED", "IN_PROGRESS"]).map((s) => ({ value: s, label: t(`gstatus.${s}` as "gstatus.NOT_STARTED") })) },
                        { name: "result", label: t("f.result"), type: "textarea", value: g.result ?? "" }
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    );
  }
}
