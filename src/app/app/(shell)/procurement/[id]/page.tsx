import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { isAppError } from "@/server/errors";
import { getRequest } from "@/server/ops/procurement";
import { opsOptions, poTone, requestTone, userName } from "@/lib/os/ops-page";
import { cancelRequestAction, createOrderFromRequestAction, submitRequestAction, updateRequestAction, withdrawRequestAction } from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { LinesForm } from "@/components/ops/OpsForms";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";

export const metadata = { title: "Purchase request" };
const FLOW = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ORDERING", "ORDERED", "RECEIVED"] as const;

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getRequest(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const r = d.request;
  const m = (v: { toFixed(n: number): string }, c = r.currency) => formatMoney(v.toFixed(2), locale, c);
  const opts = d.can.edit || d.can.order ? await opsOptions(ctx, locale, { vendors: true, projects: true, departments: true }) : null;
  const mine = r.requesterId === ctx.userId;
  const step = FLOW.indexOf(r.status as (typeof FLOW)[number]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/procurement" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{r.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {r.title}
            <Badge tone={requestTone(r.status)} dot>
              {t(`rstatus.${r.status}` as "rstatus.DRAFT")}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{userName(d.people, r.requesterId, locale)}</span>
            <span>{fmtDate(r.requestedDate, locale)}</span>
            {r.department && <span>{(locale === "ar" && r.department.nameAr) || r.department.name}</span>}
            {r.project && (
              <Link href={`/app/projects/${r.project.id}`} className="hover:text-iris-light">
                {r.project.number} · {r.project.name}
              </Link>
            )}
            {r.neededByDate && <span>{t("f.neededBy")}: {fmtDate(r.neededByDate, locale)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {d.can.edit && opts && (
            <LinesForm
              action={updateRequestAction}
              args={[id]}
              kind="request"
              currency={r.currency}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              submitAndSendLabel={t("a.saveSubmit")}
              lines={r.items.map((i) => ({ description: i.description, quantity: i.quantity.toString(), price: i.estimatedUnitPrice.toFixed(2), assetExpected: i.assetExpected, category: i.category ?? "" }))}
              header={[
                { name: "title", label: t("f.title"), required: true, value: r.title, span: true },
                { name: "businessJustification", label: t("f.justification"), type: "textarea", required: true, value: r.businessJustification },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments, value: r.departmentId ?? "" },
                { name: "projectId", label: t("f.project"), type: "select", options: opts.projects, value: r.projectId ?? "" },
                { name: "category", label: t("f.category"), value: r.category ?? "" },
                { name: "priority", label: t("f.priority"), type: "select", value: r.priority, options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`prio.${p}` as "prio.LOW") })) },
                { name: "neededByDate", label: t("f.neededBy"), type: "date", value: r.neededByDate?.toISOString().slice(0, 10) ?? "" },
                { name: "preferredVendorId", label: t("f.preferredVendor"), type: "select", options: opts.vendors, value: r.preferredVendorId ?? "" }
              ]}
            />
          )}
          {mine && (r.status === "DRAFT" || r.status === "REJECTED") && <RunButton action={submitRequestAction} args={[id]} label={t("a.submit")} className="os-btn-primary" />}
          {mine && r.status === "PENDING_APPROVAL" && <RunButton action={withdrawRequestAction} args={[id]} label={t("a.withdraw")} className="os-btn-ghost" />}
          {d.can.order && opts && (
            <ActionForm
              action={createOrderFromRequestAction}
              args={[id]}
              trigger={`+ ${t("a.createPo")}`}
              submitLabel={t("a.createPo")}
              redirect="/app/procurement/orders/:id"
              note={t("poFromRequestNote")}
              fields={[
                { name: "vendorId", label: t("f.vendor"), type: "select", required: true, options: opts.vendors, value: r.preferredVendorId ?? "" },
                { name: "expectedDeliveryDate", label: t("f.expectedDelivery"), type: "date" }
              ]}
            />
          )}
          {(mine || d.can.order) && ["DRAFT", "REJECTED", "PENDING_APPROVAL", "APPROVED"].includes(r.status) && (
            <ActionForm action={cancelRequestAction} args={[id]} trigger={t("a.cancel")} triggerClass="os-btn-ghost" submitLabel={t("a.cancelRequest")} danger fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
          )}
        </div>
      </div>

      {step >= 0 && (
        <ol className="flex flex-wrap gap-1 text-[11px]">
          {FLOW.map((s, i) => (
            <li key={s} className={`rounded-full border px-2.5 py-1 ${i < step ? "border-success/40 text-success" : i === step ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-faint"}`}>
              {t(`rstatus.${s}` as "rstatus.DRAFT")}
            </li>
          ))}
        </ol>
      )}
      {r.status === "REJECTED" && r.rejectionReason && <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{t("rejectedBecause", { r: r.rejectionReason })}</p>}
      {r.status === "PENDING_APPROVAL" && d.approval && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          {t("routedTo", { rule: r.approvalRuleName ?? "—", approver: t(`approver.${r.approver ?? "PROCUREMENT"}` as "approver.PROCUREMENT") })}{" "}
          <Link href={`/app/approvals?focus=${d.approval.id}`} className="underline">
            {t("openApproval")}
          </Link>
        </p>
      )}
      {r.status === "CANCELLED" && r.cancelReason && <p className="rounded-lg border border-os-line bg-os-panel px-4 py-2 text-sm text-os-muted">{t("cancelledBecause", { r: r.cancelReason })}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <SectionCard title={t("items")}>
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.description")}</th>
                    <th className="text-end">{t("f.quantity")}</th>
                    <th className="text-end">{t("f.estUnitPrice")}</th>
                    <th className="text-end">{t("f.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.description}
                        {i.assetExpected && <span className="ms-1 text-[10px] text-iris-light">{t("assetExpected")}</span>}
                      </td>
                      <td className="text-end tabular" dir="ltr">{Number(i.quantity)}</td>
                      <td className="text-end tabular" dir="ltr">{m(i.estimatedUnitPrice)}</td>
                      <td className="text-end font-medium tabular" dir="ltr">{m(i.estimatedTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex justify-between border-t border-os-line px-4 py-2 text-sm">
              <span className="text-os-muted">{t("f.estimated")}</span>
              <span className="font-semibold tabular" dir="ltr">{m(r.estimatedAmount)}</span>
            </p>
          </SectionCard>
          <SectionCard title={t("f.justification")}>
            <p className="whitespace-pre-line p-4 text-sm" dir="auto">{r.businessJustification}</p>
            {r.description && <p className="whitespace-pre-line border-t border-os-line p-4 text-sm text-os-muted" dir="auto">{r.description}</p>}
          </SectionCard>
        </div>
        <div className="grid content-start gap-5">
          <SectionCard title={t("orders")}>
            {r.purchaseOrders.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noOrders")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {r.purchaseOrders.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <Link href={`/app/procurement/orders/${p.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                      {p.number}
                    </Link>
                    <span className="flex-1 truncate text-xs text-os-muted">{p.vendor.name}</span>
                    <Badge tone={poTone(p.status)}>{t(`pstatus.${p.status}` as "pstatus.DRAFT")}</Badge>
                    <span className="text-xs tabular" dir="ltr">{m(p.total, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <DocumentsPanel ctx={ctx} entity={{ type: "PROCUREMENT_REQUEST", id }} />
        </div>
      </div>
    </div>
  );
}
