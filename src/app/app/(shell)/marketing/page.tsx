import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listCampaigns, marketingDashboard } from "@/server/marketing/campaigns";
import { integrationsTickIfDue } from "@/server/integrations/worker";
import { createCampaignAction } from "@/lib/os/integrations-actions";
import { campaignTone } from "@/lib/os/integrations-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, EmptyState, flatParams, PageHeader, PermissionDenied, SectionCard } from "@/components/os/ui";
import { FilterBar } from "@/components/os/client";
import { ActionForm } from "@/components/hr/Forms";

export const metadata = { title: "Marketing" };
const STATUSES = ["DRAFT", "READY", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED", "FAILED"];
const CHANNELS = ["WHATSAPP", "META", "GOOGLE", "LINKEDIN", "TIKTOK", "EMAIL", "OTHER"];

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "marketing.view")) return <PermissionDenied permission="marketing.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  await integrationsTickIfDue(ctx.organizationId);
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const [dash, list] = await Promise.all([marketingDashboard(ctx, { days }), listCampaigns(ctx, { status: STATUSES.includes(sp.status ?? "") ? sp.status : undefined, channel: CHANNELS.includes(sp.channel ?? "") ? sp.channel : undefined, q: sp.q })]);
  const totalLeads = dash.sources.reduce((a, s) => a + s.leads, 0);

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Megaphone"
        title={t("mk.title")}
        subtitle={t("mk.subtitle")}
        actions={
          list.canCreate ? (
            <ActionForm
              action={createCampaignAction}
              trigger={`+ ${t("mk.a.new")}`}
              submitLabel={t("a.save")}
              redirect="/app/marketing/campaigns/:id"
              autoOpen={sp.new === "1"}
              onCloseHref="/app/marketing"
              note={t("mk.newNote")}
              fields={[
                { name: "name", label: t("f.name"), required: true, span: true },
                { name: "channel", label: t("f.channel"), type: "select", required: true, value: "WHATSAPP", options: CHANNELS.map((c) => ({ value: c, label: t(`ch.${c}` as "ch.WHATSAPP") })) },
                { name: "objective", label: t("f.objective") },
                { name: "budget", label: t("f.budget"), type: "number" },
                { name: "currency", label: t("f.currency"), value: "SAR", dir: "ltr" },
                { name: "startDate", label: t("f.startDate"), type: "date" },
                { name: "endDate", label: t("f.endDate"), type: "date" },
                { name: "utmCampaign", label: t("f.utmCampaign"), dir: "ltr", hint: t("utmHint") },
                { name: "utmSource", label: t("f.utmSource"), dir: "ltr" }
              ]}
            />
          ) : undefined
        }
      />
      <nav className="flex flex-wrap gap-1">
        {[7, 30, 90, 365].map((n) => (
          <Link key={n} href={`?days=${n}`} className={`rounded-full border px-3 py-1 text-xs ${days === n ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t("mk.days", { n })}
          </Link>
        ))}
      </nav>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: t("mk.k.running"), v: dash.byStatus.RUNNING ?? 0 },
          { k: t("mk.k.newLeads"), v: totalLeads },
          { k: t("mk.k.inbound"), v: dash.whatsapp.inbound },
          { k: t("mk.k.optOuts"), v: dash.whatsapp.optOuts }
        ].map((x) => (
          <div key={x.k} className="os-card p-4">
            <p className="text-xs text-os-muted">{x.k}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{x.v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <SectionCard title={t("mk.sources")}>
          {dash.sources.length === 0 ? (
            <p className="p-4 text-xs text-os-muted">{t("mk.noLeads")}</p>
          ) : (
            <ul className="grid gap-2 p-4 text-sm">
              {dash.sources.map((s) => (
                <li key={s.source} className="grid gap-1">
                  <span className="flex justify-between"><span dir="ltr">{s.source}</span><span className="tabular">{s.leads}</span></span>
                  <span className="h-1.5 rounded-full bg-os-raised"><span className="block h-full rounded-full bg-iris" style={{ width: `${Math.round((s.leads / Math.max(1, totalLeads)) * 100)}%` }} /></span>
                </li>
              ))}
              <li className="text-[11px] text-os-faint">{t("mk.sourcesNote")}</li>
            </ul>
          )}
        </SectionCard>
        <SectionCard title={t("mk.performance")}>
          {dash.campaigns.length === 0 ? (
            <p className="p-4 text-xs text-os-muted">{t("mk.noActive")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("mk.campaign")}</th>
                    <th className="text-end">{t("mk.m.sent")}</th>
                    <th className="hidden text-end md:table-cell">{t("mk.m.read")}</th>
                    <th className="hidden text-end md:table-cell">{t("mk.m.replied")}</th>
                    {dash.reports && <th className="text-end">{t("mk.m.leads")}</th>}
                    {dash.reports && <th className="hidden text-end lg:table-cell">{t("mk.m.billed")}</th>}
                    {dash.reports && <th className="hidden text-end lg:table-cell">{t("mk.m.collected")}</th>}
                    <th className="hidden text-end xl:table-cell">{t("mk.m.spend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="min-w-[160px]">
                        <Link href={`/app/marketing/campaigns/${c.id}`} className="font-medium hover:text-iris-light">{c.name}</Link>
                        <span className="block text-[11px] text-os-faint"><span dir="ltr">{c.number}</span> · {t(`ch.${c.channel}` as "ch.WHATSAPP")} · {t(`cs.${c.status}` as "cs.DRAFT")}</span>
                      </td>
                      <td className="text-end tabular">{c.channel === "WHATSAPP" ? c.sent : "—"}</td>
                      <td className="hidden text-end tabular md:table-cell">{c.channel === "WHATSAPP" ? c.read : "—"}</td>
                      <td className="hidden text-end tabular md:table-cell">{c.channel === "WHATSAPP" ? c.replied : "—"}</td>
                      {dash.reports && <td className="text-end tabular">{c.leads ?? 0}</td>}
                      {dash.reports && <td className="hidden whitespace-nowrap text-end tabular lg:table-cell" dir="ltr">{formatMoney(c.billed ?? "0", locale, c.currency)}</td>}
                      {dash.reports && <td className="hidden whitespace-nowrap text-end tabular lg:table-cell" dir="ltr">{formatMoney(c.collected ?? "0", locale, c.currency)}</td>}
                      <td className="hidden whitespace-nowrap text-end tabular xl:table-cell" dir="ltr">{Number(c.spendManual) > 0 ? formatMoney(c.spendManual, locale, c.currency) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dash.reports && <p className="px-4 py-2 text-[11px] text-os-faint">{t("mk.attributionNote")}</p>}
            </div>
          )}
        </SectionCard>
      </div>
      {dash.whatsapp.needsMatching > 0 && can(ctx, "whatsapp.view") && (
        <Link href="/app/whatsapp?filter=unmatched" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          {t("mk.needsMatching", { n: dash.whatsapp.needsMatching })}
        </Link>
      )}
      <div className="os-card overflow-hidden">
        <FilterBar
          search={{ placeholder: t("mk.search") }}
          selects={[
            { name: "status", allLabel: `${t("logs.status")}: ${t("all")}`, options: STATUSES.map((s) => ({ value: s, label: t(`cs.${s}` as "cs.DRAFT") })) },
            { name: "channel", allLabel: `${t("f.channel")}: ${t("all")}`, options: CHANNELS.map((c) => ({ value: c, label: t(`ch.${c}` as "ch.WHATSAPP") })) }
          ]}
        />
        {list.rows.length === 0 ? (
          <EmptyState icon="Megaphone" title={t("mk.empty")} text={t("mk.emptyText")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("mk.campaign")}</th><th className="hidden md:table-cell">{t("f.channel")}</th><th className="hidden text-end md:table-cell">{t("mk.recipients")}</th><th>{t("logs.status")}</th></tr></thead>
              <tbody>
                {list.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="min-w-[200px]">
                      <Link href={`/app/marketing/campaigns/${c.id}`} className="font-medium hover:text-iris-light">{c.name}</Link>
                      <span className="block text-[11px] text-os-faint"><span dir="ltr">{c.number}</span>{c.utmCampaign && <> · <span dir="ltr">utm={c.utmCampaign}</span></>}</span>
                    </td>
                    <td className="hidden text-xs md:table-cell">{t(`ch.${c.channel}` as "ch.WHATSAPP")}</td>
                    <td className="hidden text-end tabular md:table-cell">{c.channel === "WHATSAPP" ? (c.recipientCount || c.audience?.eligibleCount || 0) : "—"}</td>
                    <td><Badge tone={campaignTone(c.status)}>{t(`cs.${c.status}` as "cs.DRAFT")}</Badge>{c.approvalId && c.status === "DRAFT" && <span className="ms-1 text-[10px] text-warning">{t("mk.awaitingApproval")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
