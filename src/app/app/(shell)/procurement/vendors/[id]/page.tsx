import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { isAppError } from "@/server/errors";
import { getVendorOps } from "@/server/ops/vendors";
import { assetTone, poTone } from "@/lib/os/ops-page";
import { removeVendorContactAction, vendorContactAction, vendorOpsAction } from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";

export const metadata = { title: "Vendor" };

export default async function VendorOpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getVendorOps(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.code === "FORBIDDEN") return <PermissionDenied permission="procurement.orders.view" />;
    if (isAppError(e)) notFound();
    throw e;
  }
  const v = d.vendor;
  const p = d.perf;
  const cells: [string, string | number][] = [
    ["perf.orders", p?.orders ?? 0],
    ["perf.ordered", p ? Object.entries(p.ordered).map(([c, a]) => formatMoney(a, locale, c)).join(" + ") || "—" : "—"],
    ["perf.onTime", p?.onTime ?? 0],
    ["perf.late", p?.late ?? 0],
    ["perf.avgDelay", p?.avgDelayDays != null ? t("daysN", { n: p.avgDelayDays }) : "—"],
    ["perf.issues", p?.issues ?? 0]
  ];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/procurement/vendors" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{v.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {v.preferred && <span className="text-gold">★</span>}
            {v.name}
            {v.status === "ARCHIVED" && <Badge tone="neutral">{t("archived")}</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            {v.procurementCategory && <span>{v.procurementCategory}</span>}
            {v.rating && <span className="text-gold">{"★".repeat(v.rating)}{"☆".repeat(5 - v.rating)}</span>}
            {v.leadTimeDays != null && <span>{t("leadDays", { n: v.leadTimeDays })}</span>}
            {v.contractReference && <span dir="ltr">{v.contractReference}</span>}
            {v.paymentTerms && <span>{v.paymentTerms}</span>}
          </p>
        </div>
        {d.canManage && (
          <ActionForm
            action={vendorOpsAction}
            args={[id]}
            trigger={t("a.editProfile")}
            triggerClass="os-btn-ghost"
            submitLabel={t("a.save")}
            fields={[
              { name: "procurementCategory", label: t("f.procurementCategory"), value: v.procurementCategory ?? "" },
              { name: "rating", label: t("f.rating"), type: "select", value: v.rating ? String(v.rating) : "", options: ["1", "2", "3", "4", "5"].map((x) => ({ value: x, label: "★".repeat(Number(x)) })) },
              { name: "leadTimeDays", label: t("f.leadTime"), type: "number", value: v.leadTimeDays != null ? String(v.leadTimeDays) : "" },
              { name: "contractReference", label: t("f.contractRef"), value: v.contractReference ?? "", dir: "ltr" },
              { name: "preferred", label: t("f.preferred"), type: "checkbox", value: v.preferred }
            ]}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-os-line bg-os-line md:grid-cols-6">
        {cells.map(([k, val]) => (
          <div key={k} className="bg-os-surface px-4 py-3">
            <p className="text-[11.5px] text-os-muted">{t(k as "perf.orders")}</p>
            <p className="mt-0.5 text-lg font-semibold tabular" dir="ltr">{val}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("orders")}>
          {v.purchaseOrders.length === 0 ? (
            <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noOrders")}</p>
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {v.purchaseOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Link href={`/app/procurement/orders/${o.id}`} className="font-medium hover:text-iris-light" dir="ltr">
                    {o.number}
                  </Link>
                  <span className="flex-1 text-[11px] text-os-faint">{o.issueDate ? fmtDate(o.issueDate, locale) : "—"}</span>
                  <Badge tone={poTone(o.status)}>{t(`pstatus.${o.status}` as "pstatus.DRAFT")}</Badge>
                  <span className="text-xs tabular" dir="ltr">{formatMoney(o.total.toFixed(2), locale, o.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <div className="grid content-start gap-5">
          <SectionCard
            title={t("contacts")}
            action={
              d.canManage ? (
                <ActionForm
                  action={vendorContactAction}
                  args={[id]}
                  trigger={`+ ${t("a.addContact")}`}
                  triggerClass="os-btn-ghost h-7 px-2 text-xs"
                  submitLabel={t("a.save")}
                  fields={[
                    { name: "name", label: t("f.name"), required: true },
                    { name: "role", label: t("f.role") },
                    { name: "email", label: t("f.email"), type: "email" },
                    { name: "phone", label: t("f.phone"), dir: "ltr" },
                    { name: "isPrimary", label: t("f.primary"), type: "checkbox" }
                  ]}
                />
              ) : undefined
            }
          >
            {v.contacts.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noContacts")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {v.contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="font-medium">{c.name}</span>
                    {c.isPrimary && <Badge tone="iris">{t("primary")}</Badge>}
                    <span className="flex-1 text-xs text-os-muted">{c.role}</span>
                    {c.email && <span className="text-xs" dir="ltr">{c.email}</span>}
                    {c.phone && <span className="text-xs" dir="ltr">{c.phone}</span>}
                    {d.canManage && <RunButton action={removeVendorContactAction} args={[c.id]} label="✕" className="os-btn-ghost h-6 px-2 text-xs" confirmText={t("removeConfirm")} />}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          {v.assets.length > 0 && (
            <SectionCard title={t("assets")}>
              <ul className="divide-y divide-os-line text-sm">
                {v.assets.map((a) => (
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
          <DocumentsPanel ctx={ctx} entity={{ type: "VENDOR", id }} />
        </div>
      </div>
    </div>
  );
}
