import Link from "next/link";
import { prisma } from "@/server/db";
import { projectActivity, teamWorkload } from "@/server/projects/insights";
import { Badge, fmtDate, fmtRelative, SectionCard } from "@/components/os/ui";
import { healthTone } from "@/components/projects/tones";
import type { ProjectTabCtx } from "./context";

export async function Overview({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, p, today, locale, t, name, reasons, reasonText, clientDeps } = c;
  const [workload, activity, overdue, blocked] = await Promise.all([
    teamWorkload(ctx, id),
    projectActivity(ctx, id),
    prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: today } }, orderBy: { dueDate: "asc" }, take: 6, include: { assignee: { select: { name: true, nameAr: true } } } }),
    prisma.task.findMany({ where: { projectId: id, archivedAt: null, status: "BLOCKED" }, take: 6, include: { assignee: { select: { name: true, nameAr: true } } } })
  ]);
  const upcoming = p.milestones.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 4);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid content-start gap-4">
        <SectionCard title={t("healthTitle")} action={<Badge tone={healthTone(p.health)}>{t(`health.${p.health}` as "health.HEALTHY")}</Badge>}>
          {reasons.length === 0 ? (
            <p className="p-4 text-sm text-os-muted">{t("healthOk")}</p>
          ) : (
            <ul className="divide-y divide-os-line">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className={`size-2 shrink-0 rounded-full ${r.severity === "risk" ? "bg-danger" : "bg-warning"}`} />
                  <span className="flex-1">{reasonText(r)}</span>
                  <Badge tone={r.cause === "client" ? "info" : r.cause === "blocked" ? "danger" : "neutral"}>{t(`cause.${r.cause}` as "cause.internal")}</Badge>
                </li>
              ))}
            </ul>
          )}
          {p.healthCheckedAt && <p className="border-t border-os-line px-4 py-1.5 text-[11px] text-os-faint">{t("healthChecked", { at: fmtRelative(p.healthCheckedAt, locale) })}</p>}
        </SectionCard>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={t("upcomingMilestones")}>
            {upcoming.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">—</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {upcoming.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="flex-1 truncate">{m.title}</span>
                    <span className={`text-xs ${m.dueDate < today ? "text-danger" : "text-os-muted"}`}>{fmtDate(m.dueDate, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={t("overdueTasks")}>
            {overdue.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">{t("noneOverdue")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {overdue.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-4 py-2">
                    <Link href={`?tab=tasks&task=${x.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                      {x.title}
                    </Link>
                    <span className="text-xs text-danger">{x.dueDate ? fmtDate(x.dueDate, locale) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={t("blockersTitle")}>
            {blocked.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">{t("noBlockers")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {blocked.map((x) => (
                  <li key={x.id} className="grid px-4 py-2">
                    <Link href={`?tab=tasks&task=${x.id}`} className="truncate font-medium hover:text-iris-light">
                      {x.title}
                    </Link>
                    <span className="text-xs text-danger">{x.blockedReason}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={t("clientOwes")}>
            {clientDeps.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">{t("noClientDeps")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {clientDeps.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      {d.title} {d.critical && <Badge tone="danger">{t("critical")}</Badge>}
                    </span>
                    <span className={`text-xs ${d.dueDate && d.dueDate < today ? "text-danger" : "text-os-muted"}`}>{d.dueDate ? fmtDate(d.dueDate, locale) : t("waitingSince", { d: fmtRelative(d.requestedAt, locale) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        {p.scopeSummary && (
          <SectionCard title={t("scope")}>
            <p className="whitespace-pre-line p-4 text-sm text-os-muted" dir="auto">
              {p.scopeSummary}
            </p>
          </SectionCard>
        )}
      </div>
      <div className="grid content-start gap-4">
        <SectionCard title={t("workload")}>
          <ul className="divide-y divide-os-line text-sm">
            {workload.map((w) => {
              const m = p.members.find((x) => x.userId === w.userId);
              return (
                <li key={w.userId} className="grid gap-0.5 px-4 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{name(m?.user)}</span>
                    <span className="text-[11px] text-os-faint">{t(`roles.${w.role}` as "roles.DEVELOPER")}</span>
                  </span>
                  <span className="text-xs text-os-muted">
                    {t("load", { a: w.activeTasks, o: w.overdue, h: Math.round(w.remainingEstimateMinutes / 60) })}
                    {w.allocationPercent != null && ` · ${w.allocationPercent}%`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-os-line px-4 py-1.5 text-[11px] text-os-faint">{t("workloadNote")}</p>
        </SectionCard>
        <SectionCard title={t("recentActivity")} action={<Link href="?tab=activity" className="text-xs text-os-muted hover:text-os-text">{t("all")}</Link>}>
          <ul className="divide-y divide-os-line text-xs">
            {activity.slice(0, 8).map((a) => (
              <li key={a.id} className="px-4 py-2">
                <span className="font-medium">{t.has(`ev.${a.type.replace(/\./g, "_")}`) ? t(`ev.${a.type.replace(/\./g, "_")}` as "ev.task_created") : a.type}</span>
                {typeof a.detail.title === "string" && <span className="text-os-muted"> · {a.detail.title}</span>}
                <span className="block text-os-faint">
                  {a.actor ? name(a.actor) : t("system")} · {fmtRelative(a.at, locale)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
