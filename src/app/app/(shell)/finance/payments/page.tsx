import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { clientsWithOpenInvoices, listPayments } from "@/server/finance/payments";
import { formatMoney } from "@/lib/commercial/calc";
import { todayIn } from "@/server/commercial/dates";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { NewPaymentButton } from "@/components/finance/Widgets";
import { paymentTone } from "@/components/finance/tones";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("finance.payments.view");
  if (!allowed) return <PermissionDenied permission="finance.payments.view" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const data = await listPayments(ctx, sp);
  const canCreate = can(ctx, "finance.payments.create");
  const clients = canCreate ? await clientsWithOpenInvoices(ctx) : [];
  const preInvoice = canCreate && sp.invoice ? await prisma.invoice.findFirst({ where: { id: sp.invoice, organizationId: ctx.organizationId }, select: { id: true, clientId: true } }) : null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone).toISOString().slice(0, 10);
  const exportHref = `/app/finance/export/payments?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["page", "new", "invoice"].includes(k)) as [string, string][])}`;
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="CreditCard"
        title={t("payments")}
        subtitle={t("paymentsSubtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <a href={exportHref} download className="os-btn-ghost">
              {t("exportCsv")}
            </a>
            {canCreate && <NewPaymentButton clients={clients} initialClient={preInvoice?.clientId} initialInvoice={preInvoice?.id} today={today} autoOpen={sp.new === "1"} />}
          </div>
        }
      />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchPayments") }}
          selects={[
            { name: "method", allLabel: `${t("f.method")}: ${t("all")}`, options: ["BANK_TRANSFER", "CASH", "CARD", "PAYMENT_GATEWAY", "OTHER"].map((x) => ({ value: x, label: t(`method.${x}` as "method.CASH") })) },
            { name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: ["RECORDED", "REVERSED"].map((x) => ({ value: x, label: t(`pstatus.${x}` as "pstatus.RECORDED") })) }
          ]}
        />
        <p className="border-b border-os-line px-4 py-2 text-xs text-os-muted">
          {t("collectedInList")}: <span className="font-semibold tabular" dir="ltr">{formatMoney(data.sum, locale)}</span>
        </p>
        {data.items.length === 0 ? (
          <EmptyState icon="CreditCard" title={t("noPayments")} text={t("noPaymentsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.payment")}</th>
                  <th>{t("f.client")}</th>
                  <th className="hidden md:table-cell">{t("f.method")}</th>
                  <th className="hidden lg:table-cell">{t("f.invoices")}</th>
                  <th className="text-end">{t("f.amount")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/app/finance/payments/${p.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                        {p.number}
                      </Link>
                      <span className="block text-[11px] text-os-faint">{fmtDate(p.paymentDate, locale)}</span>
                    </td>
                    <td className="max-w-[180px] truncate text-xs">{p.client.displayName}</td>
                    <td className="hidden text-xs text-os-muted md:table-cell">
                      {t(`method.${p.method}` as "method.CASH")}
                      {p.reference && <span className="block text-os-faint" dir="ltr">{p.reference}</span>}
                    </td>
                    <td className="hidden text-xs lg:table-cell" dir="ltr">
                      {p.allocations.map((a) => a.invoice.number).join(", ")}
                    </td>
                    <td className={`whitespace-nowrap text-end text-sm font-semibold tabular ${p.status === "REVERSED" ? "text-os-faint line-through" : ""}`} dir="ltr">
                      {formatMoney(p.amount.toFixed(2), locale, p.currency)}
                    </td>
                    <td>
                      <Badge tone={paymentTone(p.status)}>{t(`pstatus.${p.status}` as "pstatus.RECORDED")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/finance/payments" params={sp} />
      </div>
    </div>
  );
}
