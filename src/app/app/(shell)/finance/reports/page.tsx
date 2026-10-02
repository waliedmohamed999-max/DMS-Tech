import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { todayIn } from "@/server/commercial/dates";
import { financeReports, periodOf } from "@/server/finance/insights";
import { profitabilityReport } from "@/server/finance/costing";
import { formatMoney } from "@/lib/commercial/calc";
import { PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";

export const metadata = { title: "Financial reports" };
const PRESETS = ["month", "last_month", "quarter", "year"] as const;

function Bars({ rows, m, empty }: { rows: { label: string; value: string; href?: string }[]; m: (v: string) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value)));
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-os-muted">{empty}</p>;
  return (
    <div className="grid gap-2 p-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-2 text-xs">
          {r.href ? (
            <Link href={r.href} className="truncate text-os-muted hover:text-os-text">
              {r.label}
            </Link>
          ) : (
            <span className="truncate text-os-muted">{r.label}</span>
          )}
          <span className="h-2 overflow-hidden rounded-full bg-os-raised">
            <span className="block h-full rounded-full bg-iris" style={{ width: `${(Number(r.value) / max) * 100}%` }} />
          </span>
          <span className="tabular" dir="ltr">
            {m(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const { ctx, allowed } = await pageCtx("finance.reports.view");
  if (!allowed) return <PermissionDenied permission="finance.reports.view" />;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const p = periodOf(sp, todayIn(org.timezone));
  const [r, profit] = await Promise.all([financeReports(ctx, p), can(ctx, "finance.profitability.view") ? profitabilityReport(ctx, {}) : Promise.resolve(null)]);
  const m = (v: string) => formatMoney(v, locale, r.currency);
  return (
    <div className="grid gap-5">
      <PageHeader icon="TrendingUp" title={t("reports")} subtitle={t("reportsSubtitle")} />
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((x) => (
          <Link key={x} href={`?preset=${x}`} className={`rounded-md px-2.5 py-1 text-xs ${p.preset === x ? "bg-os-raised text-os-text" : "text-os-muted hover:text-os-text"}`}>
            {t(`period.${x}` as "period.month")}
          </Link>
        ))}
        <span className="ms-2 text-[11px] text-os-faint">{t("currencyNote", { c: r.currency })}</span>
      </div>
      <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2.5 text-xs text-os-muted">{t("notAccounting")}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("r.invoicedByMonth")}>
          <Bars rows={r.invoicedByMonth.map((x) => ({ label: x.month, value: x.value }))} m={m} empty={t("noData")} />
        </SectionCard>
        {r.collectedByMonth && (
          <SectionCard title={t("r.collectedByMonth")}>
            <Bars rows={r.collectedByMonth.map((x) => ({ label: x.month, value: x.value }))} m={m} empty={t("noData")} />
          </SectionCard>
        )}
        <SectionCard title={t("r.outstandingByClient")}>
          <Bars rows={r.outstandingByClient.map((x) => ({ label: x.name, value: x.value, href: `/app/crm/clients/${x.id}?tab=finance` }))} m={m} empty={t("noData")} />
        </SectionCard>
        <SectionCard title={t("r.billedByService")}>
          <Bars rows={r.billedByService.map((x) => ({ label: x.service ? (locale === "ar" ? x.service.nameAr : x.service.nameEn) : t("customLine"), value: x.value }))} m={m} empty={t("noData")} />
        </SectionCard>
        {r.expensesByCategory && (
          <SectionCard title={t("r.expensesByCategory")}>
            <Bars rows={r.expensesByCategory.map((x) => ({ label: x.cat ? (locale === "ar" ? x.cat.nameAr : x.cat.nameEn) : "—", value: x.value }))} m={m} empty={t("noData")} />
          </SectionCard>
        )}
        {r.expensesByProject && (
          <SectionCard title={t("r.expensesByProject")}>
            <Bars rows={r.expensesByProject.map((x) => ({ label: x.project ? x.project.number : "—", value: x.value, href: x.project ? `/app/projects/${x.project.id}?tab=finance` : undefined }))} m={m} empty={t("noData")} />
          </SectionCard>
        )}
      </div>
      {profit && (
        <SectionCard title={t("r.profitability")} action={<span className="text-[11px] text-os-faint">{t("operationalEstimate")}</span>}>
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.project")}</th>
                  <th className="text-end">{t("p.budget")}</th>
                  <th className="text-end">{t("p.billedNet")}</th>
                  <th className="text-end">{t("p.collected")}</th>
                  <th className="text-end">{t("p.directCost")}</th>
                  <th className="text-end">{t("p.timeCost")}</th>
                  <th className="text-end">{t("p.margin")}</th>
                </tr>
              </thead>
              <tbody>
                {profit.map((x) => (
                  <tr key={x.id}>
                    <td className="min-w-[180px]">
                      <Link href={`/app/projects/${x.id}?tab=finance`} className="hover:text-iris-light">
                        {x.name}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{x.number}</span> · {x.client?.displayName}
                      </span>
                    </td>
                    <td className="text-end text-xs tabular text-os-muted" dir="ltr">
                      {x.budgetAmount ? m(x.budgetAmount) : "—"}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {m(x.billedNet)}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {m(x.collected)}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {m(x.directCost)}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {m(x.timeCost)}
                      {x.timeCostCoverage !== null && x.timeCostCoverage < 100 && <span className="block text-[10px] text-warning">{t("coverage", { n: x.timeCostCoverage })}</span>}
                    </td>
                    <td className={`text-end text-sm font-semibold tabular ${Number(x.margin) < 0 ? "text-danger" : ""}`} dir="ltr">
                      {m(x.margin)}
                      {x.marginPct !== null && <span className="block text-[10px] font-normal text-os-faint">{x.marginPct}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("profitNote")}</p>
        </SectionCard>
      )}
    </div>
  );
}
