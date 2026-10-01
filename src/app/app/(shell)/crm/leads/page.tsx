import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listLeads } from "@/server/crm/leads";
import { listViews } from "@/server/crm/views";
import { can } from "@/server/context";
import { ownerOptions, personName } from "@/lib/os/crm-page";
import { LEAD_SOURCES, LEAD_STATUSES, PRIORITIES, serviceName } from "@/lib/crm/services";
import { serviceChoices } from "@/server/commercial/catalog";
import { Badge, EmptyState, flatParams, fmtRelative, PageHeader, Pagination, PermissionDenied, priorityTone } from "@/components/os/ui";
import { leadStatusTone } from "@/components/crm/tones";
import { FilterBar } from "@/components/os/client";
import { LeadCreate } from "@/components/crm/CrmForms";
import { SavedViews } from "@/components/crm/RecordActions";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("crm.leads.view");
  if (!allowed) return <PermissionDenied permission="crm.leads.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [data, owners, views] = await Promise.all([listLeads(ctx, sp), ownerOptions(ctx, "crm.leads.assign", locale), listViews(ctx, "leads")]);
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1]) && !["page", "new"].includes(e[0]))).toString();

  const sortLink = (key: string) => {
    const dir = data.filters.sort === key && data.filters.dir === "desc" ? "asc" : "desc";
    const q = new URLSearchParams(Object.entries({ ...sp, sort: key, dir, page: undefined }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/app/crm/leads?${q}`;
  };
  const arrow = (key: string) => (data.filters.sort === key ? (data.filters.dir === "asc" ? " ↑" : " ↓") : "");
  const fu = (d: Date | null) => {
    if (!d) return <span className="text-os-faint">—</span>;
    const overdue = d < new Date();
    return <span className={`text-xs ${overdue ? "font-medium text-danger" : "text-os-muted"}`}>{fmtRelative(d, locale)}</span>;
  };

  return (
    <>
      <PageHeader icon="Filter" title={t("crm.leads.title")} subtitle={t("crm.leads.subtitle")} actions={can(ctx, "crm.leads.create") ? <LeadCreate owners={owners} /> : null} />
      <div className="mb-3">
        <SavedViews module="leads" views={views} query={query} />
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("crm.leads.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("crm.f.status")}: ${t("common.all")}`, options: [{ value: "active", label: t("crm.leads.active") }, ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`crm.leadStatus.${s}`) }))] },
            { name: "owner", allLabel: `${t("crm.f.owner")}: ${t("crm.f.anyone")}`, options: [{ value: "me", label: t("crm.f.me") }, ...(owners ? [{ value: "none", label: t("crm.f.unassigned") }, ...owners.map((o) => ({ value: o.id, label: o.label }))] : [])] },
            { name: "source", allLabel: `${t("crm.f.source")}: ${t("common.all")}`, options: LEAD_SOURCES.map((s) => ({ value: s, label: t(`crm.source.${s}`) })) },
            { name: "priority", allLabel: `${t("crm.f.priority")}: ${t("common.all")}`, options: PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })) },
            { name: "service", allLabel: `${t("crm.f.service")}: ${t("common.all")}`, options: (await serviceChoices(ctx).catch(() => [])).map((s) => ({ value: s.id, label: locale === "ar" ? s.nameAr : s.nameEn })) },
            { name: "followUp", allLabel: `${t("crm.f.followUp")}: ${t("common.all")}`, options: (["overdue", "today", "upcoming", "none"] as const).map((k) => ({ value: k, label: t(`crm.leads.${k === "today" ? "todayF" : k}`) })) }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Filter" title={t("crm.leads.emptyTitle")} text={t("crm.leads.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>
                    <Link href={sortLink("name")}>
                      {t("crm.f.name")}
                      {arrow("name")}
                    </Link>
                  </th>
                  <th className="hidden md:table-cell">{t("crm.f.source")}</th>
                  <th className="hidden lg:table-cell">{t("crm.f.service")}</th>
                  <th>{t("crm.f.status")}</th>
                  <th className="hidden sm:table-cell">
                    <Link href={sortLink("priority")}>
                      {t("crm.f.priority")}
                      {arrow("priority")}
                    </Link>
                  </th>
                  <th className="hidden md:table-cell">{t("crm.f.owner")}</th>
                  <th>
                    <Link href={sortLink("nextFollowUpAt")}>
                      {t("crm.f.followUp")}
                      {arrow("nextFollowUpAt")}
                    </Link>
                  </th>
                  <th className="hidden xl:table-cell">
                    <Link href={sortLink("createdAt")}>
                      {t("crm.f.created")}
                      {arrow("createdAt")}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/app/crm/leads/${l.id}`} className="block min-w-[180px]">
                        <span className="flex items-center gap-1.5 font-medium text-os-text hover:text-iris-light">
                          {l.name}
                          {l.duplicateOfId && <Icon name="Layers" size={12} className="text-warning" />}
                        </span>
                        <span className="block text-xs text-os-faint">
                          <span dir="ltr">{l.number}</span>
                          {l.companyName && ` · ${l.companyName}`}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden text-os-muted md:table-cell">{t(`crm.source.${l.source}`)}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{serviceName(l.service, l.interestedService, locale) ?? "—"}</td>
                    <td>
                      <Badge tone={leadStatusTone(l.status)} dot>
                        {t(`crm.leadStatus.${l.status}`)}
                      </Badge>
                    </td>
                    <td className="hidden sm:table-cell">
                      <Badge tone={priorityTone(l.priority)}>{t(`priority.${l.priority}`)}</Badge>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{personName(l.owner, locale) ?? <span className="text-warning">{t("crm.f.unassigned")}</span>}</td>
                    <td>{fu(l.nextFollowUpAt)}</td>
                    <td className="hidden text-xs text-os-faint xl:table-cell">{fmtRelative(l.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/crm/leads" params={sp} />
      </div>
    </>
  );
}
