import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { listCandidates, listJobs } from "@/server/hr/recruitment";
import { hrOptions, jobTone, stageTone } from "@/lib/os/hr-page";
import { createCandidateAction, createJobAction } from "@/lib/os/hr-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Recruitment" };
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "INTERN", "TEMPORARY"];
const SOURCES = ["WEBSITE", "REFERRAL", "LINKEDIN", "JOB_BOARD", "AGENCY", "OTHER"];
const JOB_STATUSES = ["DRAFT", "OPEN", "ON_HOLD", "CLOSED", "CANCELLED"];

/** Jobs and the candidate pool. Interviewers without hr.recruitment.view use My HR → Interviews instead. */
export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("hr.recruitment.view");
  if (!allowed) return <PermissionDenied permission="hr.recruitment.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  const view = sp.view === "candidates" || sp.new === "candidate" ? "candidates" : "jobs";
  const manage = can(ctx, "hr.recruitment.manage");
  const [jobs, cands, opts, users] = await Promise.all([
    listJobs(ctx, view === "jobs" ? sp : {}),
    view === "candidates" ? listCandidates(ctx, sp) : Promise.resolve(null),
    manage ? hrOptions(ctx, locale) : Promise.resolve(null),
    manage ? prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }) : Promise.resolve([])
  ]);
  const openJobs = jobs.filter((j) => j.status === "OPEN");

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="GraduationCap"
        title={t("recruitment")}
        subtitle={t("recruitmentSubtitle")}
        actions={
          manage && opts ? (
            <span className="flex flex-wrap gap-1.5">
              <ActionForm
                action={createCandidateAction}
                trigger={`+ ${t("a.newCandidate")}`}
                triggerClass="os-btn-secondary"
                submitLabel={t("create")}
                redirect="/app/hr/recruitment/candidates/:id"
                autoOpen={sp.new === "candidate"}
                onCloseHref="/app/hr/recruitment?view=candidates"
                note={t("candidateNote")}
                fields={[
                  { name: "firstName", label: t("f.firstName"), required: true },
                  { name: "lastName", label: t("f.lastName"), required: true },
                  { name: "email", label: t("f.email"), type: "email" },
                  { name: "phone", label: t("f.phone"), dir: "ltr" },
                  { name: "source", label: t("f.source"), type: "select", required: true, value: "OTHER", options: SOURCES.map((s) => ({ value: s, label: t(`src.${s}` as "src.OTHER") })) },
                  { name: "linkedinUrl", label: "LinkedIn", dir: "ltr" },
                  { name: "jobId", label: t("f.applyTo"), type: "select", options: openJobs.map((j) => ({ value: j.id, label: `${j.number} · ${j.title}` })) },
                  { name: "salaryExpectation", label: t("f.salaryExpectation"), type: "number" },
                  { name: "noticePeriodDays", label: t("f.noticeDays"), type: "number" },
                  { name: "notes", label: t("f.notes"), type: "textarea" }
                ]}
              />
              <ActionForm
                action={createJobAction}
                trigger={`+ ${t("a.newJob")}`}
                submitLabel={t("create")}
                redirect="/app/hr/recruitment/jobs/:id"
                autoOpen={sp.new === "job"}
                fields={[
                  { name: "title", label: t("f.title"), required: true },
                  { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments },
                  { name: "employmentType", label: t("f.employmentType"), type: "select", required: true, value: "FULL_TIME", options: TYPES.map((x) => ({ value: x, label: t(`type.${x}` as "type.FULL_TIME") })) },
                  { name: "headcount", label: t("f.headcount"), type: "number", value: "1", required: true },
                  { name: "location", label: t("f.workLocation") },
                  { name: "ownerId", label: t("f.recruiter"), type: "select", options: users.map((u) => ({ value: u.id, label: (locale === "ar" && u.nameAr) || u.name })) },
                  { name: "description", label: t("f.description"), type: "textarea" },
                  { name: "requirements", label: t("f.requirements"), type: "textarea" }
                ]}
              />
            </span>
          ) : undefined
        }
      />
      <nav className="flex gap-1 border-b border-os-line">
        {(["jobs", "candidates"] as const).map((k) => (
          <Link key={k} href={`?view=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`rtabs.${k}`)}
          </Link>
        ))}
      </nav>

      {view === "jobs" ? (
        <div className="os-card overflow-hidden">
          <FilterBar search={{ placeholder: t("searchJobs") }} selects={[{ name: "status", allLabel: t("activeJobs"), options: JOB_STATUSES.map((s) => ({ value: s, label: t(`jstatus.${s}` as "jstatus.OPEN") })) }]} />
          {jobs.length === 0 ? (
            <EmptyState icon="Briefcase" title={t("noJobs")} text={t("noJobsText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/hr/recruitment/jobs/${j.id}`} className="font-medium hover:text-iris-light">
                      {j.title}
                    </Link>
                    <p className="text-[11px] text-os-faint">
                      <span dir="ltr">{j.number}</span>
                      {j.department ? ` · ${(locale === "ar" && j.department.nameAr) || j.department.name}` : ""} · {t(`type.${j.employmentType}` as "type.FULL_TIME")} · {t("headcountN", { n: j.headcount })}
                    </p>
                  </div>
                  <span className="text-xs text-os-muted">{t("activeApplicants", { n: j._count.applications })}</span>
                  <Badge tone={jobTone(j.status)}>{t(`jstatus.${j.status}` as "jstatus.OPEN")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="os-card overflow-hidden">
          <FilterBar search={{ placeholder: t("searchCandidates") }} />
          {!cands || cands.items.length === 0 ? (
            <EmptyState icon="GraduationCap" title={t("noCandidates")} text={t("noCandidatesText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.candidate")}</th>
                    <th>{t("applications")}</th>
                    <th className="hidden md:table-cell">{t("f.source")}</th>
                    <th className="hidden md:table-cell">{t("added")}</th>
                  </tr>
                </thead>
                <tbody>
                  {cands.items.map((c) => (
                    <tr key={c.id}>
                      <td className="min-w-[160px]">
                        <Link href={`/app/hr/recruitment/candidates/${c.id}`} className="font-medium hover:text-iris-light">
                          {c.firstName} {c.lastName}
                        </Link>
                        <span className="block text-[11px] text-os-faint" dir="ltr">{c.number}</span>
                      </td>
                      <td className="text-xs">
                        <span className="flex flex-wrap gap-1">
                          {c.applications.length === 0 ? "—" : c.applications.map((a, i) => (
                            <Badge key={i} tone={stageTone(a.stage)}>
                              {a.job.title} · {t(`stage.${a.stage}` as "stage.APPLIED")}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="hidden text-xs text-os-muted md:table-cell">{t(`src.${c.source}` as "src.OTHER")}</td>
                      <td className="hidden whitespace-nowrap text-xs text-os-muted md:table-cell">{fmtDate(c.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cands && <Pagination page={cands.page} pageSize={cands.pageSize} total={cands.total} basePath="/app/hr/recruitment" params={{ ...sp, view: "candidates" }} />}
        </div>
      )}
    </div>
  );
}
