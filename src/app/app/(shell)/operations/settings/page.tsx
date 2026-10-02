import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can, canAny } from "@/server/context";
import { listRules } from "@/server/ops/procurement";
import { listAssetCategories } from "@/server/ops/assets";
import { listSlaPolicies } from "@/server/ops/support";
import { opsOptions } from "@/lib/os/ops-page";
import { saveAssetCategoryAction, saveRuleAction, saveSlaAction } from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Operations settings" };
const APPROVERS = ["LINE_MANAGER", "PROJECT_MANAGER", "PROCUREMENT", "EXECUTIVE"];

/** Company configuration — every default is editable; nothing contractual or statutory is hard-coded. */
export default async function OpsSettingsPage() {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "operations.settings.manage", "support.sla.manage")) return <PermissionDenied permission="operations.settings.manage" />;
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const settings = can(ctx, "operations.settings.manage");
  const [rules, cats, sla, opts] = await Promise.all([settings ? listRules(ctx.organizationId) : [], settings ? listAssetCategories(ctx.organizationId, true) : [], listSlaPolicies(ctx.organizationId), opsOptions(ctx, locale, { departments: true })]);
  const m = (v: { toFixed(n: number): string } | null) => (v === null ? "∞" : formatMoney(v.toFixed(2), locale, "SAR"));
  const ruleFields = (r?: (typeof rules)[number]) => [
    { name: "id", label: "", type: "hidden" as const, value: r?.id ?? "" },
    { name: "name", label: t("f.name"), required: true, value: r?.name ?? "" },
    { name: "sortOrder", label: t("f.order"), type: "number" as const, required: true, value: String(r?.sortOrder ?? 50), hint: t("orderHint") },
    { name: "minAmount", label: t("f.minAmount"), type: "number" as const, required: true, value: r?.minAmount.toFixed(2) ?? "0" },
    { name: "maxAmount", label: t("f.maxAmount"), type: "number" as const, value: r?.maxAmount?.toFixed(2) ?? "", hint: t("maxHint") },
    { name: "departmentId", label: t("f.department"), type: "select" as const, options: opts.departments, value: r?.departmentId ?? "" },
    { name: "forProject", label: t("f.forProject"), type: "select" as const, value: r?.forProject === null || r?.forProject === undefined ? "" : String(r.forProject), options: [{ value: "true", label: t("projectOnly") }, { value: "false", label: t("nonProjectOnly") }] },
    { name: "category", label: t("f.category"), value: r?.category ?? "" },
    { name: "approver", label: t("f.approver"), type: "select" as const, required: true, value: r?.approver ?? "PROCUREMENT", options: APPROVERS.map((a) => ({ value: a, label: t(`approver.${a}` as "approver.PROCUREMENT") })) },
    { name: "active", label: t("f.active"), type: "checkbox" as const, value: r?.active ?? true }
  ];
  const slaFields = (p?: (typeof sla)[number]) => [
    { name: "id", label: "", type: "hidden" as const, value: p?.id ?? "" },
    { name: "name", label: t("f.name"), required: true, value: p?.name ?? "" },
    { name: "priority", label: t("f.priority"), type: "select" as const, required: true, value: p?.priority ?? "MEDIUM", options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((x) => ({ value: x, label: t(`prio.${x}` as "prio.LOW") })) },
    { name: "firstResponseMinutes", label: t("f.responseMinutes"), type: "number" as const, required: true, value: String(p?.firstResponseMinutes ?? 240) },
    { name: "resolutionMinutes", label: t("f.resolutionMinutes"), type: "number" as const, required: true, value: String(p?.resolutionMinutes ?? 1440) },
    { name: "warnAtPercent", label: t("f.warnAt"), type: "number" as const, required: true, value: String(p?.warnAtPercent ?? 80) },
    { name: "pauseOnWaitingClient", label: t("f.pauseOnWaiting"), type: "checkbox" as const, value: p?.pauseOnWaitingClient ?? false },
    { name: "active", label: t("f.active"), type: "checkbox" as const, value: p?.active ?? true }
  ];
  return (
    <div className="grid gap-5">
      <PageHeader icon="SlidersHorizontal" title={t("settings")} subtitle={t("settingsSubtitle")} />
      {settings && (
        <SectionCard title={t("approvalRules")} action={<ActionForm action={saveRuleAction} trigger={`+ ${t("a.newRule")}`} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("a.save")} fields={ruleFields()} />}>
          <ul className="divide-y divide-os-line text-sm">
            {rules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${r.active ? "" : "opacity-50"}`}>
                <span className="w-8 text-[11px] text-os-faint tabular">{r.sortOrder}</span>
                <span className="min-w-0 flex-1">
                  {r.name}
                  <span className="block text-[11px] text-os-muted" dir="ltr">
                    {m(r.minAmount)} – {m(r.maxAmount)}
                    {r.forProject === true ? ` · ${t("projectOnly")}` : r.forProject === false ? ` · ${t("nonProjectOnly")}` : ""}
                    {r.category ? ` · ${r.category}` : ""}
                  </span>
                </span>
                <Badge tone={r.approver === "EXECUTIVE" ? "danger" : r.approver === "PROCUREMENT" ? "warning" : "info"}>{t(`approver.${r.approver}` as "approver.PROCUREMENT")}</Badge>
                <ActionForm action={saveRuleAction} trigger={t("a.edit")} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("a.save")} fields={ruleFields(r)} />
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("rulesNote")}</p>
        </SectionCard>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={t("slaPolicies")} action={can(ctx, "support.sla.manage") ? <ActionForm action={saveSlaAction} trigger={`+ ${t("a.newPolicy")}`} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("a.save")} fields={slaFields()} /> : undefined}>
          <ul className="divide-y divide-os-line text-sm">
            {sla.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${p.active ? "" : "opacity-50"}`}>
                <Badge tone={p.priority === "URGENT" ? "danger" : p.priority === "HIGH" ? "warning" : "info"}>{t(`prio.${p.priority}` as "prio.LOW")}</Badge>
                <span className="min-w-0 flex-1">
                  {p.name}
                  <span className="block text-[11px] text-os-muted">{t("slaWindow", { r: p.firstResponseMinutes, s: p.resolutionMinutes })} · {t("warnAtN", { n: p.warnAtPercent })}{p.pauseOnWaitingClient ? ` · ${t("pausesOnWaiting")}` : ""}</span>
                </span>
                {can(ctx, "support.sla.manage") && <ActionForm action={saveSlaAction} trigger={t("a.edit")} triggerClass="os-btn-ghost h-7 px-2 text-xs" submitLabel={t("a.save")} fields={slaFields(p)} />}
              </li>
            ))}
          </ul>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{t("slaNote")}</p>
        </SectionCard>
        {settings && (
          <SectionCard
            title={t("assetCategories")}
            action={
              <ActionForm
                action={saveAssetCategoryAction}
                trigger={`+ ${t("a.newCategory")}`}
                triggerClass="os-btn-ghost h-7 px-2 text-xs"
                submitLabel={t("a.save")}
                fields={[
                  { name: "nameAr", label: t("f.nameAr"), required: true, dir: "rtl" },
                  { name: "nameEn", label: t("f.nameEn"), required: true, dir: "ltr" },
                  { name: "warrantyAlertDays", label: t("f.warrantyAlert"), type: "number", value: "30" }
                ]}
              />
            }
          >
            <ul className="divide-y divide-os-line text-sm">
              {cats.map((c) => (
                <li key={c.id} className={`flex items-center gap-2 px-4 py-2 ${c.active ? "" : "opacity-50"}`}>
                  <span className="flex-1">{locale === "ar" ? c.nameAr : c.nameEn}</span>
                  <span className="text-[11px] text-os-faint">{t("warrantyAlertN", { n: c.warrantyAlertDays })}</span>
                  <ActionForm
                    action={saveAssetCategoryAction}
                    trigger={t("a.edit")}
                    triggerClass="os-btn-ghost h-7 px-2 text-xs"
                    submitLabel={t("a.save")}
                    fields={[
                      { name: "id", label: "", type: "hidden", value: c.id },
                      { name: "nameAr", label: t("f.nameAr"), required: true, dir: "rtl", value: c.nameAr },
                      { name: "nameEn", label: t("f.nameEn"), required: true, dir: "ltr", value: c.nameEn },
                      { name: "warrantyAlertDays", label: t("f.warrantyAlert"), type: "number", value: String(c.warrantyAlertDays) },
                      { name: "active", label: t("f.active"), type: "checkbox", value: c.active }
                    ]}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
