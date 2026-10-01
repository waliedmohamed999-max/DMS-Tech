import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listQuotations, QUOTE_STATUSES } from "@/server/commercial/quotations";
import { sweepIfDue } from "@/server/commercial/sweep";
import { ownerOptions, personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, fmtRelative, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { quoteStatusTone } from "@/components/sales/tones";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("sales.quotations.view");
  if (!allowed) return <PermissionDenied permission="sales.quotations.view" />;
  await sweepIfDue(ctx.organizationId);
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.sales");
  const [data, owners] = await Promise.all([listQuotations(ctx, sp), ownerOptions(ctx, "crm.opportunities.assign", locale)]);
  const sortHref = (k: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    p.set("sort", k);
    p.set("dir", sp.sort === k && sp.dir !== "asc" ? "asc" : "desc");
    p.delete("page");
    return `?${p}`;
  };

  return (
    <>
      <PageHeader
        icon="FileText"
        title={t("q.title")}
        subtitle={t("q.subtitle")}
        actions={
          can(ctx, "sales.quotations.create") ? (
            <Link href="/app/sales/quotations/new" className="os-btn-primary">
              + {t("q.new")}
            </Link>
          ) : null
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("q.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("q.f.status")}: ${t("all")}`, options: [{ value: "open", label: t("q.openOnly") }, { value: "awaiting", label: t("q.awaiting") }, ...QUOTE_STATUSES.map((s) => ({ value: s, label: t(`qStatus.${s}` as "qStatus.DRAFT") }))] },
            { name: "approval", allLabel: `${t("q.f.approval")}: ${t("all")}`, options: (["pending", "required", "none"] as const).map((s) => ({ value: s, label: t(`q.approvalFilter.${s}` as "q.approvalFilter.pending") })) },
            { name: "expiring", allLabel: `${t("q.f.validity")}: ${t("all")}`, options: [{ value: "soon", label: t("q.expiringSoon") }, { value: "past", label: t("qStatus.EXPIRED") }] },
            { name: "owner", allLabel: `${t("q.f.owner")}: ${t("all")}`, options: [{ value: "me", label: t("me") }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.label }))] }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="FileText" title={t("q.emptyTitle")} text={t("q.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>
                    <Link href={sortHref("number")}>{t("q.quotation")}</Link>
                  </th>
                  <th>{t("q.f.client")}</th>
                  <th className="hidden lg:table-cell">{t("q.f.opportunity")}</th>
                  <th>
                    <Link href={sortHref("total")}>{t("q.amount")}</Link>
                  </th>
                  <th className="hidden md:table-cell">{t("q.f.owner")}</th>
                  <th>{t("q.f.status")}</th>
                  <th className="hidden sm:table-cell">
                    <Link href={sortHref("validUntil")}>{t("q.f.validUntil")}</Link>
                  </th>
                  <th className="hidden xl:table-cell">
                    <Link href={sortHref("updatedAt")}>{t("q.updated")}</Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((q) => {
                  const v = q.currentVersion;
                  const soon = v && ["SENT", "VIEWED"].includes(q.status) && v.validUntil.getTime() - data.today.getTime() <= 3 * 86_400_000;
                  return (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/app/sales/quotations/${q.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                          {q.number} <span className="text-os-faint">V{v?.versionNumber}</span>
                        </Link>
                      </td>
                      <td className="max-w-[220px] truncate">{q.client.displayName}</td>
                      <td className="hidden max-w-[220px] truncate text-xs text-os-muted lg:table-cell">{q.opportunity ? `${q.opportunity.number} · ${q.opportunity.title}` : "—"}</td>
                      <td className="tabular font-medium" dir="ltr">
                        {v ? formatMoney(v.total.toFixed(2), locale, v.currency) : "—"}
                      </td>
                      <td className="hidden text-xs text-os-muted md:table-cell">{personName(q.owner, locale) ?? "—"}</td>
                      <td>
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge tone={quoteStatusTone(q.status)} dot>
                            {t(`qStatus.${q.status}` as "qStatus.DRAFT")}
                          </Badge>
                          {v?.approvalRequired && q.status === "DRAFT" && <Badge tone="warning">{t("q.needsApprovalShort")}</Badge>}
                        </span>
                      </td>
                      <td className={`hidden text-xs sm:table-cell ${soon ? "font-medium text-warning" : "text-os-muted"}`}>{v ? fmtDate(v.validUntil, locale) : "—"}</td>
                      <td className="hidden text-xs text-os-faint xl:table-cell">{fmtRelative(q.updatedAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/sales/quotations" params={sp} />
      </div>
    </>
  );
}
