import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { getClient360 } from "@/server/crm/clients";
import { listActivities, listNotes } from "@/server/crm/activities";
import { getDefaultPipeline } from "@/server/crm/pipeline";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { ownerOptions, personName, serialiseActivities, serialiseNotes, waLink } from "@/lib/os/crm-page";
import { Avatar, Badge, EmptyState, fmtDate, fmtDateTime, fmtMoney, fmtRelative, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ClientEdit, ContactForm, OpportunityForm } from "@/components/crm/CrmForms";
import { ArchiveClientButton } from "@/components/crm/RecordActions";
import { ActivityTimeline, NotesPanel } from "@/components/crm/Timeline";
import { clientStatusTone, oppStatusTone } from "@/components/crm/tones";
import { Icon } from "@/components/ui/Icon";
import { ContractsTab, QuotationsTab } from "@/components/sales/CommercialTabs";

export const metadata = { title: "Client" };

const TABS = ["overview", "contacts", "sales", "quotations", "contracts", "activity", "notes", "files"] as const;
const PLANNED = [
  { key: "projects", phase: 4 },
  { key: "finance", phase: 5 },
  { key: "support", phase: 7 }
] as const;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="os-card p-4">
      <p className="text-xs text-os-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-os-faint">{sub}</p>}
    </div>
  );
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: raw } = await searchParams;
  const planned = PLANNED.find((p) => p.key === raw);
  const tab = planned ? raw! : (TABS as readonly string[]).includes(raw ?? "") ? raw! : "overview";
  const { ctx, allowed } = await pageCtx("crm.clients.view");
  if (!allowed) return <PermissionDenied permission="crm.clients.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os");
  let data;
  try {
    data = await getClient360(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { client: c, opportunities, stats } = data;
  const canTimeline = can(ctx, "crm.activities.view");
  const [activities, notes, owners, oppOwners, pipeline] = await Promise.all([
    canTimeline && (tab === "activity" || tab === "overview") ? listActivities(ctx, "CLIENT", id, tab === "overview" ? 5 : 100) : Promise.resolve([]),
    canTimeline && tab === "notes" ? listNotes(ctx, "CLIENT", id) : Promise.resolve([]),
    ownerOptions(ctx, "crm.opportunities.assign", locale),
    ownerOptions(ctx, "crm.opportunities.assign", locale),
    getDefaultPipeline(prisma, ctx.organizationId)
  ]);
  const primary = c.contacts.find((x) => x.isPrimary);
  const editable = can(ctx, "crm.clients.edit") && c.status !== "ARCHIVED";
  const contactOpts = c.contacts.map((x) => ({ id: x.id, label: `${x.firstName} ${x.lastName ?? ""}`.trim() }));
  const stageName = (s: { nameAr: string; nameEn: string }) => (locale === "ar" ? s.nameAr : s.nameEn);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/crm/clients" className="os-btn-ghost size-8 px-0" aria-label={t("common.back")}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <Avatar name={c.displayName} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {c.number}
          </p>
          <h1 className="text-xl font-semibold">{c.displayName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-os-muted">
            <Badge tone={clientStatusTone(c.status)} dot>
              {t(`crm.clientStatus.${c.status}`)}
            </Badge>
            <Badge>{t(`crm.clientType.${c.type}`)}</Badge>
            <span>
              · {t("crm.f.owner")}: {personName(c.owner, locale) ?? "—"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {editable && <ClientEdit client={{ ...c, type: c.type, status: c.status }} owners={owners} />}
          {can(ctx, "crm.clients.archive") && c.status !== "ARCHIVED" && <ArchiveClientButton id={c.id} />}
        </div>
      </div>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.map((k) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`crm.tabs.${k}`)}
            {k === "contacts" && <span className="ms-1 text-os-faint tabular">{c.contacts.length}</span>}
            {k === "sales" && <span className="ms-1 text-os-faint tabular">{opportunities.length}</span>}
          </Link>
        ))}
        <span className="mx-1 my-2 w-px bg-os-line" />
        {PLANNED.map((p) => (
          <Link key={p.key} href={`?tab=${p.key}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === p.key ? "border-os-faint text-os-muted" : "border-transparent text-os-faint"}`}>
            {t(`crm.tabs.${p.key}`)} <span className="text-[10px]">P{p.phase}</span>
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("crm.clients.openOpps")} value={stats.openCount} />
            <Stat label={t("crm.clients.openValue")} value={<span dir="ltr">{fmtMoney(Number(stats.openValue), locale)}</span>} />
            <Stat label={t("crm.clients.won")} value={stats.wonCount} sub={<span dir="ltr">{fmtMoney(Number(stats.wonValue), locale)}</span>} />
            <Stat
              label={t("crm.clients.nextFollowUp")}
              value={stats.nextFollowUp?.nextFollowUpAt ? <span className="text-base">{fmtRelative(stats.nextFollowUp.nextFollowUpAt, locale)}</span> : "—"}
              sub={stats.lastActivity ? `${t("crm.clients.lastActivity")}: ${fmtRelative(stats.lastActivity.occurredAt, locale)}` : undefined}
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={t("crm.tabs.overview")}>
              <dl className="grid gap-x-6 px-4 py-2 text-sm sm:grid-cols-2">
                {[
                  [t("crm.f.email"), c.email && <a href={`mailto:${c.email}`} dir="ltr" className="hover:text-iris-light">{c.email}</a>],
                  [t("crm.f.phone"), c.phone && <a href={`tel:${c.phone}`} dir="ltr" className="hover:text-iris-light">{c.phone}</a>],
                  [t("crm.f.whatsapp"), c.whatsapp && <a href={waLink(c.whatsapp) ?? "#"} target="_blank" rel="noopener noreferrer" dir="ltr" className="hover:text-iris-light">{c.whatsapp}</a>],
                  [t("crm.f.website"), c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" dir="ltr" className="hover:text-iris-light">{c.website}</a>],
                  [t("crm.f.city"), [c.city, c.country].filter(Boolean).join(" · ")],
                  [t("crm.f.industry"), c.industry],
                  [t("crm.f.taxNumber"), c.taxNumber && <span dir="ltr">{c.taxNumber}</span>],
                  [t("crm.f.cr"), c.commercialRegistration && <span dir="ltr">{c.commercialRegistration}</span>],
                  [t("crm.f.source"), c.source ? t(`crm.source.${c.source}`) : null],
                  [t("crm.f.created"), fmtDate(c.createdAt, locale)]
                ].map(([label, value], i) => (
                  <div key={i} className="border-b border-os-line py-2">
                    <dt className="text-xs text-os-muted">{label}</dt>
                    <dd className="mt-0.5 break-words">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {primary && (
                <div className="flex items-center gap-3 border-t border-os-line p-4">
                  <Avatar name={primary.firstName} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {primary.firstName} {primary.lastName} <Badge tone="iris">{t("crm.f.primary")}</Badge>
                    </p>
                    <p className="text-xs text-os-muted">{primary.jobTitle ?? ""}</p>
                  </div>
                  {primary.phone && (
                    <a href={`tel:${primary.phone}`} className="os-btn-secondary h-8 px-2.5" aria-label={t("crm.a.call")}>
                      <Icon name="PhoneCall" size={14} />
                    </a>
                  )}
                  {waLink(primary.whatsapp ?? primary.phone) && (
                    <a href={waLink(primary.whatsapp ?? primary.phone)!} target="_blank" rel="noopener noreferrer" className="os-btn-secondary h-8 px-2.5" aria-label="WhatsApp">
                      <Icon name="MessagesSquare" size={14} />
                    </a>
                  )}
                </div>
              )}
            </SectionCard>
            {canTimeline && (
              <SectionCard title={t("crm.clients.lastActivity")} action={<Link href="?tab=activity" className="text-xs text-os-muted hover:text-os-text">{t("common.viewAll")}</Link>}>
                <div className="p-4">
                  <ActivityTimeline items={serialiseActivities(activities, locale)} entityType="CLIENT" entityId={c.id} canCreate={false} />
                </div>
              </SectionCard>
            )}
          </div>
        </>
      )}

      {tab === "contacts" && (
        <SectionCard title={t("crm.tabs.contacts")} action={can(ctx, "crm.contacts.create") && editable ? <ContactForm trigger="new" fixedClientId={c.id} /> : undefined}>
          {c.contacts.length === 0 ? (
            <EmptyState icon="Users" title={t("crm.contacts.emptyTitle")} text={t("crm.contacts.emptyText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {c.contacts.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={x.firstName} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {x.firstName} {x.lastName} {x.isPrimary && <Badge tone="iris">{t("crm.f.primary")}</Badge>}
                    </p>
                    <p className="text-xs text-os-muted">
                      {[x.jobTitle, x.email, x.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {x.phone && (
                    <a href={`tel:${x.phone}`} className="os-btn-ghost h-8 px-2" aria-label={t("crm.a.call")}>
                      <Icon name="PhoneCall" size={14} />
                    </a>
                  )}
                  {waLink(x.whatsapp ?? x.phone) && (
                    <a href={waLink(x.whatsapp ?? x.phone)!} target="_blank" rel="noopener noreferrer" className="os-btn-ghost h-8 px-2" aria-label="WhatsApp">
                      <Icon name="MessagesSquare" size={14} />
                    </a>
                  )}
                  {can(ctx, "crm.contacts.edit") && <ContactForm trigger="edit" fixedClientId={c.id} contact={x} />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "sales" && (
        <SectionCard
          title={t("crm.tabs.sales")}
          action={
            can(ctx, "crm.opportunities.create") && editable ? (
              <OpportunityForm trigger="new" fixedClientId={c.id} contacts={contactOpts} owners={oppOwners} stages={pipeline.stages.filter((s) => !s.isWonStage && !s.isLostStage).map((s) => ({ id: s.id, label: stageName(s) }))} />
            ) : undefined
          }
        >
          {opportunities.length === 0 ? (
            <EmptyState icon="Target" title={t("crm.opps.emptyTitle")} text={t("crm.opps.emptyText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("crm.f.title")}</th>
                    <th>{t("crm.f.stage")}</th>
                    <th>{t("crm.f.value")}</th>
                    <th className="hidden md:table-cell">{t("crm.f.owner")}</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/app/crm/opportunities/${o.id}`} className="font-medium hover:text-iris-light">
                          {o.title}
                        </Link>
                        <span className="block text-xs text-os-faint" dir="ltr">
                          {o.number}
                        </span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <Badge>{stageName(o.stage)}</Badge>
                          {o.status !== "OPEN" && <Badge tone={oppStatusTone(o.status)}>{t(`crm.oppStatus.${o.status}`)}</Badge>}
                        </span>
                      </td>
                      <td className="tabular" dir="ltr">
                        {fmtMoney(Number(o.estimatedValue), locale, o.currency)}
                      </td>
                      <td className="hidden text-xs text-os-muted md:table-cell">{personName(o.owner, locale) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.convertedLeads.length > 0 && (
            <p className="border-t border-os-line px-4 py-3 text-xs text-os-faint">
              {t("crm.opps.fromLead")}:{" "}
              {c.convertedLeads.map((l) => (
                <Link key={l.id} href={`/app/crm/leads/${l.id}`} className="me-2 hover:text-iris-light">
                  {l.number}
                </Link>
              ))}
            </p>
          )}
        </SectionCard>
      )}

      {tab === "activity" && canTimeline && (
        <div className="os-card p-4">
          <ActivityTimeline items={serialiseActivities(activities, locale)} entityType="CLIENT" entityId={c.id} canCreate={can(ctx, "crm.activities.create") && editable} />
        </div>
      )}
      {tab === "notes" && canTimeline && (
        <div className="os-card p-4">
          <NotesPanel items={serialiseNotes(notes, ctx.userId, locale)} entityType="CLIENT" entityId={c.id} canCreate={can(ctx, "crm.activities.create")} />
        </div>
      )}
      {tab === "quotations" && <QuotationsTab ctx={ctx} where={{ clientId: c.id }} createHref={`/app/sales/quotations/new?client=${c.id}`} />}
      {tab === "contracts" && <ContractsTab ctx={ctx} where={{ clientId: c.id }} />}
      {tab === "files" && (
        <div className="os-card">
          <EmptyState icon="FileSearch" title={t("crm.clients.plannedTab", { n: 7 })} text={t("crm.clients.filesPlanned")} />
        </div>
      )}
      {planned && (
        <div className="os-card">
          <EmptyState icon="Layers" title={t("crm.clients.plannedTab", { n: planned.phase })} text={t("crm.clients.plannedText")} />
        </div>
      )}
      <p className="text-[11px] text-os-faint">{fmtDateTime(c.updatedAt, locale)}</p>
    </div>
  );
}
