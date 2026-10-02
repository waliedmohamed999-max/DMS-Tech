import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { isAppError } from "@/server/errors";
import { getRule } from "@/server/automation/engine";
import { dismissExecutionAction, enableRuleAction, retryExecutionAction, updateRuleAction } from "@/lib/os/system-actions";
import { builderProps, conditionSummary, execTone } from "@/lib/os/system-page";
import { Badge, fmtDateTime, PermissionDenied, SectionCard } from "@/components/os/ui";
import { ActionForm, RunButton } from "@/components/hr/Forms";
import { RuleBuilder } from "@/components/system/RuleBuilder";

export const metadata = { title: "Business rule" };

export default async function RulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await pageCtx();
  if (!can(ctx, "automation.view")) return <PermissionDenied permission="automation.view" />;
  const t = await getTranslations("os.system");
  const locale = await getLocale();
  let d;
  try {
    d = await getRule(ctx, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  const r = d.rule;
  const manage = can(ctx, "automation.manage");
  const retry = can(ctx, "automation.executions.retry");
  const trig = (e: string) => (t.has(`trigger.${e}`) ? t(`trigger.${e}` as "trigger.lead.created") : e);
  const props = manage && sp.edit === "1" ? await builderProps(ctx, locale, trig) : null;
  const actions = r.actions as Record<string, unknown>[];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/automation" className="os-btn-ghost size-8 px-0" aria-label="back">
          <span className="rtl:rotate-180">←</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-os-faint">v{r.version} · {t("f.priority")} {r.priority}{r.templateKey ? ` · ${t("fromTemplate")}` : ""}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {r.name}
            <Badge tone={r.enabled ? "success" : "neutral"} dot>{r.enabled ? t("enabled") : t("disabled")}</Badge>
          </h1>
          {r.description && <p className="mt-1 text-xs text-os-muted">{r.description}</p>}
          <p className="mt-1 text-xs text-os-muted">
            {t("runAs")}: {d.runAs ? (locale === "ar" && d.runAs.nameAr) || d.runAs.name : "—"}
            {d.runAs && d.runAs.status !== "ACTIVE" && <span className="text-danger"> ({t("inactive")})</span>}
          </p>
        </div>
        {manage && (
          <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
            {r.enabled ? (
              <RunButton action={enableRuleAction} args={[id, false]} label={t("disable")} className="os-btn-secondary" />
            ) : (
              <RunButton action={enableRuleAction} args={[id, true]} label={t("enable")} className="os-btn-primary" confirmText={t("enableConfirm")} />
            )}
            {sp.edit !== "1" && <Link href={`/app/automation/${id}?edit=1`} className="os-btn-ghost">{t("edit")}</Link>}
          </div>
        )}
      </div>

      {props ? (
        <>
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">{t("editNewVersion")}</p>
          <RuleBuilder action={updateRuleAction} args={[id]} initial={{ name: r.name, description: r.description, priority: r.priority, triggerEvent: r.triggerEvent, conditions: r.conditions, actions: r.actions }} {...props} redirect={`/app/automation/${id}`} submitLabel={t("saveVersion")} />
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t("definition")}>
            <dl className="grid gap-2 p-4 text-sm">
              <div><dt className="text-xs text-os-muted">{t("f.trigger")}</dt><dd>{trig(r.triggerEvent)} <span className="text-[11px] text-os-faint" dir="ltr">({r.triggerEvent})</span></dd></div>
              <div><dt className="text-xs text-os-muted">{t("conditions")}</dt><dd className="break-words text-xs" dir="ltr">{conditionSummary(r.conditions)}</dd></div>
              <div>
                <dt className="text-xs text-os-muted">{t("actions")}</dt>
                <dd>
                  <ul className="grid gap-1 text-xs">
                    {actions.map((a, i) => (
                      <li key={i}>
                        {t(`act.${String(a.type)}` as "act.notify")}
                        <span className="text-os-faint" dir="ltr"> {Object.entries(a).filter(([k]) => k !== "type").map(([k, v]) => `${k}=${String(v)}`).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title={t("versions")}>
            <ul className="grid gap-1 p-4 text-xs">
              {r.versions.map((v) => (
                <li key={v.id} className="flex justify-between gap-2">
                  <span>v{v.version}{v.version === r.version ? ` · ${t("current")}` : ""}</span>
                  <span className="text-os-faint">{fmtDateTime(v.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
            <p className="px-4 pb-3 text-[11px] text-os-faint">{t("versionsNote")}</p>
          </SectionCard>
        </div>
      )}

      {can(ctx, "automation.executions.view") && (
        <SectionCard title={t("tab.executions")}>
          {d.executions.length === 0 ? (
            <p className="p-4 text-xs text-os-muted">{t("noExecutionsText")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead><tr><th>{t("when")}</th><th>{t("f.status")}</th><th className="hidden md:table-cell">{t("detail")}</th><th /></tr></thead>
                <tbody>
                  {d.executions.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(x.createdAt, locale)}<span className="block text-[11px] text-os-faint">v{x.ruleVersion.version} · {t("attempts")} {x.attempts}{x.depth ? ` · ${t("depth")} ${x.depth}` : ""}</span></td>
                      <td><Badge tone={execTone(x.status)}>{t(`es.${x.status}` as "es.SUCCEEDED")}</Badge></td>
                      <td className="hidden max-w-[360px] break-words text-[11px] text-os-muted md:table-cell" dir="ltr">
                        {x.skipReason ?? x.error ?? (Array.isArray(x.actionResults) ? (x.actionResults as { type: string; status: string; ref?: string }[]).map((a) => `${a.type}:${a.status}${a.ref ? `(${a.ref})` : ""}`).join(" · ") : "—")}
                      </td>
                      <td className="whitespace-nowrap">
                        {retry && (x.status === "FAILED" || x.status === "DEAD_LETTER") && (
                          <span className="flex gap-1">
                            <RunButton action={retryExecutionAction} args={[x.id]} label={t("retry")} className="os-btn-ghost text-xs" />
                            <ActionForm action={dismissExecutionAction} args={[x.id]} trigger={t("dismiss")} triggerClass="os-btn-ghost text-xs" submitLabel={t("dismiss")} fields={[{ name: "reason", label: t("f.reason"), type: "textarea", required: true }]} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
