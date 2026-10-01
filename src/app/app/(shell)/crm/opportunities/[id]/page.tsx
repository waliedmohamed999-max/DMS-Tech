import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getOpportunity } from "@/server/crm/opportunities";
import { listActivities, listNotes } from "@/server/crm/activities";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { ownerOptions, personName, serialiseActivities, serialiseNotes, waLink } from "@/lib/os/crm-page";
import { setOppFollowUpAction } from "@/lib/os/crm-actions";
import { serviceName } from "@/lib/crm/services";
import { Badge, EmptyState, fmtDate, fmtDateTime, fmtMoney, PermissionDenied, SectionCard } from "@/components/os/ui";
import { FollowUpPicker, OpportunityForm } from "@/components/crm/CrmForms";
import { OpportunityActions } from "@/components/crm/RecordActions";
import { ActivityTimeline, NotesPanel } from "@/components/crm/Timeline";
import { oppStatusTone } from "@/components/crm/tones";
import { Icon } from "@/components/ui/Icon";
import { ContractsTab, QuotationsTab } from "@/components/sales/CommercialTabs";

export const metadata = { title: "Opportunity" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm sm:grid-cols-[150px_1fr]">
      <dt className="text-os-muted">{label}</dt>
      <dd className="min-w-0 break-words text-os-text">{children ?? "—"}</dd>
    </div>
  );
}

