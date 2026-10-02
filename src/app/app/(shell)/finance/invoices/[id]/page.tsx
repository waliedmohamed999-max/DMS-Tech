import Link from "next/link";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getInvoice, invoiceActivity } from "@/server/finance/invoices";
import { editorData } from "@/lib/os/finance-page";
import { personName } from "@/lib/os/crm-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, fmtDate, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { InvoiceEditor } from "@/components/finance/InvoiceEditor";
import { CollectionNoteForm, InvoiceActions } from "@/components/finance/Widgets";
import { invoiceTone, paymentTone } from "@/components/finance/tones";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Invoice" };
const TABS = ["overview", "items", "payments", "activity", "source"] as const;

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx, allowed } = await pageCtx("finance.invoices.view");
  if (!allowed) return <PermissionDenied permission="finance.invoices.view" />;
  const locale = await getLocale();
  const t = await getTranslations("os.finance");
  let d;
  try {
    d = await getInvoice(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const inv = d.invoice;
  const m = (v: { toFixed(n: number): string } | string) => formatMoney(typeof v === "string" ? v : v.toFixed(2), locale, inv.currency);
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "overview";
  const who = (uid: string | null) => personName(d.people.find((p) => p.id === uid), locale);
  const editing = sp.edit === "1" && inv.status === "DRAFT" && can(ctx, "finance.invoices.edit");
  const open = ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);

  if (editing) {
    const ed = await editorData(ctx);
    return (
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <Link href={`/app/finance/invoices/${id}`} className="os-btn-ghost size-8 px-0" aria-label="back">
            <span className="rtl:rotate-180">←</span>
          </Link>
          <h1 className="text-xl font-semibold">{t("editDraft")}</h1>
          <Badge>{t(`source.${inv.sourceType}` as "source.MANUAL")}</Badge>
        </div>
        <InvoiceEditor
          id={id}
          clientLocked={inv.sourceType !== "MANUAL"}
          timeLines={inv._count.timeLinks}
          initial={{
            clientId: inv.clientId, contactId: inv.contactId ?? "", language: inv.language, currency: inv.currency, issueDate: inv.issueDate.toISOString().slice(0, 10), dueDate: inv.dueDate.toISOString().slice(0, 10), paymentTerms: inv.paymentTerms ?? "", notes: inv.notes ?? "",
            items: inv.items.map((x) => ({ description: x.description, serviceId: x.serviceId ?? "", projectId: x.projectId, unit: x.unit ?? "", quantity: x.quantity.toFixed(3).replace(/\.?0+$/, ""), unitPrice: x.unitPrice.toFixed(2), discountType: x.discountType, discountValue: x.discountType === "NONE" ? "" : x.discountValue.toFixed(2), taxBehavior: x.taxBehavior }))
          }}
          clients={ed.clients}
          contactsByClient={ed.contactsByClient}
          services={ed.services}
          vatRate={ed.vatRate}
        />
      </div>
    );
  }

  const activity = tab === "activity" ? await invoiceActivity(ctx, id) : [];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/finance/invoices" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint">{t("invoice")}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span dir="ltr">{inv.number ?? t("draftNo")}</span>
            <Badge tone={invoiceTone(inv.status)} dot>
              {t(`status.${inv.status}` as "status.PAID")}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-os-muted">
            <Link href={`/app/crm/clients/${inv.client.id}?tab=finance`} className="hover:text-iris-light">
              {inv.client.displayName}
            </Link>
            {inv.project && (
              <Link href={`/app/projects/${inv.project.id}?tab=finance`} className="hover:text-iris-light" dir="ltr">
                {inv.project.number}
              </Link>
            )}
            {inv.contract && (
              <span dir="ltr">
                {inv.contract.number}
                {inv.contractMilestone ? ` · ${inv.contractMilestone.title}` : ""}
              </span>
            )}
            <span>
              {t("f.issueDate")} {fmtDate(inv.issueDate, locale)} · {t("f.dueDate")} <span className={inv.status === "OVERDUE" ? "text-danger" : ""}>{fmtDate(inv.dueDate, locale)}</span>
            </span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-end">
          <div>
            <p className="text-xs text-os-faint">{t("total")}</p>
            <p className="text-xl font-semibold tabular" dir="ltr">
              {m(inv.total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-os-faint">{t("balance")}</p>
            <p className={`text-xl font-semibold tabular ${open && inv.balanceDue.gt(0) ? (inv.status === "OVERDUE" ? "text-danger" : "text-warning") : "text-os-muted"}`} dir="ltr">
              {m(inv.balanceDue)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <a href={`/app/finance/invoices/${id}/pdf?lang=${inv.language}`} target="_blank" rel="noopener" className="os-btn-secondary">
            <Icon name="FileText" size={14} /> {t("pdf")}
          </a>
          <a href={`/app/finance/invoices/${id}/pdf?lang=${inv.language === "ar" ? "en" : "ar"}`} target="_blank" rel="noopener" className="os-btn-ghost">
            {inv.language === "ar" ? "EN" : "عربي"}
          </a>
          {inv.documents.length > 0 && (
            <a href={`/app/finance/invoices/${id}/pdf?original=1&download=1`} className="os-btn-ghost">
              {t("originalPdf")}
            </a>
          )}
        </div>
        <InvoiceActions
          id={id}
          status={inv.status}
          sent={Boolean(inv.sentAt)}
          paid={inv.paidAmount.gt(0)}
          total={inv.total.toFixed(2)}
          currency={inv.currency}
          can={{ edit: can(ctx, "finance.invoices.edit"), issue: can(ctx, "finance.invoices.issue"), send: can(ctx, "finance.invoices.send"), cancel: can(ctx, "finance.invoices.cancel"), pay: can(ctx, "finance.payments.create"), create: can(ctx, "finance.invoices.create") }}
        />
      </div>
      {inv.status === "VOID" && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{t("voidedBecause")}: {inv.voidReason}{d.replacedBy && <> · <Link href={`/app/finance/invoices/${d.replacedBy.id}`} className="underline">{d.replacedBy.number ?? t("draftNo")}</Link></>}</p>}
      {inv.status === "CANCELLED" && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2.5 text-sm text-os-muted">{t("cancelledBecause")}: {inv.cancelReason}</p>}
      {d.replaces && <p className="text-xs text-os-muted">{t("replaces")}: <Link href={`/app/finance/invoices/${d.replaces.id}`} className="underline" dir="ltr">{d.replaces.number}</Link></p>}
      {inv.status === "DRAFT" && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2.5 text-xs text-os-muted">{t("draftNote")}</p>}

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-os-line">
        {TABS.filter((k) => k !== "payments" || d.canPayments).map((k) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === k ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}>
            {t(`tabs.${k}` as "tabs.overview")}
            {k === "payments" && inv.allocations.length > 0 && <span className="ms-1 text-os-faint tabular">{inv.allocations.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="grid gap-5">
            <SectionCard title={t("amounts")}>
              <dl className="grid gap-2 p-4 text-sm">
                {(
                  [
                    [t("subtotal"), m(inv.subtotal)],
                    [t("discount"), inv.discountTotal.gt(0) ? `−${m(inv.discountTotal)}` : m(inv.discountTotal)],
                    [t("vat"), m(inv.taxTotal)],
                    [t("total"), m(inv.total)],
                    [t("paid"), m(inv.paidAmount)],
                    [t("balance"), m(inv.balanceDue)]
                  ] as [string, string][]
                ).map(([k, v], i) => (
                  <div key={k} className={`flex justify-between gap-3 ${i === 3 || i === 5 ? "border-t border-os-line pt-2 font-semibold" : "text-os-muted"}`}>
                    <dt>{k}</dt>
                    <dd className="tabular" dir="ltr">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
            {open && (
              <SectionCard title={t("collection")}>
                <div className="grid gap-3 p-4">
                  <p className="text-xs text-os-muted">
                    {inv.nextFollowUpAt ? `${t("nextFollowUp")}: ${fmtDate(inv.nextFollowUpAt, locale)}` : t("noFollowUp")}
                    {inv.lastReminderAt ? ` · ${t("lastReminder")}: ${fmtDate(inv.lastReminderAt, locale)}` : ""}
                  </p>
                  {can(ctx, "finance.collections.manage") && <CollectionNoteForm invoiceId={id} />}
                </div>
              </SectionCard>
            )}
            {inv.collectionNotes.length > 0 && (
              <SectionCard title={t("notesTitle")}>
                <ul className="divide-y divide-os-line text-sm">
                  {inv.collectionNotes.map((n) => (
                    <li key={n.id} className="px-4 py-2.5">
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-os-faint">
                        <Badge tone={n.kind === "REMINDER" ? "info" : n.kind === "PROMISE_TO_PAY" ? "warning" : "neutral"}>{t(`note.${n.kind}` as "note.NOTE")}</Badge>
                        {n.channel && t(`channel.${n.channel}` as "channel.OTHER")} · {personName(n.createdBy, locale) ?? "—"} · {fmtDateTime(n.createdAt, locale)}
                        {n.followUpAt && ` · ${t("f.followUp")} ${fmtDate(n.followUpAt, locale)}`}
                      </p>
                      <p className="mt-1 whitespace-pre-line" dir="auto">
                        {n.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>
          <SectionCard title={t("details")}>
            <dl className="grid gap-2 p-4 text-xs">
              {(
                [
                  [t("source.label"), t(`source.${inv.sourceType}` as "source.MANUAL")],
                  [t("f.currency"), inv.currency],
                  [t("f.language"), inv.language === "ar" ? "العربية" : "English"],
                  [t("createdBy"), personName(inv.createdBy, locale) ?? "—"],
                  [t("issuedAt"), inv.issuedAt ? `${fmtDateTime(inv.issuedAt, locale)} · ${who(inv.issuedById) ?? ""}` : "—"],
                  [t("sentAt"), inv.sentAt ? `${fmtDateTime(inv.sentAt, locale)} · ${inv.sentMethod ? t(`send.${inv.sentMethod}` as "send.OTHER") : ""}` : "—"],
                  [t("paidAt"), inv.paidAt ? fmtDateTime(inv.paidAt, locale) : "—"],
                  [t("f.paymentTerms"), inv.paymentTerms ?? "—"]
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                  <dt className="text-os-muted">{k}</dt>
                  <dd dir="auto" className="whitespace-pre-line">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </div>
      )}

      {tab === "items" && (
        <SectionCard title={t("items")}>
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("f.description")}</th>
                  <th className="text-end">{t("f.qty")}</th>
                  <th className="text-end">{t("f.unitPrice")}</th>
                  <th className="text-end">{t("discount")}</th>
                  <th className="text-end">{t("f.tax")}</th>
                  <th className="text-end">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((x, i) => (
                  <tr key={x.id}>
                    <td className="text-xs text-os-faint">{i + 1}</td>
                    <td className="min-w-[220px] text-sm" dir="auto">
                      {x.description}
                      {x._count.timeLinks > 0 && <span className="block text-[10.5px] text-os-faint">{t("timeLinked", { n: x._count.timeLinks })}</span>}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {x.quantity.toFixed(3).replace(/\.?0+$/, "")} {x.unit}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {m(x.unitPrice)}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {x.discountAmount.gt(0) ? m(x.discountAmount) : "—"}
                    </td>
                    <td className="text-end text-xs tabular" dir="ltr">
                      {x.taxRate.toFixed(2).replace(/\.00$/, "")}% · {m(x.taxAmount)}
                    </td>
                    <td className="text-end text-sm font-semibold tabular" dir="ltr">
                      {m(x.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("vatSnapshotNote")}</p>
        </SectionCard>
      )}

      {tab === "payments" && d.canPayments && (
        <SectionCard title={t("tabs.payments")}>
          {inv.allocations.length === 0 ? (
            <EmptyState icon="CreditCard" title={t("noPayments")} text="" />
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {inv.allocations.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Link href={`/app/finance/payments/${a.payment.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                    {a.payment.number}
                  </Link>
                  <span className="text-xs text-os-muted">
                    {fmtDate(a.payment.paymentDate, locale)} · {t(`method.${a.payment.method}` as "method.CASH")}
                    {a.payment.reference ? ` · ${a.payment.reference}` : ""}
                  </span>
                  <span className="flex-1" />
                  <Badge tone={paymentTone(a.payment.status)}>{t(`pstatus.${a.payment.status}` as "pstatus.RECORDED")}</Badge>
                  <span className={`tabular ${a.payment.status === "REVERSED" ? "text-os-faint line-through" : "font-semibold"}`} dir="ltr">
                    {m(a.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "activity" && (
        <SectionCard title={t("tabs.activity")}>
          {activity.length === 0 ? (
            <EmptyState icon="ChartLine" title={t("noActivity")} text="" />
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="font-medium">{t.has(`audit.${a.action.replace(/\./g, "_")}`) ? t(`audit.${a.action.replace(/\./g, "_")}` as "audit.invoice_created") : a.action}</span>
                  <span className="text-xs text-os-muted">{personName(a.actor, locale) ?? t("system")}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-os-faint">{fmtDateTime(a.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "source" && (
        <SectionCard title={t("tabs.source")}>
          <dl className="grid gap-2 p-4 text-sm">
            {(
              [
                [t("source.label"), t(`source.${inv.sourceType}` as "source.MANUAL")],
                [t("f.client"), inv.client.displayName, `/app/crm/clients/${inv.client.id}`],
                ...(inv.contract ? [[t("contract"), `${inv.contract.number} · ${inv.contract.title}`, can(ctx, "sales.contracts.view") ? `/app/sales/contracts/${inv.contract.id}` : undefined]] : []),
                ...(inv.contractMilestone ? [[t("contractMilestone"), inv.contractMilestone.title]] : []),
                ...(inv.quotation ? [[t("quotation"), `${inv.quotation.number}${inv.quotationVersion ? ` V${inv.quotationVersion.versionNumber}` : ""}`, can(ctx, "sales.quotations.view") ? `/app/sales/quotations/${inv.quotation.id}` : undefined]] : []),
                ...(inv.project ? [[t("f.project"), `${inv.project.number} · ${inv.project.name}`, `/app/projects/${inv.project.id}`]] : []),
                ...(inv._count.timeLinks ? [[t("timeEntries"), t("timeLinked", { n: inv._count.timeLinks })]] : []),
                [t("contentHash"), inv.contentHash ?? "—"]
              ] as [string, string, string?][]
            ).map(([k, v, href]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-os-muted">{k}</dt>
                <dd className="break-all" dir="auto">
                  {href ? (
                    <Link href={href} className="hover:text-iris-light">
                      {v}
                    </Link>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {inv.documents.length > 0 && (
            <ul className="divide-y divide-os-line border-t border-os-line text-xs">
              {inv.documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Icon name="FileText" size={14} />
                  <span dir="ltr">{doc.fileName}</span>
                  <span className="text-os-faint">
                    {fmtDateTime(doc.createdAt, locale)} · sha256 <span dir="ltr">{doc.sha256.slice(0, 16)}…</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("sourceNote")}</p>
        </SectionCard>
      )}
      <DocumentsPanel ctx={ctx} entity={{ type: "INVOICE", id }} />
    </div>
  );
}
