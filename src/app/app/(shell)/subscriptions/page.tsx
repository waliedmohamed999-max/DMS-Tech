import Link from "next/link";
import { getLocale } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listSubscriptions, monthlyValue, subscriptionFormData, subscriptionMetrics } from "@/server/subscriptions/subscriptions";
import { planPresets } from "@/lib/os/subscription-page";
import { SUB_T, SUB_TONE as TONE } from "@/lib/os/subscription-labels";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { SubscriptionForm } from "@/components/subscriptions/SubscriptionForm";

export const metadata = { title: "Subscriptions" };

/** Client subscriptions: recurring revenue, renewals coming up, the list with term and billing, and a new subscription. */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("subscriptions.view");
  if (!allowed) return <PermissionDenied permission="subscriptions.view" />;
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const t = SUB_T[locale];
  const sp = flatParams(await searchParams);
  const manage = can(ctx, "subscriptions.manage");
  const [{ rows, today }, k, form, presets] = await Promise.all([
    listSubscriptions(ctx, sp),
    subscriptionMetrics(ctx),
    manage ? subscriptionFormData(ctx) : null,
    manage ? planPresets(locale) : []
  ]);
  const m = (v: string | { toFixed(n: number): string }, cur = k.currency) => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, cur);
  const days = (d: Date) => Math.round((d.getTime() - today.getTime()) / 86_400_000);

  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode, href?: string) => {
    const body = (
      <>
        <p className="text-xs text-os-muted">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-os-faint">{sub}</p>}
      </>
    );
    return href ? (
      <Link href={href} className="os-card p-4 transition hover:border-os-line-strong">
        {body}
      </Link>
    ) : (
      <div className="os-card p-4">{body}</div>
    );
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="CalendarClock"
        title={t.title}
        subtitle={t.subtitle}
        actions={form ? <SubscriptionForm locale={locale} data={form} presets={presets} canBill={can(ctx, "finance.invoices.create")} autoOpen={sp.new === "1"} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(
          t.mrr,
          <span dir="ltr">{m(k.mrr)}</span>,
          <>
            {t.mrrSub}
            {/* other currencies are never added into the headline — listed on their own */}
            {k.otherCurrencies.map((c) => (
              <span key={c.currency} dir="ltr" className="ms-1 tabular">
                + {m(c.mrr, c.currency)}
              </span>
            ))}
          </>
        )}
        {stat(t.arr, <span dir="ltr">{m(k.arr)}</span>)}
        {stat(t.active, k.counts.ACTIVE, `${t.paused}: ${k.counts.PAUSED} · ${t.ending}: ${k.counts.ENDING}`, "?status=ACTIVE")}
        {stat(t.renewing, k.renewing, undefined, "?status=renewing")}
        {stat(t.fresh, k.fresh)}
        {stat(t.churned, k.churned, `${t.churnRate}: ${k.churnRate}% · ${m(k.churnedMrr)}`, "?status=ENDED")}
        {stat(t.unbilled, k.unbilled, t.unbilledHint, "?status=unbilled")}
      </div>

      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t.search }}
          selects={[{ name: "status", allLabel: t.filters.current, options: ["ACTIVE", "PAUSED", "ENDING", "ENDED", "renewing", "unbilled"].map((s) => ({ value: s, label: t.filters[s] })) }]}
        />
        {rows.length === 0 ? (
          <EmptyState icon="CalendarClock" title={t.empty} text={t.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t.col.name}</th>
                  <th className="hidden md:table-cell">{t.col.client}</th>
                  <th className="text-end">{t.col.price}</th>
                  <th className="hidden text-end lg:table-cell">{t.col.monthly}</th>
                  <th className="hidden md:table-cell">{t.col.term}</th>
                  <th className="hidden lg:table-cell">{t.col.next}</th>
                  <th>{t.col.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/subscriptions/${s.id}`} className="font-medium hover:text-iris-light">
                        {s.name}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{s.number}</span> · {t.intervals[s.interval]}
                        <span className="md:hidden"> · {s.client.displayName}</span>
                      </span>
                    </td>
                    <td className="hidden text-sm md:table-cell">
                      <Link href={`/app/crm/clients/${s.client.id}`} className="hover:text-iris-light">
                        {s.client.displayName}
                      </Link>
                    </td>
                    <td className="text-end text-sm font-semibold tabular" dir="ltr">
                      {m(s.price, s.currency)}
                    </td>
                    <td className="hidden text-end text-xs text-os-muted tabular lg:table-cell" dir="ltr">
                      {m(monthlyValue(s.price, s.interval).toDecimalPlaces(2), s.currency)}
                    </td>
                    <td className="hidden whitespace-nowrap text-xs md:table-cell">
                      {s.status === "ENDING" && s.cancelAt ? (
                        <span className="text-red-600 dark:text-red-400">
                          {fmtDate(s.cancelAt, locale)} · {t.daysLeft(days(s.cancelAt))}
                        </span>
                      ) : s.termEndDate && s.status !== "ENDED" ? (
                        <>
                          {fmtDate(s.termEndDate, locale)}
                          <span className="block text-[11px] text-os-faint">{s.autoRenew ? t.daysLeft(days(s.termEndDate)) : t.renewOff}</span>
                        </>
                      ) : (
                        <span className="text-os-faint">{s.status === "ENDED" ? "—" : t.noTerm}</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap text-xs lg:table-cell">
                      {!s.recurring ? <span className="text-os-faint">{t.notBilled}</span> : s.recurring.status === "ACTIVE" ? fmtDate(s.recurring.nextRunDate, locale) : <span className="text-os-faint">—</span>}
                    </td>
                    <td>
                      <Badge tone={TONE[s.status]} dot>
                        {t.statuses[s.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
