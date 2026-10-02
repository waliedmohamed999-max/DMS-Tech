import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listAssetCategories, listAssets } from "@/server/ops/assets";
import { assetTone, opsOptions } from "@/lib/os/ops-page";
import { createAssetAction } from "@/lib/os/ops-actions";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Assets" };
const STATUSES = ["IN_STOCK", "ASSIGNED", "IN_USE", "MAINTENANCE", "LOST", "DAMAGED", "RETIRED", "DISPOSED"];

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("assets.view");
  if (!allowed) return <PermissionDenied permission="assets.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [data, cats, opts] = await Promise.all([listAssets(ctx, sp), listAssetCategories(ctx.organizationId), opsOptions(ctx, locale, { vendors: true })]);
  const catOpts = cats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn }));
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Monitor"
        title={t("assets")}
        subtitle={t("assetsSubtitle")}
        actions={
          can(ctx, "assets.manage") ? (
            <ActionForm
              action={createAssetAction}
              trigger={`+ ${t("a.newAsset")}`}
              submitLabel={t("a.create")}
              redirect="/app/assets/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/assets"
              note={t("newAssetNote")}
              fields={[
                { name: "name", label: t("f.name"), required: true },
                { name: "categoryId", label: t("f.category"), type: "select", required: true, options: catOpts },
                { name: "serialNumber", label: t("f.serial"), dir: "ltr" },
                { name: "manufacturer", label: t("f.manufacturer") },
                { name: "model", label: t("f.model") },
                { name: "vendorId", label: t("f.vendor"), type: "select", options: opts.vendors },
                { name: "purchaseDate", label: t("f.purchaseDate"), type: "date" },
                { name: "purchaseCost", label: t("f.purchaseCost"), type: "number" },
                { name: "warrantyEndDate", label: t("f.warrantyEnd"), type: "date" },
                { name: "location", label: t("f.location") },
                { name: "notes", label: t("f.notes"), type: "textarea" }
              ]}
            />
          ) : undefined
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchAssets") }}
          selects={[
            { name: "status", allLabel: t("activeAssets"), options: STATUSES.map((s) => ({ value: s, label: t(`astatus.${s}` as "astatus.IN_STOCK") })) },
            { name: "category", allLabel: `${t("f.category")}: ${t("all")}`, options: catOpts }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Monitor" title={t("noAssets")} text={t("noAssetsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.asset")}</th>
                  <th className="hidden md:table-cell">{t("f.category")}</th>
                  <th>{t("f.holder")}</th>
                  <th className="hidden lg:table-cell">{t("f.warrantyEnd")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="min-w-[180px]">
                      <Link href={`/app/assets/${a.id}`} className="font-medium hover:text-iris-light">
                        {a.name}
                      </Link>
                      <span className="block text-[11px] text-os-faint" dir="ltr">
                        {a.number}
                        {a.serialNumber ? ` · ${a.serialNumber}` : ""}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{locale === "ar" ? a.category.nameAr : a.category.nameEn}</td>
                    <td className="text-xs">{a.assignedEmployee ? (locale === "ar" && a.assignedEmployee.nameAr) || a.assignedEmployee.displayName : <span className="text-os-faint">—</span>}</td>
                    <td className="hidden whitespace-nowrap text-xs text-os-muted lg:table-cell">{a.warrantyEndDate ? fmtDate(a.warrantyEndDate, locale) : "—"}</td>
                    <td>
                      <Badge tone={assetTone(a.status)}>{t(`astatus.${a.status}` as "astatus.IN_STOCK")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/assets" params={sp} />
      </div>
    </div>
  );
}
