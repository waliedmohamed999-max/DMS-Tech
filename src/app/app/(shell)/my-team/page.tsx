import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { myTeam } from "@/server/hr/insights";
import { attendanceTone, employeeTone, leaveTone, nameOf } from "@/lib/os/hr-page";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";

export const metadata = { title: "My Team" };

/** Line-manager view of direct reports: today's attendance, leave and open reviews. Never salary or bank data. */
export default async function MyTeamPage() {
  const { ctx } = await pageCtx();
  if (!can(ctx, "hr.leave.approve") && !can(ctx, "hr.attendance.view") && !can(ctx, "hr.performance.manage")) return <PermissionDenied permission="hr.leave.approve" />;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const team = await myTeam(ctx);
  const pending = team?.reports.flatMap((r) => r.leaveRequests.filter((l) => l.status === "SUBMITTED").map((l) => ({ ...l, who: r }))) ?? [];

  return (
    <div className="grid gap-5">
      <PageHeader icon="Network" title={t("myTeam")} subtitle={t("myTeamSubtitle")} />
      {!team || team.reports.length === 0 ? (
        <div className="os-card">
          <EmptyState icon="Network" title={t("noTeam")} text={t("noTeamText")} />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="os-card overflow-hidden">
              <h2 className="border-b border-os-line px-4 py-2.5 text-sm font-semibold">{t("pendingLeave")}</h2>
              <ul className="divide-y divide-os-line text-sm">
                {pending.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="font-medium">{nameOf(l.who, locale)}</span>
                    <span className="flex-1 text-xs text-os-muted">
                      {locale === "ar" ? l.leaveType.nameAr : l.leaveType.nameEn} · {fmtDate(l.startDate, locale)} {locale === "ar" ? "←" : "→"} {fmtDate(l.endDate, locale)} · {t("daysN", { n: Number(l.days) })}
                    </span>
                    {l.approvalId && (
                      <Link href={`/app/approvals?focus=${l.approvalId}`} className="os-btn-primary h-7 px-3 text-xs">
                        {t("a.review")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.reports.map((r) => {
              const rec = r.attendance[0];
              const onLeave = r.leaveRequests.find((l) => l.status === "APPROVED" && l.startDate <= team.today && l.endDate >= team.today);
              const upcoming = r.leaveRequests.filter((l) => l.status === "APPROVED" && l.startDate > team.today);
              return (
                <div key={r.id} className="os-card grid gap-2 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/hr/employees/${r.id}`} className="font-semibold hover:text-iris-light">
                        {nameOf(r, locale)}
                      </Link>
                      <p className="text-[11px] text-os-faint">{r.jobTitle ?? r.number}</p>
                    </div>
                    {r.status !== "ACTIVE" && <Badge tone={employeeTone(r.status)}>{t(`status.${r.status}` as "status.ACTIVE")}</Badge>}
                  </div>
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-os-muted">{t("today")}:</span>
                    {rec ? <Badge tone={attendanceTone(rec.status)}>{t(`att.${rec.status}` as "att.PRESENT")}</Badge> : onLeave ? <Badge tone="iris">{t("att.ON_LEAVE")}</Badge> : <span className="text-os-faint">{t("noRecord")}</span>}
                  </p>
                  {upcoming.length > 0 && (
                    <p className="text-[11px] text-os-muted">
                      {t("upcomingLeave")}:{" "}
                      {upcoming.map((l) => (
                        <span key={l.id} className="me-2 inline-flex items-center gap-1">
                          <Badge tone={leaveTone(l.status)}>{fmtDate(l.startDate, locale)}</Badge>
                        </span>
                      ))}
                    </p>
                  )}
                  {r.reviews.length > 0 && (
                    <Link href={`/app/hr/employees/${r.id}?tab=performance`} className="text-[11px] text-warning hover:underline">
                      {t("openReviewsN", { n: r.reviews.length })}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
