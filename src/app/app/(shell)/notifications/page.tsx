import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listNotifications } from "@/server/feed";
import { markReadAction } from "@/lib/os/actions";
import { Badge, EmptyState, flatParams, fmtRelative, PageHeader, Pagination, priorityTone } from "@/components/os/ui";
import { ActionButton } from "@/components/os/client";

export const metadata = { title: "Notifications" };

const CATS = ["APPROVAL", "TASK", "INVOICE", "PROJECT", "CONTRACT", "HR", "SALES", "OPERATIONS", "SUPPORT", "INTEGRATIONS", "MARKETING", "AUTOMATION", "SYSTEM"] as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  const sp = flatParams(await searchParams);
  const data = await listNotifications(ctx, sp);
  const t = await getTranslations("os");
  const locale = await getLocale();
  const link = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { ...sp, page: undefined, ...patch };
    const q = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    return `/app/notifications?${q}`;
  };

  return (
    <>
      <PageHeader
        icon="Inbox"
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        actions={
          data.unread > 0 ? (
            <ActionButton action={markReadAction.bind(null, "all")} className="os-btn-secondary">
              {t("common.markAllRead")}
            </ActionButton>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={link({ filter: undefined })} className={`os-btn h-8 rounded-full px-3 text-xs ${data.filters.filter === "all" ? "bg-os-raised text-os-text" : "text-os-muted hover:text-os-text"}`}>
          {t("notifications.all")}
        </Link>
        <Link href={link({ filter: "unread" })} className={`os-btn h-8 rounded-full px-3 text-xs ${data.filters.filter === "unread" ? "bg-os-raised text-os-text" : "text-os-muted hover:text-os-text"}`}>
          {t("notifications.unread")} <span className="tabular">({data.unread})</span>
        </Link>
        <span className="mx-1 h-5 w-px bg-os-line" />
        {CATS.map((c) => (
          <Link key={c} href={link({ category: data.filters.category === c ? undefined : c })} className={`os-btn h-8 rounded-full px-3 text-xs ${data.filters.category === c ? "bg-iris/15 text-iris-light" : "text-os-muted hover:text-os-text"}`}>
            {t(`notifications.category.${c}`)}
          </Link>
        ))}
      </div>
      <div className="os-card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState icon="Inbox" title={t("notifications.emptyTitle")} text={t("notifications.emptyText")} />
        ) : (
          <ul className="divide-y divide-os-line">
            {data.items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-os-line-strong" : "bg-iris"}`} />
                <div className="min-w-0 flex-1">
                  <Link href={n.href ?? "#"} className={`text-sm hover:text-iris-light ${n.readAt ? "text-os-muted" : "font-medium text-os-text"}`}>
                    {n.title}
                  </Link>
                  {n.body && <p className="mt-0.5 text-xs text-os-muted">{n.body}</p>}
                  <p className="mt-1 flex items-center gap-2 text-xs text-os-faint">
                    <Badge>{t(`notifications.category.${n.category}`)}</Badge>
                    {n.priority !== "MEDIUM" && <Badge tone={priorityTone(n.priority)}>{t(`priority.${n.priority}`)}</Badge>}
                    {fmtRelative(n.createdAt, locale)}
                  </p>
                </div>
                {!n.readAt && (
                  <ActionButton action={markReadAction.bind(null, [n.id])} className="os-btn-ghost h-7 px-2 text-xs">
                    ✓
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/notifications" params={sp} />
      </div>
    </>
  );
}
