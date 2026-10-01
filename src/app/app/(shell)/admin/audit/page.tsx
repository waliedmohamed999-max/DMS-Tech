import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listAudit } from "@/server/feed";
import { EmptyState, flatParams, fmtDateTime, PageHeader, Pagination, PermissionDenied } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";

export const metadata = { title: "Audit log" };

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-os-faint">—</span>;
  return (
    <pre dir="ltr" className="max-h-64 overflow-auto rounded-md border border-os-line bg-os-panel p-2 font-mono text-[11px] leading-5 text-os-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allowed } = await pageCtx("admin.audit.view");
  if (!allowed) return <PermissionDenied permission="admin.audit.view" />;
  const sp = flatParams(await searchParams);
  const data = await listAudit(ctx, sp);
  const t = await getTranslations("os");
  const locale = await getLocale();

  return (
    <>
      <PageHeader icon="FileSearch" title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ name: "action", placeholder: t("audit.actionPh") }}
          selects={[{ name: "entity", allLabel: t("audit.anyEntity"), options: data.entityTypes.map((e) => ({ value: e, label: e })) }]}
        />
        {data.items.length === 0 ? (
          <EmptyState icon="FileSearch" title={t("audit.emptyTitle")} text={t("audit.emptyText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {data.items.map((a) => (
              <li key={a.id}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-os-raised md:grid-cols-[220px_1fr_160px_auto]">
                    <code className="truncate font-mono text-xs text-os-text" dir="ltr">
                      {a.action}
                    </code>
                    <span className="hidden truncate text-xs text-os-muted md:block">
                      {a.entityType}
                      {a.entityId ? <span dir="ltr"> · {a.entityId.slice(0, 12)}</span> : null}
                    </span>
                    <span className="hidden truncate text-xs text-os-muted md:block">{a.actor?.name ?? "—"}</span>
                    <time className="text-xs text-os-faint">{fmtDateTime(a.createdAt, locale)}</time>
                  </summary>
                  <div className="grid gap-3 border-t border-os-line bg-os-panel/40 px-4 py-3 text-xs md:grid-cols-2">
                    <div>
                      <p className="os-label">{t("audit.before")}</p>
                      <Json value={a.before} />
                    </div>
                    <div>
                      <p className="os-label">{t("audit.after")}</p>
                      <Json value={a.after} />
                    </div>
                    <p className="text-os-faint md:col-span-2" dir="ltr">
                      {t("audit.ip")}: {a.ip ?? "—"} · {a.userAgent?.slice(0, 90) ?? "—"}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/admin/audit" params={sp} />
      </div>
    </>
  );
}
