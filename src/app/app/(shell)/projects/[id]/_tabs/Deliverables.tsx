import { can } from "@/server/context";
import { Badge, EmptyState, fmtDate, fmtRelative, SectionCard } from "@/components/os/ui";
import { DeliverableActions, DeliverableForm, DependencyActions, DependencyForm } from "@/components/projects/Widgets";
import type { ProjectTabCtx } from "./context";

export async function Deliverables({ c }: { c: ProjectTabCtx }) {
  const { ctx, id, p, today, locale, t, name, members, milestoneOpts, mgr, closed } = c;
  const manage = mgr && can(ctx, "projects.deliverables.manage") && !closed;
  const editDeps = mgr && can(ctx, "projects.edit") && !closed;
  return (
    <div className="grid gap-4">
      <SectionCard title={t("tabs.deliverables")} action={manage ? <DeliverableForm projectId={id} milestones={milestoneOpts} members={members} /> : undefined}>
        {p.deliverables.length === 0 ? (
          <EmptyState icon="FileText" title={t("noDeliverables")} text={t("noDeliverablesText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {p.deliverables.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {d.name} {!d.required && <span className="text-[11px] text-os-faint">({t("optional")})</span>}
                  </p>
                  <p className="text-xs text-os-faint">
                    {[d.milestone?.title, d.owner ? name(d.owner) : null, d.dueDate ? fmtDate(d.dueDate, locale) : null].filter(Boolean).join(" · ")}
                    {d.clientApprovalRequired && ` · ${t("clientApprovalLabel")}: ${t(`clientApproval.${d.clientApprovalStatus}` as "clientApproval.PENDING")}`}
                  </p>
                  {d.clientDecisionNote && <p className="text-xs text-os-muted">“{d.clientDecisionNote}”</p>}
                </div>
                <Badge tone={d.status === "ACCEPTED" ? "success" : d.status === "REJECTED" ? "danger" : d.status === "READY" ? "warning" : d.status === "DELIVERED" ? "info" : "neutral"}>{t(`dStatus.${d.status}` as "dStatus.READY")}</Badge>
                {(manage || (d.ownerId === ctx.userId && can(ctx, "projects.deliverables.manage"))) && <DeliverableActions id={d.id} status={d.status} clientApprovalRequired={d.clientApprovalRequired} manager={mgr} />}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title={t("dependencies")} action={editDeps ? <DependencyForm projectId={id} /> : undefined}>
        {p.dependencies.length === 0 ? (
          <EmptyState icon="Network" title={t("noDependencies")} text={t("noDependenciesText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {p.dependencies.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {d.title} {d.critical && <Badge tone="danger">{t("critical")}</Badge>}
                  </p>
                  <p className="text-xs text-os-faint">
                    {t(`side.${d.ownerSide}` as "side.CLIENT")} · {t(`depType.${d.type}` as "depType.OTHER")} · {t("requested")} {fmtRelative(d.requestedAt, locale)}
                    {d.dueDate && ` · ${t("f.due")} ${fmtDate(d.dueDate, locale)}`}
                    {d.resolvedAt && ` · ${t("resolved")} ${fmtDate(d.resolvedAt, locale)}`}
                  </p>
                </div>
                <Badge tone={d.status === "RESOLVED" ? "success" : d.status === "CANCELLED" ? "neutral" : d.dueDate && d.dueDate < today ? "danger" : "warning"}>{t(`depStatus.${d.status}` as "depStatus.OPEN")}</Badge>
                {editDeps && <DependencyActions id={d.id} status={d.status} />}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
