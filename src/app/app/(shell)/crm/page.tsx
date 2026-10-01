import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { crmAttention, crmOverview } from "@/server/crm/insights";
import { commercialAttention, salesMetrics } from "@/server/commercial/insights";
import { formatMoney } from "@/lib/commercial/calc";
import { can } from "@/server/context";
import { Badge, EmptyState, fmtMoney, fmtNumber, fmtRelative, PageHeader, PermissionDenied, priorityTone, SectionCard } from "@/components/os/ui";
import { BarList, StageColumns } from "@/components/crm/Charts";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "CRM" };

const PERIODS = [7, 30, 90] as const;

function Kpi({ label, value, href, hint, tone }: { label: string; value: React.ReactNode; href?: string; hint?: string; tone?: "danger" }) {
  const body = (
    <div className="os-card flex min-h-[100px] flex-col justify-between p-4 transition hover:border-os-line-strong">
      <span className="text-[13px] text-os-muted">{label}</span>
      <p className={`text-2xl font-semibold leading-none tabular ${tone === "danger" ? "text-danger" : ""}`} dir="ltr">
        {value}
      </p>
      {hint && <span className="text-[11px] text-os-faint">{hint}</span>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function CrmOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ctx, allowed } = await pageCtx("crm.leads.view");
  if (!allowed) return <PermissionDenied permission="crm.leads.view" />;
  const { days: rawDays } = await searchParams;
  const days = PERIODS.find((d) => String(d) === rawDays) ?? 30;
  const locale = await getLocale();
  const t = await getTranslations("os");
  const [o, crmAtt, sales, comAtt] = await Promise.all([crmOverview(ctx, days), crmAttention(ctx, { team: true }), salesMetrics(ctx, days), commercialAttention(ctx, { team: true })]);
  const attention = [...comAtt, ...crmAtt];
  const ts = await getTranslations("os.sales.m");
  const oppsOk = can(ctx, "crm.opportunities.view");
  const stageLabel = (s: { nameAr: string; nameEn: string }) => (locale === "ar" ? s.nameAr : s.nameEn);
  const n = (v: number | null) => (v == null ? "—" : fmtNumber(v, locale));

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="ChartLine"
        title={t("crm.overview.title")}
        subtitle={t("crm.overview.subtitle", { days })}
        actions={
          <div className="flex gap-1">
            {PERIODS.map((d) => (
              <Link key={d} href={`?days=${d}`} className={d === days ? "os-btn-primary h-8 px-3 text-xs" : "os-btn-secondary h-8 px-3 text-xs"}>
                {t("common.days", { n: d })}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t("crm.overview.newLeads")} value={n(o.newLeads)} href="/app/crm/leads" />
        <Kpi label={t("crm.overview.qualified")} value={n(o.qualified)} href="/app/crm/leads?status=QUALIFIED" />
        <Kpi label={t("crm.overview.conversion")} value={`${fmtNumber(o.conversionRate, locale)}%`} hint={t("crm.overview.conversionHint")} />
        <Kpi label={t("crm.overview.overdue")} value={n(o.kpis.overdueFollowUps)} href="/app/crm/follow-ups" tone={o.kpis.overdueFollowUps ? "danger" : undefined} />
        {oppsOk && (
          <>
            <Kpi label={t("crm.overview.openOpps")} value={n(o.kpis.openOpps)} href="/app/crm/opportunities" />
            <Kpi label={t("crm.overview.pipelineValue")} value={fmtMoney(Number(o.kpis.pipelineValue ?? 0), locale)} href="/app/crm/pipeline" />
            <Kpi label={t("crm.overview.won")} value={fmtMoney(Number(o.wonValue), locale)} hint={`${fmtNumber(o.wonCount, locale)} · ${t("common.days", { n: days })}`} />
            <Kpi label={t("crm.leadStatus.LOST")} value={n(o.lost)} href="/app/crm/leads?status=LOST" />
          </>
        )}
      </div>

      {sales && (
        <SectionCard title={ts("title")} action={<Link href="/app/sales/quotations" className="text-xs text-os-muted hover:text-os-text">{ts("open")}</Link>}>
          <div className="grid grid-cols-2 gap-px bg-os-line sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                ["created", sales.created],
                ["approved", sales.approved],
                ["sent", sales.sent],
                ["accepted", sales.accepted]
              ] as const
            ).map(([k, m]) => (
              <div key={k} className="bg-os-surface p-4">
                <p className="text-xs text-os-muted">{ts(k)}</p>
                <p className="mt-1 text-lg font-semibold tabular" dir="ltr">
                  {formatMoney(m.value, locale, sales.currency)}
                </p>
                <p className="text-[11px] text-os-faint">{ts("count", { n: m.count })}</p>
              </div>
            ))}
            <div className="bg-os-surface p-4">
              <p className="text-xs text-os-muted">{ts("acceptance")}</p>
              <p className="mt-1 text-lg font-semibold tabular">{sales.acceptanceRate == null ? "—" : `${sales.acceptanceRate}%`}</p>
              <p className="text-[11px] text-os-faint">{ts("acceptanceHint", { r: sales.clientRejected, e: sales.expired })}</p>
            </div>
            <div className="bg-os-surface p-4">
              <p className="text-xs text-os-muted">{ts("avgDiscount")}</p>
              <p className="mt-1 text-lg font-semibold tabular">{sales.avgDiscount}%</p>
              <p className="text-[11px] text-os-faint">{ts("avgDiscountHint")}</p>
            </div>
          </div>
          <p className="border-t border-os-line px-4 py-2 text-[11px] text-os-faint">{ts("note", { days })}</p>
        </SectionCard>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title={t("crm.overview.bySource")}>
          <BarList rows={o.bySource.map((s) => ({ key: s.source, label: t(`crm.source.${s.source}`), value: s.count }))} locale={locale} empty={t("crm.overview.noData")} />
        </SectionCard>
        {oppsOk && (
          <SectionCard title={t("crm.overview.byStage")} action={<Link href="/app/crm/pipeline" className="text-xs text-os-muted hover:text-os-text">{t("crm.nav.pipeline")}</Link>}>
            <StageColumns rows={o.byStage.map((s) => ({ key: s.key, label: stageLabel(s), count: s.count, value: Number(s.value) }))} locale={locale} empty={t("crm.overview.noData")} />
          </SectionCard>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {oppsOk && (
          <SectionCard title={t("crm.overview.valueByStage")}>
            <BarList money rows={o.byStage.map((s) => ({ key: s.key, label: stageLabel(s), value: Number(s.value) }))} locale={locale} empty={t("crm.overview.noData")} />
          </SectionCard>
        )}
        <SectionCard title={t("home.attention")} action={attention.length ? <Badge tone="warning">{attention.length}</Badge> : undefined}>
          {attention.length === 0 ? (
            <EmptyState icon="CircleCheck" title={t("home.attentionEmpty")} text={t("home.attentionEmptyText")} />
          ) : (
            <ul className="divide-y divide-os-line">
              {attention.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon name={a.category === "lead_followup" ? "Filter" : a.category.startsWith("quote") ? "FileText" : a.category.startsWith("contract") ? "Handshake" : "Target"} size={15} className="shrink-0 text-os-faint" />
                  <Link href={a.href} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:text-iris-light">{a.title}</span>
                    <span className="block text-xs text-os-faint">
                      {t.has(`home.categories.${a.category}`) ? t(`home.categories.${a.category}` as "home.categories.approval") : a.category}
                      {a.owner && ` · ${a.owner}`}
                      {a.dueAt && ` · ${fmtRelative(a.dueAt, locale)}`}
                    </span>
                  </Link>
                  <Badge tone={priorityTone(a.priority)}>{t(`priority.${a.priority}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="text-[11px] text-os-faint">{t("crm.overview.currencyNote")}</p>
    </div>
  );
}
