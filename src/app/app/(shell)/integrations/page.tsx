import Link from "next/link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can, canAny } from "@/server/context";
import { listConnections } from "@/server/integrations/registry";
import { configureConnectionAction, disableConnectionAction, testConnectionAction } from "@/lib/os/integrations-actions";
import { integrationTone } from "@/lib/os/integrations-page";
import { Badge, fmtDateTime, PageHeader, PermissionDenied } from "@/components/os/ui";
import { ActionForm, RunButton, type FieldSpec } from "@/components/hr/Forms";

export const metadata = { title: "Integrations" };


export default async function IntegrationsPage() {
  const { ctx } = await pageCtx();
  if (!canAny(ctx, "integrations.view", "integrations.manage")) return <PermissionDenied permission="integrations.view" />;
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  const { connections, secretStore } = await listConnections(ctx);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const manage = can(ctx, "integrations.manage");
  const test = can(ctx, "integrations.test");

  return (
    <div className="grid gap-5">
      <PageHeader
        icon="Plug"
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          can(ctx, "integrations.logs.view") ? (
            <Link href="/app/integrations/logs" className="os-btn-secondary">
              {t("logs.title")}
            </Link>
          ) : undefined
        }
      />
      {!secretStore && manage && <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">{t("secretStoreMissing")}</p>}
      <p className="text-xs text-os-muted">{t("honesty")}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((c) => {
          const configurable = manage && (c.def.adapter === "live" || c.def.adapter === "boundary" || c.def.adapter === "manual");
          const fields: FieldSpec[] = [
            ...(c.def.adapter === "live" || c.def.adapter === "boundary"
              ? [{ name: "environment", label: t("f.environment"), type: "select" as const, value: c.environment, required: true, options: ["PRODUCTION", "SANDBOX"].map((e) => ({ value: e, label: t(`env.${e}` as "env.PRODUCTION") })), hint: t("sandboxHint") }]
              : []),
            ...c.def.config.map((f) => ({ name: `cfg_${f.name}`, label: `${t.has(`cfg.${f.name}`) ? t(`cfg.${f.name}` as "cfg.endpoint") : f.name}`, value: c.config[f.name] ?? "", required: f.required, hint: f.hint, dir: "ltr" as const, span: true })),
            ...c.def.secrets.map((s) => ({ name: `sec_${s.name}`, label: `${t.has(`sec.${s.name}`) ? t(`sec.${s.name}` as "sec.accessToken") : s.name} · ${t(`secretState.${c.secrets[s.name]}` as "secretState.missing")}`, type: "password" as const, hint: t("secretHint"), span: true }))
          ];
          return (
            <section key={c.id} className="os-card grid content-start gap-3 p-4">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{t(`p.${c.provider}` as "p.WHATSAPP")}</h2>
                  <p className="text-[11px] text-os-faint">
                    {t(`kind.${c.def.kind}` as "kind.messaging")} · {t(`ad.${c.def.adapter}` as "ad.live")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={integrationTone(c.status)} dot>
                    {t(`st.${c.status}` as "st.NOT_CONFIGURED")}
                  </Badge>
                  {c.environment === "SANDBOX" && <Badge tone="warning">{t("env.SANDBOX")}</Badge>}
                </div>
              </header>
              <p className="text-xs text-os-muted">{c.provider === "WEBHOOK" ? t("adText.inbound") : t(`adText.${c.def.adapter}` as "adText.live")}</p>
              {c.provider === "NOVA" ? (
                <div className="grid gap-1 text-xs">
                  <span className="text-os-muted">{c.nova?.host ? <span dir="ltr">{c.nova.host}</span> : t("novaNoUrl")}</span>
                  <Link href="/app/nova" className="w-fit text-iris-light hover:underline">
                    {t("novaOpen")}
                  </Link>
                </div>
              ) : (
                <dl className="grid gap-1 text-xs">
                  {c.def.secrets.map((s) => (
                    <div key={s.name} className="flex justify-between gap-2">
                      <dt className="text-os-muted">{t.has(`sec.${s.name}`) ? t(`sec.${s.name}` as "sec.accessToken") : s.name}</dt>
                      <dd className={c.secrets[s.name] === "missing" || c.secrets[s.name] === "env_missing" ? "text-warning" : "text-os-text"}>{t(`secretState.${c.secrets[s.name]}` as "secretState.missing")}</dd>
                    </div>
                  ))}
                  {c.lastHealthCheckAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-os-muted">{t("lastCheck")}</dt>
                      <dd>{fmtDateTime(c.lastHealthCheckAt, locale)}</dd>
                    </div>
                  )}
                  {c.lastSuccessfulSyncAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-os-muted">{t("lastSuccess")}</dt>
                      <dd>{fmtDateTime(c.lastSuccessfulSyncAt, locale)}</dd>
                    </div>
                  )}
                  {c.lastErrorCode && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-os-muted">{t("lastError")}</dt>
                      <dd className="break-all text-danger" dir="ltr">
                        {c.lastErrorCode}
                      </dd>
                    </div>
                  )}
                  {c.def.inboundWebhook && (
                    <div className="grid gap-0.5">
                      <dt className="text-os-muted">{t("webhookUrl")}</dt>
                      <dd className="break-all rounded bg-os-raised px-2 py-1 font-mono text-[11px]" dir="ltr">
                        {origin}/api/integrations/webhooks/{c.id}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {configurable && c.status !== "DISABLED" && (
                  <ActionForm action={configureConnectionAction} args={[c.id]} trigger={t("a.configure")} triggerClass="os-btn-secondary" title={`${t("a.configure")} · ${t(`p.${c.provider}` as "p.WHATSAPP")}`} submitLabel={t("a.save")} note={t("configureNote")} fields={fields} />
                )}
                {test && c.status !== "DISABLED" && c.def.adapter !== "unsupported" && c.def.adapter !== "manual" && <RunButton action={testConnectionAction} args={[c.id]} label={t("a.test")} className="os-btn-ghost" />}
                {manage && c.provider !== "NOVA" && (c.status === "DISABLED" ? <RunButton action={disableConnectionAction} args={[c.id, false]} label={t("a.enable")} className="os-btn-ghost" /> : c.status !== "NOT_CONFIGURED" && <RunButton action={disableConnectionAction} args={[c.id, true]} label={t("a.disable")} className="os-btn-ghost text-danger" confirmText={t("disableConfirm")} />)}
                {c.def.docsUrl && (
                  <a href={c.def.docsUrl} target="_blank" rel="noreferrer" className="os-btn-ghost text-xs">
                    {t("docs")} ↗
                  </a>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
