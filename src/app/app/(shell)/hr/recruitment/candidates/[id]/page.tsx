import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getCandidate, STAGE_TRANSITIONS } from "@/server/hr/recruitment";
import { hrOptions, offerTone, stageTone } from "@/lib/os/hr-page";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import {
  applyAction, convertOfferAction, createOfferAction, evaluateAction, interviewStatusAction, moveStageAction, offerResponseAction, scheduleInterviewAction, sendOfferAction, submitOfferAction, withdrawOfferAction
} from "@/lib/os/hr-actions";
import { Badge, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton, StageSelect } from "@/components/hr/Forms";

export const metadata = { title: "Candidate" };
const LIVE_OFFER = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED"];

/**
 * Candidate 360: applications, interviews, evaluations and offers. Interviewers without hr.recruitment.view
 * get a reduced view from the server (their interviews and own evaluations; no offers, salary or contact data).
 */
export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.hr");
  let d;
  try {
    d = await getCandidate(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    if (isAppError(e) && e.code === "FORBIDDEN") return <PermissionDenied permission="hr.recruitment.view" />;
    throw e;
  }
  const c = d.candidate;
  const manage = d.full && can(ctx, "hr.recruitment.manage");
  const userIds = [...new Set(c.applications.flatMap((a) => [...a.interviews.flatMap((i) => i.interviewerIds), ...a.evaluations.map((e) => e.reviewerId)]))];
  const [people, users, openJobs, org, opts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, nameAr: true } }),
    manage ? prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }) : Promise.resolve([]),
    manage ? prisma.jobOpening.findMany({ where: { organizationId: ctx.organizationId, status: "OPEN", applications: { none: { candidateId: id } } }, select: { id: true, number: true, title: true } }) : Promise.resolve([]),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true } }),
    manage && can(ctx, "hr.employees.create") ? hrOptions(ctx, locale) : Promise.resolve(null)
  ]);
  const who = (uid: string) => personName(people.find((p) => p.id === uid), locale) ?? "—";
  const stageLabel = (s: string) => t(`stage.${s}` as "stage.APPLIED");
  const m = (v: { toFixed(n: number): string }, cur: string) => formatMoney(v.toFixed(2), locale, cur);
  const canConvert = can(ctx, "hr.employees.create");
  const canComp = can(ctx, "hr.compensation.manage");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href={d.full ? "/app/hr/recruitment?view=candidates" : "/app/my-hr?tab=interviews"} className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{c.number}</p>
          <h1 className="text-xl font-semibold">
            {c.firstName} {c.lastName}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{t(`src.${c.source}` as "src.OTHER")}</span>
            {c.email && <span dir="ltr">{c.email}</span>}
            {c.phone && <span dir="ltr">{c.phone}</span>}
            {c.linkedinUrl && d.full && (
              <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-iris-light hover:underline">
                LinkedIn
              </a>
            )}
          </p>
        </div>
        {manage && openJobs.length > 0 && (
          <ActionForm
            action={applyAction}
            args={[id]}
            trigger={`+ ${t("a.applyToJob")}`}
            triggerClass="os-btn-secondary"
            submitLabel={t("save")}
            fields={[
              { name: "jobId", label: t("f.job"), type: "select", required: true, options: openJobs.map((j) => ({ value: j.id, label: `${j.number} · ${j.title}` })) },
              { name: "salaryExpectation", label: t("f.salaryExpectation"), type: "number" },
              { name: "noticePeriodDays", label: t("f.noticeDays"), type: "number" },
              { name: "notes", label: t("f.notes"), type: "textarea" }
            ]}
          />
        )}
      </div>
      {!d.full && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2 text-xs text-os-muted">{t("interviewerView")}</p>}
      {c.notes && <p className="os-card whitespace-pre-line p-4 text-sm" dir="auto">{c.notes}</p>}

      {c.applications.map((a) => {
        const liveOffer = a.offers.find((o) => LIVE_OFFER.includes(o.status));
        return (
          <section key={a.id} className="os-card overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 border-b border-os-line px-4 py-3">
              <Link href={`/app/hr/recruitment/jobs/${a.job.id}`} className="font-semibold hover:text-iris-light">
                {a.job.title}
              </Link>
              <span className="text-[11px] text-os-faint" dir="ltr">{a.job.number}</span>
              <Badge tone={stageTone(a.stage)} dot>{stageLabel(a.stage)}</Badge>
              {a.status !== "ACTIVE" && a.status !== "HIRED" && <Badge tone="neutral">{t(`astatus.${a.status}` as "astatus.ACTIVE")}</Badge>}
              <span className="flex-1" />
              {d.full && a.salaryExpectation && <span className="text-xs text-os-muted">{t("f.salaryExpectation")}: <span dir="ltr">{m(a.salaryExpectation, a.currency)}</span></span>}
              {manage && (a.status === "ACTIVE" || a.status === "REJECTED") && STAGE_TRANSITIONS[a.stage].length > 0 && (
                <StageSelect action={moveStageAction} applicationId={a.id} stage={a.stage} label={t("moveTo")} reasonPrompt={t("rejectReason")} options={STAGE_TRANSITIONS[a.stage].map((s) => ({ value: s, label: stageLabel(s) }))} />
              )}
            </header>
            {a.rejectionReason && <p className="border-b border-os-line px-4 py-2 text-xs text-danger" dir="auto">{t("rejectedBecause", { r: a.rejectionReason })}</p>}
            <div className="grid gap-px bg-os-line lg:grid-cols-3">
              {/* interviews */}
              <SectionCard
                className="rounded-none border-0"
                title={t("interviews")}
                action={
                  manage && a.status === "ACTIVE" ? (
                    <ActionForm
                      action={scheduleInterviewAction}
                      args={[a.id]}
                      trigger={`+ ${t("a.schedule")}`}
                      triggerClass="os-btn-ghost h-7 px-2 text-xs"
                      submitLabel={t("save")}
                      note={t("interviewNote")}
                      fields={[
                        { name: "scheduledAt", label: t("f.when"), type: "datetime", required: true },
                        { name: "durationMinutes", label: t("f.duration"), type: "number", value: "60" },
                        { name: "type", label: t("f.type"), type: "select", required: true, value: "VIDEO", options: ["PHONE", "VIDEO", "ONSITE", "TECHNICAL"].map((x) => ({ value: x, label: t(`itype.${x}` as "itype.VIDEO") })) },
                        { name: "location", label: t("f.locationOrLink"), dir: "ltr" },
                        { name: "interviewerIds", label: t("f.interviewers"), type: "multiselect", required: true, options: users.map((u) => ({ value: u.id, label: (locale === "ar" && u.nameAr) || u.name })) },
                        { name: "notes", label: t("f.notes"), type: "textarea" }
                      ]}
                    />
                  ) : undefined
                }
              >
                <ul className="divide-y divide-os-line text-sm">
                  {a.interviews.length === 0 && <li className="px-4 py-4 text-center text-xs text-os-faint">{t("noInterviews")}</li>}
                  {a.interviews.map((i) => (
                    <li key={i.id} className="grid gap-1 px-4 py-2">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{fmtDateTime(i.scheduledAt, locale)}</span>
                        <Badge tone={i.status === "COMPLETED" ? "success" : i.status === "SCHEDULED" ? "info" : "neutral"}>{t(`istatus.${i.status}` as "istatus.SCHEDULED")}</Badge>
                      </p>
                      <p className="text-[11px] text-os-muted">
                        {t(`itype.${i.type}` as "itype.VIDEO")} · {i.durationMinutes}′ · {i.interviewerIds.map(who).join("، ")}
                        {i.location ? <span dir="ltr"> · {i.location}</span> : null}
                      </p>
                      {manage && i.status === "SCHEDULED" && (
                        <span className="flex flex-wrap gap-1">
                          <RunButton action={interviewStatusAction} args={[i.id, "COMPLETED"]} label={t("istatus.COMPLETED")} className="os-btn-ghost h-6 px-2 text-[11px]" />
                          <RunButton action={interviewStatusAction} args={[i.id, "NO_SHOW"]} label={t("istatus.NO_SHOW")} className="os-btn-ghost h-6 px-2 text-[11px]" />
                          <RunButton action={interviewStatusAction} args={[i.id, "CANCELLED"]} label={t("istatus.CANCELLED")} className="os-btn-ghost h-6 px-2 text-[11px]" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {/* evaluations */}
              <SectionCard
                className="rounded-none border-0"
                title={t("evaluations")}
                action={
                  manage || a.interviews.some((i) => i.interviewerIds.includes(ctx.userId)) ? (
                    <ActionForm
                      action={evaluateAction}
                      args={[a.id]}
                      trigger={`+ ${t("a.evaluate")}`}
                      triggerClass="os-btn-ghost h-7 px-2 text-xs"
                      submitLabel={t("save")}
                      note={t("evaluationNote")}
                      fields={[
                        { name: "interviewId", label: t("f.interview"), type: "select", options: a.interviews.map((i) => ({ value: i.id, label: `${fmtDate(i.scheduledAt, locale)} · ${t(`itype.${i.type}` as "itype.VIDEO")}` })) },
                        { name: "rating", label: t("f.rating"), type: "select", required: true, options: ["1", "2", "3", "4", "5"].map((x) => ({ value: x, label: "★".repeat(Number(x)) })) },
                        { name: "recommendation", label: t("f.recommendation"), type: "select", options: ["STRONG_YES", "YES", "NO", "STRONG_NO"].map((x) => ({ value: x, label: t(`rec.${x}` as "rec.YES") })) },
                        { name: "criteria", label: t("f.criteria") },
                        { name: "notes", label: t("f.notes"), type: "textarea" }
                      ]}
                    />
                  ) : undefined
                }
              >
                <ul className="divide-y divide-os-line text-sm">
                  {a.evaluations.length === 0 && <li className="px-4 py-4 text-center text-xs text-os-faint">{t("noEvaluations")}</li>}
                  {a.evaluations.map((e) => (
                    <li key={e.id} className="grid gap-0.5 px-4 py-2">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-gold">{"★".repeat(e.rating)}{"☆".repeat(5 - e.rating)}</span>
                        {e.recommendation && <Badge tone={e.recommendation.endsWith("YES") ? "success" : "danger"}>{t(`rec.${e.recommendation}` as "rec.YES")}</Badge>}
                        <span className="flex-1" />
                        <span className="text-[11px] text-os-faint">{who(e.reviewerId)}</span>
                      </p>
                      {e.criteria && <p className="text-[11px] text-os-muted">{e.criteria}</p>}
                      {e.notes && <p className="whitespace-pre-line text-xs" dir="auto">{e.notes}</p>}
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {/* offers */}
              {d.full && (
                <SectionCard
                  className="rounded-none border-0"
                  title={t("offers")}
                  action={
                    manage && !liveOffer && a.status === "ACTIVE" && ["INTERVIEW", "TECHNICAL", "FINAL_INTERVIEW", "OFFER"].includes(a.stage) ? (
                      <ActionForm
                        action={createOfferAction}
                        args={[a.id]}
                        trigger={`+ ${t("a.newOffer")}`}
                        triggerClass="os-btn-primary h-7 px-2 text-xs"
                        submitLabel={t("create")}
                        note={t("offerNote")}
                        fields={[
                          { name: "jobTitle", label: t("f.jobTitle"), required: true, value: a.job.title },
                          { name: "salary", label: t("f.baseSalary"), type: "number", required: true },
                          { name: "housingAllowance", label: t("f.housing"), type: "number" },
                          { name: "transportAllowance", label: t("f.transport"), type: "number" },
                          { name: "currency", label: t("f.currency"), value: org.currency, required: true },
                          { name: "startDate", label: t("f.startDate"), type: "date", required: true },
                          { name: "expiresAt", label: t("f.expiresAt"), type: "date" }
                        ]}
                      />
                    ) : undefined
                  }
                >
                  <ul className="divide-y divide-os-line text-sm">
                    {a.offers.length === 0 && <li className="px-4 py-4 text-center text-xs text-os-faint">{t("noOffers")}</li>}
                    {a.offers.map((o) => (
                      <li key={o.id} className="grid gap-1.5 px-4 py-2.5">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-os-faint" dir="ltr">{o.number}</span>
                          <Badge tone={offerTone(o.status)}>{t(`ostatus.${o.status}` as "ostatus.DRAFT")}</Badge>
                          <span className="flex-1" />
                          <span className="font-semibold tabular" dir="ltr">{m(o.salary.plus(o.housingAllowance).plus(o.transportAllowance), o.currency)}</span>
                        </p>
                        <p className="text-[11px] text-os-muted">
                          {o.jobTitle} · {t("f.startDate")}: {fmtDate(o.startDate, locale)}
                          {o.expiresAt ? ` · ${t("f.expiresAt")}: ${fmtDate(o.expiresAt, locale)}` : ""}
                        </p>
                        {o.rejectionReason && <p className="text-[11px] text-danger" dir="auto">{o.rejectionReason}</p>}
                        {o.convertedEmployeeId && (
                          <Link href={`/app/hr/employees/${o.convertedEmployeeId}`} className="text-xs text-iris-light hover:underline">
                            {t("openEmployee")} →
                          </Link>
                        )}
                        {manage && (
                          <span className="flex flex-wrap gap-1">
                            {o.status === "DRAFT" && <RunButton action={submitOfferAction} args={[o.id]} label={t("a.submitApproval")} className="os-btn-secondary h-7 px-2 text-xs" />}
                            {o.status === "PENDING_APPROVAL" && o.approvalId && (
                              <Link href={`/app/approvals?focus=${o.approvalId}`} className="os-btn-ghost h-7 px-2 text-xs">
                                {t("openApproval")}
                              </Link>
                            )}
                            {o.status === "APPROVED" && <RunButton action={sendOfferAction} args={[o.id]} label={t("a.markSent")} className="os-btn-secondary h-7 px-2 text-xs" />}
                            {o.status === "SENT" && (
                              <ActionForm
                                action={offerResponseAction}
                                args={[o.id]}
                                trigger={t("a.recordResponse")}
                                triggerClass="os-btn-primary h-7 px-2 text-xs"
                                submitLabel={t("save")}
                                fields={[
                                  { name: "decision", label: t("f.decision"), type: "select", required: true, options: [{ value: "ACCEPTED", label: t("ostatus.ACCEPTED") }, { value: "REJECTED", label: t("ostatus.REJECTED") }] },
                                  { name: "reason", label: t("f.reason"), type: "textarea" },
                                  { name: "confirm", label: t("responseConfirm"), type: "checkbox", required: true }
                                ]}
                              />
                            )}
                            {["DRAFT", "APPROVED", "SENT"].includes(o.status) && <RunButton action={withdrawOfferAction} args={[o.id]} label={t("a.withdraw")} className="os-btn-ghost h-7 px-2 text-xs" confirmText={t("withdrawOfferConfirm")} />}
                            {o.status === "ACCEPTED" && !o.convertedEmployeeId && canConvert && opts && (
                              <ActionForm
                                action={convertOfferAction}
                                args={[o.id]}
                                trigger={t("a.convert")}
                                triggerClass="os-btn-primary h-7 px-2 text-xs"
                                submitLabel={t("a.convert")}
                                redirect="/app/hr/employees/:id"
                                note={t("convertNote")}
                                fields={[
                                  { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: a.job.departmentId ?? "" },
                                  { name: "managerId", label: t("f.manager"), type: "select", options: opts.employees },
                                  { name: "workEmail", label: t("f.workEmail"), type: "email" },
                                  ...(canComp ? [{ name: "createCompensation", label: t("f.createCompensation"), type: "checkbox" as const, value: true }] : [{ name: "createCompensation", label: t("f.createCompensation"), type: "checkbox" as const, value: false }])
                                ]}
                              />
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
