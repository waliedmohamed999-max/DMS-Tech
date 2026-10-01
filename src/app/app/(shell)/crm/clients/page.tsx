import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listClients } from "@/server/crm/clients";
import { can } from "@/server/context";
import { ownerOptions, personName } from "@/lib/os/crm-page";
import { CLIENT_STATUSES } from "@/lib/crm/services";
import { Avatar, Badge, EmptyState, flatParams, fmtRelative, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ClientCreate } from "@/components/crm/CrmForms";
import { clientStatusTone } from "@/components/crm/tones";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("crm.clients.view");
  if (!allowed) return <PermissionDenied permission="crm.clients.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [data, owners] = await Promise.all([listClients(ctx, sp), ownerOptions(ctx, "crm.opportunities.assign", locale)]);

  return (
    <>
      <PageHeader icon="Building2" title={t("crm.clients.title")} subtitle={t("crm.clients.subtitle")} actions={can(ctx, "crm.clients.create") ? <ClientCreate owners={owners} /> : null} />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("crm.clients.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("crm.f.status")}: ${t("common.all")}`, options: CLIENT_STATUSES.map((s) => ({ value: s, label: t(`crm.clientStatus.${s}`) })) },
            { name: "type", allLabel: `${t("crm.f.type")}: ${t("common.all")}`, options: (["COMPANY", "INDIVIDUAL"] as const).map((s) => ({ value: s, label: t(`crm.clientType.${s}`) })) },
            { name: "owner", allLabel: `${t("crm.f.owner")}: ${t("crm.f.anyone")}`, options: [{ value: "me", label: t("crm.f.me") }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.label }))] }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Building2" title={t("crm.clients.emptyTitle")} text={t("crm.clients.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("crm.f.displayName")}</th>
                  <th className="hidden md:table-cell">{t("crm.clients.primaryContact")}</th>
                  <th>{t("crm.f.status")}</th>
                  <th className="hidden sm:table-cell">{t("crm.clients.openOpps")}</th>
                  <th className="hidden md:table-cell">{t("crm.f.owner")}</th>
                  <th className="hidden lg:table-cell">{t("crm.f.created")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/crm/clients/${c.id}`} className="flex min-w-[200px] items-center gap-3">
                        <Avatar name={c.displayName} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-os-text hover:text-iris-light">{c.displayName}</span>
                          <span className="block text-xs text-os-faint">
                            <span dir="ltr">{c.number}</span> · {t(`crm.clientType.${c.type}`)}
                            {c.city && ` · ${c.city}`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{c.contacts[0] ? `${c.contacts[0].firstName} ${c.contacts[0].lastName ?? ""}` : "—"}</td>
                    <td>
                      <Badge tone={clientStatusTone(c.status)} dot>
                        {t(`crm.clientStatus.${c.status}`)}
                      </Badge>
                    </td>
                    <td className="hidden tabular sm:table-cell">{c._count.opportunities}</td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{personName(c.owner, locale) ?? "—"}</td>
                    <td className="hidden text-xs text-os-faint lg:table-cell">{fmtRelative(c.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/crm/clients" params={sp} />
      </div>
    </>
  );
}
