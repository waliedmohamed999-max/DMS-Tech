import { getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { listActivity } from "@/server/feed";
import { EmptyState, flatParams, PageHeader, Pagination } from "@/components/os/ui";
import ActivityList from "@/components/os/ActivityList";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  const sp = flatParams(await searchParams);
  const data = await listActivity(ctx, sp);
  const t = await getTranslations("os.activity");
  return (
    <>
      <PageHeader icon="ChartLine" title={t("title")} subtitle={t("subtitle")} />
      <div className="os-card overflow-hidden">
        {data.items.length ? <ActivityList items={data.items} /> : <EmptyState icon="ChartLine" title={t("emptyTitle")} text={t("emptyText")} />}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/app/activity" params={sp} />
      </div>
    </>
  );
}
