import Link from "next/link";
import { contractMilestoneEligibility } from "@/server/projects/insights";
import { getContract } from "@/server/commercial/contracts";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, SectionCard } from "@/components/os/ui";
import type { ProjectTabCtx } from "./context";

export async function Commercial({ c }: { c: ProjectTabCtx }) {
  const { ctx, p, commercial, locale, t } = c;
  if (!commercial) return <EmptyState icon="FileText" title={t("noCommercialAccess")} text={t("noCommercialAccessText")} />;
  if (!commercial.contractId && !commercial.quotationId) return <EmptyState icon="FileText" title={t("noCommercialSource")} text={t("internalText")} />;
  let contract = null;
  if (commercial.contractId) {
    try {
      contract = await getContract(ctx, commercial.contractId);
    } catch {
      contract = null;
    }
  }
  const eligibility = commercial.contractId ? await contractMilestoneEligibility(commercial.contractId) : {};
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title={t("commercialSummary")}>
        <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 p-4 text-sm">
          <dt className="text-os-muted">{t("budget")}</dt>
          <dd className="tabular" dir="ltr">
            {commercial.budgetAmount ? formatMoney(commercial.budgetAmount, locale, p.currency) : "—"}
          </dd>
          <dt className="text-os-muted">{t("contract")}</dt>
          <dd>
            {contract ? (
              <Link href={`/app/sales/contracts/${contract.id}`} className="hover:text-iris-light" dir="ltr">
                {contract.number}
              </Link>
            ) : (
              t("notVisible")
            )}
          </dd>
          {contract && (
            <>
              <dt className="text-os-muted">{t("contractValue")}</dt>
              <dd className="tabular" dir="ltr">
                {formatMoney(contract.contractValue.toFixed(2), locale, contract.currency)}
              </dd>
              <dt className="text-os-muted">{t("quotation")}</dt>
              <dd dir="ltr">{contract.quotation ? `${contract.quotation.number} V${contract.quotationVersion?.versionNumber}` : "—"}</dd>
            </>
          )}
          {p.deliveryTerms && (
            <>
              <dt className="text-os-muted">{t("deliveryTerms")}</dt>
              <dd className="whitespace-pre-line text-os-muted" dir="auto">
                {p.deliveryTerms}
              </dd>
            </>
          )}
        </dl>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("snapshotNote")}</p>
      </SectionCard>
      {contract && (
        <SectionCard title={t("contractMilestones")}>
          <ul className="divide-y divide-os-line text-sm">
            {contract.milestones.map((m) => {
              const e = eligibility[m.id];
              return (
                <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.percentage && (
                    <span className="text-xs tabular text-os-muted" dir="ltr">
                      {m.percentage.toFixed(0)}%
                    </span>
                  )}
                  {e ? <Badge tone={e.eligible ? "success" : "neutral"}>{e.eligible ? t("eligible") : `${e.completed}/${e.linked}`}</Badge> : <span className="text-[11px] text-os-faint">{t("notLinked")}</span>}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("eligibilityNote")}</p>
        </SectionCard>
      )}
    </div>
  );
}
