import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { pageCtx } from "@/lib/os/dal";
import { can } from "@/server/context";
import { listExecutions, listRules, TEMPLATES } from "@/server/automation/engine";
import { templateRuleAction } from "@/lib/os/system-actions";
import { conditionSummary, execTone } from "@/lib/os/system-page";
import { Badge, EmptyState, flatParams, fmtDateTime, PageHeader, PermissionDenied } from "@/components/os/ui";
import { RunButton } from "@/components/hr/Forms";

export const metadata = { title: "Business rules" };
const TABS = ["rules", "executions", "failed", "disabled"] as const;

export default async function AutomationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await pageCtx();
  if (!can(ctx, "automation.view")) return <PermissionDenied permission="automation.view" />;
  const sp = flatParams(await searchParams);
  const t = await getTranslations("os.system");
  const locale = await getLocale();
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "rules";
  const manage = can(ctx, "automation.manage");
  const showExec = can(ctx, "automation.executions.view");
  const rules = tab === "rules" || tab === "disabled" ? await listRules(ctx, { view: tab === "disabled" ? "disabled" : "all" }) : [];
  const execs = (tab === "executions" || tab === "failed") && showExec ? await listExecutions(ctx, { view: tab === "failed" ? "failed" : "all" }) : [];
  const trig = (e: string) => (t.has(`trigger.${e}`) ? t(`trigger.${e}` as "trigger.lead.created") : e);

  return (
    <div className="grid gap-5">
      <PageHeader icon="Workflow" title={t("rules")} subtitle={t("rulesSubtitle")} actions={manage ? <Link href="/app/automation/new" className="os-btn-primary">+ {t("newRule")}</Link> : undefined} />
      <p className="rounded-lg border border-os-line px-4 py-3 text-xs text-os-muted">{t("deterministicNote")}</p>
      <nav className="flex flex-wrap gap-1">
        {TABS.filter((x) => showExec || (x !== "executions" && x !== "failed")).map((x) => (
          <Link key={x} href={`?tab=${x}`} className={`rounded-full border px-3 py-1 text-xs ${tab === x ? "border-iris bg-iris/10 text-os-text" : "border-os-line text-os-muted hover:text-os-text"}`}>
            {t(`tab.${x}` as "tab.rules")}
          </Link>
        ))}
      </nav>

      {(tab === "rules" || tab === "disabled") && (
        <div className="os-card overflow-hidden">
          {rules.length === 0 ? (
            <EmptyState icon="Workflow" title={t("noRules")} text={t("noRulesText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("f.name")}</th>
                    <th className="hidden md:table-cell">{t("f.trigger")}</th>
                    <th className="hidden lg:table-cell">{t("conditions")}</th>
                    <th>{t("f.status")}</th>
                    <th className="hidden text-end md:table-cell">{t("runs")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className="min-w-[200px]">
                        <Link href={`/app/automation/${r.id}`} className="font-medium hover:text-iris-light">{r.name}</Link>
                        <span className="block text-[11px] text-os-faint">
                          v{r.version} · {t("f.priority")} {r.priority} · {(r.actions as { type: string }[]).map((a) => t(`act.${a.type}` as "act.notify")).join(", ")}
                        </span>
                      </td>
                      <td className="hidden text-xs md:table-cell">{trig(r.triggerEvent)}</td>
                      <td className="hidden max-w-[280px] truncate text-[11px] text-os-muted lg:table-cell" dir="ltr">{conditionSummary(r.conditions)}</td>
                      <td>
                        <Badge tone={r.enabled ? "success" : "neutral"} dot>{r.enabled ? t("enabled") : t("disabled")}</Badge>
                      </td>
                      <td className="hidden text-end text-xs tabular md:table-cell" dir="ltr">
                        {r.stats.SUCCEEDED ?? 0} ✓ · {(r.stats.FAILED ?? 0) + (r.stats.DEAD_LETTER ?? 0)} ✖ · {r.stats.SKIPPED ?? 0} ↷
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "rules" && manage && (
        <section className="os-card p-4">
          <h2 className="font-semibold">{t("templates")}</h2>
          <p className="mb-3 text-xs text-os-muted">{t("templatesNote")}</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {TEMPLATES.map((x) => (
              <li key={x.key} className="flex items-start justify-between gap-3 rounded-lg border border-os-line p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{x.name[locale === "ar" ? "ar" : "en"]}</p>
                  <p className="text-xs text-os-muted">{x.description[locale === "ar" ? "ar" : "en"]}</p>
                </div>
                <RunButton action={templateRuleAction} args={[x.key, locale === "ar" ? "ar" : "en"]} label={t("useTemplate")} className="os-btn-ghost text-xs" redirect="/app/automation/:id" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(tab === "executions" || tab === "failed") && (
        <div className="os-card overflow-hidden">
          {execs.length === 0 ? (
            <EmptyState icon="Workflow" title={t("noExecutions")} text={t("noExecutionsText")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t("rule")}</th>
                    <th className="hidden md:table-cell">{t("event")}</th>
                    <th>{t("f.status")}</th>
                    <th className="hidden lg:table-cell">{t("detail")}</th>
                    <th className="hidden md:table-cell">{t("when")}</th>
                  </tr>
                </thead>
                <tbody>
                  {execs.map((x) => (
                    <tr key={x.id}>
                      <td className="min-w-[180px]">
                        <Link href={`/app/automation/${x.ruleId}`} className="hover:text-iris-light">{x.rule.name}</Link>
                        <span className="block text-[11px] text-os-faint">
                          v{x.ruleVersion.version} · {t("attempts")} {x.attempts}
                          {x.depth ? ` · ${t("depth")} ${x.depth}` : ""}
                        </span>
                      </td>
                      <td className="hidden text-xs md:table-cell" dir="ltr">{x.eventType}</td>
                      <td>
                        <Badge tone={execTone(x.status)}>{t(`es.${x.status}` as "es.SUCCEEDED")}</Badge>
                      </td>
                      <td className="hidden max-w-[300px] break-words text-[11px] text-os-muted lg:table-cell" dir="ltr">{x.skipReason ?? x.error ?? "—"}</td>
                      <td className="hidden whitespace-nowrap text-xs md:table-cell">{fmtDateTime(x.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
