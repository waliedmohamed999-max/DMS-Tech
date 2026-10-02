import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listIntegrationLogs } from "@/server/integrations/outbox";
import { dismissOutboxAction, retryOutboxAction } from "@/lib/os/integrations-actions";
import { outboxTone } from "@/lib/os/integrations-page";
import { Badge, EmptyState, flatParams, fmtDateTime, PageHeader, PermissionDenied } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";

export const metadata = { title: "Integration logs" };
const VIEWS = ["failed", "retrying", "dead", "webhooks", "succeeded"] as const;
const PROVIDERS = ["WHATSAPP", "WEBHOOK", "CUSTOM", "GOOGLE", "GMAIL", "S3"];

export default async function IntegrationLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "integrations.logs.view")) return <PermissionDenied permission="integrations.logs.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os.integrations");
  const locale = await getLocale();
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as (typeof VIEWS)[number]) : "failed";
  const d = await listIntegrationLogs(ctx, { view, provider: PROVIDERS.includes(sp.provider ?? "") ? sp.provider : undefined });
  const q = (v: string, p?: string) => `?view=${v}${p ? `&provider=${p}` : ""}`;
  const executions = view === "failed" ? d.failed : view === "succeeded" ? d.succeeded : null;
  const outbox = view === "retrying" ? d.retrying : view === "dead" ? d.dead : null;

  return (
    <div className="grid gap-5">
      <PageHeader icon="Server" title={t("logs.title")} subtitle={t("logs.subtitle")} actions={<Link href="/app/integrations" className="os-btn-ghost">{t("title")}</Link>} />
      <nav className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link key={v} href={q(v, sp.provider)} className={`rounded-full border px-3 py-1 text-xs ${view === v ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t(`logs.v.${v}` as "logs.v.failed")} <span className="tabular text-os-faint">{d.counts[v]}</span>
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-1 text-xs">
        <Link href={q(view)} className={!sp.provider ? "text-iris-light" : "text-os-muted"}>{t("all")}</Link>
        {PROVIDERS.map((p) => (
          <Link key={p} href={q(view, p)} className={sp.provider === p ? "text-iris-light" : "text-os-muted hover:text-os-text"}>
            · {t(`p.${p}` as "p.WHATSAPP")}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-os-faint">{t("logs.sanitized")}</p>
      <div className="os-card overflow-hidden">
        {executions && (executions.length === 0 ? <EmptyState icon="Server" title={t("logs.empty")} text={t("logs.emptyText")} /> : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("logs.when")}</th><th>{t("logs.provider")}</th><th>{t("logs.action")}</th><th>{t("logs.result")}</th><th className="hidden md:table-cell">{t("logs.detail")}</th></tr></thead>
              <tbody>
                {executions.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(x.startedAt, locale)}</td>
                    <td className="text-xs">{t(`p.${x.provider}` as "p.WHATSAPP")} · {t(`dir.${x.direction}` as "dir.OUTBOUND")}</td>
                    <td className="text-xs" dir="ltr">{x.action}{x.attempts > 1 ? ` #${x.attempts}` : ""}</td>
                    <td><Badge tone={outboxTone(x.status)}>{t(`ex.${x.status}` as "ex.FAILED")}</Badge> {x.errorCode && <span className="text-[11px] text-danger" dir="ltr">{x.errorCode}</span>}</td>
                    <td className="hidden max-w-[360px] break-all text-[11px] text-os-muted md:table-cell" dir="ltr">{x.sanitizedError ?? x.externalReference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {outbox && (outbox.length === 0 ? <EmptyState icon="Server" title={t("logs.empty")} text={t("logs.emptyText")} /> : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("logs.event")}</th><th>{t("logs.status")}</th><th className="hidden md:table-cell">{t("logs.attempts")}</th><th className="hidden lg:table-cell">{t("logs.detail")}</th><th /></tr></thead>
              <tbody>
                {outbox.map((x) => (
                  <tr key={x.id}>
                    <td className="text-xs">
                      <span dir="ltr">{x.eventType}</span>
                      <span className="block text-[11px] text-os-faint">{t(`p.${x.provider}` as "p.WHATSAPP")} · {fmtDateTime(x.createdAt, locale)} · {t("logs.payloadKeys")}: <span dir="ltr">{x.payloadKeys.join(", ")}</span></span>
                    </td>
                    <td><Badge tone={outboxTone(x.status)}>{t(`ob.${x.status}` as "ob.PENDING")}</Badge>{x.status === "FAILED" && <span className="block text-[11px] text-os-faint">{t("logs.next")} {fmtDateTime(x.nextAttemptAt, locale)}</span>}</td>
                    <td className="hidden tabular md:table-cell">{x.attempts}/{x.maxAttempts}</td>
                    <td className="hidden max-w-[320px] break-all text-[11px] text-os-muted lg:table-cell" dir="ltr">{x.lastErrorCode ? `${x.lastErrorCode}: ${x.lastError ?? ""}` : "—"}</td>
                    <td className="whitespace-nowrap">
                      {d.canManage && (x.status === "DEAD_LETTER" || x.status === "FAILED") && (
                        <span className="flex gap-1">
                          <RunButton action={retryOutboxAction} args={[x.id]} label={t("a.retry")} className="os-btn-ghost text-xs" />
                          <ActionForm action={dismissOutboxAction} args={[x.id]} trigger={t("a.dismiss")} triggerClass="os-btn-ghost text-xs" submitLabel={t("a.dismiss")} fields={[{ name: "reason", label: t("f.reason"), type: "textarea" }]} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {view === "webhooks" && d.webhooks && (d.webhooks.length === 0 ? <EmptyState icon="Server" title={t("logs.empty")} text={t("logs.emptyText")} /> : (
          <div className="overflow-x-auto">
            <table className="os-table">
              <thead><tr><th>{t("logs.when")}</th><th>{t("logs.event")}</th><th>{t("logs.status")}</th><th className="hidden md:table-cell">{t("logs.signature")}</th><th className="hidden lg:table-cell">{t("logs.detail")}</th></tr></thead>
              <tbody>
                {d.webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(w.receivedAt, locale)}</td>
                    <td className="text-xs">{t(`p.${w.provider}` as "p.WHATSAPP")} · <span dir="ltr">{w.eventType}</span>{w.duplicateCount > 0 && <span className="block text-[11px] text-os-faint">{t("logs.duplicates", { n: w.duplicateCount })}</span>}</td>
                    <td><Badge tone={outboxTone(w.status)}>{t(`wh.${w.status}` as "wh.PROCESSED")}</Badge></td>
                    <td className="hidden text-xs md:table-cell">{w.signatureValid ? t("logs.sigOk") : <span className="text-danger">{t("logs.sigBad")}</span>}</td>
                    <td className="hidden max-w-[320px] break-all text-[11px] text-os-muted lg:table-cell" dir="ltr">{w.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
