import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getTicket, supportAgents, TICKET_TRANSITIONS } from "@/server/ops/support";
import { relatedArticles, searchArticles } from "@/server/ops/knowledge";
import { priorityTone, slaTone, ticketTone, userName } from "@/lib/os/ops-page";
import { assignTicketAction, ticketCommentAction, ticketMetaAction, ticketPriorityAction, ticketStatusAction } from "@/lib/os/ops-actions";
import { Badge, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { CommentBox } from "@/components/ops/OpsForms";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kb?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getTicket(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const x = d.ticket;
  const open = !["RESOLVED", "CLOSED", "CANCELLED"].includes(x.status);
  const [agents, related, kb] = await Promise.all([
    d.can.assign && open ? supportAgents(ctx) : Promise.resolve([]),
    d.staff ? relatedArticles(ctx, x) : Promise.resolve([]),
    d.staff && sp.kb && can(ctx, "knowledge.view") ? searchArticles(ctx, { q: sp.kb }).then((r) => r.published.slice(0, 6)) : Promise.resolve(null)
  ]);
  const name = (uid: string | null | undefined) => userName(d.people, uid, locale) ?? t("system");
  const next = TICKET_TRANSITIONS[x.status].filter((s) => s !== "CANCELLED" || d.can.work || x.createdById === ctx.userId);
  const due = (dt: Date | null) => (dt ? fmtDateTime(dt, locale) : "—");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/support" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{x.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {x.subject}
            <Badge tone={ticketTone(x.status)} dot>
              {t(`tstatus.${x.status}` as "tstatus.NEW")}
            </Badge>
            <Badge tone={priorityTone(x.priority)}>{t(`prio.${x.priority}` as "prio.LOW")}</Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            {x.client && (
              <Link href={`/app/crm/clients/${x.client.id}?tab=support`} className="hover:text-iris-light">
                {(locale === "ar" && x.client.nameAr) || x.client.displayName}
              </Link>
            )}
            <span>{t(`tcat.${x.category}` as "tcat.TECHNICAL")}</span>
            <span>{t(`tsrc.${x.source}` as "tsrc.INTERNAL")}</span>
            <span>{t("f.assignee")}: {x.assignedToId ? name(x.assignedToId) : <span className="text-warning">{t("unassigned")}</span>}</span>
            {x.tags.map((g) => (
              <span key={g.id} className="text-iris-light" dir="ltr">#{g.tag}</span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {d.can.take && open && <RunButton action={assignTicketAction} args={[id, { assigneeId: ctx.userId, expected: x.assignedToId }]} label={t("a.take")} className="os-btn-secondary" />}
          {d.can.assign && open && agents.length > 0 && (
            <ActionForm
              action={assignTicketAction}
              args={[id]}
              trigger={x.assignedToId ? t("a.reassign") : t("a.assign")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              fields={[
                { name: "assigneeId", label: t("f.assignee"), type: "select", required: true, value: x.assignedToId ?? "", options: agents.map((a) => ({ value: a.id, label: (locale === "ar" && a.nameAr) || a.name })) },
                { name: "expected", label: "", type: "hidden", value: x.assignedToId ?? "" }
              ]}
            />
          )}
          {next.length > 0 && (d.can.work || x.createdById === ctx.userId) && (
            <ActionForm
              action={ticketStatusAction}
              args={[id]}
              trigger={t("a.changeStatus")}
              triggerClass="os-btn-primary"
              submitLabel={t("a.save")}
              note={t("statusNote")}
              fields={[
                { name: "to", label: t("f.status"), type: "select", required: true, options: next.map((s) => ({ value: s, label: t(`tstatus.${s}` as "tstatus.NEW") })) },
                { name: "from", label: "", type: "hidden", value: x.status },
                { name: "reason", label: t("f.resolutionOrReason"), type: "textarea" }
              ]}
            />
          )}
          {d.can.work && open && (
            <ActionForm
              action={ticketPriorityAction}
              args={[id]}
              trigger={t("a.priority")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              note={t("priorityNote")}
              fields={[
                { name: "priority", label: t("f.priority"), type: "select", required: true, value: x.priority, options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`prio.${p}` as "prio.LOW") })) },
                { name: "reason", label: t("f.reason"), type: "textarea", required: true }
              ]}
            />
          )}
          {d.can.work && open && (
            <ActionForm
              action={ticketMetaAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              fields={[
                { name: "category", label: t("f.category"), type: "select", required: true, value: x.category, options: ["TECHNICAL", "BUG", "ACCESS", "CHANGE_REQUEST", "BILLING", "QUESTION", "OTHER"].map((c) => ({ value: c, label: t(`tcat.${c}` as "tcat.TECHNICAL") })) },
                { name: "tags", label: t("f.tags"), value: x.tags.map((g) => g.tag).join(", ") },
                { name: "projectId", label: "", type: "hidden", value: x.projectId ?? "" },
                { name: "serviceId", label: "", type: "hidden", value: x.serviceId ?? "" }
              ]}
            />
          )}
        </div>
      </div>

      {d.staff && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-4">
          <div className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t("slaResponse")}</p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <Badge tone={slaTone(d.sla.response)}>{t(`sla.${d.sla.response}` as "sla.ok")}</Badge>
            </p>
            <p className="mt-1 text-[11px] text-os-faint">{x.firstResponseAt ? fmtDateTime(x.firstResponseAt, locale) : `${t("due")} ${due(x.firstResponseDueAt)}`}</p>
          </div>
          <div className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t("slaResolution")}</p>
            <p className="mt-1 text-sm">
              <Badge tone={slaTone(d.sla.resolution)}>{t(`sla.${d.sla.resolution}` as "sla.ok")}</Badge>
            </p>
            <p className="mt-1 text-[11px] text-os-faint">{x.resolvedAt ? fmtDateTime(x.resolvedAt, locale) : `${t("due")} ${due(x.resolutionDueAt)}`}</p>
          </div>
          <div className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t("slaPolicy")}</p>
            <p className="mt-1 text-sm">{x.slaPolicy?.name ?? "—"}</p>
            <p className="mt-1 text-[11px] text-os-faint">{x.slaPolicy ? t("slaWindow", { r: x.slaPolicy.firstResponseMinutes, s: x.slaPolicy.resolutionMinutes }) : t("noSlaPolicy")}</p>
          </div>
          <div className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t("pausedFor")}</p>
            <p className="mt-1 text-sm tabular">{t("minutesN", { n: x.pausedMinutes })}</p>
            <p className="mt-1 text-[11px] text-os-faint">{x.slaPolicy?.pauseOnWaitingClient ? t("pausesOnWaiting") : t("noPause")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <SectionCard title={t("f.description")}>
            <p className="whitespace-pre-line p-4 text-sm" dir="auto">{x.description}</p>
            <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">
              {name(x.createdById)} · {fmtDateTime(x.createdAt, locale)}
            </p>
          </SectionCard>
          <SectionCard title={t("conversation")}>
            {x.comments.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noComments")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {x.comments.map((c) => (
                  <li key={c.id} className={`grid gap-1 px-4 py-2.5 ${c.visibility === "INTERNAL" ? "bg-warning/5" : ""}`}>
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{name(c.authorId)}</span>
                      <Badge tone={c.visibility === "INTERNAL" ? "warning" : "info"}>{t(`cvis.${c.visibility}` as "cvis.INTERNAL")}</Badge>
                      <span className="flex-1" />
                      <span className="text-os-faint">{fmtDateTime(c.createdAt, locale)}</span>
                    </p>
                    <p className="whitespace-pre-line text-sm" dir="auto">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {!["CLOSED", "CANCELLED"].includes(x.status) && <CommentBox action={ticketCommentAction} ticketId={id} staff={d.staff} />}
          </SectionCard>
        </div>
        <div className="grid content-start gap-5">
          <SectionCard title={t("related")}>
            <dl className="grid gap-1 p-4 text-sm">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <dt className="text-os-muted">{t("f.client")}</dt>
                <dd>{x.client ? <Link href={`/app/crm/clients/${x.client.id}`} className="hover:text-iris-light">{(locale === "ar" && x.client.nameAr) || x.client.displayName}</Link> : "—"}</dd>
              </div>
              {x.contact && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <dt className="text-os-muted">{t("f.contact")}</dt>
                  <dd>
                    {x.contact.firstName} {x.contact.lastName ?? ""}
                    {x.contact.phone && <span className="block text-[11px] text-os-faint" dir="ltr">{x.contact.phone}</span>}
                  </dd>
                </div>
              )}
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <dt className="text-os-muted">{t("f.project")}</dt>
                <dd>{x.project ? <Link href={`/app/projects/${x.project.id}`} className="hover:text-iris-light">{x.project.number} · {x.project.name}</Link> : "—"}</dd>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <dt className="text-os-muted">{t("f.service")}</dt>
                <dd>{x.service ? (locale === "ar" ? x.service.nameAr : x.service.nameEn) : "—"}</dd>
              </div>
            </dl>
          </SectionCard>
          {d.staff && can(ctx, "knowledge.view") && (
            <SectionCard title={t("knowledgeHelp")}>
              <form className="flex gap-2 border-b border-os-line p-3" action="">
                <input name="kb" defaultValue={sp.kb ?? ""} className="os-input h-8 text-xs" placeholder={t("searchKnowledge")} />
                <button className="os-btn-ghost h-8 px-3 text-xs">{t("a.search")}</button>
              </form>
              <ul className="divide-y divide-os-line text-sm">
                {(kb ?? related).map((a) => (
                  <li key={a.id} className="px-4 py-2">
                    <Link href={`/app/knowledge/${a.id}`} className="hover:text-iris-light">
                      <span className="text-[11px] text-os-faint" dir="ltr">{a.number}</span> {(locale === "ar" ? a.publishedVersion?.titleAr : a.publishedVersion?.titleEn) ?? ""}
                    </Link>
                  </li>
                ))}
                {(kb ?? related).length === 0 && <li className="px-4 py-4 text-center text-xs text-os-faint">{kb ? t("noArticles") : t("noRelated")}</li>}
              </ul>
              <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("relatedNote")}</p>
            </SectionCard>
          )}
          <SectionCard title={t("statusHistory")}>
            <ul className="divide-y divide-os-line text-xs">
              {x.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <span>
                    {h.fromStatus ? `${t(`tstatus.${h.fromStatus}` as "tstatus.NEW")} ${locale === "ar" ? "←" : "→"} ` : ""}
                    <b>{t(`tstatus.${h.toStatus}` as "tstatus.NEW")}</b>
                  </span>
                  <span className="flex-1 text-os-muted" dir="auto">{h.reason ?? ""}</span>
                  <span className="text-os-faint">{name(h.changedById)} · {fmtDateTime(h.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
          <DocumentsPanel ctx={ctx} entity={{ type: "TICKET", id }} />
        </div>
      </div>
    </div>
  );
}
