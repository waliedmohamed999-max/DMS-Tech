import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { todayIn } from "@/server/commercial/dates";
import { arAging, AGING_BUCKETS, financeAttention, financeKpis, periodOf } from "@/server/finance/insights";
import { sweepFinanceIfDue } from "@/server/finance/sweep";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, priorityTone, SectionCard } from "@/components/os/ui";

export const metadata = { title: "Finance" };
const PRESETS = ["month", "last_month", "quarter", "year"] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const { ctx, allowed } = await pageCtx("finance.dashboard.view");
  if (!allowed) return <PermissionDenied permission="finance.dashboard.view" />;
  await sweepFinanceIfDue(ctx.organizationId);
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const tc = await getTranslations("os.home");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone);
  const p = periodOf(sp, today);
  const [k, aging, attention] = await Promise.all([financeKpis(ctx, p), arAging(ctx), financeAttention(ctx)]);
  const m = (v: string) => formatMoney(v, locale, k.currency);
  const cards: [string, string | null, string, string?][] = [
    ["invoicesIssued", String(k.invoicesIssued), "/app/finance/invoices?status=open"],
    ["invoiced", m(k.invoiced), "/app/finance/invoices"],
    ["collected", k.collected === null ? null : m(k.collected), "/app/finance/payments"],
    ["collectionRate", k.collectionRate === null ? "—" : `${k.collectionRate}%`, "/app/finance/reports"],
    ["outstanding", m(k.outstanding), "/app/finance/receivables", k.outstandingCount ? "text-warning" : undefined],
    ["overdue", m(k.overdue), "/app/finance/receivables", k.overdueCount ? "text-danger" : undefined],
    ["expenses", k.expenses === null ? null : m(k.expenses), "/app/finance/expenses"],
    ["directCost", k.directCost === null ? null : m(k.directCost), "/app/finance/reports"],
    ["payrollPaid", k.payrollPaid === null ? null : m(k.payrollPaid), "/app/hr/payroll"]
  ];
  const max = Math.max(1, ...AGING_BUCKETS.map((b) => Number(aging.totals[b])));
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="ChartColumn"
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {can(ctx, "finance.invoices.create") && (
              <Link href="/app/finance/invoices/new" className="os-btn-primary">
                + {t("newInvoice")}
              </Link>
            )}
            {can(ctx, "finance.payments.create") && (
              <Link href="/app/finance/payments?new=1" className="os-btn-secondary">
                + {t("a.recordPayment")}
              </Link>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((x) => (
          <Link key={x} href={`?preset=${x}`} className={`rounded-md px-2.5 py-1 text-xs ${p.preset === x ? "bg-os-raised text-os-text" : "text-os-muted hover:text-os-text"}`}>
            {t(`period.${x}` as "period.month")}
          </Link>
        ))}
        <span className="ms-2 text-[11px] text-os-faint">
          {fmtDate(p.from, locale)} – {fmtDate(p.to, locale)} · {t("currencyNote", { c: k.currency })}
          {k.otherCurrencyInvoices ? ` · ${t("otherCurrency", { n: k.otherCurrencyInvoices })}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-4">
        {cards
          .filter(([, v]) => v !== null)
          .map(([key, value, href, cls]) => (
            <Link key={key} href={href} className="bg-os-surface px-4 py-3 transition hover:bg-os-panel">
              <p className="text-[11.5px] text-os-muted">{t(`k.${key}` as "k.invoiced")}</p>
              <p className={`mt-0.5 text-lg font-semibold tabular ${cls ?? ""}`} dir="ltr">
                {value}
              </p>
            </Link>
          ))}
      </div>
      <p className="text-[11px] text-os-faint">{t("terminology")}</p>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title={t("attention")} action={attention.length ? <Badge tone="warning">{attention.length}</Badge> : undefined}>
          {attention.length === 0 ? (
            <EmptyState icon="CircleCheck" title={t("attentionEmpty")} text="" />
          ) : (
            <ul className="divide-y divide-os-line">
              {attention.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={a.href} className="block truncate font-medium hover:text-iris-light">
                      {a.title}
                    </Link>
                    <span className="text-[11px] text-os-faint">
                      {tc.has(`categories.${a.category}`) ? tc(`categories.${a.category}` as "categories.approval") : a.category}
                      {a.dueAt ? ` · ${fmtDate(a.dueAt, locale)}` : ""}
                    </span>
                  </div>
                  <Badge tone={priorityTone(a.priority)}>{t(`prio.${a.priority}` as "prio.HIGH")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={t("agingTitle")} action={<Link href="/app/finance/receivables" className="text-xs text-os-muted hover:text-os-text">{t("viewAll")}</Link>}>
          <div className="grid gap-2 p-4">
            {AGING_BUCKETS.map((b) => (
              <div key={b} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-xs">
                <span className="text-os-muted">{t(`aging.${b}` as "aging.current")}</span>
                <span className="h-2 overflow-hidden rounded-full bg-os-raised">
                  <span className={`block h-full rounded-full ${b === "current" ? "bg-iris" : b === "d1_30" ? "bg-warning" : "bg-danger"}`} style={{ width: `${(Number(aging.totals[b]) / max) * 100}%` }} />
                </span>
                <span className="tabular" dir="ltr">
                  {m(aging.totals[b])}
                </span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-os-line pt-2 text-sm font-semibold">
              <span>{t("totalOutstanding")}</span>
              <span className="tabular" dir="ltr">
                {m(aging.total)}
              </span>
            </div>
            {aging.clients.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/app/crm/clients/${c.id}?tab=finance`} className="flex justify-between gap-2 text-xs text-os-muted hover:text-os-text">
                <span className="truncate">{c.name}</span>
                <span className="tabular" dir="ltr">
                  {m(c.total)}
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
