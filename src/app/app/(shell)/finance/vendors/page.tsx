import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listVendors } from "@/server/finance/expenses";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ArchiveVendor, VendorForm } from "@/components/finance/Widgets";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("finance.vendors.view");
  if (!allowed) return <PermissionDenied permission="finance.vendors.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const data = await listVendors(ctx, sp);
  const manage = can(ctx, "finance.vendors.manage");
  return (
    <div className="grid gap-5">
      <PageHeader icon="Handshake" title={t("vendors")} subtitle={t("vendorsSubtitle")} actions={manage ? <VendorForm trigger={`+ ${t("newVendor")}`} autoOpen={sp.new === "1"} /> : undefined} />
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("searchVendors") }} selects={[{ name: "status", allLabel: t("activeOnly"), options: [{ value: "ARCHIVED", label: t("archived") }, { value: "all", label: t("all") }] }]} />
        {data.items.length === 0 ? (
          <EmptyState icon="Handshake" title={t("noVendors")} text="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("v.name")}</th>
                  <th className="hidden md:table-cell">{t("v.contactName")}</th>
                  <th className="hidden lg:table-cell">{t("v.taxNumber")}</th>
                  <th className="hidden md:table-cell">{t("v.category")}</th>
                  <th className="text-end">{t("spend")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr key={v.id}>
                    <td className="min-w-[180px]">
                      <span className="font-medium">{v.name}</span>
                      {v.status === "ARCHIVED" && <Badge>{t("archived")}</Badge>}
                      <span className="block text-[11px] text-os-faint" dir="ltr">
                        {v.number}
                        {v.email ? ` · ${v.email}` : ""}
                        {v.phone ? ` · ${v.phone}` : ""}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{v.contactName ?? "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell" dir="ltr">
                      {v.taxNumber ?? "—"}
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{v.category ?? "—"}</td>
                    <td className="whitespace-nowrap text-end text-xs tabular" dir="ltr">
                      <Link href={`/app/finance/expenses?vendor=${v.id}`} className="hover:text-iris-light">
                        {formatMoney(v.spend, locale)}
                      </Link>
                      <span className="block text-[10.5px] text-os-faint">{t("expenseCount", { n: v._count.expenses })}</span>
                    </td>
                    <td className="whitespace-nowrap text-end">
                      {manage && (
                        <span className="inline-flex gap-1">
                          <VendorForm id={v.id} trigger={t("a.edit")} initial={{ name: v.name, contactName: v.contactName ?? "", phone: v.phone ?? "", email: v.email ?? "", taxNumber: v.taxNumber ?? "", category: v.category ?? "", paymentTerms: v.paymentTerms ?? "", notes: v.notes ?? "" }} />
                          <ArchiveVendor id={v.id} archived={v.status === "ARCHIVED"} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/finance/vendors" params={sp} />
      </div>
      <p className="text-[11px] text-os-faint">{t("vendorsNote")}</p>
    </div>
  );
}
