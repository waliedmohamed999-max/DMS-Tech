import { employeePerformance } from "@/server/hr/performance";
import { personName } from "@/lib/os/crm-page";
import { createGoalAction, createReviewAction, updateGoalAction, updateReviewAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";
import type { EmployeeTabCtx } from "./context";

export async function Performance({ tc, employeeId, manage }: { tc: EmployeeTabCtx; employeeId: string; manage: boolean }) {
  const { ctx, locale, t, today } = tc;
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
