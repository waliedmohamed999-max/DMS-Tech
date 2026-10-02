import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { todayIn } from "@/server/commercial/dates";
import { getOrder } from "@/server/ops/orders";
import { listAssetCategories } from "@/server/ops/assets";
import { listCategories } from "@/server/finance/expenses";
import { assetTone, opsOptions, poTone, userName } from "@/lib/os/ops-page";
import {
  assetFromPoItemAction, cancelOrderAction, closeOrderAction, issueOrderAction, poExpenseAction, receiveOrderAction, reviseOrderAction, submitOrderAction, updateOrderAction, withdrawOrderAction
} from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { LinesForm, ReceiveForm } from "@/components/ops/OpsForms";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";

export const metadata = { title: "Purchase order" };
const FLOW = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] as const;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getOrder(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const po = d.po;
  const m = (v: { toFixed(n: number): string }, c = po.currency) => formatMoney(v.toFixed(2), locale, c);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const today = todayIn(org.timezone).toISOString().slice(0, 10);
  const create = can(ctx, "procurement.orders.create");
  const draft = po.status === "DRAFT";
  const receivable = ["ISSUED", "PARTIALLY_RECEIVED"].includes(po.status) && can(ctx, "procurement.orders.receive");
  const received = ["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(po.status);
  const nothingReceived = po.items.every((i) => Number(i.receivedQuantity) === 0);
  const [opts, assetCats, expenseCats] = await Promise.all([
    draft && create ? opsOptions(ctx, locale, { vendors: true, projects: true, departments: true }) : null,
    received && can(ctx, "assets.manage") ? listAssetCategories(ctx.organizationId) : Promise.resolve([]),
    received ? listCategories(ctx) : Promise.resolve([])
  ]);
  const step = FLOW.indexOf(po.status as (typeof FLOW)[number]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/procurement/orders" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{po.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <Link href={`/app/procurement/vendors/${po.vendor.id}`} className="hover:text-iris-light">
              {po.vendor.name}
            </Link>
            <Badge tone={poTone(po.status)} dot>
              {t(`pstatus.${po.status}` as "pstatus.DRAFT")}
            </Badge>
            {d.overdue && <Badge tone="danger">{t("late")}</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            {po.procurementRequest && (
              <Link href={`/app/procurement/${po.procurementRequest.id}`} className="hover:text-iris-light">
                <span dir="ltr">{po.procurementRequest.number}</span> · {po.procurementRequest.title}
              </Link>
            )}
            {po.project && <Link href={`/app/projects/${po.project.id}`} className="hover:text-iris-light">{po.project.name}</Link>}
            {po.issueDate && <span>{t("f.issueDate")}: {fmtDate(po.issueDate, locale)}</span>}
            {po.expectedDeliveryDate && <span className={d.overdue ? "text-danger" : ""}>{t("f.expectedDelivery")}: {fmtDate(po.expectedDeliveryDate, locale)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft && create && opts && (
            <LinesForm
              action={updateOrderAction}
              args={[id]}
              kind="order"
              currency={po.currency}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              lines={po.items.map((i) => ({ description: i.description, quantity: i.quantity.toString(), price: i.unitPrice.toFixed(2), discount: i.discountAmount.toFixed(2), taxRate: i.taxRate.toString(), assetExpected: i.assetExpected, category: i.category ?? "" }))}
              header={[
                { name: "vendorId", label: t("f.vendor"), type: "select", required: true, options: opts.vendors, value: po.vendorId },
                { name: "expectedDeliveryDate", label: t("f.expectedDelivery"), type: "date", value: po.expectedDeliveryDate?.toISOString().slice(0, 10) ?? "" },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: po.departmentId ?? "" },
                { name: "projectId", label: t("f.project"), type: "select", options: opts.projects, value: po.projectId ?? "" },
                { name: "terms", label: t("f.terms"), type: "textarea", value: po.terms ?? "" }
              ]}
            />
          )}
          {draft && create && <RunButton action={submitOrderAction} args={[id]} label={t("a.submitPo")} className="os-btn-primary" />}
          {po.status === "PENDING_APPROVAL" && create && <RunButton action={withdrawOrderAction} args={[id]} label={t("a.withdraw")} className="os-btn-ghost" />}
          {po.status === "APPROVED" && can(ctx, "procurement.orders.issue") && <RunButton action={issueOrderAction} args={[id]} label={t("a.issue")} className="os-btn-primary" confirmText={t("issueConfirm")} />}
          {receivable && (
            <ReceiveForm
              action={receiveOrderAction}
              poId={id}
              today={today}
              lines={po.items.filter((i) => Number(i.receivedQuantity) < Number(i.quantity)).map((i) => ({ id: i.id, description: i.description, remaining: String(Number(i.quantity) - Number(i.receivedQuantity)) }))}
            />
          )}
          {["PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status) && can(ctx, "procurement.orders.receive") && (
            <ActionForm action={closeOrderAction} args={[id]} trigger={t("a.close")} triggerClass="os-btn-ghost" submitLabel={t("a.close")} note={po.status === "PARTIALLY_RECEIVED" ? t("shortCloseNote") : undefined} fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: po.status === "PARTIALLY_RECEIVED" }]} />
          )}
          {po.status === "ISSUED" && nothingReceived && can(ctx, "procurement.orders.cancel") && create && (
            <ActionForm action={reviseOrderAction} args={[id]} trigger={t("a.revise")} triggerClass="os-btn-ghost" submitLabel={t("a.revise")} redirect="/app/procurement/orders/:id" note={t("reviseNote")} fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
          )}
          {["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED"].includes(po.status) && nothingReceived && can(ctx, "procurement.orders.cancel") && (
            <ActionForm action={cancelOrderAction} args={[id]} trigger={t("a.cancel")} triggerClass="os-btn-ghost" submitLabel={t("a.cancelPo")} danger fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
          )}
        </div>
      </div>

      {step >= 0 && (
        <ol className="flex flex-wrap gap-1 text-[11px]">
          {FLOW.map((s, i) => (
            <li key={s} className={`rounded-full border px-2.5 py-1 ${i < step ? "border-success/40 text-success" : i === step ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-faint"}`}>
              {t(`pstatus.${s}` as "pstatus.DRAFT")}
            </li>
          ))}
        </ol>
      )}
      {po.status === "PENDING_APPROVAL" && d.approval && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          {t("poAwaitingApproval")}{" "}
          <Link href={`/app/approvals?focus=${d.approval.id}`} className="underline">
            {t("openApproval")}
          </Link>
        </p>
      )}
      {po.approvalWaivedReason && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2 text-xs text-os-muted">{t("approvalWaived")}: {po.approvalWaivedReason}</p>}
      {po.status === "CANCELLED" && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2 text-sm text-os-muted">{t("cancelledBecause", { r: po.cancelReason ?? "" })}{po.revisedBy && <> · <Link href={`/app/procurement/orders/${po.revisedBy.id}`} className="underline" dir="ltr">{po.revisedBy.number}</Link></>}</p>}
      {po.revisionOf && <p className="text-xs text-os-muted">{t("revisionOf")} <Link href={`/app/procurement/orders/${po.revisionOf.id}`} className="underline" dir="ltr">{po.revisionOf.number}</Link></p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <SectionCard title={t("items")} action={!draft ? <span className="text-[11px] text-os-faint">🔒 {t("frozen")}</span> : undefined}>
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.description")}</th>
                    <th className="text-end">{t("f.quantity")}</th>
                    <th className="hidden text-end md:table-cell">{t("f.unitPrice")}</th>
                    <th className="hidden text-end md:table-cell">{t("f.tax")}</th>
                    <th className="text-end">{t("f.total")}</th>
                    <th className="text-end">{t("f.received")}</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((i) => {
                    const assetRoom = Math.floor(Number(i.receivedQuantity)) - i._count.assets;
                    return (
                      <tr key={i.id}>
                        <td className="min-w-[180px]">
                          {i.description}
                          {i.assetExpected && <span className="ms-1 text-[10px] text-iris-light">{t("assetExpected")}</span>}
                          {assetCats.length > 0 && assetRoom > 0 && (
                            <span className="mt-1 block">
                              <ActionForm
                                action={assetFromPoItemAction}
                                args={[i.id]}
                                trigger={`+ ${t("a.registerAsset")} (${assetRoom})`}
                                triggerClass="os-btn-ghost h-6 px-2 text-[11px]"
                                submitLabel={t("a.create")}
                                redirect="/app/assets/:id"
                                note={t("assetFromPoNote")}
                                fields={[
                                  { name: "name", label: t("f.name"), value: i.description, required: true },
                                  { name: "categoryId", label: t("f.category"), type: "select", required: true, options: assetCats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn })) },
                                  { name: "serialNumber", label: t("f.serial"), dir: "ltr" },
                                  { name: "manufacturer", label: t("f.manufacturer") },
                                  { name: "model", label: t("f.model") },
                                  { name: "warrantyEndDate", label: t("f.warrantyEnd"), type: "date" },
                                  { name: "location", label: t("f.location") }
                                ]}
                              />
                            </span>
                          )}
                        </td>
                        <td className="text-end tabular" dir="ltr">{Number(i.quantity)}</td>
                        <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">{m(i.unitPrice)}</td>
                        <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">{Number(i.taxRate)}%</td>
                        <td className="text-end font-medium tabular" dir="ltr">{m(i.total)}</td>
                        <td className={`text-end tabular ${Number(i.receivedQuantity) >= Number(i.quantity) ? "text-success" : ""}`} dir="ltr">
                          {Number(i.receivedQuantity)} / {Number(i.quantity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-1 border-t border-os-line px-4 py-3 text-sm sm:ms-auto sm:w-72">
              {(
                [
                  ["f.subtotal", po.subtotal],
                  ["f.discount", po.discountTotal],
                  ["f.tax", po.taxTotal]
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between text-os-muted">
                  <dt>{t(k)}</dt>
                  <dd className="tabular" dir="ltr">{m(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between font-semibold">
                <dt>{t("f.total")}</dt>
                <dd className="tabular" dir="ltr">{m(po.total)}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title={t("receipts")}>
            {po.receipts.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noReceipts")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {po.receipts.map((r) => (
                  <li key={r.id} className="grid gap-1 px-4 py-2.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{fmtDate(r.receivedAt, locale)}</span>
                      <span className="text-xs text-os-muted">{userName(d.people, r.receivedById, locale)}</span>
                    </p>
                    <ul className="text-xs text-os-muted">
                      {r.items.map((x) => (
                        <li key={x.id}>
                          {x.poItem.description} × <span dir="ltr">{Number(x.quantityReceived)}</span>
                          {x.condition !== "GOOD" && <Badge tone="danger">{t(`cond.${x.condition}` as "cond.GOOD")}</Badge>}
                        </li>
                      ))}
                    </ul>
                    {r.notes && <p className="text-xs" dir="auto">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="grid content-start gap-5">
          <SectionCard title={t("financeBoundary")}>
            <div className="grid gap-2 p-4 text-sm">
              <p className="text-xs text-os-muted">{po.status === "RECEIVED" || po.status === "CLOSED" ? t("readyForPayment") : t("noPayable")}</p>
              {po.expenses.map((e) => (
                <Link key={e.id} href={`/app/finance/expenses/${e.id}`} className="flex justify-between text-xs hover:text-iris-light">
                  <span dir="ltr">{e.number}</span>
                  <span dir="ltr">{m(e.total, e.currency)} · {e.status}</span>
                </Link>
              ))}
              {received && expenseCats.length > 0 && can(ctx, "finance.expenses.create") && (
                <ActionForm
                  action={poExpenseAction}
                  trigger={`+ ${t("a.recordSupplierExpense")}`}
                  triggerClass="os-btn-ghost h-8 justify-self-start px-2 text-xs"
                  submitLabel={t("a.create")}
                  redirect="/app/finance/expenses/:id"
                  note={t("supplierExpenseNote")}
                  fields={[
                    { name: "purchaseOrderId", label: "", type: "hidden", value: id },
                    { name: "vendorId", label: "", type: "hidden", value: po.vendorId },
                    { name: "projectId", label: "", type: "hidden", value: po.projectId ?? "" },
                    { name: "currency", label: "", type: "hidden", value: po.currency },
                    { name: "categoryId", label: t("f.category"), type: "select", required: true, options: expenseCats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn })) },
                    { name: "date", label: t("f.date"), type: "date", required: true, value: today },
                    { name: "amount", label: t("f.netAmount"), type: "number", required: true, value: po.subtotal.toFixed(2) },
                    { name: "taxAmount", label: t("f.tax"), type: "number", value: po.taxTotal.toFixed(2) },
                    { name: "description", label: t("f.description"), required: true, value: `${po.number} · ${po.vendor.name}` },
                    { name: "reference", label: t("f.reference"), dir: "ltr" }
                  ]}
                />
              )}
            </div>
          </SectionCard>
          {po.assets.length > 0 && (
            <SectionCard title={t("assets")}>
              <ul className="divide-y divide-os-line text-sm">
                {po.assets.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-4 py-2">
                    <Link href={`/app/assets/${a.id}`} className="flex-1 hover:text-iris-light">
                      <span dir="ltr">{a.number}</span> · {a.name}
                    </Link>
                    <Badge tone={assetTone(a.status)}>{t(`astatus.${a.status}` as "astatus.IN_STOCK")}</Badge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          <SectionCard title={t("people")}>
            <dl className="grid gap-1 p-4 text-xs">
              <div className="flex justify-between"><dt className="text-os-muted">{t("createdBy")}</dt><dd>{userName(d.people, po.createdById, locale) ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-os-muted">{t("approvedBy")}</dt><dd>{userName(d.people, po.approvedById, locale) ?? (po.approvalWaivedReason ? t("waived") : "—")}</dd></div>
              <div className="flex justify-between"><dt className="text-os-muted">{t("issuedBy")}</dt><dd>{userName(d.people, po.issuedById, locale) ?? "—"}</dd></div>
            </dl>
            {po.terms && <p className="whitespace-pre-line border-t border-os-line p-4 text-xs" dir="auto">{po.terms}</p>}
          </SectionCard>
          <DocumentsPanel ctx={ctx} entity={{ type: "PURCHASE_ORDER", id }} />
        </div>
      </div>
    </div>
  );
}
