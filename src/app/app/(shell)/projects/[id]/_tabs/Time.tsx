import Link from "next/link";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { projectTime } from "@/server/projects/time";
import { ymd } from "@/server/commercial/dates";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { DeleteTime, SubmitTimesheet, TimeEntryForm } from "@/components/projects/Widgets";
import type { ProjectTabCtx } from "./context";

export async function Time({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, p, access, today, locale, t, name, mgr, closed } = c;
  const data = await projectTime(ctx, id);
  const canLog = can(ctx, "projects.time.create") && (mgr || Boolean(access.member)) && !closed;
  const tasks = canLog ? await prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: { not: "CANCELLED" } }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }) : [];
  const myDraft = data.entries.filter((e) => e.userId === ctx.userId && (e.status === "DRAFT" || e.status === "REJECTED")).length;
  const fmtH = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return (
    <div className="grid gap-4">
      {canLog && (
        <SectionCard title={t("logTime")} action={can(ctx, "projects.time.submit") ? <SubmitTimesheet projectId={id} count={myDraft} /> : undefined}>
          <div className="p-4">
            <TimeEntryForm projects={[{ id, label: `${p.number} · ${p.name}` }]} tasksByProject={{ [id]: tasks.map((x) => ({ id: x.id, label: `${x.number} · ${x.title}` })) }} defaultProjectId={id} today={ymd(today)!} />
          </div>
        </SectionCard>
      )}
      <SectionCard title={data.manager ? t("teamTime") : t("myTime")}>
        {data.entries.length === 0 ? (
          <EmptyState icon="Timer" title={t("noTime")} text="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.date")}</th>
                  {data.manager && <th>{t("f.person")}</th>}
                  <th>{t("f.task")}</th>
                  <th>{t("f.duration")}</th>
                  <th>{t("f.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDate(e.date, locale)}</td>
                    {data.manager && <td className="text-xs">{name(e.user)}</td>}
                    <td className="max-w-[260px] text-xs">
                      <span className="block truncate">{e.task ? `${e.task.number} · ${e.task.title}` : "—"}</span>
                      {e.description && <span className="block truncate text-os-faint">{e.description}</span>}
                      {e.rejectionReason && <span className="block text-danger">{e.rejectionReason}</span>}
                    </td>
                    <td className="tabular" dir="ltr">
                      {fmtH(e.minutes)}
                    </td>
                    <td>
                      <Badge tone={e.status === "APPROVED" ? "success" : e.status === "REJECTED" ? "danger" : e.status === "SUBMITTED" ? "warning" : "neutral"}>{t(`timeStatus.${e.status}` as "timeStatus.DRAFT")}</Badge>
                    </td>
                    <td className="text-end">{e.userId === ctx.userId && (e.status === "DRAFT" || e.status === "REJECTED") && <DeleteTime id={e.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {data.submissions.length > 0 && (
        <SectionCard title={t("submissions")}>
          <ul className="divide-y divide-os-line text-sm">
            {data.submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="flex-1">
                  {name(s.user)} · {fmtDate(s.periodStart, locale)} – {fmtDate(s.periodEnd, locale)}
                </span>
                <span className="tabular text-xs" dir="ltr">
                  {fmtH(s.totalMinutes)}
                </span>
                <Badge tone={s.status === "APPROVED" ? "success" : s.status === "REJECTED" ? "danger" : s.status === "SUBMITTED" ? "warning" : "neutral"}>{t(`sheetStatus.${s.status}` as "sheetStatus.SUBMITTED")}</Badge>
                {s.status === "SUBMITTED" && s.approvalId && data.manager && s.userId !== ctx.userId && (
                  <Link href={`/app/approvals?focus=${s.approvalId}`} className="text-xs text-iris-light hover:underline">
                    {t("review")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
