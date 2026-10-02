import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { listCategories } from "@/server/finance/expenses";
import { listCostRates } from "@/server/finance/costing";
import { formatMoney } from "@/lib/commercial/calc";
import { todayIn } from "@/server/commercial/dates";
import { personName } from "@/lib/os/crm-page";
import { Badge, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { CategoryForm, CostRateForm } from "@/components/finance/Widgets";

export const metadata = { title: "Finance setup" };

/** Expense categories (finance.vendors.manage / admin.settings.manage) and hourly cost rates (finance.cost_rates.*). */
export default async function FinanceSetupPage() {
  const { ctx } = await pageCtx();
  const canCats = canAny(ctx, "finance.vendors.manage", "admin.settings.manage");
  const canRates = can(ctx, "finance.cost_rates.view");
  if (!canCats && !canRates) return <PermissionDenied permission="finance.vendors.manage" />;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const [cats, rates, users] = await Promise.all([
    canCats ? listCategories(ctx, { all: true }) : Promise.resolve([]),
    canRates ? listCostRates(ctx) : Promise.resolve([]),
    can(ctx, "finance.cost_rates.manage") ? prisma.user.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }) : Promise.resolve([])
  ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon="SlidersHorizontal" title={t("setup")} subtitle={t("setupSubtitle")} />
      {canCats && (
        <SectionCard title={t("categories")} action={<CategoryForm trigger={`+ ${t("newCategory")}`} />}>
          <ul className="grid divide-y divide-os-line text-sm sm:grid-cols-2 sm:divide-y-0">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-os-line px-4 py-2 sm:border-b">
                <span className="flex-1">{locale === "ar" ? c.nameAr : c.nameEn}</span>
                {!c.active && <Badge>{t("inactive")}</Badge>}
                <CategoryForm id={c.id} trigger={t("a.edit")} initial={{ nameAr: c.nameAr, nameEn: c.nameEn, active: c.active }} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {canRates && (
        <SectionCard title={t("costRates")}>
          <div className="grid gap-3 p-4">
            <p className="text-xs text-os-muted">{t("costRatesNote")}</p>
            {can(ctx, "finance.cost_rates.manage") && <CostRateForm today={todayIn((await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } })).timezone).toISOString().slice(0, 10)} users={users.map((u) => ({ id: u.id, label: personName(u, locale) ?? u.name }))} />}
          </div>
          {rates.length > 0 && (
            <div className="overflow-x-auto border-t border-os-line">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.person")}</th>
                    <th className="text-end">{t("f.hourlyCost")}</th>
                    <th>{t("f.effectiveFrom")}</th>
                    <th>{t("f.effectiveTo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {personName(r.user, locale)}
                        <span className="block text-[11px] text-os-faint">{r.user.jobTitle}</span>
                      </td>
                      <td className="text-end tabular" dir="ltr">
                        {formatMoney(r.hourlyCost.toFixed(2), locale, r.currency)}
                      </td>
                      <td className="text-xs">{fmtDate(r.effectiveFrom, locale)}</td>
                      <td className="text-xs">{r.effectiveTo ? fmtDate(r.effectiveTo, locale) : <Badge tone="success">{t("current")}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
