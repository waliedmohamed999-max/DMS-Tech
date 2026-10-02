import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { attendanceToday } from "@/server/hr/attendance";
import { attendanceTone, hrOptions, nameOf } from "@/lib/os/hr-page";
import { recordAttendanceAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Attendance" };
const STATUSES = ["PRESENT", "LATE", "REMOTE", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY", "MISSING"];

/** Daily board for the employees in the viewer's attendance scope (team / department / all). */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("hr.attendance.view");
  if (!allowed) return <PermissionDenied permission="hr.attendance.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? new Date(`${sp.date}T00:00:00Z`) : undefined;
  const [d, opts] = await Promise.all([attendanceToday(ctx, { departmentId: sp.department || undefined, date }), hrOptions(ctx, locale)]);
  const day = d.date.toISOString().slice(0, 10);
  const shift = (n: number) => new Date(d.date.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const fmtTime = (x: Date | null) => (x ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: d.timezone }).format(x) : "—");
  const manage = can(ctx, "hr.attendance.manage");
  const counts = d.rows.reduce<Record<string, number>>((acc, r) => {
    const s = r.record?.status ?? (r.leave ? "ON_LEAVE" : "NONE");
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const q = (extra: string) => `?${new URLSearchParams({ ...(sp.department ? { department: sp.department } : {}), date: extra }).toString()}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Clock"
        title={t("attendance")}
        subtitle={t("attendanceSubtitle")}
        actions={
          manage ? (
            <ActionForm
              action={recordAttendanceAction}
              trigger={`+ ${t("a.recordAttendance")}`}
              submitLabel={t("save")}
              note={t("correctionNote")}
              fields={[
                { name: "employeeId", label: t("f.employee"), type: "select", required: true, options: opts.employees },
                { name: "date", label: t("f.date"), type: "date", required: true, value: day },
                { name: "status", label: t("f.status"), type: "select", required: true, value: "PRESENT", options: STATUSES.map((s) => ({ value: s, label: t(`att.${s}` as "att.PRESENT") })) },
                { name: "checkIn", label: t("f.checkIn"), type: "time" },
                { name: "checkOut", label: t("f.checkOut"), type: "time" },
                { name: "notes", label: t("f.notes"), type: "textarea" }
              ]}
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q(shift(-1))} className="os-btn-ghost h-8 px-2" aria-label="previous day">
          <span className="rtl:rotate-180">‹</span>
        </Link>
        <span className="text-sm font-medium">{fmtDate(d.date, locale, { dateStyle: "full", timeZone: "UTC" })}</span>
        <Link href={q(shift(1))} className="os-btn-ghost h-8 px-2" aria-label="next day">
          <span className="rtl:rotate-180">›</span>
        </Link>
        {!d.workingDay && <Badge tone="iris">{d.holiday ? `${t("holiday")}: ${(locale === "ar" && d.holiday.nameAr) || d.holiday.name}` : t("nonWorkingDay")}</Badge>}
        <span className="flex-1" />
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="text-xs text-os-muted">
            {k === "NONE" ? t("noRecord") : t(`att.${k}` as "att.PRESENT")}: <b className="tabular text-os-text">{n}</b>
          </span>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar selects={[{ name: "department", allLabel: `${t("f.department")}: ${t("all")}`, options: opts.departments }]} />
        {d.rows.length === 0 ? (
          <EmptyState icon="Clock" title={t("noTeam")} text={t("noTeamText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.employee")}</th>
                  <th className="hidden md:table-cell">{t("f.department")}</th>
                  <th>{t("f.checkIn")}</th>
                  <th className="hidden sm:table-cell">{t("f.checkOut")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const status = r.record?.status ?? (r.leave ? "ON_LEAVE" : null);
                  return (
                    <tr key={r.id}>
                      <td className="min-w-[170px]">
                        <Link href={`/app/hr/employees/${r.id}?tab=attendance`} className="font-medium hover:text-iris-light">
                          {nameOf(r, locale)}
                        </Link>
                        <span className="block text-[11px] text-os-faint">{r.jobTitle ?? ""}</span>
                      </td>
                      <td className="hidden text-xs text-os-muted md:table-cell">{r.department ? (locale === "ar" && r.department.nameAr) || r.department.name : "—"}</td>
                      <td className="text-xs tabular" dir="ltr">{fmtTime(r.record?.checkIn ?? null)}</td>
                      <td className="hidden text-xs tabular sm:table-cell" dir="ltr">{fmtTime(r.record?.checkOut ?? null)}</td>
                      <td>
                        {status ? (
                          <Badge tone={attendanceTone(status)}>{t(`att.${status}` as "att.PRESENT")}</Badge>
                        ) : (
                          <span className="text-xs text-os-faint">{t("noRecord")}</span>
                        )}
                        {r.record?.source === "MANUAL" && <span className="ms-1 text-[10px] text-os-faint">{t("manual")}</span>}
                        {r.leave && !r.record && <span className="ms-1 text-[10px] text-os-faint">{locale === "ar" ? r.leave.nameAr : r.leave.nameEn}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