const TABS = ["overview", "activity", "notes", "quotations", "contracts"] as const;

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? "") ? rawTab! : "overview";
  const { ctx, allowed } = await pageCtx("crm.opportunities.view");
  if (!allowed) return <PermissionDenied permission="crm.opportunities.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os");
  let o;
  try {
    o = await getOpportunity(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const canTimeline = can(ctx, "crm.activities.view");
  const canEdit = can(ctx, "crm.opportunities.edit") && o.status !== "ARCHIVED";
  const [activities, notes, owners, contacts] = await Promise.all([
    canTimeline && tab === "activity" ? listActivities(ctx, "OPPORTUNITY", id) : Promise.resolve([]),
    canTimeline && tab === "notes" ? listNotes(ctx, "OPPORTUNITY", id) : Promise.resolve([]),
    ownerOptions(ctx, "crm.opportunities.assign", locale),
    prisma.contact.findMany({ where: { clientId: o.clientId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } })
  ]);
  const stageName = (s: { nameAr: string; nameEn: string }) => (locale === "ar" ? s.nameAr : s.nameEn);
  const contactName = o.primaryContact ? `${o.primaryContact.firstName} ${o.primaryContact.lastName ?? ""}`.trim() : null;
  const wa = waLink(o.primaryContact?.whatsapp ?? o.primaryContact?.phone);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/crm/opportunities" className="os-btn-ghost size-8 px-0" aria-label={t("common.back")}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {o.number}
          </p>
          <h1 className="text-xl font-semibold">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-os-muted">
            <Badge tone={oppStatusTone(o.status)} dot>
              {t(`crm.oppStatus.${o.status}`)}
            </Badge>
            <Badge tone="iris">{stageName(o.stage)}</Badge>
            <Link href={`/app/crm/clients/${o.client.id}`} className="hover:text-iris-light">
              {o.client.displayName}
            </Link>
            <span>· {personName(o.owner, locale) ?? "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-1.5">
          {canEdit && (
            <OpportunityForm
              trigger="edit"
              owners={owners}
              contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() }))}
              opp={{ ...o, estimatedValue: o.estimatedValue.toString() }}
            />
          )}
          <OpportunityActions id={o.id} status={o.status} can={{ win: can(ctx, "crm.opportunities.mark_won"), lose: can(ctx, "crm.opportunities.mark_lost"), edit: can(ctx, "crm.opportunities.edit") }} />
        </div>
      </div>

      {o.status === "LOST" && o.lostReason && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {t("crm.f.lostReason")}: {o.lostReason}
        </p>
      )}

      {/* stage stepper: where this deal sits in its pipeline */}
      <ol className="no-scrollbar flex gap-1 overflow-x-auto">
        {o.pipeline.stages.map((s) => {
          const reached = s.position <= o.stage.position && !s.isLostStage;
          const current = s.id === o.stageId;
          return (
            <li
              key={s.id}
              className={`flex min-w-[96px] flex-1 items-center justify-center rounded-md px-2 py-2 text-center text-[11px] font-medium ${
                current ? (s.isLostStage ? "bg-danger/20 text-danger" : s.isWonStage ? "bg-success/20 text-success" : "bg-iris text-white") : reached && !o.stage.isLostStage ? "bg-iris/15 text-iris-light" : "bg-os-raised text-os-faint"
              }`}
            >
              {stageName(s)}
            </li>
          );
        })}
      </ol>

      <nav className="flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.map((k) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`crm.tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title={t("crm.tabs.overview")}>
            <dl className="divide-y divide-os-line px-4">
              <Row label={t("crm.f.client")}>
                <Link href={`/app/crm/clients/${o.client.id}`} className="hover:text-iris-light">
                  {o.client.displayName}
                </Link>
              </Row>
              <Row label={t("crm.f.contact")}>
                {contactName && (
                  <span className="flex flex-wrap items-center gap-2">
                    {contactName}
                    {o.primaryContact?.phone && (
                      <a href={`tel:${o.primaryContact.phone}`} className="text-iris-light" aria-label={t("crm.a.call")}>
                        <Icon name="PhoneCall" size={14} />
                      </a>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="text-iris-light" aria-label="WhatsApp">
                        <Icon name="MessagesSquare" size={14} />
                      </a>
                    )}
                  </span>
                )}
              </Row>
              <Row label={t("crm.f.value")}>
                <span className="font-semibold tabular" dir="ltr">
                  {fmtMoney(Number(o.estimatedValue), locale, o.currency)}
                </span>
              </Row>
              <Row label={t("crm.f.probability")}>{o.probability}%</Row>
              <Row label={t("crm.f.stage")}>{stageName(o.stage)}</Row>
              <Row label={t("crm.f.service")}>{serviceName(o.service, o.serviceCategory, locale)}</Row>
              <Row label={t("crm.f.expectedClose")}>{o.expectedCloseDate ? fmtDate(o.expectedCloseDate, locale) : null}</Row>
              <Row label={t("crm.f.owner")}>{personName(o.owner, locale)}</Row>
              {o.sourceLead && (
                <Row label={t("crm.opps.fromLead")}>
                  <Link href={`/app/crm/leads/${o.sourceLead.id}`} className="hover:text-iris-light">
                    {o.sourceLead.number} · {o.sourceLead.name}
                  </Link>
                </Row>
              )}
              <Row label={t("crm.f.created")}>{fmtDateTime(o.createdAt, locale)}</Row>
              {o.wonAt && <Row label={t("crm.oppStatus.WON")}>{fmtDateTime(o.wonAt, locale)}</Row>}
            </dl>
            {o.description && <p className="whitespace-pre-wrap border-t border-os-line p-4 text-sm text-os-muted" dir="auto">{o.description}</p>}
          </SectionCard>
          <SectionCard title={t("crm.f.followUp")}>
            <div className="grid gap-3 p-4">
              <p className={`text-sm ${o.nextFollowUpAt && o.nextFollowUpAt < new Date() && o.status === "OPEN" ? "font-medium text-danger" : ""}`}>{o.nextFollowUpAt ? fmtDateTime(o.nextFollowUpAt, locale) : "—"}</p>
              {canEdit && o.status === "OPEN" && <FollowUpPicker value={o.nextFollowUpAt} onSave={setOppFollowUpAction.bind(null, o.id)} />}
            </div>
          </SectionCard>
        </div>
      )}
      {tab === "activity" && canTimeline && (
        <div className="os-card p-4">
          <ActivityTimeline items={serialiseActivities(activities, locale)} entityType="OPPORTUNITY" entityId={o.id} canCreate={can(ctx, "crm.activities.create")} />
        </div>
      )}
      {tab === "notes" && canTimeline && (
        <div className="os-card p-4">
          <NotesPanel items={serialiseNotes(notes, ctx.userId, locale)} entityType="OPPORTUNITY" entityId={o.id} canCreate={can(ctx, "crm.activities.create")} />
        </div>
      )}
      {tab === "quotations" && <QuotationsTab ctx={ctx} where={{ opportunityId: o.id }} createHref={`/app/sales/quotations/new?opportunity=${o.id}`} />}
      {tab === "contracts" && <ContractsTab ctx={ctx} where={{ opportunityId: o.id }} />}
    </div>
  );
}
