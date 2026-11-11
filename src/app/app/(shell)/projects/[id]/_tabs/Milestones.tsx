import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { ymd } from "@/server/commercial/dates";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { MilestoneForm, MilestoneStatusControl } from "@/components/projects/Widgets";
import type { ProjectTabCtx } from "./context";

export async function Milestones({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, p, commercial, today, locale, t, members, mgr, closed } = c;
  const contractMilestones = mgr && commercial?.contractId ? (await prisma.contractMilestone.findMany({ where: { contractId: commercial.contractId }, orderBy: { sortOrder: "asc" } })).map((m) => ({ id: m.id, label: m.title })) : null;
  const counts = await prisma.task.groupBy({ by: ["milestoneId", "status"], where: { projectId: id, archivedAt: null, milestoneId: { not: null } }, _count: { _all: true } });
  const manage = mgr && can(ctx, "projects.milestones.manage") && !closed;
  return (
    <SectionCard title={t("tabs.milestones")} action={manage ? <MilestoneForm trigger="new" projectId={id} people={members} contractMilestones={contractMilestones} /> : undefined}>
      {p.milestones.length === 0 ? (
        <EmptyState icon="Target" title={t("noMilestones")} text={t("noMilestonesText")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="os-table">
            <thead>
              <tr>
                <th>{t("f.milestone")}</th>
                <th>{t("f.status")}</th>
                <th className="hidden sm:table-cell">{t("f.due")}</th>
                <th className="hidden md:table-cell">{t("f.weight")}</th>
                <th className="hidden md:table-cell">{t("f.tasks")}</th>
                <th className="hidden lg:table-cell">{t("f.contractMilestone")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.milestones.map((m) => {
                const mine = counts.filter((c) => c.milestoneId === m.id);
                const total = mine.filter((c) => c.status !== "CANCELLED").reduce((s, c) => s + c._count._all, 0);
                const done = mine.filter((c) => c.status === "DONE").reduce((s, c) => s + c._count._all, 0);
                return (
                  <tr key={m.id}>
                    <td className="min-w-[200px]">
                      <span className="font-medium">{m.title}</span>
                      {!m.required && <span className="ms-1 text-[11px] text-os-faint">({t("optional")})</span>}
                      {m.blockedReason && <span className="block text-[11px] text-danger">{m.blockedReason}</span>}
                    </td>
                    <td>{manage ? <MilestoneStatusControl id={m.id} status={m.status} /> : <Badge>{t(`msStatus.${m.status}` as "msStatus.NOT_STARTED")}</Badge>}</td>
                    <td className={`hidden text-xs sm:table-cell ${m.dueDate < today && m.status !== "COMPLETED" && m.status !== "CANCELLED" ? "text-danger" : "text-os-muted"}`}>{fmtDate(m.dueDate, locale)}</td>
                    <td className="hidden tabular text-xs md:table-cell">{m.weight}</td>
                    <td className="hidden md:table-cell">
                      <span className="text-xs tabular text-os-muted">
                        {done}/{total}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{m.contractMilestone?.title ?? "—"}</td>
                    <td className="text-end">
                      {manage && (
                        <MilestoneForm
                          trigger="edit"
                          projectId={id}
                          people={members}
                          contractMilestones={contractMilestones}
                          value={{ id: m.id, title: m.title, description: m.description ?? "", startDate: ymd(m.startDate) ?? "", dueDate: ymd(m.dueDate)!, weight: String(m.weight), required: m.required, ownerId: m.ownerId ?? "", contractMilestoneId: m.contractMilestoneId ?? "" }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("progressRule")}</p>
    </SectionCard>
  );
}
