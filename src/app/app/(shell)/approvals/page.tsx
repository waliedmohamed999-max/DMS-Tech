import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listApprovals } from "@/server/approvals/service";
import { can } from "@/server/context";
import { cancelApprovalAction } from "@/lib/os/actions";
import { Badge, EmptyState, flatParams, fmtDateTime, fmtRelative, PageHeader, Pagination, PermissionDenied, priorityTone, statusTone } from "@/components/os/ui";
import ApprovalControls from "@/components/os/ApprovalControls";
import { ActionButton, FilterBar } from "@/components/os/client";
import { prisma } from "@/server/db";
import { formatMoney } from "@/lib/commercial/calc";

export const metadata = { title: "Approvals" };

const VIEWS = ["mine", "pending", "approved", "rejected", "requested"] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("approvals.view");
  if (!allowed) return <PermissionDenied permission="approvals.view" />;
  const sp = flatParams(await searchParams);
  const decider = can(ctx, "approvals.decide");
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? sp.view! : decider ? "mine" : "requested";
  const data = await listApprovals(ctx, { ...sp, view });
  const t = await getTranslations("os");
  const locale = await getLocale();
  const tabs = decider ? VIEWS : (["requested", "pending", "approved", "rejected"] as const);
  const ts = await getTranslations("os.sales");
  // quotation approvals carry a snapshot of exactly what was submitted (version + totals + reasons)
  type QSnap = { quotationId: string; number: string; versionNumber: number; clientName: string; opportunityNumber: string | null; ownerId: string | null; currency: string; subtotal: string; discountTotal: string; discountPercent: string; taxTotal: string; total: string; vatRate: string; reasons: { code: string; value?: string; limit?: string }[] };
  const ownerIds = data.items.filter((a) => a.type === "QUOTATION").map((a) => (a.payload as QSnap).ownerId).filter(Boolean) as string[];
  const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, nameAr: true } }) : [];

  return (
    <>
      <PageHeader icon="BadgeCheck" title={t("approvals.title")} subtitle={t("approvals.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-os-line">
        {tabs.map((v) => (
          <Link
            key={v}
            href={`/app/approvals?view=${v}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${view === v ? "border-iris text-os-text" : "border-transparent text-os-muted hover:text-os-text"}`}
          >
            {t(`approvals.tabs.${v}`)}
          </Link>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        <FilterBar search={{ placeholder: t("common.search") }} />
        {data.items.length === 0 ? (
          <EmptyState icon="BadgeCheck" title={t("approvals.emptyTitle")} text={t("approvals.emptyText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {data.items.map((a) => (
              <li key={a.id} id={a.id} className={`grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center ${sp.focus === a.id ? "bg-iris/5" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <Badge tone={statusTone(a.status)} dot>
                      {t(`approvals.status.${a.status}`)}
                    </Badge>
                    <Badge tone={priorityTone(a.priority)}>{t(`priority.${a.priority}`)}</Badge>
                  </div>
                  {a.type === "QUOTATION" ? (
                    (() => {
                      const p = a.payload as QSnap;
                      const o = owners.find((u) => u.id === p.ownerId);
                      const m = (v: string) => formatMoney(v, locale, p.currency);
                      return (
                        <div className="mt-2 grid gap-2 rounded-lg border border-os-line bg-os-panel p-3 text-xs">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                            <span className="text-os-muted">{ts("ap.quotation")}</span>
                            <span className="font-medium" dir="ltr">
                              {p.number} V{p.versionNumber}
                            </span>
                            <span className="text-os-muted">{ts("ap.client")}</span>
                            <span>{p.clientName}</span>
                            <span className="text-os-muted">{ts("ap.opportunity")}</span>
                            <span dir="ltr">{p.opportunityNumber ?? "—"}</span>
                            <span className="text-os-muted">{ts("ap.owner")}</span>
                            <span>{o ? (locale === "ar" && o.nameAr) || o.name : "—"}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-os-line pt-2 sm:grid-cols-4">
                            <span className="text-os-muted">{ts("q.subtotal")}</span>
                            <span className="tabular" dir="ltr">{m(p.subtotal)}</span>
                            <span className="text-os-muted">{ts("q.discount")}</span>
                            <span className="tabular" dir="ltr">
                              −{m(p.discountTotal)} ({p.discountPercent}%)
                            </span>
                            <span className="text-os-muted">{ts("q.vat", { r: p.vatRate })}</span>
                            <span className="tabular" dir="ltr">{m(p.taxTotal)}</span>
                            <span className="font-semibold">{ts("q.total")}</span>
                            <span className="font-semibold tabular" dir="ltr">
                              {m(p.total)}
                            </span>
                          </div>
                          <p className="border-t border-os-line pt-2 text-warning">
                            {ts("ap.why")}: {p.reasons.map((r) => `${ts(`reasons.${r.code}` as "reasons.TOTAL_ABOVE_THRESHOLD")}${r.value && r.limit ? ` (${r.value} > ${r.limit})` : ""}`).join(" · ")}
                          </p>
                          <Link href={`/app/sales/quotations/${p.quotationId}?v=${p.versionNumber}`} className="w-fit text-iris-light hover:underline">
                            {ts("ap.open")} →
                          </Link>
                        </div>
                      );
                    })()
                  ) : (
                    a.summary && <p className="mt-1 text-sm text-os-muted">{a.summary}</p>
                  )}
                  <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-os-faint">
                    <span>{t.has(`approvals.type.${a.type}`) ? t(`approvals.type.${a.type}` as "approvals.type.ROLE_GRANT") : a.type}</span>
                    <span>
                      {t("approvals.requestedBy")}: {a.requestedBy.name}
                    </span>
                    <span title={fmtDateTime(a.createdAt, locale)}>{fmtRelative(a.createdAt, locale)}</span>
                    {a.decidedBy && (
                      <span>
                        {t("approvals.decidedBy")}: {a.decidedBy.name} · {a.decidedAt ? fmtDateTime(a.decidedAt, locale) : ""}
                      </span>
                    )}
                  </p>
                  {a.decisionComment && <p className="mt-2 rounded-md border border-os-line bg-os-panel px-3 py-2 text-xs text-os-muted">{a.decisionComment}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {a.status === "PENDING" && a.requestedById !== ctx.userId && decider && ctx.permissions.has(a.requiredPermission as never) && <ApprovalControls approvalId={a.id} />}
                  {a.status === "PENDING" && a.requestedById === ctx.userId && (
                    <ActionButton action={cancelApprovalAction.bind(null, a.id)} className="os-btn-ghost h-8 text-xs">
                      {t("approvals.cancel")}
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/approvals" params={{ ...sp, view }} />
      </div>
    </>
  );
}
