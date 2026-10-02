import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { arAging, AGING_BUCKETS } from "@/server/finance/insights";
import { sweepFinanceIfDue } from "@/server/finance/sweep";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { invoiceTone } from "@/components/finance/tones";

export const metadata = { title: "Receivables" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ bucket?: string }> }) {
  const { ctx, allowed } = await pageCtx("finance.invoices.view");
  if (!allowed) return <PermissionDenied permission="finance.invoices.view" />;
  await sweepFinanceIfDue(ctx.organizationId);
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const a = await arAging(ctx);
  const m = (v: string) => formatMoney(v, locale, a.currency);
  const bucket = (AGING_BUCKETS as readonly string[]).includes(sp.bucket ?? "") ? sp.bucket : null;
  const rows = bucket ? a.invoices.filter((i) => i.bucket === bucket) : a.invoices;
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="CalendarClock"
        title={t("receivables")}
        subtitle={t("receivablesSubtitle", { c: a.currency })}
        actions={
          <a href="/app/finance/export/aging" download className="os-btn-ghost">
            {t("exportCsv")}
          </a>
        }
      />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line sm:grid-cols-3 lg:grid-cols-6">
        <Link href="?" className={`px-4 py-3 ${!bucket ? "bg-os-panel" : "bg-os-surface"} hover:bg-os-panel`}>
          <p className="text-[11.5px] text-os-muted">{t("totalOutstanding")}</p>
          <p className="mt-0.5 text-lg font-semibold tabular" dir="ltr">
            {m(a.total)}
          </p>
        </Link>
        {AGING_BUCKETS.map((b) => (
          <Link key={b} href={`?bucket=${b}`} className={`px-4 py-3 ${bucket === b ? "bg-os-panel" : "bg-os-surface"} hover:bg-os-panel`}>
            <p className="text-[11.5px] text-os-muted">{t(`aging.${b}` as "aging.current")}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular ${b === "current" ? "" : Number(a.totals[b]) > 0 ? "text-danger" : ""}`} dir="ltr">
              {m(a.totals[b])}
            </p>
          </Link>
        ))}
      </div>

      <SectionCard title={t("byClient")}>
        {a.clients.length === 0 ? (
          <EmptyState icon="CircleCheck" title={t("nothingOutstanding")} text="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.client")}</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b} className="text-end">
                      {t(`aging.${b}` as "aging.current")}
                    </th>
                  ))}
                  <th className="text-end">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {a.clients.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[200px] truncate">
                      <Link href={`/app/crm/clients/${c.id}?tab=finance`} className="hover:text-iris-light">
                        {c.name}
                      </Link>
                    </td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b} className={`text-end text-xs tabular ${Number(c.buckets[b]) === 0 ? "text-os-faint" : b !== "current" ? "text-danger" : ""}`} dir="ltr">
                        {Number(c.buckets[b]) === 0 ? "—" : m(c.buckets[b])}
                      </td>
                    ))}
                    <td className="text-end text-sm font-semibold tabular" dir="ltr">
                      {m(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={bucket ? t(`aging.${bucket}` as "aging.current") : t("openInvoices")}>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-os-muted">{t("nothingOutstanding")}</p>
        ) : (
          <ul className="divide-y divide-os-line text-sm">
            {rows.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                    {i.number}
                  </Link>
                  <span className="ms-2 text-xs text-os-muted">{i.client.displayName}</span>
                  <p className="text-[11px] text-os-faint">
                    {t("f.dueDate")} {fmtDate(i.dueDate, locale)}
                    {i.daysPastDue > 0 && <span className="text-danger"> · {t("daysLate", { n: i.daysPastDue })}</span>}
                    {i.nextFollowUpAt && ` · ${t("nextFollowUp")} ${fmtDate(i.nextFollowUpAt, locale)}`}
                    {i.lastReminderAt && ` · ${t("lastReminder")} ${fmtDate(i.lastReminderAt, locale)}`}
                  </p>
                </div>
                <Badge tone={invoiceTone(i.status)}>{t(`status.${i.status}` as "status.PAID")}</Badge>
                <span className="font-semibold tabular" dir="ltr">
                  {m(i.balanceDue.toFixed(2))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
