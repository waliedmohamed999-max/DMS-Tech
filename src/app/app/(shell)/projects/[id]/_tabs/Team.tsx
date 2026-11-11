import { can } from "@/server/context";
import { teamWorkload } from "@/server/projects/insights";
import { SectionCard } from "@/components/os/ui";
import { AddMember, RemoveMember } from "@/components/projects/Widgets";
import type { ProjectTabCtx } from "./context";

export async function Team({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, p, t, name, mgr, closed, people } = c;
  const workload = await teamWorkload(ctx, id);
  const manage = mgr && can(ctx, "projects.manage_team") && !closed;
  const candidates = people.filter((u) => !p.members.some((m) => m.userId === u.id));
  return (
    <SectionCard title={t("tabs.team")} action={manage ? <AddMember projectId={id} users={candidates} /> : undefined}>
      <div className="overflow-x-auto">
        <table className="os-table">
          <thead>
            <tr>
              <th>{t("f.person")}</th>
              <th>{t("f.projectRole")}</th>
              <th>{t("f.activeTasks")}</th>
              <th className="hidden sm:table-cell">{t("f.overdue")}</th>
              <th className="hidden md:table-cell">{t("f.remaining")}</th>
              <th className="hidden md:table-cell">{t("f.allocation")}</th>
              <th className="hidden lg:table-cell">{t("f.otherProjects")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.members.map((m) => {
              const w = workload.find((x) => x.userId === m.userId);
              return (
                <tr key={m.id}>
                  <td>
                    <span className="font-medium">{name(m.user)}</span>
                    <span className="block text-[11px] text-os-faint">{m.user.jobTitle ?? ""}</span>
                  </td>
                  <td className="text-xs">{t(`roles.${m.role}` as "roles.DEVELOPER")}</td>
                  <td className="tabular">{w?.activeTasks ?? 0}</td>
                  <td className={`hidden tabular sm:table-cell ${w?.overdue ? "text-danger" : ""}`}>{w?.overdue ?? 0}</td>
                  <td className="hidden tabular text-xs md:table-cell">{Math.round((w?.remainingEstimateMinutes ?? 0) / 60)}h</td>
                  <td className="hidden tabular text-xs md:table-cell">{m.allocationPercent != null ? `${m.allocationPercent}%` : "—"}</td>
                  <td className="hidden tabular text-xs lg:table-cell">{w?.openTasksOtherProjects ?? 0}</td>
                  <td className="text-end">{manage && m.userId !== p.projectManagerId && <RemoveMember projectId={id} userId={m.userId} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("workloadNote")}</p>
    </SectionCard>
  );
}
