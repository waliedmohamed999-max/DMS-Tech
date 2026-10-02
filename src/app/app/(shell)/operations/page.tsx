import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { opsAttention, opsDashboard } from "@/server/ops/insights";
import { sweepOpsIfDue } from "@/server/ops/sweep";
import { classTone } from "@/lib/os/ops-page";
import { Badge, EmptyState, fmtDate, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";

export const metadata = { title: "Operations" };

/** Real counts only — each card is shown when the viewer holds the matching permission. */
export default async function OperationsPage() {
  const { ctx, allowed } = await pageCtx("operations.dashboard.view");
  if (!allowed) return <PermissionDenied permission="operations.dashboard.view" />;
  await sweepOpsIfDue(ctx.organizationId);
  const locale = await getLocale();
  const t = await getTranslations("os.ops");
  const [d, attention] = await Promise.all([opsDashboard(ctx), opsAttention(ctx)]);
  const groups: { title: string; cells: [string, number | null, string, string?][] }[] = [
    { title: t("procurement"), cells: [["pendingRequests", d.pendingRequests, "/app/procurement?status=PENDING_APPROVAL"], ["posAwaiting", d.posAwaiting, "/app/procurement/orders?status=PENDING_APPROVAL"], ["posLate", d.posLate, "/app/procurement/orders?status=late", d.posLate ? "text-danger" : undefined]] },
    { title: t("assets"), cells: [["assigned", d.assigned, "/app/assets?status=ASSIGNED"], ["maintenance", d.maintenance, "/app/assets?status=MAINTENANCE", d.maintenance ? "text-warning" : undefined], ["unreturned", d.unreturned, "/app/assets?status=ASSIGNED", d.unreturned ? "text-danger" : undefined]] },
    { title: t("support"), cells: [["openTickets", d.openTickets, "/app/support?view=open"], ["urgentTickets", d.urgentTickets, "/app/support?view=urgent", d.urgentTickets ? "text-danger" : undefined], ["slaBreaches", d.slaBreaches, "/app/support?view=overdue", d.slaBreaches ? "text-danger" : undefined]] },
    { title: t("knowledgeAndDocs"), cells: [["kbReview", d.kbReview, "/app/knowledge?status=REVIEW", d.kbReview ? "text-warning" : undefined], ["recentDocs", d.recentDocs ? d.recentDocs.length : null, "/app/documents"]] }
  ];
  return (
    <div className="grid gap-5">
      <PageHeader icon="Gauge" title={t("operations")} subtitle={t("operationsSubtitle")} />
      <div className="grid gap-4 md:grid-cols-2">
        {groups
          .map((g) => ({ ...g, cells: g.cells.filter(([, v]) => v !== null) }))
          .filter((g) => g.cells.length)
          .map((g) => (
            <section key={g.title} className="os-card overflow-hidden">
              <h2 className="border-b border-os-line px-4 py-2.5 text-sm font-semibold">{g.title}</h2>
              <div className="grid grid-cols-3 gap-px bg-os-line">
                {g.cells.map(([k, v, href, cls]) => (
                  <Link key={k} href={href} className="bg-os-surface px-4 py-3 transition hover:bg-os-panel">
                    <p className="text-[11.5px] text-os-muted">{t(`k.${k}` as "k.pendingRequests")}</p>
                    <p className={`mt-0.5 text-xl font-semibold tabular ${cls ?? ""}`}>{v}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title={t("needsAttention")}>
          {attention.length === 0 ? (
            <EmptyState icon="CircleCheck" title={t("nothingNeedsAttention")} text="" />
          ) : (
            <ul className="divide-y divide-os-line text-sm">
              {attention.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Badge tone={x.priority === "URGENT" ? "danger" : x.priority === "HIGH" ? "warning" : "info"}>{t(`attn.${x.category}` as "attn.po_overdue")}</Badge>
                  <Link href={x.href} className="min-w-0 flex-1 truncate hover:text-iris-light">
                    {x.title}
                  </Link>
                  {x.dueAt && <span className="text-[11px] text-os-faint">{fmtDate(x.dueAt, locale)}</span>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        {d.recentDocs && (
          <SectionCard title={t("recentDocuments")} action={<Link href="/app/documents" className="text-xs text-os-muted hover:text-os-text">{t("viewAll")}</Link>}>
            {d.recentDocs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-os-faint">{t("noDocuments")}</p>
            ) : (
              <ul className="divide-y divide-os-line text-sm">
                {d.recentDocs.slice(0, 8).map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-4 py-2">
                    <Link href={`/app/documents/${x.id}`} className="min-w-0 flex-1 truncate hover:text-iris-light">
                      {x.title}
                    </Link>
                    <Badge tone={classTone(x.classification)}>{t(`cls.${x.classification}` as "cls.INTERNAL")}</Badge>
                    <span className="text-[11px] text-os-faint">{fmtDate(x.updatedAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
