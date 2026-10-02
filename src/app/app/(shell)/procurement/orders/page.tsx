import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { listOrders } from "@/server/ops/orders";
import { opsOptions, poTone } from "@/lib/os/ops-page";
import { createOrderAction } from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { LinesForm } from "@/components/ops/OpsForms";

export const metadata = { title: "Purchase orders" };
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "procurement.orders.view", "procurement.orders.create")) return <PermissionDenied permission="procurement.orders.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [data, opts, org] = await Promise.all([listOrders(ctx, sp), opsOptions(ctx, locale, { vendors: true, projects: true, departments: true }), prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true, vatRate: true } })]);
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="ShoppingCart"
        title={t("orders")}
        subtitle={t("ordersSubtitle")}
        actions={
          can(ctx, "procurement.orders.create") ? (
            <LinesForm
              action={createOrderAction}
              kind="order"
              currency={org.currency}
              defaultTaxRate={org.vatRate.toString()}
              trigger={`+ ${t("a.newPo")}`}
              submitLabel={t("a.saveDraft")}
              redirect="/app/procurement/orders/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/procurement/orders"
              header={[
                { name: "vendorId", label: t("f.vendor"), type: "select", required: true, options: opts.vendors },
                { name: "expectedDeliveryDate", label: t("f.expectedDelivery"), type: "date" },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments },
                { name: "projectId", label: t("f.project"), type: "select", options: opts.projects },
                { name: "terms", label: t("f.terms"), type: "textarea" }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchOrders") }}
          selects={[
            { name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: [{ value: "open", label: t("openOnly") }, { value: "late", label: t("lateOnly") }, ...STATUSES.map((s) => ({ value: s, label: t(`pstatus.${s}` as "pstatus.DRAFT") }))] },
            { name: "vendor", allLabel: `${t("f.vendor")}: ${t("all")}`, options: opts.vendors }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="ShoppingCart" title={t("noOrders")} text={t("noOrdersText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.order")}</th>
                  <th className="hidden md:table-cell">{t("f.expectedDelivery")}</th>
                  <th className="text-end">{t("f.total")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => {
                  const late = ["ISSUED", "PARTIALLY_RECEIVED"].includes(p.status) && p.expectedDeliveryDate && p.expectedDeliveryDate < data.today;
                  return (
                    <tr key={p.id}>
                      <td className="min-w-[200px]">
                        <Link href={`/app/procurement/orders/${p.id}`} className="font-medium hover:text-iris-light">
                          {p.vendor.name}
                        </Link>
                        <span className="block text-[11px] text-os-faint">
                          <span dir="ltr">{p.number}</span>
                          {p.procurementRequest ? <span dir="ltr"> · {p.procurementRequest.number}</span> : ""}
                          {p.project ? ` · ${p.project.name}` : ""}
                        </span>
                      </td>
                      <td className={`hidden whitespace-nowrap text-xs md:table-cell ${late ? "text-danger" : "text-os-muted"}`}>{p.expectedDeliveryDate ? fmtDate(p.expectedDeliveryDate, locale) : "—"}</td>
                      <td className="whitespace-nowrap text-end tabular" dir="ltr">{formatMoney(p.total.toFixed(2), locale, p.currency)}</td>
                      <td>
                        <Badge tone={poTone(p.status)}>{t(`pstatus.${p.status}` as "pstatus.DRAFT")}</Badge>
                        {late && <span className="ms-1 text-[10px] text-danger">{t("late")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/procurement/orders" params={sp} />
      </div>
    </div>
  );
}
