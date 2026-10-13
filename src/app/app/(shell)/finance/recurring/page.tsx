import Link from "next/link";
import { getLocale } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listRecurring } from "@/server/finance/recurring";
import { editorData } from "@/lib/os/finance-page";
import { formatMoney } from "@/lib/commercial/calc";
import { todayIn, ymd } from "@/server/commercial/dates";
import { RECURRING_PAGE_T, RECURRING_T } from "@/lib/os/recurring-labels";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied } from "@/components/os/ui";
import { RecurringForm } from "@/components/finance/RecurringForm";
import { prisma } from "@/server/db";

export const metadata = { title: "Recurring invoices" };
const TONE = { ACTIVE: "success", PAUSED: "warning", ENDED: "neutral" } as const;

/** Recurring invoice schedules: amount per period, next run, how many invoices were created, automation. */
export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { ctx, allowed } = await pageCtx("finance.invoices.view");
  if (!allowed) return <PermissionDenied permission="finance.invoices.view" />;
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = RECURRING_PAGE_T[locale];
  const tf = RECURRING_T[locale];
  const sp = await searchParams;
  const rows = await listRecurring(ctx);
  const create = can(ctx, "finance.invoices.create");
  const ed = create ? await editorData(ctx) : null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });

  return (
    <div className="grid gap-5">
      <PageHeader icon="RotateCcw" title={t.title} subtitle={t.subtitle} actions={ed ? <RecurringForm clients={ed.clients} contactsByClient={ed.contactsByClient} autoOpen={sp.new === "1"} today={ymd(todayIn(org.timezone))!} /> : undefined} />
      <div className="os-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="RotateCcw" title={t.empty} text={t.emptyText} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t.name}</th>
                  <th>{t.client}</th>
                  <th>{t.every}</th>
                  <th className="text-end">{t.amount}</th>
                  <th>{t.next}</th>
                  <th className="text-end">{t.count}</th>
                  <th>{t.auto}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/finance/recurring/${r.id}`} className="font-medium hover:text-iris-light">
                        {r.title}
                      </Link>
                      <span className="block text-[11px] text-os-faint" dir="ltr">
                        {r.number}
                      </span>
                    </td>
                    <td className="text-sm">{r.client.displayName}</td>
                    <td className="text-sm">{tf.intervals[r.interval]}</td>
                    <td className="text-end text-sm font-semibold tabular" dir="ltr">
                      {formatMoney(r.total, locale, r.currency)}
                    </td>
                    <td className="text-sm">{r.status === "ENDED" ? "—" : fmtDate(r.nextRunDate, locale)}</td>
                    <td className="text-end text-sm tabular">{r.generatedCount}</td>
                    <td className="text-xs text-os-muted">{r.autoSend ? t.autoSend : r.autoIssue ? t.autoIssue : t.draftOnly}</td>
                    <td>
                      <Badge tone={TONE[r.status]} dot>
                        {t.statuses[r.status]}
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
