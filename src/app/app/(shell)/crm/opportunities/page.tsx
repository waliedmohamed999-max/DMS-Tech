import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listOpportunities } from "@/server/crm/opportunities";
import { getDefaultPipeline } from "@/server/crm/pipeline";
import { listViews } from "@/server/crm/views";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { ownerOptions, personName } from "@/lib/os/crm-page";
import { OPP_STATUSES, serviceName } from "@/lib/crm/services";
import { serviceChoices } from "@/server/commercial/catalog";
import { Badge, EmptyState, flatParams, fmtDate, fmtMoney, fmtRelative, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { OpportunityForm } from "@/components/crm/CrmForms";
import { SavedViews } from "@/components/crm/RecordActions";
import { oppStatusTone } from "@/components/crm/tones";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("crm.opportunities.view");
  if (!allowed) return <PermissionDenied permission="crm.opportunities.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [data, owners, pipeline, views] = await Promise.all([listOpportunities(ctx, sp), ownerOptions(ctx, "crm.opportunities.assign", locale), getDefaultPipeline(prisma, ctx.organizationId), listViews(ctx, "opportunities")]);
  const stageName = (s: { nameAr: string; nameEn: string }) => (locale === "ar" ? s.nameAr : s.nameEn);
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1]) && !["page", "new"].includes(e[0]))).toString();
  const sortLink = (key: string) => {
    const dir = data.filters.sort === key && data.filters.dir === "desc" ? "asc" : "desc";
    return `/app/crm/opportunities?${new URLSearchParams(Object.entries({ ...sp, sort: key, dir, page: undefined }).filter((e): e is [string, string] => Boolean(e[1])))}`;
  };
  const arrow = (key: string) => (data.filters.sort === key ? (data.filters.dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <>
      <PageHeader
        icon="Target"
        title={t("crm.opps.title")}
        subtitle={t("crm.opps.subtitle")}
        actions={
          can(ctx, "crm.opportunities.create") && can(ctx, "crm.clients.view") ? (
            <OpportunityForm trigger="newAuto" owners={owners} stages={pipeline.stages.filter((s) => !s.isWonStage && !s.isLostStage).map((s) => ({ id: s.id, label: stageName(s) }))} />
          ) : null
        }
      />
      <div className="mb-3">
        <SavedViews module="opportunities" views={views} query={query} />
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("crm.opps.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("crm.f.status")}: ${t("common.all")}`, options: OPP_STATUSES.map((s) => ({ value: s, label: t(`crm.oppStatus.${s}`) })) },
            { name: "stage", allLabel: `${t("crm.f.stage")}: ${t("common.all")}`, options: pipeline.stages.map((s) => ({ value: s.id, label: stageName(s) })) },
            { name: "owner", allLabel: `${t("crm.f.owner")}: ${t("crm.f.anyone")}`, options: [{ value: "me", label: t("crm.f.me") }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.label }))] },
            { name: "service", allLabel: `${t("crm.f.service")}: ${t("common.all")}`, options: (await serviceChoices(ctx).catch(() => [])).map((s) => ({ value: s.id, label: locale === "ar" ? s.nameAr : s.nameEn })) }
          ]}
        />
        <div className="flex items-center justify-between border-b border-os-line px-4 py-2 text-xs text-os-muted">
          <span>
            {t("crm.opps.total")}: <span className="font-semibold text-os-text tabular" dir="ltr">{fmtMoney(Number(data.totalValue), locale)}</span>
          </span>
          <span className="tabular">{data.total}</span>
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon="Target" title={t("crm.opps.emptyTitle")} text={t("crm.opps.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("crm.f.title")}</th>
                  <th className="hidden md:table-cell">{t("crm.f.stage")}</th>
                  <th>
                    <Link href={sortLink("estimatedValue")}>
                      {t("crm.f.value")}
                      {arrow("estimatedValue")}
                    </Link>
                  </th>
                  <th className="hidden lg:table-cell">{t("crm.f.service")}</th>
                  <th className="hidden md:table-cell">{t("crm.f.owner")}</th>
                  <th className="hidden sm:table-cell">
                    <Link href={sortLink("expectedCloseDate")}>
                      {t("crm.f.expectedClose")}
                      {arrow("expectedCloseDate")}
                    </Link>
                  </th>
                  <th className="hidden xl:table-cell">
                    <Link href={sortLink("nextFollowUpAt")}>
                      {t("crm.f.followUp")}
                      {arrow("nextFollowUpAt")}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/app/crm/opportunities/${o.id}`} className="block min-w-[200px]">
                        <span className="block font-medium text-os-text hover:text-iris-light">{o.title}</span>
                        <span className="block text-xs text-os-faint">
                          <span dir="ltr">{o.number}</span> · {o.client.displayName}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        <Badge>{stageName(o.stage)}</Badge>
                        {o.status !== "OPEN" && (
                          <Badge tone={oppStatusTone(o.status)} dot>
                            {t(`crm.oppStatus.${o.status}`)}
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="font-medium tabular" dir="ltr">
                      {fmtMoney(Number(o.estimatedValue), locale, o.currency)}
                      <span className="ms-1 text-[11px] font-normal text-os-faint">{o.probability}%</span>
                    </td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{serviceName(o.service, o.serviceCategory, locale) ?? "—"}</td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{personName(o.owner, locale) ?? "—"}</td>
                    <td className="hidden text-xs text-os-muted sm:table-cell">{o.expectedCloseDate ? fmtDate(o.expectedCloseDate, locale) : "—"}</td>
                    <td className={`hidden text-xs xl:table-cell ${o.nextFollowUpAt && o.nextFollowUpAt < new Date() && o.status === "OPEN" ? "text-danger" : "text-os-muted"}`}>{o.nextFollowUpAt ? fmtRelative(o.nextFollowUpAt, locale) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/crm/opportunities" params={sp} />
      </div>
    </>
  );
}
