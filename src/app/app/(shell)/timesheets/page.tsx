import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { myTime, pendingTimesheets } from "@/server/projects/time";
import { projectOptions } from "@/server/projects/projects";
import { addDays, todayIn, ymd } from "@/server/commercial/dates";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import ApprovalControls from "@/components/os/ApprovalControls";
import { DeleteTime, SubmitTimesheet, TimeEntryForm } from "@/components/projects/Widgets";

export const metadata = { title: "Timesheets" };

const fmtH = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { ctx, allowed } = await pageCtx("projects.time.create");
  if (!allowed) return <PermissionDenied permission="projects.time.create" />;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.projects");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true, timesheetMaxDailyMinutes: true } });
  const today = todayIn(org.timezone);
  const offset = Math.max(0, Math.min(52, Number(sp.week) || 0));
  const end = addDays(today, -7 * offset);
  const start = addDays(end, -6);
  const [entries, projects, pending] = await Promise.all([myTime(ctx, start, end), projectOptions(ctx, "projects.time.create"), pendingTimesheets(ctx)]);
  const tasks = projects.length
    ? await prisma.task.findMany({ where: { projectId: { in: projects.map((p) => p.id) }, archivedAt: null, status: { not: "CANCELLED" } }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, projectId: true } })
    : [];
  const tasksByProject: Record<string, { id: string; label: string }[]> = {};
  for (const x of tasks) (tasksByProject[x.projectId] ??= []).push({ id: x.id, label: `${x.number} · ${x.title}` });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const perDay = (d: Date) => entries.filter((e) => ymd(e.date) === ymd(d)).reduce((s, e) => s + e.minutes, 0);
  const drafts = await prisma.timeEntry.groupBy({ by: ["projectId"], where: { userId: ctx.userId, status: { in: ["DRAFT", "REJECTED"] } }, _count: { _all: true } });

  return (
    <div className="grid gap-5">
      <PageHeader icon="Timer" title={t("ts.title")} subtitle={t("ts.subtitle", { max: fmtH(org.timesheetMaxDailyMinutes) })} />
      {projects.length > 0 ? (
        <SectionCard title={t("logTime")}>
          <div className="p-4">
            <TimeEntryForm projects={projects} tasksByProject={tasksByProject} today={ymd(today)!} />
          </div>
        </SectionCard>
      ) : (
        <p className="text-sm text-os-muted">{t("ts.noProjects")}</p>
      )}

      <SectionCard
        title={`${fmtDate(start, locale)} – ${fmtDate(end, locale)}`}
        action={
          <span className="flex gap-1">
            <Link href={`?week=${offset + 1}`} className="os-btn-ghost h-7 px-2 text-xs">
              <span className="inline-block rtl:rotate-180">←</span> {t("ts.prev")}
            </Link>
            {offset > 0 && (
              <Link href={`?week=${offset - 1}`} className="os-btn-ghost h-7 px-2 text-xs">
                {t("ts.next")} <span className="inline-block rtl:rotate-180">→</span>
              </Link>
            )}
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-px bg-os-line text-center text-xs">
          {days.map((d) => (
            <div key={d.toISOString()} className={`bg-os-surface px-1 py-2 ${ymd(d) === ymd(today) ? "text-iris-light" : ""}`}>
              <p className="text-os-faint">{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(d)}</p>
              <p className="mt-0.5 font-semibold tabular" dir="ltr">
                {fmtH(perDay(d))}
              </p>
            </div>
          ))}
        </div>
        {entries.length === 0 ? (
          <EmptyState icon="Timer" title={t("noTime")} text="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.date")}</th>
                  <th>{t("f.project")}</th>
                  <th className="hidden md:table-cell">{t("f.task")}</th>
                  <th>{t("f.duration")}</th>
                  <th>{t("f.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDate(e.date, locale)}</td>
                    <td className="max-w-[200px] truncate text-xs">
                      <Link href={`/app/projects/${e.project.id}?tab=time`} className="hover:text-iris-light">
                        {e.project.number} · {e.project.name}
                      </Link>
                      {e.description && <span className="block truncate text-os-faint">{e.description}</span>}
                      {e.rejectionReason && <span className="block text-danger">{e.rejectionReason}</span>}
                    </td>
                    <td className="hidden max-w-[200px] truncate text-xs text-os-muted md:table-cell">{e.task ? `${e.task.number} · ${e.task.title}` : "—"}</td>
                    <td className="tabular" dir="ltr">
                      {fmtH(e.minutes)}
                    </td>
                    <td>
                      <Badge tone={e.status === "APPROVED" ? "success" : e.status === "REJECTED" ? "danger" : e.status === "SUBMITTED" ? "warning" : "neutral"}>{t(`timeStatus.${e.status}` as "timeStatus.DRAFT")}</Badge>
                    </td>
                    <td className="text-end">{(e.status === "DRAFT" || e.status === "REJECTED") && <DeleteTime id={e.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {drafts.length > 0 && can(ctx, "projects.time.submit") && (
        <SectionCard title={t("ts.toSubmit")}>
          <ul className="divide-y divide-os-line text-sm">
            {drafts.map((d) => {
              const p = projects.find((x) => x.id === d.projectId);
              return (
                <li key={d.projectId} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1 truncate">{p?.label ?? d.projectId}</span>
                  <SubmitTimesheet projectId={d.projectId} count={d._count._all} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {can(ctx, "projects.time.approve") && (
        <SectionCard title={t("ts.toApprove")} action={<Badge tone={pending.length ? "warning" : "neutral"}>{pending.length}</Badge>}>
          {pending.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("ts.nothingToApprove")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {(locale === "ar" && s.user.nameAr) || s.user.name} · <span dir="ltr">{fmtH(s.totalMinutes)}</span>
                    </p>
                    <p className="text-[11px] text-os-faint">
                      <Link href={`/app/projects/${s.project.id}?tab=time`} className="hover:text-iris-light">
                        {s.project.number} · {s.project.name}
                      </Link>{" "}
                      · {fmtDate(s.periodStart, locale)} – {fmtDate(s.periodEnd, locale)}
                    </p>
                  </div>
                  {s.approvalId && <ApprovalControls approvalId={s.approvalId} compact />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
