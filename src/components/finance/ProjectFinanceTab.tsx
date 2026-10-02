import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Ctx } from "@/server/context";
import { projectFinance } from "@/server/finance/costing";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { SourceList } from "./Widgets";
import { expenseTone, invoiceTone } from "./tones";

/** Project → Finance. Sections are gated separately on the server (see projectFinance). */
export async function ProjectFinanceTab({ ctx, projectId }: { ctx: Ctx; projectId: string }) {
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const f = await projectFinance(ctx, projectId);
  const m = (v: string | { toFixed(n: number): string }, c = "SAR") => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, c);
  const cells: [string, string, string?][] = [];
  if (f.commercial?.contract) cells.push(["contractValue", m(f.commercial.contract.contractValue, f.commercial.contract.currency)]);
  else if (f.commercial?.budgetAmount) cells.push(["budget", m(f.commercial.budgetAmount, f.commercial.currency)]);
  if (f.billing) cells.push(["billed", m(f.billing.billed)], ["collected", m(f.billing.collected), "text-success"], ["outstanding", m(f.billing.outstanding), Number(f.billing.outstanding) > 0 ? "text-warning" : undefined]);
  if (f.profit) cells.push(["directCost", m(f.profit.directCost)], ["margin", `${m(f.profit.margin)}${f.profit.marginPct !== null ? ` · ${f.profit.marginPct}%` : ""}`, Number(f.profit.margin) < 0 ? "text-danger" : undefined]);
  return (
    <div className="grid gap-5">
      {cells.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-3 xl:grid-cols-6">
          {cells.map(([k, v, cls]) => (
            <div key={k} className="bg-os-surface px-4 py-3">
              <p className="text-[11.5px] text-os-muted">{t(`pf.${k}` as "pf.billed")}</p>
              <p className={`mt-0.5 text-base font-semibold tabular ${cls ?? ""}`} dir="ltr">
                {v}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-os-faint">{t("pfNote")}</p>

      {f.sources && (
        <SectionCard title={t("readyToInvoice")}>
          <SourceList items={f.sources} />
        </SectionCard>
      )}

      {f.billing && (
        <SectionCard title={t("invoices")}>
          {f.invoices.length === 0 ? (
            <EmptyState icon="FileText" title={t("noInvoices")} text="" />
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {f.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                    {i.number ?? t("draftNo")}
                  </Link>
                  <span className="text-xs text-os-muted">
                    {t(`source.${i.sourceType}` as "source.MANUAL")} · {t("f.dueDate")} {fmtDate(i.dueDate, locale)}
                  </span>
                  <span className="flex-1" />
                  <Badge tone={invoiceTone(i.status)}>{t(`status.${i.status}` as "status.PAID")}</Badge>
                  <span className="w-28 text-end text-xs tabular" dir="ltr">
                    {m(i.total, i.currency)}
                  </span>
                  <span className="w-28 text-end text-xs font-semibold tabular" dir="ltr">
                    {m(i.balanceDue, i.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {f.expenses && (
        <SectionCard title={t("expenses")}>
          {f.expenses.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-os-muted">{t("noExpenses")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {f.expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Link href={`/app/finance/expenses/${e.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                    {e.description}
                  </Link>
                  <span className="text-xs text-os-muted">
                    {locale === "ar" ? e.category.nameAr : e.category.nameEn}
                    {e.vendor ? ` · ${e.vendor.name}` : ""} · {fmtDate(e.date, locale)}
                  </span>
                  <Badge tone={expenseTone(e.status)}>{t(`estatus.${e.status}` as "estatus.PAID")}</Badge>
                  <span className="w-28 text-end text-xs font-semibold tabular" dir="ltr">
                    {m(e.total, e.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {f.profit && (
        <SectionCard title={t("profitability")} action={<span className="text-[11px] text-os-faint">{t("operationalEstimate")}</span>}>
          <dl className="grid gap-2 p-4 text-sm">
            {(
              [
                [t("p.billedNet"), m(f.profit.billedNet)],
                [t("p.directCost"), `− ${m(f.profit.directCost)}`],
                [t("p.timeCost"), `− ${m(f.profit.timeCost)}`],
                [t("p.margin"), m(f.profit.margin)]
              ] as [string, string][]
            ).map(([k, v], i) => (
              <div key={k} className={`flex justify-between ${i === 3 ? "border-t border-os-line pt-2 font-semibold" : "text-os-muted"}`}>
                <dt>{k}</dt>
                <dd className="tabular" dir="ltr">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">
            {f.profit.timeCostCoverage === null ? t("noApprovedTime") : t("coverageText", { n: f.profit.timeCostCoverage, h: Math.round(f.profit.timeMinutes / 6) / 10 })} {t("profitNote")}
          </p>
        </SectionCard>
      )}
    </div>
  );
}
