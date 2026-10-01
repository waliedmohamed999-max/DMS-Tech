import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { CONTRACT_STATUSES, listContracts } from "@/server/commercial/contracts";
import { sweepIfDue } from "@/server/commercial/sweep";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { contractStatusTone } from "@/components/sales/tones";

export const metadata = { title: "Contracts" };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("sales.contracts.view");
  if (!allowed) return <PermissionDenied permission="sales.contracts.view" />;
  await sweepIfDue(ctx.organizationId);
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.sales");
  const data = await listContracts(ctx, sp);
  return (
    <>
      <PageHeader icon="Handshake" title={t("c.title")} subtitle={t("c.subtitle")} />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("c.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("c.f.status")}: ${t("all")}`, options: [{ value: "live", label: t("c.live") }, ...CONTRACT_STATUSES.map((s) => ({ value: s, label: t(`cStatus.${s}` as "cStatus.DRAFT") }))] },
            { name: "expiring", allLabel: `${t("c.f.end")}: ${t("all")}`, options: [{ value: "soon", label: t("c.expiringSoon") }] },
            { name: "owner", allLabel: `${t("q.f.owner")}: ${t("all")}`, options: [{ value: "me", label: t("me") }] }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Handshake" title={t("c.emptyTitle")} text={t("c.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("c.contract")}</th>
                  <th>{t("q.f.client")}</th>
                  <th className="hidden md:table-cell">{t("c.fromQuote")}</th>
                  <th>{t("c.value")}</th>
                  <th>{t("c.f.status")}</th>
                  <th className="hidden sm:table-cell">{t("c.f.end")}</th>
                  <th className="hidden lg:table-cell">{t("q.f.owner")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/sales/contracts/${c.id}`} className="block font-medium hover:text-iris-light">
                        <span dir="ltr">{c.number}</span>
                      </Link>
                      <span className="block max-w-[260px] truncate text-xs text-os-faint">{c.title}</span>
                    </td>
                    <td className="max-w-[200px] truncate">{c.client.displayName}</td>
                    <td className="hidden text-xs md:table-cell" dir="ltr">
                      {c.quotation ? (
                        <Link href={`/app/sales/quotations/${c.quotation.id}`} className="hover:text-iris-light">
                          {c.quotation.number} V{c.quotationVersion?.versionNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tabular font-medium" dir="ltr">
                      {formatMoney(c.contractValue.toFixed(2), locale, c.currency)}
                    </td>
                    <td>
                      <Badge tone={contractStatusTone(c.status)} dot>
                        {t(`cStatus.${c.status}` as "cStatus.DRAFT")}
                      </Badge>
                    </td>
                    <td className="hidden text-xs text-os-muted sm:table-cell">{c.endDate ? fmtDate(c.endDate, locale) : "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{personName(c.owner, locale) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/sales/contracts" params={sp} />
      </div>
    </>
  );
}
