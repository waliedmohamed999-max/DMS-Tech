import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getRecurring } from "@/server/finance/recurring";
import { formatMoney } from "@/lib/commercial/calc";
import { RECURRING_PAGE_T, RECURRING_T } from "@/lib/os/recurring-labels";
import { Badge, fmtDate, PermissionDenied, SectionCard } from "@/components/os/ui";
import { invoiceTone } from "@/components/finance/tones";
import { RecurringActions } from "@/components/finance/RecurringForm";

export const metadata = { title: "Recurring invoice" };
const TONE = { ACTIVE: "success", PAUSED: "warning", ENDED: "neutral" } as const;

export default async function RecurringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("finance.invoices.view");
  if (!allowed) return <PermissionDenied permission="finance.invoices.view" />;
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = RECURRING_PAGE_T[locale];
  const tf = RECURRING_T[locale];
  const ti = await getTranslations("os.finance");
  let d;
  try {
    d = await getRecurring(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const r = d.schedule;
  const m = (v: string) => formatMoney(v, locale, r.currency);
  const owner = d.owner ? (locale === "ar" && d.owner.nameAr) || d.owner.name : "—";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/finance/recurring" className="os-btn-ghost size-8 px-0" aria-label={t.back}>
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {r.number}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {r.title}
            <Badge tone={TONE[r.status]} dot>
              {t.statuses[r.status]}
            </Badge>
          </h1>
          <p className="mt-1 text-xs text-os-muted">
            <Link href={`/app/crm/clients/${r.client.id}?tab=finance`} className="hover:text-iris-light">
              {r.client.displayName}
            </Link>{" "}
            · {tf.intervals[r.interval]}
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs text-os-faint">{t.totalWithVat}</p>
          <p className="text-xl font-semibold tabular" dir="ltr">
            {m(d.totals.total)}
          </p>
        </div>
        {can(ctx, "finance.invoices.create") && <RecurringActions id={r.id} status={r.status} />}
      </div>

      {r.status === "PAUSED" && r.pauseReason === "OWNER_NO_PERMISSION" && <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">{t.pausedNoPermission}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="grid gap-5">
          <SectionCard title={t.invoices}>
            {r.invoices.length === 0 ? (
              <p className="p-4 text-sm text-os-muted">{t.noInvoices}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {r.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                      {i.number ?? ti("draftNo")}
                    </Link>
                    <span className="text-xs text-os-muted">
                      {t.period}: {i.recurringPeriodStart ? fmtDate(i.recurringPeriodStart, locale) : "—"}
                    </span>
                    <span className="flex-1" />
                    <Badge tone={invoiceTone(i.status)}>{ti(`status.${i.status}` as "status.PAID")}</Badge>
                    <span className="font-semibold tabular" dir="ltr">
                      {m(i.total.toFixed(2))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={t.lines}>
            <ul className="divide-y divide-os-line text-sm">
              {d.lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="flex-1" dir="auto">
                    {l.description.replaceAll("{period}", locale === "ar" ? "«الفترة»" : "«period»")}
                  </span>
                  <span className="text-xs text-os-muted tabular" dir="ltr">
                    {l.quantity} × {m(l.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
        <SectionCard title={t.auto}>
          <dl className="grid gap-2 p-4 text-xs">
            {(
              [
                [t.next, r.status === "ENDED" ? "—" : fmtDate(r.nextRunDate, locale)],
                [t.count, String(r.generatedCount) + (r.maxOccurrences ? ` / ${r.maxOccurrences}` : "")],
                [t.starts, fmtDate(r.startDate, locale)],
                [t.ends, r.endDate ? fmtDate(r.endDate, locale) : "—"],
                [t.dueDays, `${r.dueDays} ${t.days}`],
                [t.auto, r.autoSend ? `${t.autoIssue} + ${t.autoSend}${r.sendTo ? ` (${r.sendTo})` : ""}` : r.autoIssue ? t.autoIssue : t.draftOnly],
                [t.owner, owner]
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-os-muted">{k}</dt>
                <dd dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t.ownerNote}</p>
        </SectionCard>
      </div>
    </div>
  );
}
