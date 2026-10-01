import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getLead } from "@/server/crm/leads";
import { listActivities, listNotes, tagsFor } from "@/server/crm/activities";
import { getDefaultPipeline } from "@/server/crm/pipeline";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { ownerOptions, personName, serialiseActivities, serialiseNotes, waLink } from "@/lib/os/crm-page";
import { setLeadFollowUpAction } from "@/lib/os/crm-actions";
import { serviceName } from "@/lib/crm/services";
import { Badge, fmtDateTime, fmtMoney, PermissionDenied, priorityTone, SectionCard } from "@/components/os/ui";
import { ConvertLead, FollowUpPicker, LeadEdit } from "@/components/crm/CrmForms";
import { LeadActions } from "@/components/crm/RecordActions";
import { ActivityTimeline, NotesPanel } from "@/components/crm/Timeline";
import { Icon } from "@/components/ui/Icon";
import { leadStatusTone } from "@/components/crm/tones";

export const metadata = { title: "Lead" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm sm:grid-cols-[150px_1fr]">
      <dt className="text-os-muted">{label}</dt>
      <dd className="min-w-0 break-words text-os-text">{children ?? "—"}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("crm.leads.view");
  if (!allowed) return <PermissionDenied permission="crm.leads.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os");
  let lead;
  try {
    lead = await getLead(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const canTimeline = can(ctx, "crm.activities.view");
  const [activities, notes, tags, owners, pipeline] = await Promise.all([
    canTimeline ? listActivities(ctx, "LEAD", id) : Promise.resolve([]),
    canTimeline ? listNotes(ctx, "LEAD", id) : Promise.resolve([]),
    tagsFor("LEAD", id),
    ownerOptions(ctx, "crm.leads.assign", locale),
    getDefaultPipeline(prisma, ctx.organizationId)
  ]);
  const active = lead.status === "OPEN" || lead.status === "QUALIFIED";
  const canEdit = can(ctx, "crm.leads.edit") && active;
  const canConvert = can(ctx, "crm.leads.convert") && can(ctx, "crm.opportunities.create") && lead.status === "QUALIFIED";
  const wa = waLink(lead.whatsapp ?? lead.phone);
  const meta = (lead.captureMeta ?? null) as { utm?: Record<string, string>; referrer?: string | null; page?: string | null; form?: string } | null;
  const budget =
    lead.budgetMin || lead.budgetMax
      ? [lead.budgetMin && fmtMoney(Number(lead.budgetMin), locale, lead.currency), lead.budgetMax && fmtMoney(Number(lead.budgetMax), locale, lead.currency)].filter(Boolean).join(" – ")
      : null;

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/crm/leads" className="os-btn-ghost size-8 px-0" aria-label={t("common.back")}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {lead.number}
          </p>
          <h1 className="text-xl font-semibold">{lead.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={leadStatusTone(lead.status)} dot>
              {t(`crm.leadStatus.${lead.status}`)}
            </Badge>
            <Badge tone={priorityTone(lead.priority)}>{t(`priority.${lead.priority}`)}</Badge>
            <Badge>{t(`crm.leadStage.${lead.stage}`)}</Badge>
            <Badge tone="neutral">{t(`crm.source.${lead.source}`)}</Badge>
            {tags.map((tg) => (
              <Badge key={tg} tone="gold">
                #{tg}
              </Badge>
            ))}
            <span className="text-xs text-os-muted">
              · {t("crm.f.owner")}: {personName(lead.owner, locale) ?? <span className="text-warning">{t("crm.f.unassigned")}</span>}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-1.5">
          {canEdit && (
            <LeadEdit
              owners={owners}
              lead={{ ...lead, budgetMin: lead.budgetMin?.toString() ?? null, budgetMax: lead.budgetMax?.toString() ?? null }}
            />
          )}
          {canConvert && (
            <ConvertLead
              lead={{ id: lead.id, name: lead.name, companyName: lead.companyName, budgetMax: lead.budgetMax?.toString() ?? null, budgetMin: lead.budgetMin?.toString() ?? null, ownerId: lead.ownerId }}
              owners={await ownerOptions(ctx, "crm.opportunities.assign", locale)}
              stages={pipeline.stages.filter((s) => !s.isWonStage && !s.isLostStage).map((s) => ({ id: s.id, label: locale === "ar" ? s.nameAr : s.nameEn }))}
            />
          )}
          <LeadActions id={lead.id} status={lead.status} can={{ edit: can(ctx, "crm.leads.edit"), archive: can(ctx, "crm.leads.archive") }} />
        </div>
      </div>

      {lead.status === "OPEN" && can(ctx, "crm.leads.convert") && <p className="rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-sm text-info">{t("crm.convert.needsQualify")}</p>}
      {lead.status === "CONVERTED" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <Icon name="CircleCheck" size={16} />
          {t("crm.leads.convertedTo")}:
          {lead.convertedClient && (
            <Link href={`/app/crm/clients/${lead.convertedClient.id}`} className="font-medium underline">
              {lead.convertedClient.displayName}
            </Link>
          )}
          {lead.opportunity && (
            <Link href={`/app/crm/opportunities/${lead.opportunity.id}`} className="font-medium underline">
              {lead.opportunity.number}
            </Link>
          )}
        </div>
      )}
      {lead.duplicateOf && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <Icon name="Layers" size={15} /> {t("crm.leads.returning")} —
          <Link href={`/app/crm/leads/${lead.duplicateOf.id}`} className="underline">
            {lead.duplicateOf.number} · {lead.duplicateOf.name} ({t(`crm.leadStatus.${lead.duplicateOf.status}`)})
          </Link>
        </p>
      )}
      {lead.lostReason && lead.status === "LOST" && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {t("crm.f.lostReason")}: {lead.lostReason}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <div className="grid content-start gap-6">
          <SectionCard
            title={t("crm.f.name")}
            action={
              <span className="flex gap-1.5">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="os-btn-secondary h-8 px-2.5 text-xs">
                    <Icon name="PhoneCall" size={13} /> {t("crm.a.call")}
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="os-btn-secondary h-8 px-2.5 text-xs">
                    <Icon name="MessagesSquare" size={13} /> {t("crm.a.whatsapp")}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="os-btn-secondary h-8 px-2.5 text-xs">
                    <Icon name="Mail" size={13} />
                  </a>
                )}
              </span>
            }
          >
            <dl className="divide-y divide-os-line px-4">
              <Row label={t("crm.f.company")}>{lead.companyName}</Row>
              <Row label={t("crm.f.email")}>
                <span dir="ltr">{lead.email}</span>
              </Row>
              <Row label={t("crm.f.phone")}>
                <span dir="ltr">{lead.phone}</span>
              </Row>
              <Row label={t("crm.f.whatsapp")}>
                <span dir="ltr">{lead.whatsapp}</span>
              </Row>
              <Row label={t("crm.f.city")}>{[lead.city, lead.country].filter(Boolean).join(" · ") || null}</Row>
              <Row label={t("crm.f.service")}>{serviceName(lead.service, lead.interestedService, locale)}</Row>
              <Row label={t("crm.f.budget")}>{budget}</Row>
              <Row label={t("crm.f.source")}>{t(`crm.source.${lead.source}`)}</Row>
              <Row label={t("crm.f.created")}>{fmtDateTime(lead.createdAt, locale)}</Row>
            </dl>
          </SectionCard>

          <SectionCard title={t("crm.f.followUp")}>
            <div className="grid gap-3 p-4">
              <p className={`text-sm ${lead.nextFollowUpAt && lead.nextFollowUpAt < new Date() ? "font-medium text-danger" : "text-os-text"}`}>{lead.nextFollowUpAt ? fmtDateTime(lead.nextFollowUpAt, locale) : "—"}</p>
              {canEdit && <FollowUpPicker value={lead.nextFollowUpAt} onSave={setLeadFollowUpAction.bind(null, lead.id)} />}
            </div>
          </SectionCard>

          {(lead.message || lead.notes) && (
            <SectionCard title={lead.message ? t("crm.f.message") : t("crm.f.notes")}>
              <div className="grid gap-3 p-4 text-sm">
                {lead.message && <p className="whitespace-pre-wrap text-os-text" dir="auto">{lead.message}</p>}
                {lead.message && lead.notes && <hr className="border-os-line" />}
                {lead.notes && <p className="whitespace-pre-wrap text-os-muted" dir="auto">{lead.notes}</p>}
              </div>
            </SectionCard>
          )}

          {meta && (
            <SectionCard title={t("crm.leads.website")}>
              <dl className="divide-y divide-os-line px-4 text-xs">
                <Row label="form">{meta.form}</Row>
                {Object.entries(meta.utm ?? {}).map(([k, v]) => (
                  <Row key={k} label={k}>
                    <span dir="ltr">{v}</span>
                  </Row>
                ))}
                <Row label="referrer">
                  <span dir="ltr">{meta.referrer}</span>
                </Row>
                <Row label="page">
                  <span dir="ltr">{meta.page}</span>
                </Row>
              </dl>
            </SectionCard>
          )}
        </div>

        <div className="grid content-start gap-6">
          {canTimeline && (
            <SectionCard title={t("crm.tabs.activity")}>
              <div className="p-4">
                <ActivityTimeline items={serialiseActivities(activities, locale)} entityType="LEAD" entityId={lead.id} canCreate={can(ctx, "crm.activities.create")} />
              </div>
            </SectionCard>
          )}
          {canTimeline && (
            <SectionCard title={t("crm.tabs.notes")}>
              <div className="p-4">
                <NotesPanel items={serialiseNotes(notes, ctx.userId, locale)} entityType="LEAD" entityId={lead.id} canCreate={can(ctx, "crm.activities.create")} />
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
