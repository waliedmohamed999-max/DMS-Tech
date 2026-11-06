import Link from "next/link";
import { getLocale } from "next-intl/server";
import { can, type Ctx } from "@/server/context";
import { clientSubscriptions, subscriptionFormData } from "@/server/subscriptions/subscriptions";
import { planPresets } from "@/lib/os/subscription-page";
import { SUB_T, SUB_TONE } from "@/lib/os/subscription-labels";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { SubscriptionForm } from "./SubscriptionForm";

/** Client 360 → Finance: the client's subscriptions, with a new subscription for this client. */
export async function ClientSubscriptions({ ctx, clientId }: { ctx: Ctx; clientId: string }) {
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const t = SUB_T[locale];
  const manage = can(ctx, "subscriptions.manage");
  const [rows, form, presets] = await Promise.all([clientSubscriptions(ctx, clientId), manage ? subscriptionFormData(ctx) : null, manage ? planPresets(locale) : []]);
  return (
    <SectionCard
      title={t.clientSection}
      action={form ? <SubscriptionForm locale={locale} data={form} presets={presets} canBill={can(ctx, "finance.invoices.create")} fixedClientId={clientId} /> : undefined}
    >
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-os-muted">{t.clientEmpty}</p>
      ) : (
        <ul className="divide-y divide-os-line text-sm">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <Link href={`/app/subscriptions/${s.id}`} className="font-medium hover:text-iris-light">
                  {s.name}
                </Link>
                <span className="block text-[11px] text-os-faint">
                  <span dir="ltr">{s.number}</span> · {t.intervals[s.interval]}
                  {s.termEndDate && s.status !== "ENDED" ? ` · ${t.termEnd}: ${fmtDate(s.termEndDate, locale)}` : ""}
                  {!s.recurringInvoiceId && s.status !== "ENDED" ? ` · ${t.unbilled}` : ""}
                </span>
              </span>
              <span className="text-sm font-semibold tabular" dir="ltr">
                {formatMoney(s.price.toFixed(2), locale, s.currency)}
              </span>
              <Badge tone={SUB_TONE[s.status]} dot>
                {t.statuses[s.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
