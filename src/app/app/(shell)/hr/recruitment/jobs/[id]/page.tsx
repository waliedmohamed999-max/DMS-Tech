import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getJob, JOB_TRANSITIONS, STAGE_TRANSITIONS } from "@/server/hr/recruitment";
import { hrOptions, jobTone } from "@/lib/os/hr-page";
import { jobStatusAction, moveStageAction, updateJobAction } from "@/lib/os/hr-actions";
import { Badge, fmtDate, PermissionDenied } from "@/components/os/ui";
import { ActionForm, RunButton, StageSelect } from "@/components/hr/Forms";

export const metadata = { title: "Job opening" };
const PIPELINE = ["APPLIED", "SCREENING", "INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"];

/** Job pipeline board: one column per stage. Stage moves are validated on the server (transition map + stale check). */
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("hr.recruitment.view");
  if (!allowed) return <PermissionDenied permission="hr.recruitment.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  let j;
  try {
    j = await getJob(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const manage = can(ctx, "hr.recruitment.manage");
  const [opts, users] = manage
    ? await Promise.all([hrOptions(ctx, locale), prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } })])
    : [null, []];
  const stageLabel = (s: string) => t(`stage.${s}` as "stage.APPLIED");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/hr/recruitment" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{j.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {j.title}
            <Badge tone={jobTone(j.status)} dot>
              {t(`jstatus.${j.status}` as "jstatus.OPEN")}
            </Badge>
          </h1>
          <p className="mt-1 text-xs text-os-muted">
            {j.department ? `${(locale === "ar" && j.department.nameAr) || j.department.name} · ` : ""}
            {t(`type.${j.employmentType}` as "type.FULL_TIME")} · {t("headcountN", { n: j.headcount })}
            {j.location ? ` · ${j.location}` : ""}
            {j.openedAt ? ` · ${t("openedOn")} ${fmtDate(j.openedAt, locale)}` : ""}
          </p>
        </div>
        {manage && opts && (
          <div className="flex flex-wrap gap-1.5">
            {JOB_TRANSITIONS[j.status].map((to) => (
              <RunButton key={to} action={jobStatusAction} args={[id, to]} label={t(`jaction.${to}` as "jaction.OPEN")} className={to === "OPEN" ? "os-btn-primary" : "os-btn-ghost"} confirmText={to === "CANCELLED" || to === "CLOSED" ? t("jobCloseConfirm") : undefined} />
            ))}
            <ActionForm
              action={updateJobAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("save")}
              fields={[
                { name: "title", label: t("f.title"), required: true, value: j.title },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: j.departmentId ?? "" },
                { name: "employmentType", label: t("f.employmentType"), type: "select", required: true, value: j.employmentType, options: TYPES.map((x) => ({ value: x, label: t(`type.${x}` as "type.FULL_TIME") })) },
                { name: "headcount", label: t("f.headcount"), type: "number", value: String(j.headcount), required: true },
                { name: "location", label: t("f.workLocation"), value: j.location ?? "" },
                { name: "ownerId", label: t("f.recruiter"), type: "select", value: j.ownerId ?? "", options: users.map((u) => ({ value: u.id, label: (locale === "ar" && u.nameAr) || u.name })) },
                { name: "description", label: t("f.description"), type: "textarea", value: j.description ?? "" },
                { name: "requirements", label: t("f.requirements"), type: "textarea", value: j.requirements ?? "" }
              ]}
            />
          </div>
        )}
      </div>

      {(j.description || j.requirements) && (
        <div className="grid gap-4 md:grid-cols-2">
          {j.description && (
            <div className="os-card p-4 text-sm">
              <p className="mb-1 text-xs font-semibold text-os-muted">{t("f.description")}</p>
              <p className="whitespace-pre-line" dir="auto">{j.description}</p>
            </div>
          )}
          {j.requirements && (
            <div className="os-card p-4 text-sm">
              <p className="mb-1 text-xs font-semibold text-os-muted">{t("f.requirements")}</p>
              <p className="whitespace-pre-line" dir="auto">{j.requirements}</p>
            </div>
          )}
        </div>
      )}

      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3">
          {PIPELINE.map((stage) => {
            const apps = j.applications.filter((a) => a.stage === stage);
            return (
              <section key={stage} className="os-card min-h-[120px] overflow-hidden">
                <h2 className="flex items-center justify-between border-b border-os-line px-3 py-2 text-xs font-semibold">
                  {stageLabel(stage)} <span className="tabular text-os-faint">{apps.length}</span>
                </h2>
                <ul className="grid gap-2 p-2">
                  {apps.map((a) => (
                    <li key={a.id} className="rounded-lg border border-os-line bg-os-panel/40 p-2.5 text-sm">
                      <Link href={`/app/hr/recruitment/candidates/${a.candidate.id}`} className="font-medium hover:text-iris-light">
                        {a.candidate.firstName} {a.candidate.lastName}
                      </Link>
                      <p className="text-[11px] text-os-faint">
                        {t(`src.${a.candidate.source}` as "src.OTHER")} · {t("interviewsN", { n: a._count.interviews })} · {t("evaluationsN", { n: a._count.evaluations })}
                      </p>
                      {a.status !== "ACTIVE" && a.stage !== "HIRED" && a.stage !== "REJECTED" && <Badge tone="neutral">{t(`astatus.${a.status}` as "astatus.ACTIVE")}</Badge>}
                      {manage && (a.status === "ACTIVE" || a.status === "REJECTED") && STAGE_TRANSITIONS[a.stage].length > 0 && (
                        <div className="mt-2">
                          <StageSelect action={moveStageAction} applicationId={a.id} stage={a.stage} label={t("moveTo")} reasonPrompt={t("rejectReason")} options={STAGE_TRANSITIONS[a.stage].map((s) => ({ value: s, label: stageLabel(s) }))} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
