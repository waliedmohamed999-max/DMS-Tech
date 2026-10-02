import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { prisma } from "@/server/db";
import { isAppError } from "@/server/errors";
import { getCampaign, previewAudience, type AudienceFilter } from "@/server/marketing/campaigns";
import { LEAD_SOURCES } from "@/lib/crm/services";
import { audienceAction, cancelCampaignAction, completeCampaignAction, pauseCampaignAction, resumeCampaignAction, spendAction, startCampaignAction, submitCampaignAction, updateCampaignAction } from "@/lib/os/integrations-actions";
import { campaignTone, integrationTone, recipientTone } from "@/lib/os/integrations-page";
import { formatMoney } from "@/lib/commercial/calc";
import { Badge, fmtDate, fmtDateTime, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "Campaign" };
const R_STATUSES = ["PENDING", "QUEUED", "SENT", "DELIVERED", "READ", "REPLIED", "FAILED", "SKIPPED"] as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  const t = await getTranslations("os.integrations");
  const tc = await getTranslations("os.crm");
  const locale = await getLocale();
  let d;
  try {
    d = await getCampaign(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const c = d.campaign;
  const wa = c.channel === "WHATSAPP";
  const editable = d.canEdit && (c.status === "DRAFT" || c.status === "READY");
  const filter = (c.audience?.filter ?? null) as AudienceFilter | null;
  const [preview, services, stages] = await Promise.all([
    wa && filter && editable ? previewAudience(ctx, id, filter) : Promise.resolve(null),
    editable ? prisma.service.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }) : Promise.resolve([]),
    editable ? prisma.pipelineStage.findMany({ where: { pipeline: { organizationId: ctx.organizationId } }, orderBy: { position: "asc" }, select: { id: true, nameEn: true, nameAr: true } }) : Promise.resolve([])
  ]);
  const pendingApproval = d.approval?.status === "PENDING";
  const total = Object.values(d.counts).reduce((a, n) => a + n, 0);
  const n = (...s: string[]) => s.reduce((a, k) => a + (d.counts[k] ?? 0), 0);
  const sent = n("SENT", "DELIVERED", "READ", "REPLIED");
  const pct = (x: number, of: number) => (of ? `${Math.round((x / of) * 100)}%` : "—");
  const params2 = ((c.templateParams ?? []) as string[]).join(" | ");
  const L = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr) || x.nameEn;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/marketing" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint" dir="ltr">{c.number} · v{c.version}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {c.name}
            <Badge tone={campaignTone(c.status)} dot>{t(`cs.${c.status}` as "cs.DRAFT")}</Badge>
            {pendingApproval && <Badge tone="warning">{t("mk.awaitingApproval")}</Badge>}
            {d.approvalStale && <Badge tone="danger">{t("mk.approvalStale")}</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-os-muted">
            <span>{t(`ch.${c.channel}` as "ch.WHATSAPP")}</span>
            {c.utmCampaign && <span dir="ltr">utm_campaign={c.utmCampaign}</span>}
            {c.startDate && <span>{fmtDate(c.startDate, locale)}{c.endDate ? ` → ${fmtDate(c.endDate, locale)}` : ""}</span>}
            {c.budget && <span dir="ltr">{formatMoney(c.budget.toFixed(2), locale, c.currency)}</span>}
            {wa && <span className="inline-flex items-center gap-1">WhatsApp <Badge tone={integrationTone(d.connectionStatus)}>{t(`st.${d.connectionStatus}` as "st.NOT_CONFIGURED")}</Badge></span>}
          </p>
        </div>
        {d.canEdit && (
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
            {editable && (
              <ActionForm
                action={updateCampaignAction}
                args={[id]}
                trigger={t("a.edit")}
                triggerClass="os-btn-ghost"
                submitLabel={t("a.save")}
                note={c.approvedVersion || pendingApproval ? t("mk.editResetsApproval") : undefined}
                fields={[
                  { name: "name", label: t("f.name"), required: true, value: c.name, span: true },
                  { name: "objective", label: t("f.objective"), value: c.objective ?? "" },
                  { name: "budget", label: t("f.budget"), type: "number", value: c.budget?.toFixed(2) ?? "" },
                  { name: "utmCampaign", label: t("f.utmCampaign"), value: c.utmCampaign ?? "", dir: "ltr" },
                  { name: "utmSource", label: t("f.utmSource"), value: c.utmSource ?? "", dir: "ltr" },
                  { name: "externalCampaignId", label: t("f.externalId"), value: c.externalCampaignId ?? "", dir: "ltr" },
                  ...(wa
                    ? [
                        { name: "templateId", label: t("f.template"), type: "select" as const, value: c.templateId ?? "", options: d.templates.map((x) => ({ value: x.id, label: `${x.name} · ${x.language} · ${t(`tpl.${x.status}` as "tpl.APPROVED")}` })), hint: d.templates.length ? undefined : t("wa.noTemplatesText") },
                        { name: "templateParams", label: t("f.params"), value: params2, dir: "ltr" as const, hint: t("paramsHint") },
                        { name: "sendRatePerMinute", label: t("f.rate"), type: "number" as const, value: String(c.sendRatePerMinute) },
                        { name: "requireOptIn", label: t("f.requireOptIn"), type: "checkbox" as const, value: c.requireOptIn }
                      ]
                    : [])
                ]}
              />
            )}
            {editable && wa && (
              <ActionForm
                action={audienceAction}
                args={[id]}
                trigger={t("mk.a.audience")}
                triggerClass="os-btn-ghost"
                submitLabel={t("a.save")}
                note={t("mk.audienceNote")}
                fields={[
                  { name: "kind", label: t("mk.aud.kind"), type: "select", required: true, value: filter?.kind ?? "leads", options: ["leads", "clients"].map((k) => ({ value: k, label: t(`mk.aud.${k}` as "mk.aud.leads") })) },
                  { name: "city", label: t("f.city"), value: filter?.city ?? "" },
                  { name: "leadSources", label: t("mk.aud.sources"), type: "multiselect", value: filter?.leadSources ?? [], options: LEAD_SOURCES.map((s) => ({ value: s, label: tc(`source.${s}` as "source.WEBSITE") })) },
                  { name: "leadStatuses", label: t("mk.aud.leadStatuses"), type: "multiselect", value: filter?.leadStatuses ?? [], options: ["OPEN", "QUALIFIED", "CONVERTED", "LOST"].map((s) => ({ value: s, label: t(`mk.ls.${s}` as "mk.ls.OPEN") })) },
                  { name: "clientStatuses", label: t("mk.aud.clientStatuses"), type: "multiselect", value: filter?.clientStatuses ?? [], options: ["PROSPECT", "ACTIVE", "INACTIVE"].map((s) => ({ value: s, label: t(`mk.cls.${s}` as "mk.cls.ACTIVE") })) },
                  { name: "serviceId", label: t("mk.aud.service"), type: "select", value: filter?.serviceId ?? "", options: services.map((s) => ({ value: s.id, label: L(s) })) },
                  { name: "stageId", label: t("mk.aud.stage"), type: "select", value: filter?.stageId ?? "", options: stages.map((s) => ({ value: s.id, label: L(s) })) }
                ]}
              />
            )}
            {c.status === "DRAFT" && !pendingApproval && <RunButton action={submitCampaignAction} args={[id]} label={wa ? t("mk.a.submit") : t("mk.a.ready")} className="os-btn-secondary" />}
            {c.status === "READY" && !d.approvalStale && <RunButton action={startCampaignAction} args={[id]} label={t("mk.a.start")} className="os-btn-primary" confirmText={wa ? t("mk.startConfirm") : undefined} />}
            {c.status === "RUNNING" && <RunButton action={pauseCampaignAction} args={[id]} label={t("mk.a.pause")} className="os-btn-secondary" />}
            {c.status === "PAUSED" && <RunButton action={resumeCampaignAction} args={[id]} label={t("mk.a.resume")} className="os-btn-secondary" />}
            {(c.status === "RUNNING" || c.status === "PAUSED") && !wa && <RunButton action={completeCampaignAction} args={[id]} label={t("mk.a.complete")} className="os-btn-ghost" />}
            {["DRAFT", "READY", "RUNNING", "PAUSED"].includes(c.status) && <RunButton action={cancelCampaignAction} args={[id]} label={t("mk.a.cancel")} className="os-btn-ghost text-danger" confirmText={t("mk.cancelConfirm")} />}
          </div>
        )}
      </div>

      {wa && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("mk.audience")}>
            <div className="grid gap-2 p-4 text-sm">
              {!filter ? (
                <p className="text-xs text-os-muted">{t("mk.noAudience")}</p>
              ) : (
                <>
                  <p className="text-xs text-os-muted">
                    {t(`mk.aud.${filter.kind}` as "mk.aud.leads")}
                    {filter.city ? ` · ${filter.city}` : ""}
                    {filter.leadSources.length ? ` · ${filter.leadSources.join(", ")}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <span>{t("mk.estimated")}: <b className="tabular">{preview?.estimated ?? c.audience?.estimatedCount ?? 0}</b></span>
                    <span>{t("mk.eligible")}: <b className="tabular">{preview?.eligible ?? c.audience?.eligibleCount ?? 0}</b></span>
                    <span className="text-os-faint">{t("mk.threshold", { n: d.threshold })}</span>
                  </div>
                  {preview && Object.keys(preview.reasons).length > 0 && (
                    <p className="text-xs text-os-muted">{t("mk.skippedBy")}: {Object.entries(preview.reasons).map(([k, v]) => `${t(`skip.${k}` as "skip.NO_OPT_IN")} ${v}`).join(" · ")}</p>
                  )}
                  <p className="text-[11px] text-os-faint">{c.requireOptIn ? t("mk.optInRequired") : t("mk.optInNotRequired")}</p>
                </>
              )}
              <p className="text-xs">
                {t("f.template")}: {c.template ? <span dir="ltr">{c.template.name} · {c.template.language}</span> : "—"}
                {c.template && <Badge tone={c.template.status === "APPROVED" ? "success" : "warning"}>{t(`tpl.${c.template.status}` as "tpl.APPROVED")}</Badge>}
              </p>
            </div>
          </SectionCard>
          <SectionCard title={t("mk.delivery")}>
            <div className="grid gap-3 p-4 text-sm">
              {total === 0 ? (
                <p className="text-xs text-os-muted">{t("mk.noSnapshot")}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {R_STATUSES.map((s) => (
                      <div key={s} className="rounded-lg border border-os-line p-2">
                        <p className="text-[11px] text-os-muted">{t(`rs.${s}` as "rs.SENT")}</p>
                        <p className="text-lg font-semibold tabular">{d.counts[s] ?? 0}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-os-muted">
                    {t("mk.rates", { delivered: pct(n("DELIVERED", "READ", "REPLIED"), sent), read: pct(n("READ", "REPLIED"), sent), replied: pct(n("REPLIED"), sent) })}
                  </p>
                  {Object.keys(d.skippedByReason).length > 0 && <p className="text-xs text-os-muted">{t("mk.skippedBy")}: {Object.entries(d.skippedByReason).map(([k, v]) => `${t.has(`skip.${k}`) ? t(`skip.${k}` as "skip.NO_OPT_IN") : k} ${v}`).join(" · ")}</p>}
                </>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {d.canReports && d.funnelFirst && (
        <SectionCard title={t("mk.attribution")}>
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("mk.model")}</th><th className="text-end">{t("mk.m.leads")}</th><th className="text-end">{t("mk.m.qualified")}</th><th className="text-end">{t("mk.m.opps")}</th><th className="text-end">{t("mk.m.won")}</th><th className="text-end">{t("mk.m.billed")}</th><th className="text-end">{t("mk.m.collected")}</th></tr></thead>
              <tbody>
                {([["first", d.funnelFirst], ["last", d.funnelLast]] as const).map(([k, f]) =>
                  f ? (
                    <tr key={k}>
                      <td>{t(`mk.model_${k}` as "mk.model_first")}</td>
                      <td className="text-end tabular">{f.leads}</td>
                      <td className="text-end tabular">{f.qualified}</td>
                      <td className="text-end tabular">{f.opportunities}</td>
                      <td className="text-end tabular">{f.won}</td>
                      <td className="whitespace-nowrap text-end tabular" dir="ltr">{formatMoney(f.billed, locale, c.currency)}</td>
                      <td className="whitespace-nowrap text-end tabular" dir="ltr">{formatMoney(f.collected, locale, c.currency)}</td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-os-faint">{t("mk.attributionNote")}</p>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={t("mk.spend")}
        action={
          d.canEdit && !["CANCELLED"].includes(c.status) ? (
            <ActionForm action={spendAction} args={[id]} trigger={`+ ${t("mk.a.spend")}`} triggerClass="os-btn-ghost text-xs" submitLabel={t("a.save")} note={t("mk.spendNote")}
              fields={[{ name: "date", label: t("f.date"), type: "date", required: true }, { name: "amount", label: t("f.amount"), type: "number", required: true }, { name: "note", label: t("f.note") }]} />
          ) : undefined
        }
      >
        <div className="grid gap-2 p-4 text-sm">
          <div className="flex flex-wrap gap-4">
            <span>{t("mk.spendManual")}: <b className="tabular" dir="ltr">{formatMoney(d.spend.manual, locale, c.currency)}</b></span>
            <span className="text-os-muted">{t("mk.spendSynced")}: {Number(d.spend.synced) > 0 ? <b dir="ltr">{formatMoney(d.spend.synced, locale, c.currency)}</b> : t("mk.noSync")}</span>
            {d.funnelFirst && d.funnelFirst.leads > 0 && Number(d.spend.manual) > 0 && <span>{t("mk.cpl")}: <b dir="ltr">{formatMoney((Number(d.spend.manual) / d.funnelFirst.leads).toFixed(2), locale, c.currency)}</b></span>}
          </div>
          {c.spend.length > 0 && (
            <ul className="grid gap-1 text-xs text-os-muted">
              {c.spend.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{fmtDate(s.date, locale)} · {t(`spend.${s.source}` as "spend.MANUAL")}{s.note ? ` · ${s.note}` : ""}</span>
                  <span className="tabular" dir="ltr">{formatMoney(s.amount.toFixed(2), locale, s.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {wa && d.recipients.length > 0 && (
        <SectionCard title={t("mk.recipients")}>
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("f.name")}</th><th>{t("f.phone")}</th><th>{t("logs.status")}</th><th className="hidden md:table-cell">{t("mk.lastUpdate")}</th></tr></thead>
              <tbody>
                {d.recipients.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs">{r.name ?? "—"}</td>
                    <td className="text-xs tabular" dir="ltr">•••{r.phone.slice(-4)}</td>
                    <td><Badge tone={recipientTone(r.status)}>{t(`rs.${r.status}` as "rs.SENT")}</Badge>{(r.skipReason || r.errorCode) && <span className="ms-1 text-[10px] text-os-faint" dir="ltr">{r.skipReason ?? r.errorCode}</span>}</td>
                    <td className="hidden text-xs md:table-cell">{(() => {
                      const at = r.repliedAt ?? r.readAt ?? r.deliveredAt ?? r.sentAt ?? r.failedAt;
                      return at ? fmtDateTime(at, locale) : "—";
                    })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > d.recipients.length && <p className="px-4 py-2 text-[11px] text-os-faint">{t("mk.firstN", { n: d.recipients.length, total })}</p>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
