import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { ASSET_TRANSITIONS, getAsset, listAssetCategories } from "@/server/ops/assets";
import { assetTone, opsOptions, userName } from "@/lib/os/ops-page";
import {
  assetStatusAction, assignAssetAction, cancelMaintenanceAction, completeMaintenanceAction, createMaintenanceAction, returnAssetAction, startMaintenanceAction, updateAssetAction
} from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { DocumentsPanel } from "@/components/ops/DocumentsPanel";

export const metadata = { title: "Asset" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  let d;
  try {
    d = await getAsset(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const a = d.asset;
  const active = a.assignments.find((x) => !x.returnedAt);
  const manage = can(ctx, "assets.manage");
  const assign = can(ctx, "assets.assign");
  const maint = can(ctx, "assets.maintenance");
  const [opts, cats] = await Promise.all([assign || manage || maint ? opsOptions(ctx, locale, { employees: true, vendors: true }) : null, manage ? listAssetCategories(ctx.organizationId) : Promise.resolve([])]);
  const empName = (e: { displayName: string; nameAr: string | null }) => (locale === "ar" && e.nameAr) || e.displayName;
  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="grid grid-cols-[120px_1fr] gap-2 py-0.5">
      <dt className="text-os-muted">{k}</dt>
      <dd dir="auto">{v ?? "—"}</dd>
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href={d.full ? "/app/assets" : "/app/my-hr?tab=assets"} className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{a.number}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {a.name}
            <Badge tone={assetTone(a.status)} dot>
              {t(`astatus.${a.status}` as "astatus.IN_STOCK")}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{locale === "ar" ? a.category.nameAr : a.category.nameEn}</span>
            {a.serialNumber && <span dir="ltr">{a.serialNumber}</span>}
            {a.assignedEmployee && (
              <span>
                {t("f.holder")}:{" "}
                {d.full ? (
                  <Link href={`/app/hr/employees/${a.assignedEmployee.id}?tab=assets`} className="hover:text-iris-light">
                    {empName(a.assignedEmployee)}
                  </Link>
                ) : (
                  empName(a.assignedEmployee)
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {assign && opts && ["IN_STOCK", "IN_USE"].includes(a.status) && (
            <ActionForm
              action={assignAssetAction}
              args={[id]}
              trigger={t("a.assign")}
              submitLabel={t("a.assign")}
              fields={[
                { name: "employeeId", label: t("f.employee"), type: "select", required: true, options: opts.employees },
                { name: "condition", label: t("f.condition"), required: true, value: t("conditionGood") },
                { name: "notes", label: t("f.notes"), type: "textarea" }
              ]}
            />
          )}
          {assign && active && (
            <ActionForm
              action={returnAssetAction}
              args={[id]}
              trigger={t("a.return")}
              submitLabel={t("a.recordReturn")}
              fields={[
                { name: "assignmentId", label: "", type: "hidden", value: active.id },
                { name: "condition", label: t("f.conditionReturn"), type: "select", required: true, value: "GOOD", options: ["GOOD", "WORN", "DAMAGED"].map((c) => ({ value: c, label: t(`rcond.${c}` as "rcond.GOOD") })) },
                { name: "notes", label: t("f.notes"), type: "textarea" }
              ]}
            />
          )}
          {manage && ASSET_TRANSITIONS[a.status].length > 0 && (
            <ActionForm
              action={assetStatusAction}
              args={[id]}
              trigger={t("a.changeStatus")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              fields={[
                { name: "to", label: t("f.status"), type: "select", required: true, options: ASSET_TRANSITIONS[a.status].map((s) => ({ value: s, label: t(`astatus.${s}` as "astatus.IN_STOCK") })) },
                { name: "reason", label: t("f.reason"), type: "textarea", required: true }
              ]}
            />
          )}
          {manage && opts && (
            <ActionForm
              action={updateAssetAction}
              args={[id]}
              trigger={t("a.edit")}
              triggerClass="os-btn-ghost"
              submitLabel={t("a.save")}
              fields={[
                { name: "name", label: t("f.name"), required: true, value: a.name },
                { name: "categoryId", label: t("f.category"), type: "select", required: true, value: a.categoryId, options: cats.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : c.nameEn })) },
                { name: "serialNumber", label: t("f.serial"), value: a.serialNumber ?? "", dir: "ltr" },
                { name: "manufacturer", label: t("f.manufacturer"), value: a.manufacturer ?? "" },
                { name: "model", label: t("f.model"), value: a.model ?? "" },
                { name: "vendorId", label: t("f.vendor"), type: "select", options: opts.vendors, value: a.vendorId ?? "" },
                { name: "purchaseDate", label: t("f.purchaseDate"), type: "date", value: a.purchaseDate?.toISOString().slice(0, 10) ?? "" },
                { name: "purchaseCost", label: t("f.purchaseCost"), type: "number", value: a.purchaseCost?.toFixed(2) ?? "" },
                { name: "warrantyEndDate", label: t("f.warrantyEnd"), type: "date", value: a.warrantyEndDate?.toISOString().slice(0, 10) ?? "" },
                { name: "location", label: t("f.location"), value: a.location ?? "" },
                { name: "notes", label: t("f.notes"), type: "textarea", value: a.notes ?? "" }
              ]}
            />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid content-start gap-5">
          <SectionCard title={t("details")}>
            <dl className="p-4 text-sm">
              {row(t("f.manufacturer"), a.manufacturer)}
              {row(t("f.model"), a.model)}
              {row(t("f.location"), a.location)}
              {row(t("f.purchaseDate"), a.purchaseDate ? fmtDate(a.purchaseDate, locale) : null)}
              {d.full && row(t("f.purchaseCost"), a.purchaseCost ? <span dir="ltr">{formatMoney(a.purchaseCost.toFixed(2), locale, a.currency ?? "SAR")}</span> : null)}
              {row(t("f.warrantyEnd"), a.warrantyEndDate ? fmtDate(a.warrantyEndDate, locale) : null)}
              {d.full && row(t("f.vendor"), a.vendor ? <Link href={`/app/procurement/vendors/${a.vendor.id}`} className="hover:text-iris-light">{a.vendor.name}</Link> : null)}
              {d.full && row(t("f.order"), a.purchaseOrder ? <Link href={`/app/procurement/orders/${a.purchaseOrder.id}`} className="hover:text-iris-light" dir="ltr">{a.purchaseOrder.number}</Link> : null)}
            </dl>
            {a.notes && <p className="whitespace-pre-line border-t border-os-line p-4 text-xs text-os-muted" dir="auto">{a.notes}</p>}
          </SectionCard>
          {d.full && <DocumentsPanel ctx={ctx} entity={{ type: "ASSET", id }} />}
        </div>
        <div className="grid content-start gap-5">
          <SectionCard title={t("assignmentHistory")}>
            {a.assignments.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noAssignments")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {a.assignments.map((x) => (
                  <li key={x.id} className="grid gap-0.5 px-4 py-2.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{empName(x.employee)}</span>
                      {!x.returnedAt && <Badge tone="info">{t("current")}</Badge>}
                      <span className="flex-1" />
                      <span className="text-[11px] text-os-faint">
                        {fmtDateTime(x.assignedAt, locale)} {locale === "ar" ? "←" : "→"} {x.returnedAt ? fmtDateTime(x.returnedAt, locale) : "…"}
                      </span>
                    </p>
                    <p className="text-[11px] text-os-muted">
                      {t("f.condition")}: {x.conditionAtAssignment}
                      {x.conditionAtReturn ? ` · ${t("f.conditionReturn")}: ${t(`rcond.${x.conditionAtReturn}` as "rcond.GOOD")}` : ""} · {userName(d.people, x.assignedById, locale)}
                    </p>
                    {(x.notes || x.returnNotes) && <p className="text-[11px]" dir="auto">{[x.notes, x.returnNotes].filter(Boolean).join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("historyNote")}</p>
          </SectionCard>
          <SectionCard
            title={t("maintenance")}
            action={
              maint && opts && !["LOST", "RETIRED", "DISPOSED"].includes(a.status) ? (
                <ActionForm
                  action={createMaintenanceAction}
                  args={[id]}
                  trigger={`+ ${t("a.newMaintenance")}`}
                  triggerClass="os-btn-ghost h-7 px-2 text-xs"
                  submitLabel={t("a.create")}
                  note={t("maintenanceNote")}
                  fields={[
                    { name: "type", label: t("f.type"), type: "select", required: true, value: "REPAIR", options: ["PREVENTIVE", "REPAIR", "INSPECTION", "UPGRADE", "OTHER"].map((x) => ({ value: x, label: t(`mtype.${x}` as "mtype.REPAIR") })) },
                    { name: "description", label: t("f.description"), type: "textarea", required: true },
                    { name: "vendorId", label: t("f.vendor"), type: "select", options: opts.vendors },
                    { name: "scheduledDate", label: t("f.scheduledDate"), type: "date" },
                    { name: "cost", label: t("f.cost"), type: "number" }
                  ]}
                />
              ) : undefined
            }
          >
            {a.maintenance.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-os-faint">{t("noMaintenance")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {a.maintenance.map((m) => (
                  <li key={m.id} className="grid gap-1 px-4 py-2.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t(`mtype.${m.type}` as "mtype.REPAIR")}</span>
                      <Badge tone={m.status === "COMPLETED" ? "success" : m.status === "IN_PROGRESS" ? "warning" : m.status === "CANCELLED" ? "neutral" : "info"}>{t(`mstatus.${m.status}` as "mstatus.SCHEDULED")}</Badge>
                      <span className="flex-1" />
                      {m.cost && <span className="text-xs tabular" dir="ltr">{formatMoney(m.cost.toFixed(2), locale, m.currency)}</span>}
                    </p>
                    <p className="text-xs text-os-muted" dir="auto">{m.description}</p>
                    <p className="text-[11px] text-os-faint">
                      {m.vendor?.name ?? ""} {m.scheduledDate ? `· ${t("f.scheduledDate")}: ${fmtDate(m.scheduledDate, locale)}` : ""} {m.completedDate ? `· ${t("f.completedDate")}: ${fmtDate(m.completedDate, locale)}` : ""}
                    </p>
                    {maint && (m.status === "SCHEDULED" || m.status === "IN_PROGRESS") && (
                      <span className="flex flex-wrap gap-1">
                        {m.status === "SCHEDULED" && <RunButton action={startMaintenanceAction} args={[m.id]} label={t("a.start")} className="os-btn-ghost h-7 px-2 text-xs" />}
                        <ActionForm
                          action={completeMaintenanceAction}
                          args={[m.id]}
                          trigger={t("a.complete")}
                          triggerClass="os-btn-ghost h-7 px-2 text-xs"
                          submitLabel={t("a.complete")}
                          fields={[
                            { name: "completedDate", label: t("f.completedDate"), type: "date" },
                            { name: "cost", label: t("f.cost"), type: "number", value: m.cost?.toFixed(2) ?? "" },
                            { name: "result", label: t("f.result"), type: "select", required: true, value: "IN_STOCK", options: [{ value: "IN_STOCK", label: t("astatus.IN_STOCK") }, { value: "DAMAGED", label: t("astatus.DAMAGED") }] }
                          ]}
                        />
                        <RunButton action={cancelMaintenanceAction} args={[m.id]} label={t("a.cancel")} className="os-btn-ghost h-7 px-2 text-xs" confirmText={t("cancelConfirm")} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("noAutoExpense")}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
