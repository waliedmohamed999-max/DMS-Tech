import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { listReviews } from "@/server/hr/performance";
import { hrOptions, nameOf } from "@/lib/os/hr-page";
import { createReviewAction } from "@/lib/os/hr-actions";
import { personName } from "@/lib/os/crm-page";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Performance" };

/** Lightweight reviews: the ones the viewer writes, their reports', and (hr.performance.view) the HR scope. */
export default async function PerformancePage() {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "hr.performance.view", "hr.performance.manage")) return <PermissionDenied permission="hr.performance.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const reviews = await listReviews(ctx);
  const manage = can(ctx, "hr.performance.manage");
  const [opts, reviewers] = await Promise.all([
    manage ? hrOptions(ctx, locale) : Promise.resolve(null),
    prisma.user.findMany({ where: { id: { in: [...new Set(reviews.map((r) => r.reviewerId))] } }, select: { id: true, name: true, nameAr: true } })
  ]);
  const today = new Date();
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Award"
        title={t("performance")}
        subtitle={t("performanceSubtitle")}
        actions={
          manage && opts ? (
            <ActionForm
              action={createReviewAction}
              trigger={`+ ${t("a.newReview")}`}
              submitLabel={t("create")}
              note={t("reviewNote")}
              fields={[
                { name: "employeeId", label: t("f.employee"), type: "select", required: true, options: opts.employees },
                { name: "reviewerId", label: t("f.reviewer"), type: "select", options: opts.users, hint: t("reviewerHint") },
                { name: "periodLabel", label: t("f.periodLabel"), required: true },
                { name: "periodStart", label: t("f.periodStart"), type: "date", required: true },
                { name: "periodEnd", label: t("f.periodEnd"), type: "date", required: true },
                { name: "dueDate", label: t("f.dueDate"), type: "date" }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        {reviews.length === 0 ? (
          <EmptyState icon="Award" title={t("noReviews")} text={t("noReviewsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.employee")}</th>
                  <th>{t("f.periodLabel")}</th>
                  <th className="hidden md:table-cell">{t("f.reviewer")}</th>
                  <th className="hidden md:table-cell">{t("f.dueDate")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/hr/employees/${r.employee.id}?tab=performance`} className="font-medium hover:text-iris-light">
                        {nameOf(r.employee, locale)}
                      </Link>
                      {r.reviewerId === ctx.userId && <span className="ms-1 text-[10px] text-iris-light">{t("youReview")}</span>}
                    </td>
                    <td className="text-xs">
                      {r.periodLabel}
                      {r.rating ? <span className="ms-1 text-gold">{"★".repeat(r.rating)}</span> : null}
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{personName(reviewers.find((u) => u.id === r.reviewerId), locale) ?? "—"}</td>
                    <td className={`hidden whitespace-nowrap text-xs md:table-cell ${r.dueDate && r.dueDate < today && ["DRAFT", "IN_REVIEW"].includes(r.status) ? "text-danger" : "text-os-muted"}`}>{r.dueDate ? fmtDate(r.dueDate, locale) : "—"}</td>
                    <td>
                      <Badge tone={r.status === "COMPLETED" || r.status === "ACKNOWLEDGED" ? "success" : "warning"}>{t(`rstatus.${r.status}` as "rstatus.DRAFT")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
