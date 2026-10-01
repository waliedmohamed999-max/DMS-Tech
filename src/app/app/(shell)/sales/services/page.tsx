import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { listPackages, listServices } from "@/server/commercial/catalog";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, PageHeader, Pagination, PermissionDenied, SectionCard } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ArchiveService, PackageForm, ServiceForm } from "@/components/sales/CatalogForms";

export const metadata = { title: "Service catalog" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("services.view");
  if (!allowed) return <PermissionDenied permission="services.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.sales");
  const manage = can(ctx, "services.manage");
  const [data, packages, departments, allServices] = await Promise.all([
    listServices(ctx, sp),
    listPackages(ctx, { includeArchived: manage }),
    manage ? prisma.department.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, nameAr: true } }) : Promise.resolve([]),
    prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, select: { id: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } })
  ]);
  const depts = departments.map((d) => ({ id: d.id, label: (locale === "ar" && d.nameAr) || d.name }));
  const name = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);

  return (
    <div className="grid gap-6">
      <PageHeader icon="Package" title={t("s.title")} subtitle={t("s.subtitle")} actions={manage ? <ServiceForm trigger="new" departments={depts} /> : null} />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("s.searchPh") }}
          selects={[
            { name: "status", allLabel: `${t("s.f.status")}: ${t("s.activeOnly")}`, options: [{ value: "archived", label: t("s.archived") }, { value: "all", label: t("all") }] },
            { name: "category", allLabel: `${t("s.f.category")}: ${t("all")}`, options: data.categories.map((c) => ({ value: c, label: c })) }
          ]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="Package" title={t("s.emptyTitle")} text={t("s.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("s.service")}</th>
                  <th className="hidden md:table-cell">{t("s.f.category")}</th>
                  <th>{t("s.f.pricingModel")}</th>
                  <th>{t("s.f.basePrice")}</th>
                  <th className="hidden lg:table-cell">{t("s.f.tax")}</th>
                  <th className="hidden lg:table-cell">{t("s.used")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} id={s.id} className={sp.focus === s.id ? "bg-iris/5" : ""}>
                    <td className="min-w-[220px]">
                      <span className="block font-medium">{name(s)}</span>
                      <span className="text-xs text-os-faint" dir="ltr">
                        {s.code}
                        {s.key ? ` · ${s.key}` : ""}
                      </span>
                      {!s.active && (
                        <span className="ms-2">
                          <Badge>{t("s.archived")}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{s.category ?? "—"}</td>
                    <td className="text-xs">{t(`s.models.${s.pricingModel}` as "s.models.FIXED")}</td>
                    <td className="tabular" dir="ltr">
                      {s.pricingModel === "CUSTOM" && s.basePrice.isZero() ? <span className="text-xs text-os-faint">{t("s.perQuote")}</span> : formatMoney(s.basePrice.toFixed(2), locale, s.currency)}
                    </td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{t(`s.tax.${s.taxBehavior}` as "s.tax.STANDARD")}</td>
                    <td className="hidden tabular text-xs text-os-muted lg:table-cell">{s._count.quotationItems}</td>
                    <td className="whitespace-nowrap text-end">
                      {manage && (
                        <>
                          <ServiceForm
                            trigger="edit"
                            departments={depts}
                            service={{ ...s, basePrice: s.basePrice.toFixed(2) }}
                          />
                          {s.active && <ArchiveService id={s.id} />}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/sales/services" params={sp} />
      </div>

      <SectionCard title={t("s.packages")} action={manage ? <PackageForm services={allServices} /> : undefined}>
        {packages.length === 0 ? (
          <EmptyState icon="Layers" title={t("s.noPackages")} text={t("s.noPackagesText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {packages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {name(p)} <span className="text-xs text-os-faint" dir="ltr">{p.code}</span> {!p.active && <Badge>{t("s.archived")}</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-os-muted">
                    {p.items.map((i) => `${name(i.service)}${i.quantity.equals(1) ? "" : ` × ${i.quantity.toFixed(3).replace(/\.?0+$/, "")}`}${i.optional ? ` (${t("s.optional")})` : ""}`).join(" · ")}
                  </p>
                </div>
                <span className="tabular font-medium" dir="ltr">
                  {formatMoney(p.defaultPrice.toFixed(2), locale, p.currency)}
                </span>
                {manage && (
                  <PackageForm
                    services={allServices}
                    pkg={{ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn, descriptionAr: p.descriptionAr, descriptionEn: p.descriptionEn, defaultPrice: p.defaultPrice.toFixed(2), currency: p.currency, taxBehavior: p.taxBehavior, active: p.active, items: p.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity.toFixed(3).replace(/\.?0+$/, ""), optional: i.optional })) }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
