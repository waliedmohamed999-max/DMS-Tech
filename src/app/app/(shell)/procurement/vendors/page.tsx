import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { canAny } from "@/server/context";
import { listVendorsOps } from "@/server/ops/vendors";
import { formatMoney } from "@/lib/commercial/calc";
import { EmptyState, flatParams, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";

export const metadata = { title: "Vendor performance" };

/** Phase 5 vendors with Phase 7 delivery metrics — deterministic counts, no scoring model. */
export default async function VendorsOpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "procurement.orders.view", "finance.vendors.view")) return <PermissionDenied permission="procurement.orders.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const rows = await listVendorsOps(ctx, sp.q);
  return (
    <div className="grid gap-5">
      <PageHeader icon="Handshake" title={t("vendors")} subtitle={t("vendorsSubtitle")} />
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("searchVendors") }} />
        {rows.length === 0 ? (
          <EmptyState icon="Handshake" title={t("noVendors")} text={t("noVendorsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.vendor")}</th>
                  <th className="text-end">{t("perf.orders")}</th>
                  <th className="hidden text-end md:table-cell">{t("perf.ordered")}</th>
                  <th className="text-end">{t("perf.late")}</th>
                  <th className="hidden text-end md:table-cell">{t("perf.avgDelay")}</th>
                  <th className="hidden text-end lg:table-cell">{t("perf.issues")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="min-w-[180px]">
                      <Link href={`/app/procurement/vendors/${v.id}`} className="font-medium hover:text-iris-light">
                        {v.preferred && <span className="me-1 text-gold">★</span>}
                        {v.name}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{v.number}</span>
                        {v.procurementCategory ? ` · ${v.procurementCategory}` : ""}
                        {v.leadTimeDays != null ? ` · ${t("leadDays", { n: v.leadTimeDays })}` : ""}
                      </span>
                    </td>
                    <td className="text-end tabular">{v.perf?.orders ?? 0}</td>
                    <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">
                      {v.perf ? Object.entries(v.perf.ordered).map(([c, a]) => formatMoney(a, locale, c)).join(" + ") : "—"}
                    </td>
                    <td className={`text-end tabular ${v.perf?.late ? "text-warning" : ""}`}>{v.perf?.late ?? 0}</td>
                    <td className="hidden text-end tabular md:table-cell">{v.perf?.avgDelayDays != null ? t("daysN", { n: v.perf.avgDelayDays }) : "—"}</td>
                    <td className={`hidden text-end tabular lg:table-cell ${v.perf?.issues ? "text-danger" : ""}`}>{v.perf?.issues ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("perfNote")}</p>
      </div>
    </div>
  );
}
