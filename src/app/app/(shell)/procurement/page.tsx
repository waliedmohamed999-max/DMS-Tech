import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { can, canAny } from "@/server/context";
import { listRequests } from "@/server/ops/procurement";
import { opsOptions, requestTone, userName } from "@/lib/os/ops-page";
import { createRequestAction } from "@/lib/os/ops-actions";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, fmtDate, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { LinesForm } from "@/components/ops/OpsForms";

export const metadata = { title: "Purchase requests" };
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ORDERING", "ORDERED", "RECEIVED", "CANCELLED"];

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "procurement.requests.view", "procurement.requests.create", "procurement.requests.approve")) return <PermissionDenied permission="procurement.requests.create" />;
  const sp = flatParams(await searchParams);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [data, opts, org] = await Promise.all([listRequests(ctx, sp), opsOptions(ctx, locale, { vendors: true, projects: true, departments: true }), prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { currency: true } })]);
  const all = canAny(ctx, "procurement.requests.view", "procurement.requests.approve", "procurement.requests.approve_executive");
  return (
    <div className="grid gap-5">
      <PageHeader
        icon="ClipboardList"
        title={t("requests")}
        subtitle={t("requestsSubtitle")}
        actions={
          can(ctx, "procurement.requests.create") ? (
            <LinesForm
              action={createRequestAction}
              kind="request"
              currency={org.currency}
              trigger={`+ ${t("a.newRequest")}`}
              submitLabel={t("a.saveDraft")}
              submitAndSendLabel={t("a.saveSubmit")}
              redirect="/app/procurement/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/procurement"
              header={[
                { name: "title", label: t("f.title"), required: true, span: true },
                { name: "businessJustification", label: t("f.justification"), type: "textarea", required: true },
                { name: "departmentId", label: t("f.department"), type: "select", options: opts.departments },
                { name: "projectId", label: t("f.project"), type: "select", options: opts.projects },
                { name: "category", label: t("f.category"), hint: t("categoryHint") },
                { name: "priority", label: t("f.priority"), type: "select", value: "MEDIUM", options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`prio.${p}` as "prio.LOW") })) },
                { name: "neededByDate", label: t("f.neededBy"), type: "date" },
                { name: "preferredVendorId", label: t("f.preferredVendor"), type: "select", options: opts.vendors }
              ]}
            />
          ) : undefined
        }
      />
      {all && (
        <nav className="flex gap-1">
          {(["", "mine"] as const).map((s) => (
            <Link key={s || "all"} href={s ? "?scope=mine" : "?"} className={`rounded-full border px-3 py-1 text-xs ${(sp.scope ?? "") === s ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
              {s ? t("scope.mine") : t("scope.all")}
            </Link>
          ))}
        </nav>
      )}
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("searchRequests") }} selects={[{ name: "status", allLabel: `${t("f.status")}: ${t("all")}`, options: [{ value: "open", label: t("openOnly") }, ...STATUSES.map((s) => ({ value: s, label: t(`rstatus.${s}` as "rstatus.DRAFT") }))] }]} />
        {data.items.length === 0 ? (
          <EmptyState icon="ClipboardList" title={t("noRequests")} text={t("noRequestsText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t("f.request")}</th>
                  <th className="hidden md:table-cell">{t("f.requester")}</th>
                  <th className="hidden lg:table-cell">{t("f.project")}</th>
                  <th className="text-end">{t("f.estimated")}</th>
                  <th>{t("f.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/procurement/${r.id}`} className="font-medium hover:text-iris-light">
                        {r.title}
                      </Link>
                      <span className="block text-[11px] text-os-faint">
                        <span dir="ltr">{r.number}</span> · {fmtDate(r.requestedDate, locale)} · {t("itemsN", { n: r._count.items })}
                      </span>
                    </td>
                    <td className="hidden text-xs text-os-muted md:table-cell">{userName(data.people, r.requesterId, locale) ?? "—"}</td>
                    <td className="hidden text-xs text-os-muted lg:table-cell">{r.project ? `${r.project.number} · ${r.project.name}` : "—"}</td>
                    <td className="whitespace-nowrap text-end tabular" dir="ltr">{formatMoney(r.estimatedAmount.toFixed(2), locale, r.currency)}</td>
                    <td>
                      <Badge tone={requestTone(r.status)}>{t(`rstatus.${r.status}` as "rstatus.DRAFT")}</Badge>
                      {r.priority === "URGENT" || r.priority === "HIGH" ? <span className="ms-1 text-[10px] text-warning">{t(`prio.${r.priority}` as "prio.LOW")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/procurement" params={sp} />
      </div>
    </div>
  );
}
