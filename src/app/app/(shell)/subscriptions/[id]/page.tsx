import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getSubscription, subscriptionFormData } from "@/server/subscriptions/subscriptions";
import { SUB_T, SUB_TONE } from "@/lib/os/subscription-labels";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { SubscriptionActions } from "@/components/subscriptions/SubscriptionActions";

export const metadata = { title: "Subscription" };
const INV_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { PAID: "success", PARTIALLY_PAID: "warning", OVERDUE: "danger", DRAFT: "neutral", ISSUED: "info", SENT: "info", CANCELLED: "neutral", VOID: "neutral" };

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("subscriptions.view");
  if (!allowed) return <PermissionDenied permission="subscriptions.view" />;
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const t = SUB_T[locale];
  let d;
  try {
    d = await getSubscription(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { s, users, contact, contract, today } = d;
  const manage = can(ctx, "subscriptions.manage");
  const canBill = can(ctx, "finance.invoices.create");
  const seeInvoices = can(ctx, "finance.invoices.view");
  const form = manage && s.status !== "ENDED" ? await subscriptionFormData(ctx) : null;
  const m = (v: string | { toFixed(n: number): string }) => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, s.currency);
  const days = (x: Date) => Math.round((x.getTime() - today.getTime()) / 86_400_000);
  const who = (uid: string | null) => (uid && users[uid] ? (locale === "ar" && users[uid].nameAr) || users[uid].name : t.systemActor);
  const ymd = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  const rec = s.recurring;
  const invoices = rec && "invoices" in rec && Array.isArray(rec.invoices) ? rec.invoices : null;

  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="grid grid-cols-[140px_1fr] gap-2 py-1">
      <dt className="text-os-muted">{k}</dt>
      <dd dir="auto">{v ?? "—"}</dd>
    </div>
  );
  const change = (c: (typeof s.changes)[number]) => {
    const a = (c.after ?? {}) as Record<string, unknown>;
    const b = (c.before ?? {}) as Record<string, unknown>;
    const bits: string[] = [];
    if (c.kind === "PLAN_CHANGED") {
      if (b.price !== a.price) bits.push(locale === "ar" ? `من ${m(String(b.price))} إلى ${m(String(a.price))}` : `from ${m(String(b.price))} to ${m(String(a.price))}`);
      if (b.name !== a.name) bits.push(String(a.name));
    }
    if (c.kind === "RENEWED" && a.termEndDate) bits.push(`${t.termEnd}: ${fmtDate(String(a.termEndDate), locale)}`);
    if (c.kind === "CANCEL_SCHEDULED" && a.cancelAt) bits.push(`${t.cancelAt}: ${fmtDate(String(a.cancelAt), locale)}${a.early ? ` · ${t.earlyFlag}` : ""}`);
    if (c.kind === "ENDED" && a.early) bits.push(t.earlyFlag);
    if (c.kind === "CREATED" && a.price) bits.push(`${m(String(a.price))} ${t.per[String(a.interval)] ?? ""}`);
    return bits;
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/subscriptions" className="os-btn-ghost size-8 px-0" aria-label={t.back}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {s.number}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {s.name}
            <Badge tone={SUB_TONE[s.status]} dot>
              {t.statuses[s.status]}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <Link href={`/app/crm/clients/${s.client.id}`} className="hover:text-iris-light">
              {s.client.displayName}
            </Link>
            <span dir="ltr">
              {m(s.price)} · {t.intervals[s.interval]}
            </span>
          </p>
        </div>
        {form && (
          <SubscriptionActions
            locale={locale}
            today={ymd(today)!}
            canManage={manage}
            canBill={canBill}
            s={{
              id: s.id,
              status: s.status,
              name: s.name,
              description: s.description,
              price: s.price.toFixed(2),
              interval: s.interval,
              serviceId: s.serviceId,
              planKey: s.planKey,
              taxBehavior: s.taxBehavior,
              autoRenew: s.autoRenew,
              renewalMonths: s.renewalMonths,
              ownerId: s.ownerId,
              contactId: s.contactId,
              contractId: s.contractId,
              notes: s.notes,
              termEndDate: ymd(s.termEndDate),
              commitmentEnd: ymd(d.commitmentEnd),
              billing: Boolean(s.recurringInvoiceId)
            }}
            options={{
              owners: form.owners.map((u) => ({ id: u.id, label: (locale === "ar" && u.nameAr) || u.name })),
              contacts: form.contactsByClient[s.clientId] ?? [],
              contracts: form.contractsByClient[s.clientId] ?? [],
              services: form.services.map((x) => ({ id: x.id, label: locale === "ar" ? x.nameAr : x.nameEn }))
            }}
          />
        )}
      </div>

      {s.status === "ENDING" && s.cancelAt && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm">
          {t.cancelAt}: <b>{fmtDate(s.cancelAt, locale)}</b> ({t.daysLeft(days(s.cancelAt))}){s.cancelReason ? ` — ${s.cancelReason}` : ""}
        </div>
      )}
      {s.status === "PAUSED" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          {t.pausedSince}: <b>{s.pausedAt ? fmtDate(s.pausedAt, locale) : "—"}</b>
          {s.pauseReason ? ` — ${s.pauseReason}` : ""}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t.planCard}>
          <dl className="p-4 text-sm">
            {row(t.col.price, <span dir="ltr">{m(s.price)} {t.per[s.interval]}</span>)}
            {row(t.priceVat, <span dir="ltr">{m(d.priceWithVat)}</span>)}
            {row(t.monthlyEq, <span dir="ltr">{m(d.monthly)}</span>)}
            {row(t.tax, `${t.taxes[s.taxBehavior]}${s.taxBehavior === "STANDARD" ? ` (${d.vatRate}%)` : ""}`)}
            {s.service && row(t.service, locale === "ar" ? s.service.nameAr : s.service.nameEn)}
            {s.description && row(t.description, s.description)}
          </dl>
        </SectionCard>

        <SectionCard title={t.termCard}>
          <dl className="p-4 text-sm">
            {row(t.startDate, fmtDate(s.startDate, locale))}
            {row(t.commitment, s.commitmentMonths ? `${s.commitmentMonths}` : "0")}
            {d.commitmentEnd && row(t.commitmentEnd, fmtDate(d.commitmentEnd, locale))}
            {row(
              t.termEnd,
              s.termEndDate ? (
                <>
                  {fmtDate(s.termEndDate, locale)} {s.status !== "ENDED" && <span className="text-xs text-os-faint">({t.daysLeft(days(s.termEndDate))})</span>}
                </>
              ) : (
                t.noTerm
              )
            )}
            {row(t.renewal, s.autoRenew ? t.renewAuto(s.renewalMonths) : t.renewOff)}
            {s.status === "ENDED" && s.cancelAt && row(t.cancelAt, `${fmtDate(s.cancelAt, locale)}${s.cancelReason ? ` — ${s.cancelReason === "TERM_ENDED" ? t.termEnded : s.cancelReason}` : ""}`)}
          </dl>
        </SectionCard>

        <SectionCard title={t.partiesCard}>
          <dl className="p-4 text-sm">
            {row(
              t.client,
              <Link href={`/app/crm/clients/${s.client.id}`} className="hover:text-iris-light">
                {s.client.displayName}
              </Link>
            )}
            {row(t.contact, contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : null)}
            {row(t.owner, s.ownerId ? who(s.ownerId) : null)}
            {row(
              t.contract,
              contract ? (
                <Link href={`/app/sales/contracts/${contract.id}`} className="hover:text-iris-light">
                  <span dir="ltr">{contract.number}</span> · {contract.title}
                </Link>
              ) : null
            )}
            {s.notes && row(t.notes, <span className="whitespace-pre-wrap">{s.notes}</span>)}
          </dl>
        </SectionCard>

        <SectionCard title={t.billingCard}>
          {!rec ? (
            <p className="p-4 text-sm text-os-muted">{canBill ? t.noBilling : t.noBillingNoPerm}</p>
          ) : (
            <dl className="p-4 text-sm">
              {row(
                t.schedule,
                seeInvoices ? (
                  <Link href={`/app/finance/recurring/${rec.id}`} className="hover:text-iris-light" dir="ltr">
                    {rec.number}
                  </Link>
                ) : (
                  <span dir="ltr">{rec.number}</span>
                )
              )}
              {row(t.nextInvoice, rec.status === "ACTIVE" ? fmtDate(rec.nextRunDate, locale) : "—")}
              {row(t.billingTitle, rec.autoSend ? t.autoMode.send : rec.autoIssue ? t.autoMode.issue : t.autoMode.draft)}
              {row(t.dueDays, String(rec.dueDays))}
            </dl>
          )}
        </SectionCard>
      </div>

      {rec && (
        <SectionCard title={t.invoices}>
          {!seeInvoices ? (
            <p className="p-4 text-sm text-os-muted">{t.financeHidden}</p>
          ) : !invoices || invoices.length === 0 ? (
            <EmptyState icon="FileText" title={t.noInvoices} text="" />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                          {i.number}
                        </Link>
                      </td>
                      <td className="text-xs text-os-muted">{i.recurringPeriodStart ? fmtDate(i.recurringPeriodStart, locale) : "—"}</td>
                      <td className="text-end text-sm tabular" dir="ltr">
                        {formatMoney(i.total.toFixed(2), locale, i.currency)}
                      </td>
                      <td>
                        <Badge tone={INV_TONE[i.status] ?? "neutral"}>{t.invStatus[i.status] ?? i.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title={t.timeline}>
        <ol className="divide-y divide-os-line text-sm">
          {s.changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
              <span className="font-medium">{t.kinds[c.kind]}</span>
              {change(c).map((b) => (
                <span key={b} className="text-xs text-os-muted" dir="auto">
                  {b}
                </span>
              ))}
              {c.note && <span className="w-full text-xs text-os-muted">{c.note === "TERM_ENDED" ? t.termEnded : c.note}</span>}
              <span className="w-full text-[11px] text-os-faint">
                {t.effective} {fmtDate(c.effectiveDate, locale)} · {t.by} {who(c.actorId)} · {fmtDateTime(c.createdAt, locale)}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
