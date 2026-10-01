import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { pipelineBoard } from "@/server/crm/opportunities";
import { can } from "@/server/context";
import { personName } from "@/lib/os/crm-page";
import { PageHeader, PermissionDenied } from "@/components/os/ui";
import PipelineBoard from "@/components/crm/PipelineBoard";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const { ctx, allowed } = await pageCtx("crm.pipeline.view");
  if (!allowed) return <PermissionDenied permission="crm.pipeline.view" />;
  if (!can(ctx, "crm.opportunities.view")) return <PermissionDenied permission="crm.opportunities.view" />;
  const { owner } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("os.crm");
  const board = await pipelineBoard(ctx, undefined, { owner: owner === "me" ? "me" : undefined });

  return (
    <>
      <PageHeader
        icon="Columns"
        title={t("pipeline.title")}
        subtitle={t("pipeline.subtitle")}
        actions={
          <Link href={owner === "me" ? "/app/crm/pipeline" : "/app/crm/pipeline?owner=me"} className={owner === "me" ? "os-btn-primary" : "os-btn-secondary"}>
            {t("pipeline.mine")}
          </Link>
        }
      />
      <p className="mb-3 text-xs text-os-faint">{t("pipeline.wonLostNote")}</p>
      <PipelineBoard
        canMove={can(ctx, "crm.opportunities.move_stage")}
        canWin={can(ctx, "crm.opportunities.mark_won")}
        canLose={can(ctx, "crm.opportunities.mark_lost")}
        stages={board.stages.map((s) => ({
          id: s.id,
          key: s.key,
          name: locale === "ar" ? s.nameAr : s.nameEn,
          colorToken: s.colorToken,
          isWonStage: s.isWonStage,
          isLostStage: s.isLostStage,
          count: s.count,
          total: s.total,
          items: s.items.map((o) => ({
            id: o.id,
            number: o.number,
            title: o.title,
            estimatedValue: o.estimatedValue,
            currency: o.currency,
            status: o.status,
            expectedCloseDate: o.expectedCloseDate?.toISOString() ?? null,
            nextFollowUpAt: o.nextFollowUpAt?.toISOString() ?? null,
            client: o.client.displayName,
            owner: personName(o.owner, locale)
          }))
        }))}
      />
    </>
  );
}
