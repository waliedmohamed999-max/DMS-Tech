import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listCategories, listExpenses } from "@/server/finance/expenses";
import { expenseFormData } from "@/lib/os/finance-page";
import { formatMoney } from "@/lib/commercial/calc";
import { personName } from "@/lib/os/crm-page";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ExpenseForm } from "@/components/finance/Widgets";
import { expenseTone } from "@/components/finance/tones";

export const metadata = { title: "Expenses" };
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "PAID", "CANCELLED"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("finance.expenses.create");
  if (!allowed) return <PermissionDenied permission="finance.expenses.create" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  const [data, cats, form] = await Promise.all([listExpenses(ctx, sp), listCategories(ctx, { all: true }), expenseFormData(ctx)]);
  const all = can(ctx, "finance.expenses.view") && can(ctx, "finance.records.all");
  const exportHref = `/app/finance/export/expenses?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["page", "new"].includes(k)) as [string, string][])}`;
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="ShoppingBag"
        title={t("expenses")}
        subtitle={all ? t("expensesSubtitle") : t("myExpensesSubtitle")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <a href={exportHref} download className="os-btn-ghost">
              {t("exportCsv")}
            </a>
            <ExpenseForm trigger={`+ ${t("newExpense")}`} categories={form.categories} vendors={form.vendors} projects={form.projects} vatRate={form.vatRate} today={form.today} autoOpen={sp.new === "1"} />
          </div>
        }
      />
      {all && (
        <div className="flex flex-wrap gap-1 border-b border-os-line">
          {[["", t("all")], ["PENDING_APPROVAL", t("status.PENDING_APPROVAL")], ["to_pay", t("toPay")], ["PAID", t("estatus.PAID")]].map(([v, l]) => (
            <Link key={v} href={v ? `?status=${v}` : "?"} className={`-mb-px border-b-2 px-3 py-2 text-sm ${(sp.status ?? "") === v ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
              {l}
            </Link>
          ))}
        </div>
      )}
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("searchExpenses") }}
          selects={[
            { name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: STATUSES.map((s) => ({ value: s, label: t(`estatus.${s}` as "estatus.PAID") })) },
            { name: "category", allLabel: `${t("f.category")}: ${t("all")}`, options: cats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn })) },
            ...(all ? [{ name: "project", allLabel: `${t("f.project")}: ${t("all")}`, options: form.projects.map((p) => ({ value: p.id, label: p.label })) }, { name: "submitter", allLabel: `${t("f.submitter")}: ${t("all")}`, options: [{ value: "me", label: t("mine") }] }] : [])
          ]}
        />
        <p className="border-b border-os-line px-4 py-2 text-xs text-os-muted">
          {t("totalInList")}: <span className="font-semibold tabular" dir="ltr">{formatMoney(data.sum, locale)}</span>
        </p>
        {data.items.length === 0 ? (
          <EmptyState icon="ShoppingBag" title={t("noExpenses")} text={t("noExpensesText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.expense")}</th>
                  <th className="hidden md:table-cell">{t("f.category")}</th>
                  <th className="hidden lg:table-cell">{t("f.project")}</th>
                  <th className="hidden lg:table-cell">{t("f.submitter")}</th>
                  <th className="text-end">{t("total")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/finance/expenses/${e.id}`} className="font-medium hover:text-iris-light">
                        {e.description}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{e.number}</span> · {fmtDate(e.date, locale)}
                        {e.vendor ? ` · ${e.vendor.name}` : ""}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{locale === "ar" ? e.category.nameAr : e.category.nameEn}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{e.project?.number ?? "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{personName(e.submittedBy, locale)}</td>
                    <td className="whitespace-nowrap text-end text-sm font-semibold tabular" dir="ltr">
                      {formatMoney(e.total.toFixed(2), locale, e.currency)}
                    </td>
                    <td>
                      <Badge tone={expenseTone(e.status)}>{t(`estatus.${e.status}` as "estatus.PAID")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/finance/expenses" params={sp} />
      </div>
    </div>
  );
}
