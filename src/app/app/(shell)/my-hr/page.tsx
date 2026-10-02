import Link from "next/link";
import { myAssets } from "@/server/ops/assets";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { todayIn } from "@/server/commercial/dates";
import { myEmployee } from "@/server/hr/access";
import { attendanceMonth } from "@/server/hr/attendance";
import { balances, listLeaveTypes } from "@/server/hr/leave";
import { myPayslips } from "@/server/hr/payroll";
import { employeePerformance } from "@/server/hr/performance";
import { myInterviews } from "@/server/hr/recruitment";
import { attendanceTone, leaveTone, nameOf } from "@/lib/os/hr-page";
import { acknowledgeReviewAction, cancelLeaveAction, createLeaveAction, selfCheckAction, updateGoalAction } from "@/lib/os/hr-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, fmtDateTime, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, CheckInOut, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "My HR" };
const TABS = ["overview", "attendance", "leave", "payslips", "assets", "performance", "interviews"] as const;

/** Employee self-service. Everything here is the signed-in user's own record (resolved on the server). */
export default async function MyHrPage({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string; month?: string }> }) {
  const { ctx, allowed } = await pageCtx("hr.attendance.self");
  if (!allowed) return <PermissionDenied permission="hr.attendance.self" />;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : sp.new === "1" ? "leave" : "overview";
  const me = await myEmployee(ctx);
  const interviews = await myInterviews(ctx);

  if (!me) {
    return (
      <div className="grid gap-5">
        <PageHeader icon="Users" title={t("myHr")} subtitle={t("myHrSubtitle")} />
        <div className="os-card">
          <EmptyState icon="Users" title={t("notEmployee")} text={t("notEmployeeText")} />
        </div>
        {interviews.length > 0 && <InterviewsCard />}
      </div>
    );
  }

  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: me.id }, include: { department: { select: { name: true, nameAr: true } }, manager: { select: { displayName: true, nameAr: true } } } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const todayRec = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: me.id, date: today } } });
  const checkState = todayRec?.checkOut ? "done" : todayRec?.checkIn ? "in" : "none";
  const fmtTime = (x: Date | null) => (x ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: org.timezone }).format(x) : "—");

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Users"
        title={t("myHr")}
        subtitle={`${nameOf(emp, locale)} · ${emp.number}${emp.jobTitle ? ` · ${emp.jobTitle}` : ""}`}
        actions={
          <CheckInOut
            action={selfCheckAction}
            state={checkState}
            labels={{ in: t("a.checkIn"), remote: t("a.checkInRemote"), out: t("a.checkOut"), done: t("checkedOut", { a: fmtTime(todayRec?.checkIn ?? null), b: fmtTime(todayRec?.checkOut ?? null) }) }}
          />
        }
      />
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.filter((k) => k !== "interviews" || interviews.length > 0).map((k) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`mytabs.${k}` as "mytabs.overview")}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("myProfile")}>
            <dl className="grid gap-1 p-4 text-sm">
              {(
                [
                  [t("f.department"), emp.department ? (locale === "ar" && emp.department.nameAr) || emp.department.name : "—"],
                  [t("f.manager"), emp.manager ? nameOf(emp.manager, locale) : "—"],
                  [t("f.employmentType"), t(`type.${emp.employmentType}` as "type.FULL_TIME")],
                  [t("f.joinDate"), fmtDate(emp.joinDate, locale)],
                  [t("f.status"), t(`status.${emp.status}` as "status.ACTIVE")],
                  [t("f.workEmail"), emp.workEmail ?? "—"]
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-2">
                  <dt className="text-os-muted">{k}</dt>
                  <dd dir="auto">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">
              {t("selfProfileNote")}{" "}
              <Link href={`/app/hr/employees/${me.id}`} className="text-iris-light hover:underline">
                {t("openFullProfile")}
              </Link>
            </p>
          </SectionCard>
          <SectionCard title={t("today")}>
            <div className="grid gap-2 p-4 text-sm">
              {todayRec ? (
                <p className="flex items-center gap-2">
                  <Badge tone={attendanceTone(todayRec.status)}>{t(`att.${todayRec.status}` as "att.PRESENT")}</Badge>
                  <span dir="ltr" className="tabular text-os-muted">
                    {fmtTime(todayRec.checkIn)} → {fmtTime(todayRec.checkOut)}
                  </span>
                </p>
              ) : (
                <p className="text-os-muted">{t("notCheckedIn")}</p>
              )}
              <Link href="?tab=leave&new=1" className="os-btn-secondary justify-self-start">
                + {t("a.requestLeave")}
              </Link>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === "attendance" && <AttendanceTab />}
      {tab === "leave" && <LeaveTab />}
      {tab === "payslips" && <PayslipsTab />}
      {tab === "performance" && <PerformanceTab />}
      {tab === "interviews" && <InterviewsCard />}
      {tab === "assets" && <AssetsTab />}
    </div>
  );

  async function AttendanceTab() {
    const mm = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.toISOString().slice(0, 7);
    const a = await attendanceMonth(ctx, me!.id, mm);
    const [y, mo] = mm.split("-").map(Number);
    const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    return (
      <SectionCard
        title={new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(a.from)}
        action={
          <span className="flex gap-1">
            <Link href={`?tab=attendance&month=${prev}`} className="os-btn-ghost h-7 px-2 text-xs"><span className="rtl:rotate-180 inline-block">‹</span></Link>
            <Link href={`?tab=attendance&month=${next}`} className="os-btn-ghost h-7 px-2 text-xs"><span className="rtl:rotate-180 inline-block">›</span></Link>
          </span>
        }
      >
        {a.records.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noAttendance")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {a.records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="w-36 text-xs">{fmtDate(r.date, locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <Badge tone={attendanceTone(r.status)}>{t(`att.${r.status}` as "att.PRESENT")}</Badge>
                <span className="flex-1 text-xs tabular text-os-muted" dir="ltr">
                  {fmtTime(r.checkIn)} → {fmtTime(r.checkOut)}
                </span>
                {r.correctedAt && <span className="text-[10px] text-os-faint">{t("corrected")}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-os-line px-4 py-2 text-xs text-os-muted">
          {t("attTotals", { present: a.totals.present, late: a.totals.late, absent: a.totals.absent, missing: a.totals.missing, hours: Math.round(a.totals.minutes / 6) / 10 })}
        </p>
      </SectionCard>
    );
  }

  async function LeaveTab() {
    const [bal, types, reqs] = await Promise.all([
      balances(ctx, me!.id, today.getUTCFullYear()),
      listLeaveTypes(ctx.organizationId),
      prisma.leaveRequest.findMany({ where: { employeeId: me!.id }, orderBy: { startDate: "desc" }, take: 40, include: { leaveType: { select: { nameAr: true, nameEn: true } } } })
    ]);
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <SectionCard title={t("balancesYear", { y: today.getUTCFullYear() })}>
          <ul className="divide-y divide-os-line text-sm">
            {bal.map((b) => (
              <li key={b.type.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1">{locale === "ar" ? b.type.nameAr : b.type.nameEn}</span>
                {b.tracked ? <span className="text-xs tabular text-os-muted">{t("balanceLine", { opening: Number(b.opening) + Number(b.accrual) + Number(b.adjustment), used: Number(b.usage) - Number(b.reversal), remaining: Number(b.remaining) })}</span> : <span className="text-xs text-os-faint">{t("notTracked")}</span>}
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard
          title={t("myRequests")}
          action={
            can(ctx, "hr.leave.request") ? (
              <ActionForm
                action={createLeaveAction}
                trigger={`+ ${t("a.requestLeave")}`}
                triggerClass="os-btn-primary h-8 px-3 text-xs"
                submitLabel={t("a.submit")}
                autoOpen={sp.new === "1"}
                onCloseHref="/app/my-hr?tab=leave"
                note={t("leaveRequestNote")}
                fields={[
                  { name: "leaveTypeId", label: t("f.leaveType"), type: "select", required: true, options: types.map((x) => ({ value: x.id, label: locale === "ar" ? x.nameAr : x.nameEn })) },
                  { name: "startDate", label: t("f.startDate"), type: "date", required: true },
                  { name: "endDate", label: t("f.endDate"), type: "date", required: true },
                  { name: "reason", label: t("f.reason"), type: "textarea" }
                ]}
              />
            ) : undefined
          }
        >
          {reqs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noLeave")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {reqs.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    {locale === "ar" ? l.leaveType.nameAr : l.leaveType.nameEn}
                    <span className="block text-[11px] text-os-faint">
                      {fmtDate(l.startDate, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(l.endDate, locale)} · {t("daysN", { n: Number(l.days) })}
                    </span>
                    {l.rejectionReason && <span className="block text-[11px] text-os-muted" dir="auto">{l.rejectionReason}</span>}
                  </span>
                  <Badge tone={leaveTone(l.status)}>{t(`lstatus.${l.status}` as "lstatus.DRAFT")}</Badge>
                  {["DRAFT", "SUBMITTED", "APPROVED"].includes(l.status) && l.endDate >= today && (
                    <ActionForm action={cancelLeaveAction} args={[l.id]} positional trigger={t("a.cancel")} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("a.cancelLeave")} danger fields={[{ name: "reason", label: t("f.reason"), type: "textarea" }]} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    );
  }

  async function PayslipsTab() {
    const slips = await myPayslips(ctx);
    return (
      <SectionCard title={t("mytabs.payslips")}>
        {slips.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noPayslips")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {slips.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium"><bdi dir="ltr">{s.period.name}</bdi></span>
                  <span className="block text-[11px] text-os-faint">
                    {t("f.payDate")}: {fmtDate(s.period.payDate, locale)}
                  </span>
                </span>
                <span className="font-semibold tabular" dir="ltr">{formatMoney(s.netPay.toFixed(2), locale, s.currency)}</span>
                <a href={`/app/hr/payroll/entries/${s.id}/payslip?lang=ar`} target="_blank" rel="noopener" className="os-btn-ghost h-7 px-2 text-xs">PDF · ع</a>
                <a href={`/app/hr/payroll/entries/${s.id}/payslip?lang=en`} target="_blank" rel="noopener" className="os-btn-ghost h-7 px-2 text-xs">PDF · EN</a>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("payslipsNote")}</p>
      </SectionCard>
    );
  }

  async function AssetsTab() {
    const rows = await myAssets(ctx);
    const to = await getTranslations("os.ops");
    return (
      <SectionCard title={to("myAssets")}>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{to("noAssignments")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Link href={`/app/assets/${r.asset.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                  {r.asset.name}
                  <span className="block text-[11px] text-os-faint" dir="ltr">
                    {r.asset.number}
                    {r.asset.serialNumber ? ` · ${r.asset.serialNumber}` : ""}
                  </span>
                </Link>
                {!r.returnedAt ? <Badge tone="info">{to("current")}</Badge> : <span className="text-[11px] text-os-faint">{to("returnedOn")} {fmtDate(r.returnedAt, locale)}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{to("myAssetsNote")}</p>
      </SectionCard>
    );
  }

  async function PerformanceTab() {
    const p = await employeePerformance(ctx, me!.id);
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("reviews")}>
          {p.reviews.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noReviews")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {p.reviews.map((r) => (
                <li key={r.id} className="grid gap-1 px-4 py-2.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.periodLabel}</span>
                    <Badge tone="success">{t(`rstatus.${r.status}` as "rstatus.DRAFT")}</Badge>
                    {r.rating && <span className="text-xs text-gold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>}
                  </p>
                  {r.summary && <p className="whitespace-pre-line text-xs text-os-muted" dir="auto">{r.summary}</p>}
                  {r.status === "COMPLETED" && <RunButton action={acknowledgeReviewAction} args={[r.id]} label={t("a.acknowledge")} className="os-btn-secondary h-7 justify-self-start px-2 text-xs" />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={t("goals")}>
          {p.goals.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noGoals")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {p.goals.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1">{g.title}</span>
                  <Badge tone={g.status === "ACHIEVED" ? "success" : g.status === "MISSED" ? "danger" : "neutral"}>{t(`gstatus.${g.status}` as "gstatus.NOT_STARTED")}</Badge>
                  {["NOT_STARTED", "IN_PROGRESS"].includes(g.status) && (
                    <ActionForm
                      action={updateGoalAction}
                      args={[g.id]}
                      trigger={t("a.update")}
                      triggerClass="os-btn-ghost h-7 px-2 text-xs"
                      submitLabel={t("save")}
                      fields={[
                        { name: "status", label: t("f.status"), type: "select", required: true, value: g.status, options: ["NOT_STARTED", "IN_PROGRESS"].map((s) => ({ value: s, label: t(`gstatus.${s}` as "gstatus.NOT_STARTED") })) },
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

  function InterviewsCard() {
    return (
      <SectionCard title={t("myInterviews")}>
        <ul className="divide-y divide-os-line text-sm">
          {interviews.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Link href={`/app/hr/recruitment/candidates/${i.application.candidate.id}`} className="font-medium hover:text-iris-light">
                {i.application.candidate.firstName} {i.application.candidate.lastName}
              </Link>
              <span className="text-xs text-os-muted">{i.application.job.title}</span>
              <span className="flex-1" />
              <span className="text-xs">{fmtDateTime(i.scheduledAt, locale)}</span>
              <Badge tone="info">{t(`itype.${i.type}` as "itype.VIDEO")}</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  }
}
