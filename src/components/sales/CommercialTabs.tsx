import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Ctx } from "@/server/context";
import { can } from "@/server/context";
import { quotationsFor } from "@/server/commercial/quotations";
import { contractsFor } from "@/server/commercial/contracts";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, SectionCard } from "@/components/os/ui";
import { contractStatusTone, quoteStatusTone } from "./tones";

/** Quotations of an opportunity or client (CRM tabs). Server component; scope-filtered. */
export async function QuotationsTab({ ctx, where, createHref }: { ctx: Ctx; where: { opportunityId?: string; clientId?: string }; createHref: string }) {
  const t = await getTranslations("os.sales");
  const locale = await getLocale();
  const rows = await quotationsFor(ctx, where);
  if (rows === null) return <EmptyState icon="FileText" title={t("noAccess")} text={t("noAccessText")} />;
  return (
    <SectionCard
      title={t("q.title")}
      action={
        can(ctx, "sales.quotations.create") ? (
          <Link href={createHref} className="os-btn-primary h-8 px-3 text-xs">
            + {t("q.new")}
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="FileText" title={t("q.emptyTitle")} text={t("q.emptyHere")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="os-table">
            <thead>
              <tr>
                <th>{t("q.quotation")}</th>
                <th>{t("q.amount")}</th>
                <th>{t("q.f.status")}</th>
                <th className="hidden md:table-cell">{t("q.f.owner")}</th>
                <th className="hidden sm:table-cell">{t("q.date")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link href={`/app/sales/quotations/${q.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                      {q.number} <span className="text-os-faint">V{q.currentVersion?.versionNumber}</span>
                    </Link>
                  </td>
                  <td className="tabular" dir="ltr">
                    {q.currentVersion ? formatMoney(q.currentVersion.total.toFixed(2), locale, q.currentVersion.currency) : "—"}
                  </td>
                  <td>
                    <Badge tone={quoteStatusTone(q.status)} dot>
                      {t(`qStatus.${q.status}` as "qStatus.DRAFT")}
                    </Badge>
                  </td>
                  <td className="hidden text-xs text-os-muted md:table-cell">{personName(q.owner, locale) ?? "—"}</td>
                  <td className="hidden text-xs text-os-faint sm:table-cell">{fmtDate(q.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export async function ContractsTab({ ctx, where }: { ctx: Ctx; where: { clientId?: string; opportunityId?: string } }) {
  const t = await getTranslations("os.sales");
  const locale = await getLocale();
  const rows = await contractsFor(ctx, where);
  if (rows === null) return <EmptyState icon="Handshake" title={t("noAccess")} text={t("noAccessText")} />;
  return (
    <SectionCard title={t("c.title")}>
      {rows.length === 0 ? (
        <EmptyState icon="Handshake" title={t("c.emptyTitle")} text={t("c.emptyHere")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="os-table">
            <thead>
              <tr>
                <th>{t("c.contract")}</th>
                <th>{t("c.value")}</th>
                <th>{t("c.f.status")}</th>
                <th className="hidden md:table-cell">{t("c.fromQuote")}</th>
                <th className="hidden sm:table-cell">{t("c.f.end")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/app/sales/contracts/${c.id}`} className="block font-medium hover:text-iris-light">
                      <span dir="ltr">{c.number}</span>
                    </Link>
                    <span className="block max-w-[260px] truncate text-xs text-os-faint">{c.title}</span>
                  </td>
                  <td className="tabular" dir="ltr">
                    {formatMoney(c.contractValue.toFixed(2), locale, c.currency)}
                  </td>
                  <td>
                    <Badge tone={contractStatusTone(c.status)} dot>
                      {t(`cStatus.${c.status}` as "cStatus.DRAFT")}
                    </Badge>
                  </td>
                  <td className="hidden text-xs md:table-cell" dir="ltr">
                    {c.quotation ? `${c.quotation.number} V${c.quotationVersion?.versionNumber}` : "—"}
                  </td>
                  <td className="hidden text-xs text-os-muted sm:table-cell">{c.endDate ? fmtDate(c.endDate, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
