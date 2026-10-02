import Link from "next/link";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getExpense } from "@/server/finance/expenses";
import { expenseFormData } from "@/lib/os/finance-page";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ExpenseActions, ExpenseForm } from "@/components/finance/Widgets";
import { expenseTone } from "@/components/finance/tones";

export const metadata = { title: "Expense" };

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allowed } = await pageCtx("finance.expenses.create");
  if (!allowed) return <PermissionDenied permission="finance.expenses.create" />;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  let d;
  try {
    d = await getExpense(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const e = d.expense;
  const m = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), locale, e.currency);
  const mine = e.submittedById === ctx.userId;
  const finance = can(ctx, "finance.records.all");
  const editable = (e.status === "DRAFT" || e.status === "REJECTED") && (mine || finance);
  const form = await expenseFormData(ctx);
  const who = (uid: string | null) => personName(d.people.find((p) => p.id === uid), locale);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/finance/expenses" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">
            {e.number}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {e.description}
            <Badge tone={expenseTone(e.status)} dot>
              {t(`estatus.${e.status}` as "estatus.PAID")}
            </Badge>
          </h1>
          <p className="mt-1 text-xs text-os-muted">
            {locale === "ar" ? e.category.nameAr : e.category.nameEn} · {fmtDate(e.date, locale)}
            {e.vendor && ` · ${e.vendor.name}`}
            {e.purchaseOrder && (
              <>
                {" · "}
                <Link href={`/app/procurement/orders/${e.purchaseOrder.id}`} className="hover:text-iris-light" dir="ltr">
                  {e.purchaseOrder.number}
                </Link>
              </>
            )}
            {e.project && (
              <>
                {" · "}
                <Link href={`/app/projects/${e.project.id}`} className="hover:text-iris-light" dir="ltr">
                  {e.project.number}
                </Link>
              </>
            )}
          </p>
        </div>
        <p className="text-2xl font-semibold tabular" dir="ltr">
          {m(e.total)}
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        {editable && <ExpenseForm id={e.id} today={form.today} trigger={t("a.edit")} categories={form.categories} vendors={form.vendors} projects={form.projects} vatRate={form.vatRate} initial={{ categoryId: e.categoryId, vendorId: e.vendorId ?? "", projectId: e.projectId ?? "", date: e.date.toISOString().slice(0, 10), amount: e.amount.toFixed(2), taxAmount: e.taxAmount.toFixed(2), currency: e.currency, paymentMethod: e.paymentMethod ?? "", description: e.description, reference: e.reference ?? "" }} />}
        <ExpenseActions id={e.id} status={e.status} today={form.today} can={{ submit: can(ctx, "finance.expenses.submit") && (mine || finance), withdraw: mine, pay: can(ctx, "finance.expenses.pay") && finance, cancel: mine || (finance && can(ctx, "finance.expenses.approve")) }} />
      </div>
      {e.status === "REJECTED" && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{t("rejectedBecause")}: {e.rejectionReason}</p>}
      {e.status === "PENDING_APPROVAL" && e.approvalId && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          {t("awaitingApproval")}{" "}
          <Link href={`/app/approvals?focus=${e.approvalId}`} className="underline">
            {t("openApproval")}
          </Link>
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <SectionCard title={t("amounts")}>
          <dl className="grid gap-2 p-4 text-sm">
            {(
              [
                [t("f.amountNet"), m(e.amount)],
                [t("f.vatAmount"), m(e.taxAmount)],
                [t("total"), m(e.total)]
              ] as [string, string][]
            ).map(([k, v], i) => (
              <div key={k} className={`flex justify-between ${i === 2 ? "border-t border-os-line pt-2 font-semibold" : "text-os-muted"}`}>
                <dt>{k}</dt>
                <dd className="tabular" dir="ltr">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
        <SectionCard title={t("details")}>
          <dl className="grid gap-2 p-4 text-xs">
            {(
              [
                [t("f.submitter"), `${personName(e.submittedBy, locale)}${e.submittedAt ? ` · ${fmtDateTime(e.submittedAt, locale)}` : ""}`],
                [t("f.claimant"), personName(e.user, locale) ?? "—"],
                [t("f.department"), (locale === "ar" && e.department?.nameAr) || e.department?.name || "—"],
                [t("approvedBy"), e.approvedAt ? `${who(e.approvedById)} · ${fmtDateTime(e.approvedAt, locale)}` : "—"],
                [t("paidAt"), e.paidAt ? `${fmtDate(e.paidAt, locale)} · ${who(e.paidById) ?? ""}${e.paymentMethod ? ` · ${t(`method.${e.paymentMethod}` as "method.CASH")}` : ""}${e.paymentReference ? ` · ${e.paymentReference}` : ""}` : "—"],
                [t("f.reference"), e.reference ?? "—"]
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-os-muted">{k}</dt>
                <dd dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
      <SectionCard title={t("tabs.activity")}>
        <ul className="divide-y divide-os-line text-sm">
          {d.history.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="font-medium">{t.has(`audit.${a.action.replace(/\./g, "_")}`) ? t(`audit.${a.action.replace(/\./g, "_")}` as "audit.invoice_created") : a.action}</span>
              <span className="text-xs text-os-muted">{personName(a.actor, locale) ?? t("system")}</span>
              <span className="flex-1" />
              <span className="text-xs text-os-faint">{fmtDateTime(a.createdAt, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("receiptNote")}</p>
      </SectionCard>
      <DocumentsPanel ctx={ctx} entity={{ type: "EXPENSE", id }} />
    </div>
  );
}
